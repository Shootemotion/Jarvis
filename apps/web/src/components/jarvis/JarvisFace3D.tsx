'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import styles from './Jarvis.module.css';
import { JARVIS_STATE_META, JarvisVisualState } from './types';

interface Props {
  state: JarvisVisualState;
  docked?: boolean;
  /** When true, the webcam (MediaPipe FaceLandmarker) drives head pose + face. */
  track?: boolean;
}

const BG_COLOR = 0x04060a;

const MP_VERSION = '0.10.35';
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Live tracking values written by MediaPipe, read by the render loop. */
interface LiveFace {
  active: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  blinkL: number;
  blinkR: number;
  jaw: number;
}

/** Small round sprite so points render as dots, not squares. */
function makeDotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface StateParams {
  breatheAmp: number;
  breatheSpeed: number;
  jitter: number;
  dim: number;
  bloom: number;
  drift: number;
  mouth: 'talk' | 'soft' | 'closed';
}

function paramsFor(s: JarvisVisualState): StateParams {
  switch (s) {
    case 'idle': return { breatheAmp: 0.01, breatheSpeed: 1.1, jitter: 0, dim: 1, bloom: 0.3, drift: 1, mouth: 'closed' };
    case 'listening': return { breatheAmp: 0.016, breatheSpeed: 2.2, jitter: 0, dim: 1.1, bloom: 0.4, drift: 1.3, mouth: 'soft' };
    case 'thinking': return { breatheAmp: 0.01, breatheSpeed: 2.6, jitter: 0, dim: 1.15, bloom: 0.48, drift: 1.8, mouth: 'closed' };
    case 'speaking': return { breatheAmp: 0.014, breatheSpeed: 3, jitter: 0, dim: 1.2, bloom: 0.45, drift: 1.2, mouth: 'talk' };
    case 'tool_call': return { breatheAmp: 0.01, breatheSpeed: 2, jitter: 0, dim: 1.05, bloom: 0.44, drift: 1.6, mouth: 'closed' };
    case 'confirmation_required': return { breatheAmp: 0.024, breatheSpeed: 4, jitter: 0, dim: 1, bloom: 0.34, drift: 1, mouth: 'closed' };
    case 'error': return { breatheAmp: 0.016, breatheSpeed: 9, jitter: 0.05, dim: 1, bloom: 0.4, drift: 1, mouth: 'closed' };
    case 'offline': return { breatheAmp: 0.004, breatheSpeed: 0.6, jitter: 0, dim: 0.4, bloom: 0.18, drift: 0.2, mouth: 'closed' };
  }
}

/** Find a morph target index by trying several ARKit name variants. */
function morphIndex(dict: Record<string, number>, ...cands: string[]): number {
  for (const c of cands) if (dict[c] !== undefined) return dict[c];
  const keys = Object.keys(dict);
  for (const c of cands) {
    const k = keys.find((kk) => kk.toLowerCase() === c.toLowerCase());
    if (k) return dict[k];
  }
  return -1;
}

/**
 * JARVIS's face: a rigged 3D head (facecap.glb, ARKit blendshapes) rendered as
 * a holographic wireframe with bloom. Real blinking + mouth movement via morph
 * targets. Same ARKit blendshapes a webcam FaceLandmarker outputs (Phase B).
 */
