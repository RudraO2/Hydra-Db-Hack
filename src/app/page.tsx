'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import GameCanvas from '@/components/GameCanvas';
import ConversationView from '@/components/ConversationView';
import GossipTicker from '@/components/GossipTicker';
import MemoryWeb from '@/components/MemoryWeb';
import { NPC_BY_ID, NPCS } from '@/data/npcs';
import { useStore } from '@/lib/store';
import { useGameStore } from '@/store/gameStore';
import { worldEvents } from '@/game/worldEvents';

const WORLD_TICK_MS = Number(process.env.NEXT_PUBLIC_WORLD_TICK_MS ?? 30_000);
const GOSSIP_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_GOSSIP_INTERVAL_MS ?? 45_000);

type HydraInspectorSnapshot = {
  playerChats: Array<{ npcId: string; transcript: string }>;
  hiveMemories: string[];
};

function formatGameTime(gameMinute: number) {
  const hour = Math.floor(gameMinute / 60);
  const minute = gameMinute % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;

  const tagName = element.tagName?.toLowerCase();
  return (
    element.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

export default function Page() {
  const [npcInRange, setNpcInRange] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugNote, setDebugNote] = useState<string | null>(null);
  const [memoryWebOpen, setMemoryWebOpen] = useState(false);
  const [hydraInspectorOpen, setHydraInspectorOpen] = useState(false);
  const [hydraInspectorFilter, setHydraInspectorFilter] = useState('');
  const [hydraInspectorData, setHydraInspectorData] = useState<HydraInspectorSnapshot>({
    playerChats: [],
    hiveMemories: []
  });
  const gameTimeMinutes = useStore((state) => state.gameTimeMinutes);
  const playerLocation = useStore((state) => state.playerLocation);
  const activeNPC = useStore((state) => state.activeNPC);
  const setActiveNPC = useStore((state) => state.setActiveNPC);
  const incrementInvestigation = useStore((state) => state.incrementInvestigation);
  const npcPositions = useStore((state) => state.npcPositions);
  const lastGossipSessions = useStore((state) => state.lastGossipSessions);
  const addGossipSession = useStore((state) => state.addGossipSession);
  const addConversationEvent = useStore((state) => state.addConversationEvent);
  const knowledgeEdges = useStore((state) => state.knowledgeEdges);
  const addKnowledgeEdge = useStore((state) => state.addKnowledgeEdge);
  const lastEvents = useGameStore((state) => state.lastEvents);
  const appendLastEvent = useGameStore((state) => state.appendLastEvent);
  const appendLastEvents = useGameStore((state) => state.appendLastEvents);

  const npcName = useMemo(() => {
    if (!npcInRange) return '';
    return NPCS.find((n) => n.id === npcInRange)?.name.split(' ')[0] ?? npcInRange;
  }, [npcInRange]);

  const loadHydraInspector = useCallback(
    async (filterValue = hydraInspectorFilter) => {
      const npcIds = filterValue
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 2)
        .join(',');

      const response = await fetch(
        npcIds ? `/api/debug/hydra?npcIds=${encodeURIComponent(npcIds)}` : '/api/debug/hydra'
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) return;

      setHydraInspectorData({
        playerChats: Array.isArray(payload?.playerChats) ? payload.playerChats : [],
        hiveMemories: Array.isArray(payload?.hiveMemories) ? payload.hiveMemories : []
      });
    },
    [hydraInspectorFilter]
  );

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/world/event', { method: 'GET' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;

      if (typeof payload?.note === 'string') {
        setDebugNote(payload.note);
      }
      if (Array.isArray(payload?.descriptions) && payload.descriptions.length > 0) {
        appendLastEvents(payload.descriptions);
      }
    })();
  }, [appendLastEvents]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetch('/api/world/tick', { method: 'GET' });
    }, WORLD_TICK_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        !event.repeat &&
        !event.altKey &&
        !event.metaKey &&
        !isEditableTarget(event.target) &&
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === 'h'
      ) {
        event.preventDefault();
        const nextOpen = !hydraInspectorOpen;
        setHydraInspectorOpen(nextOpen);
        if (nextOpen) {
          void loadHydraInspector();
        }
        return;
      }

      if (
        activeNPC ||
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key.toLowerCase() === 'd') {
        setDebugOpen((open) => !open);
      }
      if (event.key.toLowerCase() === 'm') {
        setMemoryWebOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeNPC, hydraInspectorOpen, loadHydraInspector]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        const response = await fetch('/api/npc/gossip', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            npcPositions,
            gameTime: formatGameTime(gameTimeMinutes)
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (typeof payload?.error === 'string') {
            setDebugNote(`Gossip route error: ${payload.error}`);
          }
          return;
        }

        if (payload?.noPair || !payload?.id) return;

        addGossipSession(payload);
        worldEvents.emit('npc:gossip_session', payload);
        addConversationEvent(`${payload.npc1Id}:${payload.npc2Id}`);
        addKnowledgeEdge({
          id: `gossip:${payload.id}`,
          from: payload.npc1Id,
          to: payload.npc2Id,
          label: `${payload.topic}`,
          kind: 'gossip'
        });

        console.log('[Hydra Flow] Gossip spread', {
          type: 'gossip',
          pair: `${payload.npc1Id}->${payload.npc2Id}`,
          location: payload.location,
          topic: payload.topic
        });
      })();
    }, GOSSIP_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [
    addConversationEvent,
    addGossipSession,
    addKnowledgeEdge,
    gameTimeMinutes,
    npcPositions
  ]);

  const handleInteract = useCallback(async (npcId: string) => {
    const npc = NPC_BY_ID[npcId as keyof typeof NPC_BY_ID];

    setActiveNPC(npcId);
    incrementInvestigation();
    worldEvents.emit('npc:conversation_start', { npcId });
    addConversationEvent(`player:${npcId}`);
    addKnowledgeEdge({
      id: `player:${npcId}`,
      from: 'player',
      to: npcId,
      label: `Player spoke with ${npc?.name.split(' ')[0] ?? npcId}`,
      kind: 'player'
    });
    console.log('[Hydra Flow] Player interview', {
      type: 'player-talk',
      edge: `player:${npcId}`,
      npcId
    });

    const description = `Player approached ${npc?.name.split(' ')[0] ?? npcId}`;

    const response = await fetch('/api/world/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        description,
        location: playerLocation,
        entities: ['player', npcId],
        gameTime: formatGameTime(gameTimeMinutes)
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return;

    if (Array.isArray(payload?.descriptions) && payload.descriptions.length > 0) {
      appendLastEvents(payload.descriptions);
      return;
    }
    if (typeof payload?.description === 'string') {
      appendLastEvent(payload.description);
    }
  }, [
    addConversationEvent,
    addKnowledgeEdge,
    appendLastEvent,
    appendLastEvents,
    gameTimeMinutes,
    playerLocation,
    setActiveNPC,
    incrementInvestigation
  ]);

  const handleNPCProximity = useCallback((npcId: string, inRange: boolean) => {
    setNpcInRange((prev) => {
      if (inRange) return npcId;
      if (prev === npcId) return null;
      return prev;
    });
  }, []);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <GameCanvas
        onInteract={handleInteract}
        onNPCProximity={handleNPCProximity}
      />

      {activeNPC ? <ConversationView /> : null}
      <GossipTicker sessions={lastGossipSessions} />
      <MemoryWeb open={memoryWebOpen} edges={knowledgeEdges} />

      {npcInRange && !activeNPC ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,20,0.9)',
            color: '#ffffff',
            borderRadius: 999,
            padding: '10px 16px',
            fontSize: 14,
            border: '1px solid rgba(255,255,255,0.18)',
            zIndex: 100
          }}
        >
          Press E to talk to {npcName}
        </div>
      ) : null}

      {debugOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 200,
            width: 320,
            background: 'rgba(10, 14, 22, 0.92)',
            color: '#f4f7fb',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 12,
            padding: 12,
            fontSize: 12,
            boxShadow: '0 18px 40px rgba(0,0,0,0.28)'
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>
            HydraDB Debug
          </div>
          {debugNote ? <div style={{ marginTop: 8, color: '#9fd3ff' }}>{debugNote}</div> : null}
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {lastEvents.length > 0 ? (
              [...lastEvents].reverse().map((event, index) => (
                <div
                  key={`${event}-${index}`}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)',
                    lineHeight: 1.35
                  }}
                >
                  {event}
                </div>
              ))
            ) : (
              <div style={{ opacity: 0.65 }}>No HydraDB ingestions yet.</div>
            )}
          </div>
        </div>
      ) : null}

      {hydraInspectorOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 240,
            width: 420,
            maxHeight: '80vh',
            overflow: 'auto',
            background: 'rgba(8, 10, 18, 0.96)',
            color: '#f4f7fb',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 18px 40px rgba(0,0,0,0.32)'
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              value={hydraInspectorFilter}
              onChange={(event) => setHydraInspectorFilter(event.target.value)}
              placeholder="Filter NPC ids, e.g. kabir,priya"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff'
              }}
            />
            <button
              type="button"
              onClick={() => void loadHydraInspector()}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(115,180,255,0.18)',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>

          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>
            Hydra Inspector
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>Persisted player chats</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {hydraInspectorData.playerChats.length > 0 ? (
              hydraInspectorData.playerChats.map((chat) => (
                <div
                  key={chat.npcId}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.45,
                    fontSize: 12
                  }}
                >
                  {chat.transcript}
                </div>
              ))
            ) : (
              <div style={{ opacity: 0.65, fontSize: 12 }}>No persisted NPC chat transcripts found.</div>
            )}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.78 }}>Shared hive memory</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {hydraInspectorData.hiveMemories.length > 0 ? (
              hydraInspectorData.hiveMemories.map((entry, index) => (
                <div
                  key={`${entry}-${index}`}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.45,
                    fontSize: 12
                  }}
                >
                  {entry}
                </div>
              ))
            ) : (
              <div style={{ opacity: 0.65, fontSize: 12 }}>No matching hive memories found.</div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
