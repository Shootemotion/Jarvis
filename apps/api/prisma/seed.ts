import { Prisma, PrismaClient } from '@prisma/client';
import { PLAN_DEFS } from '../src/entitlements/plans';

const prisma = new PrismaClient();

// Single-user MVP: identity comes from env (no auth yet).
const USER_NAME = process.env.JARVIS_USER_NAME ?? 'Bruno';
const USER_EMAIL = process.env.JARVIS_USER_EMAIL ?? 'bruno.cleri@diagnos.com.ar';

const DEFAULT_PROJECTS = ['JARVIS', 'General'];

// Only Ollama is enabled by default (spec §24).
const DEFAULT_PROVIDERS = [
  { name: 'ollama', type: 'llm', enabled: true },
  { name: 'openai', type: 'llm', enabled: false },
  { name: 'anthropic', type: 'llm', enabled: false },
  { name: 'gemini', type: 'llm', enabled: false },
  { name: 'mistral', type: 'llm', enabled: false },
  { name: 'local_embeddings', type: 'embedding', enabled: true },
];

async function main() {
  const user = await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: { name: USER_NAME },
    create: { name: USER_NAME, email: USER_EMAIL, preferredLanguage: 'es' },
  });
  console.log(`✔ user: ${user.name} <${user.email}>`);

  for (const name of DEFAULT_PROJECTS) {
    const project = await prisma.project.upsert({
      where: { userId_name: { userId: user.id, name } },
      update: {},
      create: { userId: user.id, name },
    });
    console.log(`✔ project: ${project.name}`);
  }

  for (const p of DEFAULT_PROVIDERS) {
    const provider = await prisma.provider.upsert({
      where: { name: p.name },
      update: { type: p.type },
      create: p,
    });
    console.log(`✔ provider: ${provider.name} (enabled=${provider.enabled})`);
  }

  for (const plan of PLAN_DEFS) {
    const saved = await prisma.plan.upsert({
      where: { key: plan.key },
      update: {
        name: plan.name,
        description: plan.description,
        features: plan.features,
        limits: plan.limits as unknown as Prisma.InputJsonObject,
        priceArs: plan.priceArs,
      },
      create: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        features: plan.features,
        limits: plan.limits as unknown as Prisma.InputJsonObject,
        priceArs: plan.priceArs,
      },
    });
    console.log(`✔ plan: ${saved.key} (${saved.features.length} features)`);
  }

  // Ensure the seeded selfhost user has a Free subscription.
  const freePlan = await prisma.plan.findUnique({ where: { key: 'free' } });
  if (freePlan) {
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, planId: freePlan.id, status: 'active' },
    });
    console.log('✔ subscription: seeded user → free');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
