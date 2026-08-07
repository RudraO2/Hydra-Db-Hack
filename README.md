# Office Drama

> An open-world 2D office where every character is actually alive. They keep routines, they gossip, and they remember. Talk to the wrong person the wrong way in the morning and by evening their friend already knows. Your job: find the CEO's lost golden pen drive and the person who took it.

**[▶ Play it live](https://officedrama1.netlify.app/game)**

<!-- DEMO: drop a screen recording or GIF here later. Best shots: walking the office, pressing E to bring up a character's VRM and talking to them, and a rumor spreading between two NPCs. Export a short GIF and paste it right under this line. -->

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Phaser](https://img.shields.io/badge/Phaser_3-8A2BE2?style=for-the-badge&logo=phaser&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js_+_VRM-000000?style=for-the-badge&logo=threedotjs&logoColor=white)
![Hackathon](https://img.shields.io/badge/Built_in_24h-F03C02?style=for-the-badge)

## The idea

Most game NPCs are puppets. They say their one line and forget you the moment you walk away. I wanted the opposite: a little society that runs on its own.

Every character in Office Drama lives on a single shared database. They have their own routines and move through the day. When two of them meet, they talk, and what they say sticks. So the world has a memory. If you were rude to someone at 9am, and they run into a friend at 6pm, that friend now knows. Reputations form. Rumors travel. The office reacts to you.

You play a detective. The CEO's golden pen drive is gone, and you have to work the room, talk to people, follow what they know about each other, and figure out who took it.

## What makes it tick

- **One shared brain.** Every NPC's memory lives in one database (HydraDB), not in scattered local state. That is what lets knowledge move between characters instead of staying trapped in one.
- **A gossip engine.** When characters meet, a gossip pass spreads what they know to each other, so information propagates through the social graph over the course of a day.
- **Walk up and talk.** It is a 2D open world. Get close to someone, press **E**, and their VRM character rises into a conversation view. You can talk to them, like a call, or type.
- **A real mystery.** The stolen-drive case is authored with suspects and threads you uncover by talking to the right people in the right order.

## Built with

Next.js 14 (App Router), Phaser 3 for the 2D world, Three.js with `@pixiv/three-vrm` for the character avatars, and HydraDB as the shared memory store. NPC chat, gossip, and world events run through server API routes so the database stays server-side.

Notable pieces: `gossipEngine.ts` (how rumors spread), `npcBrain.ts` (how a character decides and remembers), `OfficeScene.ts` (the world), and `VRMViewer.tsx` / `ConversationView.tsx` (walking up and talking).

## Run it

```sh
cp .env.example .env.local   # then fill HYDRADB_API_KEY
npm install
npm run dev
```

## The backstory

I built this in a 24-hour HydraDB hackathon. Two of the winners were thin wrappers over existing models, a virtual clothes try-on on top of Gemini's image editing, and a "vibe coder" that emitted HTML. Office Drama was real systems work: a persistent social world where knowledge actually moves between agents. It took an honorable mention. The lesson I took from it was not about the tech, it was that I need to present the work as well as I build it. That is what this repo is for.
