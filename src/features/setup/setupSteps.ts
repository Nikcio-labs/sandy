import type { SetupStatus } from "../../lib/sandbox";
import { login, enableImagePaste, openInstallerTerminal } from "../../lib/sandbox";

export interface SetupStep {
  id: string;
  /** Circle label in the step dots; also the screen-reader name. */
  label: string;
  title: string;
  description: string;
  /**
   * Short what-to-do lines shown while the step runs outside Sandy (the
   * terminal install). Kept to three short lines so the window never
   * scrolls.
   */
  guide?: string[];
  action: string;
  isDone: (status: SetupStatus | null) => boolean;
  run: () => Promise<string | void>;
  /**
   * Optional host-access extras the user can defer. Only required steps
   * gate "ready" routing and the dashboard's setup banner.
   */
  optional?: boolean;
  /**
   * The step's command is an `sbx` call, which only works once the user has
   * signed in; the wizard blocks running it before the sign-in step.
   */
  requiresLogin?: boolean;
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: "install",
    label: "Install sbx",
    title: "Install the sbx CLI",
    description: "Sandy uses the Docker Sandboxes CLI to run sandboxes on your computer.",
    guide: [
      "The installer opens in a terminal.",
      "Enter your password if it is requested.",
      "When it prints “Install finished.”, click Check install.",
    ],
    action: "Install sbx",
    isDone: (status) => !!status?.sbx_installed,
    // The install runs in a visible terminal: sudo and winget prompts need a
    // real console the user can answer, so Sandy cannot capture it. SSH
    // setup is part of the install script, so there is no separate step.
    run: openInstallerTerminal,
  },
  {
    id: "login",
    label: "Sign in",
    title: "Sign in to Docker",
    description:
      "Your browser opens to connect your Docker account. Sandy picks up the result and sets up SSH access for you.",
    action: "Sign in",
    isDone: (status) => !!status?.signed_in,
    run: login,
  },
  {
    id: "imagepaste",
    label: "Image paste",
    title: "Enable image pasting",
    description: "Paste screenshots from your clipboard straight into agent chats.",
    action: "Enable pasting",
    isDone: (status) => !!status?.image_paste_on,
    run: enableImagePaste,
    optional: true,
    requiresLogin: true,
  },
];

/** Required steps decide first-open routing; optional ones never block. */
export const REQUIRED_STEPS = SETUP_STEPS.filter((step) => !step.optional);

export function isSetupComplete(status: SetupStatus | null) {
  return REQUIRED_STEPS.every((step) => step.isDone(status));
}
