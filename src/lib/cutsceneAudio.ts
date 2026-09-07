'use client';

import type { CutsceneManifest } from '@/data/cutscene';

/**
 * Playback for the pre-generated cutscene voice track.
 *
 * All clips are decoded up front into one AudioContext so a line starts on the
 * exact frame the scene asks for it - no fetch, no decode, no gap between the
 * camera move and the voice.
 */

let manifestPromise: Promise<CutsceneManifest> | null = null;

export function loadCutsceneManifest(): Promise<CutsceneManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/audio/cutscene/manifest.json')
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({} as CutsceneManifest));
  }
  return manifestPromise;
}

export class CutsceneVoice {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private active: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private muted = false;

  /**
   * Fetches and decodes every clip. Resolves once they are all ready, or
   * immediately for any clip that fails - a missing voice line degrades to a
   * silent subtitle rather than breaking the scene.
   */
  async preload(manifest: CutsceneManifest, ids: string[]) {
    if (typeof window === 'undefined') return;

    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }

    const context = this.context;
    await Promise.all(
      ids.map(async (id) => {
        if (this.buffers.has(id)) return;
        const entry = manifest[id];
        if (!entry) return;
        try {
          const response = await fetch(entry.file);
          if (!response.ok) return;
          const decoded = await context.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(id, decoded);
        } catch {
          // Silent line - the subtitle still plays.
        }
      })
    );
  }

  /** Browsers block audio until a gesture; call this from a click or keypress. */
  async unlock() {
    if (this.context?.state === 'suspended') {
      await this.context.resume().catch(() => {});
    }
  }

  /** Returns the clip length in ms so callers can time subtitles to real audio. */
  play(id: string): number {
    const buffer = this.buffers.get(id);
    if (!buffer || !this.context || !this.gain) return 0;

    this.stop();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start();
    this.active = source;
    return Math.round(buffer.duration * 1000);
  }

  durationOf(id: string) {
    const buffer = this.buffers.get(id);
    return buffer ? Math.round(buffer.duration * 1000) : 0;
  }

  stop() {
    try {
      this.active?.stop();
    } catch {
      // Already ended.
    }
    this.active = null;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
  }

  isMuted() {
    return this.muted;
  }

  dispose() {
    this.stop();
    this.buffers.clear();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.gain = null;
  }
}
