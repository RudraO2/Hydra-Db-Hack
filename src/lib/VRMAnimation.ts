import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm';

export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'disgusted';

type AnimatedBone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftLowerArm'
  | 'rightLowerArm'
  | 'leftHand'
  | 'rightHand';

const BONE_NAMES: Record<AnimatedBone, string> = {
  hips: VRMHumanBoneName.Hips,
  spine: VRMHumanBoneName.Spine,
  chest: VRMHumanBoneName.Chest,
  upperChest: VRMHumanBoneName.UpperChest,
  neck: VRMHumanBoneName.Neck,
  head: VRMHumanBoneName.Head,
  leftShoulder: VRMHumanBoneName.LeftShoulder,
  rightShoulder: VRMHumanBoneName.RightShoulder,
  leftUpperArm: VRMHumanBoneName.LeftUpperArm,
  rightUpperArm: VRMHumanBoneName.RightUpperArm,
  leftLowerArm: VRMHumanBoneName.LeftLowerArm,
  rightLowerArm: VRMHumanBoneName.RightLowerArm,
  leftHand: VRMHumanBoneName.LeftHand,
  rightHand: VRMHumanBoneName.RightHand
};

const EMOTION_PRESETS = [
  VRMExpressionPresetName.Happy,
  VRMExpressionPresetName.Angry,
  VRMExpressionPresetName.Sad,
  VRMExpressionPresetName.Surprised,
  VRMExpressionPresetName.Relaxed,
  VRMExpressionPresetName.Neutral
] as const;

const VISEMES = [
  VRMExpressionPresetName.Aa,
  VRMExpressionPresetName.Ih,
  VRMExpressionPresetName.Ou,
  VRMExpressionPresetName.Ee,
  VRMExpressionPresetName.Oh
] as const;

const EXPRESSION_ALIASES: Record<string, string[]> = {
  [VRMExpressionPresetName.Happy]: ['happy', 'joy', 'smile'],
  [VRMExpressionPresetName.Angry]: ['angry', 'anger'],
  [VRMExpressionPresetName.Sad]: ['sad', 'sorrow', 'cry'],
  [VRMExpressionPresetName.Surprised]: ['surprised', 'surprise'],
  [VRMExpressionPresetName.Relaxed]: ['relaxed', 'neutral'],
  [VRMExpressionPresetName.Neutral]: ['neutral', 'relaxed'],
  [VRMExpressionPresetName.Blink]: ['blink'],
  [VRMExpressionPresetName.LookDown]: ['lookdown', 'lookDown'],
  [VRMExpressionPresetName.Aa]: ['aa', 'a'],
  [VRMExpressionPresetName.Ih]: ['ih', 'i'],
  [VRMExpressionPresetName.Ou]: ['ou', 'u'],
  [VRMExpressionPresetName.Ee]: ['ee', 'e'],
  [VRMExpressionPresetName.Oh]: ['oh', 'o']
};

export class VRMAnimation {
  private vrm: VRM | null = null;
  private elapsed = 0;
  private emotion: Emotion = 'neutral';
  private thinking = false;
  private speakingUntil = 0;
  private speechPulse = 0;
  private blinkStartAt = 1.2;
  private blinkDuration = 0.12;
  private nextBlinkAt = 4.8;
  private readonly euler = new THREE.Euler();
  private readonly targetQuat = new THREE.Quaternion();
  private readonly poseQuat = new THREE.Quaternion();
  private readonly baseQuats = new Map<AnimatedBone, THREE.Quaternion>();
  private readonly bones = new Map<AnimatedBone, THREE.Object3D>();

  attach(vrm: VRM | null) {
    this.vrm = vrm;
    this.elapsed = 0;
    this.speakingUntil = 0;
    this.speechPulse = 0;
    this.blinkStartAt = 0.45;
    this.nextBlinkAt = 2.4;
    this.baseQuats.clear();
    this.bones.clear();

    if (!vrm?.humanoid) return;

    this.applyRelaxedPose(vrm);

    (Object.keys(BONE_NAMES) as AnimatedBone[]).forEach((boneKey) => {
      const node = vrm.humanoid.getNormalizedBoneNode(BONE_NAMES[boneKey] as any);
      if (!node) return;
      this.bones.set(boneKey, node);
      this.baseQuats.set(boneKey, node.quaternion.clone());
    });
  }

  setEmotion(emotion: Emotion) {
    this.emotion = emotion;
  }

  setThinking(next: boolean) {
    this.thinking = next;
  }

  speak(text: string) {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (!compact) return;

    const duration = THREE.MathUtils.clamp(compact.length * 0.045, 1.2, 5.5);
    this.speakingUntil = Math.max(this.speakingUntil, this.elapsed + duration);
  }

