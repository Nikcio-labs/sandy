import { useEffect, useId, useRef, useState } from "react";
import type { Provider } from "../../../lib/catalog";
import { providerVersions } from "../../../lib/catalog";
import Icon from "../../../common/components/Icon";
import { normalizeRepository, repositoryIsValid } from "../providerRepository";

type VersionState = {
  values: string[];
  loading: boolean;
  error: string | null;
  fetchedAt?: string;
};

export function ProviderEditor({
  provider,
  disabled,
  onUpdate,
  onRemove,
}: {
  provider: Provider;
  disabled: boolean;
  onUpdate: (provider: Provider) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const cache = useRef(new Map<string, VersionState>());
  const [versions, setVersions] = useState<VersionState>({
    values: [],
    loading: false,
    error: null,
  });
  const [manual, setManual] = useState(false);
  const repositoryKey = `github:${normalizeRepository(provider.repository)}`;
  const currentKey = useRef(repositoryKey);
  currentKey.current = repositoryKey;
  const inFlight = useRef(false);
  // Latest values for the async version fetch, without making it a render effect.
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const manualRef = useRef(manual);
  manualRef.current = manual;

  useEffect(() => {
    setVersions(
      cache.current.get(repositoryKey) ?? {
        values: [],
        loading: false,
        error: null,
      },
    );
    setManual(false);
    // Auto-fetch the version list for enabled, valid providers with no chosen
    // reference so the latest release can be selected without extra clicks.
    if (
      !disabled &&
      provider.enabled &&
      repositoryIsValid(provider.repository) &&
      !provider.reference.trim() &&
      !inFlight.current
    ) {
      void loadVersions();
    }
  }, [repositoryKey, provider.id, disabled]);

  const loadVersions = async (refresh = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const key = repositoryKey;
    setVersions((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const result = await providerVersions(
        {
          ...provider,
          repository: normalizeRepository(provider.repository),
        },
        refresh,
      );
      const values = [
        ...new Set(result.filter((value) => typeof value === "string" && value.trim())),
      ];
      const next: VersionState = {
        values,
        loading: false,
        error: values.length
          ? null
          : "No versions were returned. Enter a reference manually or try again.",
        fetchedAt: new Date().toLocaleTimeString(),
      };
      cache.current.set(key, next);
      if (currentKey.current === key) {
        setVersions(next);
        if (!values.length) setManual(true);
        // With nothing chosen yet, default to the newest release. Discovery
        // treats an empty reference as "latest", so only fill a concrete
        // selection while the user has not started typing a manual reference.
        if (values.length && !manualRef.current && !providerRef.current.reference.trim()) {
          onUpdateRef.current({ ...providerRef.current, reference: values[0] });
        }
      }
    } catch (failure) {
      if (currentKey.current === key) {
        setVersions((previous) => ({
          ...previous,
          loading: false,
          error: String(failure),
        }));
        setManual(true);
      }
    } finally {
      inFlight.current = false;
    }
  };

  const hasCurrentReference = versions.values.includes(provider.reference);

  return (
    <fieldset className="fieldset" disabled={disabled}>
      <legend className="legend">{provider.label || provider.repository || "Provider"}</legend>
      <div className="sectionhead">
        <label className="check">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={(event) => onUpdate({ ...provider, enabled: event.target.checked })}
          />
          Enabled for discovery
        </label>
        <span className="badge pill">GitHub</span>
        <button
          type="button"
          className="textbtn"
          onClick={onRemove}
          aria-label={`Remove ${provider.label || provider.repository}`}
        >
          Remove
        </button>
      </div>
      <div className="fields">
        <label className="field" htmlFor={`${id}-label`}>
          Display name
          <input
            id={`${id}-label`}
            required
            value={provider.label}
            placeholder="Provider name"
            onChange={(event) => onUpdate({ ...provider, label: event.target.value })}
          />
        </label>
        <label className="field" htmlFor={`${id}-repository`}>
          GitHub URL or owner/repository
          <input
            id={`${id}-repository`}
            required
            value={provider.repository}
            placeholder="owner/repository"
            aria-describedby={`${id}-repository-help`}
            onChange={(event) => onUpdate({ ...provider, repository: event.target.value })}
          />
          <span className="help" id={`${id}-repository-help`}>
            Use the repository root; choose its revision below.
          </span>
        </label>
      </div>
      <div className="fields">
        <label className="field" htmlFor={`${id}-version`}>
          Version / reference
          <select
            id={`${id}-version`}
            value={hasCurrentReference ? provider.reference : ""}
            disabled={!versions.values.length || versions.loading || manual}
            onChange={(event) => onUpdate({ ...provider, reference: event.target.value })}
          >
            <option value="" disabled>
              {provider.reference
                ? `Current: ${provider.reference}`
                : versions.loading
                  ? "Fetching versions…"
                  : "Latest release"}
            </option>
            {versions.values.map((reference) => (
              <option key={reference} value={reference}>
                {reference}
              </option>
            ))}
          </select>
        </label>
        <div className="actionbar">
          <button
            type="button"
            className="btn"
            disabled={versions.loading || !repositoryIsValid(provider.repository)}
            onClick={() => void loadVersions(true)}
          >
            {versions.loading ? (
              <span className="spinner" />
            ) : (
              <Icon name="refresh" size={16} />
            )}
            {versions.loading
              ? "Fetching versions…"
              : versions.fetchedAt
                ? "Refresh versions"
                : "Fetch versions"}
          </button>
          <label className="check">
            <input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} />
            Enter reference manually
          </label>
        </div>
      </div>
      {(manual || (!versions.values.length && !versions.loading)) && (
        <label className="field" htmlFor={`${id}-reference`}>
          Tag, branch, or commit
          <input
            id={`${id}-reference`}
            value={provider.reference}
            required={provider.enabled}
            placeholder="Reference"
            onChange={(event) => onUpdate({ ...provider, reference: event.target.value })}
          />
        </label>
      )}
      <p className="help">
        Selected reference:{" "}
        <code>
          {provider.reference || (versions.loading ? "Fetching latest…" : "Latest release")}
        </code>
        {versions.fetchedAt
          ? ` · Version list cached in this view at ${versions.fetchedAt}`
          : versions.loading
            ? " · Loading remote versions…"
            : " · Remote versions have not been loaded for this repository."}
      </p>
      {versions.error && (
        <div className="inline-error" role="alert">
          <strong>Couldn’t load remote versions.</strong> {versions.error}
          <span>
            {" "}
            Your selected reference is kept. You can enter one manually or fetch again.
          </span>
        </div>
      )}
    </fieldset>
  );
}
