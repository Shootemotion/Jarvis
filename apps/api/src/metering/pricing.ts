/**
 * Approximate cost per 1M tokens (USD), used to estimate spend for metering
 * and cost guardrails. Values are estimates — tune to real provider pricing.
 * Local models (Ollama) are free → cost 0.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-3-5-sonnet-latest': { in: 3, out: 15 },
  'claude-3-5-haiku-latest': { in: 0.8, out: 4 },
  'claude-3-7-sonnet-latest': { in: 3, out: 15 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
};

export function estimateCost(model: string, inputTokens = 0, outputTokens = 0): number {
  const p = PRICING[model];
  if (!p) return 0; // local / unknown → free
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
}
