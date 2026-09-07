import { NextResponse } from 'next/server';
import type { NPCId } from '@/data/npcs';
import { NPC_BY_ID } from '@/data/npcs';
import { CLUES, CLUE_BY_ID, CULPRIT } from '@/data/mystery';
import {
  ensureBackstorySeeded,
  getInvestigationState,
  getPlayerConversationHistory,
  ingestHiveEvent,
  recallHive,
  recallHiveLexical,
  recallNpcMemory,
  savePlayerConversation,
  setInvestigationState,
  withTimeout,
  type InvestigationState,
  type PersistedChatMessage
} from '@/lib/hydradb';
import { behaviorInstruction } from '@/lib/npcBrain';
import { callLLM, streamLLM, type Message as LLMMessage } from '@/lib/userServices';

// Server-sent events separate frames with a blank line.
const SSE_FRAME_END = String.fromCharCode(10, 10);

type ClientMessage = { role: 'npc' | 'player'; text: string };

type RequestBody = {
  npcId: NPCId;
  playerMessage: string;
  conversationHistory?: ClientMessage[];
  gameTime?: string;
  investigationState?: number;
  cluesFound?: string[];
  playerLocation?: string;
  stream?: boolean;
  /** Id of a clue the player is putting to this character directly. */
  presentedClue?: string;
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

/**
 * A clue counts as revealed only when the right character actually says the
 * substance of it. Keyword matching alone was far too loose - words like
 * "office" or "morning" appear in almost any reply, so clues unlocked
 * themselves without the character ever giving anything away.
 */
function detectClueInReply(params: {
  npcId: NPCId;
  replyText: string;
  alreadyFound: string[];
}): string | null {
  const lowered = params.replyText.toLowerCase();
  for (const clue of CLUES) {
    if (clue.revealedBy !== params.npcId) continue;
    if (params.alreadyFound.includes(clue.id)) continue;

    const mentionsTopic = clue.triggerKeywords.some((keyword) => lowered.includes(keyword.toLowerCase()));
    if (!mentionsTopic) continue;
    if (!clue.confirm.test(params.replyText)) continue;

    return clue.id;
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

/**
 * Instruction injected when the player puts a specific piece of evidence to a
 * character. This is the detective verb the game was missing: the same question
 * lands very differently once you can point at something.
 */
function confrontationInstruction(npcId: NPCId, clueId: string): string {
  const clue = CLUE_BY_ID[clueId];
  if (!clue) return '';

  const ownsIt = clue.revealedBy === npcId;
  const isCulprit = npcId === CULPRIT;
  const aboutThem = clue.text.toLowerCase().includes(NPC_BY_ID[npcId].name.split(' ')[0].toLowerCase());

  const lines = [
    '',
    `THE INVESTIGATOR HAS JUST PUT THIS TO YOU DIRECTLY: "${clue.text}"`,
    'React to this specific fact. Do not ignore it and do not change the subject cleanly.'
  ];

  if (isCulprit && aboutThem) {
    lines.push(
      'This is about you and it is true. Stay charming but let one crack show - a pause, an over-explanation, a detail nobody asked for. Do not confess.'
    );
  } else if (isCulprit) {
    lines.push(
      'Redirect this somewhere useful to you. Be helpful and specific about someone else, without ever sounding accusatory.'
    );
  } else if (aboutThem) {
    lines.push('This makes you look bad and you know it. Get defensive, explain too much, and be visibly rattled.');
  } else if (ownsIt) {
    lines.push('You are the one who knows about this. Confirm it and add one detail you have not mentioned before.');
  } else {
    lines.push(
      'This is news to you. React honestly, then connect it to something you personally saw or heard today.'
    );
  }

  return lines.join('\n');
}

function buildSystemPrompt(params: {
  npcId: NPCId;
  npcMemory: string;
  worldContext: string;
  priorConversation: string;
  specificConversationContext: string;
  behaviorAddendum: string;
  confrontation?: string;
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
    params.confrontation,
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

// Keywords that map directly onto clue trigger words — if the player's message
// contains any of these, run a lexical recall alongside the semantic one so
// we never miss a clue mention due to embedding-space drift.
const CLUE_TRIGGER_WORDS = [
  'cctv', 'camera', 'security', 'footage', 'recording',
  'server', 'logs', 'access', 'remote', 'network', 'computer',
  'sanjana', 'phone', 'call', 'morning', 'early', 'heard',
  'kabir', 'office', 'silver', 'usb', 'carrying', 'saw',
  'whistleblower', 'hr', 'protection', 'legal', 'rights', 'policy'
];

function extractClueKeywords(text: string): string[] {
  const lowered = text.toLowerCase();
  return CLUE_TRIGGER_WORDS.filter((kw) => lowered.includes(kw));
}

// Inject live game state into every recall so HydraDB biases results toward
// what is relevant right now — time, place, how far the investigation has gone.
function buildAdditionalContext(
  gameTime: string,
  playerLocation: string,
  cluesFound: string[],
  investigationCount: number
): string {
  const parts = [`Game time: ${gameTime}.`, `Player is in: ${playerLocation}.`];
  if (cluesFound.length > 0) {
    parts.push(`Investigator has found ${cluesFound.length} clue(s): ${cluesFound.join(', ')}.`);
  }
  if (investigationCount > 0) {
    parts.push(`Investigator has spoken to ${investigationCount} NPC(s) so far.`);
  }
  return parts.join(' ');
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

    // Seeding is deduped process-wide, so this is a no-op after the first request.
    // It is not awaited - the first player message should not wait on eight ingests.
    void ensureBackstorySeeded().catch(() => {});

    // Build context before HydraDB calls — client already sends cluesFound and
    // investigationState so we don't need to wait for the hive fetch.
    const additionalContext = buildAdditionalContext(
      gameTime,
      playerLocation,
      body.cluesFound ?? [],
      body.investigationState ?? 0
    );
    const clueKeywords = extractClueKeywords(body.playerMessage);

    let npcMemoryLines: string[] = [];
    let worldContextLines: string[] = [];
    let priorConversationHistory: PersistedChatMessage[] = [];
    let specificConversationLines: string[] = [];
    let investigationFromHive: InvestigationState = { npcIdsTalkedTo: [], cluesFound: [] };

    try {
      // Everything below reads from HydraDB and nothing depends on anything else,
      // so it all goes out at once. This used to be five-plus sequential awaits,
      // which meant the player waited for every round trip end to end before the
      // LLM was even called. Each read is individually timed out and defaulted so
      // one slow lookup degrades the context instead of stalling the reply.
      const mentionedNpcIds = extractMentionedNpcIds(body.playerMessage, body.npcId);
      const currentNpcName = NPC_BY_ID[body.npcId].name;

      const [
        npcMemoryResult,
        hiveResult,
        lexicalResult,
        historyResult,
        investigationResult,
        ...targetedResults
      ] = await Promise.all([
        withTimeout(recallNpcMemory(body.npcId, body.playerMessage, additionalContext), [] as string[]),
        withTimeout(recallHive(body.playerMessage, additionalContext), [] as string[]),
        clueKeywords.length > 0
          ? withTimeout(recallHiveLexical(clueKeywords), [] as string[])
          : Promise.resolve([] as string[]),
        withTimeout(getPlayerConversationHistory(body.npcId), [] as PersistedChatMessage[]),
        withTimeout(getInvestigationState(), { npcIdsTalkedTo: [], cluesFound: [] } as InvestigationState),
        ...mentionedNpcIds.flatMap((mentionedNpcId) => {
          const exactQuery = `${currentNpcName} conversation with ${NPC_BY_ID[mentionedNpcId].name}`;
          return [
            withTimeout(recallNpcMemory(body.npcId, exactQuery), [] as string[]),
            withTimeout(recallHive(exactQuery), [] as string[])
          ];
        })
      ]);

      npcMemoryLines = npcMemoryResult;
      // Lexical hits are prepended so exact keyword matches outrank semantic ones.
      worldContextLines = uniqueLines([...lexicalResult, ...hiveResult]);
      priorConversationHistory = historyResult;
      investigationFromHive = investigationResult;

      if (targetedResults.length > 0) {
        specificConversationLines = uniqueLines(targetedResults.flat());
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
      behaviorAddendum,
      confrontation: body.presentedClue ? confrontationInstruction(body.npcId, body.presentedClue) : undefined
    });

    const history = toLLMHistory(body.conversationHistory);
    const historyForLLM: LLMMessage[] =
      history.length > 0 && history[history.length - 1]?.content === body.playerMessage
        ? history
        : [...history, { role: 'user', content: body.playerMessage }];

    // Everything that has to happen once the full reply text exists, shared by
    // the streaming and non-streaming paths.
    const finalize = (npcText: string) => {
      const emotion = detectEmotion(npcText);
      const clueFound = detectClueInReply({
        npcId: body.npcId,
        replyText: npcText,
        alreadyFound: cluesFound
      });

      const persistedConversation: PersistedChatMessage[] = [
        ...(body.conversationHistory ?? []).map((message) => ({
          role: message.role,
          text: message.text
        })),
        { role: 'npc', text: npcText }
      ];

      // Persist in the background. The player already has their reply; waiting for
      // three more HydraDB writes before returning only made the UI feel slower.
      void Promise.allSettled([
        savePlayerConversation({
          npcId: body.npcId,
          messages: persistedConversation,
          gameTime,
          location: playerLocation
        }),
        ingestHiveEvent(
          {
            description: `Player spoke with ${npc.name} at ${playerLocation}. Player said: "${body.playerMessage}". ${npc.name} replied: "${npcText}"`,
            entities: ['player', body.npcId],
            gameTime,
            location: playerLocation,
            isClue: !!clueFound,
            clueId: clueFound ?? undefined
          },
          true
        ),
        clueFound && !cluesFound.includes(clueFound)
          ? setInvestigationState({
              npcIdsTalkedTo: investigationFromHive.npcIdsTalkedTo.includes(body.npcId)
                ? investigationFromHive.npcIdsTalkedTo
                : [...investigationFromHive.npcIdsTalkedTo, body.npcId],
              cluesFound: [...cluesFound, clueFound]
            })
          : Promise.resolve()
      ]).catch(() => {});

      return { emotion, clueFound };
    };

    // ── Streaming path ───────────────────────────────────────────────────────
    // Sends each fragment as it arrives so the first words land on screen in a
    // few hundred milliseconds instead of after the whole reply is generated.
    if (body.stream) {
      const encoder = new TextEncoder();
      const sse = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: unknown) => {
            controller.enqueue(encoder.encode('data: ' + JSON.stringify(payload) + SSE_FRAME_END));
          };

          let npcText = '';
          try {
            for await (const piece of streamLLM(systemPrompt, historyForLLM)) {
              npcText += piece;
              send({ type: 'delta', text: piece });
            }
          } catch {
            // Fall through with whatever arrived before the failure.
          }

          if (!npcText.trim()) {
            send({ type: 'done', npcText: '[CONNECTION ERROR]', emotion: 'neutral', clueFound: null, knowledgeLinks: [] });
            controller.close();
            return;
          }

          const { emotion, clueFound } = finalize(npcText);
          send({ type: 'done', npcText, emotion, clueFound, knowledgeLinks });
          controller.close();
        }
      });

      return new Response(sse, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          // Stops proxies (and Netlify) from buffering the stream.
          'X-Accel-Buffering': 'no'
        }
      });
    }

    // ── Non-streaming path ───────────────────────────────────────────────────
    let npcText = '';
    try {
      npcText = await callLLM(systemPrompt, historyForLLM);
    } catch {
      return NextResponse.json({
        npcText: '[CONNECTION ERROR]',
        emotion: 'neutral' as Emotion,
        clueFound: null
      });
    }

    const { emotion, clueFound } = finalize(npcText);

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
