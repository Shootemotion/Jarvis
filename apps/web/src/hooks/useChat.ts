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
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      try {
        const res = await api.sendChat({
          message: text,
          projectId,
          conversationId,
        });
        setConversationId(res.conversationId);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: res.reply.content,
            meta: {
              provider: res.provider,
              model: res.model,
              latencyMs: res.latencyMs,
              inputTokens: res.usage?.inputTokens,
              outputTokens: res.usage?.outputTokens,
              memoriesUsed: res.memoriesUsed,
              sources: res.sources,
              embeddingProvider: res.embeddingProvider,
              taskType: res.orchestration?.taskType,
            },
          },
        ]);
        return res;
      } finally {
        setSending(false);
      }
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
