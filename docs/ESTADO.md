# JARVIS — Estado del proyecto

_Asistente de IA personal, modular y provider-agnóstico. SaaS Pro-first (multiusuario, hosteado) con opción self-host. Habla en español._

Última actualización: **2026-07-08**

---

## 🌐 En producción (live)

| Pieza | Dónde | URL |
|------|-------|-----|
| **Web** (frontend) | Vercel | https://jarvis-web-virid.vercel.app |
| **API** (backend) | Render (Docker, free) | https://jarvis-api-9u1u.onrender.com |
| **Base de datos** | Supabase (Postgres + pgvector) | Session pooler `:5432` |
| **Auth** | Supabase Auth (Google + email) | — |
| **Repo** | GitHub | https://github.com/Shootemotion/Jarvis |

> ⚠️ Render free **se duerme** tras inactividad → la primera request tarda ~50s en despertar.

---

## 🧱 Stack técnico

- **Monorepo** pnpm workspaces + Turborepo.
- **Frontend:** Next.js 15 (App Router) + React 19 + Three.js + MediaPipe. Tipografías Orbitron / JetBrains Mono / Inter.
- **Backend:** NestJS 10 + Prisma 5.
- **DB:** PostgreSQL + pgvector (embeddings 768d).
- **IA:** provider-agnóstico (Ollama local, OpenAI, Anthropic, y cualquier endpoint compatible con OpenAI como **Groq**).
- **Deploy:** Docker (API en Render), Vercel (web), Supabase (DB+Auth).

### Estructura del repo
```
apps/
  api/        NestJS (auth, chat, memory, billing, providers, metering…)
  web/        Next.js (UI, avatar 3D, voz)
packages/
  config/     Schema de entorno (zod) compartido
  providers/  Implementaciones de proveedores de IA (Ollama/OpenAI/Anthropic)
  ai-router/  (router base)
docs/         PRO_ARCHITECTURE.md, DEPLOY.md, ESTADO.md
```

---

## ✅ Qué está construido

### Cuentas y planes
- **Auth** con Supabase (login Google + email/password), verificación JWT por JWKS.
- Multiusuario: todo scopeado por `user_id`.
- **Planes**: `free` y `pro`, con *feature flags* (premium_llm, neural_voice, integrations, agents, automations, cloud_sync) y **límites** (mensajes/mes, memorias, storage, minutos de voz).
- **Entitlements**: gating por plan. Free como fallback seguro.

### Chat + IA
- Chat con historial, contexto de sistema y **memoria semántica** (pgvector, recall automático best-effort).
- **Resolución de proveedor**: BYO key (cualquier plan) → premium gestionado (Pro / o `MANAGED_LLM_FOR_ALL`) → Ollama.
- Soporte **OpenAI-compatible** vía `OPENAI_BASE_URL` → permite usar **Groq gratis** para pruebas.
- **BYO keys** cifradas en reposo (AES-256-GCM), nunca se devuelven al cliente.
- **Medición y cuotas**: `usage_logs` con costo estimado, tope mensual de mensajes por plan (`/api/usage`).

### Billing (Mercado Pago)
- Suscripción Pro vía **preapproval** de Mercado Pago (`billing/`).
- Webhook con verificación de firma opcional.
- **Modo DEV** (sin token MP): checkout simulado para probar el flujo Pro localmente.
- Página `/settings/billing`: estado, precio, alta, cancelación, historial.

### Voz
- **STT en tiempo real** con la Web Speech API nativa del navegador (sin descargar modelos). Whisper local queda de fallback.
- **TTS** con las voces del navegador/OS. Selector de voz en la UI. (Edge trae voces neuronales "Online (Natural)" mucho mejores.)

### Avatar 3D (Jarvis Visual Interface)
- Cara 3D holográfica (`facecap.glb`, wireframe + bloom) que **parpadea, mueve la boca y sigue el mouse**.
- **8 estados visuales** (idle, listening, thinking, speaking, tool_call, confirmation_required, error, offline).
- **Seguimiento por cámara (MediaPipe FaceLandmarker)**, opt-in, dos modos:
  - **👁 Seguir** (default): la cara gira para mirarte según dónde estés.
  - **🪞 Reflejo**: la cara imita tu pose, parpadeo y boca en tiempo real.

### UI / UX
- Estética **HUD futurista** (glass, glow cian, tipografías técnicas).
- **Dos modos**: 🎙 **Voz** (por defecto, minimalista, micrófono central) y 💬 **Chat** (mensajes + input + controles completos).
- Mobile-first / responsive; PWA-ready.

---

## ⚙️ Variables de entorno (Render — API)

| Variable | Para qué | Valor actual (pruebas) |
|----------|----------|------------------------|
| `DEPLOYMENT_MODE` | modo cloud/selfhost | `cloud` |
| `DATABASE_URL` | Postgres de Supabase (pooler `:5432`) | _(secreto)_ |
| `SUPABASE_URL` | auth | `https://yxapvogmjacfxhnusloy.supabase.co` |
| `JARVIS_ENCRYPTION_KEY` | cifra las BYO keys | _(secreto — no cambiar nunca)_ |
| `MANAGED_LLM_FOR_ALL` | IA gestionada para todos | `true` |
| `OPENAI_API_KEY` | motor de chat (y embeddings) | key de **Groq** (`gsk_…`) |
| `OPENAI_BASE_URL` | endpoint compatible | `https://api.groq.com/openai/v1` |
| `OPENAI_DEFAULT_MODEL` | modelo | `llama-3.3-70b-versatile` |
| `PUBLIC_WEB_URL` / `CORS_ORIGINS` | dominio del front | URL de Vercel |
| `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` | Mercado Pago | _(vacío → billing en DEV)_ |

### Web (Vercel)
| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://jarvis-api-9u1u.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yxapvogmjacfxhnusloy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key |

> Guía completa de deploy en [`docs/DEPLOY.md`](./DEPLOY.md).

---

## 🧪 Configuración actual de pruebas
- **IA = Groq (gratis)** vía endpoint compatible con OpenAI. Sin gastar crédito de OpenAI.
- **Embeddings/memoria semántica**: en pausa mientras se usa Groq (Groq no hace embeddings). Se reactiva al pasar a OpenAI real (`text-embedding-3-small`, 768d, sin re-migrar).
- **Billing**: modo DEV (checkout simulado) hasta cargar el token real de Mercado Pago.

---

## 🗺️ Pendientes / próximos pasos

- [ ] **Cargar `OPENAI_API_KEY` real de OpenAI** cuando termine la etapa de pruebas (reactiva embeddings/memoria).
- [ ] **Mercado Pago productivo**: token + secret + webhook público; definir precio real, trial y plan anual.
- [ ] **Definir el tier Free en la nube** (hoy Free caería a Ollama; por eso `MANAGED_LLM_FOR_ALL`). Decidir cupo gestionado vs "requiere Pro".
- [ ] **Voces premium** (TTS de pago: OpenAI/ElevenLabs) si las del navegador no alcanzan.
- [ ] **Ajuste fino cámara**: verificar sentido del giro en modo Seguir/Reflejo.
- [ ] **Pulido visual del avatar**: fondo (red neuronal) y "más cuerpo" a la cara.
- [ ] **Integraciones/agentes/automatizaciones** (roadmap Pro).
- [ ] **PWA install + multi-dispositivo** completos.

---

## 💵 Costos hoy
- Vercel: **gratis**. Render: **gratis** (se duerme). Supabase: **gratis**. Groq: **gratis**.
- **$0 mientras se prueba.** Los costos aparecen recién con OpenAI real (centavos por conversación) y/o instancias siempre-despiertas.
