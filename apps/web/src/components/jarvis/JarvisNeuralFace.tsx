'use client';

import { useEffect, useRef } from 'react';
import styles from './Jarvis.module.css';
import { JARVIS_STATE_META, JarvisVisualState } from './types';

interface Props {
  state: JarvisVisualState;
  /** When true the head docks to a corner (chat mode); otherwise it's centered. */
  docked?: boolean;
}

interface Vert {
  u: number;
  v: number;
  x: number;
  y: number;
  z: number;
  mouthW: number; // mouth reactivity (0..1)
  mouthSide: number; // +1 upper lip, -1 lower lip
}

interface AmbientNode {
  x: number;
  y: number;
  phase: number;
  freq: number;
  amp: number;
  size: number;
}

interface Pulse {
  edge: number;
  t: number;
  speed: number;
  from: number;
}

interface StateParams {
  trail: number;
  amp: number;
  breatheSpeed: number;
  breatheAmp: number;
  pulseRate: number;
  jitter: number;
  dim: number;
  mouth: 'talk' | 'idle' | 'closed' | 'soft';
}

function paramsFor(s: JarvisVisualState): StateParams {
  switch (s) {
    case 'idle':
      return { trail: 0.2, amp: 1, breatheSpeed: 1.1, breatheAmp: 0.01, pulseRate: 16, jitter: 0, dim: 1, mouth: 'idle' };
    case 'listening':
      return { trail: 0.22, amp: 1.1, breatheSpeed: 2.2, breatheAmp: 0.014, pulseRate: 30, jitter: 0, dim: 1.1, mouth: 'soft' };
    case 'thinking':
      return { trail: 0.3, amp: 1.2, breatheSpeed: 2.6, breatheAmp: 0.01, pulseRate: 70, jitter: 0, dim: 1.12, mouth: 'closed' };
    case 'speaking':
      return { trail: 0.26, amp: 1, breatheSpeed: 3, breatheAmp: 0.012, pulseRate: 52, jitter: 0, dim: 1.18, mouth: 'talk' };
    case 'tool_call':
      return { trail: 0.24, amp: 1.1, breatheSpeed: 2, breatheAmp: 0.01, pulseRate: 40, jitter: 0, dim: 1.05, mouth: 'closed' };
    case 'confirmation_required':
      return { trail: 0.2, amp: 1, breatheSpeed: 4, breatheAmp: 0.02, pulseRate: 20, jitter: 0, dim: 1, mouth: 'idle' };
    case 'error':
      return { trail: 0.32, amp: 1.8, breatheSpeed: 9, breatheAmp: 0.02, pulseRate: 24, jitter: 2, dim: 1, mouth: 'closed' };
    case 'offline':
      return { trail: 0.12, amp: 0.15, breatheSpeed: 0.6, breatheAmp: 0.005, pulseRate: 0, jitter: 0, dim: 0.36, mouth: 'closed' };
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const gauss = (t: number, mu: number, sig: number) => Math.exp(-((t - mu) ** 2) / (2 * sig * sig));
const gauss2 = (u: number, v: number, mu: number, mv: number, su: number, sv: number) =>
  Math.exp(-((u - mu) ** 2) / (2 * su * su) - ((v - mv) ** 2) / (2 * sv * sv));

const COLS = 24;
const ROWS = 30;
const RZ = 0.7; // depth scale for shading

/** Sculpted front-facing head surface. (u,v) in [-1,1] → 3D point. */
function faceSurface(u: number, v: number) {
  // silhouette: widest at cheeks, narrower at crown and (more) at chin
  const profile = v >= 0 ? 1 - 0.36 * Math.pow(v, 1.6) : 1 - 0.6 * Math.pow(-v, 1.35);
  const halfW = 0.82;
  const halfH = 1.04;
  const depth = 0.6;

  const x = u * halfW * profile;
  const y = v * halfH;

  // rounded base (front hemisphere)
  let z = Math.sqrt(Math.max(0, 1 - u * u * 0.9 - v * v * 0.82)) * depth;

  // brow ridge
  z += gauss(v, 0.3, 0.1) * gauss(u, 0, 0.45) * 0.05;
  // nose bridge + tip (protrudes)
  z += gauss(u, 0, 0.1) * gauss(v, -0.02, 0.22) * 0.36;
  z += gauss(u, 0, 0.06) * gauss(v, -0.08, 0.07) * 0.16;
  // nostrils flare
  z += (gauss2(u, v, -0.08, -0.16, 0.05, 0.05) + gauss2(u, v, 0.08, -0.16, 0.05, 0.05)) * 0.05;
  // eye sockets (indent)
  z -= (gauss2(u, v, -0.34, 0.1, 0.16, 0.11) + gauss2(u, v, 0.34, 0.1, 0.16, 0.11)) * 0.13;
  // mouth groove
  z -= gauss2(u, v, 0, -0.46, 0.3, 0.055) * 0.05;
  // chin
  z += gauss2(u, v, 0, -0.82, 0.22, 0.12) * 0.04;

  return { x, y, z };
}

function buildFace() {
  const verts: Vert[] = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const u = (i / (COLS - 1)) * 2 - 1;
      const v = (j / (ROWS - 1)) * 2 - 1;
      const s = faceSurface(u, v);
      const mouthW = gauss(u, 0, 0.28) * gauss(v, -0.46, 0.12);
      verts.push({ u, v, x: s.x, y: s.y, z: s.z, mouthW, mouthSide: v > -0.46 ? 1 : -1 });
    }
  }
  const edges: [number, number][] = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const idx = j * COLS + i;
      if (i < COLS - 1) edges.push([idx, idx + 1]);
      if (j < ROWS - 1) edges.push([idx, idx + COLS]);
    }
  }
  // eyes computed on the surface, pushed slightly forward
  const eyes = [-0.34, 0.34].map((eu) => {
    const s = faceSurface(eu, 0.1);
    return { x: s.x, y: s.y, z: s.z + 0.04 };
  });
  return { verts, edges, eyes };
}

