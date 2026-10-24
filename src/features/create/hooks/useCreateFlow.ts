import { useEffect, useRef, useState } from "react";
import type { Catalog, KitArguments, KitOption, Provider } from "../../../lib/catalog";
import {
  discoverKits,
  getProviders,
  pickTemplatePath,
  pickWorkspace,
  saveProviders,
} from "../../../lib/catalog";
import {
  argumentsAreValid,
  BUILTIN_AGENTS,
  hasKitMetadata,
  isCompatibleMixin,
  resolvedArguments,
  selectedCredentials,
} from "../../../lib/kit";
import { launchTemplate, saveTemplate } from "../../../lib/templates";
import type { LaunchSecret, SavedTemplate, SaveTemplateRequest } from "../../../lib/templates";
import { readTemplateDetails, updateTemplate } from "../../../lib/templates";
import type { UpdateTemplateRequest } from "../../../lib/templates";
import { useMountedRef } from "../../../common/hooks/useMountedRef";
import { useBusyReporting } from "../../../common/hooks/useBusyReporting";

export interface CreateFlowOptions {
  onBusyChange?: (busy: boolean) => void;
  /** Present when the wizard edits an existing template instead of creating one. */
  templateId?: string;
}

/**
 * The create-wizard state machine: kit discovery, agent/mixin selection,
 * template saving, and launching. The page component only renders steps.
 */
