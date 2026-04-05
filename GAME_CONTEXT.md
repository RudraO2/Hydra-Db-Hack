# GAME CONTEXT — Office Drama: The Stolen Drive
## Attach this to Codex at the start of EVERY session

---

## ONE-PARAGRAPH SUMMARY

A 2D top-down browser game. Six NPCs move autonomously around an office using Phaser 3 (assets from generative_agents repo). When the player walks near an NPC and presses E, a full-screen 3D conversation opens showing a VRM character with lip-sync and emotion expressions (components from Amica repo). NPCs also gossip with each other automatically — these exchanges are written into HydraDB hive memory, so knowledge spreads between NPCs without player involvement. The player investigates who stole the Golden USB drive. HydraDB is the ONLY memory system — no JSON files, no localStorage for NPC state.

---

## WHAT WE TAKE FROM EACH REPO (specific files only — not full clones)

### From generative_agents (joonspk-research)
Sparse checkout — only: environment/frontend_server/static/
We use:
- Tile sprite sheets and tileset images → copy to public/assets/tiles/
- NPC character sprite sheets → copy to public/assets/sprites/
- Map JSON file → copy to public/assets/maps/ (retheme room labels only)
- Phaser scene boilerplate from their JS → read and adapt into TypeScript

### From amica (semperai)
Sparse checkout — only: src/lib/ and src/components/
We use:
- src/components/vrmViewer.tsx → src/components/VRMViewer.tsx
- src/lib/VRMAnimation.ts → src/lib/VRMAnimation.ts
- src/lib/EmoteController.ts → src/lib/EmoteController.ts

Everything else (TTS, STT, chat backend, config) — user handles separately. Leave clear stubs.

### DialogLab — NOT USED. Do not reference it anywhere.

---

## TECH STACK

Framework:    Next.js 14 (App Router)
2D Engine:    Phaser 3 (dynamic import, ssr: false)
3D/VRM:       Three.js + @pixiv/three-vrm (from Amica)
Memory:       HydraDB — @hydra_db/node (server-side only, never client)
LLM:          USER_PROVIDES — stub only
TTS:          USER_PROVIDES — stub only
STT:          USER_PROVIDES — stub only
State:        Zustand

Stub pattern for user-provided services in src/lib/userServices.ts:

  export async function callLLM(system: string, messages: Message[]): Promise<string> {
    throw new Error('USER_PROVIDES: wire your LLM here')
  }
  export async function speak(text: string, config: object): Promise<void> {
    throw new Error('USER_PROVIDES: wire your TTS here')
  }
  export async function listen(): Promise<string> {
    throw new Error('USER_PROVIDES: wire your STT here')
  }

---

## PROJECT STRUCTURE

office-drama/
├── public/
│   ├── assets/tiles/       ← from generative_agents
│   ├── assets/sprites/     ← from generative_agents
│   ├── assets/maps/        ← from generative_agents (rethemed)
│   └── vrm/                ← user downloads 6 VRM files from hub.vroid.com
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   └── api/
│   │       ├── npc/chat/route.ts
│   │       ├── npc/gossip/route.ts
│   │       └── world/event/route.ts
│   ├── components/
│   │   ├── VRMViewer.tsx         ← adapted from amica
│   │   ├── ConversationView.tsx
│   │   ├── GossipTicker.tsx
│   │   └── HUD.tsx
│   ├── game/
│   │   ├── OfficeScene.ts
│   │   └── PlayerEntity.ts
│   └── lib/
│       ├── hydradb.ts
│       ├── VRMAnimation.ts       ← adapted from amica
│       ├── EmoteController.ts    ← adapted from amica
│       ├── npcBrain.ts
│       ├── gossipEngine.ts
│       └── userServices.ts       ← stubs only, user fills in
│   └── data/
│       ├── npcs.ts
│       └── mystery.ts

---

## THE OFFICE — MOMENTUM CORP

Map rooms (retheme generative_agents tilemap labels):
  [ Entrance ]     [ Open Workspace ]  [ Conference Room ]
  [ CEO Office ]   [ HR Office ]       [ Break Room      ]
  [ IT Closet ]    [ Accounts Desk ]   [ Bathroom        ]

