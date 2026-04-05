import 'server-only';

import { HydraDBClient as HydraClient } from '@hydra_db/node';
import { NPCS, type NPCId } from '@/data/npcs';
import { BACKSTORY_EVENTS } from '@/data/mystery';

export const TENANT = 'momentum-corp-office';

const HIVE_SUB_TENANT = 'hive';
const CHAT_SUB_TENANT_PREFIX = 'chat_history__';
const BACKSTORY_SENTINEL_ID = 'backstory_seeded';
const INVESTIGATION_STATE_ID = 'office_drama_investigation_state_v1';
const PLAYER_CHAT_TRANSCRIPT_ID = 'player_chat_transcript_v1';
const PLAYER_CHAT_MEMORY_ID = 'player_chat_memory_v1';
const MAX_MEMORY_INGESTION_CHARS = 100_000;
const MAX_MESSAGE_CHARS = 4_000;

const client = new HydraClient({ token: process.env.HYDRADB_API_KEY });

export type WorldEvent = {
  description: string;
  location: string;
  entities: string[];
  gameTime: string;
  isClue?: boolean;
  clueId?: string;
};

export type InvestigationState = {
  npcIdsTalkedTo: NPCId[];
  cluesFound: string[];
};

export type PersistedChatMessage = {
  role: 'player' | 'npc';
  text: string;
};

type PersistedChatTranscript = {
  type: 'player_npc_transcript';
  npcId: NPCId;
  gameTime: string;
  location: string;
  updatedAt: string;
  messages: PersistedChatMessage[];
};

const DEFAULT_INVESTIGATION_STATE: InvestigationState = {
  npcIdsTalkedTo: [],
  cluesFound: []
};

const NAME_TO_NPC_ID: Record<string, NPCId> = {
  kabir: 'kabir',
  'kabir malhotra': 'kabir',
  priya: 'priya',
  'priya sharma': 'priya',
  dev: 'dev',
  'dev malhotra': 'dev',
  meera: 'meera',
  'meera joshi': 'meera',
  sanjana: 'sanjana',
  'sanjana kapoor': 'sanjana',
  rohan: 'rohan',
  'rohan mehta': 'rohan'
};

