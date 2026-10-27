import { useCallback, useEffect, useMemo, useState } from "react";
import type { SettingRecord } from "../../../lib/settings";
import { listSettings, setSetting, unsetSetting } from "../../../lib/settings";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Icon from "../../../common/components/Icon";
import { SearchField } from "../../../common/components/SearchField";
import "./SandboxSettings.css";

/**
 * Settings → Sandbox settings: a generic editor over every record the
 * installed CLI reports (`sbx settings ls --json`). Sandy renders the
 * CLI's keys, types, defaults, and sources verbatim — no key list is
 * maintained here, so future CLI settings appear without app changes.
 */
export default function SandboxSettings() {
  const [settings, setSettings] = useState<SettingRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Unapplied text edits per key; booleans apply immediately.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await listSettings());
    } catch (failure) {
      setError(String(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(
    () =>
      (settings ?? []).filter((setting) =>
        `${setting.key} ${setting.description}`.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [settings, filter],
  );

  const apply = async (setting: SettingRecord, reset: boolean) => {
    if (busyKey) return;
    setBusyKey(setting.key);
    setError(null);
    try {
      if (reset) {
        await unsetSetting(setting.key);
      } else {
        let value: unknown;
        if (setting.type === "bool") {
          value = setting.value !== true;
        } else {
          const raw = drafts[setting.key] ?? "";
          value =
            setting.type === "json"
              ? parseJson(raw)
              : setting.type === "int" || setting.type === "float"
                ? parseNumber(raw, setting.type)
                : raw;
        }
        await setSetting(setting.key, value);
      }
      await refresh();
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[setting.key];
        return next;
      });
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusyKey(null);
    }
  };

  const draftFor = (setting: SettingRecord) => {
    const draft = drafts[setting.key];
    if (draft !== undefined) return draft;
    if (setting.error) return "";
    if (setting.type === "json") return JSON.stringify(setting.value ?? null, null, 2);
    if (setting.value === undefined || setting.value === null) return "";
    return String(setting.value);
  };

  return (
    <section className="pane-section" aria-busy={loading}>
      <p className="paneintro">
        Every setting the installed <code>sbx</code> CLI reports, with its type, source, and
        default. Environment variables take precedence over user overrides.
      </p>
      <div className="split pane-toolbar">
        <SearchField
          value={filter}
          onChange={setFilter}
          placeholder="Filter settings…"
          label="Filter settings"
          wide
          className="pane-search"
        />
        <button type="button" className="btn small" onClick={() => void refresh()} disabled={loading}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>
      {error && (
        <ErrorBanner
          title="The settings change could not be applied."
          actionLabel={settings === null ? "Try again" : undefined}
          onAction={settings === null ? () => void refresh() : undefined}
        >
          <p>{error}</p>
        </ErrorBanner>
      )}
      {loading && settings === null && (
        <p className="statusline" role="status">
          <span className="spinner" /> Reading sandbox settings…
        </p>
      )}
      {settings !== null && settings.length === 0 && (
        <p className="note">
          The CLI reported no settings. Check that <code>sbx</code> is installed and its daemon is
          reachable, then refresh.
        </p>
      )}
      <div className="settinglist">
        {visible.map((setting) => (
          <SettingRow
            key={setting.key}
            setting={setting}
            busy={busyKey === setting.key || (busyKey !== null && busyKey !== setting.key)}
            draft={draftFor(setting)}
            onDraft={(value) => setDrafts((previous) => ({ ...previous, [setting.key]: value }))}
            onApply={(reset) => void apply(setting, reset)}
          />
        ))}
        {settings !== null && filter && visible.length === 0 && (
          <p className="note">No settings match “{filter}”.</p>
        )}
      </div>
    </section>
  );
}

function parseJson(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Enter a JSON object or array as documented for this key.");
  }
  return parsed;
}

function parseNumber(raw: string, kind: "int" | "float"): number {
  const value = kind === "int" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  if (Number.isNaN(value)) throw new Error(`Enter a number for this ${kind} setting.`);
  if (kind === "int" && !Number.isInteger(value)) {
    throw new Error("Enter a whole number for this int setting.");
  }
  return value;
}

function SettingRow({
  setting,
  busy,
  draft,
  onDraft,
  onApply,
}: {
  setting: SettingRecord;
  /** This row's request, or any in-flight request that locks the editor. */
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onApply: (reset: boolean) => void;
}) {
  const overridden = setting.source === "override";
  const dirty = setting.type !== "bool" && draft !== defaultValueText(setting);
  return (
    <article className="setting">
      <div className="settinginfo">
        <strong>{setting.key}</strong>
        <p>{setting.description}</p>
        <div className="actions settingbadges">
          <span className="badge">{setting.type}</span>
          <span className="badge violet">{setting.source}</span>
          {setting.requires_restart && <span className="badge">daemon restart</span>}
          {setting.env_var && <span className="badge">{setting.env_var}</span>}
        </div>
      </div>
      <div className="settingcontrols">
        {setting.error ? (
          <p className="help setting-error">{setting.error}</p>
        ) : setting.type === "bool" ? (
          <div className="actions settingbool">
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={setting.value === true}
              aria-label={setting.key}
              disabled={busy}
              onClick={() => onApply(false)}
            >
              <span />
            </button>
            <button
              type="button"
              className="btn small"
              disabled={busy || !overridden}
              onClick={() => onApply(true)}
            >
              Reset
            </button>
          </div>
        ) : setting.options ? (
          <select
            aria-label={setting.key}
            disabled={busy}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
          >
            {setting.options.map((option) => (
              <option key={option} value={option}>
                {option || "Not decided"}
              </option>
            ))}
          </select>
        ) : setting.type === "json" ? (
          <textarea
            className="fieldcontrol settingvalue"
            aria-label={setting.key}
            rows={3}
            disabled={busy}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
          />
        ) : (
          <input
            className="fieldcontrol settingvalue"
            aria-label={setting.key}
            type={setting.type === "int" || setting.type === "float" ? "number" : "text"}
            step={setting.type === "int" ? 1 : "any"}
            disabled={busy}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
          />
        )}
        {setting.type !== "bool" && !setting.error && (
          <div className="actions settingapply">
            <button
              type="button"
              className="btn small"
              disabled={busy || !dirty}
              onClick={() => onApply(false)}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn small"
              disabled={busy || !overridden}
              onClick={() => onApply(true)}
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function defaultValueText(setting: SettingRecord) {
  if (setting.value === undefined || setting.value === null) return "";
  if (setting.type === "json") return JSON.stringify(setting.value, null, 2);
  return String(setting.value);
}
