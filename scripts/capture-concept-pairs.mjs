/**
 * Captures matched screenshots from the concept study (design-concepts.html)
 * and the app preview, so a reviewer can compare side by side.
 *
 *   PLAYWRIGHT_MODULE=/path/to/playwright-core \
 *   CHROMIUM_EXECUTABLE=/path/to/chrome \
 *   node scripts/capture-concept-pairs.mjs [outdir]
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");

const outDir = process.argv[2] ?? "/tmp/opencode/pairs";
mkdirSync(outDir, { recursive: true });
const conceptPath =
  process.env.CONCEPT_FILE ??
  "/home/agent/workspace/sandy/.worktrees/design-iteration/design/design-concepts.html";

const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

// ---- Concept window captures ----
await page.goto(`file://${conceptPath}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const win = page.locator("#win");

// Dashboard (concept opens on home; switch to sandboxes list)
await page.locator('[data-nav="sandboxes"]').click();
await page.waitForTimeout(400);
await win.screenshot({ path: join(outDir, "concept-dashboard.png") });

// Inspector
await page.locator('[data-select="docs-writer"]').click();
await page.waitForTimeout(300);
await win.screenshot({ path: join(outDir, "concept-inspector.png") });

// Connect dialog
await page.locator(".row").first().getByRole("button", { name: /Open next-portfolio/ }).click();
await page.waitForTimeout(400);
await win.screenshot({ path: join(outDir, "concept-connect.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Create wizard (providers step)
await page.locator("#pageAction").click();
await page.waitForTimeout(500);
await win.screenshot({ path: join(outDir, "concept-create-providers.png") });
// Agent step
await page.getByRole("button", { name: "Discover kits" }).click();
await page.waitForTimeout(900);
await win.screenshot({ path: join(outDir, "concept-create-agent.png") });

// Settings home
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator('[data-nav="settings"]').click();
await page.waitForTimeout(400);
await win.screenshot({ path: join(outDir, "concept-settings-home.png") });
// Sandbox settings pane
await page.locator('[data-pane-open="sandbox"]').click();
await page.waitForTimeout(400);
await win.screenshot({ path: join(outDir, "concept-settings-sandbox.png") });

// Setup replay
await page.locator("#replaySetup").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.locator("#bootDemo").screenshot({ path: join(outDir, "concept-setup.png") });

// ---- App preview captures (same surfaces) ----
await page.setViewportSize({ width: 1280, height: 820 });
await page.goto("http://localhost:1420/?preview=1", { waitUntil: "networkidle" });
await page.waitForSelector(".row", { timeout: 10000 });
await page.waitForTimeout(500);

const app = page.locator(".shell");
await app.screenshot({ path: join(outDir, "app-dashboard.png") });

await page.getByRole("button", { name: "Show details for docs-writer" }).click();
await page.waitForTimeout(300);
await app.screenshot({ path: join(outDir, "app-inspector.png") });

await page.locator(".row").first().getByRole("button", { name: /Open next-portfolio/ }).click();
await page.waitForSelector("dialog[open]");
await page.waitForTimeout(300);
await app.screenshot({ path: join(outDir, "app-connect.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

await page.getByRole("button", { name: "Create sandbox" }).first().click();
await page.waitForSelector("dialog[open].appdialog-wide");
await page.waitForTimeout(400);
await page.locator("dialog").screenshot({ path: join(outDir, "app-create-providers.png") });
await page.getByRole("button", { name: /Discover kits/ }).first().click();
await page.waitForTimeout(900);
await page.locator("dialog").screenshot({ path: join(outDir, "app-create-agent.png") });
await page.locator('button[aria-label="Close create dialog"]').click();
await page.waitForTimeout(300);

await page.locator(".rail").getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "app-settings-home.png") });
await page.getByRole("button", { name: /Sandbox settings/ }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "app-settings-sandbox.png") });

await page.getByRole("button", { name: "Back to settings" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Review setup|Continue setup/ }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "app-setup.png") });

console.log("captured to", outDir);
await browser.close();
