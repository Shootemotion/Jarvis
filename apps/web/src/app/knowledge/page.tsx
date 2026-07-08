'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, KnowledgeDoc, KnowledgeHit, ProvidersInfo } from '@/lib/api';

const box: React.CSSProperties = {
  background: 'var(--panel,#0e1620)',
  border: '1px solid var(--border,#1b2836)',
  borderRadius: 14,
  padding: '1.25rem',
  marginBottom: '1.25rem',
};

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [providers, setProviders] = useState<ProvidersInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = () => api.listDocuments().then(setDocs).catch(() => setDocs([]));

  useEffect(() => {
    loadDocs();
    api.getProviders().then(setProviders).catch(() => {});
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.uploadKnowledge(Array.from(files));
      const ok = res.documents.filter((d) => d.status === 'indexed').length;
      setMsg(`Indexados ${ok}/${res.ingested} archivos ✓`);
      await loadDocs();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      setHits(await api.searchKnowledge({ query }));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    await api.deleteDocument(id);
    loadDocs();
  };

  const embeddingsOff = providers && !providers.embedding.configured;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(1rem,4vw,2.5rem)', color: '#eaf2fb', minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>📚 Conocimiento</h1>
        <Link href="/" style={{ color: 'var(--accent,#38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Volver
        </Link>
      </div>

      {embeddingsOff && (
        <div style={{ ...box, borderColor: '#fbbf24' }}>
          <strong style={{ color: '#fbbf24' }}>⚠️ Embeddings no configurados.</strong>
          <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.9rem', margin: '0.4rem 0 0' }}>
            Para indexar y buscar conocimiento hace falta un proveedor de embeddings. Configurá{' '}
            <code>EMBEDDING_API_KEY</code> (OpenAI) o <code>EMBEDDING_PROVIDER=local</code> en el servidor. Ver{' '}
            <Link href="/settings/providers" style={{ color: 'var(--accent,#38bdf8)' }}>Proveedores</Link>.
          </p>
        </div>
      )}

      {/* Upload */}
      <section style={box}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Importar Obsidian / documentos</h2>
        <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.85rem', marginTop: 0 }}>
          Subí archivos <code>.md</code> sueltos o un <code>.zip</code> de tu vault. Se conservan rutas, headings y tags.
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".md,.markdown,.txt,.zip"
          onChange={(e) => upload(e.target.files)}
          disabled={busy}
          style={{ color: '#eaf2fb' }}
        />
        {msg && <p style={{ color: msg.includes('✓') ? 'var(--ok,#34d399)' : '#fbbf24', fontSize: '0.85rem' }}>{msg}</p>}
      </section>

      {/* Search */}
      <section style={box}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Buscar en tu conocimiento</h2>
        <form onSubmit={search} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ej: ¿qué decidimos sobre el pricing?"
            style={{ flex: 1, background: '#0b0f14', border: '1px solid #1b2836', color: '#eaf2fb', borderRadius: 10, padding: '0.55rem 0.7rem' }}
          />
          <button type="submit" disabled={busy} style={{ background: 'var(--accent,#38bdf8)', color: '#041018', border: 'none', borderRadius: 10, padding: '0.55rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
            Buscar
          </button>
        </form>
        {hits && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {hits.length === 0 && <p style={{ color: 'var(--muted,#7f90a3)' }}>Sin resultados.</p>}
            {hits.map((h) => (
              <div key={h.id} style={{ background: '#0b0f14', border: '1px solid #1b2836', borderRadius: 10, padding: '0.7rem 0.85rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--accent-soft,#7dd3fc)', marginBottom: '0.3rem' }}>
                  📄 {h.path}{h.heading ? ` › ${h.heading}` : ''} · {(h.score * 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{h.content.slice(0, 400)}{h.content.length > 400 ? '…' : ''}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Documents */}
      <section style={box}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Documentos indexados ({docs.length})</h2>
        {docs.length === 0 && <p style={{ color: 'var(--muted,#7f90a3)', fontSize: '0.9rem' }}>Todavía no importaste nada.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {docs.map((d) => (
            <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border,#1b2836)', gap: '0.5rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.path}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted,#7f90a3)' }}>
                  {d.status} · {d.chunkCount} chunks{d.tags.length ? ` · #${d.tags.slice(0, 4).join(' #')}` : ''}
                </div>
              </div>
              <button onClick={() => del(d.id)} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
