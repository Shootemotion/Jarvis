'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ProvidersInfo } from '@/lib/api';

const box: React.CSSProperties = {
  background: 'var(--panel,#0e1620)',
  border: '1px solid var(--border,#1b2836)',
  borderRadius: 14,
  padding: '1.25rem',
  marginBottom: '1.25rem',
};
const dot = (ok: boolean): React.CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: ok ? 'var(--ok,#34d399)' : '#f87171',
  marginRight: 8,
});

export default function ProvidersPage() {
  const [p, setP] = useState<ProvidersInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getProviders().then(setP).catch((e) => setErr(String(e)));
  }, []);

  return (
    <main style={{ maxWidth: 620, margin: '0 auto', padding: 'clamp(1rem,4vw,2.5rem)', color: '#eaf2fb', minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>🔌 Proveedores</h1>
        <Link href="/" style={{ color: 'var(--accent,#38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>← Volver</Link>
      </div>

      <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.9rem' }}>
        JARVIS separa los proveedores <strong>por capacidad</strong>. El de chat y el de embeddings son independientes
        (p. ej. Groq para chat + OpenAI para embeddings).
      </p>

      {err && <p style={{ color: '#fbbf24' }}>{err}</p>}
      {!p && !err && <p style={{ color: 'var(--muted,#7f90a3)' }}>Cargando…</p>}

      {p && (
        <>
          <section style={box}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>💬 Chat / generación</h2>
            <p style={{ margin: '0.3rem 0' }}>
              <span style={dot(p.chat.name !== 'ollama')} />
              Proveedor activo: <strong>{p.chat.name}</strong>
            </p>
            {p.managedForAll && (
              <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.82rem', margin: 0 }}>
                Modo gestionado para todos activado (MANAGED_LLM_FOR_ALL).
              </p>
            )}
          </section>

          <section style={box}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>🧬 Embeddings (memoria / conocimiento)</h2>
            <p style={{ margin: '0.3rem 0' }}>
              <span style={dot(p.embedding.configured)} />
              {p.embedding.configured ? (
                <>Activo: <strong>{p.embedding.provider}</strong> · {p.embedding.model} · {p.embedding.dimensions}d</>
              ) : (
                <>No configurado</>
              )}
            </p>
            {!p.embedding.configured && (
              <p style={{ color: '#fbbf24', fontSize: '0.82rem', margin: 0 }}>
                Sin embeddings, la memoria semántica y la búsqueda de conocimiento están deshabilitadas.
                Configurá <code>EMBEDDING_API_KEY</code> (OpenAI) o <code>EMBEDDING_PROVIDER=local</code> en el servidor.
              </p>
            )}
          </section>

          <section style={{ ...box, marginBottom: 0 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Tu propia key (BYO)</h2>
            <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
              Podés usar tu cuenta de Anthropic/OpenAI para el chat desde Ajustes de IA.
            </p>
            <Link href="/settings/ai" style={{ color: 'var(--accent,#38bdf8)' }}>⚙️ Ajustes de IA →</Link>
          </section>
        </>
      )}
    </main>
  );
}
