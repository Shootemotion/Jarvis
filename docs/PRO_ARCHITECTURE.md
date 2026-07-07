# JARVIS — Arquitectura Pro (SaaS hospedado)

> Estado: **propuesta para validar**. Define cómo JARVIS pasa de un MVP local
> single-user a un producto **SaaS multiusuario con suscripciones** (Pro), sin
> tirar lo ya construido. Fecha: 2026-07-07.

## 0. Decisiones tomadas

- **Entrega Pro**: SaaS hospedado (nosotros corremos la infra; los usuarios se registran y pagan).
- **Pro desbloquea**: proveedores premium (Claude/GPT/voz neuronal), límites de uso mayores, features avanzadas (voz, agentes, integraciones, automatizaciones), nube/multi-dispositivo.
- **Cobros**: **Mercado Pago** (Argentina/LatAm) para arrancar; Stripe queda como futuro para internacional.
- **Enfoque**: diseñar Pro-first; el Free se define como un recorte del mismo producto.

---

## 1. Modelo de tiers

Mismo código, dos formas de correr (`DEPLOYMENT_MODE = selfhost | cloud`):

| | **Free** | **Pro** |
|---|---|---|
| Cómo corre | Self-host / local (tu máquina) | Hospedado por nosotros (nube) |
| LLM | Ollama local (BYO) | Claude/GPT/Gemini incluidos + Ollama |
| Voz | TTS del SO + Whisper local | Voz neuronal (ElevenLabs/OpenAI) + STT premium |
| Embeddings | Locales (nomic) | Cloud (OpenAI/Voyage) + locales |
| Memoria/Docs | Ilimitado local | Nube, sync multi-dispositivo, backup |
| Integraciones | Básicas / manuales | Gmail, Calendar, Drive, n8n, browser |
| Agentes/automatizaciones | — | Sí |
| Límites | Los de tu hardware | Cuotas del plan (justas) |
| Costo | Gratis (ponés tu infra/keys) | Suscripción mensual (MP) |
| Cobro | — | Mercado Pago |

> **Idea clave**: Free = "open core" self-host. Pro = conveniencia + potencia sin fricción (no configurás nada, no ponés keys, corre en la nube). La suscripción cubre infra + costos de API.

Se puede sumar un tier intermedio más adelante (ej. **Plus**). El sistema de planes lo soporta desde el diseño.

---

## 2. Arquitectura multi-tenant

- **Tenencia a nivel usuario** (cada usuario es su propio tenant). `organizations`/equipos = futuro; el modelo lo deja listo (columna `org_id` opcional).
- **Aislamiento de datos**: TODA query se scopea por `user_id` (ya lo hacemos). Se refuerza con:
  - Un `AuthGuard` + `CurrentUser` derivado del token (reemplaza al usuario hardcodeado actual).
  - A futuro, **Row-Level Security (RLS)** en Postgres como segunda barrera.
- **Un solo Postgres+pgvector** compartido, filas por usuario. Escala bien para miles de usuarios antes de necesitar sharding.

---

## 3. Autenticación

- Reemplaza el `CurrentUserService` hardcodeado por auth real.
- **Recomendación**: **Supabase** (Auth + Postgres/pgvector + Storage en un solo proveedor) → el NestJS valida el **JWT** de Supabase vía JWKS. Reduce infra y ya trae OAuth de Google (necesario para integraciones Gmail/Calendar).
  - Alternativa: Auth.js (NextAuth) o auth propio con Passport (email/clave + Google OAuth). Más control, más trabajo.
- **Self-host (Free)**: mismo NestJS con auth local simple (o single-user, como hoy) según `DEPLOYMENT_MODE`.
- Métodos: **Google OAuth** (primario, habilita integraciones) + email/clave o magic link.

---

## 4. Entitlements (permisos por plan)

El corazón del gating. Un **EntitlementsService** resuelve qué puede hacer un usuario según su suscripción:

```
plans            → definición de cada plan (features[], limits{})
subscriptions    → user_id, plan_id, status, current_period_end, mp_refs
entitlements     → (derivado) feature flags + límites efectivos del usuario
```

Se consulta en los puntos de control:
- **AI Router**: ¿puede usar provider premium? Si no → cae a local/cheap o pide upgrade.
- **Tool Registry**: ¿tiene habilitada la tool (Gmail, browser, agentes)?
- **Antes de cada acción con costo**: chequeo de cuota (ver §6).

Feature flags de ejemplo: `premium_llm`, `neural_voice`, `integrations_google`, `agents`, `automations`, `cloud_sync`.

---

## 5. Billing con Mercado Pago

- **Suscripciones de MP** (preapproval / suscripciones automáticas recurrentes).
- Flujo:
  1. Usuario elige plan → creamos `preapproval` en MP → redirección/checkout.
  2. MP cobra recurrente y manda **webhooks** (`payment`, `subscription_preapproval`).
  3. Nuestro `BillingService` procesa webhooks → actualiza `subscriptions.status` y `current_period_end`.
  4. Entitlements se recalculan al vuelo.
- **Estados**: `trialing`, `active`, `past_due` (reintentos/dunning), `canceled`, `paused`.
- **Prueba gratis**: N días de Pro sin cobro (trial), luego cobra.
- **Nunca tocamos datos de tarjeta** — PCI lo maneja MP. Guardamos solo IDs de referencia (`mp_customer_id`, `mp_preapproval_id`).
- **Verificación de webhooks** (firma) obligatoria.
- Stripe = capa futura para internacional (el `BillingService` se diseña **agnóstico de proveedor**, igual que el Provider Registry de IA).

---

## 6. Medición de uso y control de costos 🔑