  tick(deltaSeconds: number) {
    this.elapsed += deltaSeconds;

    if (!this.vrm) {
      return this.elapsed;
    }

    this.updateBodyMotion();
    this.updateExpressions();
    return this.elapsed;
  }

  private get speaking() {
    return this.elapsed < this.speakingUntil;
  }

  getSpeechLevel() {
    const target = this.speaking ? 1 : 0;
    this.speechPulse = THREE.MathUtils.lerp(this.speechPulse, target, this.speaking ? 0.28 : 0.14);
    return this.speechPulse;
  }

  private updateBodyMotion() {
    const breathe = Math.sin(this.elapsed * 1.8) * 0.018;
    const sway = Math.sin(this.elapsed * 0.85) * 0.05;
    const settle = Math.sin(this.elapsed * 0.55 + 0.8) * 0.018;
    const speechLevel = this.getSpeechLevel();
    const talkBob = speechLevel * Math.sin(this.elapsed * 8.4) * 0.022;
    const talkLean = speechLevel * 0.06;
    const armSwing = Math.sin(this.elapsed * 1.1 + 0.4) * 0.03;
    const elbowSwing = Math.sin(this.elapsed * 1.35 + 1.1) * 0.045;
    const wristSwing = Math.sin(this.elapsed * 1.8 + 0.5) * 0.035;
    const thinkingTilt = this.thinking ? 0.08 : 0;
    const listeningLean = this.thinking ? -0.035 : 0.015;

    this.applyBone('hips', breathe * 0.08, sway * 0.08, 0);
    this.applyBone('spine', listeningLean - talkLean + breathe * 0.42, sway * 0.16, sway * 0.04);
    this.applyBone('chest', -talkLean * 0.45 + breathe * 0.56, sway * 0.2, sway * 0.06);
    this.applyBone('upperChest', -talkLean * 0.7 + breathe * 0.76 + talkBob * 0.22, sway * 0.24, sway * 0.06);
    this.applyBone('neck', talkBob * 0.34, sway * 0.3, thinkingTilt * 0.36);
    this.applyBone(
      'head',
      breathe * 0.22 + settle * 0.12 + talkBob * 0.26,
      sway * 0.4 + (speechLevel > 0 ? Math.sin(this.elapsed * 2.6) * 0.026 : 0),
      thinkingTilt + settle * 0.08
    );

    // Pull the avatar out of the T-pose into a relaxed conversational stance.
    this.applyBone('leftShoulder', -0.08 + breathe * 0.03, 0.02 + sway * 0.02, 0.08 + talkBob * 0.02);
    this.applyBone('rightShoulder', -0.08 + breathe * 0.03, -0.02 - sway * 0.02, -0.08 - talkBob * 0.02);
    this.applyBone('leftUpperArm', -0.08 + armSwing * 0.05 - speechLevel * 0.02, 0.04 + sway * 0.03, 0.12);
    this.applyBone('rightUpperArm', -0.08 - armSwing * 0.05 - speechLevel * 0.02, -0.04 - sway * 0.03, -0.12);
    this.applyBone('leftLowerArm', -0.12 - elbowSwing * 0.05, 0.08, 0.08 + speechLevel * 0.03);
    this.applyBone('rightLowerArm', -0.12 + elbowSwing * 0.05, -0.08, -0.08 - speechLevel * 0.03);
    this.applyBone('leftHand', 0.08 + wristSwing * 0.05, 0.04, 0.08);
    this.applyBone('rightHand', 0.08 - wristSwing * 0.05, -0.04, -0.08);
  }

  private applyBone(bone: AnimatedBone, rx: number, ry: number, rz: number) {
    const node = this.bones.get(bone);
    const baseQuat = this.baseQuats.get(bone);
    if (!node || !baseQuat) return;

    this.euler.set(rx, ry, rz, 'XYZ');
    this.targetQuat.copy(baseQuat).multiply(new THREE.Quaternion().setFromEuler(this.euler));
    node.quaternion.slerp(this.targetQuat, 0.18);
  }

