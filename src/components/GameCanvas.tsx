'use client';

import dynamic from 'next/dynamic';
import { forwardRef, useImperativeHandle } from 'react';
import { worldEvents } from '@/game/worldEvents';

const Game = dynamic(() => import('./PhaserGame'), { ssr: false });

export type NPCBehaviorConfig = {
  speedMultiplier?: number;
  newWaypoints?: string[];
};

export type GameCanvasHandle = {
  pause: () => void;
  resume: () => void;
  setNPCBehavior: (npcId: string, config: NPCBehaviorConfig) => void;
};

type Props = {
  onInteract: (npcId: string) => void;
  onNPCProximity: (npcId: string, inRange: boolean) => void;
};

const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(
  { onInteract, onNPCProximity },
  ref
) {
  useImperativeHandle(ref, () => ({
    pause: () => worldEvents.emit('world:pause'),
    resume: () => worldEvents.emit('world:resume'),
    setNPCBehavior: (npcId, config) =>
      worldEvents.emit('npc:behavior_change', {
        npcId,
        ...config
      })
  }));

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Game onInteract={onInteract} onNPCProximity={onNPCProximity} />
    </div>
  );
});

export default GameCanvas;

