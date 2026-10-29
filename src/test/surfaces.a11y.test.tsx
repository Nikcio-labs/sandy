/**
 * Accessibility scans for the create wizard's later steps (agent choice,
 * mixins, review) and the settings panes — surfaces with option cards,
 * switch controls, and dense forms that the step-1 dialog scan cannot reach.
 */

import { expect, describe, it, beforeAll, afterAll } from "vite-plus/test";
import { act } from "react";
import App from "../App";
import { installTauri, mountApp, desktopViewport, type Mounted } from "./mount";
import { runAxe, formatViolations } from "./axe";
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

const settle = async (ms = 250) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const expectNoViolations = async (label: string) => {
  const violations = await runAxe(label);
  expect(violations, `${label}:\n${formatViolations(violations)}`).toEqual([]);
};

const accessibleName = (candidate: Element) =>
  candidate.getAttribute("aria-label") ?? candidate.textContent ?? "";

const clickButton = async (label: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    accessibleName(candidate).includes(label),
  );
  expect(button, `no button labelled ${label}`).toBeDefined();
  await act(async () => {
    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
};

const openCreateWizard = async () => {
  mounted?.unmount();
  mounted = mountApp(<App />, tauri);
  await settle();
  await clickButton("Create sandbox");
  await settle();
};

describe("Create wizard steps", () => {
  it("agent step has no violations", async () => {
    await openCreateWizard();
    await clickButton("Discover kits");
    await settle();
    await expectNoViolations("create wizard agent step");
  }, 90_000);

  it("mixin step has no violations", async () => {
    await openCreateWizard();
    await clickButton("Discover kits");
    await settle();
    // Pick the first agent option card.
    const agent = document.querySelector<HTMLInputElement>('.option input[type="radio"]');
    expect(agent, "no agent options rendered").toBeDefined();
    await act(async () => {
      agent!.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    await clickButton("Choose mixins");
    await settle();
    await expectNoViolations("create wizard mixin step");
  }, 90_000);

  it("review step has no violations", async () => {
    await openCreateWizard();
    await clickButton("Discover kits");
    await settle();
    const agent = document.querySelector<HTMLInputElement>('.option input[type="radio"]');
    await act(async () => {
      agent!.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    await clickButton("Choose mixins");
    await settle();
    await clickButton("Project details");
    await settle();
    await expectNoViolations("create wizard review step");
  }, 90_000);
});

describe("Settings panes", () => {
  it("kit providers pane has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await settle();
    await clickButton("Settings");
    await settle();
    await clickButton("Kit providers");
    await settle();
    await expectNoViolations("settings providers");
  }, 90_000);

  it("sandbox settings pane has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await settle();
    await clickButton("Settings");
    await settle();
    await clickButton("Sandbox settings");
    await settle();
    await expectNoViolations("settings sandbox");
  }, 90_000);

  it("advanced pane has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await settle();
    await clickButton("Settings");
    await settle();
    await clickButton("Advanced");
    await settle();
    await expectNoViolations("settings advanced");
  }, 90_000);
});
