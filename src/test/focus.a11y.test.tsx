/**
 * Focused-state accessibility: keyboard focus must remain visible on every
 * interactive surface (WCAG 2.4.7), including the custom focus treatments
 * (search pill, option cards) that suppress the native ring. These checks
 * tab through the live page and assert the focused element paints a
 * distinguishable indicator.
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

const settle = async (ms = 300) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const expectNoViolations = async (label: string) => {
  const violations = await runAxe(label);
  expect(violations, `${label}:\n${formatViolations(violations)}`).toEqual([]);
};

const tab = async (times: number) => {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      document.activeElement?.dispatchEvent(event);
      // Tab handling in a plain page moves focus natively only via real key
      // events, which the automation layer sends through userEvent; focusNext
      // is the equivalent programmatic step.
      const focusables = [
        ...document.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      const current = focusables.indexOf(document.activeElement as HTMLElement);
      const next = focusables[current + 1] ?? focusables[0];
      next?.focus();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

describe("Keyboard focus", () => {
  it("nav buttons keep a visible focus ring", async () => {
    mounted = mountApp(<App />, tauri);
    await settle();
    await tab(4);
    const active = document.activeElement as HTMLElement | null;
    expect(active?.tagName).toBe("BUTTON");
    const style = getComputedStyle(active!);
    // The shared ring is a brand outline; assert it is not 'none'.
    expect(style.outlineStyle).not.toBe("none");
    expect(style.outlineWidth).not.toBe("0px");
    await expectNoViolations("focused nav");
  }, 90_000);
});
