import { NextResponse } from 'next/server';
import type { NPCId } from '@/data/npcs';
import { NPC_BY_ID } from '@/data/npcs';
import { CLUES } from '@/data/mystery';
import {
  ensureBackstorySeeded,
  getInvestigationState,
  getPlayerConversationHistory,
  ingestHiveEvent,
  recallHive,
  recallNpcMemory,
  savePlayerConversation,
  setInvestigationState,
  type InvestigationState,
  type PersistedChatMessage
} from '@/lib/hydradb';
import { behaviorInstruction } from '@/lib/npcBrain';
import { callLLM, type Message as LLMMessage } from '@/lib/userServices';

type ClientMessage = { role: 'npc' | 'player'; text: string };

type RequestBody = {
  npcId: NPCId;
  playerMessage: string;
  conversationHistory?: ClientMessage[];
  gameTime?: string;
  investigationState?: number;
  cluesFound?: string[];
  playerLocation?: string;
};

type KnowledgeLink = {
  from: string;
  to: string;
  label: string;
};

type Emotion = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'disgusted';

const EMOTION_KEYWORDS: Array<{ emotion: Emotion; words: string[] }> = [
  { emotion: 'angry', words: ['furious', 'hate', 'angry', 'how dare', 'outrage', 'livid'] },
  { emotion: 'happy', words: ['wonderful', 'love', 'great', 'happy', 'delighted', 'fantastic'] },
  { emotion: 'sad', words: ['worried', 'scared', 'nervous', 'oh no', 'afraid', 'anxious'] },
  { emotion: 'surprised', words: ['what', 'impossible', 'really', 'no way', 'seriously'] },
  { emotion: 'disgusted', words: ['gross', 'disgusting', 'ugh', 'revolting', 'sickening'] }
];

function detectEmotion(text: string): Emotion {
  const lowered = text.toLowerCase();
  for (const { emotion, words } of EMOTION_KEYWORDS) {
    if (words.some((word) => lowered.includes(word))) return emotion;
  }
  return 'neutral';
}

function detectClueInReply(params: {
  npcId: NPCId;
  replyText: string;
  alreadyFound: string[];
}): string | null {
  const lowered = params.replyText.toLowerCase();
  for (const clue of CLUES) {
    if (clue.revealedBy !== params.npcId) continue;
    if (params.alreadyFound.includes(clue.id)) continue;
    if (clue.triggerKeywords.some((keyword) => lowered.includes(keyword.toLowerCase()))) {
      return clue.id;
    }
  }
  return null;
}

function buildBehaviorAddendum(
  npcId: NPCId,
  investigationCount: number,
  cluesFound: string[]
): string {
  const synthetic: InvestigationState = {
    npcIdsTalkedTo: Array.from({ length: Math.max(0, investigationCount) }).map(
      (_, index) => `__talked_${index}__` as NPCId
    ),
    cluesFound
  };
  return behaviorInstruction(npcId, synthetic);
}

function buildSystemPrompt(params: {
  npcId: NPCId;
  npcMemory: string;
  worldContext: string;
  priorConversation: string;
  specificConversationContext: string;
  behaviorAddendum: string;
}) {
  const npc = NPC_BY_ID[params.npcId];
  return [
    `You are ${npc.name}, ${npc.role} at Momentum Corp.`,
    `Personality: ${npc.personality}`,
    `What you personally remember: ${params.npcMemory || '(nothing specific surfaces right now)'}`,
    `What you're aware of happening in the office: ${params.worldContext || '(the usual office chatter)'}`,
    `What you already said to this player before: ${params.priorConversation || '(no prior direct conversation is available)'}`,
    `Exact recalled conversation with named coworkers: ${params.specificConversationContext || '(no exact named-coworker conversation surfaced)'}`,
    `Your secret - never state this directly, only hint if player asks exactly the right thing: ${npc.secret}`,
    params.behaviorAddendum,
    '',
    'A golden USB drive was stolen from the CEO\'s office this morning.',
    'You have your own theory, colored by your personality and what you know.',
    '',
    'Rules:',
    '- Stay in character. Be dramatic, unhinged, funny. This is a soap opera.',
    '- Max 2-3 sentences per response.',
    '- If asked about your secret area, get nervous or deflect - never state it outright.',
    '- If asked what you discussed with a named coworker, use the exact recalled conversation if one is provided.',
    '- If no exact recalled conversation is provided for that named coworker, admit you do not remember clearly instead of inventing details.',
    '- End with either a question back OR a nervous gesture in [square brackets].'
  ]
    .filter(Boolean)
    .join('\n');
}

function toLLMHistory(history: ClientMessage[] | undefined): LLMMessage[] {
  if (!history) return [];
  return history.map((message) => ({
    role: message.role === 'player' ? 'user' : 'assistant',
    content: message.text
  }));
}

function formatPriorConversation(messages: PersistedChatMessage[]) {
  return messages
    .slice(-6)
    .map((message) => `${message.role === 'player' ? 'Player' : 'You'}: ${message.text}`)
    .join(' | ');
}

