/**
 * Accessibility scans for the remaining windows and viewport variants: the
 * first-run setup window (its own React root, not the app shell), and the
 * app's narrow layout (≤720px) where the rail collapses to icons.
 */

import { expect, describe, it, beforeAll, afterAll } from "vite-plus/test";
import { act } from "react";
import { page } from "vite-plus/test/browser";
import SetupWindow from "../common/components/SetupWindow";
import App from "../App";
import { installTauri, mountApp, type Mounted } from "./mount";
import { runAxe, formatViolations } from "./axe";
import type { TauriMock } from "./tauri-mock";

let tauri: TauriMock;
let mounted: Mounted | null = null;

beforeAll(() => {
  tauri = installTauri();
});

afterAll(() => {
  mounted?.unmount();
});

const settle = async (ms = 250) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const expectNoViolations = async (label: string) => {
  const violations = await runAxe(label);
  expect(violations, `${label}:\n${formatViolations(violations)}`).toEqual([]);
};

describe("Setup window", () => {
  it("setup wizard with pending steps has no violations", async () => {
    tauri.handle("check_setup", () => ({
      sbx_installed: true,
      signed_in: false,
      image_paste_on: false,
      ssh_set_up: false,
      auth_explanation: null,
      ssh_explanation: null,
      warnings: [],
      issues: [],
    }));
    mounted = mountApp(<SetupWindow />, tauri);
    await settle();
    await expectNoViolations("setup wizard");
  }, 90_000);

  it("setup wizard terminal step has no violations", async () => {
    mounted?.unmount();
    tauri.handle("check_setup", () => ({
      sbx_installed: false,
      signed_in: false,
      image_paste_on: false,
      ssh_set_up: false,
      auth_explanation: null,
      ssh_explanation: null,
      warnings: [],
      issues: [],
    }));
    mounted = mountApp(<SetupWindow />, tauri);
    await settle();
    await expectNoViolations("setup wizard install step");
  }, 90_000);
});

describe("Narrow layout", () => {
  it("dashboard at phone width has no violations", async () => {
    mounted?.unmount();
    await page.viewport(414, 896);
    mounted = mountApp(<App />, tauri);
    await settle();
    await expectNoViolations("dashboard narrow");
    await page.viewport(1280, 800);
  }, 90_000);
});
