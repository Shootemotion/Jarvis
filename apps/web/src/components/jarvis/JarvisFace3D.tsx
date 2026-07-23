'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import styles from './Jarvis.module.css';
import { JARVIS_STATE_META, JarvisVisualState } from './types';

interface Props {
  state: JarvisVisualState;
  docked?: boolean;
  /** When true, the webcam (MediaPipe FaceLandmarker) drives head pose + face. */
  track?: boolean;
  /**
   * 'follow' = the head turns toward where you are (looks at you); 'mirror' =
   * the head imitates your pose + blink + mouth. Default 'follow'.
   */
  trackMode?: 'follow' | 'mirror';
}

const BG_COLOR = 0x04060a;

// Avatar model: a Ready Player Me bust (neck/shoulders + ARKit morphs) when
// NEXT_PUBLIC_AVATAR_URL is set; otherwise the built-in facecap head.
const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || '/facecap.glb';
const BUST = AVATAR_URL !== '/facecap.glb';

const MP_VERSION = '0.10.35';
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Live tracking values written by MediaPipe, read by the render loop. */
interface LiveFace {
  active: boolean;
  mode: 'follow' | 'mirror';
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
export function JarvisFace3D({ state, docked = false, track = false, trackMode = 'follow' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dockedRef = useRef(docked);
  dockedRef.current = docked;
  const trackModeRef = useRef(trackMode);
  trackModeRef.current = trackMode;
  const liveRef = useRef<LiveFace>({
    active: false,
    mode: 'follow',
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

    // ---- organic neural field (branching dendrites — NOT a triangle plexus) ----
    const dot = makeDotTexture();
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const nX: number[] = [], nY: number[] = [], nZ: number[] = [], nPhase: number[] = [], nHue: number[] = [];
    const edgeIdx: number[] = [];
    const somaNodes: number[] = [];

    const addNode = (x: number, y: number, z: number, hue: number, soma = false) => {
      const i = nX.length;
      nX.push(x); nY.push(y); nZ.push(z); nPhase.push(Math.random() * Math.PI * 2); nHue.push(hue);
      if (soma) somaNodes.push(i);
      return i;
    };
    // Neural network: big cell bodies (hubs/soma) surrounded by dendrite nodes,
    // all cross-linked (nearest-neighbour web) + hub↔hub axons → everything
    // connects to everything, no loose dead-end tips.
    const hubIdx: number[] = [];
    const HUBS = 15;
    for (let h = 0; h < HUBS; h++) {
      const hue = rand(-0.05, 0.16);
      // Kept within the camera frustum so the web actually fills the view.
      const hx = rand(-6.5, 6.5), hy = rand(-4.2, 4.2), hz = rand(-2, -7.5);
      const hi = addNode(hx, hy, hz, hue, true);
      hubIdx.push(hi);
      const branches = 7 + ((Math.random() * 6) | 0);
      for (let b = 0; b < branches; b++) {
        const r = rand(0.9, 2.8);
        const th = rand(0, Math.PI * 2);
        const bx = hx + Math.cos(th) * r;
        const by = hy + Math.sin(th) * r * 0.85;
        const bz = hz + rand(-1, 1) * r * 0.5;
        const bi = addNode(bx, by, bz, hue, false);
        edgeIdx.push(hi, bi); // radial dendrite
      }
    }
    const N0 = nX.length;
    const dist2 = (i: number, j: number) => {
      const dx = nX[i] - nX[j], dy = nY[i] - nY[j], dz = nZ[i] - nZ[j];
      return dx * dx + dy * dy + dz * dz;
    };
    const seenEdge = new Set<string>();
    const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    for (let e = 0; e < edgeIdx.length; e += 2) seenEdge.add(key(edgeIdx[e], edgeIdx[e + 1]));
    const pushEdge = (a: number, b: number) => {
      if (a === b) return;
      const k = key(a, b);
      if (seenEdge.has(k)) return;
      seenEdge.add(k);
      edgeIdx.push(a, b);
    };
    // Cross-link every node to its 2 nearest neighbours (interconnected web).
    for (let i = 0; i < N0; i++) {
      const cands: { j: number; d: number }[] = [];
      for (let j = 0; j < N0; j++) if (i !== j) cands.push({ j, d: dist2(i, j) });
      cands.sort((a, b) => a.d - b.d);
      let added = 0;
      for (const c of cands) {
        if (added >= 2) break;
        if (c.d < 4.5 * 4.5) { pushEdge(i, c.j); added++; }
      }
    }
    // Long axons between hubs → global connectivity.
    for (const hi of hubIdx) {
      const cands = hubIdx.filter((h) => h !== hi).map((h) => ({ h, d: dist2(hi, h) })).sort((a, b) => a.d - b.d);
      for (let k = 0; k < 3 && k < cands.length; k++) pushEdge(hi, cands[k].h);
    }

    const BG = nX.length;
    const bgBase = new Float32Array(BG * 3);
    const bgSeed = new Float32Array(BG);
    const nodeBase = new Float32Array(BG * 3); // static per-node color (cyan→blue→violet variety)
    const baseCol = new THREE.Color();
    for (let i = 0; i < BG; i++) {
      bgBase[i * 3] = nX[i]; bgBase[i * 3 + 1] = nY[i]; bgBase[i * 3 + 2] = nZ[i];
      bgSeed[i] = nPhase[i];
      baseCol.setHSL((0.55 + nHue[i] + 1) % 1, 0.85, 0.6);
      nodeBase[i * 3] = baseCol.r; nodeBase[i * 3 + 1] = baseCol.g; nodeBase[i * 3 + 2] = baseCol.b;
    }
    const bgPos = new THREE.BufferAttribute(bgBase, 3); // static positions
    const bgCol = new THREE.BufferAttribute(new Float32Array(BG * 3), 3);
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', bgPos);
    bgGeo.setAttribute('color', bgCol);
    // Fat, glowing dendrite strands (Line2 → real thickness, unlike 1px lines).
    const segPos: number[] = [];
    const segCol: number[] = [];
    for (let e = 0; e < edgeIdx.length; e += 2) {
      const a = edgeIdx[e], b = edgeIdx[e + 1];
      segPos.push(nX[a], nY[a], nZ[a], nX[b], nY[b], nZ[b]);
      segCol.push(
        nodeBase[a * 3], nodeBase[a * 3 + 1], nodeBase[a * 3 + 2],
        nodeBase[b * 3], nodeBase[b * 3 + 1], nodeBase[b * 3 + 2],
      );
    }
    const lineGeo2 = new LineSegmentsGeometry();
    lineGeo2.setPositions(segPos);
    lineGeo2.setColors(segCol);
    const lineMat2 = new LineMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 2.4, // pixels
      opacity: 0.85,
    });
    lineMat2.resolution.set(mount.clientWidth || 1, mount.clientHeight || 1);
    const fatLines = new LineSegments2(lineGeo2, lineMat2);

    // Container group → gentle global drift (motion without stretching branches).
    const bgGroup = new THREE.Group();
    scene.add(bgGroup);
    bgGroup.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({ vertexColors: true, size: 0.1, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true })));
    bgGroup.add(fatLines);

