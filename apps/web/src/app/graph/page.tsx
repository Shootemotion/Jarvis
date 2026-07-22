'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, KnowledgeGraph } from '@/lib/api';

// Canvas force-graph (no SSR — it touches window/canvas).
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false }) as any;

interface GNode {
  id: string;
  label: string;
  group: string;
  size: number;
  x?: number;
  y?: number;
}

function colorFor(group: string): string {
  if (group === 'obsidian') return '#a78bfa'; // violeta
  if (group === 'document') return '#38bdf8'; // cian
  if (group.startsWith('memory')) return '#34d399'; // verde
  return '#7dd3fc';
}

export default function GraphPage() {
  const [data, setData] = useState<KnowledgeGraph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const fgRef = useRef<any>(null);

  useEffect(() => {
    api.getGraph().then(setData).catch((e) => setErr(String(e)));
    const resize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const graphData = useMemo(
    () =>
      data
        ? { nodes: data.nodes.map((n) => ({ ...n })), links: data.edges.map((e) => ({ ...e })) }
        : { nodes: [], links: [] },
    [data],
  );

  const empty = data && data.nodes.length === 0;

  return (
    <main style={{ position: 'relative', height: '100dvh', background: '#060a0f', color: '#eaf2fb', overflow: 'hidden' }}>
      {/* Overlay header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-brand)', letterSpacing: '0.15em' }}>🕸 RED DE CONOCIMIENTO</h1>
          {data && (
            <div style={{ fontSize: '0.72rem', color: 'var(--muted,#7f90a3)', fontFamily: 'var(--font-hud)' }}>
              {data.nodes.length} nodos · {data.edges.length} conexiones
            </div>
          )}
        </div>
        <Link href="/" style={{ pointerEvents: 'auto', color: 'var(--accent,#38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>← Volver</Link>
      </div>

      {err && <p style={{ padding: '5rem 1.5rem', color: '#fbbf24' }}>{err}</p>}

      {empty && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '2rem' }}>
          <div style={{ color: 'var(--muted,#7f90a3)', maxWidth: 420 }}>
            <p style={{ fontSize: '1.05rem' }}>Todavía no hay conocimiento indexado.</p>
            <p style={{ fontSize: '0.9rem' }}>
              Subí notas en <Link href="/knowledge" style={{ color: 'var(--accent,#38bdf8)' }}>📚 Conocimiento</Link> o
              conversá con JARVIS. La red se teje sola por significado. (Requiere embeddings configurados.)
            </p>
          </div>
        </div>
      )}

      {data && !empty && (
        <ForceGraph2D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          graphData={graphData}
          backgroundColor="#060a0f"
          cooldownTicks={120}
          nodeRelSize={4}
          nodeLabel={(n: GNode) => n.label}
          linkColor={() => 'rgba(56,189,248,0.18)'}
          linkWidth={(l: { weight: number }) => Math.max(0.4, (l.weight - 0.6) * 4)}
          onNodeClick={(n: GNode) => {
            setSelected(n);
            if (fgRef.current) {
              fgRef.current.centerAt(n.x, n.y, 600);
              fgRef.current.zoom(3, 600);
            }
          }}
          onBackgroundClick={() => setSelected(null)}
          nodeCanvasObject={(node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
            const r = Math.max(2, node.size / 2.2);
            const c = colorFor(node.group);
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
            ctx.fillStyle = c;
            ctx.shadowColor = c;
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.shadowBlur = 0;
            if (scale > 1.4) {
              ctx.font = `${Math.max(3, 9 / scale)}px ui-monospace, monospace`;
              ctx.fillStyle = 'rgba(234,242,251,0.85)';
              ctx.fillText(node.label, node.x! + r + 1.5, node.y! + 2 / scale);
            }
          }}
        />
      )}

      {/* Selected node panel */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, maxWidth: 480, margin: '0 auto', zIndex: 10, background: 'color-mix(in srgb, #0e1620 80%, transparent)', border: `1px solid ${colorFor(selected.group)}`, borderRadius: 12, padding: '0.9rem 1.1rem', backdropFilter: 'blur(10px)' }}>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: colorFor(selected.group), fontFamily: 'var(--font-hud)' }}>
            {selected.group}
          </div>
          <div style={{ fontSize: '0.95rem', marginTop: '0.2rem' }}>{selected.label}</div>
        </div>
      )}
    </main>
  );
}
