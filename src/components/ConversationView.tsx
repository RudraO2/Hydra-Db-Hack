'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import VRMViewer from './VRMViewer';
import { NPC_BY_ID, type NPCId } from '@/data/npcs';
import { CLUE_BY_ID } from '@/data/mystery';
import { useStore } from '@/lib/store';
import { worldEvents } from '@/game/worldEvents';
import { listen as userListen, speak as userSpeak } from '@/lib/userServices';
import type { Emotion } from '@/lib/VRMAnimation';

type Message = { role: 'npc' | 'player'; text: string };

// Server-sent events separate frames with a blank line.
const SSE_SEPARATOR = String.fromCharCode(10, 10);

const OPENING_STATE: Record<NPCId, { emotion: Emotion; text: string }> = {
  kabir: {
    emotion: 'angry',
    text: '[Kabir straightens his collar] Yes? Make it quick.'
  },
  priya: {
    emotion: 'happy',
    text: '[Priya smiles brightly] Hi! Tell me everything.'
  },
  dev: {
    emotion: 'sad',
    text: '[Dev rubs the back of his neck] Uh... hey. What do you need?'
  },
  meera: {
    emotion: 'sad',
    text: '[Meera exhales through her nose] What is it now?'
  },
  sanjana: {
    emotion: 'happy',
    text: '[Sanjana gives you a polished smile] Hello. Need something?'
  },
  rohan: {
    emotion: 'surprised',
    text: '[Rohan perks up with a grin] Oh, hi. You here for gossip?'
  }
};

