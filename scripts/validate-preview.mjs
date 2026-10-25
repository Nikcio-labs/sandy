/**
 * Playwright validation sweep for the Sandy redesign preview.
 *
 * Drives every core flow against the mocked IPC (see src/previewMock.ts)
 * and saves screenshots per step for visual comparison with the concept.
 *
 *   PLAYWRIGHT_MODULE=/path/to/playwright-core \
 *   CHROMIUM_EXECUTABLE=/path/to/chrome \
 *   node scripts/validate-preview.mjs [outdir]
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");

const outDir = process.argv[2] ?? "/tmp/opencode/shots";
mkdirSync(outDir, { recursive: true });

const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
const text = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const expectText = async (name, needle) => record(name, (await text()).includes(needle), needle);

await page.goto("http://localhost:1420/?preview=1", { waitUntil: "networkidle" });
await page.waitForSelector(".row", { timeout: 10000 });
await shot("01-dashboard");

// ---- Dashboard: inspect, start/stop, search ----
await page.getByRole("button", { name: "Show details for docs-writer" }).click();
await expectText("02-inspector-open", "Start sandbox");
await shot("02-inspector");
await page.locator(".insbody").getByRole("button", { name: "Start sandbox" }).click();
await page.waitForTimeout(600);
await expectText("03-started", "Started docs-writer");
await shot("03-started");
await page.locator(".insbody").getByRole("button", { name: "Stop" }).click();
await page.waitForTimeout(600);
await expectText("04-stopped", "Stopped docs-writer");
await page.locator(".insclose").click();
await page.getByLabel("Search sandboxes").fill("portfolio");
await expectText("05-search", "Showing 1 of 4 sandboxes");
await shot("05-search");
await page.getByLabel("Search sandboxes").fill("");

// ---- Connect dialog ----
await page.locator(".row").first().getByRole("button", { name: /Open next-portfolio/ }).click();
await page.waitForSelector("dialog[open]");
await expectText("06-connect-dialog", "Terminal");
await shot("06-connect-dialog");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// ---- Create dialog: full wizard ----
await page.getByRole("button", { name: "Create sandbox" }).first().click();
await page.waitForSelector("dialog[open].appdialog-wide");
await expectText("07-create-dialog", "Start with your kit sources");
await shot("07-create-dialog");
await page.getByRole("button", { name: /Discover kits/ }).first().click();
await page.waitForTimeout(700);
await expectText("08-agent-step", "Choose an agent or workload");
await shot("08-agent-step");
// Agent choices are radio option cards; pick the discovered claude kit.
await page.locator('dialog .option input[name$="agent"]').first().check();
await page.locator("dialog").getByRole("button", { name: /Choose mixins/ }).click();
await expectText("09-mixin-step", "Make it your own");
await shot("09-mixin-step");
await page.locator("dialog").getByRole("button", { name: /Project details/ }).click();
await expectText("10-review-step", "Bring your project");
await shot("10-review-step");
await page.locator('dialog input[id$="-name"], dialog .field input').first().fill("preview-sandbox");
await page.locator('dialog label:has-text("Run without a workspace") input, dialog .check input').first().check();
await page.locator("dialog").getByRole("button", { name: /Save & launch|Save template/ }).first().click();
await page.waitForTimeout(900);
await shot("11-create-finished");
await expectText("11-create-finished", "preview-sandbox");

// ---- Templates ----
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator(".rail").getByRole("button", { name: "Templates" }).click();
await page.waitForTimeout(500);
await expectText("12-templates", "Saved on this computer");
await shot("12-templates");

// ---- Settings: nested panes ----
await page.locator(".rail").getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(400);
await expectText("13-settings-home", "Kit providers");
await expectText("13-settings-home", "Sandbox settings");
await shot("13-settings-home");
await page.getByRole("button", { name: /Sandbox settings/ }).click();
await page.waitForTimeout(500);
await expectText("14-settings-sandbox", "browser.enabled");
await expectText("14-settings-sandbox", "administrator settings are unavailable");
await shot("14-settings-sandbox");
// Toggle a bool, edit an int, then back out.
await page.getByRole("switch", { name: "browser.enabled" }).click();
await page.waitForTimeout(400);
const switched = await page.getByRole("switch", { name: "browser.enabled" }).getAttribute("aria-checked");
record("15-bool-toggled", switched === "false", `aria-checked=${switched}`);
await shot("15-bool-toggled");
await page.getByRole("button", { name: "Back to settings" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Kit providers/ }).click();
await page.waitForTimeout(400);
await expectText("16-settings-providers", "Docker sandboxing");
await shot("16-settings-providers");
await page.getByRole("button", { name: "Back to settings" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Advanced/ }).click();
await page.waitForTimeout(400);
await expectText("17-settings-advanced", "A running record of what Sandy does");
await shot("17-settings-advanced");

// ---- Setup flow via Settings home ----
await page.getByRole("button", { name: "Back to settings" }).click();
await page.waitForTimeout(300);
const setupButton = page.getByRole("button", { name: /Review setup|Continue setup/ });
if (await setupButton.count()) {
  await setupButton.click();
  await page.waitForTimeout(500);
  await expectText("18-setup-wizard", "Install CLI");
  await expectText("18-setup-wizard", "optional");
  await shot("18-setup-wizard");
}

console.log("\npage errors:", errors.length ? errors : "none");
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.pass) && errors.length === 0 ? 0 : 1);
