import {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
} from './types';

export interface OllamaProviderOptions {
  baseUrl: string;
  defaultModel: string;
  /** Model used for embeddings (e.g. nomic-embed-text). Used from Milestone 2. */
  embeddingModel?: string;
  enabled?: boolean;
}

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/**
 * Local LLM provider backed by Ollama (http://localhost:11434 by default).
 * No API key, no cost — the default provider for Free / Hybrid modes.
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly enabled: boolean;
  readonly supportsStreaming = true;
  readonly supportsTools = false;
  readonly supportsVision = false;
  readonly supportsEmbeddings = true;

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly embeddingModel: string;

  constructor(opts: OllamaProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.defaultModel = opts.defaultModel;
    this.embeddingModel = opts.embeddingModel ?? 'nomic-embed-text';
    this.enabled = opts.enabled ?? true;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: false,
          options:
            request.temperature != null
              ? { temperature: request.temperature }
              : undefined,
        }),
      });
    } catch (err) {
      throw new Error(
        `No se pudo conectar con Ollama en ${this.baseUrl}. ¿Está corriendo? (${String(err)})`,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama respondió ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }

    return {
      content: data.message?.content ?? '',
      provider: this.name,
      model: data.model ?? model,
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
      latencyMs: Date.now() - start,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const model = request.model ?? this.defaultModel;
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: request.messages, stream: true }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama respondió ${res.status}: ${text || res.statusText}`);
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
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaChatResponse & { done: boolean };
        yield { delta: chunk.message?.content ?? '', done: chunk.done };
      }
    }
  }

  async embed(input: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, prompt: input }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama embeddings ${res.status}: ${text || res.statusText}`);
    }
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }
}
