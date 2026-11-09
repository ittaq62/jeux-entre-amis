import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Certaines parties simulées durent plusieurs secondes quand tous les tests tournent en même temps
    testTimeout: 15000,
    environment: "node",
  },
});
