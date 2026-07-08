# JARVIS Sync — plugin de Obsidian (Fase B)

Sincroniza tu vault de Obsidian con JARVIS Cloud como base de conocimiento
(embeddings + búsqueda semántica + citas en el chat).

## Cómo funciona
1. El plugin arma un **manifiesto** de tus `.md` (ruta + hash sha256).
2. Lo manda a `POST /api/knowledge/sync/manifest`; el server responde qué falta
   subir (nuevos/cambiados) y borra del lado servidor lo que ya no existe.
3. Sube sólo esos archivos en lotes a `POST /api/knowledge/sync/push`.
4. Se autentica con un **token personal** (`jrv_…`) — no usa tu login web.

Es idempotente: si no cambió nada, no re-indexa.

## Instalación (manual, desktop)
1. Copiá esta carpeta a `TU_VAULT/.obsidian/plugins/jarvis-sync/`
   (deben quedar `manifest.json` y `main.js` dentro).
2. En Obsidian → **Ajustes → Community plugins** → activá **JARVIS Sync**.
3. Abrí los ajustes del plugin y completá:
   - **API URL**: `https://jarvis-api-9u1u.onrender.com`
   - **Token de API**: generalo en JARVIS → **Ajustes → Tokens** (empieza con `jrv_`).
   - **Carpetas excluidas** (opcional).
4. Tocá **Sincronizar ahora** (o el ícono ⟳ en la barra lateral, o el comando
   "Sincronizar vault con JARVIS").

## Requisitos
- Es **desktop only** (usa `crypto` de Node para el hash).
- Necesitás embeddings configurados en el server (`EMBEDDING_API_KEY`), si no
  la indexación no corre.

## Privacidad
- Sólo se suben `.md` que no estén en carpetas excluidas.
- El token es de alcance `sync`. Podés revocarlo desde JARVIS → Ajustes → Tokens.
