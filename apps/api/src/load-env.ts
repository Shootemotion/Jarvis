import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Load the single root .env before anything reads process.env.
// When launched via turbo/pnpm the cwd is apps/api, so the root is two up.
loadDotenv({ path: resolve(process.cwd(), '../../.env') });
