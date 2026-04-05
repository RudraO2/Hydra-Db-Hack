export type NPCId = 'kabir' | 'priya' | 'dev' | 'meera' | 'sanjana' | 'rohan';

export type RoomId =
  | 'entrance'
  | 'open_workspace'
  | 'conference_room'
  | 'ceo_office'
  | 'hr_office'
  | 'break_room'
  | 'it_closet'
  | 'accounts_desk'
  | 'bathroom';

export type NPCDefinition = {
  id: NPCId;
  name: string;
  role: string;
  personality: string;
  secret: string;
  knows: string;
  waypoints: RoomId[];
  vrm: string;
  defaultEmotion: 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised';
  canGossip: boolean;
  color: string;
};

export type ScheduleSlot = {
  fromHour: number;
  toHour: number;
  room: RoomId;
  weight: number;
};

export const NPCS: NPCDefinition[] = [
  {
    id: 'kabir',
    name: 'Kabir Malhotra',
    role: 'CEO',
    personality:
      'Grandiose, paranoid, speaks in startup buzzwords, secretly terrified company is failing',
    secret: 'The company is nearly bankrupt, and the USB proves it',
    knows: 'USB was on his desk; he left at 9:05am for exactly 3 minutes',
    waypoints: ['ceo_office', 'break_room'],
    vrm: '/vrm/sample-c.vrm',
    defaultEmotion: 'neutral',
    canGossip: true,
    color: '#f2a65a'
  },
  {
    id: 'priya',
    name: 'Priya Sharma',
    role: 'HR Manager',
    personality: 'Pathologically cheerful, catastrophically nosy, takes notes on everything',
    secret: "Found Sanjana's crumpled resignation letter last week, said nothing",
    knows: 'Sanjana asked HR about whistleblower protections two days ago',
    waypoints: ['hr_office', 'conference_room', 'break_room'],
    vrm: '/vrm/sample-a.vrm',
    defaultEmotion: 'happy',
    canGossip: true,
    color: '#f07178'
  },
  {
    id: 'dev',
    name: 'Dev Malhotra',
    role: 'IT Guy',
    personality:
      'Anxious, jargon-heavy, massive unspoken crush on Priya, completely oblivious about it',
    secret: 'Disabled east wing CCTV at 9:08am because it was glitching',
    knows: "Someone accessed server room logs remotely at 9:06am, but he does not know who",
    waypoints: ['it_closet', 'open_workspace', 'hr_office', 'conference_room', 'break_room'],
    vrm: '/vrm/sample-c.vrm',
    defaultEmotion: 'neutral',
    canGossip: true,
    color: '#5ea1ff'
  },
  {
    id: 'meera',
    name: 'Meera Joshi',
    role: 'Senior Accountant',
    personality: 'Bitter, sharp, says exactly what she thinks, secretly applying for other jobs',
    secret: 'Forwards financial summaries to her personal email for her portfolio',
    knows: `Overheard Sanjana saying "I'll have it by 10am" at 8:50am`,
    waypoints: ['accounts_desk', 'break_room', 'conference_room'],
    vrm: '/vrm/sample-b.vrm',
    defaultEmotion: 'neutral',
    canGossip: true,
    color: '#c1a6ff'
  },
  {
    id: 'sanjana',
    name: 'Sanjana Kapoor',
    role: "CEO's Executive Assistant",
    personality: 'Charming, composed, always has an alibi, deflects brilliantly',
    secret: 'She stole the USB and has a deal with a competitor',
    knows: 'Everything; she planned it',
    waypoints: ['entrance', 'ceo_office', 'conference_room', 'open_workspace'],
    vrm: '/vrm/sample-a.vrm',
    defaultEmotion: 'happy',
    canGossip: false,
    color: '#7ed6a7'
  },
  {
    id: 'rohan',
    name: 'Rohan Mehta',
    role: 'Intern',
    personality:
      'Chaotic, over-eager, accidentally reveals things, and finds all of this hilarious',
    secret: "Used Dev's laptop without asking at 8:45am and saw server logs",
    knows:
      "Saw Sanjana leave Kabir's office at 9:07am with something small and silver, but ignored it",
    waypoints: [
      'entrance',
      'open_workspace',
      'conference_room',
      'ceo_office',
      'hr_office',
      'break_room',
      'it_closet',
      'accounts_desk',
      'bathroom'
    ],
    vrm: '/vrm/sample-c.vrm',
    defaultEmotion: 'happy',
    canGossip: true,
    color: '#ffd166'
  }
];

export const NPC_BY_ID: Record<NPCId, NPCDefinition> = NPCS.reduce(
  (acc, npc) => {
    acc[npc.id] = npc;
    return acc;
  },
  {} as Record<NPCId, NPCDefinition>
);

