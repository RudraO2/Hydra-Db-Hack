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
- **Walk up and talk.** It is a 2D open world. Get close to someone, press **E**, and their VRM character rises into a conversation view. You can talk to them, like a call, or type. Replies stream in as they are generated, so people start answering rather than making you wait.
- **Present evidence.** Once something is established, you can put it to someone directly instead of only asking about it. The same fact lands very differently depending on who you show it to — the person it implicates gets defensive, the person who took the drive gets charming.
- **A voiced cold open.** The theft plays out before you get there, narrated and performed by a cast of distinct Gemini TTS voices. The camera, subtitles and cuts are timed against the real audio, not guessed delays.
- **A case you can close.** Build a timeline, name a suspect, and cite the evidence you are standing on. A name without a timeline behind it is just an opinion, and she walks. Three endings, each with its own voiced epilogue.

## Built with

Next.js 14 (App Router), Phaser 3 for the 2D world, Three.js with `@pixiv/three-vrm` for the character avatars, and HydraDB as the shared memory store. NPC chat, gossip, and world events run through server API routes so the database stays server-side. Dialogue runs on Groq (`openai/gpt-oss-20b`) with Gemini as a fallback; the cutscene voices are Gemini TTS, baked to MP3 ahead of time.

Notable pieces: `gossipEngine.ts` (how rumors spread), `npcBrain.ts` (how a character decides and remembers), `OfficeScene.ts` (the world), `CutsceneScene.ts` (the voiced cold open), `CaseFile.tsx` (evidence and accusation), and `VRMViewer.tsx` / `ConversationView.tsx` (walking up and talking).

## Run it

```sh
cp .env.example .env.local   # then fill HYDRADB_API_KEY and GROQ_API_KEY
npm install
npm run dev
```

The cutscene audio is committed, so there is nothing to generate to play it.

## Scripts

```sh
# Re-record the cutscene voice track (needs GEMINI_API_KEY; resumable, skips existing clips)
node scripts/generate-cutscene-audio.mjs

# Re-encode the VRM avatars' textures to WebP (needs ffmpeg). 75 MB -> 22 MB.
node scripts/optimize-vrm.mjs
node scripts/verify-vrm.mjs
```

## Notes on performance

A few things were making it feel heavier than it was, and are worth writing down:

- Every HydraDB read and write called `tenant.create` first, which doubled the round trips on every operation. It is created once per process now.
- The chat route ran five-plus recalls sequentially before calling the model, then waited on three writes before answering. Reads now go out in parallel with individual timeouts, and persistence happens after the reply is already on its way.
- The gossip interval listed the game clock in its dependencies, so it was torn down and rebuilt every second and never survived long enough to fire. Gossip did not actually run.
- The avatars were 75 MB of mostly uncompressed PNG. Now 22 MB, cached, and prefetched during idle time.
- The tilemap built seven invisible bookkeeping layers, 14,000 tiles each, in both scenes.

## The backstory

I built this in a 24-hour HydraDB hackathon. Two of the winners were thin wrappers over existing models, a virtual clothes try-on on top of Gemini's image editing, and a "vibe coder" that emitted HTML. Office Drama was real systems work: a persistent social world where knowledge actually moves between agents. It took an honorable mention. The lesson I took from it was not about the tech, it was that I need to present the work as well as I build it. That is what this repo is for.
