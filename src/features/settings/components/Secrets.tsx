import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ServiceSecretRecord } from "../../../lib/secrets";
import { listSecrets, removeSecret, setSecret } from "../../../lib/secrets";
import { listSandboxes, type SandboxInfo } from "../../../lib/sandbox";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { Combobox } from "../../../common/components/Combobox";
import Icon from "../../../common/components/Icon";
import { SearchField } from "../../../common/components/SearchField";
import { useMountedRef } from "../../../common/hooks/useMountedRef";
import "./Secrets.css";

/** The scope string the CLI uses for secrets every sandbox can use. */
const GLOBAL_SCOPE = "global";

/** Select sentinel for the "type it myself" branch of scope/name picks. */
const CUSTOM_OPTION = "\u0000custom";

/** The add dialog's scope input, lowercase before validation. */
function normalizeScope(raw: string) {
  const trimmed = raw.trim();
  return trimmed.toLowerCase() === GLOBAL_SCOPE ? GLOBAL_SCOPE : trimmed;
}

/**
 * Mirrors the backend's sandbox-name rules: the name becomes a CLI flag and
 * must survive that trip. Global is the one non-sandbox scope.
 */
function validateScope(scope: string): string | null {
  if (scope === GLOBAL_SCOPE) return null;
  if (!scope) return "Enter a sandbox name.";
  if (
    !/^[a-zA-Z0-9]/.test(scope) ||
    ![...scope].every((character) => /[a-zA-Z0-9._-]/.test(character))
  ) {
    return "Sandbox names start with a letter or digit and use only letters, digits, '.', '_' and '-'.";
  }
  return null;
}

/** One scope group in the secrets pane. */
interface ScopeGroup {
  scope: string;
  /** `global` or a sandbox name. */
  sandbox: string | null;
  secrets: ServiceSecretRecord[];
}

/** The pending row driving the set or remove dialog. */
interface PendingSecret {
  scope: string;
  name: string;
  secret: string;
}

/**
 * Settings → Secrets: every credential the installed CLI reports
 * (`sbx secret ls --json`), grouped by scope with a write-only value
 * dialog. Sandy renders the CLI's names, scopes, and masked previews
 * verbatim — no service list is maintained here, and stored values can
 * only be replaced, never read.
 */
