/**
 * Browser preview mock of the Tauri IPC (`window.__TAURI_INTERNALS__`).
 *
 * Loaded by src/preview.ts before the app when the page is served with
 * ?preview=1. Fixtures are in-memory only; this file is a development
 * harness and is never imported by the production bundle.
 */
type InvokeArgs = Record<string, unknown>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FixtureSandbox {
  name: string;
  state: string;
  agent: string;
  workspace: string;
}

const sandboxes: FixtureSandbox[] = [
  { name: "next-portfolio", state: "Running", agent: "claude", workspace: "/Users/alex/Projects/portfolio" },
  { name: "python-lab", state: "Running", agent: "codex", workspace: "" },
  { name: "docs-writer", state: "Stopped", agent: "claude", workspace: "/Users/alex/Projects/handbook" },
  { name: "api-experiments", state: "Created", agent: "gemini", workspace: "" },
];

const providers = [
  {
    id: "p-sandboxing",
    label: "Docker sandboxing",
    kind: "github",
    repository: "nikcio/docker-sandboxing",
    reference: "",
    enabled: true,
  },
  {
    id: "p-community",
    label: "Docker community",
    kind: "github",
    repository: "docker/sbx-kits-contrib",
    reference: "v3",
    enabled: true,
  },
];

const kit = (overrides: Record<string, unknown>) => ({
  id: "kit-x",
  name: "claude",
  description: "Claude Code agent kit",
  source: "git+https://github.com/nikcio/docker-sandboxing.git#ref=main&dir=agents/claude",
  schema_version: 2,
  kind: "agent",
  provider_id: "p-sandboxing",
  required_agent: null,
  arguments: [],
  ...overrides,
});

const catalog = {
  kits: [
    kit({ id: "k-claude", name: "claude", kind: "agent" }),
    kit({ id: "k-codex", name: "codex", kind: "agent", description: "Codex agent kit" }),
    kit({
      id: "k-shell",
      name: "shell",
      kind: "workload",
      schema_version: 3,
      description: "An interactive shell, without an AI agent.",
    }),
    kit({
      id: "k-node",
      name: "node",
      kind: "mixin",
      description: "Node.js tooling for v2 agents.",
      arguments: [
        { name: "nodeVersion", description: "Node.js version", required: false, default: "22", choices: [] },
      ],
    }),
    kit({
      id: "k-playwright",
      name: "playwright",
      kind: "mixin",
      schema_version: 3,
      description: "Browser-testing tools for a v3 workload.",
    }),
  ],
  warnings: [],
};

let templateCounter = 0;
const templates: Array<Record<string, unknown>> = [];

const settingRecord = (overrides: Record<string, unknown>) => ({
  key: "browser.enabled",
  type: "bool",
  description: "Allow sandboxed processes to open URLs in the host browser.",
  default: true,
  value: true,
  source: "default",
  ...overrides,
});

const settingsFixture: Array<Record<string, unknown>> = [
  settingRecord({ key: "browser.enabled" }),
  settingRecord({
    key: "clipboard.imagePaste",
    description: "Allow sandboxed agents to read the host clipboard for image paste (Ctrl+V).",
    error: "administrator settings are unavailable",
    source: "unavailable",
    default: undefined,
    value: undefined,
  }),
  settingRecord({
    key: "daemon.log.maxBackups",
    type: "int",
    description: "Number of rotated daemon logs to keep. 0 keeps all.",
    default: 3,
    value: 3,
    requires_restart: true,
  }),
  settingRecord({
    key: "diagnostics.autoUpload",
    type: "string",
    description: "Consent to automatic diagnostic uploads; empty means no decision.",
    default: "",
    value: "",
  }),
  settingRecord({
    key: "kit.allowedSources",
    type: "json",
    description: "JSON array of allowed kit source prefixes.",
    default: ["docker.io/"],
    value: ["docker.io/"],
  }),
  settingRecord({
    key: "proxy",
    type: "string",
    description: "Shared upstream proxy. Empty uses environment/OS fallbacks.",
    default: "",
    value: "",
    requires_restart: true,
  }),
  settingRecord({
    key: "skills.defaultMode",
    type: "string",
    description: "Shared agent skills access for future sandboxes. Experimental.",
    default: "readonly",
    value: "readonly",
    options: ["readonly", "readwrite", "off"],
  }),
];

let settingsState = structuredClone(settingsFixture);

const setupStatus = {
  sbx_installed: true,
  signed_in: true,
  image_paste_on: false,
  ssh_set_up: false,
  auth_explanation: { message: "Signed in to Docker." },
  ssh_explanation: { message: "SSH is not configured for sandboxes." },
  warnings: [],
  issues: [],
};

const logLines: string[] = [];

