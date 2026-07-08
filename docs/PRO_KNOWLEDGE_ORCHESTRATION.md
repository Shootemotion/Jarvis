# PRO KNOWLEDGE & ORCHESTRATION

> El diferencial de JARVIS Pro no es "una app linda", sino una **plataforma de conocimiento + orquestación**: lee el conocimiento del usuario, indexa Obsidian, consulta memoria semántica, orquesta varios modelos y herramientas, decide qué usar según tarea/costo/plan, ejecuta con permisos y guarda aprendizajes — todo auditado.

Este documento es la **arquitectura madre**. Los detalles viven en:
- [`MEMORY_ARCHITECTURE.md`](./MEMORY_ARCHITECTURE.md) — memoria semántica y tipos.
- [`PROVIDER_ORCHESTRATION.md`](./PROVIDER_ORCHESTRATION.md) — proveedores por capacidad y selección.
- [`OBSIDIAN_INTEGRATION.md`](./OBSIDIAN_INTEGRATION.md) — vault humano de conocimiento.

---

## 1. Router vs Orchestrator (la diferencia clave)

| | AI **Router** (lo que hay hoy) | AI **Orchestrator** (lo que construimos) |
|---|---|---|
| Alcance | Elige proveedor/modelo | Entiende la tarea completa |
| Decide | provider, model | taskType, privacidad, fuentes de conocimiento, herramientas, modelo + fallback, costo, confirmación, si guardar memoria |
| Conocimiento | ninguno | busca memoria + documentos + Obsidian y arma contexto |
| Ejecución | 1 llamada al modelo | pasos con permisos, herramientas y auditoría |
| Aprendizaje | ninguno | guarda resúmenes/decisiones/procedimientos |

El `ProviderRegistry` actual pasa a ser **una pieza** dentro del Orchestrator (la capa de proveedores), no el cerebro.

---

## 2. Capas de la arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        AI ORCHESTRATOR                        │
│  entiende la tarea → planifica → recupera → ejecuta → aprende │
└───────────────┬───────────────┬───────────────┬─────────────┘
                │               │               │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼───────┐
        │  KNOWLEDGE   │ │   MEMORY    │ │    TOOLS     │
        │   SOURCES    │ │   SYSTEM    │ │   REGISTRY   │
        └───────┬──────┘ └──────┬──────┘ └──────┬───────┘
                │               │               │
        ┌───────▼───────────────▼───────────────▼───────┐
        │              INGESTION PIPELINE                │
        │   ingest→parse→normalize→chunk→embed→store     │
        └───────────────────────┬───────────────────────┘
                                │
        ┌───────────────────────▼───────────────────────┐
        │                 PROVIDER LAYER                 │
        │  generation · embedding · vision · STT · TTS…  │
        └────────────────────────────────────────────────┘

     Transversal: Entitlements (plan) · Quotas · Audit log
