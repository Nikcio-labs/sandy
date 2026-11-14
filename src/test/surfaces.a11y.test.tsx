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
import { waitFor, settle } from "./wait";
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

const accessibleName = (candidate: Element) =>
  candidate.getAttribute("aria-label") ?? candidate.textContent ?? "";

const clickButton = async (label: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    accessibleName(candidate).includes(label),
  );
  expect(button, `no button labelled ${label}`).toBeDefined();
  await act(async () => {
    button!.click();
    await settle();
  });
};

/** Open the create wizard and run discovery so the agent options render. */
const openAgentStep = async () => {
  mounted?.unmount();
  mounted = mountApp(<App />, tauri);
  await waitFor(() => document.querySelector(".rail button") !== null);
  await clickButton("Create sandbox");
  await waitFor(() => document.querySelector("dialog[open]") !== null);
  await clickButton("Discover kits");
  await waitFor(() => document.querySelector('.option input[type="radio"]') !== null);
};

describe("Create wizard steps", () => {
  it("agent step has no violations", async () => {
    await openAgentStep();
    await expectNoViolations("create wizard agent step");
  }, 90_000);

  it("mixin step has no violations", async () => {
    await openAgentStep();
    const agent = document.querySelector<HTMLInputElement>('.option input[type="radio"]');
    expect(agent, "no agent options rendered").toBeDefined();
    await act(async () => {
      agent!.click();
      await settle();
    });
    await clickButton("Choose mixins");
    await waitFor(() => document.querySelector('.option input[type="checkbox"]') !== null);
    await expectNoViolations("create wizard mixin step");
  }, 90_000);

  it("review step has no violations", async () => {
    await openAgentStep();
    const agent = document.querySelector<HTMLInputElement>('.option input[type="radio"]');
    await act(async () => {
      agent!.click();
      await settle();
    });
    await clickButton("Choose mixins");
    await clickButton("Project details");
    await waitFor(() => document.querySelector(".catalog-review") !== null);
    await expectNoViolations("create wizard review step");
  }, 90_000);
});

describe("Settings panes", () => {
  it("kit providers pane has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await waitFor(() => document.querySelector(".rail button") !== null);
    await clickButton("Settings");
    await waitFor(() => document.querySelector(".settingslinks") !== null);
    await clickButton("Kit providers");
    await waitFor(() => document.querySelector(".pane") !== null);
    await expectNoViolations("settings providers");
  }, 90_000);

  it("sandbox settings pane has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await waitFor(() => document.querySelector(".rail button") !== null);
    await clickButton("Settings");
    await waitFor(() => document.querySelector(".settingslinks") !== null);
    await clickButton("Sandbox settings");
    await waitFor(() => document.querySelector(".pane") !== null);
    await expectNoViolations("settings sandbox");
  }, 90_000);

  it("advanced pane has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await waitFor(() => document.querySelector(".rail button") !== null);
    await clickButton("Settings");
    await waitFor(() => document.querySelector(".settingslinks") !== null);
    await clickButton("Advanced");
    await waitFor(() => document.querySelector(".pane") !== null);
    await expectNoViolations("settings advanced");
  }, 90_000);

  it("update changelog dialog has no violations", async () => {
    mounted?.unmount();
    // An announced update carries its release notes as the manifest body,
    // which the offer renders as markdown behind the "See changes" button.
    tauri.handle("plugin:updater|check", () => ({
      rid: 1,
      currentVersion: "0.1.0",
      version: "9.9.9",
      body: "## Highlights\n\n- Faster startup\n\nSee the [release notes](https://example.com).",
    }));
    mounted = mountApp(<App />, tauri);
    try {
      await waitFor(() => document.querySelector(".rail button") !== null);
      await clickButton("Settings");
      // The card auto-checks once per app session: in a fresh page the offer
      // appears on its own, in a warm one (earlier tests already checked) the
      // manual check button drives the same flow.
      await waitFor(
        () =>
          document.querySelector(".update-offer") !== null ||
          [...document.querySelectorAll("button")].some((button) =>
            button.textContent?.includes("Check for updates"),
          ),
      );
      const manualCheck = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Check for updates"),
      );
      if (manualCheck) {
        await act(async () => {
          manualCheck.click();
          await settle();
        });
      }
      await clickButton("See changes");
      await waitFor(() => document.querySelector(".changelog-body h2") !== null);
      await expectNoViolations("update changelog dialog");
    } finally {
      tauri.handle("plugin:updater|check", () => null);
    }
  }, 90_000);
});
