import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { estimateCost } from './pricing';

export interface MonthUsage {
  messagesThisMonth: number;
  costThisMonth: number;
  inputTokens: number;
  outputTokens: number;
  periodStart: string;
}

function startOfMonth(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** Record one generation and return its estimated cost. */
  async log(
    userId: string,
    d: { provider: string; model: string; taskType?: string; inputTokens?: number; outputTokens?: number },
  ): Promise<number> {
    const cost = estimateCost(d.model, d.inputTokens ?? 0, d.outputTokens ?? 0);
    await this.prisma.usageLog.create({
      data: {
        userId,
        provider: d.provider,
        model: d.model,
        taskType: d.taskType ?? null,
        inputTokens: d.inputTokens ?? 0,
        outputTokens: d.outputTokens ?? 0,
        estimatedCost: cost,
      },
    });
    return cost;
  }

  async monthUsage(userId: string): Promise<MonthUsage> {
    const start = startOfMonth();
    const [count, agg] = await Promise.all([
      this.prisma.usageLog.count({ where: { userId, createdAt: { gte: start } } }),
      this.prisma.usageLog.aggregate({
        where: { userId, createdAt: { gte: start } },
        _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
      }),
    ]);
    return {
      messagesThisMonth: count,
      costThisMonth: agg._sum.estimatedCost ?? 0,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      periodStart: start.toISOString(),
    };
  }
}
