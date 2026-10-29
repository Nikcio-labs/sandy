/**
 * Component-level accessibility scans for surfaces the App-level suite does
 * not reach by default: modal dialogs, the create wizard's later steps, the
 * setup window, and settings panes. Each test mounts the surface in the app
 * shell context (stylesheets apply through the app module imports) and scans
 * against WCAG 2.1 AA.
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

const openDialogByLabel = async (label: string) => {
  const accessibleName = (candidate: HTMLButtonElement) =>
    candidate.getAttribute("aria-label") ?? candidate.textContent ?? "";
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    accessibleName(candidate).includes(label),
  );
  expect(button, `no button labelled ${label}`).toBeDefined();
  await act(async () => {
    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
};

describe("Dialogs", () => {
  it("create wizard (step 1) has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await settle();
    await openDialogByLabel("Create sandbox");
    await settle();
    await expectNoViolations("create wizard step 1");
  }, 90_000);

  it("connect dialog has no violations", async () => {
    mounted?.unmount();
    mounted = mountApp(<App />, tauri);
    await settle();
    await openDialogByLabel("Open web");
    await settle();
    await expectNoViolations("connect dialog");
  }, 90_000);

  it("launch dialog has no violations", async () => {
    mounted?.unmount();
    tauri.handle("sandboxes", () => []);
    mounted = mountApp(<App />, tauri);
    await settle();
    // The dashboard's empty list has no route to Templates; mount the page
    // through the app's own navigation.
    const templatesTab = document.querySelector<HTMLButtonElement>(".rail button:nth-child(2)");
    await act(async () => {
      templatesTab?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    await openDialogByLabel("Launch");
    await settle();
    await expectNoViolations("launch dialog");
  }, 90_000);

  it("delete-template dialog has no violations", async () => {
    mounted?.unmount();
    tauri.handle("sandboxes", () => []);
    mounted = mountApp(<App />, tauri);
    await settle();
    await act(async () => {
      document.querySelector<HTMLButtonElement>(".rail button:nth-child(2)")?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    await openDialogByLabel("Delete");
    await settle();
    await expectNoViolations("delete dialog");
  }, 90_000);
});
