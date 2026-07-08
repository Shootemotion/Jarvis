'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiTokenInfo } from '@/lib/api';

const box: React.CSSProperties = {
  background: 'var(--panel,#0e1620)',
  border: '1px solid var(--border,#1b2836)',
  borderRadius: 14,
  padding: '1.25rem',
  marginBottom: '1.25rem',
};

export default function TokensPage() {
  const [tokens, setTokens] = useState<ApiTokenInfo[]>([]);
  const [name, setName] = useState('Obsidian');
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.listTokens().then(setTokens).catch(() => setTokens([]));
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const res = await api.createToken(name || 'Obsidian');
      setFresh(res.token);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('¿Revocar este token? El plugin que lo use dejará de funcionar.')) return;
    await api.revokeToken(id);
    load();
  };

  return (
    <main style={{ maxWidth: 620, margin: '0 auto', padding: 'clamp(1rem,4vw,2.5rem)', color: '#eaf2fb', minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>🔑 Tokens de API</h1>
        <Link href="/knowledge" style={{ color: 'var(--accent,#38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>← Conocimiento</Link>
      </div>

      <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.9rem' }}>
        Tokens personales para conectar el <strong>plugin de Obsidian</strong> (u otros clientes) con JARVIS.
        Se muestran una sola vez.
      </p>

      <section style={box}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Crear token</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej: Obsidian laptop)"
            style={{ flex: 1, background: '#0b0f14', border: '1px solid #1b2836', color: '#eaf2fb', borderRadius: 10, padding: '0.55rem 0.7rem' }}
          />
          <button onClick={create} disabled={busy} style={{ background: 'var(--accent,#38bdf8)', color: '#041018', border: 'none', borderRadius: 10, padding: '0.55rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
            {busy ? '…' : 'Crear'}
          </button>
        </div>
        {fresh && (
          <div style={{ marginTop: '0.9rem', background: '#0b0f14', border: '1px solid var(--ok,#34d399)', borderRadius: 10, padding: '0.7rem 0.85rem' }}>
            <div style={{ color: 'var(--ok,#34d399)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
              Copialo ahora — no se vuelve a mostrar:
            </div>
            <code style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{fresh}</code>
          </div>
        )}
      </section>

      <section style={{ ...box, marginBottom: 0 }}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Tus tokens</h2>
        {tokens.length === 0 && <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.9rem' }}>Todavía no creaste ninguno.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tokens.map((t) => (
            <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border,#1b2836)' }}>
              <div>
                <div style={{ fontSize: '0.9rem' }}>{t.name} <code style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.78rem' }}>{t.prefix}</code></div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted,#7f90a3)' }}>
                  {t.lastUsedAt ? `Usado ${new Date(t.lastUsedAt).toLocaleString('es-AR')}` : 'Sin uso'} · creado {new Date(t.createdAt).toLocaleDateString('es-AR')}
                </div>
              </div>
              <button onClick={() => revoke(t.id)} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                Revocar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
