'use client';

import { create } from 'zustand';

export type GossipSession = {
  id: string;
  npc1Id: string;
  npc2Id: string;
  location: string;
  topic: string;
  turns: Array<{ speakerId: string; text: string }>;
  gameTime: string;
};

export type KnowledgeEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: 'player' | 'gossip' | 'memory';
};

type StoreState = {
  activeNPC: string | null;
  setActiveNPC: (id: string | null) => void;
  cluesFound: string[];
  addClue: (id: string) => void;
  gameTimeMinutes: number;
  tickGameTime: () => void;
  playerLocation: string;
  setPlayerLocation: (loc: string) => void;
  npcPositions: Record<string, string>;
  setNPCPosition: (npcId: string, location: string) => void;
  investigationState: number;
  incrementInvestigation: () => void;
  lastGossipSessions: GossipSession[];
  addGossipSession: (s: GossipSession) => void;
  conversationEvents: string[];
  addConversationEvent: (eventKey: string) => void;
  knowledgeEdges: KnowledgeEdge[];
  addKnowledgeEdge: (edge: KnowledgeEdge) => void;
};

const GAME_SPEED = Number(process.env.NEXT_PUBLIC_GAME_SPEED ?? 3);

export const useStore = create<StoreState>((set) => ({
  activeNPC: null,
  setActiveNPC: (id) => set({ activeNPC: id }),
  cluesFound: [],
  addClue: (id) =>
    set((state) => ({
      cluesFound: state.cluesFound.includes(id) ? state.cluesFound : [...state.cluesFound, id]
    })),
  gameTimeMinutes: 540,
  tickGameTime: () =>
    set((state) => ({
      gameTimeMinutes: state.gameTimeMinutes + GAME_SPEED
    })),
  playerLocation: 'Entrance',
  setPlayerLocation: (loc) => set({ playerLocation: loc }),
  npcPositions: {},
  setNPCPosition: (npcId, location) =>
    set((state) => ({
      npcPositions: {
        ...state.npcPositions,
        [npcId]: location
      }
    })),
  investigationState: 0,
  incrementInvestigation: () =>
    set((state) => ({
      investigationState: state.investigationState + 1
    })),
  lastGossipSessions: [],
  addGossipSession: (s) =>
    set((state) => ({
      lastGossipSessions: [s, ...state.lastGossipSessions].slice(0, 10)
    })),
  conversationEvents: [],
  addConversationEvent: (eventKey) =>
    set((state) => ({
      conversationEvents: state.conversationEvents.includes(eventKey)
        ? state.conversationEvents
        : [eventKey, ...state.conversationEvents].slice(0, 30)
    })),
  knowledgeEdges: [],
  addKnowledgeEdge: (edge) =>
    set((state) => ({
      knowledgeEdges: state.knowledgeEdges.some((item) => item.id === edge.id)
        ? state.knowledgeEdges
        : [edge, ...state.knowledgeEdges].slice(0, 40)
    }))
}));
