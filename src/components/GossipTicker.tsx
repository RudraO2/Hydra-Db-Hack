'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { NPC_BY_ID } from '@/data/npcs';
import type { GossipSession } from '@/lib/store';
import type { GossipItem } from '@/store/gameStore';

type Props = {
  sessions?: GossipSession[];
  items?: GossipItem[];
};

type PlaybackState = {
  session: GossipSession;
  visibleTurns: number;
  fading: boolean;
};

function normalizeLegacyItem(item: GossipItem): GossipSession {
  return {
    id: item.id,
    npc1Id: item.speakerA,
    npc2Id: item.speakerB,
    location: 'office',
    topic: 'office chatter',
    gameTime: String(item.atGameMinute),
    turns: item.turns.map((text, index) => ({
      speakerId: index % 2 === 0 ? item.speakerA : item.speakerB,
      text
    }))
  };
}

export default function GossipTicker({ sessions = [], items = [] }: Props) {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<GossipSession[]>([]);
  const timersRef = useRef<number[]>([]);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const sourceSessions = useMemo(
    () => (sessions.length > 0 ? sessions : items.map(normalizeLegacyItem)),
    [items, sessions]
  );

  const latestIds = useMemo(() => sourceSessions.map((session) => session.id), [sourceSessions]);

  useEffect(() => {
    const incoming = [...sourceSessions].reverse().filter((session) => !seenIdsRef.current.has(session.id));
    if (!incoming.length) return;

    for (const session of incoming) {
      seenIdsRef.current.add(session.id);
      queueRef.current.push(session);
    }

    if (!playback) {
      const next = queueRef.current.shift();
      if (next) {
        setPlayback({ session: next, visibleTurns: 1, fading: false });
      }
    }
  }, [latestIds, playback, sourceSessions]);

  useEffect(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];

    if (!playback) return;

    const turnTwo = window.setTimeout(() => {
      setPlayback((current) => (current ? { ...current, visibleTurns: 2 } : current));
    }, 2500);

    const turnThree = window.setTimeout(() => {
      setPlayback((current) => (current ? { ...current, visibleTurns: 3 } : current));
    }, 5000);

    const fade = window.setTimeout(() => {
      setPlayback((current) => (current ? { ...current, fading: true } : current));
    }, 8000);

    const finish = window.setTimeout(() => {
      const next = queueRef.current.shift() ?? null;
      setPlayback(next ? { session: next, visibleTurns: 1, fading: false } : null);
    }, 8600);

    timersRef.current = [turnTwo, turnThree, fade, finish];

    return () => {
      for (const id of timersRef.current) {
        window.clearTimeout(id);
      }
      timersRef.current = [];
    };
  }, [playback?.session.id]);

  if (!playback) return null;

  const { session, visibleTurns, fading } = playback;
  const npc1 = NPC_BY_ID[session.npc1Id as keyof typeof NPC_BY_ID];
  const npc2 = NPC_BY_ID[session.npc2Id as keyof typeof NPC_BY_ID];

  return (
    <aside
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        width: 280,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 50,
        pointerEvents: 'none',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease'
      }}
    >
      <div
        style={{
          borderRadius: 14,
          padding: 14,
          background: 'rgba(17, 14, 10, 0.82)',
          border: '1px solid rgba(255, 186, 73, 0.42)',
          boxShadow: '0 18px 42px rgba(0,0,0,0.32)',
          color: '#f5ddad'
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.75 }}>
          Ambient Gossip
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 10 }}>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: 999,
              background: `${npc1?.color ?? '#888'}22`,
              border: `1px solid ${npc1?.color ?? '#888'}`,
              fontSize: 11
            }}
          >
            {npc1?.name.split(' ')[0] ?? session.npc1Id}
          </span>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: 999,
              background: `${npc2?.color ?? '#888'}22`,
              border: `1px solid ${npc2?.color ?? '#888'}`,
              fontSize: 11
            }}
          >
            {npc2?.name.split(' ')[0] ?? session.npc2Id}
          </span>
        </div>
        <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 8 }}>
          {session.location} | topic: {session.topic}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {session.turns.slice(0, visibleTurns).map((turn, index) => (
            <div
              key={`${session.id}-${index}`}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255, 186, 73, 0.16)',
                lineHeight: 1.45,
                fontSize: 12
              }}
            >
              <strong style={{ color: '#ffe7b8' }}>
                {NPC_BY_ID[turn.speakerId as keyof typeof NPC_BY_ID]?.name.split(' ')[0] ?? turn.speakerId}:
              </strong>{' '}
              {turn.text}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
