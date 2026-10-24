import { invoke } from "@tauri-apps/api/core";
import type { KitArguments, KitCredential, KitOption } from "./catalog";
import { launchTemplate as launchTemplateSandbox } from "./sandbox";
import type { LaunchProgress } from "./sandbox";

export type { KitCredential };

export interface SaveTemplateRequest {
  name: string;
  /** Empty for a mountless sandbox, isolated from the host file system. */
  workspace: string;
  agent: KitOption;
  mixins: KitOption[];
  arguments: KitArguments;
  save_path?: string;
}

export interface SavedTemplate {
  id: string;
  name: string;
  path: string;
  agent: string;
  /** Empty for mountless templates: the sandbox has no host workspace. */
  workspace: string;
  kit_version: number;
  content: string;
  /** Credential services the selected kits ask the proxy to authenticate. */
  credentials: KitCredential[];
}

/** A secret value collected during launch and stored with `sbx secret set`. */
export interface LaunchSecret {
  service: string;
  value: string;
  sandbox_scoped: boolean;
}

export interface LaunchTemplateRequest {
  id: string;
  name?: string;
  workspace?: string;
  secrets?: LaunchSecret[];
}

export interface UpdateTemplateRequest {
  name: string;
  /** Empty for a mountless sandbox, isolated from the host file system. */
  workspace: string;
  agent: KitOption;
  mixins: KitOption[];
  arguments: KitArguments;
}

/** A template plus the kit metadata and arguments recorded at save time. */
export interface TemplateDetails {
  template: SavedTemplate;
  agent: KitOption;
  mixins: KitOption[];
  arguments: KitArguments;
}

export const saveTemplate = (request: SaveTemplateRequest) =>
  invoke<SavedTemplate>("save_template", { request });
export const listTemplates = () => invoke<SavedTemplate[]>("list_templates");
export const templateWarnings = () => invoke<string[]>("template_warnings");
export const readTemplateDetails = (id: string) =>
  invoke<TemplateDetails>("read_template_details", { id });
export const updateTemplate = (id: string, request: UpdateTemplateRequest) =>
  invoke<SavedTemplate>("update_template", { id, request });
export const deleteTemplate = (id: string) => invoke<void>("delete_template", { id });
export const launchTemplate = (
  request: LaunchTemplateRequest,
  onProgress?: (progress: LaunchProgress) => void,
) => launchTemplateSandbox(request, onProgress ?? (() => {}));
