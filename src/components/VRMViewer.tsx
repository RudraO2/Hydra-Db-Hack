'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMHumanBoneName, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimation, type Emotion } from '@/lib/VRMAnimation';
import { NPC_BY_ID, type NPCId } from '@/data/npcs';

type Props = {
  npcId: NPCId;
  emotion: Emotion;
  speechText?: string;
  isThinking?: boolean;
};

export default function VRMViewer({ npcId, emotion, speechText = '', isThinking = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const animator = useMemo(() => new VRMAnimation(), []);

  const npc = NPC_BY_ID[npcId];
  const modelUrl = npc?.vrm ?? `/vrm/${npcId}.vrm`;

  useEffect(() => {
    setError(null);
    let frame = 0;
    let currentVrm: VRM | null = null;

    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const stage = new THREE.Group();
    const stageBasePosition = new THREE.Vector3();
    scene.add(stage);

    const camera = new THREE.PerspectiveCamera(
      30,
      Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
      0.1,
      100
    );
    camera.position.set(0, 1.38, 0.9);
    camera.lookAt(0, 1.38, 0);

    const pointer = new THREE.Vector2(0, 0);
    const lookAtTarget = new THREE.Object3D();
    const focusPoint = new THREE.Vector3(0, 1.38, 0);
    const cameraBasePosition = new THREE.Vector3(0, 1.38, 0.9);
    scene.add(lookAtTarget);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x223048, 1.5));

    const keyLight = new THREE.DirectionalLight(0xfff4dc, 2.4);
    keyLight.position.set(1.8, 2.6, 2.8);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xcfe4ff, 1.2);
    fillLight.position.set(-1.6, 1.8, 1.3);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x8bb8ff, 1.1, 8, 2);
    rimLight.position.set(0, 1.8, -2.2);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.82, 48),
      new THREE.MeshBasicMaterial({
        color: 0x9fb7ff,
        transparent: true,
        opacity: 0.08
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    stage.add(floor);

    const updateLookAtTarget = () => {
      lookAtTarget.position.set(
        focusPoint.x + pointer.x * 0.18,
        focusPoint.y + pointer.y * 0.1,
        focusPoint.z + 0.15
      );
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = (0.5 - (event.clientY - rect.top) / rect.height) * 2;
    };

    const onPointerLeave = () => {
      pointer.set(0, 0);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    updateLookAtTarget();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          setError('missing');
          return;
        }
        currentVrm = vrm;
        VRMUtils.rotateVRM0(vrm);

        const bbox = new THREE.Box3().setFromObject(vrm.scene);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const modelHeight = Math.max(size.y, 1.45);
        const headNode = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head as any);
        const neckNode = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Neck as any);
        const upperChestNode = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.UpperChest as any);
        const chestNode = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Chest as any);
        const leftShoulderNode = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftShoulder as any);
        const rightShoulderNode = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightShoulder as any);
        const headWorld = headNode?.getWorldPosition(new THREE.Vector3()) ?? null;
        const chestWorld =
          upperChestNode?.getWorldPosition(new THREE.Vector3()) ??
          chestNode?.getWorldPosition(new THREE.Vector3()) ??
          neckNode?.getWorldPosition(new THREE.Vector3()) ??
          null;
        const leftShoulderWorld = leftShoulderNode?.getWorldPosition(new THREE.Vector3()) ?? null;
        const rightShoulderWorld = rightShoulderNode?.getWorldPosition(new THREE.Vector3()) ?? null;
        const shoulderCenterWorld =
          leftShoulderWorld && rightShoulderWorld
            ? leftShoulderWorld.clone().add(rightShoulderWorld).multiplyScalar(0.5)
            : null;
        const torsoWorld = shoulderCenterWorld ?? chestWorld;
        const upperBodySpan =
          headWorld && torsoWorld ? Math.max(headWorld.y - torsoWorld.y, 0.26) : Math.max(modelHeight * 0.2, 0.26);

        vrm.scene.position.set(-center.x, -bbox.min.y - 0.04, -center.z + 0.02);
        vrm.scene.updateMatrixWorld(true);

        const reframedHeadWorld = headNode?.getWorldPosition(new THREE.Vector3()) ?? null;
        const reframedChestWorld =
          upperChestNode?.getWorldPosition(new THREE.Vector3()) ??
          chestNode?.getWorldPosition(new THREE.Vector3()) ??
          neckNode?.getWorldPosition(new THREE.Vector3()) ??
          null;
        const reframedLeftShoulderWorld = leftShoulderNode?.getWorldPosition(new THREE.Vector3()) ?? null;
        const reframedRightShoulderWorld = rightShoulderNode?.getWorldPosition(new THREE.Vector3()) ?? null;
        const reframedShoulderCenter =
          reframedLeftShoulderWorld && reframedRightShoulderWorld
            ? reframedLeftShoulderWorld.clone().add(reframedRightShoulderWorld).multiplyScalar(0.5)
            : null;
        const reframedTorsoWorld = reframedShoulderCenter ?? reframedChestWorld;
        const reframedUpperBodySpan =
          reframedHeadWorld && reframedTorsoWorld
            ? Math.max(reframedHeadWorld.y - reframedTorsoWorld.y, upperBodySpan)
            : upperBodySpan;
        const shoulderWidth =
          reframedLeftShoulderWorld && reframedRightShoulderWorld
            ? reframedLeftShoulderWorld.distanceTo(reframedRightShoulderWorld)
            : Math.max(size.x * 0.28, 0.32);
        const frameTop = reframedHeadWorld
          ? reframedHeadWorld.y + reframedUpperBodySpan * 0.14
          : modelHeight * 0.86;
        const frameBottom = reframedTorsoWorld
          ? reframedTorsoWorld.y - reframedUpperBodySpan * 0.72
          : modelHeight * 0.4;
        const frameHeight = Math.max(frameTop - frameBottom, reframedUpperBodySpan * 1.16);
        const frameWidth = Math.max(shoulderWidth * 1.34, size.x * 0.3);
        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
        const verticalDistance = frameHeight / (2 * Math.tan(verticalFov / 2));
        const horizontalDistance = frameWidth / (2 * Math.tan(horizontalFov / 2));
        // Face-level aim: eye height is slightly below the head bone top
        const faceFocusY = reframedHeadWorld
          ? reframedHeadWorld.y - reframedUpperBodySpan * 0.08
          : THREE.MathUtils.lerp(frameBottom, frameTop, 0.82);
        const cameraDistance = THREE.MathUtils.clamp(
          Math.max(verticalDistance, horizontalDistance) * 0.72,
          0.72,
          1.05
        );

        // Camera sits at the same Y as the face — no upward tilt, no clipping
        focusPoint.set(0, faceFocusY, 0.04);
        cameraBasePosition.set(0, faceFocusY, cameraDistance);
        camera.position.copy(cameraBasePosition);
        camera.lookAt(focusPoint);

        floor.scale.setScalar(THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.84, 0.72, 0.96));
        floor.position.y = 0.01;

        if (vrm.lookAt) {
          vrm.lookAt.target = lookAtTarget;
          vrm.lookAt.autoUpdate = true;
        }
        stage.add(vrm.scene);
        animator.attach(vrm);
        animator.setEmotion(emotion);
        animator.setThinking(isThinking);
        if (speechText) {
          animator.speak(speechText);
        }
        updateLookAtTarget();
      },
      undefined,
      () => setError('missing')
    );

    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      const speechLevel = animator.getSpeechLevel();
      stage.rotation.y = Math.sin(elapsed * 0.42) * 0.012;
      stage.rotation.x = -0.02 - speechLevel * 0.018;
      stage.position.y = stageBasePosition.y + Math.sin(elapsed * 1.05) * 0.008 - speechLevel * 0.01;
      stage.position.z = stageBasePosition.z + Math.sin(elapsed * 0.82 + 0.6) * 0.018 + speechLevel * 0.02;
      camera.position.x = cameraBasePosition.x + pointer.x * 0.028;
      camera.position.y = cameraBasePosition.y + pointer.y * 0.014 - speechLevel * 0.006;
      camera.position.z =
        cameraBasePosition.z +
        Math.sin(elapsed * 0.82 + 0.6) * 0.01 -
        speechLevel * 0.022;
      camera.lookAt(
        focusPoint.x + pointer.x * 0.02,
        focusPoint.y + pointer.y * 0.015 - speechLevel * 0.01,
        focusPoint.z
      );
      updateLookAtTarget();
      animator.tick(delta);
      currentVrm?.update(delta);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      animator.attach(null);
      currentVrm?.scene?.traverse((obj: unknown) => {
        const any = obj as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
        any.geometry?.dispose?.();
        any.material?.dispose?.();
      });
      renderer.dispose();
    };
  }, [npcId, modelUrl, animator]);

  useEffect(() => {
    animator.setEmotion(emotion);
  }, [emotion, animator]);

  useEffect(() => {
    animator.setThinking(isThinking);
  }, [isThinking, animator]);

  useEffect(() => {
    if (!speechText) return;
    animator.speak(speechText);
  }, [speechText, animator]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at center, #0f1830 0%, #050812 70%)',
        overflow: 'hidden'
      }}
    >
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {error ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 24,
            color: '#e8ecf5'
          }}
        >
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '0.02em' }}>{npc?.name ?? npcId}</div>
          <div style={{ marginTop: 8, fontSize: 16, opacity: 0.7 }}>{npc?.role ?? ''}</div>
          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.45 }}>
            (VRM model not found at {modelUrl})
          </div>
        </div>
      ) : null}
    </div>
  );
}
