import { useEffect, useId, useRef, useState } from "react";
import type { SandboxInfo } from "../../../lib/sandbox";
import { deleteSecret, listSecrets, setSecret } from "../../../lib/secrets";
import type { SecretEntry } from "../../../lib/secrets";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { useMountedRef } from "../../../common/hooks/useMountedRef";
import "./SecretsDialog.css";

/**
 * Manage the secrets stored on this computer: every scope plus the named
 * sandbox's own scope. Values are sent to `sbx secret set` over stdin and are
 * never displayed back — the CLI only reports masked previews.
 */
export function SecretsDialog({
  sandbox,
  onClose,
}: {
  sandbox: SandboxInfo;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useMountedRef();
  const actionLock = useRef(false);
  const [entries, setEntries] = useState<SecretEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [service, setService] = useState("");
  const [value, setValue] = useState("");
  const [sandboxScoped, setSandboxScoped] = useState(true);
  const [busy, setBusy] = useState<"load" | "save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, []);

  const refresh = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy("load");
    try {
      const [all, mine] = await Promise.all([
        listSecrets(),
        listSecrets({ sandbox: sandbox.name }),
      ]);
      if (!mounted.current) return;
      const scoped = new Set(mine.map((entry) => `${entry.scope}\u0000${entry.name}`));
      setEntries(
        all.filter(
          (entry) =>
            entry.type === "service" &&
            (entry.scope === "global" || scoped.has(`${entry.scope}\u0000${entry.name}`)),
        ),
      );
      setLoadError(null);
    } catch (failure) {
      if (mounted.current) setLoadError(String(failure));
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  useEffect(() => {
    void refresh();
    // The list is read once when the dialog opens; actions refresh it after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (actionLock.current || !service.trim() || !value) return;
    actionLock.current = true;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      await setSecret(
        service.trim(),
        value,
        sandboxScoped ? { sandbox: sandbox.name } : "global",
        true,
      );
      if (!mounted.current) return;
      setNotice(
        `Saved ${service.trim()} ${sandboxScoped ? `for ${sandbox.name}` : "for all sandboxes"}.`,
      );
      setService("");
      setValue("");
      await refresh();
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const remove = async (entry: SecretEntry) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy("remove");
    setError(null);
    setNotice(null);
    try {
      await deleteSecret(
        entry.name,
        entry.scope === "global" ? "global" : { sandbox: entry.scope },
      );
      if (!mounted.current) return;
      setNotice(`Removed ${entry.name} (${entry.scope}).`);
      await refresh();
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const close = () => {
    if (actionLock.current) return;
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-secrets-title`}
      onCancel={(event) => {
        if (actionLock.current) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form onSubmit={save} aria-busy={busy !== null}>
        <div className="sectionhead">
          <h2 id={`${id}-secrets-title`}>Secrets</h2>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close secrets dialog"
            disabled={busy !== null}
            onClick={close}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="help intro">
          Stored with the sbx CLI and used by the sandbox proxy to authenticate your agents.
          Values never enter the sandbox. Global secrets cover every sandbox; this sandbox’s own
          take precedence.
        </p>
        {(error || loadError) && (
          <ErrorBanner title="Couldn’t manage secrets.">
            <p>{error ?? loadError}</p>
          </ErrorBanner>
        )}
        {notice && (
          <p className="statusline" role="status">
            {notice}
          </p>
        )}
        {entries !== null && (
          <div className="secret-list">
            {entries.length === 0 ? (
              <p className="help">No secrets stored yet.</p>
            ) : (
              <table className="secret-table">
                <thead>
                  <tr>
                    <th scope="col">Scope</th>
                    <th scope="col">Service</th>
                    <th scope="col">Value</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={`${entry.scope}/${entry.name}`}>
                      <td>{entry.scope === "global" ? "All sandboxes" : entry.scope}</td>
                      <td>{entry.name}</td>
                      <td>
                        <code>{entry.secret || "(stored)"}</code>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy !== null}
                          aria-label={`Remove ${entry.name} for ${entry.scope}`}
                          onClick={() => void remove(entry)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {entries === null && !loadError && (
          <p className="statusline" role="status">
            <span className="spinner" /> Loading stored secrets…
          </p>
        )}
        <fieldset className="catalog-unframed" disabled={busy !== null}>
          <legend className="sr-only">Store a new secret</legend>
          <label className="field" htmlFor={`${id}-service`}>
            Service name
            <input
              id={`${id}-service`}
              required
              value={service}
              placeholder="github, anthropic, openai, …"
              pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]*"
              onChange={(event) => setService(event.target.value)}
            />
            <span className="help">
              The service the kits declare, such as github or a custom kit’s service name.
            </span>
          </label>
          <label className="field" htmlFor={`${id}-value`}>
            Secret value
            <input
              id={`${id}-value`}
              type="password"
              required
              autoComplete="off"
              value={value}
              placeholder="Paste the API key or token"
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <label className="check" htmlFor={`${id}-scope`}>
            <input
              id={`${id}-scope`}
              type="checkbox"
              checked={sandboxScoped}
              onChange={(event) => setSandboxScoped(event.target.checked)}
            />
            Only let {sandbox.name} use it
          </label>
          <div className="actionbar end">
            <button type="button" className="btn" disabled={busy !== null} onClick={close}>
              Done
            </button>
            <button type="submit" className="btn primary" disabled={!service.trim() || !value}>
              {busy === "save" ? (
                <>
                  <span className="spinner" /> Saving…
                </>
              ) : (
                "Save secret"
              )}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  );
}
