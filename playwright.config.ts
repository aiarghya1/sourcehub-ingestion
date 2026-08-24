import { defineConfig } from "@playwright/test";

/**
 * End-to-end config: builds and starts the real app (API + built SPA served from
 * one process) against a throwaway PGlite directory, then drives it in a browser.
 * Run with: npm run build && npm run e2e   (needs `npx playwright install chromium`)
 */
const PORT = 3099;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm start",
    env: {
      PORT: String(PORT),
      PGLITE_DIR: "./.data/e2e",
      NODE_ENV: "production",
    },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