Game clock: 1 real second = 1 in-game minute. Starts 9:00 AM.
Theft happened at 9:07 AM. Game ends at 6:00 PM (540 real seconds at speed 1).
Set NEXT_PUBLIC_GAME_SPEED=3 for demo (180 real seconds total).

---

## THE 6 NPCs — define in src/data/npcs.ts

id: kabir
Name: Kabir Malhotra | Role: CEO
Personality: Grandiose, paranoid, speaks in startup buzzwords, secretly terrified company is failing
Secret: The company is nearly bankrupt — the USB proves it
Knows: USB was on his desk; he left at 9:05am for exactly 3 minutes
Waypoints: CEO Office (90% of time), Break Room (1pm only)
VRM: kabir.vrm | defaultEmotion: neutral

id: priya
Name: Priya Sharma | Role: HR Manager
Personality: Pathologically cheerful, catastrophically nosy, takes notes on everything
Secret: Found Sanjana's crumpled resignation letter last week, said nothing
Knows: Sanjana asked HR about "whistleblower protections" two days ago
Waypoints: HR Office, Conference Room, Break Room
VRM: priya.vrm | defaultEmotion: happy

id: dev
Name: Dev Malhotra | Role: IT Guy
Personality: Anxious, jargon-heavy, massive unspoken crush on Priya, completely oblivious about it
Secret: He disabled the east wing CCTV at 9:08am — it was "glitching." Doesn't know a theft was happening.
Knows: Someone accessed server room logs remotely at 9:06am. Doesn't know who.
Waypoints: IT Closet, Open Workspace, wherever Priya is
VRM: dev.vrm | defaultEmotion: neutral

id: meera
Name: Meera Joshi | Role: Senior Accountant
Personality: Bitter, sharp, says exactly what she thinks, secretly applying for other jobs
Secret: She forwards financial summaries to her personal email "for her portfolio" — also illegal
Knows: Overheard Sanjana on phone: "I'll have it by 10am" at 8:50am
Waypoints: Accounts Desk, Break Room, Conference Room
VRM: meera.vrm | defaultEmotion: neutral

id: sanjana
Name: Sanjana Kapoor | Role: CEO's Executive Assistant
Personality: Charming, composed, always has an alibi, deflects brilliantly
Secret: SHE STOLE THE USB. She has a deal with a competitor.
Knows: Everything. She planned it.
Waypoints: Entrance, CEO Office, Conference Room, Open Workspace
VRM: sanjana.vrm | defaultEmotion: happy
Special: NEVER participates in gossip exchanges. Always deflects.

id: rohan
Name: Rohan Mehta | Role: Intern
Personality: Chaotic, over-eager, accidentally reveals things, finds all of this hilarious
Secret: Used Dev's laptop without asking at 8:45am and saw the server logs
Knows: Saw Sanjana leave Kabir's office at 9:07am with "something small and silver" — thought nothing of it
Waypoints: All rooms — he wanders everywhere every few minutes
VRM: rohan.vrm | defaultEmotion: happy

---

## THE MYSTERY — define in src/data/mystery.ts

CULPRIT: sanjana

Timeline:
  8:50am — Sanjana calls competitor: "I'll have it by 10am"
  9:05am — Kabir leaves office for bathroom (3 min)
  9:06am — Sanjana accesses server remotely from Kabir's computer (plants false trail)
  9:07am — Sanjana takes USB from Kabir's desk. Rohan sees her exit, notices nothing odd.
  9:08am — Dev disables east wing CCTV (coincidental, but it covers her exit path)
  9:10am — Sanjana back at reception, acting normal

The 5 Clues:
  clue_1: "The east wing CCTV was disabled at exactly 9:08am"
           revealedBy: dev | triggerKeywords: cctv, camera, security, footage, recording

  clue_2: "Someone accessed the server room remotely at 9:06am — from the CEO's terminal"
           revealedBy: dev | triggerKeywords: server, logs, access, computer, remote, network

  clue_3: "Sanjana was overheard saying 'I'll have it by 10am' on a call at 8:50am"
           revealedBy: meera | triggerKeywords: sanjana, phone, call, morning, early, heard

  clue_4: "Someone left Kabir's office at 9:07am carrying something small and silver"
           revealedBy: rohan | triggerKeywords: kabir, office, morning, saw, silver, usb, carrying

  clue_5: "Sanjana asked HR about whistleblower protections two days ago"
           revealedBy: priya | triggerKeywords: sanjana, legal, hr, protection, rights, policy, whistleblower

