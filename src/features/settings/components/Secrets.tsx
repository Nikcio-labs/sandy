import { useCallback, useEffect, useMemo, useState } from "react";
import type { ServiceSecretRecord } from "../../../lib/secrets";
import { listSecrets, removeSecret, setSecret } from "../../../lib/secrets";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Icon from "../../../common/components/Icon";
import { SearchField } from "../../../common/components/SearchField";
import "./Secrets.css";

/**
 * Settings → Secrets: every credential the installed CLI reports
 * (`sbx secret ls --json`), with a write-only value editor. Sandy renders
 * the CLI's names, scopes, and masked previews verbatim — no service list
 * is maintained here, and stored values can only be replaced, never read.
 */
export default function Secrets() {
  const [list, setList] = useState<Awaited<ReturnType<typeof listSecrets>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Draft values and per-scope scope picker for the "set" form.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await listSecrets());
    } catch (failure) {
      setError(String(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const secrets = list?.secrets ?? [];
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return secrets;
    return secrets.filter((secret) =>
      `${secret.name} ${secret.scope}`.toLowerCase().includes(needle),
    );
  }, [secrets, filter]);

  const apply = async (scope: string, name: string) => {
    const key = `${scope}\u0000${name}`;
    const value = (drafts[key] ?? "").trim();
    if (busyKey || !value) return;
    setBusyKey(key);
    setError(null);
    try {
      await setSecret(scope, name, value);
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      await refresh();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (scope: string, name: string) => {
    if (busyKey) return;
    setBusyKey(`${scope}\u0000${name}`);
    setError(null);
    try {
      await removeSecret(scope, name);
      await refresh();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusyKey(null);
    }
  };

  // Rows lock individually only for their own request; other rows stay
  // editable (unlike the settings editor, secrets never conflict).
  const busyKeyOf = (secret: ServiceSecretRecord) => `${secret.scope}\u0000${secret.name}`;

  return (
    <section className="pane-section" aria-busy={loading}>
      <p className="paneintro">
        Every secret the installed <code>sbx</code> CLI stores, with its scope. Values are
        write-only: type a new value to replace what is stored — existing values are never shown.
      </p>
      <div className="split pane-toolbar">
        <SearchField
          value={filter}
          onChange={setFilter}
          placeholder="Filter secrets…"
          label="Filter secrets"
          wide
          className="pane-search"
        />
        <button type="button" className="btn small" onClick={() => void refresh()} disabled={loading}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>
      {error && (
        <ErrorBanner
          title="The secret change could not be applied."
          actionLabel={list === null ? "Try again" : undefined}
          onAction={list === null ? () => void refresh() : undefined}
        >
          <p>{error}</p>
        </ErrorBanner>
      )}
      {loading && list === null && (
        <p className="statusline" role="status">
          <span className="spinner" /> Reading stored secrets…
        </p>
      )}
      {list !== null && secrets.length === 0 && (
        <p className="note">
          The CLI reported no stored secrets. Kits that need a credential will offer to set one when
          you launch them.
        </p>
      )}
      <div className="secretlist">
        {visible.map((secret) => {
          const key = busyKeyOf(secret);
          return (
            <SecretRow
              key={key}
              secret={secret}
              shadowed={list?.shadowedServices.includes(secret.name) ?? false}
              busy={busyKey === key}
              draft={drafts[key] ?? ""}
              onDraft={(value) =>
                setDrafts((previous) => ({ ...previous, [key]: value }))
              }
              onApply={() => void apply(secret.scope, secret.name)}
              onRemove={() => void remove(secret.scope, secret.name)}
            />
          );
        })}
        {list !== null && filter && visible.length === 0 && (
          <p className="note">No secrets match “{filter}”.</p>
        )}
      </div>
      {list !== null && list.envOnlyCount > 0 && (
        <p className="help">
          {list.envOnlyCount} environment variable{list.envOnlyCount === 1 ? "" : "s"} on this
          machine look like credentials. Run <code>sbx secret import</code> in a terminal to store
          them.
        </p>
      )}
      {list !== null && list.customSecrets.length > 0 && (
        <>
          <h3 className="secrets subsection">Custom secrets</h3>
          <p className="help">
            Placeholders managed by <code>sbx</code>: requests from sandboxes to the listed targets
            are authenticated by the proxy without the value entering the sandbox.
          </p>
          <div className="secretlist">
            {list.customSecrets.map((entry, index) => (
              <CustomSecretRow key={index} entry={entry} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SecretRow({
  secret,
  shadowed,
  busy,
  draft,
  onDraft,
  onApply,
  onRemove,
}: {
  secret: ServiceSecretRecord;
  /** Another stored credential wins at runtime; the value here is inert. */
  shadowed: boolean;
  /** This row's request, or any in-flight request that locks the editor. */
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
}) {
  const dirty = draft.trim().length > 0;
  return (
    <article className="secret">
      <div className="settinginfo">
        <strong>{secret.name}</strong>
        <p>
          {secret.secret}
          {shadowed && " — shadowed: another stored credential takes precedence"}
        </p>
        <div className="actions settingbadges">
          <span className="badge">{secret.type}</span>
          <span className="badge violet">
            {secret.scope === "global" ? "global scope" : `sandbox: ${secret.scope}`}
          </span>
        </div>
      </div>
      <div className="settingcontrols">
        <input
          className="fieldcontrol settingvalue"
          aria-label={`New value for ${secret.name} (${secret.scope})`}
          type="password"
          placeholder="New value…"
          autoComplete="off"
          disabled={busy}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty) onApply();
          }}
        />
        <div className="actions settingapply">
          <button
            type="button"
            className="btn small"
            disabled={busy || !dirty}
            onClick={onApply}
          >
            Set
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={busy}
            onClick={onRemove}
          >
            <Icon name="trash" size={14} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}

/** Opaque passthrough of one CLI custom-secret record; schema owned by sbx. */
function CustomSecretRow({ entry }: { entry: unknown }) {
  const record = (entry ?? {}) as Record<string, unknown>;
  const text = (name: string) => (typeof record[name] === "string" ? (record[name] as string) : "");
  const scope = text("scope") || "global";
  const targets = Array.isArray(record.targets)
    ? record.targets.filter((target): target is string => typeof target === "string")
    : [];
  return (
    <article className="secret">
      <div className="settinginfo">
        <strong>{targets.join(", ") || text("placeholder") || "Custom secret"}</strong>
        <p>{text("env") && `Sandbox env var: ${text("env")}`}</p>
        <div className="actions settingbadges">
          <span className="badge violet">
            {scope === "global" ? "global scope" : `sandbox: ${scope}`}
          </span>
        </div>
      </div>
    </article>
  );
}
