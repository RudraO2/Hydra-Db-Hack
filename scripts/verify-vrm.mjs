#!/usr/bin/env node
/**
 * Structural check for the VRM avatars.
 *
 * Run after scripts/optimize-vrm.mjs. Validates that the rewritten GLB is still
 * internally consistent - every bufferView inside the binary chunk, every
 * accessor inside its bufferView, correct alignment, humanoid bones intact -
 * and that each embedded texture actually decodes.
 *
 * Usage: node scripts/verify-vrm.mjs
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const VRM_DIR = path.join(process.cwd(), 'public', 'vrm');
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

const align4 = (n) => (n + 3) & ~3;

function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB');
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== buffer.length) {
    throw new Error(`header length ${declaredLength} != file length ${buffer.length}`);
  }

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < declaredLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (chunkType === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(buffer.subarray(start, start + chunkLength)));
    else if (chunkType === CHUNK_BIN) bin = buffer.subarray(start, start + chunkLength);
    offset = start + align4(chunkLength);
  }
  if (!json) throw new Error('no JSON chunk');
  return { json, bin: bin ?? Buffer.alloc(0) };
}

async function verify(name) {
  const file = path.join(VRM_DIR, name);
  const buffer = await fs.readFile(file);
  const { json, bin } = parseGlb(buffer);
  const problems = [];

  const bufferViews = json.bufferViews ?? [];

  // 1. Every bufferView must sit inside the binary chunk.
  bufferViews.forEach((view, i) => {
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    if (end > bin.length) problems.push(`bufferView ${i} ends at ${end}, binary chunk is ${bin.length}`);
  });

  // 2. Every accessor must sit inside its bufferView.
  (json.accessors ?? []).forEach((accessor, i) => {
    if (accessor.bufferView === undefined) return;
    const view = bufferViews[accessor.bufferView];
    if (!view) { problems.push(`accessor ${i} references missing bufferView`); return; }

    const elementSize = (COMPONENT_BYTES[accessor.componentType] ?? 0) * (TYPE_COUNTS[accessor.type] ?? 0);
    const stride = view.byteStride ?? elementSize;
    const needed = (accessor.byteOffset ?? 0) + stride * (accessor.count - 1) + elementSize;
    if (needed > view.byteLength) {
      problems.push(`accessor ${i} needs ${needed} bytes, bufferView has ${view.byteLength}`);
    }
    // Accessor offsets must stay 4-byte aligned relative to the buffer.
    const absolute = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const componentSize = COMPONENT_BYTES[accessor.componentType] ?? 1;
    if (absolute % componentSize !== 0) {
      problems.push(`accessor ${i} misaligned at absolute offset ${absolute} for ${componentSize}-byte components`);
    }
  });

  // 3. Declared buffer length must match the real binary chunk.
  const declared = json.buffers?.[0]?.byteLength;
  if (declared !== undefined && declared > bin.length) {
    problems.push(`buffers[0].byteLength ${declared} exceeds binary chunk ${bin.length}`);
  }

  // 4. Every embedded image must actually decode, at a sane size.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vrmverify-'));
  const textureInfo = [];
  try {
    const images = json.images ?? [];
    for (let i = 0; i < images.length; i += 1) {
      const image = images[i];
      if (image.bufferView === undefined) continue;
      const view = bufferViews[image.bufferView];
      const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);

      const ext = (image.mimeType ?? '').includes('webp') ? 'webp' : 'png';
      const probeFile = path.join(tmpDir, `img${i}.${ext}`);
      await fs.writeFile(probeFile, bytes);

      try {
        const { stdout } = await run('ffprobe', [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height,pix_fmt',
          '-of', 'csv=p=0', probeFile
        ]);
        const [width, height, pixFmt] = stdout.trim().split(',');
        textureInfo.push(`${width}x${height} ${pixFmt} ${(bytes.length / 1024).toFixed(0)}KB`);
        if (!Number(width) || !Number(height)) problems.push(`image ${i} decoded to zero dimensions`);
      } catch (error) {
        problems.push(`image ${i} (${image.mimeType}) failed to decode: ${error.message.split('\n')[0]}`);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  // 5. VRM humanoid rig must survive - this is what drives every pose and expression.
  const vrmExt = json.extensions?.VRMC_vrm ?? json.extensions?.VRM;
  const bones = vrmExt?.humanoid?.humanBones;
  const boneCount = Array.isArray(bones) ? bones.length : Object.keys(bones ?? {}).length;
  if (!boneCount) problems.push('no VRM humanoid bones found');

  const expressions =
    vrmExt?.expressions?.preset ??
    vrmExt?.blendShapeMaster?.blendShapeGroups ??
    null;
  const expressionCount = Array.isArray(expressions)
    ? expressions.length
    : Object.keys(expressions ?? {}).length;

  return { name, size: buffer.length, problems, textureInfo, boneCount, expressionCount };
}

const files = (await fs.readdir(VRM_DIR)).filter((n) => n.endsWith('.vrm'));
let failed = false;

for (const name of files) {
  const report = await verify(name);
  const status = report.problems.length ? 'FAIL' : 'OK';
  if (report.problems.length) failed = true;

  console.log(`\n${status}  ${report.name}  ${(report.size / 1e6).toFixed(2)} MB`);
  console.log(`      bones: ${report.boneCount}   expressions: ${report.expressionCount}   textures: ${report.textureInfo.length}`);
  console.log(`      ${report.textureInfo.join('  |  ')}`);
  for (const problem of report.problems) console.log(`      ! ${problem}`);
}

console.log(failed ? '\nVerification failed.' : '\nAll models verified.');
process.exit(failed ? 1 : 0);