export function JarvisNeuralFace({ state, docked = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dockedRef = useRef(docked);
  dockedRef.current = docked;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const cv: HTMLCanvasElement = canvas;
    const ctx: CanvasRenderingContext2D = context;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const face = buildFace();
    const VN = face.verts.length;
    const sx = new Array<number>(VN);
    const sy = new Array<number>(VN);
    const sz = new Array<number>(VN);
    const eyeS = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];

    let ambient: AmbientNode[] = [];
    let ambientEdges: [number, number][] = [];
    let ambX: number[] = [];
    let ambY: number[] = [];
    let facePulses: Pulse[] = [];
    let ambPulses: Pulse[] = [];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let last = performance.now();
    let faceAcc = 0;
    let ambAcc = 0;

    let mouthOpen = 0;
    let blinkFactor = 1;
    let blinkTimer = 2 + Math.random() * 3;
    let blinking = false;
    let blinkT = 0;

    let yaw = 0;
    let pitch = 0;
    let targetYaw = 0;
    let targetPitch = 0;

    let cx = 0;
    let cy = 0;
    let scale = 0;

    function layoutTarget() {
      const min = Math.min(width, height);
      if (dockedRef.current) {
        if (width > 900) return { x: Math.max(160, width * 0.16), y: height * 0.5, s: min * 0.2 };
        return { x: width * 0.5, y: height * 0.16, s: min * 0.16 };
      }
      return { x: width * 0.5, y: height * 0.46, s: min * 0.34 };
    }

    function onMove(e: MouseEvent) {
      targetYaw = (e.clientX / width - 0.5) * 2 * 0.5;
      targetPitch = (e.clientY / height - 0.5) * 2 * 0.32;
    }
    window.addEventListener('mousemove', onMove);

    function buildAmbient() {
      const count = Math.max(50, Math.min(150, Math.floor((width * height) / 15000)));
      ambient = [];
      for (let i = 0; i < count; i++) {
        ambient.push({ x: Math.random(), y: Math.random(), phase: Math.random() * Math.PI * 2, freq: 0.2 + Math.random() * 0.5, amp: 5 + Math.random() * 12, size: 0.5 + Math.random() * 1 });
      }
      ambientEdges = [];
      const seen = new Set<string>();
      for (let i = 0; i < ambient.length; i++) {
        const d: { j: number; v: number }[] = [];
        for (let j = 0; j < ambient.length; j++) {
          if (i === j) continue;
          d.push({ j, v: ((ambient[i].x - ambient[j].x) * width) ** 2 + ((ambient[i].y - ambient[j].y) * height) ** 2 });
        }
        d.sort((m, n) => m.v - n.v);
        for (let n = 0; n < 2; n++) {
          const j = d[n].j;
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          ambientEdges.push([i, j]);
        }
      }
      ambX = new Array(ambient.length);
      ambY = new Array(ambient.length);
    }

    function resize() {
      const rect = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      cv.width = Math.max(1, Math.floor(width * dpr));
      cv.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildAmbient();
      if (cx === 0) {
        const lt = layoutTarget();
        cx = lt.x;
        cy = lt.y;
        scale = lt.s;
      }
    }
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    const FOCAL = 3.4;
    let raf = 0;

    function project(x: number, y: number, z: number, cyaw: number, syaw: number, cpit: number, spit: number) {
      const x1 = x * cyaw + z * syaw;
      const z1 = -x * syaw + z * cyaw;
      const y2 = y * cpit - z1 * spit;
      const z2 = y * spit + z1 * cpit;
      const persp = FOCAL / (FOCAL + z2);
      // canvas Y grows downward → negate so +y (top of head) maps up
      return { px: cx + x1 * scale * persp, py: cy - y2 * scale * persp, pz: z2, persp };
    }

    function render(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const st = stateRef.current;
      const p = paramsFor(st);
      const [r, g, b] = hexToRgb(JARVIS_STATE_META[st].color);
      const rgb = `${r},${g},${b}`;
      const brgb = `${Math.min(255, r + 100)},${Math.min(255, g + 100)},${Math.min(255, b + 100)}`;
      const t = now / 1000;

      const lt = layoutTarget();
      const le = Math.min(1, dt * 3.5);
      cx += (lt.x - cx) * le;
      cy += (lt.y - cy) * le;
      scale += (lt.s - scale) * le;

      const swayY = Math.sin(t * 0.5) * 0.1;
      const swayP = Math.sin(t * 0.37) * 0.05;
      const pe = Math.min(1, dt * 4);
      yaw += (targetYaw + swayY - yaw) * pe;
      pitch += (targetPitch + swayP - pitch) * pe;
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const cpit = Math.cos(pitch);
      const spit = Math.sin(pitch);

      let target = 0.02;
      if (p.mouth === 'talk') {
        const env = (Math.sin(t * 13) * 0.5 + 0.5) * (Math.sin(t * 7.3) * 0.35 + 0.65);
        target = 0.25 + env * 0.75;
      } else if (p.mouth === 'soft') target = 0.05 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.05;
      else if (p.mouth === 'closed') target = 0;
      mouthOpen += (target - mouthOpen) * Math.min(1, dt * 18);

      if (st !== 'offline') {
        if (!blinking) {
          blinkTimer -= dt;
          if (blinkTimer <= 0) {
            blinking = true;
            blinkT = 0;
          }
          blinkFactor = 1;
        } else {
          blinkT += dt;
          const bp = blinkT / 0.15;
          blinkFactor = 1 - Math.sin(Math.min(bp, 1) * Math.PI) * 0.9;
          if (bp >= 1) {
            blinking = false;
            blinkFactor = 1;
            blinkTimer = 2.5 + Math.random() * 4;
          }
        }
      } else blinkFactor = 0.5;

      const breathe = 1 + Math.sin(t * p.breatheSpeed) * p.breatheAmp;
      const jit = p.jitter;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(8,11,17,${p.trail})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      // ---- ambient circuit field ----
      for (let i = 0; i < ambient.length; i++) {
        const n = ambient[i];
        ambX[i] = n.x * width + Math.sin(t * n.freq + n.phase) * n.amp * p.amp;
        ambY[i] = n.y * height + Math.cos(t * n.freq * 0.9 + n.phase) * n.amp * p.amp;
      }
      ctx.lineWidth = 1;
      for (const [a, c] of ambientEdges) {
        const d = Math.hypot(ambX[a] - ambX[c], ambY[a] - ambY[c]);
        const alpha = Math.max(0, 0.045 * (1 - d / (Math.min(width, height) * 0.18))) * p.dim;
        if (alpha <= 0.002) continue;
        ctx.strokeStyle = `rgba(${rgb},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(ambX[a], ambY[a]);
        ctx.lineTo(ambX[c], ambY[c]);
        ctx.stroke();
      }
      for (let i = 0; i < ambient.length; i++) {
        const tw = 0.4 + 0.6 * Math.sin(t * (ambient[i].freq + 0.5) + ambient[i].phase);
        ctx.fillStyle = `rgba(${rgb},${0.14 * tw * p.dim})`;
        ctx.beginPath();
        ctx.arc(ambX[i], ambY[i], ambient[i].size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- project face verts ----
      for (let i = 0; i < VN; i++) {
        const n = face.verts[i];
        let ny = n.y;
        let nz = n.z;
        if (n.mouthW > 0.02) {
          ny += mouthOpen * n.mouthW * 0.16 * n.mouthSide;
          nz -= mouthOpen * n.mouthW * 0.08;
        }
        const nx = n.x * breathe;
        ny *= breathe;
        nz *= breathe;
        const jx = jit ? (Math.random() - 0.5) * jit * 3 : 0;
        const jy = jit ? (Math.random() - 0.5) * jit * 3 : 0;
        const pr = project(nx, ny, nz, cyaw, syaw, cpit, spit);
        sx[i] = pr.px + jx;
        sy[i] = pr.py + jy;
        sz[i] = pr.pz;
      }
      for (let e = 0; e < 2; e++) {
        const pr = project(face.eyes[e].x, face.eyes[e].y * breathe, face.eyes[e].z, cyaw, syaw, cpit, spit);
        eyeS[e] = { x: pr.px, y: pr.py, z: pr.pz };
      }

      // faint face volume glow (subtle, not washing)
      const grad = ctx.createRadialGradient(cx, cy, scale * 0.2, cx, cy, scale * 1.1);
      grad.addColorStop(0, `rgba(${rgb},${0.05 * p.dim})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // ---- face mesh (depth-shaded lines) ----
      ctx.lineWidth = 1;
      for (const [a, c] of face.edges) {
        const shade = Math.max(0.05, Math.min(1, ((sz[a] + sz[c]) / 2 + 0.15) / (RZ + 0.15)));
        ctx.strokeStyle = `rgba(${rgb},${(0.08 + shade * 0.42) * p.dim})`;
        ctx.beginPath();
        ctx.moveTo(sx[a], sy[a]);
        ctx.lineTo(sx[c], sy[c]);
        ctx.stroke();
      }
      // vertices (subtle)
      for (let i = 0; i < VN; i++) {
        const shade = Math.max(0.05, Math.min(1, (sz[i] + 0.15) / (RZ + 0.15)));
        ctx.fillStyle = `rgba(${rgb},${0.28 * shade * p.dim})`;
        ctx.beginPath();
        ctx.arc(sx[i], sy[i], 0.9 * shade + 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- eyes (bright, blink via vertical squash) ----
      for (const eye of eyeS) {
        const R2 = scale * 0.05;
        // socket glow
        const eg = ctx.createRadialGradient(eye.x, eye.y, 0, eye.x, eye.y, R2 * 3);
        eg.addColorStop(0, `rgba(${brgb},${0.5 * p.dim})`);
        eg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, R2 * 3, 0, Math.PI * 2);
        ctx.fill();
        // pupil (squashes vertically when blinking)
        ctx.fillStyle = `rgba(${brgb},${p.dim})`;
        ctx.beginPath();
        ctx.ellipse(eye.x, eye.y, R2, Math.max(0.4, R2 * blinkFactor), 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- pulses along mesh + ambient ----
      const spawn = (arr: Pulse[], edges: [number, number][], rate: number, acc: number) => {
        let a = acc;
        while (a >= 1) {
          a -= 1;
          const edge = (Math.random() * edges.length) | 0;
          const [ea, eb] = edges[edge];
          arr.push({ edge, t: 0, speed: 0.8 + Math.random() * 1.4, from: Math.random() < 0.5 ? ea : eb });
          if (arr.length > 130) arr.shift();
        }
        return a;
      };
      if (p.pulseRate > 0) {
        faceAcc = spawn(facePulses, face.edges, p.pulseRate, faceAcc + dt * p.pulseRate * 0.55);
        ambAcc = spawn(ambPulses, ambientEdges, p.pulseRate, ambAcc + dt * p.pulseRate * 0.6);
      }
      const drawPulses = (arr: Pulse[], edges: [number, number][], xs: number[], ys: number[], size: number) => {
        const next: Pulse[] = [];
        for (const pl of arr) {
          pl.t += dt * pl.speed;
          if (pl.t >= 1) continue;
          const [ea, eb] = edges[pl.edge];
          const to = pl.from === ea ? eb : ea;
          const x = xs[pl.from] + (xs[to] - xs[pl.from]) * pl.t;
          const y = ys[pl.from] + (ys[to] - ys[pl.from]) * pl.t;
          const fade = Math.sin(pl.t * Math.PI);
          ctx.fillStyle = `rgba(${brgb},${0.85 * fade * p.dim})`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
          next.push(pl);
        }
        return next;
      };
      ambPulses = drawPulses(ambPulses, ambientEdges, ambX, ambY, 1.4);
      facePulses = drawPulses(facePulses, face.edges, sx, sy, 1.8);

      ctx.globalCompositeOperation = 'source-over';
      if (!reduce) raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);
    if (reduce) {
      cancelAnimationFrame(raf);
      render(performance.now());
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.field} aria-hidden="true" />;
}
