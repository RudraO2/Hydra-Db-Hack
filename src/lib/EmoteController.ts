import type { VRM } from '@pixiv/three-vrm';
import type { Emotion } from './VRMAnimation';

// VRM expression presets we might touch.
const RESET_PRESETS = ['happy', 'angry', 'sad', 'surprised', 'relaxed', 'neutral'] as const;

// Map our game emotions to VRM expression preset names.
// VRM has no "disgusted" preset, so we reuse "angry" as the closest fit.
const EMOTION_TO_PRESET: Record<Emotion, string | null> = {
  neutral: null,
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
  disgusted: 'angry'
};

export class EmoteController {
  private emotion: Emotion;
  private vrm: VRM | null = null;

  constructor(defaultEmotion: Emotion = 'neutral') {
    this.emotion = defaultEmotion;
  }

  attach(vrm: VRM | null) {
    this.vrm = vrm;
    this.apply();
  }

  setEmotion(next: Emotion) {
    this.emotion = next;
    this.apply();
  }

  getEmotion() {
    return this.emotion;
  }

  private apply() {
    const manager = this.vrm?.expressionManager;
    if (!manager) return;

    for (const preset of RESET_PRESETS) {
      try {
        manager.setValue(preset, 0);
      } catch {
        // Expression preset may not exist on this VRM — ignore.
      }
    }

    const target = EMOTION_TO_PRESET[this.emotion];
    if (target) {
      try {
        manager.setValue(target, 1);
      } catch {
        // ignore missing preset
      }
    }

    try {
      manager.update();
    } catch {
      // ignore
    }
  }
}
