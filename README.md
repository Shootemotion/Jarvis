# JARVIS

Personal, modular, provider-agnostic AI assistant. Runs locally by default
(Ollama + PostgreSQL/pgvector) and can use paid providers when configured.
Three operating modes: **Free / Local**, **Full Paid**, and **Hybrid** (the
main target).

> Status: **Milestones 1 & 2 — done.** Monorepo + Docker + API + Web, Jarvis
> Visual Interface, working local chat with Ollama (provider abstraction +
> rule-based AI router + conversation persistence), and a layered **memory
> system**: pgvector-backed memories, local embeddings (nomic-embed-text),
> semantic search, a `/memory` panel, and automatic recall injected into chat
> context. Obsidian & documents (M3) are next.

## Stack

| Layer      | Tech                                     |
| ---------- | ---------------------------------------- |
| Frontend   | Next.js (App Router)                     |
| Backend    | NestJS                                   |
| Database   | PostgreSQL + pgvector                    |
| ORM        | Prisma                                   |
| Local LLM  | Ollama (`qwen2.5:3b`, `nomic-embed-text`)|
| Automation | n8n (self-hosted)                        |
| Monorepo   | pnpm workspaces + Turborepo              |

```
jarvis/
├── apps/
│   ├── web/                    # Next.js UI (App Router, src/)
│   │   └── src/
│   │       ├── app/            # routes + layout (PWA-ready: manifest, viewport)
│   │       ├── components/
│   │       │   └── jarvis/     # Jarvis Visual Interface (avatar/orb/states)
│   │       └── hooks/
│   └── api/                    # NestJS API
├── packages/
│   └── config/                 # shared env parsing + defaults
├── docker/                     # docker-compose (postgres/pgvector + n8n)
└── .env.example
```

### Jarvis Visual Interface

A separated, mobile-first visual layer under `apps/web/src/components/jarvis/`
that reacts to the assistant's state (`idle`, `listening`, `thinking`,
`speaking`, `tool_call`, `confirmation_required`, `error`, `offline`). The
components are presentational — they receive the state via props; state comes
from the backend/chat (today, `offline` is derived from the API health check).
The app is PWA-ready (web manifest + viewport/theme-color); full installability
and a richer avatar are future phases.

## Prerequisites

- **Node.js ≥ 20** and **pnpm** (`npm install -g pnpm`)
- **Docker Desktop** (for PostgreSQL and n8n)
- **Ollama** installed natively on Windows — https://ollama.com/download

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create your local env file
cp .env.example .env        # (PowerShell) copy .env.example .env

# 3. Start infrastructure (PostgreSQL + n8n)
docker compose -f docker/docker-compose.yml up -d

# 4. Build shared packages (needed before the API can start)
pnpm build

# 5. Create the database schema and seed default data
pnpm --filter @jarvis/api prisma:generate
pnpm db:migrate            # creates tables
pnpm db:seed               # seeds user + projects (JARVIS, General) + providers

# 6. Pull the local models (Ollama must be running)
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
```

## Run (development)

Two terminals:

```bash
# Terminal 1 — API on http://localhost:4010
pnpm --filter @jarvis/api dev

# Terminal 2 — Web on http://localhost:3000
pnpm --filter @jarvis/web dev
```

Then open **http://localhost:3000**. The home page pings the API health
endpoint and shows the status of the API, database, and Ollama model.

Health check directly:

```bash
curl http://localhost:4010/api/health
```

## Services & ports

| Service      | URL                       |
| ------------ | ------------------------- |
| Web (Next)   | http://localhost:3000     |
| API (Nest)   | http://localhost:4010/api |

| PostgreSQL   | localhost:5432            |
| n8n          | http://localhost:5678     |
| Ollama       | http://localhost:11434    |

## Roadmap

- **M1 — Foundation** (this): monorepo, Docker, API/Web skeleton, local chat with Ollama.
- **M2 — Memory**: pgvector-backed memories, semantic retrieval in chat.
- **M3 — Obsidian & Documents**: vault indexing, chunking, embeddings, semantic search.
- **M4 — Hybrid router + Tools**: paid providers, provider settings UI, tool registry, permissions, audit log, usage tracking.

## Notes

- **No auth in the MVP** — single seeded user (configured via `JARVIS_USER_*`).
- **Secrets** live only in `.env` (never in the database); the DB stores only a
  `secret_ref` (the env var name).
- Ollama runs **natively on Windows**, not inside Docker.
