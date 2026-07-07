'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api, AiSettings } from '@/lib/api';

const box: React.CSSProperties = {
  background: 'var(--panel,#121a24)',
  border: '1px solid var(--border,#1f2b38)',
  borderRadius: 14,
  padding: '1.25rem',
  marginBottom: '1.25rem',
};
const input: React.CSSProperties = {
  background: '#0b0f14',
  border: '1px solid #1f2b38',
  color: '#e6edf3',
  borderRadius: 10,
  padding: '0.55rem 0.7rem',
  font: 'inherit',
  outline: 'none',
  width: '100%',
};
const label: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--muted,#8b98a5)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: '0.35rem',
};

export default function AiSettingsPage() {
  const [s, setS] = useState<AiSettings | null>(null);
  const [preferredProvider, setPreferred] = useState('auto');
  const [model, setModel] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.getAiSettings().then((d) => {
      setS(d);
      setPreferred(d.preferredProvider);
      setModel(d.model ?? '');
    });

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { preferredProvider, model };
      if (anthropicKey) body.anthropicKey = anthropicKey;
      if (openaiKey) body.openaiKey = openaiKey;
      await api.updateAiSettings(body);
      setAnthropicKey('');
      setOpenaiKey('');
      await load();
      setMsg('Guardado ✓');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async (which: 'anthropic' | 'openai') => {
    await api.updateAiSettings(which === 'anthropic' ? { anthropicKey: '' } : { openaiKey: '' });
    await load();
  };

  return (
    <main style={{ maxWidth: 620, margin: '0 auto', padding: 'clamp(1rem,4vw,2.5rem)', color: '#e6edf3', minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>⚙️ Ajustes de IA</h1>
        <Link href="/" style={{ color: 'var(--accent,#38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Volver
        </Link>
      </div>

      {!s && <p style={{ color: 'var(--muted,#8b98a5)' }}>Cargando…</p>}

      {s && (
        <form onSubmit={save}>
          {/* Managed / included */}
          <section style={box}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Modelos premium</h2>
            <p style={{ color: 'var(--muted,#8b98a5)', fontSize: '0.85rem', marginTop: 0 }}>
              {s.managed.anthropic || s.managed.openai
                ? 'Incluidos en Pro: no necesitás configurar nada. Si sos Pro, ya usás Claude/GPT.'
                : 'Los modelos premium gestionados no están disponibles en este servidor. Podés usar tu propia key abajo (BYO).'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={label}>Proveedor preferido</label>
                <select style={input} value={preferredProvider} onChange={(e) => setPreferred(e.target.value)}>
                  <option value="auto">Automático</option>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">GPT (OpenAI)</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={label}>Modelo (opcional)</label>
                <input style={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="ej: claude-3-5-sonnet-latest" />
              </div>
            </div>
          </section>

          {/* BYO */}
          <section style={box}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Tu propia API key (opcional)</h2>
            <p style={{ color: 'var(--muted,#8b98a5)', fontSize: '0.85rem', marginTop: 0 }}>
              Si preferís usar tu cuenta de Anthropic/OpenAI, pegá tu key. Se guarda cifrada y nunca se muestra.
            </p>

            <div style={{ marginBottom: '0.9rem' }}>
              <label style={label}>
                Anthropic (Claude) {s.byo.anthropic && <span style={{ color: 'var(--ok,#34d399)' }}>· configurada ✓</span>}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input style={input} type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder={s.byo.anthropic ? '•••••••• (pegá una nueva para cambiar)' : 'sk-ant-...'} />
                {s.byo.anthropic && (
                  <button type="button" onClick={() => clearKey('anthropic')} style={{ ...input, width: 'auto', cursor: 'pointer', color: '#f87171' }}>Quitar</button>
                )}
              </div>
            </div>

            <div>
              <label style={label}>
                OpenAI (GPT) {s.byo.openai && <span style={{ color: 'var(--ok,#34d399)' }}>· configurada ✓</span>}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input style={input} type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder={s.byo.openai ? '•••••••• (pegá una nueva para cambiar)' : 'sk-...'} />
                {s.byo.openai && (
                  <button type="button" onClick={() => clearKey('openai')} style={{ ...input, width: 'auto', cursor: 'pointer', color: '#f87171' }}>Quitar</button>
                )}
              </div>
            </div>
          </section>

          <button type="submit" disabled={busy} style={{ background: 'var(--accent,#38bdf8)', color: '#04121a', border: 'none', borderRadius: 10, padding: '0.6rem 1.2rem', fontWeight: 600, cursor: 'pointer' }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          {msg && <span style={{ marginLeft: '1rem', color: msg.includes('✓') ? 'var(--ok,#34d399)' : '#fbbf24' }}>{msg}</span>}
        </form>
      )}
    </main>
  );
}
