import type { NPCId } from './npcs';

/**
 * Every spoken line in the game's cutscenes.
 *
 * Audio is generated ahead of time by scripts/generate-cutscene-audio.mjs using
 * Gemini TTS, one file per line, into public/audio/cutscene/. Generating at
 * build time rather than at runtime means the opening plays instantly, costs
 * nothing per playthrough, and needs no API key in production.
 *
 * `direction` is the performance note handed to the TTS model. `text` is what
 * is actually spoken and what appears as the subtitle.
 */

export type Speaker = NPCId | 'narrator';

export type CutsceneLine = {
  /** Stable id - also the audio filename, so changing it regenerates the clip. */
  id: string;
  speaker: Speaker;
  direction: string;
  text: string;
};

/** Gemini prebuilt voice per speaker. Chosen so no two characters in a scene collide. */
export const SPEAKER_VOICE: Record<Speaker, string> = {
  narrator: 'Rasalgethi', // measured, documentary
  kabir: 'Charon',        // deep, self-important
  sanjana: 'Despina',     // smooth, composed
  priya: 'Aoede',         // bright, chatty
  meera: 'Kore',          // firm, cutting
  dev: 'Enceladus',       // breathy, anxious
  rohan: 'Puck'           // young, over-eager
};

// ─── Opening ─────────────────────────────────────────────────────────────────
// A cold open: the theft happens on screen, but only the player sees it whole.
// Every character witnesses one fragment, which is exactly what they will and
// will not be able to tell you later.

export const OPENING_LINES: CutsceneLine[] = [
  {
    id: 'open_01_narrator',
    speaker: 'narrator',
    direction: 'Read this like the cold open of a crime documentary: measured, quiet, faintly grim',
    text: 'Momentum Corp has ninety-one days of money left. Four people know that. By ten past nine this morning, one of them will have sold it.'
  },
  {
    id: 'open_02_sanjana',
    speaker: 'sanjana',
    direction: 'Speak in a low, careful voice, like someone on a phone call they do not want overheard',
    text: "Relax. I'll have it by ten. He never locks the drawer."
  },
  {
    id: 'open_03_kabir',
    speaker: 'kabir',
    direction: 'Speak with grand, self-important confidence, savouring every word',
    text: 'Series B. Every projection, every runway model, on one drive. This little thing is the entire company.'
  },
  {
    id: 'open_04_kabir',
    speaker: 'kabir',
    direction: 'Say this briskly and dismissively, already walking away',
    text: 'Three minutes. Nobody touches my desk.'
  },
  {
    id: 'open_05_sanjana',
    speaker: 'sanjana',
    direction: 'Say this quietly to yourself, calm and certain',
    text: 'Go time.'
  },
  {
    id: 'open_06_sanjana',
    speaker: 'sanjana',
    direction: 'Almost a whisper, pleased and very controlled',
    text: 'Nine oh seven. Right on schedule.'
  },
  {
    id: 'open_07_rohan',
    speaker: 'rohan',
    direction: 'Cheerful and completely oblivious, thinking out loud and then shrugging it off',
    text: 'Huh. Was she always carrying something silver? Eh. None of my business.'
  },
  {
    id: 'open_08_dev',
    speaker: 'dev',
    direction: 'Anxious and muttering, talking yourself into an easy explanation',
    text: "East wing camera just dropped. Probably the switch again. I'll log it as a glitch."
  },
  {
    id: 'open_09_meera',
    speaker: 'meera',
    direction: 'Dry, sharp and suspicious, mostly to yourself',
    text: "Eight fifty in the morning. I'll have it by ten, she said. To someone who does not work in this building."
  },
  {
    id: 'open_10_narrator',
    speaker: 'narrator',
    direction: 'Close the cold open: slow, deliberate, land the last sentence hard',
    text: 'By ten past nine the drive was gone, the camera was blind, and everybody had a story. You have until six to work out which one is a lie.'
  }
];

// ─── Endings ─────────────────────────────────────────────────────────────────

export type EndingId = 'caught' | 'escaped' | 'wrong';

export type Ending = {
  id: EndingId;
  title: string;
  subtitle: string;
  /** Amber for a win, red for a loss - drives the ending card treatment. */
  tone: 'win' | 'loss';
  lines: CutsceneLine[];
};

export const ENDINGS: Record<EndingId, Ending> = {
  // Named the culprit and brought enough evidence to make it stick.
  caught: {
    id: 'caught',
    title: 'CASE CLOSED',
    subtitle: 'Sanjana Kapoor, 6:00 PM',
    tone: 'win',
    lines: [
      {
        id: 'end_caught_01_sanjana',
        speaker: 'sanjana',
        direction: 'Start smooth and amused, then let the composure crack halfway through',
        text: "That's a very confident theory. You have the camera, the call, the timing... fine. Fine. He was going to lose it all anyway. I just found a buyer first."
      },
      {
        id: 'end_caught_02_narrator',
        speaker: 'narrator',
        direction: 'Calm, final, a little cold',
        text: 'She was walked out at four minutes past six, still holding her coffee. The drive was in her coat pocket the entire day.'
      }
    ]
  },

  // Right suspect, not enough to hold her.
  escaped: {
    id: 'escaped',
    title: 'SHE WALKS',
    subtitle: 'Insufficient evidence',
    tone: 'loss',
    lines: [
      {
        id: 'end_escaped_01_sanjana',
        speaker: 'sanjana',
        direction: 'Sweet, unbothered, quietly triumphant',
        text: "You think it was me. That's flattering. But thinking isn't the same as knowing, and you don't have a single thing that puts my hand on that desk."
      },
      {
        id: 'end_escaped_02_narrator',
        speaker: 'narrator',
        direction: 'Flat and regretful',
        text: 'She was right. Without the timeline, it was a story. She resigned on Thursday and started at a competitor the following Monday.'
      }
    ]
  },

  // Named the wrong person entirely.
  wrong: {
    id: 'wrong',
    title: 'WRONG CALL',
    subtitle: 'The drive is still gone',
    tone: 'loss',
    lines: [
      {
        id: 'end_wrong_01_narrator',
        speaker: 'narrator',
        direction: 'Quiet, disappointed, matter of fact',
        text: 'They were escorted out before lunch. They had nothing to do with it, and by the time anyone realised, the drive was three cities away.'
      },
      {
        id: 'end_wrong_02_sanjana',
        speaker: 'sanjana',
        direction: 'Warm, helpful, entirely sincere sounding',
        text: 'It is so awful, what happened. If there is anything at all I can do to help, you know where my desk is.'
      }
    ]
  }
};

export const ALL_CUTSCENE_LINES: CutsceneLine[] = [
  ...OPENING_LINES,
  ...Object.values(ENDINGS).flatMap((ending) => ending.lines)
];

/** Shape of public/audio/cutscene/manifest.json, written by the generator. */
export type CutsceneManifest = Record<
  string,
  {
    file: string;
    durationMs: number;
  }
>;
