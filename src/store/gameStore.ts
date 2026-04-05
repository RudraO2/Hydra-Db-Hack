'use client';

import { create } from 'zustand';
import type { NPCId, RoomId } from '@/data/npcs';

export type NPCPosition = { x: number; y: number; roomId: RoomId };

export type GossipItem = {
  id: string;
  atGameMinute: number;
  speakerA: NPCId;
  speakerB: NPCId;
  turns: string[];
};

export type InvestigationState = {
  npcIdsTalkedTo: NPCId[];
  cluesFound: string[];
};

type ConversationState = {
  open: boolean;
  npcId: NPCId | null;
};

type GameStore = {
  gameMinute: number;
  speed: number;
  npcPositions: Partial<Record<NPCId, NPCPosition>>;
  investigation: InvestigationState;
  conversation: ConversationState;
  gossipFeed: GossipItem[];
  lastEvents: string[];
  setGameMinute: (value: number | ((prev: number) => number)) => void;
  setNpcPosition: (npcId: NPCId, position: NPCPosition) => void;
  openConversation: (npcId: NPCId) => void;
  closeConversation: () => void;
  markTalkedTo: (npcId: NPCId) => void;
  addClue: (clueId: string) => void;
  addGossip: (item: GossipItem) => void;
  appendLastEvent: (event: string) => void;
  appendLastEvents: (events: string[]) => void;
};

export const useGameStore = create<GameStore>((set) => ({
  gameMinute: 9 * 60,
  speed: Number(process.env.NEXT_PUBLIC_GAME_SPEED ?? 3),
  npcPositions: {},
  investigation: { npcIdsTalkedTo: [], cluesFound: [] },
  conversation: { open: false, npcId: null },
  gossipFeed: [],
  lastEvents: [],
  setGameMinute: (value) =>
    set((state) => ({
      gameMinute: typeof value === 'function' ? value(state.gameMinute) : value
    })),
  setNpcPosition: (npcId, position) =>
    set((state) => ({
      npcPositions: {
        ...state.npcPositions,
        [npcId]: position
      }
    })),
  openConversation: (npcId) => set({ conversation: { open: true, npcId } }),
  closeConversation: () => set({ conversation: { open: false, npcId: null } }),
  markTalkedTo: (npcId) =>
    set((state) => ({
      investigation: {
        ...state.investigation,
        npcIdsTalkedTo: state.investigation.npcIdsTalkedTo.includes(npcId)
          ? state.investigation.npcIdsTalkedTo
          : [...state.investigation.npcIdsTalkedTo, npcId]
      }
    })),
  addClue: (clueId) =>
    set((state) => ({
      investigation: {
        ...state.investigation,
        cluesFound: state.investigation.cluesFound.includes(clueId)
          ? state.investigation.cluesFound
          : [...state.investigation.cluesFound, clueId]
      }
    })),
  addGossip: (item) =>
    set((state) => ({
      gossipFeed: [item, ...state.gossipFeed].slice(0, 6)
    })),
  appendLastEvent: (event) =>
    set((state) => ({
      lastEvents: [...state.lastEvents, event].slice(-8)
    })),
  appendLastEvents: (events) =>
    set((state) => ({
      lastEvents: [...state.lastEvents, ...events].slice(-8)
    }))
}));
