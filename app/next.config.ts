import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Aplicación interna autenticada: todo es dinámico, no usamos Cache Components.
  cacheComponents: false,
  partialPrefetching: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