  private updateExpressions() {
    const manager = this.vrm?.expressionManager;
    if (!manager) return;

    const blinkWeight = this.computeBlinkWeight();
    const visemes = this.computeVisemes();

    for (const preset of EMOTION_PRESETS) {
      this.safeSet(manager, preset, 0);
    }
    this.safeSet(manager, VRMExpressionPresetName.Blink, blinkWeight);
    this.safeSet(manager, VRMExpressionPresetName.LookDown, this.thinking ? 0.12 : 0);

    for (const viseme of VISEMES) {
      this.safeSet(manager, viseme, visemes[viseme] ?? 0);
    }

    switch (this.emotion) {
      case 'happy':
        this.safeSet(manager, VRMExpressionPresetName.Happy, 0.8);
        break;
      case 'sad':
        this.safeSet(manager, VRMExpressionPresetName.Sad, 0.78);
        break;
      case 'angry':
        this.safeSet(manager, VRMExpressionPresetName.Angry, 0.82);
        break;
      case 'surprised':
        this.safeSet(manager, VRMExpressionPresetName.Surprised, 0.95);
        break;
      case 'disgusted':
        this.safeSet(manager, VRMExpressionPresetName.Angry, 0.32);
        this.safeSet(manager, VRMExpressionPresetName.Relaxed, 0.42);
        break;
      default:
        this.safeSet(manager, VRMExpressionPresetName.Relaxed, 0.08);
        break;
    }

    try {
      manager.update();
    } catch {
      // Some models may not expose all presets.
    }
  }

  private computeBlinkWeight() {
    if (this.elapsed >= this.nextBlinkAt) {
      this.blinkStartAt = this.elapsed;
      this.nextBlinkAt = this.elapsed + THREE.MathUtils.randFloat(2.8, 5.6);
    }

    const blinkPhase = (this.elapsed - this.blinkStartAt) / this.blinkDuration;
    if (blinkPhase <= 0 || blinkPhase >= 1) {
      return 0;
    }

    return blinkPhase < 0.5 ? blinkPhase * 2 : (1 - blinkPhase) * 2;
  }

  private computeVisemes() {
    const weights: Partial<Record<(typeof VISEMES)[number], number>> = {};
    for (const viseme of VISEMES) {
      weights[viseme] = 0;
    }

    if (!this.speaking) {
      return weights;
    }

    const cycle = this.elapsed * 10.5;
    const primaryIndex = Math.floor(cycle) % VISEMES.length;
    const secondaryIndex = (primaryIndex + 1) % VISEMES.length;
    const mix = cycle - Math.floor(cycle);
    const openness = 0.35 + Math.sin(this.elapsed * 14.5) * Math.sin(this.elapsed * 14.5) * 0.45;

    weights[VISEMES[primaryIndex]] = openness * (1 - mix);
    weights[VISEMES[secondaryIndex]] = openness * mix * 0.75;
    return weights;
  }

  private safeSet(
    manager: NonNullable<VRM['expressionManager']>,
    preset: string,
    weight: number
  ) {
    const resolvedName = this.resolveExpressionName(manager, preset);
    if (!resolvedName) return;

    try {
      manager.setValue(resolvedName, weight);
    } catch {
      // Ignore missing expressions on a specific VRM.
    }
  }

  private resolveExpressionName(
    manager: NonNullable<VRM['expressionManager']>,
    preset: string
  ) {
    const expressionMap = (manager as { expressionMap?: Record<string, unknown> }).expressionMap ?? {};
    if (preset in expressionMap) {
      return preset;
    }

    const aliases = EXPRESSION_ALIASES[preset] ?? [preset];
    const availableNames = Object.keys(expressionMap);

    for (const alias of aliases) {
      const found = availableNames.find((name) => name.toLowerCase() === alias.toLowerCase());
      if (found) {
        return found;
      }
    }

    return null;
  }

  private applyRelaxedPose(vrm: VRM) {
    const humanoid = vrm.humanoid as
      | (VRM['humanoid'] & {
          resetNormalizedPose?: () => void;
          setNormalizedPose?: (pose: Record<string, { rotation?: [number, number, number, number] }>) => void;
        })
      | null;
    if (!humanoid?.setNormalizedPose) return;

    humanoid.resetNormalizedPose?.();
    humanoid.setNormalizedPose({
      leftShoulder: { rotation: this.quatArray(-0.05, 0.02, 0.2) },
      rightShoulder: { rotation: this.quatArray(-0.05, -0.02, -0.2) },
      leftUpperArm: { rotation: this.quatArray(-0.12, 0.08, 1.18) },
      rightUpperArm: { rotation: this.quatArray(-0.12, -0.08, -1.18) },
      leftLowerArm: { rotation: this.quatArray(-0.18, 0.02, 0.24) },
      rightLowerArm: { rotation: this.quatArray(-0.18, -0.02, -0.24) },
      leftHand: { rotation: this.quatArray(0.06, 0.02, 0.08) },
      rightHand: { rotation: this.quatArray(0.06, -0.02, -0.08) }
    });
    vrm.update(0);
  }

  private quatArray(rx: number, ry: number, rz: number): [number, number, number, number] {
    this.poseQuat.setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    return [this.poseQuat.x, this.poseQuat.y, this.poseQuat.z, this.poseQuat.w];
  }
}
