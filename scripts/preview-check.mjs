/**
 * Preview smoke check: boots the mocked app in Chromium and reports whether
 * the main surfaces render. Run with the global playwright installation:
 *
 *   PLAYWRIGHT_MODULE=$NPM_GLOBAL/playwright-core \
 *   CHROMIUM_EXECUTABLE=~/.cache/ms-playwright/chromium-1148/chrome-linux/chrome \
 *   node scripts/preview-check.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");

const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto("http://localhost:1420/?preview=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const checks = {
  "app shell": await page.locator(".shell").count(),
  "sidebar": await page.locator(".rail").count(),
  "sandbox rows": await page.locator(".row").count(),
  "page head": await page.locator(".pagehead h1").count(),
};
console.log("checks:", checks);
console.log("page text sample:", (await page.locator("body").innerText()).slice(0, 400).replace(/\n+/g, " | "));
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
