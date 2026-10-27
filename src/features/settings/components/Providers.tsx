import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CatalogSettings, Provider } from "../../../lib/catalog";
import {
  getCatalogSettings,
  getProviders,
  saveCatalogSettings,
  saveProviders,
} from "../../../lib/catalog";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { normalizeRepository, repositoryIsValid } from "../providerRepository";
import { ProviderEditor } from "./ProviderEditor";

export interface ProvidersProps {
  onChange?: (providers: Provider[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
}

export default function Providers({ onChange, onDirtyChange, disabled = false }: ProvidersProps) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [gitProtocol, setGitProtocol] = useState<CatalogSettings | null>(null);
  const [gitProtocolNotice, setGitProtocolNotice] = useState("");
  const callbacks = useRef({ onChange, onDirtyChange });
  callbacks.current = { onChange, onDirtyChange };
  const lock = useRef(false);
  const id = useId();
  const dirty = providers !== null && JSON.stringify(providers) !== saved;
  // An empty reference is valid: discovery resolves it to the latest tag.
  const incomplete =
    providers?.some(
      (provider) => provider.enabled && !repositoryIsValid(provider.repository),
    ) ?? false;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getProviders()
      .then((result) => {
        if (!active) return;
        setProviders(result);
        setSaved(JSON.stringify(result));
        callbacks.current.onChange?.(result);
      })
      .catch((failure) => {
        if (active) setError(String(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(() => {
    let active = true;
    getCatalogSettings()
      .then((settings) => {
        if (active) setGitProtocol(settings);
      })
      .catch(() => {
        // The toggle degrades to the backend default (on) rather than
        // blocking the provider list on a settings read failure.
        if (active) setGitProtocol(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    callbacks.current.onDirtyChange?.(loading || providers === null || dirty || incomplete);
  }, [dirty, loading, providers, incomplete]);

  const update = (next: Provider[]) => {
    setProviders(next);
    setNotice("");
    setError(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || !providers) return;
    if (
      providers.some(
        (provider) => !provider.label.trim() || !repositoryIsValid(provider.repository),
      )
    ) {
      setError("Give each provider a name and a valid repository before saving.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const result = await saveProviders(
        providers.map((provider) => ({
          ...provider,
          label: provider.label.trim(),
          repository: normalizeRepository(provider.repository),
          reference: provider.reference.trim(),
        })),
      );
      setProviders(result);
      setSaved(JSON.stringify(result));
      setNotice("Provider configuration saved to disk.");
      callbacks.current.onChange?.(result);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setSaving(false);
      lock.current = false;
    }
  };

  const toggleGitProtocol = async (useGitProtocol: boolean) => {
    const previous = gitProtocol;
    setGitProtocol({ discovery_use_git_protocol: useGitProtocol });
    setGitProtocolNotice("");
    try {
      setGitProtocol(await saveCatalogSettings({ discovery_use_git_protocol: useGitProtocol }));
      setGitProtocolNotice(
        useGitProtocol
          ? "Sandy will discover kits over the git protocol on the next refresh."
          : "Sandy will discover kits over the GitHub API on the next refresh.",
      );
    } catch (failure) {
      if (previous) setGitProtocol(previous);
      setError(String(failure));
    }
  };

  return (
    <section className="group group-body" aria-labelledby={`${id}-title`} aria-busy={loading || saving}>
      <div className="sectionhead">
        <div>
          <h2 id={`${id}-title`}>Kit providers</h2>
          <p className="help intro">
            Choose where Sandy finds agents, workloads, and mixins. Save your references before
            discovering kits.
          </p>
        </div>
        {providers !== null && (
          <span className="badge pill">
            {providers.filter((provider) => provider.enabled).length} enabled
          </span>
        )}
      </div>
      <p className="help">
        Enabling a GitHub repository authorizes Sandy to add a repository-scoped entry to{" "}
        <code>sbx kit.allowedSources</code> when you launch its kits. Existing policy entries are
        preserved. Managed policy restrictions are reported rather than overridden.
      </p>
      <label className="catalog-check" htmlFor={`${id}-git-protocol`}>
        <input
          type="checkbox"
          id={`${id}-git-protocol`}
          disabled={disabled || gitProtocol === null}
          checked={gitProtocol?.discovery_use_git_protocol ?? true}
          onChange={(event) => void toggleGitProtocol(event.target.checked)}
        />
        Discover GitHub kits over the git protocol (uses fewer API requests)
      </label>
      {gitProtocolNotice && (
        <p className="catalog-help" role="status">
          {gitProtocolNotice}
        </p>
      )}
      {loading && (
        <p className="statusline" role="status">
          <span className="spinner" /> Loading saved providers…
        </p>
      )}
      {error && (
        <ErrorBanner
          title="Provider configuration needs attention."
          actionLabel={providers === null ? "Try again" : undefined}
          onAction={providers === null ? () => setReload((value) => value + 1) : undefined}
          disabled={loading}
        >
          <p>{error}</p>
        </ErrorBanner>
      )}
      {providers !== null && !loading && (
        <form onSubmit={save}>
          <fieldset className="catalog-unframed" disabled={disabled || saving}>
            <legend className="sr-only">Provider configuration</legend>
            {providers.map((provider) => (
              <ProviderEditor
                key={provider.id}
                provider={provider}
                disabled={disabled || saving}
                onUpdate={(next) =>
                  update(providers.map((item) => (item.id === provider.id ? next : item)))
                }
                onRemove={() => update(providers.filter((item) => item.id !== provider.id))}
              />
            ))}
            {!providers.length && (
              <p className="note">
                No providers configured. Add a GitHub repository to get started.
              </p>
            )}
            <div className="actionbar">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  update([
                    ...providers,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      kind: "github",
                      repository: "",
                      reference: "",
                      enabled: true,
                    },
                  ])
                }
              >
                Add provider
              </button>
              {!providers.some(
                (provider) =>
                  normalizeRepository(provider.repository) === "nikcio/docker-sandboxing",
              ) && (
                <button
                  type="button"
                  className="textbtn"
                  onClick={() =>
                    update([
                      ...providers,
                      {
                        id: crypto.randomUUID(),
                        label: "Docker sandboxing",
                        kind: "github",
                        repository: "nikcio/docker-sandboxing",
                        reference: "",
                        enabled: true,
                      },
                    ])
                  }
                >
                  Add docker-sandboxing
                </button>
              )}
            </div>
            <div className="actionbar">
              <button type="submit" className="btn primary" disabled={!dirty || saving}>
                {saving ? "Saving providers…" : "Save providers"}
              </button>
              <span className="help" role="status">
                {notice ||
                  (incomplete
                    ? "Give each enabled repository a valid repository URL."
                    : dirty
                      ? "Unsaved provider changes"
                      : "Using the saved provider configuration")}
              </span>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
