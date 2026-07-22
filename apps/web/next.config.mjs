/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Expose the build's git commit (Vercel sets VERCEL_GIT_COMMIT_SHA) so the UI
  // can show which version is live.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
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
