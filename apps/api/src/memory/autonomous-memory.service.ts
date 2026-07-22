import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { MemoryService } from './memory.service';

const VALID_TYPES = new Set(['profile', 'preference', 'decision', 'procedure', 'task', 'project']);

// Reconciliation thresholds (cosine similarity, tunable).
const DUP = 0.95; // essentially the same → skip
const UPDATE = 0.87; // same fact, newer wording/value → overwrite (self-correct)

interface Candidate {
  type: string;
  content: string;
  confidence?: number;
}

/**
 * Unattended long-term memory. After each conversation it extracts durable
 * facts (profile/preference/decision/procedure/task/project), then reconciles
 * them against what JARVIS already knows: duplicates are skipped, changed facts
 * overwrite the old one (self-correction), new facts are stored. Per user.
 */
@Injectable()
export class AutonomousMemoryService {
  private readonly logger = new Logger(AutonomousMemoryService.name);

  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly memory: MemoryService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  enabled(): boolean {
    return this.config.autoMemoryEnabled && this.registry.hasEmbedding();
  }

  /** Fire-and-forget: learn from one exchange. Never throws (best-effort). */
  async learn(userId: string, exchange: { user: string; assistant: string; projectId?: string }): Promise<void> {
    try {
      if (!this.enabled()) return;
      if (!exchange.assistant?.trim() || exchange.user.trim().length < 8) return;

      let provider;
      try {
        provider = this.registry.pickProvider(true);
      } catch {
        return;
      }

      const sys =
        'Sos el módulo de memoria de JARVIS. Extraé SÓLO hechos DURADEROS y útiles sobre el usuario o su proyecto que valga la pena recordar a largo plazo ' +
        '(perfil, preferencias, decisiones, procedimientos, tareas, proyectos). Ignorá saludos, preguntas puntuales y lo trivial. ' +
        'Respondé SÓLO JSON válido, sin texto extra: {"memories":[{"type":"profile|preference|decision|procedure|task|project","content":"frase corta, clara, en tercera persona","confidence":0.0}]}. ' +
        'Si no hay nada que valga la pena, respondé {"memories":[]}.';
      const usr = `Usuario: ${exchange.user}\nAsistente: ${exchange.assistant}`;

      let raw: string;
      try {
        const r = await provider.chat({ messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] });
        raw = r.content ?? '';
      } catch (err) {
        this.logger.warn(`extract failed: ${String(err)}`);
        return;
      }

      const candidates = this.parse(raw);
      for (const c of candidates) {
        if (!c.content?.trim() || (c.confidence ?? 1) < 0.5) continue;
        try {
          await this.reconcile(userId, c, exchange.projectId);
        } catch (err) {
          this.logger.warn(`reconcile failed: ${String(err)}`);
        }
      }
    } catch (err) {
      this.logger.warn(`learn failed: ${String(err)}`);
    }
  }

  private parse(raw: string): Candidate[] {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return [];
      const json = JSON.parse(m[0]) as { memories?: unknown };
      const arr = Array.isArray(json.memories) ? json.memories : [];
      return arr
        .filter(
          (x): x is Candidate =>
            !!x && typeof (x as Candidate).content === 'string' && VALID_TYPES.has((x as Candidate).type),
        )
        .slice(0, 8);
    } catch {
      return [];
    }
  }

  /** Dedup / self-correct / insert against existing memories of the same type. */
  private async reconcile(userId: string, c: Candidate, projectId?: string): Promise<void> {
    const hits = await this.memory.search(userId, { query: c.content, type: c.type, limit: 1 });
    const top = hits[0];

    if (top && top.score >= DUP) return; // already known
    if (top && top.score >= UPDATE) {
      await this.memory.update(userId, top.id, { content: c.content });
      await this.audit(userId, 'memory.update');
      this.logger.log(`auto-memory update [${c.type}] ${c.content.slice(0, 60)}`);
      return;
    }
    await this.memory.create(userId, {
      type: c.type,
      content: c.content,
      projectId,
      source: 'auto',
      tags: [],
      visibility: 'private',
      canBeUsedAutomatically: true,
      confidence: c.confidence ?? 0.8,
    });
    await this.audit(userId, 'memory.create');
    this.logger.log(`auto-memory create [${c.type}] ${c.content.slice(0, 60)}`);
  }

  private async audit(userId: string, taskType: string): Promise<void> {
    await this.prisma.actionLog
      .create({
        data: { userId, taskType, provider: 'auto', model: 'memory', knowledgeSources: 0, toolsUsed: ['memory.write'], estimatedCost: 0 },
      })
      .catch(() => undefined);
  }
}
