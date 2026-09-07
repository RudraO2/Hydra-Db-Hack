import type { NPCId } from './npcs';

export type Clue = {
  id: string;
  text: string;
  revealedBy: NPCId;
  /** Words that make this clue worth checking for in a reply. */
  triggerKeywords: string[];
  /**
   * The clue only counts as revealed when the reply actually contains the
   * substance - a timestamp, a place, the object itself. Keyword matching alone
   * fired on words as generic as "office" and "morning", so almost any line
   * from the right character used to unlock a clue the character never gave.
   */
  confirm: RegExp;
  /** Shown in the journal as the thing the player can actually use. */
  shortLabel: string;
  /** Whether citing this clue helps prove the case against the culprit. */
  provesCulprit: boolean;
};

export const CULPRIT: NPCId = 'sanjana';

export const TIMELINE: string[] = [
  `8:50am - Sanjana calls competitor: "I'll have it by 10am"`,
  '9:05am - Kabir leaves office for bathroom (3 min)',
  "9:06am - Sanjana accesses server remotely from Kabir's computer",
  "9:07am - Sanjana takes USB from Kabir's desk. Rohan sees her leave.",
  '9:08am - Dev disables east wing CCTV (coincidental)',
  '9:10am - Sanjana back at reception acting normal'
];

export const CLUES: Clue[] = [
  {
    id: 'clue_1',
    text: 'The east wing CCTV was disabled at exactly 9:08am',
    shortLabel: 'East wing camera went dark at 9:08',
    revealedBy: 'dev',
    triggerKeywords: ['cctv', 'camera', 'security', 'footage', 'recording'],
    // Needs the camera AND either the time or the wing - not just the word "camera".
    confirm: /(cctv|camera|footage)[\s\S]{0,90}(9[:.\s]?0?8|east\s*wing)|(9[:.\s]?0?8|east\s*wing)[\s\S]{0,90}(cctv|camera|footage)/i,
    provesCulprit: false
  },
  {
    id: 'clue_2',
    text: "Someone accessed the server room remotely at 9:06am from the CEO's terminal",
    shortLabel: "Server hit remotely at 9:06 from Kabir's terminal",
    revealedBy: 'dev',
    triggerKeywords: ['server', 'logs', 'access', 'computer', 'remote', 'network', 'terminal'],
    confirm: /(server|log|terminal)[\s\S]{0,90}(9[:.\s]?0?6|remote)|(9[:.\s]?0?6|remotely)[\s\S]{0,90}(server|log|terminal)/i,
    provesCulprit: true
  },
  {
    id: 'clue_3',
    text: `Sanjana was overheard saying "I'll have it by 10am" on a call at 8:50am`,
    shortLabel: 'Sanjana on a call at 8:50: "I\'ll have it by 10"',
    revealedBy: 'meera',
    triggerKeywords: ['sanjana', 'phone', 'call', 'overheard', 'heard'],
    confirm: /(8[:.\s]?50|by\s*ten|by\s*10)|(\bcall\b|\bphone\b)[\s\S]{0,80}sanjana|sanjana[\s\S]{0,80}(\bcall\b|\bphone\b)/i,
    provesCulprit: true
  },
  {
    id: 'clue_4',
    text: "Someone left Kabir's office at 9:07am carrying something small and silver",
    shortLabel: "Someone left Kabir's office at 9:07 with something silver",
    revealedBy: 'rohan',
    triggerKeywords: ['silver', 'carrying', 'usb', 'drive', 'office'],
    confirm: /silver|9[:.\s]?0?7|(usb|drive)[\s\S]{0,60}(carr|holding|pocket)/i,
    provesCulprit: true
  },
  {
    id: 'clue_5',
    text: 'Sanjana asked HR about whistleblower protections two days ago',
    shortLabel: 'Sanjana asked HR about whistleblower protection',
    revealedBy: 'priya',
    triggerKeywords: ['sanjana', 'whistleblower', 'protection', 'resign', 'legal'],
    confirm: /whistle\s*-?\s*blow|protection|resign|legal\s*(cover|advice|protection)/i,
    provesCulprit: false
  }
];

/**
 * Threads that lead somewhere real but not to the culprit. They exist so that
 * naming a suspect is a judgement call rather than a formality - Dev really did
 * kill the camera, and Meera really is leaking financials.
 */
export const RED_HERRINGS: Array<{ npcId: NPCId; label: string }> = [
  { npcId: 'dev', label: 'Dev disabled the camera that covered the exit route' },
  { npcId: 'meera', label: 'Meera forwards company financials to a personal address' },
  { npcId: 'priya', label: "Priya has been sitting on Sanjana's resignation letter" },
  { npcId: 'kabir', label: 'Kabir needs the numbers to stay buried more than anyone' }
];

/** Citing this many culprit-proving clues is enough to make an accusation stick. */
export const EVIDENCE_TO_CONVICT = 3;

export const BACKSTORY_EVENTS: Array<{ text: string; entities: NPCId[] }> = [
  {
    text: "The Golden USB drive was last seen on Kabir's desk at 9:00am",
    entities: ['kabir']
  },
  {
    text: 'Kabir left his office at 9:05am to use the bathroom, returning at 9:08am',
    entities: ['kabir']
  },
  {
    text: "Rohan observed someone leaving Kabir's office at 9:07am",
    entities: ['rohan', 'kabir']
  },
  {
    text: 'Dev disabled the east wing CCTV camera at 9:08am citing a technical glitch',
    entities: ['dev']
  },
  {
    text: "The server room was accessed remotely at 9:06am from Kabir's terminal",
    entities: ['dev', 'kabir']
  },
  {
    text: 'Sanjana made a phone call at 8:50am and was overheard by Meera near the break room',
    entities: ['sanjana', 'meera']
  },
  {
    text: "Priya discovered unusual paperwork in Sanjana's belongings last week",
    entities: ['priya', 'sanjana']
  },
  {
    text: "Rohan used Dev's laptop at 8:45am and observed the server access logs",
    entities: ['rohan', 'dev']
  }
];

export const CLUE_BY_ID = Object.fromEntries(CLUES.map((clue) => [clue.id, clue])) as Record<
  string,
  Clue
>;
