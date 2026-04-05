'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { NPCId, RoomId } from '@/data/npcs';
import { useGameStore } from '@/store/gameStore';
import HUD from './HUD';
import GossipTicker from './GossipTicker';
import ConversationView from './ConversationView';

const PhaserGame = dynamic(() => import('@/components/PhaserGame'), { ssr: false });

const WORLD_TICK_MS = Number(process.env.NEXT_PUBLIC_WORLD_TICK_MS ?? 30_000);
const GOSSIP_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_GOSSIP_INTERVAL_MS ?? 45_000);

export default function GameClient() {
  const {
    gameMinute,
    speed,
    npcPositions,
    investigation,
    conversation,
    gossipFeed,
    setGameMinute,
    setNpcPosition,
    openConversation,
    markTalkedTo,
    addGossip
  } = useGameStore();

  const [behaviorFlags, setBehaviorFlags] = useState({
    sanjanaToEntrance: false,
    devAvoidPlayer: false
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGameMinute((minute) => Math.min(18 * 60, minute + speed));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [setGameMinute, speed]);

  useEffect(() => {
    void fetch('/api/world/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'init', gameMinute: 9 * 60, investigation })
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        const response = await fetch('/api/world/event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventType: 'tick',
            gameMinute,
            investigation
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.behaviorFlags) {
          setBehaviorFlags(payload.behaviorFlags);
        }
      })();
    }, WORLD_TICK_MS);
    return () => window.clearInterval(interval);
  }, [gameMinute, investigation]);

  const npcPositionMap = useMemo(() => {
    return Object.fromEntries(
      Object.entries(npcPositions).map(([npcId, position]) => [npcId, position.roomId as RoomId])
    ) as Record<NPCId, RoomId>;
  }, [npcPositions]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        const response = await fetch('/api/npc/gossip', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            npcPositions: npcPositionMap,
            gameTime: `${String(Math.floor(gameMinute / 60)).padStart(2, '0')}:${String(gameMinute % 60).padStart(2, '0')}`
          })
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.id) {
          addGossip({
            id: payload.id,
            atGameMinute: gameMinute,
            speakerA: payload.npc1Id,
            speakerB: payload.npc2Id,
            turns: Array.isArray(payload.turns) ? payload.turns.map((turn: { text: string }) => turn.text) : []
          });
        }
      })();
    }, GOSSIP_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [addGossip, gameMinute, npcPositionMap]);

  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 16
      }}
    >
      <PhaserGame
        behaviorFlags={behaviorFlags}
        onInteractNpc={(npcId) => {
          markTalkedTo(npcId);
          openConversation(npcId);
        }}
        onNpcPosition={(npcId, x, y, roomId) => {
          setNpcPosition(npcId, { x, y, roomId });
        }}
      />
      <HUD
        gameMinute={gameMinute}
        contactsMade={investigation.npcIdsTalkedTo.length}
        cluesFound={investigation.cluesFound.length}
      />
      <GossipTicker items={gossipFeed} />
      {conversation.open ? <ConversationView /> : null}
    </main>
  );
}
