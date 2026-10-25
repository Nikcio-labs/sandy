import type { SetupStatus } from "../../lib/sandbox";
import { login, enableImagePaste, setupSsh, openInstallerTerminal } from "../../lib/sandbox";
import type { IconName } from "../../common/components/Icon";

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
  command?: string;
  action: string;
  icon: IconName;
  isDone: (status: SetupStatus | null) => boolean;
  run: () => Promise<string | void>;
  /**
   * Optional host-access extras the user can defer. Only required steps
   * gate "ready" routing and the dashboard's setup banner.
   */
  optional?: boolean;
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
      "Come back here when it finishes.",
    ],
    action: "Install sbx",
    icon: "terminal",
    isDone: (status) => !!status?.sbx_installed,
    // The install runs in a visible terminal: sudo and winget prompts need a
    // real console the user can answer, so Sandy cannot capture it.
    run: openInstallerTerminal,
  },
  {
    id: "login",
    label: "Sign in",
    title: "Sign in to Docker",
    description: "Your browser opens to connect your Docker account, and Sandy picks up the result.",
    command: "sbx login",
    action: "Sign in",
    icon: "user",
    isDone: (status) => !!status?.signed_in,
    run: login,
  },
  {
    id: "imagepaste",
    label: "Image paste",
    title: "Enable image pasting",
    description: "Paste screenshots from your clipboard straight into agent chats.",
    command: "sbx settings set clipboard.imagePaste true",
    action: "Enable pasting",
    icon: "clipboard",
    isDone: (status) => !!status?.image_paste_on,
    run: enableImagePaste,
    optional: true,
  },
  {
    id: "ssh",
    label: "SSH",
    title: "Set up SSH access",
    description: "Reach sandboxes from your editor or terminal at <name>.sbx.",
    command: "sbx setup ssh",
    action: "Set up SSH",
    icon: "key",
    isDone: (status) => !!status?.ssh_set_up,
    run: setupSsh,
    optional: true,
  },
];

/** Required steps decide first-open routing; optional ones never block. */
export const REQUIRED_STEPS = SETUP_STEPS.filter((step) => !step.optional);

export function isSetupComplete(status: SetupStatus | null) {
  return REQUIRED_STEPS.every((step) => step.isDone(status));
}
