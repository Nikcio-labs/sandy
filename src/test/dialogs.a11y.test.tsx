/**
 * Accessibility scans for the templates page and the modal dialogs: the
 * list, the detail pane, and the dialogs opened from the pane's header
 * actions. Each test navigates the real app and scans against WCAG 2.1 AA.
 */

import { expect, describe, it, beforeAll, afterAll } from "vite-plus/test";
import { act } from "react";
import App from "../App";
import { installTauri, mountApp, desktopViewport, type Mounted } from "./mount";
import { runAxe, formatViolations } from "./axe";
import { waitFor, settle } from "./wait";
import { sandboxes } from "./fixtures";
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

const clickButton = async (label: string) => {
  const accessibleName = (candidate: HTMLButtonElement) =>
    candidate.getAttribute("aria-label") ?? candidate.textContent ?? "";
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    accessibleName(candidate).includes(label),
  );
  expect(button, `no button labelled ${label}`).toBeDefined();
  await act(async () => {
    button!.click();
    await settle();
  });
};

/** Navigate to Templates and open a template's detail pane. */
const openTemplatesPane = async () => {
  mounted?.unmount();
  tauri.handle("sandboxes", () => []);
  mounted = mountApp(<App />, tauri);
  await waitFor(() => document.querySelector(".rail button") !== null);
  await clickButton("Templates");
  await waitFor(() => document.querySelector(".linkrow") !== null);
  await act(async () => {
    document.querySelector<HTMLButtonElement>(".linkrow")?.click();
    await settle();
  });
  await waitFor(() => document.querySelector(".pane") !== null);
};

describe("Templates page", () => {
  it("template list has no violations", async () => {
    mounted?.unmount();
    tauri.handle("sandboxes", () => []);
    mounted = mountApp(<App />, tauri);
    await waitFor(() => document.querySelector(".rail button") !== null);
    await clickButton("Templates");
    await waitFor(() => document.querySelector(".linkrow") !== null);
    await expectNoViolations("templates list");
  }, 90_000);

  it("template detail pane has no violations", async () => {
    await openTemplatesPane();
    await expectNoViolations("template detail pane");
  }, 90_000);
});

describe("Dialogs", () => {
  it("create wizard (step 1) has no violations", async () => {
    mounted?.unmount();
    tauri.handle("sandboxes", () => sandboxes);
    mounted = mountApp(<App />, tauri);
    await waitFor(() => document.querySelector(".rail button") !== null);
    await clickButton("Create sandbox");
    await waitFor(() => document.querySelector("dialog[open]") !== null);
    await expectNoViolations("create wizard step 1");
  }, 90_000);

  it("connect dialog has no violations", async () => {
    mounted?.unmount();
    tauri.handle("sandboxes", () => sandboxes);
    mounted = mountApp(<App />, tauri);
    await waitFor(() => document.querySelector(".rowselect") !== null);
    await clickButton("Open web");
    await waitFor(() => document.querySelector("dialog[open]") !== null);
    await expectNoViolations("connect dialog");
  }, 90_000);

  it("launch dialog has no violations", async () => {
    await openTemplatesPane();
    await clickButton("Launch");
    await waitFor(() => document.querySelector("dialog[open]") !== null);
    await expectNoViolations("launch dialog");
  }, 90_000);

  it("delete-template dialog has no violations", async () => {
    await openTemplatesPane();
    await clickButton("Delete");
    await waitFor(() => document.querySelector("dialog[open]") !== null);
    await expectNoViolations("delete dialog");
  }, 90_000);
});
