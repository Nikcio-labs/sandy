import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getGithubToken, saveGithubToken } from "../../../lib/catalog";
import { ErrorBanner } from "../../../common/components/ErrorBanner";

/**
 * Settings → GitHub access: an optional Personal Access Token that raises
 * GitHub's request limit from 60 to 5,000 per hour. The stored token never
 * crosses back to the UI; the backend reports only whether one is saved.
 */
export default function GithubToken({ disabled = false }: { disabled?: boolean }) {
  const id = useId();
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getGithubToken()
      .then((status) => {
        if (active) setSaved(status.saved);
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
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      await saveGithubToken(draft.trim());
      setSaved(draft.trim().length > 0);
      setDraft("");
      setNotice(
        draft.trim()
          ? "GitHub token saved. Discovery now uses your account's request limit."
          : "GitHub token cleared. Discovery uses anonymous requests again.",
      );
    } catch (failure) {
      setError(String(failure));
    } finally {
      setSaving(false);
      lock.current = false;
    }
  };

  // A whitespace-only draft is "unchanged", not a clear request: submitting
  // it would wipe the saved token while the UI reports success.
  const changed = draft.trim().length > 0 || (saved && draft.trim().length > 0);

  return (
    <section className="catalog-providers" aria-labelledby={`${id}-title`} aria-busy={loading || saving}>
      <div className="catalog-section-heading">
        <div>
          <h2 id={`${id}-title`}>GitHub access</h2>
          <p className="catalog-muted">Raise the number of requests Sandy may make to GitHub.</p>
        </div>
        {saved && <span className="catalog-badge">Token saved</span>}
      </div>
      <p className="catalog-help">
        Without a token, GitHub allows 60 requests per hour and discovery can fail with rate-limit
        messages. A personal access token from{" "}
        <code>github.com/settings/tokens</code> connects your GitHub account and raises the limit to
        5,000 per hour. The token stays on this computer and is only sent to GitHub.
      </p>
      {error && (
        <ErrorBanner title="The GitHub token needs attention.">
          <p>{error}</p>
        </ErrorBanner>
      )}
      {!loading && (
        <form onSubmit={submit}>
          <fieldset className="catalog-unframed" disabled={disabled || saving}>
            <legend className="catalog-sr-only">GitHub token</legend>
            <label className="catalog-field" htmlFor={`${id}-token`}>
              {saved ? "Replace token" : "Personal access token"}
              <input
                id={`${id}-token`}
                type="password"
                // `new-password` is the only value browsers honor to keep
                // their password manager away from a non-credential field.
                autoComplete="new-password"
                value={draft}
                placeholder={saved ? "ghp_••••" : "ghp_… or github_pat_…"}
                onChange={(event) => setDraft(event.target.value)}
              />
              <span className="catalog-help" id={`${id}-token-help`}>
                {saved
                  ? "A token is saved on this computer. Type a new one to replace it, or clear below."
                  : "No token saved. Discovery works without one until GitHub's hourly limit is reached."}
              </span>
            </label>
            <div className="catalog-actions">
              <button type="submit" className="primary" disabled={!changed || saving}>
                {saving ? "Saving…" : "Save token"}
              </button>
              {saved && (
                <button
                  type="button"
                  className="ghost"
                  disabled={saving}
                  onClick={() => {
                    setDraft("");
                    void (async () => {
                      lock.current = true;
                      setSaving(true);
                      setError(null);
                      try {
                        await saveGithubToken("");
                        setSaved(false);
                        setNotice("GitHub token cleared.");
                      } catch (failure) {
                        setError(String(failure));
                      } finally {
                        setSaving(false);
                        lock.current = false;
                      }
                    })();
                  }}
                >
                  Clear token
                </button>
              )}
              <span className="catalog-help" role="status">
                {notice || (saved ? "A token is saved on this computer." : "")}
              </span>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
