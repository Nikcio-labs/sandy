import { useEffect, useId, useRef, useState } from "react";
import type { Provider } from "../../../lib/catalog";
import { providerVersions } from "../../../lib/catalog";
import Icon from "../../../common/components/Icon";
import { normalizeRepository, repositoryIsValid } from "../providerRepository";
import "./Sources.css";

type VersionState = {
  values: string[];
  loading: boolean;
  error: string | null;
};

/**
 * One kit-source row: the switch, the resolved repository, and an inline
 * editor that opens on demand.
 */
export function SourceRow({
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
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionState>({
    values: [],
    loading: false,
    error: null,
  });
  const repositoryKey = `github:${normalizeRepository(provider.repository)}`;
  const currentKey = useRef(repositoryKey);
  currentKey.current = repositoryKey;
  const inFlight = useRef(false);
  // Latest values for the async version fetch, without making it a render effect.
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    setVersions(
      cache.current.get(repositoryKey) ?? {
        values: [],
        loading: false,
        error: null,
      },
    );
  }, [repositoryKey]);

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
          : "No versions were returned. Enter a tag, branch, or commit manually.",
      };
      cache.current.set(key, next);
      if (currentKey.current === key) {
        setVersions(next);
        // An empty reference means "latest" downstream; fill a concrete
        // selection only while the user has not typed one themselves.
        if (values.length && !providerRef.current.reference.trim()) {
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
      }
    } finally {
      inFlight.current = false;
    }
  };

  const toggleOpen = () => {
    setOpen((previous) => {
      const next = !previous;
      if (
        next &&
        !versions.values.length &&
        !versions.loading &&
        repositoryIsValid(provider.repository)
      ) {
        void loadVersions();
      }
      return next;
    });
  };

  const hasCurrentReference = versions.values.includes(provider.reference);
  const invalid = !!provider.repository.trim() && !repositoryIsValid(provider.repository);
  const label = provider.label || provider.repository || "New source";

  return (
    <fieldset className={`sourcerow ${invalid ? "invalid" : ""}`.trim()} disabled={disabled}>
      <div className="sourcerow-head">
        <label
          className="switch"
          title={provider.enabled ? "Included in discovery" : "Excluded from discovery"}
        >
          <input
            type="checkbox"
            role="switch"
            checked={provider.enabled}
            onChange={(event) => onUpdate({ ...provider, enabled: event.target.checked })}
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="sr-only">Included</span>
        </label>
        <div className="sourcerow-name">
          <strong>{label}</strong>
          <span className="sourcerow-repo">
            <Icon name="folder" size={13} />{" "}
            {normalizeRepository(provider.repository) || "no repository set"}
            {provider.reference ? ` · ${provider.reference}` : ""}
          </span>
        </div>
        <button type="button" className="textbtn" aria-expanded={open} onClick={toggleOpen}>
          {open ? "Done" : "Edit"}
        </button>
      </div>
      {open && (
        <div className="sourcerow-body">
          <div className="fields">
            <label className="field" htmlFor={`${id}-label`}>
              Name
              <input
                id={`${id}-label`}
                value={provider.label}
                placeholder="Docker sandboxing"
                onChange={(event) => onUpdate({ ...provider, label: event.target.value })}
              />
            </label>
            <label className="field" htmlFor={`${id}-repository`}>
              GitHub repository
              <input
                id={`${id}-repository`}
                required
                value={provider.repository}
                placeholder="owner/repository"
                onChange={(event) => onUpdate({ ...provider, repository: event.target.value })}
              />
            </label>
          </div>
          <label className="field" htmlFor={`${id}-version`}>
            Version
            <div className="path-row">
              <select
                id={`${id}-version`}
                value={hasCurrentReference ? provider.reference : ""}
                disabled={!versions.values.length || versions.loading}
                onChange={(event) => onUpdate({ ...provider, reference: event.target.value })}
              >
                <option value="">
                  {versions.loading ? "Fetching versions…" : "Latest release"}
                </option>
                {versions.values.map((reference) => (
                  <option key={reference} value={reference}>
                    {reference}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small"
                disabled={versions.loading || !repositoryIsValid(provider.repository)}
                onClick={() => void loadVersions(true)}
              >
                {versions.loading ? (
                  <span className="spinner" />
                ) : (
                  <Icon name="refresh" size={14} />
                )}
                Refresh
              </button>
            </div>
          </label>
          {(versions.error || (provider.reference && !hasCurrentReference)) && (
            <label className="field" htmlFor={`${id}-reference`}>
              Tag, branch, or commit
              <input
                id={`${id}-reference`}
                value={provider.reference}
                required={provider.enabled}
                placeholder="main"
                onChange={(event) => onUpdate({ ...provider, reference: event.target.value })}
              />
            </label>
          )}
          {versions.error && (
            <p className="inline-error" role="alert">
              <strong>Couldn’t load versions.</strong> {versions.error}
            </p>
          )}
          <div className="actionbar">
            <button
              type="button"
              className="textbtn"
              onClick={onRemove}
              aria-label={`Remove ${label}`}
            >
              Remove this source
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
