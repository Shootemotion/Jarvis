'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import styles from './memory.module.css';
import {
  api,
  Memory,
  MemorySearchHit,
  MEMORY_TYPES,
  Project,
} from '@/lib/api';

export default function MemoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filterType, setFilterType] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [type, setType] = useState('preference');
  const [content, setContent] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Search
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MemorySearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? '—';

  const load = () => {
    api
      .listMemories({
        type: filterType || undefined,
        projectId: filterProject || undefined,
      })
      .then(setMemories)
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterProject]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createMemory({
        type,
        content: content.trim(),
        projectId: projectId || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setContent('');
      setTags('');
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteMemory(id);
    load();
  };

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.searchMemories({
        query: query.trim(),
        projectId: filterProject || undefined,
      });
      setHits(res);
    } finally {
      setSearching(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>🧠 Memoria</h1>
        <Link href="/" className={styles.back}>
          ← Volver al chat
        </Link>
      </div>

      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      {/* Create */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Nueva memoria</h2>
        <form className={styles.formGrid} onSubmit={create}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Tipo</label>
              <select
                className={styles.select}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Proyecto</label>
              <select
                className={styles.select}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">(sin proyecto)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contenido</label>
            <textarea
              className={styles.textarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Ej: Bruno prefiere respuestas breves y en español rioplatense."
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Tags (separados por coma)</label>
            <input
              className={styles.input}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="estilo, preferencias"
            />
          </div>
          <button className={styles.button} type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar memoria'}
          </button>
        </form>
      </section>

      {/* Search */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Búsqueda semántica</h2>
        <form className={styles.row} onSubmit={runSearch}>
          <input
            className={styles.input}
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por significado…"
          />
          <button className={styles.button} type="submit" disabled={searching}>
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
        {hits && (
          <div className={styles.list} style={{ marginTop: '1rem' }}>
            {hits.length === 0 && <p className={styles.empty}>Sin resultados.</p>}
            {hits.map((h) => (
              <div key={h.id} className={styles.memory}>
                <div className={styles.memoryTop}>
                  <span className={styles.badge}>{h.type}</span>
                  <span className={styles.score}>
                    similitud {(h.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className={styles.content}>{h.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* List */}
      <section>
        <div className={styles.filters}>
          <select
            className={styles.select}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">Todos los tipos</option>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className={styles.score}>{memories.length} memorias</span>
        </div>

        <div className={styles.list}>
          {memories.length === 0 && (
            <p className={styles.empty}>No hay memorias todavía.</p>
          )}
          {memories.map((m) => (
            <div key={m.id} className={styles.memory}>
              <div className={styles.memoryTop}>
                <span className={styles.badge}>{m.type}</span>
                <button
                  className={styles.delete}
                  onClick={() => remove(m.id)}
                  aria-label="Eliminar"
                >
                  Eliminar
                </button>
              </div>
              <p className={styles.content}>{m.content}</p>
              <div className={styles.tags}>
                <span className={styles.tag}>proyecto: {projectName(m.projectId)}</span>
                {m.tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    #{t}
                  </span>
                ))}
                {!m.canBeUsedAutomatically && (
                  <span className={styles.tag}>uso manual</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