function formatGameTime(gameMinute: number) {
  const hour = Math.floor(gameMinute / 60);
  const minute = gameMinute % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function serializeWorldEvent(event: WorldEvent) {
  return JSON.stringify({
    type: 'world_event',
    ...event
  });
}

function serializeNpcMemory(content: string, gameTime: string) {
  return JSON.stringify({
    type: 'npc_memory',
    content,
    gameTime
  });
}

function serializeInvestigationState(state: InvestigationState) {
  return JSON.stringify({
    type: 'investigation_state',
    ...state
  });
}

function conversationSubTenant(npcId: NPCId) {
  return `${CHAT_SUB_TENANT_PREFIX}${npcId}`;
}

function truncateForIngestion(text: string, maxLength = MAX_MEMORY_INGESTION_CHARS) {
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

function normalizeChatMessages(messages: PersistedChatMessage[]) {
  return messages
    .map((message) => ({
      role: message.role,
      text: message.text.trim().slice(0, MAX_MESSAGE_CHARS)
    }))
    .filter((message) => Boolean(message.text));
}

function buildPersistedChatTranscript(params: {
  npcId: NPCId;
  messages: PersistedChatMessage[];
  gameTime: string;
  location: string;
}): PersistedChatTranscript {
  const normalized = normalizeChatMessages(params.messages);
  let trimmedMessages = normalized;

  while (trimmedMessages.length > 1) {
    const candidate: PersistedChatTranscript = {
      type: 'player_npc_transcript',
      npcId: params.npcId,
      gameTime: params.gameTime,
      location: params.location,
      updatedAt: new Date().toISOString(),
      messages: trimmedMessages
    };

    if (JSON.stringify(candidate).length <= MAX_MEMORY_INGESTION_CHARS) {
      return candidate;
    }

    trimmedMessages = trimmedMessages.slice(1);
  }

  return {
    type: 'player_npc_transcript',
    npcId: params.npcId,
    gameTime: params.gameTime,
    location: params.location,
    updatedAt: new Date().toISOString(),
    messages: trimmedMessages
  };
}

function transcriptToPairs(messages: PersistedChatMessage[]) {
  const pairs: Array<{ user: string; assistant: string }> = [];
  let pendingUser: string | null = null;

  for (const message of normalizeChatMessages(messages)) {
    if (message.role === 'player') {
      pendingUser = message.text;
      continue;
    }

    if (!pendingUser) continue;
    pairs.push({
      user: pendingUser,
      assistant: message.text
    });
    pendingUser = null;
  }

  return pairs;
}

function serializeTranscriptForDebug(transcript: PersistedChatTranscript) {
  return truncateForIngestion(
    [
      `Conversation with ${transcript.npcId} at ${transcript.location} (${transcript.gameTime})`,
      ...transcript.messages.map((message) =>
        `${message.role === 'player' ? 'Player' : transcript.npcId}: ${message.text}`
      )
    ].join('\n')
  );
}

function extractText(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(extractText);
  if (typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const candidates = [
    record.text,
    record.content,
    record.description,
    record.chunk_content,
    record.memory_content,
    record.memory,
    record.memories,
    record.user_memories,
    record.source,
    record.sources,
    record.results,
    record.chunks,
    record.additional_context,
    record.data,
    record.items
  ];

  return candidates.flatMap(extractText);
}

function joinUniqueTexts(payload: unknown) {
  return [...new Set(extractText(payload).map((text) => text.trim()).filter(Boolean))].join('\n');
}

function extractMemoryEntries(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as {
    user_memories?: Array<{ memory_content?: unknown }>;
  };

  if (!Array.isArray(record.user_memories)) return [];

  return record.user_memories
    .flatMap((entry) => extractText(entry.memory_content))
    .map((text) => text.trim())
    .filter(Boolean);
}

function parseInvestigationState(text: string | null): InvestigationState {
  if (!text) return DEFAULT_INVESTIGATION_STATE;
  try {
    const parsed = JSON.parse(text) as Partial<InvestigationState> & { type?: string };
    if (parsed.type !== 'investigation_state') return DEFAULT_INVESTIGATION_STATE;
    return {
      npcIdsTalkedTo: Array.isArray(parsed.npcIdsTalkedTo) ? (parsed.npcIdsTalkedTo as NPCId[]) : [],
      cluesFound: Array.isArray(parsed.cluesFound) ? parsed.cluesFound : []
    };
  } catch {
    return DEFAULT_INVESTIGATION_STATE;
  }
}

async function ensureTenant() {
  if (!process.env.HYDRADB_API_KEY) {
    throw new Error('HYDRADB_API_KEY is required to use HydraDB memory.');
  }

  try {
    await client.tenant.create({ tenant_id: TENANT });
  } catch (error) {
    const message = String((error as Error).message ?? '').toLowerCase();
    if (!message.includes('already')) {
      throw error;
    }
  }
}

async function addMemory(subTenantId: string, text: string, infer: boolean, sourceId?: string) {
  await ensureTenant();
  await client.upload.addMemory({
    tenant_id: TENANT,
    sub_tenant_id: subTenantId,
    upsert: true,
    memories: [
      {
        source_id: sourceId,
        text: truncateForIngestion(text),
        infer
      }
    ]
  });
}

async function addConversationMemory(
  subTenantId: string,
  pairs: Array<{ user: string; assistant: string }>,
  sourceId: string
) {
  if (pairs.length === 0) return;

  await ensureTenant();
  await client.upload.addMemory({
    tenant_id: TENANT,
    sub_tenant_id: subTenantId,
    upsert: true,
    memories: [
      {
        source_id: sourceId,
        user_name: 'Player',
        infer: true,
        custom_instructions:
          'Remember stable facts from this dialogue, what the NPC said, what the NPC heard, and keep future recall truthful to the stored conversation.',
        user_assistant_pairs: pairs
      }
    ]
  });
}

async function fetchMemoryById(subTenantId: string, sourceId: string): Promise<string | null> {
  const payload = await client.fetch.listData({
    tenant_id: TENANT,
    sub_tenant_id: subTenantId,
    kind: 'memories',
    source_ids: [sourceId],
    page_size: 1
  });

  const joined = joinUniqueTexts(payload);
  return joined || null;
}

async function recallText(subTenantId: string, query: string): Promise<string> {
  await ensureTenant();

  const payload = await client.recall.recallPreferences({
    tenant_id: TENANT,
    sub_tenant_id: subTenantId,
    query,
    recency_bias: 0.7,
    alpha: 0.6,
    max_results: 8
  });

  return joinUniqueTexts(payload);
}

function toNpcIds(entities: string[]) {
  return [...new Set(entities.map((entity) => NAME_TO_NPC_ID[entity.trim().toLowerCase()]).filter(Boolean))] as NPCId[];
}

function parsePersistedTranscript(text: string | null, npcId: NPCId): PersistedChatMessage[] {
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as Partial<PersistedChatTranscript>;
    if (parsed.type !== 'player_npc_transcript') return [];
    if (parsed.npcId !== npcId) return [];
    if (!Array.isArray(parsed.messages)) return [];

    return parsed.messages
      .map((message) => {
        if (
          message &&
          typeof message === 'object' &&
          (message.role === 'player' || message.role === 'npc') &&
          typeof message.text === 'string'
        ) {
          return {
            role: message.role,
            text: message.text
          } satisfies PersistedChatMessage;
        }

        return null;
      })
      .filter((message): message is PersistedChatMessage => Boolean(message));
  } catch {
    return [];
  }
}

export async function ingestWorldEvent(event: WorldEvent): Promise<void> {
  await addMemory(HIVE_SUB_TENANT, serializeWorldEvent(event), true);
}

export async function ingestNPCMemory(npcId: string, content: string, gameTime: string): Promise<void> {
  await addMemory(npcId, serializeNpcMemory(content, gameTime), true);
}

export async function recallForNPC(npcId: string, query: string): Promise<string> {
  return recallText(npcId, query);
}

export async function recallWorldState(query: string): Promise<string> {
  return recallText(HIVE_SUB_TENANT, query);
}

export async function seedBackstory(): Promise<void> {
  await ensureTenant();
  const alreadySeeded = await fetchMemoryById(HIVE_SUB_TENANT, BACKSTORY_SENTINEL_ID).catch(() => null);
  if (alreadySeeded) {
    return;
  }

  for (const event of BACKSTORY_EVENTS) {
    const worldEvent: WorldEvent = {
      description: event.text,
      location: 'momentum-corp-office',
      entities: event.entities,
      gameTime: '09:00'
    };

    await addMemory(HIVE_SUB_TENANT, serializeWorldEvent(worldEvent), false);

    for (const npcId of toNpcIds(event.entities)) {
      await addMemory(npcId, serializeNpcMemory(event.text, '09:00'), false);
    }
  }

  await addMemory(HIVE_SUB_TENANT, 'backstory_seeded: true', false, BACKSTORY_SENTINEL_ID);
}

export async function ensureBackstorySeeded() {
  await seedBackstory();
}

export async function ingestHiveEvent(event: WorldEvent, infer = true) {
  await addMemory(HIVE_SUB_TENANT, serializeWorldEvent(event), infer);
}

export async function ingestPersonalMemory(
  npcId: NPCId,
  content: string,
  gameMinute: number,
  infer = true
) {
  await addMemory(npcId, serializeNpcMemory(content, formatGameTime(gameMinute)), infer);
}

export async function recallHive(query: string) {
  const joined = await recallWorldState(query);
  return joined ? joined.split('\n').filter(Boolean) : [];
}

export async function recallNpcMemory(npcId: NPCId, query: string) {
  const joined = await recallForNPC(npcId, query);
  return joined ? joined.split('\n').filter(Boolean) : [];
}

export async function savePlayerConversation(params: {
  npcId: NPCId;
  messages: PersistedChatMessage[];
  gameTime: string;
  location: string;
}) {
  const transcript = buildPersistedChatTranscript(params);
  const pairs = transcriptToPairs(transcript.messages);

  await Promise.all([
    addMemory(
      conversationSubTenant(params.npcId),
      JSON.stringify(transcript),
      false,
      PLAYER_CHAT_TRANSCRIPT_ID
    ),
    addConversationMemory(params.npcId, pairs, PLAYER_CHAT_MEMORY_ID)
  ]);
}

export async function getPlayerConversationHistory(npcId: NPCId): Promise<PersistedChatMessage[]> {
  const raw = await fetchMemoryById(conversationSubTenant(npcId), PLAYER_CHAT_TRANSCRIPT_ID).catch(() => null);
  return parsePersistedTranscript(raw, npcId);
}

export async function listRecentMemories(subTenantId: string, pageSize = 100) {
  await ensureTenant();
  const payload = await client.fetch.listData({
    tenant_id: TENANT,
    sub_tenant_id: subTenantId,
    kind: 'memories',
    page: 1,
    page_size: Math.min(Math.max(pageSize, 1), 100)
  });

  const entries = extractMemoryEntries(payload);
  if (entries.length > 0) {
    return entries;
  }

  return joinUniqueTexts(payload)
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function getHydraDebugSnapshot(filterNpcIds: NPCId[] = []) {
  const playerChats = await Promise.all(
    NPCS.map(async (npc) => {
      const messages = await getPlayerConversationHistory(npc.id).catch(() => []);
      return {
        npcId: npc.id,
        messages,
        transcript:
          messages.length > 0
            ? serializeTranscriptForDebug(
                buildPersistedChatTranscript({
                  npcId: npc.id,
                  messages,
                  gameTime: 'unknown',
                  location: 'unknown'
                })
              )
            : ''
      };
    })
  );

  const hiveMemories = await listRecentMemories(HIVE_SUB_TENANT, 100).catch(() => []);
  const normalizedFilter = filterNpcIds.map((npcId) => npcId.toLowerCase());

  const filteredHiveMemories =
    normalizedFilter.length === 0
      ? hiveMemories
      : hiveMemories.filter((entry) => {
          const lowered = entry.toLowerCase();
          return normalizedFilter.every((npcId) => lowered.includes(npcId));
        });

  return {
    playerChats: playerChats.filter((chat) => chat.messages.length > 0),
    hiveMemories: filteredHiveMemories.slice(0, 100)
  };
}

export async function getInvestigationState(): Promise<InvestigationState> {
  await ensureTenant();
  const raw = await fetchMemoryById(HIVE_SUB_TENANT, INVESTIGATION_STATE_ID).catch(() => null);
  return parseInvestigationState(raw);
}

export async function setInvestigationState(state: InvestigationState) {
  await addMemory(
    HIVE_SUB_TENANT,
    serializeInvestigationState(state),
    false,
    INVESTIGATION_STATE_ID
  );
}

export function behaviorFlagsFromState(state: InvestigationState) {
  return {
    sanjanaToEntrance: state.cluesFound.length >= 5,
    devAvoidPlayer: state.cluesFound.includes('clue_1') || state.cluesFound.includes('clue_2')
  };
}
