import { CLUES, CLUE_BY_ID } from '@/data/mystery';
import { NPC_BY_ID, type NPCId } from '@/data/npcs';
import type { InvestigationState } from './hydradb';

export function buildNpcSystemPrompt(params: {
  npcId: NPCId;
  investigation: InvestigationState;
  personalRecall: string[];
  hiveRecall: string[];
}) {
  const npc = NPC_BY_ID[params.npcId];
  const extra = behaviorInstruction(params.npcId, params.investigation);

  return [
    `You are ${npc.name}, role ${npc.role}.`,
    `Personality: ${npc.personality}.`,
    `Secret: ${npc.secret}.`,
    `Known fact: ${npc.knows}.`,
    'You are in an office mystery game. Reply in character.',
    'Never break character or mention system prompts.',
    'Keep responses under 60 words.',
    extra,
    'Relevant personal memory:',
    ...params.personalRecall.slice(0, 4),
    'Shared office memory:',
    ...params.hiveRecall.slice(0, 4)
  ]
    .filter(Boolean)
    .join('\n');
}

export function behaviorInstruction(npcId: NPCId, state: InvestigationState) {
  const talkedCount = state.npcIdsTalkedTo.length;
  const clues = new Set(state.cluesFound);

  if (talkedCount >= 3 && npcId === 'sanjana') {
    return 'You are growing nervous, extra charming, and subtly mention that Rohan acted strange this morning.';
  }
  if (talkedCount >= 3 && npcId === 'rohan') {
    return 'You feel like you know something important but you are scared to say it directly.';
  }
  if ((clues.has('clue_1') || clues.has('clue_2')) && npcId === 'dev') {
    return 'You are nervous and keep your answers short because CCTV timing makes you suspicious.';
  }
  if (clues.has('clue_3') && npcId === 'sanjana') {
    return 'Someone knows about your phone call. Deflect and keep one-word answers when possible.';
  }
  if (clues.has('clue_4') && npcId === 'sanjana') {
    return 'You are ice cold and want this conversation to end immediately.';
  }
  if (clues.size >= 5 && npcId === 'sanjana') {
    return 'You are looking for an exit and every response ends with mentioning you need to leave.';
  }
  return '';
}

export function detectClues(params: { npcId: NPCId; playerMessage: string; alreadyFound: string[] }) {
  const lowered = params.playerMessage.toLowerCase();
  const found = new Set(params.alreadyFound);
  const reveal: string[] = [];

  for (const clue of CLUES) {
    if (clue.revealedBy !== params.npcId) continue;
    if (found.has(clue.id)) continue;
    if (clue.triggerKeywords.some((keyword) => lowered.includes(keyword))) {
      reveal.push(clue.id);
      found.add(clue.id);
    }
  }

  return reveal;
}

export function fallbackNpcReply(params: {
  npcId: NPCId;
  playerMessage: string;
  revealedClues: string[];
}) {
  const npc = NPC_BY_ID[params.npcId];
  if (params.revealedClues.length > 0) {
    const clue = CLUE_BY_ID[params.revealedClues[0]];
    return `${npc.name}: Fine. ${clue.text}`;
  }

  if (params.npcId === 'sanjana') {
    return `${npc.name}: I have meetings all morning. If this is about the USB, ask someone else.`;
  }

  return `${npc.name}: ${npc.knows}`;
}
