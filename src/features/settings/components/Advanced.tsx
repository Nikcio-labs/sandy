import { useCallback, useEffect, useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { clearDebugLog, readDebugLog, debugLogDir, type DebugLogEntry } from "../../../lib/catalog";
import { copyText } from "../../../common/lib/clipboard";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Icon from "../../../common/components/Icon";

type LevelFilter = "all" | "errors";

function parseEntry(line: string): DebugLogEntry | null {
  if (!line.trim()) return null;
  try {
    const value = JSON.parse(line) as DebugLogEntry;
    if (typeof value.timestamp === "string" && typeof value.summary === "string" && typeof value.kind === "string") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}

/** Friendly labels for the app's own log targets; dependency crates fall
 * back to their target name verbatim. */
const KIND_LABELS: Record<string, string> = {
  cli: "CLI",
  http: "HTTP",
  command: "Command",
  app: "App",
  sandy: "App",
};

const RENDER_LIMIT = 300;

/**
 * Settings → Advanced: the Sandy diagnostic log. Every CLI invocation,
 * discovery API request, command result, and error is recorded to a
 * capped JSON Lines file managed by the backend.
 */
export default function Advanced() {
  const [log, setLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<LevelFilter>("all");
  const [copied, setCopied] = useState(false);
  const [copiedDir, setCopiedDir] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setShowAll(false);
    try {
      setLog(await readDebugLog());
    } catch (failure) {
      setError(String(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const entries = useMemo(
    () => (log ?? "").split("\n").map(parseEntry).filter((entry): entry is DebugLogEntry => entry !== null),
    [log],
  );
  const visible = useMemo(
    () => (filter === "errors" ? entries.filter((entry) => entry.outcome === "error") : entries),
    [entries, filter],
  );
  // The log file is appended oldest first, so reverse for a newest-first view;
  // older entries are behind "Show older".
  const rendered = useMemo(
    () => {
      const newestFirst = [...visible].reverse();
      return showAll ? newestFirst : newestFirst.slice(0, RENDER_LIMIT);
    },
    [visible, showAll],
  );
  const errorCount = useMemo(
    () => entries.filter((entry) => entry.outcome === "error").length,
    [entries],
  );
  // The backend caps the file at 10 MiB; show how close it is. Encoding the
  // whole (up to 10 MiB) string is expensive, so only redo it when the log
  // actually changes, not on every render.
  const sizeLabel = useMemo(() => {
    const sizeBytes = log ? new TextEncoder().encode(log).length : 0;
    return sizeBytes > 1024 * 1024
      ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB of 10 MB`
      : `${Math.round(sizeBytes / 1024)} KB of 10 MB`;
  }, [log]);

  const copyLog = async () => {
    if (!log) return;
    try {
      await copyText(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Could not access the clipboard. Select the log text and copy it manually.");
    }
  };

  const copyLogDir = async () => {
    try {
      await copyText(await debugLogDir());
      setCopiedDir(true);
      setTimeout(() => setCopiedDir(false), 2000);
    } catch {
      setNotice("Could not access the clipboard. Select the log text and copy it manually.");
    }
  };

  const openLogDir = async () => {
    try {
      await openPath(await debugLogDir());
    } catch {
      setNotice("Could not open the log folder. Copy the folder path and open it manually.");
    }
  };

  const clear = async () => {
    setError(null);
    setNotice("");
    try {
      await clearDebugLog();
      await refresh();
      setNotice("Diagnostic log cleared.");
    } catch (failure) {
      setError(String(failure));
    }
  };

  return (
    <section className="group group-body" aria-labelledby="advanced-title" aria-busy={loading}>
      <div className="sectionhead">
        <div>
          <h2 id="advanced-title">Advanced</h2>
          <p className="help intro">
            A running record of what Sandy does on your behalf: every sandbox CLI call, kit
            discovery request, and error, with timestamps. Sandy keeps the newest entries when
            the log reaches its 10 MB limit.
          </p>
        </div>
        {entries.length > 0 && (
          <span className="badge pill">
            {errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : `${entries.length} entries`}
          </span>
        )}
      </div>
      {loading && (
        <p className="statusline" role="status">
          <span className="spinner" /> Loading diagnostic log…
        </p>
      )}
      {error && (
        <ErrorBanner title="The diagnostic log could not be read." actionLabel="Try again" onAction={() => void refresh()}>
          <p>{error}</p>
        </ErrorBanner>
      )}
      {!loading && !error && (
        <>
          {entries.length === 0 ? (
            <p className="note">
              Nothing logged yet. Entries appear as you use sandboxes, providers, and templates.
            </p>
          ) : (
            <>
              <div className="debug-log-toolbar">
                <label className="debug-log-filter">
                  Show
                  <select value={filter} onChange={(event) => setFilter(event.target.value as LevelFilter)}>
                    <option value="all">All entries</option>
                    <option value="errors">Errors only</option>
                  </select>
                </label>
                <span className="help">
                  {visible.length === entries.length
                    ? `${entries.length} entries, ${sizeLabel}`
                    : `${visible.length} of ${entries.length} entries, ${sizeLabel}`}
                </span>
              </div>
              <div className="debug-log-view" role="log" aria-label="Diagnostic log entries">
                {rendered.map((entry, index) => (
                  <details key={`${entry.timestamp}-${index}`} className="debug-log-entry">
                    <summary>
                      <span className={`debug-log-kind debug-log-kind-${entry.kind}`}>
                        {KIND_LABELS[entry.kind] ?? entry.kind}
                      </span>
                      <span className={entry.outcome === "error" ? "debug-log-failed" : undefined}>
                        {entry.summary}
                      </span>
                      <span className="debug-log-time">{formatTimestamp(entry.timestamp)}</span>
                    </summary>
                    {entry.detail && <pre>{entry.detail}</pre>}
                  </details>
                ))}
                {visible.length === 0 && (
                  <p className="note">No matching entries.</p>
                )}
                {rendered.length < visible.length && (
                  <div className="debug-log-older">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setShowAll(true)}
                    >
                      Show older entries ({visible.length - rendered.length} hidden)
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {notice && (
            <p className="help" role="status">
              {notice}
            </p>
          )}
          <div className="actionbar">
            <button type="button" className="btn" onClick={() => void refresh()} disabled={loading}>
              <Icon name="refresh" size={16} />
              Refresh
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void copyLog()}
              disabled={loading || !entries.length}
            >
              {copied ? "Copied" : "Copy log"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void copyLogDir()}
              disabled={loading}
              aria-label="Copy the diagnostic log folder path"
            >
              <Icon name="clipboard" size={16} />
              {copiedDir ? "Copied" : "Copy log folder"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void openLogDir()}
              disabled={loading}
              aria-label="Open the diagnostic log folder in the file manager"
            >
              <Icon name="folder" size={16} />
              Open log folder
            </button>
            <button type="button" className="btn" onClick={() => void clear()} disabled={loading || !entries.length}>
              <Icon name="trash" size={16} />
              Clear log
            </button>
          </div>
        </>
      )}
    </section>
  );
}
