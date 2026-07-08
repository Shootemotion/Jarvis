export type TaskType =
  | 'answer'
  | 'research'
  | 'action'
  | 'automation'
  | 'coding'
  | 'planning';

export type PrivacyLevel = 'private' | 'internal' | 'public';

export type KnowledgeSource = 'memory' | 'documents' | 'obsidian' | 'web';

/**
 * The orchestrator's decision for one request. See
 * docs/PRO_KNOWLEDGE_ORCHESTRATION.md §2.3.
 */
export interface OrchestrationPlan {
  taskType: TaskType;
  privacyLevel: PrivacyLevel;
  projectId?: string;
  requiredKnowledgeSources: KnowledgeSource[];
  requiredTools: string[];
  provider: string;
  model: string;
  fallbackModel?: string;
  reason: string;
  estimatedCost: number;
  requiresConfirmation: boolean;
  shouldSaveMemory: boolean;
}

/** Tools Registry contract (see docs §4). */
export interface ToolDef {
  name: string;
  description: string;
  requiredPlan: 'free' | 'pro';
  requiresConfirmation: boolean;
  costLevel: 'none' | 'low' | 'medium' | 'high';
  riskLevel: 'safe' | 'read' | 'write' | 'external';
  /** Implemented and callable today? (false = declared for the roadmap). */
  enabled: boolean;
}
