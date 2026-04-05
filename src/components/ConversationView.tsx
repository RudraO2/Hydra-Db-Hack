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
  const [speakTrigger, setSpeakTrigger] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function handleSend(textOverride?: string) {
    if (!npc) return;
    const playerText = (textOverride ?? draft).trim();
    if (!playerText) return;

    const history = [...messages, { role: 'player' as const, text: playerText }];
    setMessages(history);
    setDraft('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/npc/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          npcId: npc.id,
          playerMessage: playerText,
          conversationHistory: history,
          gameTime: formatGameTime(gameTimeMinutes),
          investigationState,
          cluesFound,
          playerLocation
        })
      });

      const payload = await res.json().catch(() => ({}));
      const npcText: string = payload?.npcText ?? '[CONNECTION ERROR]';
      const emotion: Emotion = (payload?.emotion as Emotion) ?? 'neutral';
      const clueFound: string | null = payload?.clueFound ?? null;
      const knowledgeLinks: Array<{ from: string; to: string; label: string }> = Array.isArray(payload?.knowledgeLinks)
        ? payload.knowledgeLinks
        : [];

      setMessages((prev) => [...prev, { role: 'npc', text: npcText }]);
      setCurrentEmotion(emotion);

      if (clueFound) {
        addClue(clueFound);
        const clueText = CLUE_BY_ID[clueFound]?.text ?? clueFound;
        setClueToast(clueText);
        window.setTimeout(() => setClueToast(null), 3000);
      }

      for (const link of knowledgeLinks) {
        addConversationEvent(`${link.from}:${link.to}`);
        addKnowledgeEdge({
          id: `memory:${link.from}:${link.to}:${link.label}`,
          from: link.from,
          to: link.to,
          label: link.label,
          kind: 'memory'
        });
      }

      if (knowledgeLinks.length > 0) {
        console.log('[Hydra Flow] Memory chain surfaced in NPC chat', {
          npcId: npc.id,
          knowledgeLinks
        });
      }

      try {
        await userSpeak(npcText, {
          npcId: npc.id,
          onPlayStart: () => setSpeakTrigger((t) => t + 1),
        });
      } catch {
        // TTS is optional — still animate lips as a fallback.
        setSpeakTrigger((t) => t + 1);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'npc', text: '[CONNECTION ERROR]' }
      ]);
    } finally {
      setIsLoading(false);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
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
            void userSpeak(latestNPCText, {
            npcId: npc.id,
            onPlayStart: () => setSpeakTrigger((t) => t + 1),
          }).catch(() => { setSpeakTrigger((t) => t + 1); });
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
          speakTrigger={speakTrigger}
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
