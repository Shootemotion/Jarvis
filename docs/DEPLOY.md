# JARVIS — Guía de deploy (nube)

Stack de producción:

| Pieza | Servicio | Notas |
|------|----------|-------|
| Web (Next.js) | **Vercel** | Free. Deploy desde GitHub. |
| API (NestJS) | **Render** (Docker) | Free tier (se duerme por inactividad). |
| DB (Postgres + pgvector) | **Supabase** | Ya lo usás para auth. |
| Chat premium | **OpenAI / Anthropic** | Keys gestionadas (server-side). |
| Embeddings | **OpenAI** `text-embedding-3-small` (768d) | Sin Ollama en la nube. |
| Pagos | **Mercado Pago** | Opcional; sin token corre en modo DEV. |

> **Requisito previo:** el repo tiene que estar en **GitHub** (Render y Vercel deployan desde ahí).

---

## 1) Base de datos — Supabase

1. En tu proyecto Supabase → **Database → Extensions** → activá **`vector`** (pgvector).
2. **Database → Connect** → copiá la **connection string** (usá el **pooler**, puerto `6543`, modo *Transaction*). Queda como:
   ```
   postgresql://postgres.<ref>:<password>@aws-...pooler.supabase.com:6543/postgres
   ```
   Guardala: es tu `DATABASE_URL` de producción.

Las migraciones (incluidas las 8 que ya tenés) se aplican **solas** al arrancar el API (`prisma migrate deploy` está en el `CMD` del Docker).

---

## 2) API → Render

1. Render → **New → Blueprint** → conectá el repo. Render detecta [`render.yaml`](../render.yaml) y crea el servicio `jarvis-api` (Docker, `apps/api/Dockerfile`).
2. Completá las variables marcadas como *secret* (Environment del servicio):

   | Variable | Valor |
   |----------|-------|
   | `DATABASE_URL` | la connection string de Supabase (paso 1) |
   | `SUPABASE_URL` | `https://yxapvogmjacfxhnusloy.supabase.co` |
   | `OPENAI_API_KEY` | tu key de OpenAI (chat **y** embeddings) |
   | `ANTHROPIC_API_KEY` | *(opcional)* Claude gestionado para Pro |
   | `JARVIS_ENCRYPTION_KEY` | 32 bytes en hex — generá con `openssl rand -hex 32` |
   | `PUBLIC_WEB_URL` | tu URL de Vercel (la completás tras el paso 3) |
   | `CORS_ORIGINS` | misma URL de Vercel |
   | `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` | *(opcional)* Mercado Pago |

   Las no-secretas (`DEPLOYMENT_MODE=cloud`, `EMBEDDING_PROVIDER=openai`, etc.) ya vienen del blueprint.
3. **Deploy**. Cuando termine, probá el health: `https://jarvis-api.onrender.com/api/health` → `{"status":"ok"}`.

---

## 3) Web → Vercel

1. Vercel → **Add New → Project** → importá el repo.
2. **Root Directory: `apps/web`** (Vercel detecta Next.js y el workspace pnpm solo).
3. **Environment Variables:**

   | Variable | Valor |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | la URL de Render, ej. `https://jarvis-api.onrender.com` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://yxapvogmjacfxhnusloy.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tu anon/publishable key de Supabase |

4. **Deploy**. Copiá la URL final (ej. `https://jarvis.vercel.app`).

---

## 4) Conectar las puntas

1. En **Render**, seteá `PUBLIC_WEB_URL` y `CORS_ORIGINS` = la URL de Vercel → redeploy (o *Save, rebuild*).
2. En **Supabase → Authentication → URL Configuration**: agregá la URL de Vercel a **Site URL** y **Redirect URLs** (para que el login con Google vuelva bien).

---

## 5) Mercado Pago (opcional, cuando cobres de verdad)

1. Cargá `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` en Render.
2. En el panel de Mercado Pago → **Webhooks**, apuntá a:
   ```
   https://jarvis-api.onrender.com/api/billing/webhook
   ```
   (evento *Suscripciones/preapproval*). Ahora sí MP puede llegar al webhook — antes, en localhost, no podía.

Sin `MP_ACCESS_TOKEN` el billing sigue en **modo DEV** (checkout simulado).

---

## Checks post-deploy

- `GET /api/health` en Render → ok.
- Login en la web (Google/email) → entra.
- Mandás un mensaje → responde (usa OpenAI/Claude gestionado).
- Guardás una memoria y la buscás → embeddings por OpenAI (768d).

## A tener en cuenta

- **Render free se duerme** tras ~15 min sin tráfico: la primera request tarda ~30s. Para "siempre despierto" pasá a Railway o al plan pago de Render.
- **Usuarios Free en la nube:** el plan Free no tiene `premium_llm`, así que el router cae a Ollama, que **no existe en la nube** → el chat les daría error. Opciones (decisión de producto, no bloquea el deploy): darles un cupo chico gestionado, o mostrar "Requiere Pro". El self-host (Ollama local) es el camino Free real.
- **Costos:** embeddings `text-embedding-3-small` = centavos por miles de textos; el chat lo controlás con los quotas/metering que ya tenés (`/api/usage`).
- **Secretos:** nunca en el repo. Todo va por variables de entorno en Render/Vercel. `JARVIS_ENCRYPTION_KEY` **no la pierdas ni la cambies** o no vas a poder desencriptar las BYO keys guardadas.
