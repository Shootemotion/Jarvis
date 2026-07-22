import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ChatMessage } from '@jarvis/providers';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { MemoryService, MemorySearchResult } from '../memory/memory.service';
import { AutonomousMemoryService } from '../memory/autonomous-memory.service';
import { KnowledgeService, KnowledgeHit } from '../knowledge/knowledge.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { UsageService } from '../metering/usage.service';
import { AiSettingsService } from '../ai-settings/ai-settings.service';
import { AppConfigService } from '../config/config.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { FEATURES } from '../entitlements/plans';
import { ChatDto } from './dto';
import { JARVIS_SYSTEM_PROMPT } from './system-prompt';

const MAX_HISTORY = 20;
const MEMORY_TOP_K = 5;
// Only inject memories whose cosine similarity clears this bar.
const MEMORY_MIN_SCORE = 0.4;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
    private readonly memory: MemoryService,
    private readonly autoMemory: AutonomousMemoryService,
    private readonly knowledge: KnowledgeService,
    private readonly entitlements: EntitlementsService,
    private readonly usage: UsageService,
    private readonly aiSettings: AiSettingsService,
    private readonly config: AppConfigService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async chat(userId: string, dto: ChatDto) {
    // Plan gating + quota: block when the monthly message limit is reached.
    const ent = await this.entitlements.getForUser(userId);
    const limit = ent.limits.messagesPerMonth ?? -1;
    if (limit >= 0) {
      const { messagesThisMonth } = await this.usage.monthUsage(userId);
      if (messagesThisMonth >= limit) {
        throw new ForbiddenException(
          `Alcanzaste el límite mensual del plan ${ent.planName} (${limit} mensajes). Mejorá a Pro para más.`,
        );
      }
    }
    // Managed premium when the plan unlocks it, or when the deployment forces it
    // for everyone (cloud without Ollama).
    const allowPremium =
      ent.features.includes(FEATURES.PREMIUM_LLM) || this.config.managedLlmForAll;

    const conversation = await this.resolveConversation(userId, dto);

    // Persist the user's message first.
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        role: 'user',
        content: dto.message,
      },
    });

    // 1) Resolve the provider first (BYO key → managed premium → Ollama) so the
    // orchestrator can plan around what will actually run.
    const ai = await this.aiSettings.getResolved(userId);
    const order =
      ai.preferredProvider === 'auto' ? ['anthropic', 'openai'] : [ai.preferredProvider];
    let provider = null;
    let source = 'local';
    let reqModel: string | undefined;
    for (const pn of order) {
      const byoKey = pn === 'anthropic' ? ai.anthropicKey : ai.openaiKey;
      if (byoKey) {
        provider = this.registry.buildProvider(pn, byoKey, ai.model);
        source = 'byo';
        reqModel = ai.model;
        break;
      }
      if (allowPremium && this.registry.has(pn)) {
        provider = this.registry.getProvider(pn);
        source = 'managed';
        break;
      }
    }
    if (!provider) {
      if (this.config.managedLlmForAll && !this.registry.hasPremium()) {
        throw new ServiceUnavailableException(
          'No hay un modelo premium configurado en el servidor. Falta OPENAI_API_KEY (o ANTHROPIC_API_KEY).',
        );
      }
      provider = this.registry.getProvider('ollama');
    }

    // 2) Orchestration plan: task type, knowledge sources, model tier, tools, cost.
    const baseModel = source === 'byo' ? ai.model : this.config.chatModelResolved;
    // Knowledge sources are a Pro capability — also enabled when the deployment
    // grants managed access to everyone (single-owner / MANAGED_LLM_FOR_ALL).
    const knowledgePlan =
      ent.plan === 'pro' || this.config.managedLlmForAll ? 'pro' : 'free';
    const plan = this.orchestrator.buildPlan({
      message: dto.message,
      projectId: conversation.projectId ?? undefined,
      plan: knowledgePlan,
      providerName: provider.name,
      baseModel,
      hasEmbedding: this.registry.hasEmbedding(),
    });

    // 3) Gather knowledge per the plan's required sources (best-effort).
    // Embed the query ONCE (reused by memory + knowledge), then run memory +
    // knowledge + history concurrently to minimize latency.
    const projId = conversation.projectId ?? undefined;
    const wantMemory = plan.requiredKnowledgeSources.includes('memory');
    const wantDocs =
      plan.requiredKnowledgeSources.includes('documents') ||
      plan.requiredKnowledgeSources.includes('obsidian');
    let qVec: number[] | null = null;
    if ((wantMemory || wantDocs) && this.registry.hasEmbedding()) {
      qVec = await this.registry.embed(dto.message).catch(() => null);
    }
    const [memories, knowledgeHits, history] = await Promise.all([
      wantMemory && qVec
        ? this.retrieveMemories(userId, dto.message, projId, qVec)
        : Promise.resolve([] as MemorySearchResult[]),
      wantDocs && qVec
        ? this.knowledge
            .search(userId, dto.message, projId, MEMORY_TOP_K, qVec)
            .then((h) => h.filter((x) => x.score >= MEMORY_MIN_SCORE))
            .catch(() => [] as KnowledgeHit[])
        : Promise.resolve([] as KnowledgeHit[]),
      this.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: MAX_HISTORY,
      }),
    ]);

    // 4) System prompt = base + mode addendum + memory + knowledge.
    const modeAddendum = this.orchestrator.modePrompt(plan.taskType);
    const blocks = [JARVIS_SYSTEM_PROMPT];
    if (modeAddendum) blocks.push(modeAddendum);
    if (memories.length > 0) blocks.push(this.buildMemoryBlock(memories));
    if (knowledgeHits.length > 0) blocks.push(this.buildKnowledgeBlock(knowledgeHits));
    const systemContent = blocks.join('\n\n');

    const sources = knowledgeHits.map((h) => ({
      path: h.path,
      heading: h.heading,
      score: Math.round(h.score * 100) / 100,
    }));

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history.map((m) => ({
        role: m.role as ChatMessage['role'],
        content: m.content,
      })),
    ];

    this.logger.log(
      `chat -> provider=${provider.name} model=${plan.model} task=${plan.taskType} source=${source}`,
    );

    // 5) Generation model: BYO keeps the user's model; managed uses the plan's pick.
    const genModel =
      source === 'byo' ? reqModel : plan.model && plan.model !== 'default' ? plan.model : undefined;

    let reply;
    try {
      reply = await provider.chat({ messages, model: genModel });
    } catch (err) {
      this.logger.error(`Provider error: ${String(err)}`);
      throw new ServiceUnavailableException(
        err instanceof Error ? err.message : 'Fallo del proveedor de IA.',
      );
    }

    // Persist the assistant's message with provenance metadata.
    const saved = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        role: 'assistant',
        content: reply.content,
        metadata: {
          provider: reply.provider,
          model: reply.model,
          usage: reply.usage ?? {},
          latencyMs: reply.latencyMs,
          plan: ent.plan,
          source,
          taskType: plan.taskType,
          knowledgeSources: sources,
        } as unknown as Prisma.InputJsonObject,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Metering: record tokens + estimated cost for this generation.
    const estimatedCost = await this.usage.log(userId, {
      provider: reply.provider,
      model: reply.model,
      taskType: dto.taskType,
      inputTokens: reply.usage?.inputTokens,
      outputTokens: reply.usage?.outputTokens,
    });

    // Basic orchestrator audit (Answer Mode).
    await this.prisma.actionLog
      .create({
        data: {
          userId,
          taskType: plan.taskType,
          provider: reply.provider,
          model: reply.model,
          knowledgeSources: sources.length,
          toolsUsed: plan.requiredTools,
          estimatedCost,
        },
      })
      .catch(() => undefined);

    // Learn from this exchange in the background (unattended memory) — never blocks the reply.
    void this.autoMemory.learn(userId, {
      user: dto.message,
      assistant: reply.content,
      projectId: conversation.projectId ?? undefined,
    });

    const embeddingProvider = this.registry.hasEmbedding()
      ? this.config.embeddings.provider
      : null;

    return {
      conversationId: conversation.id,
      messageId: saved.id,
      reply: { role: 'assistant', content: reply.content },
      provider: reply.provider,
      model: reply.model,
      usage: reply.usage,
      latencyMs: reply.latencyMs,
      plan: ent.plan,
      estimatedCost,
      memoriesUsed: memories.length,
      sources,
      embeddingProvider,
      orchestration: {
        taskType: plan.taskType,
        provider: plan.provider,
        model: plan.model,
        requiredKnowledgeSources: plan.requiredKnowledgeSources,
        requiredTools: plan.requiredTools,
        reason: plan.reason,
        estimatedCost: plan.estimatedCost,
        requiresConfirmation: plan.requiresConfirmation,
      },
    };
  }

  /** Best-effort semantic recall. Failures (e.g. embedding model missing) are
   * swallowed so a chat still works without memory. */
  private async retrieveMemories(
    userId: string,
    query: string,
    projectId?: string,
    queryVector?: number[],
  ): Promise<MemorySearchResult[]> {
    try {
      const results = await this.memory.search(
        userId,
        { query, projectId, limit: MEMORY_TOP_K },
        true, // automatic-use memories only
        queryVector,
      );
      return results.filter((m) => m.score >= MEMORY_MIN_SCORE);
    } catch (err) {
      this.logger.warn(`Memory recall skipped: ${String(err)}`);
      return [];
    }
  }

  private buildMemoryBlock(memories: MemorySearchResult[]): string {
    const lines = memories
      .map((m) => `- [${m.type}] ${m.content}`)
      .join('\n');
    return `Memoria relevante del usuario (usala solo si aplica; no inventes):\n${lines}`;
  }

  private buildKnowledgeBlock(hits: KnowledgeHit[]): string {
    const lines = hits
      .map((h) => `- (${h.path}${h.heading ? ` › ${h.heading}` : ''})\n${h.content}`)
      .join('\n\n');
    return `Conocimiento del usuario (Obsidian / documentos). Usalo para responder y CITÁ la fuente (archivo › sección) cuando corresponda:\n${lines}`;
  }

  private async resolveConversation(userId: string, dto: ChatDto) {
    if (dto.conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, userId },
      });
      if (!existing) throw new NotFoundException('Conversación no encontrada.');
      return existing;
    }

    // New conversation: title from the first message (truncated).
    const title =
      dto.message.length > 60 ? `${dto.message.slice(0, 57)}…` : dto.message;
    return this.prisma.conversation.create({
      data: { userId, projectId: dto.projectId ?? null, title },
    });
  }

  listConversations(userId: string, projectId?: string) {
    return this.prisma.conversation.findMany({
      where: { userId, ...(projectId ? { projectId } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, projectId: true, updatedAt: true },
    });
  }

  async getConversation(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversación no encontrada.');
    return conversation;
  }
}
