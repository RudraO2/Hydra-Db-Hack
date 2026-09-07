'use client';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { NPCS } from '@/data/npcs';

/**
 * Avatar loading used to happen from scratch every time a conversation opened,
 * which meant a multi-second stall the first time you pressed E on someone - and
 * again for every character sharing the same source file.
 *
 * The downloaded bytes are cached per URL and parsed per viewer. Parsing has to
 * happen per instance because each viewer poses its own skeleton and drives its
 * own expressions, but the download only ever happens once per model.
 */

const bufferCache = new Map<string, Promise<ArrayBuffer>>();

function fetchModel(url: string): Promise<ArrayBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;

  const request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status} loading ${url}`);
      return response.arrayBuffer();
    })
    .catch((error) => {
      // Never cache a failure permanently - a retry should be able to succeed.
      bufferCache.delete(url);
      throw error;
    });

  bufferCache.set(url, request);
  return request;
}

function makeLoader() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
}

/** Resolves to a VRM ready to add to a scene, reusing the cached download. */
export async function loadVRM(url: string): Promise<VRM> {
  const buffer = await fetchModel(url);
  // parseAsync needs a base path for external resources; these models are
  // self-contained GLBs, so an empty path is correct.
  const gltf = await makeLoader().parseAsync(buffer.slice(0), '');
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`No VRM payload in ${url}`);
  return vrm;
}

export function isModelCached(url: string) {
  return bufferCache.has(url);
}

let prefetchStarted = false;

/**
 * Warms the download cache for every distinct avatar once the world is running,
 * so walking up to someone and pressing E opens without a download stall.
 * Models are fetched one at a time during idle time so this never competes with
 * the tilemap, the sprites, or anything the player is actually waiting on.
 */
export function prefetchAllVRMs() {
  if (prefetchStarted || typeof window === 'undefined') return;
  prefetchStarted = true;

  const urls = [...new Set(NPCS.map((npc) => npc.vrm))];
  const whenIdle = (cb: () => void, timeout: number) => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback;
    if (idle) idle(cb, { timeout });
    else window.setTimeout(cb, timeout);
  };

  const runNext = async (index: number) => {
    if (index >= urls.length) return;
    try {
      await fetchModel(urls[index]);
    } catch {
      // A missing avatar is surfaced by the viewer's own error state.
    }
    whenIdle(() => void runNext(index + 1), 800);
  };

  whenIdle(() => void runNext(0), 1500);
}

/** Oversampling on high-DPI screens is pure GPU cost for no visible gain here. */
export function cappedPixelRatio(max = 1.75) {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, max);
}
