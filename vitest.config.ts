import { defineConfig } from "vitest/config";

// Backend suite only: unit (parse/validate) + API integration under test/.
// The frontend (jsdom) suite runs via `npm run test:web`, and Playwright e2e
// under e2e/ runs via `npm run e2e` — both are excluded here.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["web/**", "e2e/**", "node_modules/**", "dist/**"],
  },
});