export default function Secrets() {
  const [list, setList] = useState<Awaited<ReturnType<typeof listSecrets>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Which dialog is open, if any: the union keeps set and remove exclusive.
  const [dialog, setDialog] = useState<
    | null
    | { kind: "set"; target: PendingSecret }
    | { kind: "remove"; target: PendingSecret }
    | { kind: "add" }
  >(null);

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
  // Scope groups preserve the CLI's first-seen order; a group's header row
  // is what shows where each secret lives, so grouping is by scope, not a
  // rebuilt service list.
  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = (secret: ServiceSecretRecord) =>
      !needle || `${secret.name} ${secret.scope}`.toLowerCase().includes(needle);
    const order: string[] = [];
    const byScope = new Map<string, ScopeGroup>();
    for (const secret of secrets) {
      if (!byScope.has(secret.scope)) {
        byScope.set(secret.scope, {
          scope: secret.scope,
          sandbox: secret.scope === "global" ? null : secret.scope,
          secrets: [],
        });
        order.push(secret.scope);
      }
      if (matches(secret)) byScope.get(secret.scope)!.secrets.push(secret);
    }
    return order.map((scope) => byScope.get(scope)!);
  }, [secrets, filter]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusyKey(null);
    }
  };

  const busyKeyOf = (secret: ServiceSecretRecord) => `${secret.scope}\u0000${secret.name}`;

  return (
    <section className="pane-section" aria-busy={loading}>
      <p className="paneintro">
        Every secret the installed <code>sbx</code> CLI stores, grouped by where it applies. Values
        are write-only: set a new value to replace what is stored — existing values are never shown.
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
        <div className="actions">
          <button
            type="button"
            className="btn small"
            onClick={() => setDialog({ kind: "add" })}
            disabled={loading}
          >
            <Icon name="plus" size={14} /> Add secret
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>
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
      {groups.map((group) => (
        <section key={group.scope} className="secretscope" aria-label={scopeTitle(group)}>
          <h3 className="secretscopehead">
            <Icon name={group.sandbox ? "box" : "globe"} size={15} />
            {scopeTitle(group)}
            <span className="badge violet secretscopecount">{group.secrets.length}</span>
          </h3>
          <div className="secretlist">
            {group.secrets.map((secret) => {
              const key = busyKeyOf(secret);
              return (
                <SecretRow
                  key={key}
                  secret={secret}
                  shadowed={list?.shadowedServices.includes(secret.name) ?? false}
                  busy={busyKey === key}
                  onSet={() => setDialog({ kind: "set", target: { ...secret } })}
                  onRemove={() => setDialog({ kind: "remove", target: { ...secret } })}
                />
              );
            })}
            {list !== null && filter && group.secrets.length === 0 && (
              <p className="note">No secrets match “{filter}” in this scope.</p>
            )}
          </div>
        </section>
      ))}
      {list !== null && filter && groups.every((group) => group.secrets.length === 0) && (
        <p className="note">No secrets match “{filter}”.</p>
      )}
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
      {dialog?.kind === "add" && (
        <AddSecretDialog
          knownNames={secrets.map((secret) => secret.name)}
          knownScopes={groups.map((group) => group.scope)}
          onClose={() => setDialog(null)}
          onAdd={(scope, name, value) =>
            run("add", async () => {
              await setSecret(scope, name, value);
            })
          }
        />
      )}
      {dialog?.kind === "set" && (
        <SetSecretDialog
          pending={dialog.target}
          onClose={() => setDialog(null)}
          onSet={(value) =>
            run(`${dialog.target.scope}\u0000${dialog.target.name}`, async () => {
              await setSecret(dialog.target.scope, dialog.target.name, value);
            })
          }
        />
      )}
      {dialog?.kind === "remove" && (
        <RemoveSecretDialog
          pending={dialog.target}
          onClose={() => setDialog(null)}
          onRemove={() =>
            run(`${dialog.target.scope}\u0000${dialog.target.name}`, async () => {
              await removeSecret(dialog.target.scope, dialog.target.name);
            })
          }
        />
      )}
    </section>
  );
}

function scopeTitle(group: ScopeGroup) {
  return group.sandbox ?? "Global (all sandboxes)";
}

