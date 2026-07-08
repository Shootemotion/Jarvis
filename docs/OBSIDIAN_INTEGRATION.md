# OBSIDIAN INTEGRATION

> Obsidian es el **Human Knowledge Vault** de JARVIS: el conocimiento curado por el usuario. Se trata como fuente de primera clase, citable por archivo/ruta.

Se integra en **dos fases**. Solo la **Fase A** entra en el milestone actual.

---

## Fase A — Import manual (MILESTONE actual)

El usuario trae su vault a JARVIS Cloud sin instalar nada.

### Entradas
- Subir **`.md` individuales**.
- Subir **`.zip`** del vault completo (o de una carpeta).

### Procesamiento
- Mantener **rutas** relativas (`Carpeta/Sub/archivo.md`) → se guardan en `documents.path`.
- Extraer **frontmatter** YAML (`tags`, `aliases`, etc.) y **`#tags`** inline.
- Indexar **headings** (H1/H2/H3): cada chunk recuerda su heading más cercano.
- **Chunkear** por headings + tamaño; generar **embeddings**; guardar en `document_chunks` (pgvector).
- Ignorar archivos no-markdown del zip (imágenes, `.obsidian/`, adjuntos) en esta fase.
- No indexar contenido marcado como secreto (frontmatter `private: true` o carpetas excluidas).

### Salida / uso
- **Búsqueda semántica** desde `/knowledge`.
- El chat (Answer Mode) usa los chunks como contexto y **cita** `path` + `heading`.
- Reindexar: volver a subir un archivo con la misma `path` reemplaza sus chunks.

### Modelo de datos
Ver [`MEMORY_ARCHITECTURE.md`](./MEMORY_ARCHITECTURE.md) → `documents` (`source='obsidian'`) + `document_chunks`.

### Endpoints (milestone)
```
POST /api/knowledge/upload        # multipart: uno o varios .md / un .zip
GET  /api/knowledge/documents     # lista + estado de indexación
DELETE /api/knowledge/documents/:id
POST /api/knowledge/search        # { query, projectId? } → chunks citados
```

---

## Fase B — Connector / Plugin (DISEÑO, no implementar aún)

Sincronización viva del vault local ↔ JARVIS Cloud.

### Opciones
- **Plugin de Obsidian** (community plugin) que observa el vault, o
- **Connector local** (pequeño agente/CLI) que watchea la carpeta.

### Comportamiento
- Detecta archivos **nuevos / modificados / eliminados** (hash + mtime) y sincroniza el delta.
- **Sync selectivo** por carpeta/proyecto (allow-list).
- **Respeta permisos** y **no expone secretos** (mismos filtros que Fase A + config del usuario).
- Autenticación con token de JARVIS (scope acotado a knowledge sync).
- Idempotente: re-sync no duplica chunks (clave por `userId + path + contentHash`).

### Protocolo (borrador)
```
POST /api/knowledge/sync/manifest   # cliente envía {path, hash, mtime}[] → server responde qué falta
POST /api/knowledge/sync/push       # sube contenidos faltantes/cambiados
POST /api/knowledge/sync/delete     # marca borrados
```

> Fase B queda en arquitectura. **No** se implementa en el milestone Pro Knowledge Core.

---

## Citas / trazabilidad

Toda respuesta basada en Obsidian muestra la **fuente**: `📄 Carpeta/archivo.md › Heading`. El usuario puede confiar y verificar de dónde salió cada afirmación. Esto es central al valor Pro.
