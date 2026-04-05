'use client';

import { useMemo } from 'react';
import { NPCS } from '@/data/npcs';
import type { KnowledgeEdge } from '@/lib/store';

type Props = {
  open: boolean;
  edges: KnowledgeEdge[];
};

const WIDTH = 920;
const HEIGHT = 620;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS = 220;

function polar(index: number, total: number) {
  const angle = (-Math.PI / 2) + (index / total) * Math.PI * 2;
  return {
    x: CENTER_X + Math.cos(angle) * RADIUS,
    y: CENTER_Y + Math.sin(angle) * RADIUS
  };
}

function clampLabel(text: string) {
  return text.trim().split(/\s+/).slice(0, 4).join(' ');
}

export default function MemoryWeb({ open, edges }: Props) {
  const nodes = useMemo(() => {
    const entries = NPCS.map((npc, index) => ({
      id: npc.id,
      label: npc.name.split(' ')[0],
      color: npc.color,
      ...polar(index, NPCS.length)
    }));

    return [
      {
        id: 'player',
        label: 'Player',
        color: '#ffffff',
        x: CENTER_X,
        y: CENTER_Y
      },
      ...entries
    ];
  }, []);

  const nodeMap = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node])),
    [nodes]
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        pointerEvents: 'none',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(4, 8, 16, 0.48)',
        backdropFilter: 'blur(2px)'
      }}
    >
      <div
        style={{
          width: 'min(92vw, 920px)',
          padding: 18,
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(8, 12, 18, 0.78)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.34)'
        }}
      >
        <div style={{ color: '#f6f8ff', fontSize: 26, fontWeight: 800 }}>
          Knowledge Web - who knows what
        </div>
        <div style={{ color: 'rgba(255,255,255,0.64)', marginTop: 6, marginBottom: 16, fontSize: 13 }}>
          Press M to toggle. Lines appear when the player talks to someone, gossip spreads, or a recalled memory links two NPCs.
        </div>

        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {edges.map((edge) => {
            const from = nodeMap[edge.from];
            const to = nodeMap[edge.to];
            if (!from || !to) return null;

            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const label = clampLabel(edge.label);
            const stroke =
              edge.kind === 'gossip' ? '#ffbf69' : edge.kind === 'memory' ? '#8ad8ff' : '#ffffff';

            return (
              <g key={edge.id} style={{ opacity: 0, animation: 'memory-edge-in 0.5s ease forwards' }}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={stroke}
                  strokeWidth="2.2"
                  strokeOpacity="0.85"
                  filter="url(#glow)"
                />
                <rect
                  x={midX - 54}
                  y={midY - 12}
                  width="108"
                  height="24"
                  rx="12"
                  fill="rgba(5,8,14,0.82)"
                  stroke="rgba(255,255,255,0.14)"
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fill="#f4e5b9"
                  style={{ fontSize: 11, letterSpacing: '0.02em' }}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {nodes.map((node) => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.id === 'player' ? 42 : 34}
                fill="rgba(12,17,26,0.95)"
                stroke={node.color}
                strokeWidth="3"
                filter="url(#glow)"
              />
              <text
                x={node.x}
                y={node.y + 5}
                textAnchor="middle"
                fill="#f8fbff"
                style={{ fontSize: node.id === 'player' ? 16 : 13, fontWeight: 700 }}
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <style jsx>{`
        @keyframes memory-edge-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
