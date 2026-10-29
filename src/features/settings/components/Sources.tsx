import { useEffect, useId, useRef, useState } from "react";
import type { Provider } from "../../../lib/catalog";
import { getProviders } from "../../../lib/catalog";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { normalizeRepository, repositoryIsValid } from "../providerRepository";
import { SourceRow } from "./SourceRow";

/**
 * The sources step in the create flow: a read-mostly list of kit sources.
 * Edits report straight back to the wizard, which re-discovers on its own —
 * there is no save button here, unlike the full editor in Settings.
 */
export default function Sources({
  disabled,
  onChange,
  onAdd,
}: {
  disabled?: boolean;
  onChange: (providers: Provider[]) => void;
  onAdd: (providers: Provider[]) => Provider[];
}) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const callbacks = useRef({ onChange, onAdd });
  callbacks.current = { onChange, onAdd };
  const id = useId();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getProviders()
      .then((result) => {
        if (!active) return;
        setProviders(result);
        callbacks.current.onChange(result);
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

  const update = (next: Provider[]) => {
    setProviders(next);
    setError(null);
    callbacks.current.onChange(next);
  };

  const incomplete =
    providers?.some((provider) => provider.enabled && !repositoryIsValid(provider.repository)) ??
    false;

  return (
    <section className="group group-body" aria-labelledby={`${id}-title`} aria-busy={loading}>
      <div className="sectionhead">
        <div>
          <h2 id={`${id}-title`}>Kit sources</h2>
          <p className="help intro">Where your agents and add-ons come from.</p>
        </div>
        {providers !== null && (
          <span className="badge pill">
            {providers.filter((provider) => provider.enabled).length} on
          </span>
        )}
      </div>
      {loading && (
        <p className="statusline" role="status">
          <span className="spinner" /> Loading your sources…
        </p>
      )}
      {error && (
        <ErrorBanner
          title="Your sources need attention."
          actionLabel={providers === null ? "Try again" : undefined}
          onAction={providers === null ? () => setReload((value) => value + 1) : undefined}
          disabled={loading}
        >
          <p>{error}</p>
        </ErrorBanner>
      )}
      {providers !== null && !loading && (
        <>
          <div className="sourcelist">
            {providers.map((provider) => (
              <SourceRow
                key={provider.id}
                provider={provider}
                disabled={!!disabled}
                onUpdate={(next) =>
                  update(providers.map((item) => (item.id === provider.id ? next : item)))
                }
                onRemove={() => update(providers.filter((item) => item.id !== provider.id))}
              />
            ))}
          </div>
          {!providers.length && (
            <p className="help" role="status">
              No sources yet. Add one below to get started.
            </p>
          )}
          <div className="actionbar">
            <button
              type="button"
              className="btn"
              onClick={() =>
                update(
                  callbacks.current.onAdd([
                    ...providers,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      kind: "github",
                      repository: "",
                      reference: "",
                      enabled: true,
                    },
                  ]),
                )
              }
            >
              Add a source
            </button>
            {!providers.some(
              (provider) => normalizeRepository(provider.repository) === "nikcio/docker-sandboxing",
            ) && (
              <button
                type="button"
                className="textbtn"
                onClick={() =>
                  update(
                    callbacks.current.onAdd([
                      ...providers,
                      {
                        id: crypto.randomUUID(),
                        label: "Docker sandboxing",
                        kind: "github",
                        repository: "nikcio/docker-sandboxing",
                        reference: "",
                        enabled: true,
                      },
                    ]),
                  )
                }
              >
                Add docker-sandboxing
              </button>
            )}
            {incomplete && (
              <span className="help" role="status">
                Give each source a repository, like owner/repository.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
