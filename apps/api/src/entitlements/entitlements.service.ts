import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FREE_PLAN } from './plans';

export interface Entitlements {
  plan: string;
  planName: string;
  status: string;
  features: string[];
  limits: Record<string, number>;
}

/**
 * Resolves what a user is allowed to do, based on their subscription/plan.
 * Missing/inactive subscriptions fall back to Free — so gating is safe by
 * default and users provisioned before plans existed still work.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string): Promise<Entitlements> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
      return {
        plan: sub.plan.key,
        planName: sub.plan.name,
        status: sub.status,
        features: sub.plan.features,
        limits: (sub.plan.limits as Record<string, number>) ?? {},
      };
    }

    const free = await this.prisma.plan.findUnique({ where: { key: 'free' } });
    return {
      plan: 'free',
      planName: free?.name ?? FREE_PLAN.name,
      status: sub?.status ?? 'active',
      features: free?.features ?? FREE_PLAN.features,
      limits: (free?.limits as Record<string, number>) ?? (FREE_PLAN.limits as unknown as Record<string, number>),
    };
  }

  async can(userId: string, feature: string): Promise<boolean> {
    const e = await this.getForUser(userId);
    return e.features.includes(feature);
  }
}