function SecretRow({
  secret,
  shadowed,
  busy,
  onSet,
  onRemove,
}: {
  secret: ServiceSecretRecord;
  /** Another stored credential wins at runtime; the value here is inert. */
  shadowed: boolean;
  /** This row's request, or any in-flight request that locks the editor. */
  busy: boolean;
  onSet: () => void;
  onRemove: () => void;
}) {
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
        </div>
      </div>
      <div className="settingcontrols">
        <div className="actions settingapply">
          <button type="button" className="btn small" disabled={busy} onClick={onSet}>
            Set value
          </button>
          <button type="button" className="btn small danger" disabled={busy} onClick={onRemove}>
            <Icon name="trash" size={14} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Asks for the new value, then stores it. The input starts empty and the
 * dialog stays open on failure, so a rejected value can be retried without
 * retyping.
 */
function SetSecretDialog({
  pending,
  onClose,
  onSet,
}: {
  pending: PendingSecret;
  onClose: () => void;
  /** Returns the outcome so the dialog can stay open on failure. */
  onSet: (value: string) => Promise<void>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useMountedRef();
  const actionLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      input.current?.focus();
    }
  }, []);

  const close = () => {
    if (actionLock.current) return;
    dialog.current?.close();
  };

  const store = async () => {
    const trimmed = value.trim();
    if (actionLock.current || !trimmed) return;
    actionLock.current = true;
    setSaving(true);
    try {
      await onSet(trimmed);
      if (!mounted.current) return;
      dialog.current?.close();
    } catch {
      // The pane's banner shows the failure; let the user retry or cancel.
      if (mounted.current) {
        actionLock.current = false;
        setSaving(false);
      }
    }
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-set-title`}
      onCancel={(event) => {
        if (actionLock.current) event.preventDefault();
      }}
      onClose={() => {
        setValue("");
        onClose();
      }}
    >
      <div aria-busy={saving}>
        <div className="sectionhead">
          <h2 id={`${id}-set-title`}>Set {pending.name}</h2>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close set-value dialog"
            disabled={saving}
            onClick={close}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="help intro">
          {pending.scope === "global"
            ? "This value becomes available to every sandbox through the proxy."
            : `This value becomes available to ${pending.scope} through the proxy.`}{" "}
          It replaces what is stored and is never shown again.
        </p>
        <label className="field">
          New value
          <input
            ref={input}
            type="password"
            autoComplete="off"
            disabled={saving}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && value.trim()) void store();
            }}
          />
        </label>
        <div className="actionbar end">
          <button type="button" className="btn" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={saving || !value.trim()}
            onClick={() => void store()}
          >
            {saving ? (
              <>
                <span className="spinner" /> Setting…
              </>
            ) : (
              "Set secret"
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Asks for confirmation, then removes the secret from its scope. */
function RemoveSecretDialog({
  pending,
  onClose,
  onRemove,
}: {
  pending: PendingSecret;
  onClose: () => void;
  /** Returns the outcome so the dialog can stay open on failure. */
  onRemove: () => Promise<void>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useMountedRef();
  const actionLock = useRef(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, []);

  const close = () => {
    if (actionLock.current) return;
    dialog.current?.close();
  };

  const remove = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setRemoving(true);
    try {
      await onRemove();
      if (!mounted.current) return;
      dialog.current?.close();
    } catch {
      // The pane's banner shows the failure; let the user retry or cancel.
      if (mounted.current) {
        actionLock.current = false;
        setRemoving(false);
      }
    }
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-remove-title`}
      aria-describedby={`${id}-remove-description`}
      onCancel={(event) => {
        if (actionLock.current) event.preventDefault();
      }}
      onClose={onClose}
    >
      <div aria-busy={removing}>
        <div className="sectionhead">
          <h2 id={`${id}-remove-title`}>Remove {pending.name}?</h2>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close remove dialog"
            disabled={removing}
            onClick={close}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="help intro" id={`${id}-remove-description`}>
          {pending.scope === "global"
            ? "Sandboxes will no longer authenticate through this service until a new value is stored."
            : `${pending.scope} will no longer authenticate through this service until a new value is stored.`}
        </p>
        <div className="actionbar end">
          <button type="button" className="btn" onClick={close} disabled={removing}>
            Cancel
          </button>
          <button type="button" className="btn danger" onClick={remove} disabled={removing}>
            {removing ? (
              <>
                <span className="spinner" /> Removing…
              </>
            ) : (
              <>
                <Icon name="trash" size={16} /> Remove secret
              </>
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Creates a secret in any scope: pick a known sandbox scope, pick a running
 * sandbox, or type a sandbox name that does not exist yet (sbx accepts
 * secrets for sandboxes before their first launch). Names may be free-form
 * — the CLI owns which service names it recognizes.
 */
function AddSecretDialog({
  knownNames,
  knownScopes,
  onClose,
  onAdd,
}: {
  knownNames: string[];
  knownScopes: string[];
  onClose: () => void;
  /** Returns the outcome so the dialog can stay open on failure. */
  onAdd: (scope: string, name: string, value: string) => Promise<void>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useMountedRef();
  const actionLock = useRef(false);
  const first = useRef<HTMLInputElement>(null);
  const [scopeChoice, setScopeChoice] = useState("");
  const [customScope, setCustomScope] = useState("");
  const [nameChoice, setNameChoice] = useState("");
  const [customName, setCustomName] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [sandboxes, setSandboxes] = useState<SandboxInfo[] | null>(null);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      first.current?.focus();
    }
    // The sandbox list backs the scope suggestions; a failure just means
    // fewer suggestions, which the manual input already covers.
    listSandboxes()
      .then(setSandboxes)
      .catch(() => setSandboxes([]));
  }, []);

  const close = () => {
    if (actionLock.current) return;
    dialog.current?.close();
  };

  const scopeOptions = useMemo(() => {
    const options = new Set<string>(knownScopes);
    for (const sandbox of sandboxes ?? []) options.add(sandbox.name);
    options.delete(GLOBAL_SCOPE);
    return [...options];
  }, [knownScopes, sandboxes]);

  const scope = scopeChoice === CUSTOM_OPTION ? customScope : scopeChoice;
  const name = nameChoice === CUSTOM_OPTION ? customName : nameChoice;
  const ready = Boolean(scope.trim() && name.trim() && value.trim());

  const add = async () => {
    const target = normalizeScope(scope);
    const service = name.trim();
    if (actionLock.current || !target || !service || !value.trim()) return;
    const scopeProblem = validateScope(target);
    if (scopeProblem) {
      setScopeError(scopeProblem);
      return;
    }
    actionLock.current = true;
    setSaving(true);
    try {
      await onAdd(target, service, value.trim());
      if (!mounted.current) return;
      dialog.current?.close();
    } catch {
      // The pane's banner shows the failure; let the user retry or cancel.
      if (mounted.current) {
        actionLock.current = false;
        setSaving(false);
      }
    }
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-add-title`}
      onCancel={(event) => {
        if (actionLock.current) event.preventDefault();
      }}
      onClose={() => {
        setScopeChoice("");
        setCustomScope("");
        setNameChoice("");
        setCustomName("");
        setValue("");
        onClose();
      }}
    >
      <div aria-busy={saving}>
        <div className="sectionhead">
          <h2 id={`${id}-add-title`}>Add secret</h2>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close add-secret dialog"
            disabled={saving}
            onClick={close}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="help intro">
          Store a credential globally, for a running sandbox, or for a sandbox you plan to create.
          The value is piped to the <code>sbx</code> CLI and never shown again.
        </p>
        <label className="field">
          Scope
          <Combobox
            inputRef={first}
            value={scopeChoice === CUSTOM_OPTION ? customScope : scopeChoice}
            onChange={(next) => {
              if (next === GLOBAL_SCOPE) {
                setScopeChoice(GLOBAL_SCOPE);
              } else {
                setScopeChoice(CUSTOM_OPTION);
                setCustomScope(next);
              }
              setScopeError(null);
            }}
            options={[GLOBAL_SCOPE, ...scopeOptions]}
            renderOption={(option) => (option === GLOBAL_SCOPE ? "Global — every sandbox" : option)}
            placeholder="global or a sandbox name"
            label="Scope"
            disabled={saving}
            emptyHint="Type a sandbox name — the secret applies once it exists."
            describedBy={`${id}-scope-help`}
          />
          <span className="help" id={`${id}-scope-help`}>
            {scopeChoice === CUSTOM_OPTION && customScope
              ? (scopeError ?? "This secret applies to that sandbox once it exists.")
              : "Pick “global” for every sandbox, or type one sandbox’s name."}
          </span>
        </label>
        <label className="field">
          Secret name
          <Combobox
            value={nameChoice === CUSTOM_OPTION ? customName : nameChoice}
            onChange={(next) => {
              setNameChoice(next === "" ? "" : CUSTOM_OPTION);
              setCustomName(next);
            }}
            options={knownNames}
            placeholder="e.g. github"
            label="Secret name"
            disabled={saving}
            emptyHint="Type any name — the CLI decides which services it knows."
          />
        </label>
        <label className="field">
          New value
          <input
            type="password"
            autoComplete="off"
            disabled={saving}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && ready) void add();
            }}
          />
        </label>
        <div className="actionbar end">
          <button type="button" className="btn" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={saving || !ready}
            onClick={() => void add()}
          >
            {saving ? (
              <>
                <span className="spinner" /> Adding…
              </>
            ) : (
              "Add secret"
            )}
          </button>
        </div>
      </div>
    </dialog>
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
