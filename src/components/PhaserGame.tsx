'use client';

import { useEffect, useRef } from 'react';
import { CutsceneScene } from '@/game/CutsceneScene';
import { OfficeScene } from '@/game/OfficeScene';

type NPCBehaviorConfig = {
  speedMultiplier?: number;
  newWaypoints?: string[];
};

type Props = {
  onInteract?: (npcId: string) => void;
  onNPCProximity?: (npcId: string, inRange: boolean) => void;
  onInteractNpc?: (npcId: any, roomId: any) => void;
  onNpcPosition?: (npcId: any, x: any, y: any, roomId: any) => void;
  behaviorFlags?: any;
};

export default function PhaserGame({
  onInteract,
  onNPCProximity,
  onInteractNpc
}: Props) {
  const gameRef = useRef<any>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const onInteractRef = useRef<Props['onInteract']>();
  const onNPCProximityRef = useRef<Props['onNPCProximity']>();
  const onInteractNpcRef = useRef<Props['onInteractNpc']>();

  useEffect(() => {
    onInteractRef.current = onInteract;
    onNPCProximityRef.current = onNPCProximity;
    onInteractNpcRef.current = onInteractNpc;
  }, [onInteract, onNPCProximity, onInteractNpc]);

  useEffect(() => {
    let disposed = false;

    (async () => {
      const Phaser = (await import('phaser')).default;
      if (disposed || !hostRef.current) return;

      const cutsceneScene = new CutsceneScene();
      const officeScene = new OfficeScene({
        onInteract: (npcId: string) => {
          onInteractRef.current?.(npcId);
          onInteractNpcRef.current?.(npcId, null);
        },
        onNPCProximity: (npcId: string, inRange: boolean) =>
          onNPCProximityRef.current?.(npcId, inRange)
      });

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#10151f',
        pixelArt: true,
        antialias: false,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
          }
        },
        // CutsceneScene runs first; it calls scene.start('OfficeScene') when done
        scene: [cutsceneScene, officeScene],
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        render: {
          pixelArt: true,
          antialias: false,
          roundPixels: true
        }
      });
    })();

    return () => {
      disposed = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} style={{ width: '100vw', height: '100vh' }} />;
}
