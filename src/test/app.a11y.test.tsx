/**
 * App-level accessibility scans: the full shell with real pages mounted and
 * every Tauri command answered by fixtures, so axe judges what a user runs —
 * the dashboard, templates, settings, and the modal dialogs layered over
 * them — against WCAG 2.1 AA.
 *
 * Zero violations is the bar. A failure lists every node per rule, sorted by
 * impact, so the output reads as a fix list.
 */

import { expect, describe, it, beforeAll, afterAll } from "vite-plus/test";
import App from "../App";
import { installTauri, mountApp, desktopViewport, type Mounted } from "./mount";
import { runAxe, formatViolations } from "./axe";
import { settle } from "./wait";
import type { TauriMock } from "./tauri-mock";

let tauri: TauriMock;
let mounted: Mounted | null = null;

beforeAll(() => {
  tauri = installTauri();
  void desktopViewport();
});

afterAll(() => {
  mounted?.unmount();
});

const expectNoViolations = async (label: string) => {
  const violations = await runAxe(label);
  expect(violations, `${label}:\n${formatViolations(violations)}`).toEqual([]);
};

describe("App (shell + dashboard)", () => {
  it("dashboard has no WCAG 2.1 AA violations", async () => {
    mounted = mountApp(<App />, tauri);
    await settle(300);
    await expectNoViolations("dashboard");
  }, 90_000);

  it("dashboard with an error banner has no violations", async () => {
    mounted?.unmount();
    tauri.handle("sandboxes", () => {
      throw new Error("the sandbox daemon is not reachable");
    });
    mounted = mountApp(<App />, tauri);
    await settle(300);
    await expectNoViolations("dashboard error");
  }, 90_000);
});