    // Soma (cell bodies) — bigger glowing dots.
    const somaPos = new Float32Array(somaNodes.length * 3);
    for (let i = 0; i < somaNodes.length; i++) {
      const s = somaNodes[i];
      somaPos[i * 3] = nX[s]; somaPos[i * 3 + 1] = nY[s]; somaPos[i * 3 + 2] = nZ[s];
    }
    const somaGeo = new THREE.BufferGeometry();
    somaGeo.setAttribute('position', new THREE.BufferAttribute(somaPos, 3));
    const somaColAttr = new THREE.BufferAttribute(new Float32Array(somaNodes.length * 3), 3);
    somaGeo.setAttribute('color', somaColAttr);
    // Core dot + a soft halo → the cell bodies read as glowing "forms", not points.
    bgGroup.add(new THREE.Points(somaGeo, new THREE.PointsMaterial({ vertexColors: true, size: 0.85, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true })));
    bgGroup.add(new THREE.Points(somaGeo, new THREE.PointsMaterial({ vertexColors: true, size: 2.1, map: dot, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true })));

    // Bokeh depth particles (soft out-of-focus glow dust).
    const BOK = 95;
    const bokPos = new Float32Array(BOK * 3);
    for (let i = 0; i < BOK; i++) { bokPos[i * 3] = rand(-11, 11); bokPos[i * 3 + 1] = rand(-7, 7); bokPos[i * 3 + 2] = rand(-4, -13); }
    const bokGeo = new THREE.BufferGeometry();
    bokGeo.setAttribute('position', new THREE.BufferAttribute(bokPos, 3));
    bgGroup.add(new THREE.Points(bokGeo, new THREE.PointsMaterial({ color: 0x2f6fd0, size: 1.0, map: dot, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true })));