const commands: Record<string, (args: InvokeArgs) => Promise<unknown>> = {
  check_setup: async () => structuredClone(setupStatus),
  install_sbx: async () => "installed",
  login: async () => "signed in",
  enable_image_paste: async () => undefined,
  setup_ssh: async () => "ssh configured",
  sandboxes: async () => {
    await wait(120);
    return structuredClone(sandboxes);
  },
  start_sandbox: async (args) => {
    const item = sandboxes.find((s) => s.name === args.name);
    if (item) item.state = "Running";
    await wait(200);
    return `Started ${args.name}`;
  },
  stop_sandbox: async (args) => {
    const item = sandboxes.find((s) => s.name === args.name);
    if (item) item.state = "Stopped";
    await wait(200);
    return `Stopped ${args.name}`;
  },
  restart_sandbox: async (args) => {
    const item = sandboxes.find((s) => s.name === args.name);
    if (item) item.state = "Running";
    await wait(300);
    return `Restarted ${args.name}`;
  },
  open_terminal: async () => undefined,
  connection_info: async (args) => ({
    host: `${args.name}.sbx`,
    user: "_default_user_",
    command: `ssh ${args.name}.sbx`,
  }),
  get_providers: async () => structuredClone(providers),
  save_providers: async (args) => args.providers,
  provider_versions: async () => ["main", "v3", "v1.0.0"],
  discover_kits: async () => {
    await wait(150);
    return structuredClone(catalog);
  },
  save_template: async (args) => {
    const request = args.request as Record<string, unknown>;
    templateCounter += 1;
    const record = {
      id: `tpl-${templateCounter}`,
      name: request.name,
      path: `/Users/alex/Library/Application Support/Sandy/templates/${request.name}.yaml`,
      agent: (request.agent as Record<string, unknown>).name,
      workspace: request.workspace,
      kit_version: (request.agent as Record<string, unknown>).schema_version,
      content: `name: ${request.name}\nagent: ${(request.agent as Record<string, unknown>).name}\n`,
    };
    templates.push(record);
    return structuredClone(record);
  },
  list_templates: async () => structuredClone(templates),
  template_warnings: async () => [],
  read_template_details: async (args) => {
    const record = templates.find((t) => t.id === args.id);
    if (!record) throw new Error("template not found");
    return {
      template: record,
      agent: kit({ id: "k-claude", name: record.agent }),
      mixins: [],
      arguments: {},
    };
  },
  update_template: async (args) => {
    const record = templates.find((t) => t.id === args.id);
    if (!record) throw new Error("template not found");
    const request = args.request as Record<string, unknown>;
    Object.assign(record, {
      name: request.name,
      workspace: request.workspace,
    });
    return structuredClone(record);
  },
  delete_template: async (args) => {
    const index = templates.findIndex((t) => t.id === args.id);
    if (index >= 0) templates.splice(index, 1);
  },
  launch_template: async (args) => {
    await wait(250);
    const record = templates.find((t) => t.id === args.id);
    const name = (args.name as string) || (record?.name as string);
    if (!sandboxes.some((s) => s.name === name)) {
      sandboxes.push({ name, state: "Running", agent: (record?.agent as string) ?? "claude", workspace: (args.workspace as string) ?? "" });
    } else {
      const item = sandboxes.find((s) => s.name === name);
      if (item) item.state = "Running";
    }
    return `Launched ${name}`;
  },
  allow_source: async () => "allowed",
  pick_workspace: async () => "/Users/alex/Projects/picked-workspace",
  pick_template_path: async () => "/Users/alex/Sandbox templates/picked.yaml",
  list_settings: async () => structuredClone(settingsState),
  set_setting: async (args) => {
    const record = settingsState.find((s) => s.key === args.key);
    if (!record) throw new Error(`unknown setting ${args.key}`);
    record.value = JSON.parse(args.valueJson as string);
    record.source = JSON.stringify(record.value) === JSON.stringify(record.default) ? "default" : "override";
    await wait(120);
    return "set";
  },
  unset_setting: async (args) => {
    const record = settingsState.find((s) => s.key === args.key);
    if (!record) throw new Error(`unknown setting ${args.key}`);
    record.value = structuredClone(record.default);
    record.source = "default";
    await wait(120);
    return "unset";
  },
  read_debug_log: async () => logLines.join("\n"),
  clear_debug_log: async () => {
    logLines.length = 0;
  },
  debug_log_dir: async () => "/Users/alex/Library/Logs/Sandy",
  // Desktop-shell plugin commands the app calls incidentally; no-ops here.
  "plugin:window|show": async () => undefined,
  "plugin:window|close": async () => undefined,
  "plugin:window|minimize": async () => undefined,
  "plugin:window|maximize": async () => undefined,
  "plugin:window|unmaximize": async () => undefined,
  "plugin:window|toggle_maximize": async () => undefined,
  "plugin:window|set_size": async () => undefined,
  "plugin:window|inner_size": async () => ({ width: 1280, height: 800 }),
  "plugin:window|get_all_windows": async () => [],
  "plugin:app|version": async () => "0.3.3",
  "plugin:process|restart": async () => undefined,
  "plugin:process|exit": async () => undefined,
  "plugin:opener|open_path": async () => undefined,
  "plugin:opener|open_url": async () => undefined,
  "plugin:opener|reveal_item_in_dir": async () => undefined,
  "plugin:updater|check": async () => {
    throw new Error("Update check unavailable in preview");
  },
  "plugin:updater|download_and_install": async () => undefined,
};

export function installPreviewMock() {
  // Callback registry for Channel/onmessage-style IPC from the mock.
  const callbacks = new Map();
  let callbackId = 0;
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    plugins: {},
    transformCallback: (callback: unknown) => {
      callbackId += 1;
      callbacks.set(callbackId, callback);
      return callbackId;
    },
    unregisterCallback: (id: number) => {
      callbacks.delete(id);
    },
    invoke: (cmd: string, args: InvokeArgs = {}) => {
      const handler = commands[cmd];
      if (!handler) {
        return Promise.reject(new Error(`preview mock: unknown command ${cmd}`));
      }
      logLines.push(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          kind: "cli",
          summary: cmd,
          detail: JSON.stringify(args),
          outcome: "ok",
        }),
      );
      return handler(args);
    },
  };
  (window as unknown as Record<string, unknown>).__TAURI_OS_PLUGIN_INTERNALS__ = {};
  // The updater and process plugins are informational in preview.
  (window as unknown as Record<string, unknown>).__TAURI_PLUGIN_UPDATER__ = {};
}