export function useCreateFlow({ onBusyChange, templateId }: CreateFlowOptions) {
  const mounted = useMountedRef();
  const [step, setStep] = useState(0);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [agent, setAgent] = useState<KitOption | null>(null);
  const [mixins, setMixins] = useState<KitOption[]>([]);
  const [values, setValues] = useState<KitArguments>({});
  const [agentSearch, setAgentSearch] = useState("");
  const [mixinSearch, setMixinSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [mountless, setMountless] = useState(false);
  const [secrets, setSecrets] = useState<Record<string, LaunchSecret | undefined>>({});
  const [savePath, setSavePath] = useState("");
  const [busy, setBusy] = useState<
    "discover" | "save" | "launch" | "workspace" | "path" | "load" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedTemplate | null>(null);
  const [launched, setLaunched] = useState(false);
  const [launchOutput, setLaunchOutput] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const lock = useRef(false);
  // The id stays for the whole visit, so a provider reset (which drops the
  // saved kit metadata) still saves back to the same template.
  const [editingId] = useState(templateId ?? null);

  // Load the saved provider configuration up front. The Providers editor still
  // reports changes back; this only guarantees step 0 can render (with a
  // surfaced error) even if that load fails.
  useEffect(() => {
    let active = true;
    getProviders()
      .then((result) => {
        if (active) setProviders((previous) => previous ?? result);
      })
      .catch((failure) => {
        if (active) setError(String(failure));
      });
    return () => {
      active = false;
    };
  }, []);

  // Edit mode: prefill everything from the saved template, then refresh the
  // catalog in the background so the selection menus show all discovered
  // kits, not only the template's saved ones. The saved kit metadata is
  // merged into the discovery result so the current selections survive even
  // when the provider now resolves to a newer revision.
  useEffect(() => {
    if (!templateId) return;
    let active = true;
    setBusy("load");
    readTemplateDetails(templateId)
      .then(async (details) => {
        if (!active) return;
        const savedKits = [details.agent, ...details.mixins];
        // The saved kits are immediately usable as the catalog; the
        // background discovery below replaces it with the full snapshot.
        setCatalog({ kits: savedKits, warnings: [] });
        setAgent(details.agent);
        setMixins(details.mixins);
        setValues(details.arguments);
        setName(details.template.name);
        setWorkspace(details.template.workspace);
        setMountless(!details.template.workspace);
        setStep(1);
        try {
          // The edit wizard never edits providers: discovery uses the saved
          // configuration as-is, with no persistence round-trip.
          const persisted = await getProviders();
          const result = await discoverKits(persisted);
          if (!active) return;
          const { kits, warnings } = verifiedFrom(result);
          for (const kit of savedKits) {
            if (!kits.some((fresh) => fresh.source === kit.source)) kits.push(kit);
          }
          setCatalog({ kits, warnings });
        } catch (failure) {
          if (!active) return;
          // Discovery failed: the saved kits seeded above remain the catalog.
          setCatalog({
            kits: savedKits,
            warnings: [`Discovery failed: ${String(failure)}`],
          });
        }
      })
      .catch((failure) => {
        if (active) setError(String(failure));
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [templateId]);

  useBusyReporting(busy !== null, onBusyChange);

  const kits = catalog?.kits ?? [];
  const selectedKits = agent ? [agent, ...mixins] : [];
  const compatible = agent ? kits.filter((kit) => isCompatibleMixin(kit, agent)) : [];
  const matchingMixins = compatible.filter(
    (kit) =>
      (!providerFilter || kit.provider_id === providerFilter) &&
      `${kit.name} ${kit.description} ${kit.source}`
        .toLowerCase()
        .includes(mixinSearch.trim().toLowerCase()),
  );
  const mixinGroups = [...new Set(matchingMixins.map((kit) => kit.provider_id))];
  const agents = kits.filter(
    (kit) =>
      kit.kind !== "mixin" &&
      `${kit.name} ${kit.description} ${kit.source}`
        .toLowerCase()
        .includes(agentSearch.trim().toLowerCase()),
  );
  const providerLabel = (providerId: string) =>
    providers?.find((provider) => provider.id === providerId)?.label ??
    (providerId === "builtin" ? "Built-in agents" : providerId);
  const inputValid = argumentsAreValid(selectedKits, values);
  const credentials = selectedCredentials(selectedKits);
  const request: SaveTemplateRequest | null = agent
    ? {
        name: name.trim(),
        workspace: mountless ? "" : workspace.trim(),
        agent,
        mixins,
        arguments: resolvedArguments(selectedKits, values),
        ...(savePath.trim() ? { save_path: savePath.trim() } : {}),
      }
    : null;
  const updateRequest: UpdateTemplateRequest | null =
    editingId && agent
      ? {
          name: name.trim(),
          workspace: mountless ? "" : workspace.trim(),
          agent,
          mixins,
          arguments: resolvedArguments(selectedKits, values),
        }
      : null;

  const moveTo = (next: number) => {
    setError(null);
    // Later steps render from the discovery snapshot; without one, send the
    // user back to the provider step instead of showing a blank page.
    if (next > 0 && !catalog) {
      setStep(0);
      return;
    }
    setStep(next);
  };

  // Shared verification of a discovery result: drop kits without usable
  // metadata, report them, and add the documented built-ins when the CLI did
  // not report its own.
  const verifiedFrom = (result: Catalog): { kits: KitOption[]; warnings: string[] } => {
    const seen = new Set<string>();
    const verified = result.kits.filter((kit) => {
      if (!hasKitMetadata(kit) || seen.has(kit.id)) return false;
      seen.add(kit.id);
      return true;
    });
    const skipped = result.kits.length - verified.length;
    const usedBuiltinFallback = !verified.some(
      (kit) => kit.provider_id === "builtin" && kit.kind === "agent",
    );
    if (usedBuiltinFallback) {
      verified.push(...BUILTIN_AGENTS);
    }
    return {
      kits: verified,
      warnings: [
        ...result.warnings,
        ...(usedBuiltinFallback
          ? [
              "Built-in agent shortcuts are from Docker’s documentation because the CLI did not report its available agents. These v2 shortcuts have not been verified against this installation.",
            ]
          : []),
        ...(skipped
          ? [
              `${skipped} entries with incomplete, unsupported, or duplicate kit metadata were excluded.`,
            ]
          : []),
      ],
    };
  };

  // Discovery is a new snapshot. Keep selections whose kits are still in the
  // catalog (matched by source); the rest cannot carry stale source
  // references and are dropped. Kit ids embed the source, so a refreshed
  // catalog can re-issue ids (a new GitHub commit, for example); entered
  // values are remapped onto the fresh ids instead of being dropped.
  const mergeSelections = (nextKits: KitOption[]) => {
    const matchBySource = (kit: KitOption) => nextKits.find((fresh) => fresh.source === kit.source);
    setAgent((previous) => (previous ? (matchBySource(previous) ?? null) : null));
    setMixins((previous) =>
      previous
        .map((mixin) => matchBySource(mixin))
        .filter((mixin): mixin is KitOption => mixin !== null),
    );
    setValues((previous) => {
      const previousKits = [...(agent ? [agent] : []), ...mixins];
      if (!previousKits.length) return previous;
      const next: KitArguments = {};
      for (const kit of previousKits) {
        const fresh = matchBySource(kit);
        const entered = previous[kit.id];
        if (fresh && entered) next[fresh.id] = entered;
      }
      return next;
    });
  };

  const discover = async (refresh = false) => {
    // Provider edits are persisted by saveProviders below, so unsaved changes
    // do not need to block discovery.
    if (lock.current || !providers) return;
    lock.current = true;
    setBusy("discover");
    setError(null);
    try {
      // Defaults from get_providers may not have a file yet. Persist before discovery.
      const persistedProviders = await saveProviders(providers);
      const result = await discoverKits(persistedProviders, refresh);
      if (!mounted.current) return;
      const { kits, warnings } = verifiedFrom(result);
      setCatalog({ kits, warnings });
      mergeSelections(kits);
      setProviderFilter("");
      setStep(1);
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const browse = async (target: "workspace" | "path") => {
    if (lock.current) return;
    lock.current = true;
    setBusy(target);
    setError(null);
    try {
      const path = await (target === "workspace" ? pickWorkspace() : pickTemplatePath());
      if (path && mounted.current) {
        if (target === "workspace") {
          setWorkspace(path);
        } else {
          setSavePath(path);
        }
      }
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const launch = async (template: SavedTemplate) => {
    // Always pass the saved configuration's name, not a generated launch label.
    const output = await launchTemplate({
      id: template.id,
      name: template.name,
      workspace: template.workspace,
      secrets: Object.values(secrets).filter(
        (secret): secret is LaunchSecret => !!secret && !!secret.value.trim(),
      ),
    });
    if (!mounted.current) return;
    setLaunchOutput(output);
    setLaunched(true);
  };

  const submit = async (shouldLaunch: boolean) => {
    if (lock.current || !request) return;
    if (
      !inputValid ||
      !request.name ||
      (!mountless && !request.workspace) ||
      !mixins.every((kit) => isCompatibleMixin(kit, request.agent))
    ) {
      setError(
        mountless
          ? "Choose a compatible agent and mixins, complete required kit inputs, and enter a project name."
          : "Choose a compatible agent and mixins, complete required kit inputs, and enter a project name and workspace.",
      );
      return;
    }
    lock.current = true;
    setBusy("save");
    setError(null);
    let persisted = false;
    try {
      const result = editingId
        ? await updateTemplate(editingId, updateRequest!)
        : await saveTemplate(request);
      persisted = true;
      if (!mounted.current) return;
      setSaved(result);
      if (shouldLaunch) {
        setBusy("launch");
        await launch(result);
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          `${persisted ? "Template saved, but the sandbox could not be launched. " : ""}${String(failure)}`,
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const retryLaunch = async () => {
    if (lock.current || !saved) return;
    lock.current = true;
    setBusy("launch");
    setError(null);
    try {
      await launch(saved);
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const copy = async () => {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(saved.content);
      setCopyNotice("YAML copied to clipboard.");
    } catch (failure) {
      setCopyNotice(`Couldn’t copy YAML. Select the preview to copy it manually. ${String(failure)}`);
    }
  };

  const onProvidersChange = (next: Provider[]) => {
    // Only invalidate the discovery snapshot when the configuration actually
    // differs from the discovered one. Remounting the editor re-reports the
    // unchanged saved configuration; that must not reset the wizard's progress.
    const changed = providers !== null && JSON.stringify(providers) !== JSON.stringify(next);
    setProviders(next);
    if (changed && catalog) {
      setCatalog(null);
      setStep(0);
      if (editingId) {
        // The edited template's catalog is the saved kit metadata; a real
        // discovery is the only way to verify alternative kits. The id stays:
        // re-selecting kits after discovery updates the same template.
        setAgent(null);
        setMixins([]);
        setValues({});
        setError(
          "Provider changes need a new discovery. This template stays in edit mode: re-select its kits and save to update it.",
        );
      } else {
        setError(
          "Provider changes need a new discovery. Review your sources and discover kits again.",
        );
      }
    }
  };

  const selectAgent = (kit: KitOption) => {
    setAgent(kit);
    setMixins((previous) =>
      previous.filter((mixin) => mixin.name !== kit.name && isCompatibleMixin(mixin, kit)),
    );
    setError(null);
  };

  const toggleMixin = (kit: KitOption, checked: boolean) => {
    setMixins((previous) =>
      checked ? [...previous, kit] : previous.filter((item) => item.id !== kit.id),
    );
  };

  const removeMixin = (kit: KitOption) => {
    setMixins((previous) => previous.filter((item) => item.id !== kit.id));
  };

  const changeArgument = (kitId: string, argument: string, value: string) => {
    setValues((previous) => ({
      ...previous,
      [kitId]: { ...previous[kitId], [argument]: value },
    }));
  };

  const editing = editingId !== null;

  return {
    /** True when the wizard edits an existing template instead of creating one. */
    editing,
    // Wizard position and shared feedback state.
    step,
    moveTo,
    busy,
    error,
    /** All selected kits (agent first); drives argument validity and the review. */
    selectedKits,
    values,
    // Step 0: providers and discovery.
    providers,
    catalog,
    onProvidersChange,
    discover,
    // Step 1: agent selection.
    agents,
    agent,
    agentSearch,
    setAgentSearch,
    selectAgent,
    // Step 2: mixin selection and kit inputs.
    compatible,
    matchingMixins,
    mixinGroups,
    mixins,
    mixinSearch,
    setMixinSearch,
    providerFilter,
    setProviderFilter,
    providerLabel,
    toggleMixin,
    removeMixin,
    changeArgument,
    // Step 3: project details and review.
    inputValid,
    request,
    credentials,
    updateRequest,
    name,
    setName,
    workspace,
    setWorkspace,
    mountless,
    setMountless,
    secrets,
    changeSecret: (service: string, secret: LaunchSecret | undefined) =>
      setSecrets((previous) => ({ ...previous, [service]: secret })),
    savePath,
    setSavePath,
    submit,
    browse,
    // Finished panel.
    saved,
    launched,
    launchOutput,
    copyNotice,
    retryLaunch,
    copy,
  };
}
