import { AIProvider, ChatRequest, ChatResponse } from './types';

export interface AnthropicOptions {
  apiKey: string;
  defaultModel?: string;
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

/** Anthropic Claude provider (premium / cloud). Keys stay server-side. */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly enabled = true;
  readonly supportsStreaming = true;
  readonly supportsTools = true;
  readonly supportsVision = true;
  readonly supportsEmbeddings = false;

  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(opts: AnthropicOptions) {
    this.apiKey = opts.apiKey;
    this.defaultModel = opts.defaultModel ?? 'claude-3-5-sonnet-latest';
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    // Anthropic separates the system prompt from the message list.
    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: system || undefined,
        messages,
        temperature: request.temperature,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic ${res.status}: ${text || res.statusText}`);
    }
    const data = (await res.json()) as AnthropicResponse;
    if (data.error) throw new Error(`Anthropic error: ${data.error.message}`);

    return {
      content: (data.content ?? []).map((c) => c.text ?? '').join(''),
      provider: this.name,
      model,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      latencyMs: Date.now() - start,
    };
  }
}
