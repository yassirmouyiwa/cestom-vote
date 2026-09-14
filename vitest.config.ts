import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { ADMIN_PASSWORD: "secret", SECRET_KEY: "cle-de-test" },
        d1Databases: ["DB"],
        kvNamespaces: ["PHOTOS"],
      },
    }),
  ],
});
