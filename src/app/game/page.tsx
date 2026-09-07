'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import GameCanvas from '@/components/GameCanvas';
import ConversationView from '@/components/ConversationView';
import GossipTicker from '@/components/GossipTicker';
import MemoryWeb from '@/components/MemoryWeb';
import CaseFile from '@/components/CaseFile';
import EndingSequence from '@/components/EndingSequence';
import GameHUD from '@/components/GameHUD';
import { NPC_BY_ID, NPCS } from '@/data/npcs';
import { useStore } from '@/lib/store';
import { prefetchAllVRMs } from '@/lib/vrmCache';
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

const CONTROL_HINTS = [
  { key: 'WASD', label: 'Move' },
  { key: 'E', label: 'Talk' },
  { key: 'J', label: 'Case File' },
  { key: 'M', label: 'Memory Web' },
  { key: 'ESC', label: 'Close' },
];

// 6:00 PM. The working day is the timer.
const DAY_END_MINUTES = 18 * 60;

export default function GamePage() {
  const [npcInRange, setNpcInRange] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugNote, setDebugNote] = useState<string | null>(null);
  const [memoryWebOpen, setMemoryWebOpen] = useState(false);
  const [caseFileOpen, setCaseFileOpen] = useState(false);
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
  const markTalkedTo = useStore((state) => state.markTalkedTo);
  const accusation = useStore((state) => state.accusation);
  const setAccusation = useStore((state) => state.setAccusation);
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

  // Warm the avatar cache during idle time so the first conversation opens
  // instantly instead of downloading a model while the player waits.
  useEffect(() => {
    prefetchAllVRMs();
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
        if (nextOpen) void loadHydraInspector();
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

      const key = event.key.toLowerCase();
      if (key === 'd') setDebugOpen((open) => !open);
      if (key === 'm') setMemoryWebOpen((open) => !open);
      if (key === 'j') setCaseFileOpen((open) => !open);
      if (key === 'escape') {
        setCaseFileOpen(false);
        setMemoryWebOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeNPC, hydraInspectorOpen, loadHydraInspector]);

  // gameTimeMinutes ticks every second and npcPositions changes every two, so
  // listing them as dependencies tore the interval down and rebuilt it before it
  // could ever reach GOSSIP_INTERVAL_MS - gossip never actually ran. The live
  // values are read through a ref instead, and the interval is created once.
  const gossipInputsRef = useRef({ npcPositions, gameTimeMinutes });
  gossipInputsRef.current = { npcPositions, gameTimeMinutes };

  useEffect(() => {
    let inFlight = false;

    const runGossip = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { npcPositions: positions, gameTimeMinutes: minutes } = gossipInputsRef.current;
        const response = await fetch('/api/npc/gossip', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            npcPositions: positions,
            gameTime: formatGameTime(minutes)
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
      } finally {
        inFlight = false;
      }
    };

    const interval = window.setInterval(() => void runGossip(), GOSSIP_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [addConversationEvent, addGossipSession, addKnowledgeEdge]);

  const handleInteract = useCallback(
    async (npcId: string) => {
      const npc = NPC_BY_ID[npcId as keyof typeof NPC_BY_ID];

      setActiveNPC(npcId);
      incrementInvestigation();
      markTalkedTo(npcId);
      worldEvents.emit('npc:conversation_start', { npcId });
      addConversationEvent(`player:${npcId}`);
      addKnowledgeEdge({
        id: `player:${npcId}`,
        from: 'player',
        to: npcId,
        label: `Player spoke with ${npc?.name.split(' ')[0] ?? npcId}`,
        kind: 'player'
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
    },
    [
      addConversationEvent,
      addKnowledgeEdge,
      appendLastEvent,
      appendLastEvents,
      gameTimeMinutes,
      playerLocation,
      setActiveNPC,
      incrementInvestigation,
      markTalkedTo
    ]
  );

  // Six o'clock is the deadline. If the player never commits to a name, the day
  // ends for them and the drive leaves the building.
  useEffect(() => {
    if (accusation || gameTimeMinutes < DAY_END_MINUTES) return;
    setCaseFileOpen(false);
    setActiveNPC(null);
    setAccusation({ suspectId: 'none', citedClues: [], endingId: 'wrong' });
  }, [accusation, gameTimeMinutes, setAccusation, setActiveNPC]);

  const handleAccuse = useCallback(
    (result: Parameters<typeof setAccusation>[0]) => {
      setCaseFileOpen(false);
      setActiveNPC(null);
      setAccusation(result);
    },
    [setAccusation, setActiveNPC]
  );

  const handleNPCProximity = useCallback((npcId: string, inRange: boolean) => {
    setNpcInRange((prev) => {
      if (inRange) return npcId;
      if (prev === npcId) return null;
      return prev;
    });
  }, []);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <GameCanvas onInteract={handleInteract} onNPCProximity={handleNPCProximity} />

      {activeNPC ? <ConversationView /> : null}
      <GossipTicker sessions={lastGossipSessions} />
      <MemoryWeb open={memoryWebOpen} edges={knowledgeEdges} />

      {/* The clock lives in its own subtree so a tick does not re-render the world. */}
      {!accusation ? <GameHUD onOpenCaseFile={() => setCaseFileOpen(true)} /> : null}

      <CaseFile
        open={caseFileOpen && !accusation}
        onClose={() => setCaseFileOpen(false)}
        onAccuse={handleAccuse}
      />

      {accusation ? (
        <EndingSequence result={accusation} gameTime={formatGameTime(gameTimeMinutes)} />
      ) : null}

      {/* Back to menu */}
      <Link
        href="/"
        style={{
          position: 'fixed',
          top: 14,
          right: 14,
          zIndex: 120,
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.35)',
          textDecoration: 'none',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          padding: '4px 10px',
        }}
      >
        ← Menu
      </Link>

      {/* NPC proximity prompt */}
      {npcInRange && !activeNPC ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 56,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,20,0.92)',
            color: '#ffffff',
            borderRadius: 999,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            border: '1px solid rgba(255,255,255,0.18)',
            zIndex: 100,
            whiteSpace: 'nowrap',
          }}
        >
          <kbd
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: 12,
              marginRight: 6,
              color: '#f3b640',
            }}
          >
            E
          </kbd>
          Talk to {npcName}
        </div>
      ) : null}

      {/* Debug panel */}
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
            boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.7,
            }}
          >
            HydraDB Debug
          </div>
          {debugNote ? (
            <div style={{ marginTop: 8, color: '#9fd3ff' }}>{debugNote}</div>
          ) : null}
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {lastEvents.length > 0 ? (
              [...lastEvents].reverse().map((event, index) => (
                <div
                  key={`${event}-${index}`}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)',
                    lineHeight: 1.35,
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

      {/* Hydra Inspector */}
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
            boxShadow: '0 18px 40px rgba(0,0,0,0.32)',
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
                color: '#fff',
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
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.7,
            }}
          >
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
                    fontSize: 12,
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
                    fontSize: 12,
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

      {/* RPG-style bottom controls bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 38,
          background: 'rgba(8,10,18,0.88)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          zIndex: 50,
          userSelect: 'none',
          backdropFilter: 'blur(8px)',
        }}
      >
        {CONTROL_HINTS.map(({ key, label }) => (
          <span
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            <kbd
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderBottom: '2px solid rgba(255,255,255,0.18)',
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#f3b640',
                whiteSpace: 'nowrap',
              }}
            >
              {key}
            </kbd>
            {label}
          </span>
        ))}
      </div>
    </main>
  );
}
