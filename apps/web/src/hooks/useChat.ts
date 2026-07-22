'use client';

import { useCallback, useState } from 'react';
import { api, ChatReply, KnowledgeSource } from '@/lib/api';

export interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Provenance for assistant messages. */
  meta?: {
    provider: string;
    model: string;
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    memoriesUsed?: number;
    sources?: KnowledgeSource[];
    embeddingProvider?: string | null;
    taskType?: string;
  };
}

/**
 * Chat state for a single active conversation. Sending is intentionally simple
 * (request/response); streaming can replace `send` later without changing the
 * component contract.
 */
export function useChat(projectId?: string) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (text: string): Promise<ChatReply> => {
      setSending(true);
      // Append the user message + an empty assistant bubble to fill as tokens stream.
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: '' },
      ]);

      let full = '';
      let meta: ChatReply | null = null;
      const patchLast = (patch: Partial<UiMessage>) =>
        setMessages((prev) => {
          const c = prev.slice();
          const last = c[c.length - 1];
          if (last && last.role === 'assistant') c[c.length - 1] = { ...last, ...patch };
          return c;
        });

      try {
        await api.streamChat(
          { message: text, projectId, conversationId },
          {
            onDelta: (d) => {
              full += d;
              patchLast({ content: full });
            },
            onMeta: (m) => {
              meta = m;
              if (m.conversationId) setConversationId(m.conversationId);
            },
          },
        );
      } catch (err) {
        // Drop the empty placeholder if nothing streamed, then surface the error.
        setMessages((prev) => {
          const c = prev.slice();
          const last = c[c.length - 1];
          if (last && last.role === 'assistant' && !last.content) c.pop();
          return c;
        });
        setSending(false);
        throw err;
      }

      if (meta) {
        const m = meta as ChatReply;
        patchLast({
          content: full || '…',
          meta: {
            provider: m.provider,
            model: m.model,
            latencyMs: m.latencyMs,
            inputTokens: m.usage?.inputTokens,
            outputTokens: m.usage?.outputTokens,
            memoriesUsed: m.memoriesUsed,
            sources: m.sources,
            embeddingProvider: m.embeddingProvider,
            taskType: m.orchestration?.taskType,
          },
        });
      }
      setSending(false);
      return { reply: { role: 'assistant', content: full }, ...(meta ?? {}) } as ChatReply;
    },
    [projectId, conversationId],
  );

  /** Start a fresh conversation (e.g. when the project changes). */
  const reset = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
  }, []);

  return { messages, sending, send, reset, conversationId };
}