---

## HYDRADB SCHEMA

Tenant: momentum-corp-office

Hive memory (shared, all NPCs read from this):
  Use for: player actions, gossip exchanges, world events
  ingest: infer: true for live events | infer: false for backstory
  Fields: { description, location, entities: string[], gameTime, isClue?, clueId? }

Personal memory (per NPC, sub-tenant = npcId):
  Use for: what this specific NPC experienced or was told
  ingest: infer: true always
  Fields: { content, gameTime }

Recall params for all queries:
  recency_bias: 0.7
  alpha: 0.6

Pre-seeded backstory (8 events, ingest at game start with infer: false):
  1. "The Golden USB drive was last seen on Kabir's desk at 9:00am"
  2. "Kabir left his office at 9:05am to use the bathroom, returning at 9:08am"
  3. "Rohan observed someone leaving Kabir's office at 9:07am"
  4. "Dev disabled the east wing CCTV camera at 9:08am citing a technical glitch"
  5. "The server room was accessed remotely at 9:06am from Kabir's terminal"
  6. "Sanjana made a phone call at 8:50am and was overheard by Meera near the break room"
  7. "Priya discovered unusual paperwork in Sanjana's belongings last week"
  8. "Rohan used Dev's laptop at 8:45am and observed the server access logs"

Each event also ingested to the relevant NPC's personal sub-tenant memory.
Guard with a seeded flag in hive memory to prevent re-seeding on refresh.

---

## BEHAVIORAL CHANGES (based on investigation_state stored in HydraDB)

Track number of NPCs talked to and clues found. Fetch this state before each NPC chat.
Inject into system prompt as additional instructions:

  investigation_state >= 3 AND npcId == sanjana:
    "You are growing nervous. You are extra charming. You subtly mention that Rohan was acting strange this morning."

  investigation_state >= 3 AND npcId == rohan:
    "You feel like you know something important but you are scared to say it directly."

  clue_1 OR clue_2 found AND npcId == dev:
    "You are nervous. You realize the CCTV timing might look bad for you. Keep answers short."

  clue_3 found AND npcId == sanjana:
    "Someone knows about your phone call. You are deflecting. One-word answers where possible."

  clue_4 found AND npcId == sanjana:
    "You are ice cold. You want this conversation to end immediately."

  all 5 clues found AND npcId == sanjana:
    "You are looking for an exit. Every response ends with you mentioning you need to leave."

Also emit Phaser events for physical behavior changes:
  - sanjana moves toward Entrance when all 5 clues found
  - dev increases distance from player when clue_1/2 found (avoid proximity)

---

## GOSSIP ENGINE RULES

Every 45 real seconds:
  1. Find 2 NPCs in the same room (from Phaser position state in Zustand)
  2. Skip if either is Sanjana (she never gossips)
  3. Run 3-turn exchange using callLLM() stub
  4. Ingest full exchange to both NPC personal memories AND hive memory
  5. Display in GossipTicker overlay (bottom-right corner, non-blocking)

Turn structure:
  Turn 1 — NPC1 shares something from their HydraDB personal recall
  Turn 2 — NPC2 reacts, adds something from their own recall
  Turn 3 — NPC1 closes or reveals something new

Gossip styles:
  priya: always gossips, dramatic, adds her own spin
  meera: only if it damages someone she dislikes
  rohan: gossips with anyone, about anything, enthusiastically
  dev: accidentally reveals things while talking about something technical
  kabir: rarely in same room as others; if so, monologues about the company vision instead

---

## ENVIRONMENT VARIABLES

HYDRADB_API_KEY=
NEXT_PUBLIC_GAME_SPEED=3
NEXT_PUBLIC_GOSSIP_INTERVAL_MS=45000
NEXT_PUBLIC_WORLD_TICK_MS=30000

No LLM / TTS / STT keys. User manages those inside userServices.ts.
