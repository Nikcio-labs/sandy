/**
 * Waiting helpers shared by the accessibility suites. `waitFor` polls until
 * a condition holds instead of sleeping a fixed time: the scanned surface
 * must actually be present before axe runs, whatever the machine's speed.
 */

import { expect } from "vite-plus/test";
import { act } from "react";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run `condition` inside act until it passes or the budget runs out. */
export const waitFor = async (condition: () => boolean, budgetMs = 5_000) => {
  const deadline = Date.now() + budgetMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      expect(condition, "condition never became true within the wait budget").toBe(true);
    }
    await act(async () => {
      await tick(50);
    });
  }
};

/** Let the app's async work (checks, list fetches) settle inside act. */
export const settle = async (ms = 250) => {
  await act(async () => {
    await tick(ms);
  });
};

/**
 * Dialogs and panes fade in over 180ms; axe sampling mid-fade blends text
 * with the backdrop and reports color-contrast failures the settled UI never
 * shows. Yield one tick first so a starting-style transition has registered,
 * then wait until no opacity transition is still running.
 */
export const waitForEntrance = async (budgetMs = 5_000) => {
  const fading = () =>
    document
      .getAnimations()
      .some(
        (animation) =>
          animation instanceof CSSTransition &&
          animation.transitionProperty === "opacity" &&
          animation.playState === "running",
      );
  await settle(50);
  await waitFor(() => !fading(), budgetMs);
};