Crítico: en Pro, cada llamada a Claude/GPT/voz **nos cuesta**. Sin control, un usuario nos funde.

- Extender `usage_logs`: por usuario, provider, modelo, tokens in/out, **costo estimado**, timestamp.
- **Cuotas por plan** (`limits`): mensajes/tokens/almacenamiento/minutos-de-voz por mes.
- **Enforcement en tiempo real**: antes de una llamada con costo, `QuotaService` chequea saldo:
  - Dentro de cuota → adelante.
  - Cerca del límite → aviso ("te queda 10%").
  - Excedido → bloquear el provider premium y **degradar a local/cheap** o pedir upgrade.
- **Guardrails de costo**: tope diario/mensual por usuario + **circuit breaker global** (si el gasto agregado supera X, frenar y alertar).
- Esto protege el margen y es lo que hace viable el negocio.

---

## 7. Secretos y claves

- **Pro**: las API keys premium son **nuestras**, server-side (secret manager / env), nunca expuestas al cliente ni al browser.
- **Tokens OAuth por usuario** (Google para Gmail/Calendar): cifrados en reposo, refresh manejado server-side.
- **BYO keys** (opcional, para Free/hybrid): el usuario puede poner sus propias keys; se guardan cifradas; la DB solo referencia (como ya define la spec: `secret_ref`).

---

## 8. Infraestructura (nube)

| Componente | Opción sugerida |
|---|---|
| DB + Auth + Storage | **Supabase** (Postgres/pgvector + Auth + S3-compatible) |
| API (NestJS) | Fly.io / Railway / Render / VPS |
| Web (Next.js) | Vercel |
| Archivos/documentos | Supabase Storage / Cloudflare R2 |
| Cola de trabajos | (indexado, automatizaciones) BullMQ + Redis |
| Embeddings Pro | OpenAI / Voyage (cloud) |
| Observabilidad | Logs + métricas + alertas de costo |

> Ollama **no** va en Pro (Pro usa proveedores cloud). Ollama es el motor del Free/self-host.

---

## 9. Cambios al modelo de datos

Sobre lo que ya existe (`users`, `projects`, `conversations`, `messages`, `memories`, `documents`, `providers`, `usage_logs`, `budget_limits`, `tool_permissions`, `action_logs`…):

```
+ organizations            (opcional/futuro: equipos)
+ plans                    (features[], limits{}, precios)
+ subscriptions            (user_id, plan_id, status, period_end, mp_preapproval_id)
+ payments                 (historial de cobros MP)
+ oauth_accounts           (tokens Google/etc. cifrados, por usuario)
~ users                    (+ auth_provider_id, email verificado, role)
~ usage_logs               (+ estimated_cost, tie a subscription/período)
~ provider_settings        (BYO keys por usuario, cifradas)
```

---

## 10. Seguridad y legal

- Aislamiento multi-tenant estricto (guard + a futuro RLS).
- Cifrado de secretos/tokens en reposo.
- Export y borrado de datos por usuario (privacidad).
- Términos y Condiciones + Política de Privacidad.
- Rate limiting por usuario/IP; verificación de webhooks MP.

---

## 11. Camino de migración (desde el MVP actual)

Ya tenemos: chat local (Ollama) + memoria (pgvector) + cara 3D + voz local, single-user.

- **Fase 1 — Cuentas**: Auth real (Supabase/JWT), reemplazar usuario hardcodeado, scopear todo por `user_id`, guard de tenencia. *(base de todo)*
- **Fase 2 — Planes y entitlements**: `plans`, `subscriptions` (stub), `EntitlementsService`, gating tier-aware en Router/Tools. *(sin cobro real todavía)*
- **Fase 3 — Providers cloud + medición**: Anthropic/OpenAI reales, `usage_logs` con costo, `QuotaService` + guardrails. *(ya se puede controlar costo)*
- **Fase 4 — Billing Mercado Pago**: suscripciones, checkout, webhooks, trial, ciclo de vida. *(monetización real)*
- **Fase 5 — Nube + multi-dispositivo**: deploy (Supabase/Vercel/host API), storage, sync, PWA instalable.
- **En paralelo**: las features del roadmap original (Obsidian/Documentos, tools, automatizaciones) se construyen **tier-aware** (gateadas por plan).

El **Free/self-host** sigue siendo el mismo código con `DEPLOYMENT_MODE=selfhost` (auth simple/single-user, sin billing, features locales habilitadas).

---

## 12. Decisiones pendientes (para cerrar antes de codear Fase 1)

1. **Auth**: ¿Supabase (recomendado, consolida DB+Auth+Storage) o auth propio en NestJS?
2. **Precio y moneda**: ¿monto mensual del Pro en **ARS**? ¿trial de cuántos días? ¿plan anual con descuento?
3. **Cuotas del plan Pro**: definir límites concretos (mensajes/tokens/almacenamiento/minutos de voz por mes) — se calibran con el costo real de API.
4. **Equipos/orgs**: ¿solo usuarios individuales al inicio, o contemplamos equipos ya?
5. **Integraciones primero**: ¿cuál priorizamos para Pro (Gmail? Calendar? Drive?)?
6. **Free**: ¿lo publicamos como self-host open desde el día 1, o Pro primero y Free después?

---

## 13. Riesgos / notas

- **Costo de API sin control = riesgo #1** → por eso medición + cuotas + guardrails son Fase 3, no "después".
- Multi-tenant mal aislado = fuga de datos → guard + RLS.
- Complejidad: esto es bastante más que el MVP; conviene ir por fases y no romper el flujo local que ya funciona.
- Mercado Pago suscripciones tiene sus particularidades (webhooks, estados) — presupuestar tiempo de integración/pruebas.