// fromHour / toHour are 24h game hours (9 = 9:00 AM, 13 = 1:00 PM).
// weight is relative probability — normalised at runtime.
export const NPC_SCHEDULES: Record<NPCId, ScheduleSlot[]> = {
  kabir: [
    { fromHour: 9,  toHour: 13, room: 'ceo_office', weight: 0.9 },
    { fromHour: 9,  toHour: 13, room: 'break_room',  weight: 0.1 },
    { fromHour: 13, toHour: 14, room: 'break_room',  weight: 1.0 },
    { fromHour: 14, toHour: 18, room: 'ceo_office',  weight: 0.9 },
    { fromHour: 14, toHour: 18, room: 'break_room',  weight: 0.1 },
  ],
  priya: [
    { fromHour: 9,  toHour: 12, room: 'hr_office',       weight: 0.7 },
    { fromHour: 9,  toHour: 12, room: 'conference_room',  weight: 0.2 },
    { fromHour: 9,  toHour: 12, room: 'open_workspace',   weight: 0.1 },
    { fromHour: 12, toHour: 13, room: 'break_room',       weight: 0.8 },
    { fromHour: 12, toHour: 13, room: 'hr_office',        weight: 0.2 },
    { fromHour: 13, toHour: 15, room: 'conference_room',  weight: 0.5 },
    { fromHour: 13, toHour: 15, room: 'hr_office',        weight: 0.5 },
    { fromHour: 15, toHour: 18, room: 'hr_office',        weight: 0.7 },
    { fromHour: 15, toHour: 18, room: 'conference_room',  weight: 0.3 },
  ],
  dev: [
    // Social magnetism toward Priya is handled in pickScheduledRoom (~25% of moves)
    { fromHour: 9,  toHour: 12, room: 'it_closet',      weight: 0.65 },
    { fromHour: 9,  toHour: 12, room: 'open_workspace',  weight: 0.25 },
    { fromHour: 9,  toHour: 12, room: 'hr_office',       weight: 0.10 },
    { fromHour: 12, toHour: 13, room: 'break_room',      weight: 0.70 },
    { fromHour: 12, toHour: 13, room: 'it_closet',       weight: 0.30 },
    { fromHour: 13, toHour: 18, room: 'it_closet',       weight: 0.55 },
    { fromHour: 13, toHour: 18, room: 'open_workspace',  weight: 0.30 },
    { fromHour: 13, toHour: 18, room: 'hr_office',       weight: 0.15 },
  ],
  meera: [
    { fromHour: 9,  toHour: 12, room: 'accounts_desk',   weight: 0.85 },
    { fromHour: 9,  toHour: 12, room: 'conference_room',  weight: 0.10 },
    { fromHour: 9,  toHour: 12, room: 'break_room',       weight: 0.05 },
    { fromHour: 12, toHour: 13, room: 'break_room',       weight: 0.80 },
    { fromHour: 12, toHour: 13, room: 'accounts_desk',    weight: 0.20 },
    { fromHour: 13, toHour: 15, room: 'conference_room',  weight: 0.50 },
    { fromHour: 13, toHour: 15, room: 'accounts_desk',    weight: 0.50 },
    { fromHour: 15, toHour: 18, room: 'accounts_desk',    weight: 0.80 },
    { fromHour: 15, toHour: 18, room: 'break_room',       weight: 0.10 },
    { fromHour: 15, toHour: 18, room: 'conference_room',  weight: 0.10 },
  ],
  sanjana: [
    { fromHour: 9,  toHour: 10, room: 'entrance',        weight: 0.4 },
    { fromHour: 9,  toHour: 10, room: 'ceo_office',      weight: 0.4 },
    { fromHour: 9,  toHour: 10, room: 'open_workspace',  weight: 0.2 },
    { fromHour: 10, toHour: 11, room: 'ceo_office',      weight: 0.5 },
    { fromHour: 10, toHour: 11, room: 'conference_room', weight: 0.3 },
    { fromHour: 10, toHour: 11, room: 'entrance',        weight: 0.2 },
    { fromHour: 11, toHour: 14, room: 'open_workspace',  weight: 0.4 },
    { fromHour: 11, toHour: 14, room: 'conference_room', weight: 0.3 },
    { fromHour: 11, toHour: 14, room: 'ceo_office',      weight: 0.2 },
    { fromHour: 11, toHour: 14, room: 'entrance',        weight: 0.1 },
    { fromHour: 14, toHour: 18, room: 'open_workspace',  weight: 0.4 },
    { fromHour: 14, toHour: 18, room: 'entrance',        weight: 0.3 },
    { fromHour: 14, toHour: 18, room: 'conference_room', weight: 0.3 },
  ],
  rohan: [
    // Rohan wanders everywhere — equal-ish weights all day
    { fromHour: 9, toHour: 18, room: 'entrance',        weight: 0.11 },
    { fromHour: 9, toHour: 18, room: 'open_workspace',  weight: 0.17 },
    { fromHour: 9, toHour: 18, room: 'conference_room', weight: 0.11 },
    { fromHour: 9, toHour: 18, room: 'ceo_office',      weight: 0.08 },
    { fromHour: 9, toHour: 18, room: 'hr_office',       weight: 0.11 },
    { fromHour: 9, toHour: 18, room: 'break_room',      weight: 0.17 },
    { fromHour: 9, toHour: 18, room: 'it_closet',       weight: 0.09 },
    { fromHour: 9, toHour: 18, room: 'accounts_desk',   weight: 0.09 },
    { fromHour: 9, toHour: 18, room: 'bathroom',        weight: 0.07 },
  ],
};
