#!/usr/bin/env node
/**
 * Generates the cutscene voice track with Gemini TTS.
 *
 * One MP3 per spoken line into public/audio/cutscene/, plus a manifest with the
 * measured duration of each clip so the cutscene can time subtitles and camera
 * moves against the real audio instead of guessed delays.
 *
 * Doing this at build time rather than at runtime means the opening plays with
 * zero latency, costs nothing per playthrough, and needs no API key in prod.
 *
 * The free TTS tier rate-limits aggressively, so this script:
 *   - skips any line whose MP3 already exists (safe to re-run / resume)
 *   - rotates across every configured API key
 *   - backs off and retries on 429 rather than losing the run
 *
 * Usage:
 *   node scripts/generate-cutscene-audio.mjs            # only missing lines
 *   node scripts/generate-cutscene-audio.mjs --force    # regenerate everything
 *   node scripts/generate-cutscene-audio.mjs --only open_02_sanjana
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const OUT_DIR = path.join(process.cwd(), 'public', 'audio', 'cutscene');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// ─── Env ─────────────────────────────────────────────────────────────────────

async function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), name), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
      }
    } catch {
      // Missing env file is fine.
    }
  }
}

function apiKeys() {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3
  ].filter(Boolean);
}

// ─── Reading the line list out of the TypeScript source ──────────────────────
// Kept deliberately simple: the script parses the exported object literals so
// the story lives in one place (src/data/cutscene.ts) and never drifts.

async function readLines() {
  const source = await fs.readFile(path.join(process.cwd(), 'src', 'data', 'cutscene.ts'), 'utf8');

  const voices = {};
  const voiceBlock = source.match(/SPEAKER_VOICE[^{]*\{([\s\S]*?)\n\};/);
  if (voiceBlock) {
    for (const m of voiceBlock[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) voices[m[1]] = m[2];
  }

  const lines = [];
  const lineRe =
    /\{\s*(?:\/\*[\s\S]*?\*\/\s*)?id:\s*'([^']+)',\s*speaker:\s*'([^']+)',\s*direction:\s*'((?:[^'\\]|\\.)*)',\s*text:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*\}/g;

  for (const m of source.matchAll(lineRe)) {
    const unescape = (s) => (s ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    lines.push({
      id: m[1],
      speaker: m[2],
      direction: unescape(m[3]),
      text: unescape(m[4] ?? m[5]),
      voice: voices[m[2]] ?? 'Kore'
    });
  }

  return lines;
}

// ─── Audio helpers ───────────────────────────────────────────────────────────

/** Gemini returns raw signed 16-bit PCM; MP3 encoders need a real WAV header. */
function pcmToWav(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function sampleRateFromMime(mimeType = '') {
  const match = mimeType.match(/rate=(\d+)/);
  return match ? Number(match[1]) : 24000;
}

async function durationMs(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    file
  ]);
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Generation ──────────────────────────────────────────────────────────────

let keyCursor = 0;

async function synthesize(line, keys) {
  // The documented prompt shape: a performance note, a colon, then the words to
  // speak. The model speaks only what follows the colon.
  const prompt = `${line.direction}: ${line.text}`;

  const maxAttempts = keys.length * 4;
  let waitMs = 20_000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const key = keys[keyCursor % keys.length];
    keyCursor += 1;

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: line.voice } }
              }
            }
          })
        }
      );
    } catch (error) {
      console.log(`      network error (${error.message}); retrying in ${waitMs / 1000}s`);
      await sleep(waitMs);
      waitMs = Math.min(waitMs * 2, 120_000);
      continue;
    }

    if (response.status === 429) {
      // Every key is throttled together on the free tier, so wait it out.
      const triedAllKeys = (attempt + 1) % keys.length === 0;
      console.log(`      rate limited on key ${(keyCursor - 1) % keys.length + 1}${triedAllKeys ? `; waiting ${waitMs / 1000}s` : '; trying next key'}`);
      if (triedAllKeys) {
        await sleep(waitMs);
        waitMs = Math.min(waitMs * 2, 120_000);
      }
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
    }

    const inline = payload?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData)?.inlineData;
    if (!inline?.data) throw new Error('no audio in response');

    return {
      pcm: Buffer.from(inline.data, 'base64'),
      sampleRate: sampleRateFromMime(inline.mimeType)
    };
  }

  throw new Error('exhausted retries (rate limited)');
}

async function main() {
  await loadEnv();

  const keys = apiKeys();
  if (!keys.length) {
    console.error('No GEMINI_API_KEY configured. Set GEMINI_API_KEY (and optionally GEMINI_API_KEY_2) in .env.local');
    process.exit(1);
  }

  try {
    await run('ffmpeg', ['-version']);
  } catch {
    console.error('ffmpeg is required to encode the cutscene audio.');
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  } catch {
    // First run.
  }

  let lines = await readLines();
  if (ONLY) lines = lines.filter((line) => line.id === ONLY);

  console.log(`${lines.length} line(s), ${keys.length} API key(s), model ${MODEL}\n`);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutscene-'));
  let generated = 0;
  let skipped = 0;
  const failures = [];

  try {
    for (const line of lines) {
      const mp3Path = path.join(OUT_DIR, `${line.id}.mp3`);
      const exists = await fs.access(mp3Path).then(() => true).catch(() => false);

      if (exists && !FORCE && manifest[line.id]) {
        skipped += 1;
        continue;
      }

      process.stdout.write(`  ${line.id} [${line.voice}] ... `);

      try {
        const { pcm, sampleRate } = await synthesize(line, keys);

        const wavPath = path.join(tmpDir, `${line.id}.wav`);
        await fs.writeFile(wavPath, pcmToWav(pcm, sampleRate));

        // Mono 64k MP3 keeps speech clean at roughly a tenth of the WAV size.
        await run('ffmpeg', [
          '-y', '-loglevel', 'error',
          '-i', wavPath,
          '-ac', '1',
          '-c:a', 'libmp3lame',
          '-b:a', '64k',
          mp3Path
        ]);
        await fs.rm(wavPath, { force: true });

        const ms = await durationMs(mp3Path);
        const bytes = (await fs.stat(mp3Path)).size;
        manifest[line.id] = { file: `/audio/cutscene/${line.id}.mp3`, durationMs: ms };

        // Persist after every line so an interrupted run never loses work.
        await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));

        generated += 1;
        console.log(`${(ms / 1000).toFixed(1)}s  ${(bytes / 1024).toFixed(0)}KB`);

        // Stay under the free-tier request rate.
        await sleep(6_000);
      } catch (error) {
        console.log(`FAILED (${error.message.slice(0, 160)})`);
        failures.push(line.id);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));

  console.log(`\ngenerated ${generated}, reused ${skipped}, failed ${failures.length}`);
  if (failures.length) {
    console.log(`re-run to retry: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
