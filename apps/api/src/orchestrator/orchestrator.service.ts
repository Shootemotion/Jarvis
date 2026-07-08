import { Injectable } from '@nestjs/common';
import {
  KnowledgeSource,
  OrchestrationPlan,
  PrivacyLevel,
  TaskType,
} from './orchestrator.types';

interface PlanInput {
  message: string;
  projectId?: string;
  plan: 'free' | 'pro';
  /** Provider name that will actually run (byo/managed/ollama), resolved by chat. */
  providerName: string;
  /** The provider's configured/base model (used to derive the model family). */
  baseModel?: string;
  hasEmbedding: boolean;
}

// Which quality tier each task wants.
const TASK_TIER: Record<TaskType, 'strong' | 'balanced' | 'fast'> = {
  coding: 'strong',
  planning: 'strong',
  research: 'balanced',
  answer: 'fast',
  action: 'fast',
  automation: 'fast',
};

// Per-family model per tier. Family is derived from the configured model, so
// the chosen model is always valid for the active provider (never cross-family).
const MODEL_TIERS: Record<string, Record<'strong' | 'balanced' | 'fast', string>> = {
  openai: { strong: 'gpt-4o', balanced: 'gpt-4o-mini', fast: 'gpt-4o-mini' },
  anthropic: {
    strong: 'claude-3-5-sonnet-latest',
    balanced: 'claude-3-5-haiku-latest',
    fast: 'claude-3-5-haiku-latest',
  },
  llama: {
    strong: 'llama-3.3-70b-versatile',
    balanced: 'llama-3.3-70b-versatile',
    fast: 'llama-3.1-8b-instant',
  },
};

// Rough per-request cost estimate (USD) by tier — refined post-hoc by metering.
const TIER_COST: Record<'strong' | 'balanced' | 'fast', number> = {
  strong: 0.004,
  balanced: 0.001,
  fast: 0.0003,
};

@Injectable()
export class OrchestratorService {
  /** Heuristic task classification (cheap + deterministic; no extra LLM call). */
  classify(message: string): { taskType: TaskType; privacyLevel: PrivacyLevel } {
    const m = message.toLowerCase();
    let taskType: TaskType = 'answer';
    if (/\b(c[oó]digo|code|funci[oó]n|bug|refactor|typescript|javascript|python|sql|regex|stacktrace|compil)\b/.test(m))
      taskType = 'coding';
    else if (/\b(planific|plan\b|pasos|roadmap|organiz|dividir en|estrategia|milestone)\b/.test(m))
      taskType = 'planning';
    else if (/\b(investig|research|compar|resum[ií]|fuentes|estado del arte)\b/.test(m))
      taskType = 'research';
    else if (/\b(automatiz|workflow|n8n|programar (una )?tarea|cada d[ií]a|recordatorio recurrente)\b/.test(m))
      taskType = 'automation';
    else if (/\b(envi[aá]|mand[aá]|cre[aá] un|borr[aá]|agend[aá]|eliminá|mové)\b/.test(m))
      taskType = 'action';
    return { taskType, privacyLevel: 'private' };
  }

  private familyOf(model?: string): 'openai' | 'anthropic' | 'llama' | null {
    if (!model) return null;
    if (/gpt|o1|o3|text-embedding/i.test(model)) return 'openai';
    if (/claude/i.test(model)) return 'anthropic';
    if (/llama|mixtral|gemma|qwen/i.test(model)) return 'llama';
    return null;
  }

  private knowledgeSourcesFor(taskType: TaskType, hasEmbedding: boolean, plan: 'free' | 'pro'): KnowledgeSource[] {
    const sources: KnowledgeSource[] = ['memory'];
    if (hasEmbedding && plan === 'pro' && taskType !== 'automation') {
      sources.push('documents', 'obsidian');
    }
    return sources;
  }

  buildPlan(input: PlanInput): OrchestrationPlan {
    const { taskType, privacyLevel } = this.classify(input.message);
    const tier = TASK_TIER[taskType];
    const family = this.familyOf(input.baseModel);

    // Choose a task-appropriate model within the active provider's family.
    // If we can't recognize the family, keep the configured model as-is.
    const model = family ? MODEL_TIERS[family][tier] : input.baseModel ?? 'default';
    const fallbackModel = family ? MODEL_TIERS[family].fast : undefined;

    const requiredKnowledgeSources = this.knowledgeSourcesFor(
      taskType,
      input.hasEmbedding,
      input.plan,
    );
    const requiredTools: string[] = [];
    if (requiredKnowledgeSources.includes('memory')) requiredTools.push('memory.search');
    if (requiredKnowledgeSources.includes('documents')) requiredTools.push('documents.search');

    const requiresConfirmation = taskType === 'action' || taskType === 'automation';
    const shouldSaveMemory = /\b(record[aá]|acordate|de ahora en m[aá]s|preferencia|decidimos)\b/i.test(
      input.message,
    );

    const reason =
      `Tarea "${taskType}" → nivel ${tier}. Proveedor ${input.providerName}` +
      (family ? ` (${family})` : '') +
      ` → modelo ${model}.` +
      (requiredKnowledgeSources.length > 1
        ? ` Consulta ${requiredKnowledgeSources.join(', ')}.`
        : '');

    return {
      taskType,
      privacyLevel,
      projectId: input.projectId,
      requiredKnowledgeSources,
      requiredTools,
      provider: input.providerName,
      model,
      fallbackModel,
      reason,
      estimatedCost: TIER_COST[tier],
      requiresConfirmation,
      shouldSaveMemory,
    };
  }

  /** Mode-specific system-prompt addendum (Answer is the plain default). */
  modePrompt(taskType: TaskType): string {
    switch (taskType) {
      case 'coding':
        return 'Modo programación: respondé con código correcto y conciso, explicando brevemente. Usá bloques de código con el lenguaje.';
      case 'planning':
        return 'Modo planificación: dividí la tarea en pasos numerados, claros y accionables.';
      case 'research':
        return 'Modo investigación: respondé apoyándote en el conocimiento/documentos del usuario y CITÁ las fuentes (archivo › sección). Distinguí lo que está en las fuentes de lo que inferís.';
      case 'action':
        return 'Modo acción: las herramientas externas (enviar, crear, borrar) todavía no están disponibles. Explicá qué harías y pedí confirmación al usuario en vez de ejecutar.';
      case 'automation':
        return 'Modo automatización: las automatizaciones (n8n/workflows) todavía no están conectadas. Describí el workflow propuesto y pedí confirmación.';
      default:
        return '';
    }
  }
}
