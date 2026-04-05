import type { NPCId } from './npcs';

export type Clue = {
  id: string;
  text: string;
  revealedBy: NPCId;
  triggerKeywords: string[];
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
    revealedBy: 'dev',
    triggerKeywords: ['cctv', 'camera', 'security', 'footage', 'recording']
  },
  {
    id: 'clue_2',
    text: "Someone accessed the server room remotely at 9:06am from the CEO's terminal",
    revealedBy: 'dev',
    triggerKeywords: ['server', 'logs', 'access', 'computer', 'remote', 'network']
  },
  {
    id: 'clue_3',
    text: `Sanjana was overheard saying "I'll have it by 10am" on a call at 8:50am`,
    revealedBy: 'meera',
    triggerKeywords: ['sanjana', 'phone', 'call', 'morning', 'early', 'heard']
  },
  {
    id: 'clue_4',
    text: "Someone left Kabir's office at 9:07am carrying something small and silver",
    revealedBy: 'rohan',
    triggerKeywords: ['kabir', 'office', 'morning', 'saw', 'silver', 'usb', 'carrying']
  },
  {
    id: 'clue_5',
    text: 'Sanjana asked HR about whistleblower protections two days ago',
    revealedBy: 'priya',
    triggerKeywords: ['sanjana', 'legal', 'hr', 'protection', 'rights', 'policy', 'whistleblower']
  }
];

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
