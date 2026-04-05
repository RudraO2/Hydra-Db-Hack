# Office Drama - The Stolen Drive

Live: https://officedrama1.netlify.app/game

HydraDB-powered NPC investigation game built with Next.js 14 (App Router), Phaser 3, and VRM rendering.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill `HYDRADB_API_KEY`.
3. Install dependencies:
   - `npm install`
4. Start:
   - `npm run dev`

## Required Constraints (Implemented)

- HydraDB client is server-only (`src/lib/hydradb.ts`).
- All API routes use `export async function POST(req: Request)`.
- Phaser is loaded with dynamic import and `ssr: false` in `src/components/GameClient.tsx`.
- NPC memory uses HydraDB only (no localStorage, no JSON memory stores).
- LLM/TTS/STT remain stubs in `src/lib/userServices.ts`.

## Repo Asset Intake (No Full Clone)

Use sparse checkout or direct download only. See `SETUP_ASSETS.md`.

## Project Structure

Core files:

- `src/app/page.tsx`
- `src/app/api/npc/chat/route.ts`
- `src/app/api/npc/gossip/route.ts`
- `src/app/api/world/event/route.ts`
- `src/components/GameClient.tsx`
- `src/components/ConversationView.tsx`
- `src/components/VRMViewer.tsx`
- `src/game/OfficeScene.ts`
- `src/lib/hydradb.ts`
- `src/lib/npcBrain.ts`
- `src/lib/gossipEngine.ts`
- `src/data/npcs.ts`
- `src/data/mystery.ts`
