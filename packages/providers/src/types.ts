/** A single message in a chat exchange. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Override the provider's default model. */
  model?: string;
  temperature?: number;
}

export interface ChatUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  usage?: ChatUsage;
  /** Total round-trip time in milliseconds. */
  latencyMs?: number;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
}

/**
 * Common contract every AI provider implements (spec §6.2). Keeping providers
 * behind this interface is what makes JARVIS provider-agnostic: the router and
 * services depend only on this shape, never on a vendor SDK.
 */
export interface AIProvider {
  readonly name: string;
  readonly enabled: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsTools: boolean;
  readonly supportsVision: boolean;
  readonly supportsEmbeddings: boolean;

  chat(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatChunk>;
  embed?(input: string): Promise<number[]>;
}
