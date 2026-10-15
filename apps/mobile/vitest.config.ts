import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de la logique pure de l'app (sans React Native) ; même alias « @/ » que tsconfig.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