function uniqueLines(lines: string[]) {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

function extractMentionedNpcIds(text: string, currentNpcId: NPCId) {
  const lowered = text.toLowerCase();
  return (Object.entries(NPC_BY_ID) as [NPCId, (typeof NPC_BY_ID)[NPCId]][])
    .filter(([candidateId, candidate]) => {
      if (candidateId === currentNpcId) return false;
      const fullName = candidate.name.toLowerCase();
      const firstName = candidate.name.split(' ')[0].toLowerCase();
      return lowered.includes(fullName) || lowered.includes(firstName);
    })
    .map(([candidateId]) => candidateId);
}

function extractKnowledgeLinks(npcId: NPCId, worldContextLines: string[]): KnowledgeLink[] {
  const loweredLines = worldContextLines.map((line) => line.trim()).filter(Boolean);
  const links: KnowledgeLink[] = [];

  for (const line of loweredLines) {
    for (const [candidateId, candidate] of Object.entries(NPC_BY_ID) as [
      NPCId,
      (typeof NPC_BY_ID)[NPCId]
    ][]) {
      if (candidateId === npcId) continue;
      const name = candidate.name.toLowerCase();
      const firstName = candidate.name.split(' ')[0].toLowerCase();
      const lowered = line.toLowerCase();
      if (!lowered.includes(name) && !lowered.includes(firstName)) continue;

      links.push({
        from: candidateId,
        to: npcId,
        label: line.split(/\s+/).slice(0, 4).join(' ')
      });
      break;
    }
  }

  return links.slice(0, 3);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!body?.npcId || !NPC_BY_ID[body.npcId]) {
      return NextResponse.json({ error: 'Invalid npcId' }, { status: 400 });
    }
    if (!body.playerMessage?.trim()) {
      return NextResponse.json({ error: 'playerMessage is required' }, { status: 400 });
    }

    const npc = NPC_BY_ID[body.npcId];
    const gameTime = body.gameTime ?? '09:00';
    const playerLocation = body.playerLocation ?? 'office';

    let npcMemoryLines: string[] = [];
    let worldContextLines: string[] = [];
    let priorConversationHistory: PersistedChatMessage[] = [];
    let specificConversationLines: string[] = [];
    let investigationFromHive: InvestigationState = { npcIdsTalkedTo: [], cluesFound: [] };

    try {
      await ensureBackstorySeeded();
      npcMemoryLines = await recallNpcMemory(body.npcId, body.playerMessage);
      worldContextLines = await recallHive(body.playerMessage);
      priorConversationHistory = await getPlayerConversationHistory(body.npcId);
      investigationFromHive = await getInvestigationState();

      const mentionedNpcIds = extractMentionedNpcIds(body.playerMessage, body.npcId);
      if (mentionedNpcIds.length > 0) {
        const targetedRecallResults = await Promise.all(
          mentionedNpcIds.flatMap((mentionedNpcId) => {
            const currentNpcName = NPC_BY_ID[body.npcId].name;
            const mentionedNpcName = NPC_BY_ID[mentionedNpcId].name;
            const exactQuery = `${currentNpcName} conversation with ${mentionedNpcName}`;

            return [
              recallNpcMemory(body.npcId, exactQuery).catch(() => []),
              recallHive(exactQuery).catch(() => [])
            ];
          })
        );

        specificConversationLines = uniqueLines(targetedRecallResults.flat());
        npcMemoryLines = uniqueLines([...specificConversationLines, ...npcMemoryLines]);
        worldContextLines = uniqueLines([...specificConversationLines, ...worldContextLines]);
      }
    } catch {
      // HydraDB may not be configured in dev - degrade gracefully.
    }

    const cluesFound = Array.from(
      new Set([...(body.cluesFound ?? []), ...investigationFromHive.cluesFound])
    );
    const investigationCount =
      body.investigationState ?? investigationFromHive.npcIdsTalkedTo.length ?? 0;

    const behaviorAddendum = buildBehaviorAddendum(body.npcId, investigationCount, cluesFound);
    const knowledgeLinks = extractKnowledgeLinks(body.npcId, worldContextLines);
    const systemPrompt = buildSystemPrompt({
      npcId: body.npcId,
      npcMemory: npcMemoryLines.slice(0, 4).join(' | '),
      worldContext: worldContextLines.slice(0, 4).join(' | '),
      priorConversation: formatPriorConversation(priorConversationHistory),
      specificConversationContext: specificConversationLines.slice(0, 4).join(' | '),
      behaviorAddendum
    });

    let npcText = '';
    try {
      const history = toLLMHistory(body.conversationHistory);
      const historyForLLM: LLMMessage[] =
        history.length > 0 && history[history.length - 1]?.content === body.playerMessage
          ? history
          : [...history, { role: 'user', content: body.playerMessage }];

      npcText = await callLLM(systemPrompt, historyForLLM);
    } catch {
      return NextResponse.json({
        npcText: '[CONNECTION ERROR]',
        emotion: 'neutral' as Emotion,
        clueFound: null
      });
    }

    const emotion = detectEmotion(npcText);
    const clueFound = detectClueInReply({
      npcId: body.npcId,
      replyText: npcText,
      alreadyFound: cluesFound
    });

    try {
      const persistedConversation: PersistedChatMessage[] = [
        ...(body.conversationHistory ?? []).map((message) => ({
          role: message.role,
          text: message.text
        })),
        { role: 'npc', text: npcText }
      ];

      await savePlayerConversation({
        npcId: body.npcId,
        messages: persistedConversation,
        gameTime,
        location: playerLocation
      });

      await ingestHiveEvent(
        {
          description: `Player spoke with ${npc.name} at ${playerLocation}. Player said: "${body.playerMessage}". ${npc.name} replied: "${npcText}"`,
          entities: ['player', body.npcId],
          gameTime,
          location: playerLocation,
          isClue: !!clueFound,
          clueId: clueFound ?? undefined
        },
        true
      );

      if (clueFound && !cluesFound.includes(clueFound)) {
        await setInvestigationState({
          npcIdsTalkedTo: investigationFromHive.npcIdsTalkedTo.includes(body.npcId)
            ? investigationFromHive.npcIdsTalkedTo
            : [...investigationFromHive.npcIdsTalkedTo, body.npcId],
          cluesFound: [...cluesFound, clueFound]
        });
      }
    } catch {
      // ignore ingest failures
    }

    return NextResponse.json({
      npcText,
      emotion,
      clueFound,
      knowledgeLinks
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
