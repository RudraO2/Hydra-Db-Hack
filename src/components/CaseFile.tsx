'use client';

import { useMemo, useState } from 'react';
import { CLUES, CLUE_BY_ID, CULPRIT, EVIDENCE_TO_CONVICT, RED_HERRINGS, TIMELINE } from '@/data/mystery';
import { NPCS, NPC_BY_ID, type NPCId } from '@/data/npcs';
import { useStore, type AccusationResult } from '@/lib/store';

/**
 * The case file. Everything the player has actually established, plus the one
 * irreversible action in the game: naming a suspect.
 *
 * The accusation is deliberately not a single button. You pick a person and you
 * pick the evidence you are standing on, and the ending depends on both.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  onAccuse: (result: AccusationResult) => void;
};

const PANEL_BG = 'rgba(9, 12, 20, 0.97)';
const HAIRLINE = '1px solid rgba(255,255,255,0.1)';

function decideEnding(suspectId: string, citedClues: string[]): AccusationResult['endingId'] {
  if (suspectId !== CULPRIT) return 'wrong';
  const proving = citedClues.filter((id) => CLUE_BY_ID[id]?.provesCulprit).length;
  return proving >= EVIDENCE_TO_CONVICT ? 'caught' : 'escaped';
}

export default function CaseFile({ open, onClose, onAccuse }: Props) {
  const cluesFound = useStore((s) => s.cluesFound);
  const clueSources = useStore((s) => s.clueSources);
  const npcsTalkedTo = useStore((s) => s.npcsTalkedTo);
  const accusation = useStore((s) => s.accusation);

  const [tab, setTab] = useState<'evidence' | 'suspects' | 'accuse'>('evidence');
  const [suspect, setSuspect] = useState<NPCId | null>(null);
  const [cited, setCited] = useState<string[]>([]);

  const sourceByClue = useMemo(
    () => Object.fromEntries(clueSources.map((entry) => [entry.clueId, entry])),
    [clueSources]
  );

  if (!open) return null;

  const foundClues = CLUES.filter((clue) => cluesFound.includes(clue.id));
  const canAccuse = Boolean(suspect) && !accusation;

  const submit = () => {
    if (!suspect) return;
    onAccuse({ suspectId: suspect, citedClues: cited, endingId: decideEnding(suspect, cited) });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(3, 5, 10, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(94vw, 880px)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: PANEL_BG,
          border: HAIRLINE,
          borderRadius: 16,
          boxShadow: '0 40px 90px rgba(0,0,0,0.55)',
          color: '#e9edf6',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px 0',
            borderBottom: HAIRLINE,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16
          }}
        >
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#f3b640', textTransform: 'uppercase' }}>
              Momentum Corp · Internal
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, letterSpacing: '-0.01em' }}>Case File</div>
            <div style={{ display: 'flex', gap: 20, margin: '14px 0 0' }}>
              {(
                [
                  ['evidence', `Evidence (${foundClues.length}/${CLUES.length})`],
                  ['suspects', `People (${npcsTalkedTo.length}/${NPCS.length})`],
                  ['accuse', 'Name a suspect']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: tab === key ? '2px solid #f3b640' : '2px solid transparent',
                    color: tab === key ? '#f3b640' : 'rgba(255,255,255,0.5)',
                    padding: '0 0 10px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close case file"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: HAIRLINE,
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 16,
              flexShrink: 0
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto' }}>
          {tab === 'evidence' ? (
            <>
              {foundClues.length === 0 ? (
                <div style={{ opacity: 0.55, fontSize: 14, lineHeight: 1.7, padding: '24px 0' }}>
                  Nothing established yet. Talk to people and ask about what they saw this morning — the cameras,
                  the server, who was near the CEO&apos;s office. Anything they actually tell you lands here.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {foundClues.map((clue, index) => {
                    const source = sourceByClue[clue.id];
                    return (
                      <div
                        key={clue.id}
                        style={{
                          padding: '13px 15px',
                          borderRadius: 11,
                          background: 'rgba(243,182,64,0.06)',
                          border: HAIRLINE
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: '#f3b640',
                            marginBottom: 7
                          }}
                        >
                          Exhibit {String(index + 1).padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.55 }}>{clue.text}</div>
                        {source ? (
                          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 7 }}>
                            from {NPC_BY_ID[source.npcId as NPCId]?.name ?? source.npcId} · {source.gameTime}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: 26, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.42 }}>
                Known timeline
              </div>
              <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
                {TIMELINE.map((entry, index) => {
                  // Only the parts the player has actually corroborated are legible.
                  const unlocked = index < 2 || foundClues.length > index - 1;
                  return (
                    <div
                      key={entry}
                      style={{
                        fontSize: 12.5,
                        opacity: unlocked ? 0.75 : 0.2,
                        filter: unlocked ? 'none' : 'blur(3px)',
                        userSelect: unlocked ? 'auto' : 'none',
                        lineHeight: 1.6
                      }}
                    >
                      {unlocked ? entry : '████ — ███████████████████████'}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === 'suspects' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {NPCS.map((npc) => {
                const met = npcsTalkedTo.includes(npc.id);
                const thread = RED_HERRINGS.find((entry) => entry.npcId === npc.id);
                const gave = clueSources.filter((entry) => entry.npcId === npc.id).length;

                return (
                  <div
                    key={npc.id}
                    style={{
                      display: 'flex',
                      gap: 13,
                      padding: '13px 15px',
                      borderRadius: 11,
                      background: 'rgba(255,255,255,0.035)',
                      border: HAIRLINE,
                      opacity: met ? 1 : 0.5
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: npc.color,
                        color: '#0a0b10',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        fontSize: 13,
                        flexShrink: 0
                      }}
                    >
                      {npc.name[0]}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{npc.name}</div>
                      <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 2 }}>{npc.role}</div>
                      <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55, opacity: 0.8 }}>
                        {met
                          ? thread?.label ?? 'Nothing unusual has surfaced about them yet.'
                          : 'You have not spoken to them.'}
                      </div>
                      {gave > 0 ? (
                        <div style={{ fontSize: 11, color: '#f3b640', marginTop: 7 }}>
                          gave you {gave} piece{gave === 1 ? '' : 's'} of evidence
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'accuse' ? (
            <>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, opacity: 0.75, marginBottom: 18 }}>
                Name one person, and select the evidence you are standing on. You only get to do this once —
                a name without a timeline behind it is just an opinion, and they will walk.
              </div>

              <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.42 }}>
                Who took the drive
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 9,
                  margin: '12px 0 24px'
                }}
              >
                {NPCS.map((npc) => {
                  const selected = suspect === npc.id;
                  return (
                    <button
                      key={npc.id}
                      type="button"
                      onClick={() => setSuspect(npc.id)}
                      disabled={Boolean(accusation)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '10px 12px',
                        borderRadius: 10,
                        cursor: accusation ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        background: selected ? 'rgba(243,182,64,0.14)' : 'rgba(255,255,255,0.04)',
                        border: selected ? '1px solid #f3b640' : HAIRLINE,
                        color: '#e9edf6'
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: npc.color,
                          color: '#0a0b10',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: 11,
                          flexShrink: 0
                        }}
                      >
                        {npc.name[0]}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{npc.name.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.42 }}>
                Evidence you are citing ({cited.length} selected)
              </div>
              <div style={{ display: 'grid', gap: 8, margin: '12px 0 22px' }}>
                {foundClues.length === 0 ? (
                  <div style={{ fontSize: 13, opacity: 0.5 }}>You have not established anything yet.</div>
                ) : (
                  foundClues.map((clue) => {
                    const selected = cited.includes(clue.id);
                    return (
                      <button
                        key={clue.id}
                        type="button"
                        disabled={Boolean(accusation)}
                        onClick={() =>
                          setCited((prev) =>
                            prev.includes(clue.id) ? prev.filter((id) => id !== clue.id) : [...prev, clue.id]
                          )
                        }
                        style={{
                          display: 'flex',
                          gap: 11,
                          alignItems: 'flex-start',
                          padding: '11px 13px',
                          borderRadius: 10,
                          textAlign: 'left',
                          cursor: accusation ? 'not-allowed' : 'pointer',
                          background: selected ? 'rgba(243,182,64,0.1)' : 'rgba(255,255,255,0.035)',
                          border: selected ? '1px solid rgba(243,182,64,0.55)' : HAIRLINE,
                          color: '#e9edf6'
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            marginTop: 2,
                            flexShrink: 0,
                            background: selected ? '#f3b640' : 'transparent',
                            border: selected ? 'none' : '1px solid rgba(255,255,255,0.3)',
                            color: '#0a0b10',
                            fontSize: 11,
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 900
                          }}
                        >
                          {selected ? '✓' : ''}
                        </span>
                        <span style={{ fontSize: 13, lineHeight: 1.5 }}>{clue.shortLabel}</span>
                      </button>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={!canAccuse}
                style={{
                  width: '100%',
                  padding: '15px 20px',
                  borderRadius: 11,
                  border: 'none',
                  background: canAccuse ? '#e2493f' : 'rgba(120,130,160,0.25)',
                  color: canAccuse ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: canAccuse ? 'pointer' : 'not-allowed'
                }}
              >
                {accusation
                  ? 'Accusation already made'
                  : suspect
                    ? `Accuse ${NPC_BY_ID[suspect].name}`
                    : 'Select a suspect'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
