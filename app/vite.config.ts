import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const keyPath = env["DEV_HTTPS_KEY"];
  const certPath = env["DEV_HTTPS_CERT"];
  const httpsEnabled = Boolean(keyPath && certPath);
  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error("Set both DEV_HTTPS_KEY and DEV_HTTPS_CERT to enable HTTPS for Vite.");
  }
  const httpsOptions =
    keyPath && certPath
      ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
      : undefined;

  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      tsconfigPaths(),
    ],
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
      allowedHosts: ["https://direct-travel-api.onrender.com/"],
      ...(httpsOptions ? { https: httpsOptions } : {}),
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          ...(httpsEnabled ? { headers: { "X-Forwarded-Proto": "https" } } : {}),
        },
      },
    },
  };
});
