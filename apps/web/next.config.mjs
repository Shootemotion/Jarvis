/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
