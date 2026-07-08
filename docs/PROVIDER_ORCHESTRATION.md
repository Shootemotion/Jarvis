# PROVIDER ORCHESTRATION

> Los proveedores se separan **por capacidad**, no por marca. Groq puede ser *generation* pero **no** *embedding*. Nada de meter todo bajo `OPENAI_*`.

---

## 1. Capacidades (provider types)

| Capacidad | Qué hace | Ejemplos |
|-----------|----------|----------|
| `generation` | chat / completions | Groq, OpenAI, Anthropic, Ollama |
| `embedding` | vectores para memoria/RAG | OpenAI `text-embedding-3-small`, Ollama `nomic-embed-text` |
| `vision` | imágenes | OpenAI, Gemini (futuro) |
| `stt` | voz → texto | navegador (Web Speech), Deepgram/OpenAI (futuro) |
| `tts` | texto → voz | navegador, ElevenLabs/OpenAI (futuro) |
| `ocr` | imagen/PDF → texto | futuro |
| `reranking` | reordenar resultados de búsqueda | futuro |

Un mismo vendor puede cubrir varias capacidades, pero **cada capacidad se configura por separado**.

---

## 2. Variables de entorno (nuevo esquema)

En vez de `OPENAI_*` para todo:

```bash
# --- Chat / generation ---
CHAT_PROVIDER=groq              # groq | openai | anthropic | ollama
CHAT_BASE_URL=https://api.groq.com/openai/v1   # opcional (OpenAI-compat)
CHAT_API_KEY=gsk_...
CHAT_MODEL=llama-3.3-70b-versatile

# --- Embeddings (SEPARADO del chat) ---
EMBEDDING_PROVIDER=openai       # openai | ollama | (compat)
EMBEDDING_BASE_URL=             # opcional
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=768        # debe coincidir con la columna pgvector

# --- Voz (futuro server-side; hoy navegador) ---
STT_PROVIDER=browser
TTS_PROVIDER=browser

# --- Vision (futuro) ---
VISION_PROVIDER=

# --- Managed premium para todos (cloud sin Ollama) ---
MANAGED_LLM_FOR_ALL=true
```

**Compatibilidad hacia atrás:** si `CHAT_*` no está seteado, se cae a los viejos `OPENAI_*`/`OLLAMA_*` (para no romper lo que ya está en Render). Migración gradual.

> Groq no tiene `/embeddings` → si `CHAT_PROVIDER=groq`, hay que setear un `EMBEDDING_PROVIDER` real (OpenAI) para que la memoria semántica funcione. **No dejar la memoria "en pausa".**

---

## 3. Selección por tarea / costo / plan

El Orchestrator elige modelo con esta prioridad:

1. **BYO key** del usuario (cualquier plan) para esa capacidad.
2. **Preferencia del usuario** (`ai_settings.preferredProvider`).
3. **Por taskType** (mapa configurable):
   - `coding` → modelo fuerte (Claude / GPT-4-class); si no hay, el mejor disponible.
   - `answer`/`research` → modelo rápido/barato (Groq/Llama, gpt-4o-mini).
   - `planning` → modelo con buen razonamiento.
4. **Managed premium** si el plan lo permite (`premium_llm`) o `MANAGED_LLM_FOR_ALL`.
5. **Fallback**: Ollama (selfhost) o error claro si no hay proveedor.

Cada elección registra en `action_logs`: `{ taskType, chosenProvider, chosenModel, reason, estimatedCost, knowledgeSources, tools }`.

### Estimación de costo
`metering/pricing.ts` mantiene precios por 1M tokens por modelo. El plan del orchestrator incluye `estimatedCost`; las cuotas se chequean antes de ejecutar.

---

## 4. Capa de código (target)

```
packages/providers/
  types.ts            # AIProvider (generation), EmbeddingProvider, …
  generation/         # groq(openai-compat)/openai/anthropic/ollama
  embedding/          # openai/ollama
apps/api/src/providers/
  provider-registry.service.ts   # instancia por capacidad, desde config
  provider-selection.service.ts  # elige por task/cost/plan (parte del Orchestrator)
```

`ProviderRegistry` expone:
```ts
getGeneration(name?): AIProvider
getEmbedding(name?): EmbeddingProvider   // ← nunca Groq
listByCapability(cap): ProviderInfo[]
```

---

## 5. Estado actual → objetivo

- **Hoy:** `OPENAI_*` reutilizado para chat y embeddings (Groq rompe embeddings → memoria en pausa).
- **Objetivo (milestone):** `CHAT_*` y `EMBEDDING_*` separados; Groq para chat + OpenAI para embeddings → memoria semántica **activa** en Pro.
- La UI `/settings/providers` deja elegir Chat y Embedding por separado (managed por plan o BYO).
