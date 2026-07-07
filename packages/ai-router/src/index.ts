export type JarvisMode = 'free' | 'paid' | 'hybrid';

export type TaskType =
  | 'simple_chat'
  | 'document_analysis'
  | 'coding'
  | 'long_reasoning'
  | 'fast_summary'
  | 'complex_analysis'
  | 'memory_question';

export interface RouteRequest {
  message?: string;
  taskType?: TaskType;
  privacyLevel?: 'private' | 'public';
  projectId?: string;
  preferredMode?: JarvisMode;
}

export interface RoutingDecision {
  provider: string;
  model: string;
  reason: string;
}

/** Provider roles + availability the router reasons over. */
export interface RouterConfig {
  mode: JarvisMode;
  roles: {
    main: string;
    cheap: string;
    local: string;
    fallback: string | null;
  };
  /** Names of providers currently enabled. */
  enabled: string[];
  /** Default model per provider name. */
  models: Record<string, string>;
}

/** Task types that benefit from the strongest reasoning model. */
const HEAVY_TASKS: TaskType[] = [
  'coding',
  'long_reasoning',
  'complex_analysis',
  'document_analysis',
];

/** Task types that are fine on a cheap/local model. */
const LIGHT_TASKS: TaskType[] = ['simple_chat', 'fast_summary'];

/**
 * Rule-based AI router (spec §6.1). It picks *which* provider/model to use;
 * resolving the actual provider instance is the caller's job. Cost/privacy/ML
 * routing can grow here later without changing the public shape.
 */
export class AiRouter {
  constructor(private readonly cfg: RouterConfig) {}

  route(req: RouteRequest = {}): RoutingDecision {
    const { roles, mode } = this.cfg;

    // Free mode (or a private request in hybrid mode) prefers the local model.
    if (mode === 'free' || (mode === 'hybrid' && req.privacyLevel === 'private')) {
      const local = this.resolve(roles.local, 'modo/privacidad local');
      if (local) return local;
    }

    // Heavy tasks want the main (highest quality) provider.
    if (req.taskType && HEAVY_TASKS.includes(req.taskType)) {
      const main = this.resolve(roles.main, `tarea "${req.taskType}" requiere el modelo principal`);
      if (main) return main;
    }

    // Light tasks are fine on the cheap provider.
    if (req.taskType && LIGHT_TASKS.includes(req.taskType)) {
      const cheap = this.resolve(roles.cheap, `tarea "${req.taskType}" liviana`);
      if (cheap) return cheap;
    }

    // Default: main provider.
    const main = this.resolve(roles.main, 'proveedor principal por defecto');
    if (main) return main;

    // Fallbacks: explicit fallback, then local, then anything enabled.
    const fallback =
      (roles.fallback && this.resolve(roles.fallback, 'proveedor principal no disponible → fallback')) ||
      this.resolve(roles.local, 'fallback al proveedor local') ||
      this.firstEnabled();

    if (!fallback) {
      throw new Error('No hay ningún proveedor de IA habilitado.');
    }
    return fallback;
  }

  private resolve(name: string | null, reason: string): RoutingDecision | null {
    if (!name || !this.cfg.enabled.includes(name)) return null;
    return { provider: name, model: this.cfg.models[name] ?? '', reason };
  }

  private firstEnabled(): RoutingDecision | null {
    const name = this.cfg.enabled[0];
    if (!name) return null;
    return {
      provider: name,
      model: this.cfg.models[name] ?? '',
      reason: 'único proveedor habilitado',
    };
  }
}
