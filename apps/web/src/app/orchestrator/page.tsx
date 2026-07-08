'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ActionLogEntry, ToolInfo } from '@/lib/api';

const box: React.CSSProperties = {
  background: 'var(--panel,#0e1620)',
  border: '1px solid var(--border,#1b2836)',
  borderRadius: 14,
  padding: '1.25rem',
  marginBottom: '1.25rem',
};

const riskColor: Record<string, string> = {
  safe: '#34d399',
  read: '#38bdf8',
  write: '#fbbf24',
  external: '#f87171',
};

export default function OrchestratorPage() {
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);

  useEffect(() => {
    api.getOrchestratorRecent().then(setLogs).catch(() => {});
    api.getTools().then(setTools).catch(() => {});
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(1rem,4vw,2.5rem)', color: '#eaf2fb', minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>🧭 Orquestador</h1>
        <Link href="/" style={{ color: 'var(--accent,#38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>← Volver</Link>
      </div>

      <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.9rem' }}>
        El orquestador entiende cada tarea, elige el modelo y las fuentes según tarea/costo/plan, y audita las decisiones.
      </p>

      <section style={box}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Decisiones recientes</h2>
        {logs.length === 0 && <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.9rem' }}>Todavía no hay actividad.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {logs.map((l) => (
            <li key={l.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border,#1b2836)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>
                  <span style={{ color: 'var(--accent-soft,#7dd3fc)' }}>⚙ {l.taskType}</span>{' '}
                  · {l.provider ?? '—'} / {l.model ?? '—'}
                </span>
                <span style={{ color: 'var(--muted,#7f90a3)' }}>
                  {new Date(l.createdAt).toLocaleString('es-AR')}
                </span>
              </div>
              <div style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                🧠 {l.knowledgeSources} fuentes · 🔧 {l.toolsUsed.join(', ') || 'ninguna'} · ~US${l.estimatedCost.toFixed(4)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ ...box, marginBottom: 0 }}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Herramientas</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tools.map((t) => (
            <li key={t.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border,#1b2836)', fontSize: '0.85rem' }}>
              <span style={{ opacity: t.enabled ? 1 : 0.4, flex: 1 }}>
                <code style={{ color: t.enabled ? 'var(--accent-soft,#7dd3fc)' : 'var(--muted,#7f90a3)' }}>{t.name}</code>
                <span style={{ color: 'var(--muted,#7f90a3)' }}> — {t.description}</span>
              </span>
              <span style={{ fontSize: '0.68rem', color: riskColor[t.riskLevel] ?? '#7f90a3' }}>{t.riskLevel}</span>
              <span style={{ fontSize: '0.68rem', color: t.enabled ? 'var(--ok,#34d399)' : 'var(--muted,#7f90a3)' }}>
                {t.enabled ? 'activa' : 'pronto'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
