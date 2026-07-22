import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let APP_VERSION = '0.0.0';
try {
  APP_VERSION = JSON.parse(readFileSync(resolve(here, '../../version.json'), 'utf8')).version;
} catch {
  /* keep default */
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Single source of truth for the app version (root version.json), shown in the UI.
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  webpack: (config) => {
    // transformers.js runs in the browser/worker via onnxruntime-web (WASM).
    // Prevent webpack from trying to bundle the Node-only native runtime.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
      sharp: false,
    };
    return config;
  },
};

export default nextConfig;
