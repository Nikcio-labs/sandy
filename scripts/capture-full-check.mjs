/**
 * Extended capture for the full visual check: every app surface plus
 * animation state, against the concept where a counterpart exists.
 *
 *   PLAYWRIGHT_MODULE=/path/to/playwright-core \
 *   CHROMIUM_EXECUTABLE=/path/to/chrome \
 *   node scripts/capture-full-check.mjs [outdir]
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");

const outDir = process.argv[2] ?? "/tmp/opencode/full";
mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const app = page.locator(".shell");

await page.goto("http://localhost:1420/?preview=1", { waitUntil: "networkidle" });
await page.waitForSelector(".row", { timeout: 10000 });
await page.waitForTimeout(500);

// Dashboard states
await app.screenshot({ path: join(outDir, "01-dashboard.png") });
await page.getByRole("button", { name: "Show details for docs-writer" }).click();
await page.waitForTimeout(300);
await app.screenshot({ path: join(outDir, "02-inspector-stopped.png") });
// Pending action animation state
await page.locator(".insbody").getByRole("button", { name: "Start sandbox" }).click();
await page.waitForTimeout(120);
await app.screenshot({ path: join(outDir, "03-pending-action.png") });
await page.waitForTimeout(900);
// Toast (entry animation just finished; trigger another for mid-state)
await page.locator(".insbody").getByRole("button", { name: "Stop" }).click();
await page.waitForTimeout(260);
await app.screenshot({ path: join(outDir, "04-toast.png") });
await page.waitForTimeout(6000);

// Create dialog: size + all steps
await page.getByRole("button", { name: "Create sandbox" }).first().click();
await page.waitForSelector("dialog[open].appdialog-wide");
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "05-create-step1.png") });
await page.getByRole("button", { name: /Discover kits/ }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: join(outDir, "06-create-step2.png") });
await page.locator("dialog .option").first().click();
await page.locator("dialog").getByRole("button", { name: /Choose mixins/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "07-create-step3.png") });
await page.locator("dialog").getByRole("button", { name: /Project details/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "08-create-step4.png") });
// Backdrop click closes
await page.mouse.click(40, 760);
await page.waitForTimeout(300);
console.log("create dialog closed by backdrop:", (await page.locator("dialog[open]").count()) === 0);

// Templates + launch dialog
await page.locator(".rail").getByRole("button", { name: "Templates" }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "09-templates.png") });
const launch = page.getByRole("button", { name: /Launch preview-sandbox/ });
if (await launch.count()) {
  await launch.click();
  await page.waitForSelector("dialog[open]");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, "10-launch-dialog.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

// Settings: home, sandbox settings with edits, providers, advanced
await page.locator(".rail").getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "11-settings-home.png") });
await page.getByRole("button", { name: /Sandbox settings/ }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "12-settings-sandbox.png") });
// Type into a setting to show the styled field + apply state
const intInput = page.locator(".settingvalue").first();
await intInput.fill("7");
await page.waitForTimeout(200);
await app.screenshot({ path: join(outDir, "13-settings-edited.png") });
await page.getByRole("button", { name: "Back to settings" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Kit providers/ }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "14-settings-providers.png") });
await page.getByRole("button", { name: "Back to settings" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Advanced/ }).click();
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "15-settings-advanced.png") });
await page.getByRole("button", { name: "Back to settings" }).click();
await page.waitForTimeout(300);

// Setup wizard
await page.getByRole("button", { name: /Review setup|Continue setup/ }).click();
await page.waitForTimeout(600);
await app.screenshot({ path: join(outDir, "16-setup.png") });

// Connect dialog
await page.locator(".rail").getByRole("button", { name: "Sandboxes" }).click();
await page.waitForTimeout(500);
await page.locator(".row").first().getByRole("button", { name: /Open next-portfolio/ }).click();
await page.waitForSelector("dialog[open]");
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "17-connect-terminal.png") });
await page.getByRole("button", { name: "VS Code" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "18-connect-vscode.png") });

// Narrow window
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.setViewportSize({ width: 900, height: 720 });
await page.waitForTimeout(500);
await app.screenshot({ path: join(outDir, "19-narrow-900.png") });

console.log("captured to", outDir);
await browser.close();
