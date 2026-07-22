import { AIProvider, ChatChunk, ChatRequest, ChatResponse } from './types';

export interface OpenAIOptions {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
  /** Embedding model (default text-embedding-3-small). */
  embeddingModel?: string;
  /** Output dimensions; 3-small/large support truncation (keep 768 = pgvector schema). */
  embeddingDimensions?: number;
}

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/** OpenAI (or compatible) provider (premium / cloud). Keys stay server-side. */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly enabled = true;
  readonly supportsStreaming = true;
  readonly supportsTools = true;
  readonly supportsVision = true;
  readonly supportsEmbeddings = true;

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly embeddingModel: string;
  private readonly embeddingDimensions?: number;

  constructor(opts: OpenAIOptions) {
    this.apiKey = opts.apiKey;
    this.defaultModel = opts.defaultModel ?? 'gpt-4o-mini';
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.embeddingModel = opts.embeddingModel ?? 'text-embedding-3-small';
    this.embeddingDimensions = opts.embeddingDimensions;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${text || res.statusText}`);
    }
    const data = (await res.json()) as OpenAIResponse;
    if (data.error) throw new Error(`OpenAI error: ${data.error.message}`);

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      provider: this.name,
      model,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
      latencyMs: Date.now() - start,
    };
  }

  /** Stream tokens as they arrive (OpenAI-compatible SSE). */
  async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const model = request.model ?? this.defaultModel;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${t || res.statusText}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (data === '[DONE]') {
          yield { delta: '', done: true };
          return;
        }
        try {
          const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
          const delta = json.choices?.[0]?.delta?.content ?? '';
          if (delta) yield { delta, done: false };
        } catch {
          /* ignore partial JSON */
        }
      }
    }
    yield { delta: '', done: true };
  }

  /**
   * Embed a text. Uses `dimensions` to keep the output at 768 so it matches the
   * existing pgvector column (no re-migration needed).
   */
  async embed(input: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input,
        ...(this.embeddingDimensions ? { dimensions: this.embeddingDimensions } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings ${res.status}: ${text || res.statusText}`);
    }
    const data = (await res.json()) as {
      data?: { embedding: number[] }[];
      error?: { message?: string };
    };
    if (data.error) throw new Error(`OpenAI embeddings error: ${data.error.message}`);
    const embedding = data.data?.[0]?.embedding;
    if (!embedding) throw new Error('OpenAI no devolvió embedding.');
    return embedding;
  }
}
