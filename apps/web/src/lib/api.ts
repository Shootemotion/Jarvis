import { supabase } from './supabase';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4010';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

export interface KnowledgeSource {
  path: string;
  heading: string | null;
  score: number;
}

export interface ChatReply {
  conversationId: string;
  messageId: string;
  reply: { role: 'assistant'; content: string };
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  latencyMs?: number;
  routingReason?: string;
  memoriesUsed?: number;
  sources?: KnowledgeSource[];
  embeddingProvider?: string | null;
}

export interface IngestResult {
  jobId: string;
  total: number;
  processed: number;
  failed: number;
  documents: { path: string; status: string; chunks: number }[];
  ignored: { path: string; reason: string }[];
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  path: string;
  source: string;
  tags: string[];
  status: string;
  chunkCount: number;
  updatedAt: string;
}

export interface KnowledgeHit {
  id: string;
  documentId: string;
  path: string;
  heading: string | null;
  content: string;
  score: number;
}

export interface ProvidersInfo {
  chat: { name: string };
  embedding: { configured: boolean; provider: string; model: string; dimensions: number };
  managedForAll: boolean;
}

export interface Memory {
  id: string;
  type: string;
  content: string;
  projectId: string | null;
  source: string | null;
  confidence: number;
  tags: string[];
  visibility: string;
  canBeUsedAutomatically: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemorySearchHit {
  id: string;
  type: string;
  content: string;
  projectId: string | null;
  tags: string[];
  confidence: number;
  score: number;
}

export interface Entitlements {
  plan: string;
  planName: string;
  status: string;
  features: string[];
  limits: Record<string, number>;
}

export interface Me {
  user: { id: string; email: string | null };
  entitlements: Entitlements;
}

export interface Usage {
  usage: {
    messagesThisMonth: number;
    costThisMonth: number;
    inputTokens: number;
    outputTokens: number;
    periodStart: string;
  };
  limits: Record<string, number>;
  plan: string;
}

export interface AiSettings {
  preferredProvider: string;
  model: string | null;
  byo: { anthropic: boolean; openai: boolean };
  managed: { anthropic: boolean; openai: boolean };
}

export interface BillingStatus {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  live: boolean;
  price: { ars: number; trialDays: number };
  payments: {
    id: string;
    kind: string;
    status: string;
    amount: number | null;
    currency: string | null;
    createdAt: string;
  }[];
}

export const MEMORY_TYPES = [
  'session',
  'profile',
  'preference',
  'project',
  'decision',
  'document',
  'obsidian',
  'procedure',
  'action_log',
  'task',
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}/api${path}`, {
    cache: 'no-store',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getMe: () => request<Me>('/me'),
  getUsage: () => request<Usage>('/usage'),
  getAiSettings: () => request<AiSettings>('/settings/ai'),
  updateAiSettings: (body: {
    preferredProvider?: string;
    model?: string;
    anthropicKey?: string;
    openaiKey?: string;
  }) => request<AiSettings>('/settings/ai', { method: 'PUT', body: JSON.stringify(body) }),
  getProviders: () => request<ProvidersInfo>('/providers'),
  listDocuments: () => request<KnowledgeDoc[]>('/knowledge/documents'),
  deleteDocument: (id: string) =>
    request<{ deleted: boolean }>(`/knowledge/documents/${id}`, { method: 'DELETE' }),
  searchKnowledge: (body: { query: string; projectId?: string }) =>
    request<KnowledgeHit[]>('/knowledge/search', { method: 'POST', body: JSON.stringify(body) }),
  uploadKnowledge: async (files: File[], projectId?: string) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    if (projectId) form.append('projectId', projectId);
    const headers: Record<string, string> = {};
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/api/knowledge/upload`, {
      method: 'POST',
      headers, // NO Content-Type → browser sets multipart boundary
      body: form,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b?.message ?? `Error ${res.status}`);
    }
    return res.json() as Promise<IngestResult>;
  },
  getBillingStatus: () => request<BillingStatus>('/billing/status'),
  startCheckout: () =>
    request<{ url: string; mock: boolean }>('/billing/checkout', { method: 'POST' }),
  cancelBilling: () => request<{ ok: boolean }>('/billing/cancel', { method: 'POST' }),
  devConfirmBilling: () =>
    request<{ ok: boolean }>('/billing/dev-confirm', { method: 'POST' }),
  listProjects: () => request<Project[]>('/projects'),
  sendChat: (input: {
    message: string;
    projectId?: string;
    conversationId?: string;
  }) =>
    request<ChatReply>('/chat', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listMemories: (filter?: { type?: string; projectId?: string }) => {
    const qs = new URLSearchParams();
    if (filter?.type) qs.set('type', filter.type);
    if (filter?.projectId) qs.set('projectId', filter.projectId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<Memory[]>(`/memory${suffix}`);
  },
  createMemory: (input: {
    type: string;
    content: string;
    projectId?: string;
    tags?: string[];
  }) =>
    request<Memory>('/memory', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteMemory: (id: string) =>
    request<{ deleted: boolean }>(`/memory/${id}`, { method: 'DELETE' }),
  searchMemories: (input: { query: string; projectId?: string }) =>
    request<MemorySearchHit[]>('/memory/search', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
