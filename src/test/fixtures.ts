/**
 * Fixture data shaped exactly like the backend's serialized command results
 * (`sbx` output passed through, serde struct shapes for app-owned data).
 * Keeping the shapes backend-true means rendered surfaces exercise the same
 * code paths as against the real CLI.
 */

import type { SandboxInfo, SetupStatus, ConnectionInfo } from "../lib/sandbox";
import type { Provider, Catalog, DebugLogEntry } from "../lib/catalog";
import type { SavedTemplate, TemplateDetails } from "../lib/templates";
import type { SettingRecord } from "../lib/settings";

export const setupComplete: SetupStatus = {
  sbx_installed: true,
  signed_in: true,
  image_paste_on: true,
  ssh_set_up: true,
  auth_explanation: null,
  ssh_explanation: null,
  warnings: [],
  issues: [],
};

export const providers: Provider[] = [
  {
    id: "nikcio-docker-sandboxing",
    label: "nikcio/docker-sandboxing",
    kind: "github",
    repository: "nikcio/docker-sandboxing",
    reference: "",
    enabled: true,
  },
];

const baseKit = {
  provider_id: "nikcio-docker-sandboxing",
  required_agent: null,
  arguments: [],
};

export const catalog: Catalog = {
  kits: [
    {
      ...baseKit,
      id: "kit:claude-code",
      name: "Claude Code",
      description: "Anthropic's Claude Code agent with the Docker sandbox toolchain.",
      source: "kits/claude-code",
      schema_version: 2,
      kind: "agent",
    },
    {
      ...baseKit,
      id: "kit:codex",
      name: "Codex",
      description: "OpenAI Codex CLI tuned for sandboxed repositories.",
      source: "kits/codex",
      schema_version: 2,
      kind: "agent",
    },
    {
      ...baseKit,
      id: "kit:github-mixin",
      name: "GitHub access",
      description: "Mounts GitHub credentials and configures the gh CLI.",
      source: "mixins/github-access",
      schema_version: 2,
      kind: "mixin",
    },
    {
      ...baseKit,
      id: "kit:node-mixin",
      name: "Node toolchain",
      description: "Preinstalls Node.js and pnpm for JavaScript projects.",
      source: "mixins/node-toolchain",
      schema_version: 2,
      kind: "mixin",
    },
    {
      ...baseKit,
      id: "kit:v3-workload",
      name: "Fullstack workload",
      description: "A v3 workload with a dev server and database sidecar.",
      source: "workloads/fullstack",
      schema_version: 3,
      kind: "workload",
      arguments: [
        {
          name: "PORT",
          description: "Port the dev server listens on.",
          required: true,
          default: "3000",
          choices: [],
        },
      ],
    },
  ],
  warnings: [],
};

const yamlFor = (name: string, agent: string, workspace: string) =>
  [
    'schemaVersion: "1"',
    `name: ${JSON.stringify(name)}`,
    `agent: ${JSON.stringify(agent)}`,
    ...(workspace ? [`workspace: ${JSON.stringify(workspace)}`] : []),
    "kits:",
    `  - ${agent.toLowerCase()}`,
  ].join("\n");

export const templates: SavedTemplate[] = [
  {
    id: "tpl-1",
    name: "Web app",
    path: "/home/user/.local/share/sandy/templates/web-app.yaml",
    agent: "claude-code",
    workspace: "/home/user/projects/web",
    kit_version: 2,
    content: yamlFor("Web app", "claude-code", "/home/user/projects/web"),
    registered: false,
  },
  {
    id: "tpl-2",
    name: "Scratch",
    path: "/home/user/.local/share/sandy/templates/scratch.yaml",
    agent: "shell",
    workspace: "",
    kit_version: 2,
    content: yamlFor("Scratch", "shell", ""),
    registered: false,
  },
];

export const templateDetails = (template: SavedTemplate): TemplateDetails => ({
  template,
  agent: catalog.kits[0],
  mixins: [],
  arguments: {},
});

export const sandboxes: SandboxInfo[] = [
  {
    name: "web",
    state: "running",
    agent: "claude-code",
    workspace: "/home/user/projects/web",
  },
  {
    name: "experiments",
    state: "stopped",
    agent: "opencode",
    workspace: "",
  },
];

export const connectionInfo = (name: string): ConnectionInfo => ({
  host: `${name}.sbx`,
  user: "_default_user_",
  command: `ssh ${name}.sbx`,
});

export const settings: SettingRecord[] = [
  {
    key: "clipboard.imagePaste",
    type: "bool",
    description: "Allow pasting images from the clipboard into agent chats.",
    default: false,
    value: true,
    source: "override",
  },
  {
    key: "sandbox.cpuCount",
    type: "int",
    description: "CPU cores assigned to each sandbox microVM.",
    default: 4,
    source: "default",
  },
  {
    key: "agent.default",
    type: "string",
    description: "Agent selected when a template names none.",
    default: "claude-code",
    value: "claude-code",
    source: "default",
  },
  {
    key: "daemon.endpoint",
    type: "string",
    description: "Daemon socket the CLI talks to.",
    default: "",
    source: "managed",
    error: "Managed by your organization",
  },
];

export const debugLog: string = (
  [
    {
      timestamp: "2026-10-28T09:12:40.120Z",
      kind: "cli",
      summary: "sbx ls --json",
      outcome: "ok",
    },
    {
      timestamp: "2026-10-28T09:12:44.880Z",
      kind: "http",
      summary: "GET /repos/nikcio/docker-sandboxing/tags",
      outcome: "ok",
    },
    {
      timestamp: "2026-10-28T09:13:01.004Z",
      kind: "command",
      summary: "start_sandbox",
      detail: "sbx run --detach --name web failed (exit 1):\nport already in use",
      outcome: "error",
    },
  ] satisfies DebugLogEntry[]
)
  .map((entry) => JSON.stringify(entry))
  .join("\n");

export const defaultHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  check_setup: () => setupComplete,
  sandboxes: () => sandboxes,
  start_sandbox: () => "Started",
  stop_sandbox: () => "Stopped",
  restart_sandbox: () => "Restarted",
  open_terminal: () => {},
  connection_info: (args) => connectionInfo(args.name as string),
  list_templates: () => templates,
  template_warnings: () => [],
  read_template_details: () => templateDetails(templates[0]),
  get_providers: () => providers,
  save_providers: (args) => args.providers,
  provider_versions: () => ["v1.2.0", "v1.1.0", "v1.0.0"],
  discover_kits: () => catalog,
  list_settings: () => settings,
  read_debug_log: () => debugLog,
  clear_debug_log: () => {},
  debug_log_dir: () => "/home/user/.local/share/sandy/logs",
};