export function JarvisFace3D({ state, docked = false, track = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dockedRef = useRef(docked);
  dockedRef.current = docked;
  const liveRef = useRef<LiveFace>({
    active: false,
    yaw: 0,
    pitch: 0,
    roll: 0,
    blinkL: 0,
    blinkR: 0,
    jaw: 0,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG_COLOR, 0.055);
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    const group = new THREE.Group();
    scene.add(group);

    const accent = new THREE.Color(JARVIS_STATE_META[state].color);
    const headMats: THREE.MeshBasicMaterial[] = [];
    let headHolder: THREE.Group | null = null;
    let headMesh: THREE.Mesh | null = null;
    let mIdxBlinkL = -1, mIdxBlinkR = -1, mIdxJaw = -1, mIdxMouth = -1;

    // ---- background neural network ----
    const BG = 460;
    const bgBase = new Float32Array(BG * 3);
    const bgSeed = new Float32Array(BG * 3);
    for (let i = 0; i < BG; i++) {
      bgBase[i * 3] = (Math.random() - 0.5) * 16;
      bgBase[i * 3 + 1] = (Math.random() - 0.5) * 11;
      bgBase[i * 3 + 2] = -2 - Math.random() * 8;
      bgSeed[i * 3] = Math.random() * Math.PI * 2;
      bgSeed[i * 3 + 1] = 0.2 + Math.random() * 0.6;
      bgSeed[i * 3 + 2] = 0.15 + Math.random() * 0.5;
    }
    const bgPos = new THREE.BufferAttribute(bgBase.slice(), 3);
    const bgCol = new THREE.BufferAttribute(new Float32Array(BG * 3), 3);
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', bgPos);
    bgGeo.setAttribute('color', bgCol);
    const bgEdgeIdx: number[] = [];
    for (let i = 0; i < BG; i++) {
      const d: { j: number; v: number }[] = [];
      for (let j = 0; j < BG; j++) {
        if (i === j) continue;
        const dx = bgBase[i * 3] - bgBase[j * 3], dy = bgBase[i * 3 + 1] - bgBase[j * 3 + 1], dz = bgBase[i * 3 + 2] - bgBase[j * 3 + 2];
        d.push({ j, v: dx * dx + dy * dy + dz * dz });
      }
      d.sort((a, b) => a.v - b.v);
      for (let n = 0; n < 3; n++) if (d[n].v < 4.2 * 4.2) bgEdgeIdx.push(i, d[n].j);
    }
    const bgLineGeo = new THREE.BufferGeometry();
    bgLineGeo.setAttribute('position', bgPos);
    bgLineGeo.setAttribute('color', bgCol);
    bgLineGeo.setIndex(bgEdgeIdx);
    const dot = makeDotTexture();
    scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({ vertexColors: true, size: 0.08, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true })));
    scene.add(new THREE.LineSegments(bgLineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true })));

    // synapse pulses that travel from node to node along the network
    const bgEdges: [number, number][] = [];
    for (let i = 0; i < bgEdgeIdx.length; i += 2) bgEdges.push([bgEdgeIdx[i], bgEdgeIdx[i + 1]]);
    const MAXP = 90;
    const pulsePos = new Float32Array(MAXP * 3);
    const pulseCol = new Float32Array(MAXP * 3);
    const pulsePosAttr = new THREE.BufferAttribute(pulsePos, 3);
    const pulseColAttr = new THREE.BufferAttribute(pulseCol, 3);
    const pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', pulsePosAttr);
    pulseGeo.setAttribute('color', pulseColAttr);
    scene.add(new THREE.Points(pulseGeo, new THREE.PointsMaterial({ vertexColors: true, size: 0.14, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true })));
    const pulses: { edge: number; t: number; speed: number }[] = [];
    let pulseAcc = 0;

    // ---- renderer + bloom ----
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(BG_COLOR, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.5);
    composer.addPass(bloom);

    // ---- load the rigged head (ARKit blendshapes) ----
    const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
    const loader = new GLTFLoader();
    loader.setKTX2Loader(ktx2);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load('/facecap.glb', (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) meshes.push(m);
      });
      // The face is the mesh with the most morph targets (blendshapes). Everything
      // else (eyeballs, teeth) is hidden — as wireframe they read as creepy orbs.
      let face: THREE.Mesh | null = null;
      for (const m of meshes) {
        const n = m.morphTargetInfluences?.length ?? 0;
        if (!face || n > (face.morphTargetInfluences?.length ?? 0)) face = m;
      }
      for (const m of meshes) {
        if (m === face && m.morphTargetDictionary) {
          const holo = new THREE.MeshBasicMaterial({
            color: accent.clone(),
            wireframe: true,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            fog: true,
          });
          m.material = holo;
          headMats.push(holo);
          headMesh = m;
          const d = m.morphTargetDictionary as Record<string, number>;
          mIdxBlinkL = morphIndex(d, 'eyeBlinkLeft', 'eyeBlink_L', 'blink_L');
          mIdxBlinkR = morphIndex(d, 'eyeBlinkRight', 'eyeBlink_R', 'blink_R');
          mIdxJaw = morphIndex(d, 'jawOpen', 'mouthOpen');
          mIdxMouth = morphIndex(d, 'mouthOpen');

          // Solid bg-colored occluder (shares geometry + morphs) so the interior
          // — teeth, mouth cavity, back of head — is hidden behind the surface.
          const fillMat = new THREE.MeshBasicMaterial({
            color: BG_COLOR,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          });
          const fill = new THREE.Mesh(m.geometry, fillMat);
          fill.morphTargetInfluences = m.morphTargetInfluences; // same array → in sync
          fill.morphTargetDictionary = m.morphTargetDictionary;
          fill.renderOrder = -1;
          m.add(fill);
        } else {
          m.visible = false;
        }
      }

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      root.position.sub(center);
      const scl = 2.0 / size.y;

      headHolder = new THREE.Group();
      headHolder.add(root);
      headHolder.scale.setScalar(scl);
      group.add(headHolder);
    });

    function resize() {
      const w = mount!.clientWidth, h = mount!.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0, roll = 0, gx = 0, gScale = 1;
    let blinkFactor = 0, blinkTimer = 2 + Math.random() * 3, blinking = false, blinkT = 0;
    let jawVal = 0;
    function onMove(e: MouseEvent) {
      targetYaw = (e.clientX / window.innerWidth - 0.5) * 2 * 0.5;
      targetPitch = (e.clientY / window.innerHeight - 0.5) * 2 * 0.3;
    }
    window.addEventListener('mousemove', onMove);

    const curColor = accent.clone();
    const tmpColor = new THREE.Color();
    const bgPosArr = bgPos.array as Float32Array;
    const bgColArr = bgCol.array as Float32Array;
    let t = 0;

    function frame(dtRaw: number) {
      const dt = Math.min(dtRaw, 0.05);
      t += dt;
      const st = stateRef.current;
      const p = paramsFor(st);
      tmpColor.set(JARVIS_STATE_META[st].color);
      curColor.lerp(tmpColor, Math.min(1, dt * 4));
      const cr = curColor.r, cg = curColor.g, cb = curColor.b;

      for (const mat of headMats) { mat.color.copy(curColor); mat.opacity = 0.4 * p.dim; }
      bloom.strength += (p.bloom - bloom.strength) * Math.min(1, dt * 3);

      // pose — mouse-follow + gentle idle sway, or webcam tracking when active.
      const live = liveRef.current;
      const tracking = live.active;
      if (tracking) {
        targetYaw = live.yaw;
        targetPitch = live.pitch;
      }
      const baseYaw = tracking ? 0 : -0.12, basePitch = tracking ? 0 : 0.03;
      const swayY = tracking ? 0 : Math.sin(t * 0.45) * 0.08;
      const swayP = tracking ? 0 : Math.sin(t * 0.33) * 0.04;
      const pe = Math.min(1, dt * (tracking ? 8 : 4));
      yaw += (targetYaw + baseYaw + swayY - yaw) * pe;
      pitch += (targetPitch + basePitch + swayP - pitch) * pe;
      roll += ((tracking ? live.roll : 0) - roll) * pe;

      const wide = window.innerWidth > 900;
      // Docked (chat mode): aside-left on desktop; small & tucked near the top on
      // mobile (kept on-screen — a big tY used to fly the face off the top).
      const tX = dockedRef.current ? (wide ? -1.4 : 0) : 0;
      const tY = dockedRef.current ? (wide ? 0.35 : 0.8) : 0;
      const tS = dockedRef.current ? (wide ? 0.6 : 0.5) : 1;
      gx += (tX - gx) * Math.min(1, dt * 3);
      gScale += (tS - gScale) * Math.min(1, dt * 3);
      group.position.x = gx;
      group.position.y += (tY - group.position.y) * Math.min(1, dt * 3);
      const breathe = 1 + Math.sin(t * p.breatheSpeed) * p.breatheAmp;
      group.scale.setScalar(gScale * breathe);
      group.rotation.y = yaw + (p.jitter ? (Math.random() - 0.5) * p.jitter : 0);
      group.rotation.x = pitch + (p.jitter ? (Math.random() - 0.5) * p.jitter : 0);
      group.rotation.z = roll;

      // blink
      if (st !== 'offline') {
        if (!blinking) {
          blinkTimer -= dt;
          if (blinkTimer <= 0) { blinking = true; blinkT = 0; }
          blinkFactor = 0;
        } else {
          blinkT += dt;
          const bp = blinkT / 0.15;
          blinkFactor = Math.sin(Math.min(bp, 1) * Math.PI); // 0→1→0
          if (bp >= 1) { blinking = false; blinkFactor = 0; blinkTimer = 2.5 + Math.random() * 4; }
        }
      } else blinkFactor = 0.5;

      // mouth (talking envelope)
      let jawTarget = 0;
      if (p.mouth === 'talk') {
        const env = (Math.sin(t * 13) * 0.5 + 0.5) * (Math.sin(t * 7.3) * 0.35 + 0.65);
        jawTarget = 0.12 + env * 0.4;
      } else if (p.mouth === 'soft') jawTarget = 0.04 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.05;
      jawVal += (jawTarget - jawVal) * Math.min(1, dt * 18);

      if (headMesh?.morphTargetInfluences) {
        const infl = headMesh.morphTargetInfluences;
        // When the webcam drives the face, mirror the user's blink/mouth instead
        // of the procedural blink + TTS envelope.
        const bl = tracking ? live.blinkL : blinkFactor;
        const br = tracking ? live.blinkR : blinkFactor;
        const jw = tracking ? live.jaw : jawVal;
        if (mIdxBlinkL >= 0) infl[mIdxBlinkL] = bl;
        if (mIdxBlinkR >= 0) infl[mIdxBlinkR] = br;
        if (mIdxJaw >= 0) infl[mIdxJaw] = jw;
        if (mIdxMouth >= 0 && mIdxMouth !== mIdxJaw) infl[mIdxMouth] = jw * 0.5;
      }

      // background drift + colors
      for (let i = 0; i < BG; i++) {
        const ph = bgSeed[i * 3], fr = bgSeed[i * 3 + 1], am = bgSeed[i * 3 + 2] * p.drift;
        bgPosArr[i * 3] = bgBase[i * 3] + Math.sin(t * fr + ph) * am;
        bgPosArr[i * 3 + 1] = bgBase[i * 3 + 1] + Math.cos(t * fr * 0.9 + ph) * am;
        const b = (0.5 + 0.5 * Math.sin(t * (fr + 0.4) + ph)) * 0.26 * p.dim;
        bgColArr[i * 3] = cr * b; bgColArr[i * 3 + 1] = cg * b; bgColArr[i * 3 + 2] = cb * b;
      }
      bgPos.needsUpdate = true;
      bgCol.needsUpdate = true;

      // synapse pulses travelling node → node
      pulseAcc += dt * 22 * p.drift;
      while (pulseAcc >= 1) {
        pulseAcc -= 1;
        if (bgEdges.length) {
          pulses.push({ edge: (Math.random() * bgEdges.length) | 0, t: 0, speed: 0.4 + Math.random() * 0.7 });
          if (pulses.length > MAXP) pulses.shift();
        }
      }
      for (let i = 0; i < MAXP * 3; i++) pulseCol[i] = 0;
      const stillAlive: { edge: number; t: number; speed: number }[] = [];
      for (const pl of pulses) {
        pl.t += dt * pl.speed;
        if (pl.t < 1) stillAlive.push(pl);
      }
      pulses.length = 0;
      pulses.push(...stillAlive);
      for (let i = 0; i < pulses.length && i < MAXP; i++) {
        const pl = pulses[i];
        const [a, b2] = bgEdges[pl.edge];
        pulsePos[i * 3] = bgPosArr[a * 3] + (bgPosArr[b2 * 3] - bgPosArr[a * 3]) * pl.t;
        pulsePos[i * 3 + 1] = bgPosArr[a * 3 + 1] + (bgPosArr[b2 * 3 + 1] - bgPosArr[a * 3 + 1]) * pl.t;
        pulsePos[i * 3 + 2] = bgPosArr[a * 3 + 2] + (bgPosArr[b2 * 3 + 2] - bgPosArr[a * 3 + 2]) * pl.t;
        const fade = Math.sin(pl.t * Math.PI) * p.dim;
        pulseCol[i * 3] = Math.min(1, cr + 0.3) * fade;
        pulseCol[i * 3 + 1] = Math.min(1, cg + 0.3) * fade;
        pulseCol[i * 3 + 2] = Math.min(1, cb + 0.3) * fade;
      }
      pulsePosAttr.needsUpdate = true;
      pulseColAttr.needsUpdate = true;

      composer.render();
    }

    let lastT = performance.now();
    if (reduce) frame(0);
    else renderer.setAnimationLoop((now) => { const dt = (now - lastT) / 1000; lastT = now; frame(dt); });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener('mousemove', onMove);
      ro.disconnect();
      ktx2.dispose();
      renderer.dispose();
      bgGeo.dispose(); bgLineGeo.dispose(); pulseGeo.dispose(); dot.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ---- webcam head tracking (MediaPipe FaceLandmarker), opt-in via `track` ----
  useEffect(() => {
    if (!track) {
      liveRef.current.active = false;
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let raf = 0;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close?: () => void } | null = null;
    let stream: MediaStream | null = null;
    const mat = new THREE.Matrix4();
    const eul = new THREE.Euler();
    const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

    (async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const { FaceLandmarker, FilesetResolver } = vision;
        const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
        landmarker = (await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        })) as unknown as typeof landmarker;

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        liveRef.current.active = true;

        const loop = () => {
          if (stopped) return;
          if (video.readyState >= 2 && landmarker) {
            const res = landmarker.detectForVideo(video, performance.now()) as {
              faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
              facialTransformationMatrixes?: { data: number[] }[];
            };
            const L = liveRef.current;
            const mtx = res.facialTransformationMatrixes?.[0]?.data;
            if (mtx) {
              mat.fromArray(mtx);
              eul.setFromRotationMatrix(mat, 'YXZ');
              // Mirror horizontally (webcam is a mirror) + clamp to a natural range.
              L.yaw = clamp(-eul.y * 1.1, 0.6);
              L.pitch = clamp(eul.x * 1.1, 0.45);
              L.roll = clamp(-eul.z, 0.4);
            }
            const bs = res.faceBlendshapes?.[0]?.categories;
            if (bs) {
              const get = (n: string) => bs.find((c) => c.categoryName === n)?.score ?? 0;
              L.blinkL = get('eyeBlinkLeft');
              L.blinkR = get('eyeBlinkRight');
              L.jaw = Math.max(get('jawOpen'), get('mouthOpen'));
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (err) {
        console.error('Camera tracking failed:', err);
        liveRef.current.active = false;
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      liveRef.current.active = false;
      try { landmarker?.close?.(); } catch { /* noop */ }
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [track]);

  return (
    <>
      <div ref={mountRef} className={styles.field} aria-hidden="true" />
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', bottom: 0, left: 0 }}
      />
    </>
  );
}
