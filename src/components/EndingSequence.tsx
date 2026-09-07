'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ENDINGS, SPEAKER_VOICE, type EndingId } from '@/data/cutscene';
import { CLUE_BY_ID, CULPRIT } from '@/data/mystery';
import { NPC_BY_ID, type NPCId } from '@/data/npcs';
import { CutsceneVoice, loadCutsceneManifest } from '@/lib/cutsceneAudio';
import type { AccusationResult } from '@/lib/store';

/**
 * The epilogue. Plays the pre-generated Gemini voice lines for whichever ending
 * the accusation earned, with the subtitle timed to the real clip length, then
 * shows the case summary.
 */

type Props = {
  result: AccusationResult;
  gameTime: string;
};

const TONE = {
  win: { accent: '#f3b640', glow: 'rgba(243,182,64,0.16)' },
  loss: { accent: '#e2493f', glow: 'rgba(226,73,63,0.14)' }
} as const;

export default function EndingSequence({ result, gameTime }: Props) {
  const ending = ENDINGS[result.endingId as EndingId];
  const tone = TONE[ending.tone];

  const voiceRef = useRef<CutsceneVoice | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [visible, setVisible] = useState(false);

  const currentLine = ending.lines[lineIndex];

  const finish = useCallback(() => {
    voiceRef.current?.stop();
    setShowSummary(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 40);
    return () => window.clearTimeout(timer);
  }, []);

  // Drive the line sequence off the real audio durations, falling back to a
  // readable pace when audio is unavailable.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const voice = new CutsceneVoice();
    voiceRef.current = voice;

    void (async () => {
      const manifest = await loadCutsceneManifest();
      await voice.preload(manifest, ending.lines.map((line) => line.id));
      await voice.unlock();
      if (cancelled) return;

      const playFrom = (index: number) => {
        if (cancelled) return;
        if (index >= ending.lines.length) {
          setShowSummary(true);
          return;
        }

        setLineIndex(index);
        const played = voice.play(ending.lines[index].id);
        const hold = played > 0 ? played : Math.max(2600, ending.lines[index].text.length * 55);
        timer = window.setTimeout(() => playFrom(index + 1), hold + 700);
      };

      playFrom(0);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      voice.dispose();
      voiceRef.current = null;
    };
  }, [ending]);

  const suspect = NPC_BY_ID[result.suspectId as NPCId];
  const provingCited = useMemo(
    () => result.citedClues.filter((id) => CLUE_BY_ID[id]?.provesCulprit).length,
    [result.citedClues]
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: `radial-gradient(ellipse at 50% 40%, ${tone.glow}, rgba(3,5,10,0.985) 62%)`,
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        opacity: visible ? 1 : 0,
        transition: 'opacity 700ms ease'
      }}
    >
      {!showSummary ? (
        <div style={{ width: 'min(92vw, 760px)', textAlign: 'center' }} onClick={finish}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: tone.accent,
              marginBottom: 30
            }}
          >
            {ending.subtitle}
          </div>

          {currentLine ? (
            <>
              {currentLine.speaker !== 'narrator' ? (
                <div
                  style={{
                    fontSize: 12,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: NPC_BY_ID[currentLine.speaker as NPCId]?.color ?? '#fff',
                    marginBottom: 16
                  }}
                >
                  {NPC_BY_ID[currentLine.speaker as NPCId]?.name}
                </div>
              ) : null}
              <div
                key={currentLine.id}
                style={{
                  fontSize: 'clamp(17px, 2.5vw, 24px)',
                  lineHeight: 1.65,
                  color: currentLine.speaker === 'narrator' ? 'rgba(233,237,246,0.82)' : '#fff',
                  fontStyle: currentLine.speaker === 'narrator' ? 'italic' : 'normal',
                  animation: 'ending-line-in 700ms ease both'
                }}
              >
                {currentLine.speaker === 'narrator' ? currentLine.text : `“${currentLine.text}”`}
              </div>
            </>
          ) : null}

          <div style={{ marginTop: 44, fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
            click to skip
          </div>
        </div>
      ) : (
        <div
          style={{
            width: 'min(92vw, 560px)',
            textAlign: 'center',
            animation: 'ending-line-in 600ms ease both'
          }}
        >
          <div
            style={{
              fontSize: 'clamp(34px, 6vw, 56px)',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: tone.accent,
              textShadow: `0 0 46px ${tone.glow}`
            }}
          >
            {ending.title}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(233,237,246,0.55)', marginTop: 10 }}>{ending.subtitle}</div>

          <div
            style={{
              marginTop: 32,
              padding: 20,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              textAlign: 'left',
              display: 'grid',
              gap: 12
            }}
          >
            {[
              ['You accused', suspect?.name ?? result.suspectId],
              ['Actually took it', NPC_BY_ID[CULPRIT].name],
              ['Evidence cited', `${result.citedClues.length} (${provingCited} that mattered)`],
              ['Time of accusation', gameTime]
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 26, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '13px 26px',
                borderRadius: 999,
                border: 'none',
                background: tone.accent,
                color: '#0a0b10',
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer'
              }}
            >
              Run it again
            </button>
            <Link
              href="/"
              style={{
                padding: '13px 26px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e9edf6',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                textDecoration: 'none'
              }}
            >
              Menu
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ending-line-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Referenced so the voice cast stays in sync with the data module.
export const ENDING_VOICES = SPEAKER_VOICE;