```

### 2.1 Knowledge Sources
Orígenes de conocimiento del usuario: **Obsidian Vault**, **documentos subidos**, notas manuales; futuros: Google Drive, GitHub, Gmail, Calendar. Cada fuente se normaliza al mismo pipeline y se cita como fuente.

### 2.2 Memory System
Ver [`MEMORY_ARCHITECTURE.md`](./MEMORY_ARCHITECTURE.md). Tipos: `user_profile`, `preference`, `project`, `decision`, `procedure`, `task`, `conversation_summary`, `document_chunk`, `obsidian_chunk`, `action_log`.

### 2.3 AI Orchestrator — decisiones por tarea
Para cada request produce un **plan** (`OrchestrationPlan`):
```ts
interface OrchestrationPlan {
  taskType: 'answer'|'research'|'action'|'automation'|'coding'|'planning';
  privacyLevel: 'private'|'internal'|'public';
  projectId?: string;
  requiredKnowledgeSources: ('memory'|'documents'|'obsidian'|'web')[];
  requiredTools: string[];         // nombres del Tools Registry
  preferredModel: string;
  fallbackModel: string;
  estimatedCost: number;           // USD
  requiresConfirmation: boolean;
  shouldSaveMemory: boolean;
}
```
El plan respeta **plan del usuario, cuotas y permisos** (Entitlements). Toda decisión queda en el audit log con su porqué.

### 2.4 Provider Layer
Proveedores **separados por capacidad** (no todo bajo `OPENAI_*`): generation, embedding, vision, STT, TTS, OCR, reranking. Ver [`PROVIDER_ORCHESTRATION.md`](./PROVIDER_ORCHESTRATION.md).

### 2.5 Ingestion Pipeline
Pipeline común para todo tipo de documento. Ver §Document Ingestion en `MEMORY_ARCHITECTURE.md`.

### 2.6 Tools Registry
Cada herramienta declara `name, description, requiredPlan, requiredPermission, requiresConfirmation, costLevel, riskLevel` y se audita. Ver §8.

---

## 3. Modos de Agente/Workflow

| Modo | Qué hace | Herramientas | Estado |
|------|----------|--------------|--------|
| **Answer** | Responde con memoria/documentos/modelo | memory/documents/obsidian search | **Milestone actual** |
| **Research** | Busca en documentos/Obsidian/web, resume con fuentes | + web.search | diseño |
| **Action** | Usa herramientas con confirmación | tools con `requiresConfirmation` | diseño |
| **Automation** | Crea/dispara workflows (n8n) | n8n.trigger | diseño |
| **Coding** | Modelos buenos para código + contexto de repo | github.search | diseño |
| **Planning** | Divide tareas complejas en pasos | orchestrator recursivo | diseño |

Solo **Answer Mode** se implementa en el milestone actual; el resto queda en la capa de diseño.

---

## 4. Tools Registry (contrato)

```ts
interface ToolDef {
  name: string;                 // p.ej. "obsidian.search"
  description: string;
  requiredPlan: 'free'|'pro';
  requiredPermission?: string;  // scope OAuth / consentimiento
  requiresConfirmation: boolean;
  costLevel: 'none'|'low'|'medium'|'high';
  riskLevel: 'safe'|'read'|'write'|'external';
  run(args, ctx): Promise<ToolResult>;
}
```
Herramientas previstas: `obsidian.search`, `memory.search`, `documents.search` (milestone); `web.search`, `gmail.read`, `calendar.read`, `drive.search`, `github.search`, `n8n.trigger`, `browser.open` (futuro).

---

## 5. Transversales

- **Entitlements**: cada capacidad/herramienta chequea el plan (`EntitlementsService`).
- **Quotas**: mensajes/mes, embeddings, storage; medidas en `usage_logs`.
- **Audit**: `action_logs` registra tarea, plan elegido, fuentes usadas, herramientas, costo, resultado.

---

## 6. MILESTONE: Pro Knowledge Core (scope acotado)

**Objetivo:** que JARVIS lea el conocimiento del usuario y responda con fuentes.

Criterios de aceptación:
- [ ] Subir/importar `.md` de Obsidian (individual y `.zip`).
- [ ] Guardar fuente, ruta, headings y tags.
- [ ] Chunkear contenido.
- [ ] Generar embeddings (embedding provider **separado** del chat).
- [ ] Guardar chunks en pgvector.
- [ ] Buscar semánticamente desde la UI (`/knowledge`).
- [ ] Preguntar en chat y que JARVIS use esos chunks como contexto.
- [ ] Mostrar **fuentes usadas** (archivo/ruta) en la respuesta.
- [ ] Separar **chat provider** de **embedding provider**.
- [ ] Mostrar qué provider respondió y qué knowledge sources usó.
- [ ] Guardar **action/usage logs** básicos.

Fuera de scope (no tocar): más avatar/visual, otros modos de agente, integraciones OAuth, plugin de Obsidian.
