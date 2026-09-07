#!/usr/bin/env node
/**
 * Shrinks the VRM avatars used in the conversation view.
 *
 * The sample models ship 20-28 MB each, and roughly 70% of that is uncompressed
 * PNG texture data plus a multi-megabyte thumbnail that is never rendered in
 * game. Downloading that on the first conversation was the single largest
 * stall in the whole experience.
 *
 * This rewrites the GLB in place-ish (to a new file) by re-encoding every
 * embedded texture to WebP at a sane resolution. three.js loads embedded
 * textures by handing the bytes to the browser as a Blob with the declared
 * mimeType, so WebP decodes natively with no loader changes.
 *
 * Usage: node scripts/optimize-vrm.mjs [--quality 85] [--max 1024] [--dry]
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const VRM_DIR = path.join(process.cwd(), 'public', 'vrm');
const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const QUALITY = Number(flag('quality', 85));
const MAX_EDGE = Number(flag('max', 1024));
const THUMB_MAX_EDGE = 256;
const DRY = args.includes('--dry');

function align4(n) {
  return (n + 3) & ~3;
}

function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB file');

  const total = view.getUint32(8, true);
  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < total) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const chunk = buffer.subarray(start, start + chunkLength);

    if (chunkType === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (chunkType === CHUNK_BIN) bin = chunk;

    offset = start + align4(chunkLength);
  }

  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin: bin ?? Buffer.alloc(0) };
}

function buildGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([
    jsonBytes,
    Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20) // pad with spaces
  ]);
  const binPadded = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length, 0)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(CHUNK_BIN, 4);

  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
}

async function toWebp(pngBuffer, maxEdge, tmpDir, tag) {
  const input = path.join(tmpDir, `${tag}.png`);
  const output = path.join(tmpDir, `${tag}.webp`);
  await fs.writeFile(input, pngBuffer);

  // Downscale only when larger than the cap, never upscale, keep aspect ratio,
  // and keep dimensions even so the encoder is happy with alpha.
  const scale = `scale='if(gt(max(iw,ih),${maxEdge}),if(gte(iw,ih),${maxEdge},-2),iw)':'if(gt(max(iw,ih),${maxEdge}),if(gte(iw,ih),-2,${maxEdge}),ih)'`;

  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', input,
    '-vf', scale,
    '-c:v', 'libwebp',
    '-lossless', '0',
    '-compression_level', '6',
    '-q:v', String(QUALITY),
    output
  ]);

  const result = await fs.readFile(output);
  await fs.rm(input, { force: true });
  await fs.rm(output, { force: true });
  return result;
}

async function optimizeFile(file) {
  const original = await fs.readFile(file);
  const { json, bin } = parseGlb(original);

  const images = json.images ?? [];
  const bufferViews = json.bufferViews ?? [];
  if (!images.length) {
    console.log(`  ${path.basename(file)}: no embedded images, skipping`);
    return null;
  }

  // The VRM thumbnail is metadata for model browsers - the game never renders
  // it, so it gets squeezed hardest.
  const thumbnailIndex =
    json.extensions?.VRM?.meta?.texture !== undefined
      ? json.textures?.[json.extensions.VRM.meta.texture]?.source
      : json.extensions?.VRMC_vrm?.meta?.thumbnailImage;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vrmopt-'));
  const replacements = new Map(); // bufferView index -> new bytes

  try {
    for (let i = 0; i < images.length; i += 1) {
      const image = images[i];
      if (image.bufferView === undefined) continue;

      const view = bufferViews[image.bufferView];
      const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const isThumbnail = i === thumbnailIndex;
      const maxEdge = isThumbnail ? THUMB_MAX_EDGE : MAX_EDGE;

      let encoded;
      try {
        encoded = await toWebp(bytes, maxEdge, tmpDir, `img${i}`);
      } catch (error) {
        console.log(`    image ${i}: encode failed (${error.message.split('\n')[0]}), keeping original`);
        continue;
      }

      if (encoded.length >= bytes.length) {
        console.log(`    image ${i}: webp not smaller, keeping original`);
        continue;
      }

      replacements.set(image.bufferView, encoded);
      image.mimeType = 'image/webp';
    }

    if (replacements.size === 0) return null;

    // Every bufferView offset shifts once any payload changes size, so the
    // binary chunk is rebuilt from scratch in bufferView order.
    const pieces = [];
    let cursor = 0;
    for (let i = 0; i < bufferViews.length; i += 1) {
      const view = bufferViews[i];
      const replacement = replacements.get(i);
      const bytes = replacement ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);

      const padding = align4(cursor) - cursor;
      if (padding > 0) {
        pieces.push(Buffer.alloc(padding, 0));
        cursor += padding;
      }

      view.byteOffset = cursor;
      view.byteLength = bytes.length;
      pieces.push(Buffer.from(bytes));
      cursor += bytes.length;
    }

    const newBin = Buffer.concat(pieces);
    if (json.buffers?.[0]) json.buffers[0].byteLength = newBin.length;

    // three.js reads embedded WebP straight from the bufferView blob, but
    // declaring the extension keeps the asset spec-correct for other tools.
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'EXT_texture_webp'])];

    return buildGlb(json, newBin);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    await run('ffmpeg', ['-version']);
  } catch {
    console.error('ffmpeg is required for VRM optimization. Install it and re-run.');
    process.exit(1);
  }

  const entries = (await fs.readdir(VRM_DIR)).filter((name) => name.endsWith('.vrm'));
  if (!entries.length) {
    console.log('No .vrm files found in public/vrm');
    return;
  }

  let before = 0;
  let after = 0;

  for (const name of entries) {
    const file = path.join(VRM_DIR, name);
    const originalSize = (await fs.stat(file)).size;
    before += originalSize;

    console.log(`\n${name} (${(originalSize / 1e6).toFixed(1)} MB)`);
    const optimized = await optimizeFile(file);

    if (!optimized) {
      after += originalSize;
      console.log('  no change');
      continue;
    }

    after += optimized.length;
    const saved = ((1 - optimized.length / originalSize) * 100).toFixed(1);
    console.log(`  -> ${(optimized.length / 1e6).toFixed(1)} MB (${saved}% smaller)`);

    if (!DRY) await fs.writeFile(file, optimized);
  }

  console.log(
    `\nTotal: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB` +
      `${DRY ? ' (dry run, nothing written)' : ''}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
