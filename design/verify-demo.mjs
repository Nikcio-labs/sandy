import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const file = process.argv[2] || fileURLToPath(new URL("design-concepts.html", import.meta.url));
const html = await readFile(file, "utf8");
new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
let depth = 0;
for (const character of css) {
  if (character === "{") depth++;
  if (character === "}") depth--;
  assert.ok(depth >= 0, "Unexpected closing CSS brace");
}
assert.equal(depth, 0, "Unclosed CSS block");
assert.doesNotMatch(css, /transition:\s*all\b|scale\(0\)/);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  args: ["--no-sandbox"],
});
const errors = [];
const unexpectedRequests = [];
const checks = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("https://**/*", async route => {
  if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(route.request().url())) unexpectedRequests.push(route.request().url());
  await route.abort();
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.setDefaultTimeout(8000);
const action = name => page.locator(`[data-action="${name}"]`);
const reset = () => page.locator("#resetDemo").click();
const nav = name => page.locator(`[data-nav="${name}"]`).click();
const text = selector => page.locator(selector).textContent();
const until = predicate => page.waitForFunction(predicate);
const closed = () => until(() => document.querySelector("#winOverlay").hidden);
const titleIs = title => page.waitForFunction(value => document.querySelector("#dialogTitle")?.textContent === value, title);
const row = name => page.locator(`.row[data-name="${name}"]`);
const rowAction = name => row(name).locator(".rowaction");
const check = async (label, callback) => { await callback(); checks.push(label); console.log(`✓ ${label}`); };

try {
  await page.goto(pathToFileURL(file).href);
  await check("Self-contained assets and valid DOM", async () => {
    assert.equal(await page.locator("#rows .row").count(), 4);
    const result = await page.evaluate(() => ({
      duplicateIds: [...document.querySelectorAll("[id]")].map(e => e.id).filter((id, i, ids) => ids.indexOf(id) !== i),
      nestedButtons: document.querySelectorAll("button button").length,
      brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
      externalScripts: document.querySelectorAll("script[src]").length,
    }));
    assert.deepEqual(result, { duplicateIds: [], nestedButtons: 0, brokenImages: 0, externalScripts: 0 });
    assert.match(await text("#winSub"), /2 running · 1 stopped · 1 inactive/);
    const geometry = await page.evaluate(() => {
      const close = document.querySelector(".insclose").getBoundingClientRect();
      const inspector = document.querySelector("#inspector").getBoundingClientRect();
      const title = document.querySelector("#closeBtn").getBoundingClientRect();
      return { contained: close.top >= inspector.top && close.right <= inspector.right, separated: close.top > title.bottom };
    });
    assert.deepEqual(geometry, { contained: true, separated: true });
  });
  await check("Instant selection, close/reopen, and keyboard focus", async () => {
    await page.locator('[data-select="python-lab"]').focus();
    await page.keyboard.press("Enter");
    assert.equal(await text("#inspector h2"), "python-lab");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.select), "python-lab");
    await action("close-inspector").click();
    assert.equal(await page.locator("#inspector").isVisible(), false);
    await page.locator('[data-select="python-lab"]').click();
    assert.equal(await page.locator("#inspector").isVisible(), true);
    assert.equal(await page.locator('[data-select="python-lab"]').getAttribute("aria-pressed"), "true");
    await page.locator("#sbxSearch").fill("nothing-matches");
    assert.match(await text("#rows"), /No matching sandboxes/);
    await action("clear-search").click();
    assert.equal(await page.locator("#rows .row").count(), 4);
  });
  await check("CLI state retained while pending; failed start and retry", async () => {
    await page.locator('[data-select="docs-writer"]').click();
    await page.locator("#failNext").check();
    await rowAction("docs-writer").click();
    assert.match(await text('#rows .row[data-name="docs-writer"] .state'), /Starting/);
    assert.match(await text("#inspector .details"), /stopped/);
    await until(() => !document.querySelector('.row[data-name="docs-writer"] .spinner'));
    assert.match(await text("#listError"), /Couldn’t start/);
    assert.match(await text('#rows .row[data-name="docs-writer"] .state'), /Stopped/);
    await action("retry-start").click();
    await until(() => document.querySelector('.row[data-name="docs-writer"] .state').textContent === "Running");
    assert.match(await text("#winSub"), /3 running/);
    await action("stop").click();
    await until(() => document.querySelector('.row[data-name="docs-writer"] .state').textContent === "Stopped");
  });
  await check("Restart failure reports the confirmed stopped state", async () => {
    await page.locator('[data-select="next-portfolio"]').click();
    await page.locator("#failNext").check();
    await action("restart").click();
    await until(() => !!document.querySelector('[data-action="retry-start"]'));
    assert.match(await text("#inspector .details"), /stopped/);
    assert.match(await text("#listError"), /was stopped/);
    await action("retry-start").click();
    await until(() => document.querySelector('.row[data-name="next-portfolio"] .state').textContent === "Running");
  });
  await check("Failed refresh preserves the current search and rows", async () => {
    await page.locator("#sbxSearch").fill("codex");
    await page.locator("#failNext").check();
    await action("refresh").click();
    await until(() => document.querySelector("#listError").textContent.includes("Couldn’t refresh"));
    assert.equal(await page.locator("#rows .row").count(), 1);
    assert.equal(await page.locator("#sbxSearch").inputValue(), "codex");
    await page.locator('#listError [data-action="refresh"]').click();
    await until(() => document.querySelector("#listError").textContent === "");
  });
  await check("Connect methods, optional SSH, terminal retry, focus trap", async () => {
    await reset(); await rowAction("next-portfolio").click();
    assert.match(await text("#dialog"), /From your SSH configuration/);
    assert.doesNotMatch(await text("#dialog"), /2222|127\.0\.0\.1|sbx ssh/);
    await page.locator('[data-method="vscode"]').click();
    assert.match(await text("#dialog"), /Remote – SSH/);
    await action("ssh-setup").click();
    await until(() => document.querySelector("#connectFeedback")?.textContent.includes("SSH check complete"));
    await page.locator('[data-method="opencode"]').click();
    assert.match(await text("#dialog"), /Add SSH Server/);
    await page.locator('[data-method="terminal"]').click();
    await page.locator("#failNext").check(); await action("terminal").click();
    await until(() => document.querySelector("#connectFeedback")?.textContent.includes("Couldn’t open"));
    await action("terminal").click();
    await until(() => document.querySelector("#connectFeedback")?.textContent.includes("sbx exec -it next-portfolio /bin/bash"));
    const last = page.locator('#dialog button:not(:disabled)').last(); await last.focus(); await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.querySelector("#dialog").contains(document.activeElement)), true);
    await page.keyboard.press("Escape"); await closed();
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-name")), "next-portfolio");
  });
  await check("Template resume preserves existing agent, tools, and workspace", async () => {
    await nav("templates"); await page.locator('[data-action="launch-template"][data-id="portfolio"]').click();
    assert.match(await text("#launchNotice"), /already exists/);
    assert.equal(await page.locator("#launchWs").isDisabled(), true);
    await page.locator('button[form="launchForm"]').click();
    await closed(); assert.equal(await page.locator("#rows .row").count(), 4);
    assert.match(await text("#inspector .details"), /portfolio/);
  });
  await check("Mountless isolation, launch failure, retry, and new-row handoff", async () => {
    await nav("templates"); await page.locator('[data-action="launch-template"][data-id="python"]').click();
    await page.locator("#launchSbxName").fill("python-new");
    assert.equal(await page.locator("#mountless").isChecked(), true);
    assert.equal(await page.locator("#mountless").isDisabled(), true);
    assert.equal(await page.locator("#launchWs").isDisabled(), true);
    await page.locator("#failNext").check(); await page.locator('button[form="launchForm"]').click();
    await titleIs("Template kept. Launch needs attention."); await action("retry-launch-dialog").click();
    assert.equal(await page.locator("#launchSbxName").inputValue(), "python-new");
    await page.locator('button[form="launchForm"]').click(); await closed();
    assert.equal(await page.locator("#rows .row").count(), 5);
    assert.equal(await text("#inspector h2"), "python-new");
    assert.match(await text("#inspector .details"), /None \(mountless\)/);
    await nav("templates"); assert.equal(await page.locator("#tplList .template").count(), 3);
  });
  await check("Four-step creation, compatibility, real inputs, outside-workspace validation", async () => {
    await reset(); await page.locator("#pageAction").click(); await action("discover").click();
    await until(() => !!document.querySelector('[data-kit="claude"]'));
    await page.locator('[data-kit="claude"]').click(); await action("wizard-next").click();
    assert.equal(await page.locator('[data-kit="playwright"]').count(), 0);
    await page.locator('[data-kit="node2"]').click();
    await page.locator('[data-kit-input="node2"][data-arg="nodeVersion"]').fill("22");
    await action("wizard-next").click();
    await page.locator("#cwName").fill("test-environment"); await page.locator("#cwWs").fill("/Users/alex/Projects/example");
    await page.locator("#cwPath").fill("/Users/alex/Projects/example/sandbox.yaml");
    await action("save-template").click(); assert.match(await text("#wizardError"), /outside the workspace/);
    await page.locator("#cwPath").fill("");
    assert.match(await text("#yamlPreview"), /schemaVersion: "1"/);
    assert.match(await text("#yamlPreview"), /nodeVersion.*22/);
    assert.doesNotMatch(await text("#yamlPreview"), /\nkit:|\nmixins:/);
    await page.locator("#failNext").check(); await action("save-launch").click();
    await titleIs("Your template is saved"); assert.match(await text("#dialog"), /could not complete the launch/);
    await action("launch-saved").click(); await titleIs("Your sandbox is ready");
    await action("view-created").click(); assert.equal(await page.locator("#rows .row").count(), 5);
    await nav("templates"); assert.equal(await page.locator("#tplList .template").count(), 4);
    const template = page.locator('.template').filter({ has: page.locator('h3', { hasText: "test-environment" }) });
    await template.locator('[data-action="edit-template"]').click(); await page.locator('[data-step="3"]').click();
    await page.locator("#cwName").fill("test-environment-edited"); await action("save-template").click();
    await titleIs("Your template is saved"); await action("view-templates").click();
    assert.equal(await page.locator("#tplList .template").count(), 4);
    assert.match(await text("#tplList"), /test-environment-edited/);
    await page.locator('[data-action="delete-template"]').last().click(); await action("confirm-delete").click(); await closed();
    assert.equal(await page.locator("#tplList .template").count(), 3);
    await nav("sandboxes"); assert.equal(await page.locator("#rows .row").count(), 5);
  });
  await check("V3 kit selection removes incompatible v2 mixins and escapes YAML literals", async () => {
    await reset(); await page.locator("#pageAction").click(); await action("discover").click();
    await until(() => !!document.querySelector('[data-kit="claude3"]'));
    await page.locator('[data-kit="claude3"]').click(); await action("wizard-next").click();
    assert.equal(await page.locator('[data-kit="node2"]').count(), 0);
    await page.locator('[data-kit="playwright"]').click();
    assert.equal(await page.locator('[data-kit-input="claude3"][data-arg="version"]').inputValue(), "2.1.267");
    await action("wizard-next").click(); await page.locator("#cwName").fill("literal-test");
    await page.locator("#cwWs").fill("/Users/alex/${{ literal }}/project");
    assert.match(await text("#yamlPreview"), /\$\$\{\{ literal/);
    await action("browse-wizard").click(); await page.keyboard.press("Escape");
    assert.equal(await page.locator("#cwName").inputValue(), "literal-test");
    await page.keyboard.press("Escape"); await titleIs("Leave this configuration?");
    await action("keep-editing").click(); assert.equal(await page.locator("#cwName").inputValue(), "literal-test");
    await action("close").click(); await action("discard").click(); await closed();
  });
  await check("Required kit arguments, discovery retry, save-only failure, and manual copy", async () => {
    await reset(); await page.locator("#pageAction").click();
    await page.locator('[data-provider="example"] [data-provider-field="enabled"]').check();
    await page.locator("#failNext").check(); await action("discover").click();
    await until(() => document.querySelector("#wizardError").textContent.includes("discovery failed"));
    await action("discover").click(); await until(() => !!document.querySelector('[data-kit="claude3"]'));
    await page.locator('[data-kit="claude3"]').click(); await action("wizard-next").click();
    await page.locator('[data-kit="conventions"]').click(); await action("wizard-next").click();
    assert.match(await text("#wizardError"), /Enter project label/);
    await page.locator('[data-kit-input="conventions"][data-arg="project_label"]').fill("Sample project");
    await action("wizard-next").click(); await page.locator("#cwName").fill("required-inputs");
    await page.locator("#cwMountless").check();
    assert.doesNotMatch(await text("#yamlPreview"), /\nworkspace:/);
    await page.locator("#failNext").check(); await action("save-template").click();
    await until(() => document.querySelector("#wizardError").textContent.includes("Couldn’t save"));
    assert.equal(await page.locator("#cwName").inputValue(), "required-inputs");
    await action("save-template").click(); await titleIs("Your template is saved");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("Denied for test")) } }));
    await action("copy-saved").click(); await titleIs("Copy manually");
    assert.match(await page.locator("#manualCopy").inputValue(), /project_label.*Sample project/);
    await action("copy-done").click(); await titleIs("Your template is saved");
    await action("view-templates").click(); assert.equal(await page.locator("#tplList .template").count(), 4);
    await page.evaluate(() => { delete navigator.clipboard; });
  });
  await check("Disabled Git providers block creation, but not existing-sandbox resume", async () => {
    await reset(); await nav("settings"); await page.locator('[data-pane-open="providers"]').click();
    await page.locator('[data-provider="community"] [data-provider-field="enabled"]').uncheck();
    await action("save-providers").click(); await nav("templates");
    await page.locator('[data-action="launch-template"][data-id="portfolio"]').click();
    await page.locator("#launchSbxName").fill("blocked-new-name"); await page.locator('button[form="launchForm"]').click();
    assert.match(await text("#launchError"), /Enable the GitHub provider/);
    await page.locator("#launchSbxName").fill("next-portfolio"); await page.locator('button[form="launchForm"]').click();
    await closed(); assert.equal(await page.locator("#rows .row").count(), 4);
  });
  await check("Nested settings, editable providers, dirty guards, and reference picker", async () => {
    await reset(); await nav("settings"); await page.locator('[data-pane-open="providers"]').click();
    await page.locator('#providerList [data-provider-field="label"]').first().fill("Team source");
    await page.keyboard.press("Escape"); await titleIs("Leave unsaved provider changes?");
    await action("keep-providers").click(); await action("save-providers").click();
    await action("provider-versions").first().click(); await page.locator("#providerRef").fill("main");
    await action("use-provider-ref").click();
    assert.equal(await page.locator('#providerList [data-provider-field="reference"]').first().inputValue(), "main");
    await action("save-providers").click();
    await action("add-provider").click(); assert.equal(await page.locator("#providerList .provider").count(), 4);
    await nav("home"); await action("discard-providers").click(); await closed();
    await nav("settings"); await page.locator('[data-pane-open="providers"]').click();
    assert.equal(await page.locator("#providerList .provider").count(), 3);
    assert.equal(await page.locator('#providerList [data-provider-field="label"]').first().inputValue(), "Team source");
    await page.keyboard.press("Escape"); assert.equal(await page.locator("#settingsPane").count(), 0);
  });
  await check("Documented typed settings, invalid JSON, failure rollback, reset", async () => {
    await page.locator('[data-pane-open="sandbox"]').click();
    assert.equal(await page.locator(".setting").count(), 31);
    assert.equal(await page.locator('[data-setting="sandbox.autoStop"]').count(), 0);
    const clipboard = page.locator('[data-setting="clipboard.imagePaste"]');
    await clipboard.click(); assert.equal(await clipboard.getAttribute("aria-checked"), "true");
    await page.locator("#failNext").check(); await clipboard.click();
    assert.equal(await clipboard.getAttribute("aria-checked"), "true");
    await page.locator('[data-action="reset-setting"][data-key="clipboard.imagePaste"]').click();
    assert.equal(await clipboard.getAttribute("aria-checked"), "false");
    await page.locator("#settingFilter").fill("kit.allowedSources");
    const sources = page.locator('[data-setting="kit.allowedSources"]');
    await sources.fill("not-json"); await action("apply-setting").click();
    assert.equal(await sources.inputValue(), "not-json");
    await sources.fill('["docker.io/","github.com/example/"]'); await action("apply-setting").click();
    assert.match(await text(".setting .badge"), /override/);
    await action("reset-setting").click(); assert.match(await sources.inputValue(), /docker.io/);
    await page.keyboard.press("Escape");
  });
  await check("Diagnostic logs, error filter, clear, and updates", async () => {
    await page.locator('[data-pane-open="advanced"]').click(); await page.locator("#logFilter").selectOption("errors");
    assert.match(await text("#logEntries"), /No matching log/);
    await page.locator("#logFilter").selectOption("all"); await action("clear-log").click();
    assert.match(await text("#logEntries"), /No matching log/);
    await page.keyboard.press("Escape"); await action("check-update").click();
    await until(() => !!document.querySelector('[data-action="download-update"]'));
    await action("download-update").click(); await until(() => !!document.querySelector('[data-action="restart-update"]'));
    await action("restart-update").click(); assert.match(await text("#updateContent"), /No application was updated/);
  });
  await check("First-open replay, required-only setup, and window controls", async () => {
    await page.locator("#replaySetup").click(); await action("next-boot").click();
    await until(() => document.querySelector('[data-action="next-boot"]').textContent === "Sign in to Docker");
    await action("next-boot").click(); await until(() => document.querySelector("#bootDemo").textContent.includes("You’re all set"));
    await action("next-boot").click(); assert.match(await text("#winH1"), /Welcome back/);
    await page.locator("#scene").selectOption("setup"); await action("setup").click(); await action("next-setup").click();
    await until(() => document.querySelector('[data-action="next-setup"]')?.textContent === "Start using Sandy");
    await action("next-setup").click(); await closed(); assert.equal(await action("setup").count(), 0);
    await page.locator('#maxBtn').click(); assert.equal(await page.locator('#win').evaluate(e => e.classList.contains("maximized")), true);
    await page.locator('#maxBtn').click(); await page.locator('[data-window="minimize"]').click();
    assert.match(await text("#restTitle"), /minimized/); await page.locator('[data-restore]').click();
    await page.locator('#closeBtn').click(); assert.match(await text("#restTitle"), /closed/); await page.locator('[data-restore]').click();
  });
  await check("Reset cancels pending writes; empty, loading, and error scenes", async () => {
    await reset(); await rowAction("docs-writer").click(); await reset();
    await page.waitForTimeout(1000); assert.match(await text('#rows .row[data-name="docs-writer"] .state'), /Stopped/);
    await page.locator("#scene").selectOption("empty"); assert.match(await text("#rows"), /Room for your next project/);
    await page.locator("#scene").selectOption("loading"); await until(() => document.querySelectorAll("#rows .row").length === 4);
    await page.locator("#scene").selectOption("error"); assert.match(await text("#listError"), /Docker Desktop is not a prerequisite/);
    assert.equal(await page.locator("#rows .row").count(), 4);
  });
  await check("Background lifecycle completion does not corrupt another page", async () => {
    await reset(); await action("restart").click(); await nav("templates");
    await page.waitForTimeout(1350);
    assert.equal(await text("#winH1"), "Templates");
    assert.equal(await text("#winSub"), "Saved environments. New sandbox, same starting point.");
  });
  await check("Responsive layouts from 360px to desktop", async () => {
    for (const width of [1440, 1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 }); await reset();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
      await nav("settings"); await page.locator('[data-pane-open="providers"]').click();
      assert.equal(await page.locator("#main").evaluate(e => e.scrollWidth > e.clientWidth), false, `Settings overflow at ${width}px`);
      await page.keyboard.press("Escape"); await nav("templates");
      await action("edit-template").first().click(); await page.locator('[data-step="3"]').click();
      assert.equal(await page.locator("#dialog").evaluate(e => e.scrollWidth > e.clientWidth), false, `Dialog overflow at ${width}px`);
      await page.keyboard.press("Escape"); await closed();
    }
  });
  await check("Reduced motion and keyboard paths do not animate", async () => {
    await reset(); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#pageAction").click(); assert.equal(await page.locator("#dialog").evaluate(e => e.getAnimations().length), 0);
    await page.keyboard.press("Escape"); await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.locator("#pageAction").focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#dialog").evaluate(e => e.getAnimations().length), 0);
    await page.keyboard.press("Escape");
  });
  assert.deepEqual(errors, [], "Browser exceptions");
  assert.deepEqual(unexpectedRequests, [], "Unexpected runtime network requests");
  console.log(`\n${checks.length} groups passed. No browser errors or non-font network requests.`);
} finally {
  await browser.close();
}
