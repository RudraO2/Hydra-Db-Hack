import { NPC_BY_ID, type NPCId } from '@/data/npcs';
import { ingestGossipMemory, ingestHiveGossip, recallForGossip } from './hydradb';
import { callLLM, type Message } from './userServices';

export type GossipSession = {
  id: string;
  npc1Id: string;
  npc2Id: string;
  location: string;
  topic: string;
  turns: Array<{ speakerId: string; text: string }>;
  gameTime: string;
};

function firstMeaningfulPhrase(text: string) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/[{}\[\]"]/g, '')
    .trim();

  const chunk = cleaned.split(/[.!?]/).find((part) => part.trim().length > 8) ?? cleaned;
  const words = chunk.trim().split(/\s+/).slice(0, 6);
  return words.join(' ') || 'office tension';
}

function shorten(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function fallbackLine(speakerId: NPCId, listenerId: NPCId, seed: string, closing = false) {
  const speaker = NPC_BY_ID[speakerId];
  const listener = NPC_BY_ID[listenerId];
  if (closing) {
    return `${speaker.name.split(' ')[0]} squints at ${listener.name.split(' ')[0]}. "That makes this whole office feel worse somehow."`;
  }
  return `${speaker.name.split(' ')[0]} leans toward ${listener.name.split(' ')[0]}. "${shorten(seed || 'Something feels off around here.', 18)}"`;
}

async function generateTurn(system: string, prompt: string, fallback: string) {
  try {
    const messages: Message[] = [{ role: 'user', content: prompt }];
    const output = await callLLM(system, messages);
    return output.trim() || fallback;
  } catch {
    return fallback;
  }
}

export function findGossipPair(
  npcPositions: Record<string, string>
): [NPCId, NPCId, string] | null {
  const grouped = new Map<string, NPCId[]>();
  const gossipable = NPC_BY_ID
    ? Object.values(NPC_BY_ID)
        .filter((npc) => npc.canGossip)
        .map((npc) => ({
          id: npc.id,
          location: npcPositions[npc.id]
        }))
        .filter((entry): entry is { id: NPCId; location: string } => Boolean(entry.location))
    : [];

  for (const [npcId, location] of Object.entries(npcPositions)) {
    if (!NPC_BY_ID[npcId as NPCId]) continue;
    if (!NPC_BY_ID[npcId as NPCId].canGossip) continue;
    const bucket = grouped.get(location) ?? [];
    bucket.push(npcId as NPCId);
    grouped.set(location, bucket);
  }

  for (const [location, npcIds] of grouped) {
    if (npcIds.length < 2) continue;
    return [npcIds[0], npcIds[1], location];
  }

  if (gossipable.length >= 2) {
    const [first, second] = gossipable;
    const fallbackLocation =
      first.location === second.location
        ? first.location
        : `${first.location} / ${second.location}`;

    return [first.id, second.id, fallbackLocation];
  }

  return null;
}

export async function runGossipExchange(
  npc1Id: NPCId,
  npc2Id: NPCId,
  location: string,
  gameTime: string
): Promise<GossipSession> {
  const npc1 = NPC_BY_ID[npc1Id];
  const npc2 = NPC_BY_ID[npc2Id];

  // Use enriched recall (thinking mode + search_forceful_relations).
  // HydraDB follows graph edges so each NPC can surface memories from connected
  // NPCs — e.g. Priya's recall about Sanjana will find what Meera witnessed,
  // because the graph links them. This is the actual gossip propagation mechanism.
  const [recall1, recall2] = await Promise.all([
    recallForGossip(npc1Id, 'most interesting thing I know around the office').catch(() => ''),
    recallForGossip(npc2Id, 'what I know about recent office chatter').catch(() => '')
  ]);

  const topic = firstMeaningfulPhrase(recall1 || recall2 || `${npc1.name} and ${npc2.name} trading office gossip`);

  const turn1Text = await generateTurn(
    'Office gossip between coworkers',
    [
      `You are ${npc1.name}, ${npc1.role}. Personality: ${npc1.personality}.`,
      `You are chatting casually with ${npc2.name} at the ${location}.`,
      `Something on your mind: ${recall1 || npc1.knows}`,
      'Share something juicy, suspicious, or observant in 1-2 dramatic sentences.',
      'Do not accuse anyone outright.'
    ].join('\n'),
    fallbackLine(npc1Id, npc2Id, recall1 || npc1.knows)
  );

  const turn2Text = await generateTurn(
    'Office gossip between coworkers',
    [
      `You are ${npc2.name}, ${npc2.role}. Personality: ${npc2.personality}.`,
      `${npc1.name} just said: "${turn1Text}"`,
      `What you know about this topic: ${recall2 || npc2.knows}`,
      'React naturally and add your own take in 1-2 sentences.'
    ].join('\n'),
    fallbackLine(npc2Id, npc1Id, recall2 || npc2.knows)
  );

  const turn3Text = await generateTurn(
    'Office gossip between coworkers',
    [
      `You are ${npc1.name}, ${npc1.role}.`,
      `${npc2.name} just said: "${turn2Text}"`,
      'Give a one-sentence closing reaction: surprised, skeptical, or newly uneasy.'
    ].join('\n'),
    fallbackLine(npc1Id, npc2Id, turn2Text, true)
  );

  const summary =
    `${npc1.name} and ${npc2.name} talked at ${location}. ` +
    `${npc1.name} said: ${turn1Text}. ${npc2.name} replied: ${turn2Text}. ${turn3Text}`;
  const exactTranscript = [
    `Exact office conversation at ${location} (${gameTime}).`,
    `Participants: ${npc1.name} and ${npc2.name}.`,
    `${npc1.name}: ${turn1Text}`,
    `${npc2.name}: ${turn2Text}`,
    `${npc1.name}: ${turn3Text}`
  ].join(' ');

  // Ingest with TTL so old gossip decays — NPCs don't obsess over stale chatter.
  // Gossip goes into both NPCs' personal memories AND the shared hive, so any NPC
  // recalling later can discover what was said, not just the two who were there.
  await Promise.allSettled([
    ingestGossipMemory(npc1Id, summary, gameTime),
    ingestGossipMemory(npc2Id, summary, gameTime),
    ingestGossipMemory(npc1Id, exactTranscript, gameTime),
    ingestGossipMemory(npc2Id, exactTranscript, gameTime),
    ingestHiveGossip({ description: summary, entities: [npc1Id, npc2Id], location, gameTime }),
    ingestHiveGossip({ description: exactTranscript, entities: [npc1Id, npc2Id], location, gameTime })
  ]);

  return {
    id: crypto.randomUUID(),
    npc1Id,
    npc2Id,
    location,
    topic,
    gameTime,
    turns: [
      { speakerId: npc1Id, text: turn1Text },
      { speakerId: npc2Id, text: turn2Text },
      { speakerId: npc1Id, text: turn3Text }
    ]
  };
}