function formatGameTime(gameMinute: number) {
  const hour = Math.floor(gameMinute / 60);
  const minute = gameMinute % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function ConversationView() {
  const voiceFeaturesReady = true;
  const activeNPC = useStore((s) => s.activeNPC) as NPCId | null;
  const setActiveNPC = useStore((s) => s.setActiveNPC);
  const addClue = useStore((s) => s.addClue);
  const addConversationEvent = useStore((s) => s.addConversationEvent);
  const addKnowledgeEdge = useStore((s) => s.addKnowledgeEdge);
  const cluesFound = useStore((s) => s.cluesFound);
  const recordClueSource = useStore((s) => s.recordClueSource);
  const markCluePresented = useStore((s) => s.markCluePresented);
  const presentedClues = useStore((s) => s.presentedClues);
  const investigationState = useStore((s) => s.investigationState);
  const gameTimeMinutes = useStore((s) => s.gameTimeMinutes);
  const playerLocation = useStore((s) => s.playerLocation);

  const npc = activeNPC ? NPC_BY_ID[activeNPC] : null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>('neutral');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [draft, setDraft] = useState('');
  const [clueToast, setClueToast] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!npc) return;

    let cancelled = false;
    const openingState = OPENING_STATE[npc.id];

    setMessages([]);
    setCurrentEmotion(openingState?.emotion ?? ((npc.defaultEmotion as Emotion) ?? 'neutral'));
    setDraft('');
    setIsLoading(false);
    setIsListening(false);

    void (async () => {
      try {
        const response = await fetch(`/api/npc/history?npcId=${npc.id}`);
        const payload = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (response.ok && Array.isArray(payload?.messages) && payload.messages.length > 0) {
          setMessages(
            payload.messages
              .filter(
                (message: unknown): message is Message =>
                  Boolean(message) &&
                  typeof message === 'object' &&
                  ((message as Message).role === 'npc' || (message as Message).role === 'player') &&
                  typeof (message as Message).text === 'string'
              )
          );
          return;
        }
      } catch {
        // Fall back to a fresh opening line below.
      }

      if (!cancelled) {
        setMessages([
          {
            role: 'npc',
            text: openingState?.text ?? `[${npc.name} looks up] What do you want?`
          }
        ]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [npc]);

  // Auto-scroll message list.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (!npc) return;

    const focusId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(focusId);
  }, [npc]);

  const canSend = useMemo(
    () => !!npc && draft.trim().length > 0 && !isLoading,
    [npc, draft, isLoading]
  );

  const latestNPCText = useMemo(
    () => [...messages].reverse().find((msg) => msg.role === 'npc')?.text ?? '',
    [messages]
  );

  /**
   * Streams the reply. The first fragment usually lands within a few hundred
   * milliseconds, so the character starts talking while the rest is still being
   * generated instead of the panel sitting on "thinking" for the whole trip.
   */
  async function handleSend(textOverride?: string, presentedClue?: string) {
    if (!npc) return;
    const playerText = (textOverride ?? draft).trim();
    if (!playerText) return;

    const history = [...messages, { role: 'player' as const, text: playerText }];
    setMessages(history);
    setDraft('');
    setIsLoading(true);

    // The streaming reply occupies its own message slot, appended to as deltas arrive.
    let replyIndex = -1;
    setMessages((prev) => {
      replyIndex = prev.length;
      return [...prev, { role: 'npc', text: '' }];
    });

    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = '';

    const applyDone = (payload: {
      npcText?: string;
      emotion?: Emotion;
      clueFound?: string | null;
      knowledgeLinks?: Array<{ from: string; to: string; label: string }>;
    }) => {
      const finalText = payload.npcText ?? fullText;
      setMessages((prev) => {
        const next = [...prev];
        if (next[replyIndex]) next[replyIndex] = { role: 'npc', text: finalText };
        return next;
      });
      setCurrentEmotion(payload.emotion ?? 'neutral');

      if (payload.clueFound) {
        addClue(payload.clueFound);
        recordClueSource({
          clueId: payload.clueFound,
          npcId: npc.id,
          gameTime: formatGameTime(gameTimeMinutes)
        });
        setClueToast(CLUE_BY_ID[payload.clueFound]?.text ?? payload.clueFound);
        window.setTimeout(() => setClueToast(null), 3600);
      }

      for (const link of payload.knowledgeLinks ?? []) {
        addConversationEvent(`${link.from}:${link.to}`);
        addKnowledgeEdge({
          id: `memory:${link.from}:${link.to}:${link.label}`,
          from: link.from,
          to: link.to,
          label: link.label,
          kind: 'memory'
        });
      }

      return finalText;
    };

    try {
      const res = await fetch('/api/npc/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          npcId: npc.id,
          playerMessage: playerText,
          conversationHistory: history,
          gameTime: formatGameTime(gameTimeMinutes),
          investigationState,
          cluesFound,
          playerLocation,
          presentedClue,
          stream: true
        })
      });

      if (!res.ok || !res.body) throw new Error('chat request failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let spoken = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(SSE_SEPARATOR);
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (payload.type === 'delta' && typeof payload.text === 'string') {
            fullText += payload.text;
            const snapshot = fullText;
            setMessages((prev) => {
              const next = [...prev];
              if (next[replyIndex]) next[replyIndex] = { role: 'npc', text: snapshot };
              return next;
            });
            // The avatar should be talking while the words appear, not after.
            if (fullText.length - spoken.length > 24) {
              spoken = fullText;
              setIsLoading(false);
            }
          } else if (payload.type === 'done') {
            const finalText = applyDone(payload as Parameters<typeof applyDone>[0]);
            void userSpeak(finalText, { npcId: npc.id }).catch(() => {});
          }
        }
      }

      if (!fullText.trim()) throw new Error('empty reply');
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setMessages((prev) => {
        const next = [...prev];
        if (next[replyIndex] && !next[replyIndex].text) {
          next[replyIndex] = { role: 'npc', text: '[CONNECTION ERROR]' };
        }
        return next;
      });
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  /** Puts a piece of established evidence to this character directly. */
  async function handlePresentClue(clueId: string) {
    if (!npc || isLoading) return;
    const clue = CLUE_BY_ID[clueId];
    if (!clue) return;

    setEvidenceOpen(false);
    markCluePresented(npc.id, clueId);
    await handleSend(`I need you to explain something. ${clue.text}`, clueId);
  }

  async function handleMic() {
    if (!voiceFeaturesReady) return;
    if (isListening || isLoading) return;
    setIsListening(true);
    try {
      const heard = await userListen();
      if (heard && heard.trim()) {
        await handleSend(heard.trim());
      }
    } catch {
      // STT optional.
    } finally {
      setIsListening(false);
    }
  }

  function handleClose() {
    // Walking away should stop the reply mid-sentence, not leave it streaming
    // into a panel nobody is looking at.
    abortRef.current?.abort();
    abortRef.current = null;
    if (activeNPC) {
      worldEvents.emit('npc:conversation_end', { npcId: activeNPC });
    }
    setActiveNPC(null);
  }

  if (!npc) return null;

  return (
    <div
      tabIndex={-1}
      onKeyDownCapture={(event) => {
        event.stopPropagation();

        if (event.key === 'Escape') {
          event.preventDefault();
          handleClose();
          return;
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          const target = event.target as HTMLElement | null;
          const isButton = target?.tagName?.toLowerCase() === 'button';
          if (!isButton) {
            event.preventDefault();
            void handleSend();
          }
        }

        if (event.key === 'e' || event.key === 'E') {
          const target = event.target as HTMLElement | null;
          const tag = target?.tagName?.toLowerCase();
          const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';
          if (!isTyping && latestNPCText && !isLoading) {
            event.preventDefault();
            void userSpeak(latestNPCText, { npcId: npc.id }).catch(() => {});
          }
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        color: '#f4f6fb',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif'
      }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: 18,
          right: 22,
          zIndex: 120,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(20,20,28,0.8)',
          color: '#fff',
          fontSize: 22,
          cursor: 'pointer'
        }}
        aria-label="Close conversation"
      >
        ×
      </button>

      {/* Left 55% — VRM viewer */}
      <div style={{ flex: '0 0 55%', position: 'relative' }}>
        <VRMViewer
          key={npc.id}
          npcId={npc.id}
          emotion={currentEmotion}
          speechText={latestNPCText}
          isThinking={isLoading}
        />
      </div>

      {/* Right 45% — conversation panel */}
      <div
        style={{
          flex: '0 0 45%',
          display: 'flex',
          flexDirection: 'column',
          padding: '28px 32px 24px',
          borderLeft: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(10,14,22,0.55)'
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.01em' }}>{npc.name}</div>
          <div style={{ fontSize: 14, opacity: 0.65, marginTop: 4 }}>{npc.role}</div>
        </div>

        {/* Message list */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '8px 4px',
            marginBottom: 14
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: msg.role === 'npc' ? 'flex-start' : 'flex-end',
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: 14,
                background:
                  msg.role === 'npc' ? 'rgba(20,26,40,0.85)' : 'rgba(56,72,110,0.85)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap'
              }}
            >
              {msg.text}
            </div>
          ))}
          {isLoading ? (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '10px 14px',
                borderRadius: 14,
                background: 'rgba(20,26,40,0.6)',
                fontSize: 13,
                opacity: 0.7,
                fontStyle: 'italic'
              }}
            >
              {npc.name.split(' ')[0]} is thinking…
            </div>
          ) : null}
        </div>

        {/* Evidence drawer — putting a fact to someone plays very differently
            from asking about it, so it is its own action. */}
        {cluesFound.length > 0 ? (
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setEvidenceOpen((open) => !open)}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '9px 13px',
                borderRadius: 9,
                border: '1px solid rgba(243,182,64,0.32)',
                background: evidenceOpen ? 'rgba(243,182,64,0.16)' : 'rgba(243,182,64,0.07)',
                color: '#f3b640',
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: '0.03em',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>Present evidence</span>
              <span style={{ opacity: 0.65, fontWeight: 500 }}>
                {cluesFound.length} on file {evidenceOpen ? '▾' : '▸'}
              </span>
            </button>

            {evidenceOpen ? (
              <div style={{ display: 'grid', gap: 6, marginTop: 8, maxHeight: 168, overflowY: 'auto' }}>
                {cluesFound.map((clueId) => {
                  const clue = CLUE_BY_ID[clueId];
                  if (!clue) return null;
                  const alreadyShown = (presentedClues[npc.id] ?? []).includes(clueId);

                  return (
                    <button
                      key={clueId}
                      type="button"
                      disabled={isLoading}
                      onClick={() => void handlePresentClue(clueId)}
                      style={{
                        textAlign: 'left',
                        padding: '9px 11px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)',
                        color: alreadyShown ? 'rgba(244,246,251,0.42)' : '#f4f6fb',
                        fontSize: 12,
                        lineHeight: 1.45,
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {clue.shortLabel}
                      {alreadyShown ? (
                        <span style={{ display: 'block', fontSize: 10, opacity: 0.6, marginTop: 3 }}>
                          already put to {npc.name.split(' ')[0]}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Input row */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            placeholder={isListening ? 'Listening…' : 'Ask anything…'}
            disabled={isLoading || isListening}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(8,12,20,0.8)',
              color: '#f4f6fb',
              fontSize: 14,
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            style={{
              padding: '12px 18px',
              borderRadius: 10,
              border: 'none',
              background: canSend ? '#6c8cff' : 'rgba(120,130,160,0.45)',
              color: '#0b1020',
              fontWeight: 700,
              cursor: canSend ? 'pointer' : 'not-allowed',
              fontSize: 14
            }}
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => void handleMic()}
            disabled={!voiceFeaturesReady || isLoading || isListening}
            title={voiceFeaturesReady ? 'Hold to speak' : 'Mic unavailable until STT/TTS are wired'}
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.22)',
              background: isListening ? '#ff5c6c' : 'rgba(20,26,40,0.8)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: !voiceFeaturesReady || isLoading ? 'not-allowed' : 'pointer',
              opacity: voiceFeaturesReady ? 1 : 0.45
            }}
          >
            {isListening ? '●' : '🎤'}
          </button>
        </form>
      </div>

      {/* Clue toast */}
      {clueToast ? (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 200,
            padding: '24px 36px',
            background: 'rgba(18,6,8,0.96)',
            border: '3px solid #ff3b4f',
            borderRadius: 14,
            color: '#ffe6ea',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.02em',
            textShadow: '0 2px 14px rgba(255,40,60,0.4)',
            boxShadow: '0 24px 60px rgba(255,40,60,0.25)',
            maxWidth: '80vw',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: 14, color: '#ff7788', marginBottom: 8, letterSpacing: '0.18em' }}>
            🔍 CLUE FOUND
          </div>
          <div>{clueToast}</div>
        </div>
      ) : null}
    </div>
  );
}