    // Synapse pulses travelling along the dendrites.
    const bgEdges: [number, number][] = [];
    for (let i = 0; i < edgeIdx.length; i += 2) bgEdges.push([edgeIdx[i], edgeIdx[i + 1]]);
    const MAXP = 120;
    const pulsePos = new Float32Array(MAXP * 3);
    const pulseCol = new Float32Array(MAXP * 3);
    const pulsePosAttr = new THREE.BufferAttribute(pulsePos, 3);
    const pulseColAttr = new THREE.BufferAttribute(pulseCol, 3);
    const pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', pulsePosAttr);
    pulseGeo.setAttribute('color', pulseColAttr);
    bgGroup.add(new THREE.Points(pulseGeo, new THREE.PointsMaterial({ vertexColors: true, size: 0.3, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true })));
    const pulses: { edge: number; t: number; speed: number }[] = [];
    let pulseAcc = 0;
    const somaColArr = somaColAttr.array as Float32Array;

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
    // Bottom-fade shader (bust mode): dissolve the lower body into the background.
    const addBottomFade = (mat: THREE.MeshBasicMaterial) => {
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader =
          'varying float vFadeY;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n  vFadeY = position.y;',
          );
        shader.fragmentShader =
          'varying float vFadeY;\n' +
          shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            '#include <dithering_fragment>\n  gl_FragColor.a *= smoothstep(-0.85, 0.05, vFadeY);',
          );
      };
    };

    loader.load(AVATAR_URL, (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) meshes.push(m);
      });
      // The face is the mesh with the most morph targets (blendshapes).
      let face: THREE.Mesh | null = null;
      for (const m of meshes) {
        const n = m.morphTargetInfluences?.length ?? 0;
        if (!face || n > (face.morphTargetInfluences?.length ?? 0)) face = m;
      }

      const makeHolo = () => {
        const holo = new THREE.MeshBasicMaterial({
          color: accent.clone(),
          wireframe: true,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          fog: true,
        });
        if (BUST) addBottomFade(holo);
        headMats.push(holo);
        return holo;
      };

      for (const m of meshes) {
        const name = (m.name || '').toLowerCase();
        const isEye = /eye/.test(name) && !/brow|lash|glass/.test(name);
        const isMouthPart = /teeth|tooth|tongue|mouthinterior/.test(name);

        if (m === face && m.morphTargetDictionary) {
          const holo = makeHolo();
          m.material = holo;
          headMesh = m;
          const d = m.morphTargetDictionary as Record<string, number>;
          mIdxBlinkL = morphIndex(d, 'eyeBlinkLeft', 'eyeBlink_L', 'blink_L');
          mIdxBlinkR = morphIndex(d, 'eyeBlinkRight', 'eyeBlink_R', 'blink_R');
          mIdxJaw = morphIndex(d, 'jawOpen', 'mouthOpen');
          mIdxMouth = morphIndex(d, 'mouthOpen');
          // Solid bg-colored occluder so the interior/back isn't visible through the wire.
          const fillMat = new THREE.MeshBasicMaterial({
            color: BG_COLOR,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          });
          const fill = new THREE.Mesh(m.geometry, fillMat);
          fill.morphTargetInfluences = m.morphTargetInfluences;
          fill.morphTargetDictionary = m.morphTargetDictionary;
          fill.renderOrder = -1;
          m.add(fill);
        } else if (BUST && isEye) {
          // Glowing eyes (solid, not wireframe) — no empty sockets.
          const eyeMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0xbfefff),
            transparent: true,
            opacity: 0.9,
          });
          m.material = eyeMat;
        } else if (BUST && !isMouthPart) {
          // Neck, shoulders, hair, body → holographic wireframe.
          m.material = makeHolo();
        } else {
          m.visible = false;
        }
      }

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      let scl: number;
      if (BUST) {
        // Frame roughly the top third (head + shoulders); lower body fades out.
        const span = size.y * 0.34;
        root.position.set(-center.x, -(box.max.y - span / 2), -center.z);
        scl = 2.0 / span;
      } else {
        // Clean head (facecap). Procedural bust reverted — looked bad blind.
        root.position.sub(center);
        scl = 2.0 / size.y;
      }

      headHolder = new THREE.Group();
      headHolder.add(root);
      headHolder.scale.setScalar(scl);
      group.add(headHolder);
    });

    function resize() {
      const w = mount!.clientWidth, h = mount!.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      lineMat2.resolution.set(w, h);
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
    const bgTmp = new THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };
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

      // Background field drifts slowly through nearby tones (independent of the
      // head color) so it feels alive / neural.
      curColor.getHSL(hsl);
      bgTmp.setHSL(
        (hsl.h + 0.12 * Math.sin(t * 0.06) + 1) % 1,
        Math.min(1, hsl.s * 1.1 + 0.1),
        Math.min(0.7, hsl.l + 0.08),
      );
      const bcr = bgTmp.r, bcg = bgTmp.g, bcb = bgTmp.b;

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
        // In mirror mode, copy the user's blink/mouth. In follow mode keep the
        // natural procedural blink + TTS envelope (only the head turns to you).
        const imitate = tracking && live.mode === 'mirror';
        const bl = imitate ? live.blinkL : blinkFactor;
        const br = imitate ? live.blinkR : blinkFactor;
        const jw = imitate ? live.jaw : jawVal;
        if (mIdxBlinkL >= 0) infl[mIdxBlinkL] = bl;
        if (mIdxBlinkR >= 0) infl[mIdxBlinkR] = br;
        if (mIdxJaw >= 0) infl[mIdxJaw] = jw;
        if (mIdxMouth >= 0 && mIdxMouth !== mIdxJaw) infl[mIdxMouth] = jw * 0.5;
      }

      // Branches static; animate brightness (shimmer), soma glow, and a gentle
      // global drift (so it breathes without stretching the dendrites).
      for (let i = 0; i < BG; i++) {
        const b = (0.32 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.8 + bgSeed[i]))) * p.dim;
        bgColArr[i * 3] = nodeBase[i * 3] * b;
        bgColArr[i * 3 + 1] = nodeBase[i * 3 + 1] * b;
        bgColArr[i * 3 + 2] = nodeBase[i * 3 + 2] * b;
      }
      bgCol.needsUpdate = true;
      for (let i = 0; i < somaNodes.length; i++) {
        const s = somaNodes[i];
        const b = (0.7 + 0.5 * Math.sin(t * 1.1 + bgSeed[s])) * p.dim;
        somaColArr[i * 3] = Math.min(1, nodeBase[s * 3] * b + 0.12);
        somaColArr[i * 3 + 1] = Math.min(1, nodeBase[s * 3 + 1] * b + 0.12);
        somaColArr[i * 3 + 2] = Math.min(1, nodeBase[s * 3 + 2] * b + 0.18);
      }
      somaColAttr.needsUpdate = true;
      bgGroup.rotation.y = Math.sin(t * 0.045) * 0.05;
      bgGroup.rotation.z = Math.sin(t * 0.03) * 0.025;
      bgGroup.position.x = Math.sin(t * 0.05) * 0.15;

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
        pulseCol[i * 3] = Math.min(1, bcr + 0.35) * fade;
        pulseCol[i * 3 + 1] = Math.min(1, bcg + 0.35) * fade;
        pulseCol[i * 3 + 2] = Math.min(1, bcb + 0.35) * fade;
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
      bgGeo.dispose(); lineGeo2.dispose(); lineMat2.dispose(); pulseGeo.dispose(); dot.dispose();
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
              faceLandmarks?: { x: number; y: number; z: number }[][];
              faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
              facialTransformationMatrixes?: { data: number[] }[];
            };
            const L = liveRef.current;
            const mode = trackModeRef.current;
            L.mode = mode;

            if (mode === 'mirror') {
              // Imitate your head orientation (mirror). --- flip signs here if reversed ---
              const mtx = res.facialTransformationMatrixes?.[0]?.data;
              if (mtx) {
                mat.fromArray(mtx);
                eul.setFromRotationMatrix(mat, 'YXZ');
                L.yaw = clamp(-eul.y * 1.1, 0.6);
                L.pitch = clamp(eul.x * 1.1, 0.45);
                L.roll = clamp(-eul.z, 0.4);
              }
            } else {
              // Follow: turn toward where you are (nose position in frame).
              // --- flip the (fx-0.5)/(fy-0.5) signs here if it turns the wrong way ---
              const lm = res.faceLandmarks?.[0];
              const nose = lm?.[1];
              if (nose) {
                L.yaw = clamp((nose.x - 0.5) * 1.8, 0.6);
                L.pitch = clamp((nose.y - 0.5) * 1.2, 0.4);
                L.roll = 0;
              }
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
