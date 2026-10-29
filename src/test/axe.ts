/**
 * Axe-core runner shared by every accessibility test: scan the whole
 * document and format violations so a failure reads as a fix list rather
 * than a JSON dump.
 *
 * Vite pre-bundles axe-core into a browser-ready ESM module, so `axe.run`
 * executes in the page under test with real layout and computed styles.
 *
 * The rule set is WCAG 2.1 AA (axe's `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`
 * tags) minus rules a Chromium webview cannot judge meaningfully here:
 * `region` (landmark coverage over every page's own choice of structure) and
 * `iframe-*` (no iframes in a Tauri window). `color-contrast` stays on —
 * real rendering in a real browser is the point.
 */

import axe from "axe-core";
import type { AxeResults, Result } from "axe-core";

export type AxeViolation = {
  rule: string;
  impact: Result["impact"];
  help: string;
  nodes: { target: string[]; summary: string }[];
};

const configuredRules = [
  { id: "region", enabled: false },
  { id: "frame-title", enabled: false },
  { id: "frame-tested", enabled: false },
  { id: "unique-frames", enabled: false },
];

let configured = false;

const configure = () => {
  if (configured) return;
  axe.configure({ rules: configuredRules });
  configured = true;
};

/** Scan the current document and return the violations, sorted by impact. */
export const runAxe = async (label = "page"): Promise<AxeViolation[]> => {
  configure();
  axe.reset();
  const impactOrder = ["critical", "serious", "moderate", "minor"];
  const results: AxeResults = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    resultTypes: ["violations"],
  });
  if (results.violations.length) {
    console.log(`${label} — ${results.violations.length} violation rule(s)`);
  }
  return results.violations
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target as string[],
        summary:
          node.failureSummary ??
          node.any.map((check) => check.message).join("; ") ??
          violation.help,
      })),
    }))
    .sort(
      (left, right) =>
        impactOrder.indexOf(left.impact ?? "minor") - impactOrder.indexOf(right.impact ?? "minor"),
    );
};

export const formatViolations = (violations: AxeViolation[]): string =>
  violations
    .map(
      (violation) =>
        `[${violation.impact}] ${violation.rule}: ${violation.help}\n` +
        violation.nodes.map((node) => `  ${node.target.join(" ")}\n    ${node.summary}`).join("\n"),
    )
    .join("\n\n");
