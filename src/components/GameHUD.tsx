'use client';

import { CLUES } from '@/data/mystery';
import { NPCS } from '@/data/npcs';
import { useStore } from '@/lib/store';

/**
 * The clock ticks every second. Keeping it in its own component means only this
 * subtree re-renders on a tick, instead of the entire game page and every
 * overlay hanging off it.
 */

const DAY_START = 9 * 60;
const DAY_END = 18 * 60;

function formatClock(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export default function GameHUD({ onOpenCaseFile }: { onOpenCaseFile: () => void }) {
  const gameTimeMinutes = useStore((s) => s.gameTimeMinutes);
  const cluesFound = useStore((s) => s.cluesFound);
  const npcsTalkedTo = useStore((s) => s.npcsTalkedTo);
  const playerLocation = useStore((s) => s.playerLocation);

  const clamped = Math.min(gameTimeMinutes, DAY_END);
  const progress = Math.min(1, Math.max(0, (clamped - DAY_START) / (DAY_END - DAY_START)));
  const minutesLeft = Math.max(0, DAY_END - clamped);
  const urgent = minutesLeft <= 90;

  return (
    <div
      style={{
        position: 'fixed',
        top: 14,
        left: 14,
        zIndex: 60,
        display: 'flex',
        alignItems: 'stretch',
        gap: 1,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(8,10,18,0.86)',
        backdropFilter: 'blur(10px)',
        userSelect: 'none',
        fontFamily: "'Segoe UI', Tahoma, sans-serif"
      }}
    >
      {/* Clock */}
      <div style={{ padding: '9px 14px', minWidth: 108 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          {urgent ? 'End of day' : 'Time'}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: urgent ? '#e2493f' : '#f3b640',
            marginTop: 1
          }}
        >
          {formatClock(clamped)}
        </div>
        <div
          style={{
            height: 2,
            background: 'rgba(255,255,255,0.09)',
            borderRadius: 2,
            marginTop: 6,
            overflow: 'hidden'
          }}
        >
          {/* Scaled rather than resized - this updates every second, and
              animating width would relayout the HUD on every tick. */}
          <div
            style={{
              height: '100%',
              width: '100%',
              transform: `scaleX(${progress})`,
              transformOrigin: 'left center',
              background: urgent ? '#e2493f' : '#f3b640',
              borderRadius: 2,
              transition: 'transform 1s linear'
            }}
          />
        </div>
      </div>

      {/* Counters */}
      <div style={{ padding: '9px 14px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          Evidence
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 1, color: '#e9edf6' }}>
          {cluesFound.length}
          <span style={{ fontSize: 11, opacity: 0.4 }}>/{CLUES.length}</span>
        </div>
      </div>

      <div style={{ padding: '9px 14px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          Spoken to
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 1, color: '#e9edf6' }}>
          {npcsTalkedTo.length}
          <span style={{ fontSize: 11, opacity: 0.4 }}>/{NPCS.length}</span>
        </div>
      </div>

      <div style={{ padding: '9px 14px', borderLeft: '1px solid rgba(255,255,255,0.08)', minWidth: 108 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          Location
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: 'rgba(233,237,246,0.8)' }}>
          {playerLocation.replace(/([A-Z])/g, ' $1').trim()}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenCaseFile}
        style={{
          padding: '0 18px',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(243,182,64,0.1)',
          border: 'none',
          color: '#f3b640',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.05em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 7
        }}
      >
        Case File
        <kbd
          style={{
            background: 'rgba(243,182,64,0.16)',
            border: '1px solid rgba(243,182,64,0.3)',
            borderRadius: 4,
            padding: '1px 5px',
            fontSize: 10,
            fontFamily: 'monospace'
          }}
        >
          J
        </kbd>
      </button>
    </div>
  );
}
