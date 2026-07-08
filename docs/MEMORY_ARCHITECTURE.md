# MEMORY ARCHITECTURE

> Memoria semántica + conocimiento del usuario, sobre PostgreSQL + pgvector. En **Pro está siempre activa** (requiere un embedding provider real, separado del chat — ver [`PROVIDER_ORCHESTRATION.md`](./PROVIDER_ORCHESTRATION.md)).

---

## 1. Tipos de memoria

| Tipo | Qué guarda | Origen |
|------|-----------|--------|
| `user_profile` | quién es el usuario | perfil / inferido |
| `preference` | preferencias de trabajo/estilo | usuario / feedback |
| `project` | contexto de proyectos | manual / inferido |
| `decision` | decisiones tomadas + porqué | conversaciones |
| `procedure` | cómo hacer algo (pasos) | conversaciones / docs |
| `task` | tareas / pendientes | conversaciones |
| `conversation_summary` | resúmenes de charlas largas | auto-resumen |
| `document_chunk` | fragmentos de documentos subidos | ingestion pipeline |
| `obsidian_chunk` | fragmentos del vault de Obsidian | ingestion pipeline |
| `action_log` | qué hizo JARVIS (auditoría) | orchestrator/tools |

Los tipos "conocimiento" (`document_chunk`, `obsidian_chunk`) viven en tablas dedicadas (`documents` + `document_chunks`) con su propio metadata (fuente, ruta, headings, tags), no en la tabla `memories` genérica. Las memorias "cognitivas" (profile/preference/decision/…) siguen en `memories`.

---

## 2. Modelo de datos

### `memories` (ya existe)
`id, userId, projectId?, type, content, source, confidence, tags[], visibility, canBeUsedAutomatically, embedding vector(768), timestamps`.

### `documents` (nuevo — milestone)
```
id, userId, projectId?
source            -- 'obsidian' | 'upload'
title
path              -- ruta original en el vault (p.ej. "Proyectos/Jarvis/plan.md")
mime              -- text/markdown, application/pdf, …
tags[]            -- de frontmatter / #tags
bytes
status            -- 'pending' | 'indexing' | 'indexed' | 'error'
chunkCount
createdAt, updatedAt
```

### `document_chunks` (nuevo — milestone)
```
id, documentId, userId
projectId?
source            -- redundante para filtrar rápido
path
heading           -- heading más cercano (H1/H2/H3) del chunk
tags[]
ord               -- orden dentro del documento
content
embedding vector(768)
createdAt
índices: (userId), (documentId), ivfflat/hnsw sobre embedding (futuro)
```

> Se reutiliza `vector(768)` para no re-migrar. Embeddings vía `text-embedding-3-small` truncado a 768 (o `nomic-embed-text`).

---

## 3. Ingestion Pipeline (común a todas las fuentes)

```
ingest → parse → normalize → chunk → embed → store → index → retrieve → cite
```

1. **ingest**: recibir archivo (upload / zip / futuro connector).
2. **parse**: extraer texto según tipo (Markdown, PDF, TXT; DOCX/XLSX futuro).
3. **normalize**: limpiar, extraer frontmatter (tags), detectar headings.
4. **chunk**: dividir por headings + tamaño (~500–1000 tokens, con solape), guardando el heading de cada chunk.
5. **embed**: embedding provider (batch).
6. **store**: `documents` + `document_chunks` (con embedding).
7. **index**: marcar `status='indexed'`, `chunkCount`.
8. **retrieve**: búsqueda semántica (cosine `<=>`) filtrando por user/proyecto/fuente.
9. **cite**: cada resultado expone `path` + `heading` como **fuente citable**.

### Formatos
Markdown, PDF, TXT (milestone). DOCX, XLSX, GitHub MD, Drive docs → futuro (mismo pipeline, distinto parser).

---

## 4. Recuperación (retrieval) para el chat

Cuando el Orchestrator arma contexto (Answer Mode):
1. Embeddear la consulta con el **embedding provider**.
2. Buscar en `memories` (cognitivas, `canBeUsedAutomatically`) **y** en `document_chunks` (conocimiento), por cosine similarity, filtrando por `userId` (+ proyecto/fuente si aplica).
3. Umbral mínimo de score; top-K por fuente.
4. Inyectar como bloque de contexto citando `path/heading`.
5. Devolver `sources[]` al frontend para mostrarlas.

```ts
interface KnowledgeHit {
  kind: 'memory' | 'document';
  content: string;
  source?: string;   // 'obsidian' | 'upload'
  path?: string;     // ruta citable
  heading?: string;
  score: number;
}
```

---

## 5. Guardado de aprendizajes

Tras una interacción, el Orchestrator puede decidir `shouldSaveMemory` y guardar `decision`/`procedure`/`conversation_summary`. Todo guardado queda con `source` y (opcional) `projectId`. Editable/borrable desde `/memory`.

---

## 6. Privacidad y permisos

- `visibility` (`private`/`internal`/`public`) y `canBeUsedAutomatically` controlan qué se inyecta sin pedir permiso.
- El conocimiento nunca cruza entre usuarios (scope `userId`, futura RLS en Postgres).
- Los secretos (frontmatter con tokens, etc.) no se indexan (filtro en normalize).
