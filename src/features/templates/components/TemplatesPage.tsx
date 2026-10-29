import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedTemplate } from "../../../lib/templates";
import { listTemplates, templateWarnings } from "../../../lib/templates";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { useMountedRef } from "../../../common/hooks/useMountedRef";
import { useBusyReporting } from "../../../common/hooks/useBusyReporting";
import { ToastHost, type ToastNotice } from "../../../common/components/Toast";
import { SearchField } from "../../../common/components/SearchField";
import { copyText } from "../../../common/lib/clipboard";
import { LaunchDialog } from "./LaunchDialog";
import { DeleteTemplateDialog } from "./DeleteTemplateDialog";
import { TemplateInspector } from "./TemplateInspector";
import { PageHead } from "../../../common/components/PageHead";
import "./TemplatesPage.css";

export interface TemplatesPageProps {
  onCreate: () => void;
  /** Opens the edit wizard for the template with this id. */
  onEdit?: (templateId: string) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Called with the new sandbox's name after a successful launch. */
  onLaunched?: (sandbox: string) => void;
}

export default function TemplatesPage({ onCreate, onEdit, onBusyChange, onLaunched }: TemplatesPageProps) {
  const mounted = useMountedRef();
  const [templates, setTemplates] = useState<SavedTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [warningsError, setWarningsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const [search, setSearch] = useState("");
  const [inspected, setInspected] = useState<string | null>(null);
  const [selected, setSelected] = useState<SavedTemplate | null>(null);
  const [deleting, setDeleting] = useState<SavedTemplate | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const loadingLock = useRef(false);
  const generation = useRef(0);

  useBusyReporting(selected !== null, onBusyChange);

  const refresh = useCallback(async () => {
    if (loadingLock.current) return;
    loadingLock.current = true;
    const requestGeneration = generation.current;
    setLoading(true);
    setError(null);
    setWarningsError(null);
    try {
      const [templatesResult, warningsResult] = await Promise.allSettled([
        listTemplates(),
        templateWarnings(),
      ]);
      if (!mounted.current || requestGeneration !== generation.current) return;
      if (templatesResult.status === "fulfilled") {
        setTemplates(templatesResult.value);
      } else {
        setError(String(templatesResult.reason));
      }
      if (warningsResult.status === "fulfilled") {
        setWarnings(warningsResult.value);
      } else {
        setWarningsError(String(warningsResult.reason));
      }
    } finally {
      if (requestGeneration === generation.current) {
        loadingLock.current = false;
        if (mounted.current) setLoading(false);
      }
    }
  }, [mounted]);

  useEffect(() => {
    generation.current += 1;
    loadingLock.current = false;
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  const visible = (templates ?? []).filter((template) =>
    `${template.name} ${template.agent} ${template.workspace} ${template.path}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const detail = visible.find((template) => template.id === inspected) ?? null;

  const copyYaml = async (template: SavedTemplate) => {
    try {
      await copyText(template.content);
      setNotice({ kind: "success", text: "YAML copied" });
    } catch {
      setNotice({ kind: "error", text: "Couldn’t copy the YAML. Select and copy it manually." });
    }
  };

  return (
    <div>
      <PageHead
        title="Templates"
        subtitle="Saved environments. New sandbox, same starting point."
        action={
          <button type="button" className="btn primary" onClick={onCreate}>
            <Icon name="create" size={16} /> <span>Create template</span>
          </button>
        }
      />
      <div className={`templates-board ${detail ? "" : "no-detail"}`}>
        <section className="panel" aria-busy={loading}>
          <div className="listhead">
            <h2>Saved on this computer</h2>
            {templates !== null && <span className="badge">{templates.length}</span>}
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search templates…"
              label="Search templates"
            />
            <button
              type="button"
              className="iconbtn"
              aria-label="Refresh templates"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <Icon name="refresh" size={16} />
            </button>
          </div>
          <div>
            {error && (
              <div className="panelnotice">
                <ErrorBanner
                  title="Couldn’t load saved templates."
                  actionLabel="Try again"
                  disabled={loading}
                  onAction={() => void refresh()}
                >
                  <p>{error}</p>
                </ErrorBanner>
              </div>
            )}
            {warningsError && (
              <div className="panelnotice">
                <ErrorBanner
                  title="Couldn’t check template file warnings."
                  actionLabel="Retry file check"
                  disabled={loading}
                  onAction={() => void refresh()}
                >
                  <p>{warningsError}</p>
                </ErrorBanner>
              </div>
            )}
            {warnings.length > 0 && (
              <details className="warnings" open>
                <summary>Template file warnings ({warnings.length})</summary>
                <p>Some saved files could not be read. Readable templates are still available below.</p>
                <ul>
                  {warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            {loading && templates === null && (
              <div className="empty" role="status">
                <p className="help">
                  <span className="spinner" /> Loading saved templates…
                </p>
              </div>
            )}
            {templates !== null && templates.length === 0 && (
              <div className="empty">
                <span className="avatar">
                  <Icon name="kit" size={22} />
                </span>
                <h3>A starting point worth keeping</h3>
                <p>Save an environment with an agent and compatible mixins, then reuse it here.</p>
                <button type="button" className="btn primary" onClick={onCreate}>
                  Create template
                </button>
              </div>
            )}
            {!!templates?.length && (
              <>
                {!visible.length && (
                  <div className="empty">
                    <span className="avatar sand">
                      <Icon name="search" size={22} />
                    </span>
                    <h3>No matching templates</h3>
                    <p>Try a name, agent, workspace, or file path.</p>
                    <button type="button" className="btn" onClick={() => setSearch("")}>
                      Clear search
                    </button>
                  </div>
                )}
                {visible.map((template) => (
                  <article
                    className={`template ${inspected === template.id ? "inspected" : ""}`}
                    key={template.id}
                  >
                    <button
                      type="button"
                      className="templateselect"
                      aria-label={`Show details for ${template.name}`}
                      aria-pressed={inspected === template.id}
                      onClick={() => setInspected(inspected === template.id ? null : template.id)}
                    >
                      <span className="templateselectinfo">
                        <span className="templatename">{template.name}</span>
                        <span className="actions templatebadges">
                          <span className="badge">{template.agent}</span>
                          <span className="badge violet">Kit v{template.kit_version}</span>
                        </span>
                      </span>
                    </button>
                    <div className="actions templaterowactions">
                      {onEdit && (
                        <button
                          type="button"
                          className="btn small"
                          aria-label={`Edit ${template.name}`}
                          onClick={() => onEdit(template.id)}
                        >
                          <Icon name="edit" size={14} /> Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn small"
                        aria-label={`Delete ${template.name}`}
                        onClick={(event) => {
                          returnFocus.current = event.currentTarget;
                          setDeleting(template);
                        }}
                      >
                        <Icon name="trash" size={14} /> Delete
                      </button>
                      <button
                        type="button"
                        className="btn primary small"
                        aria-label={`Launch ${template.name}`}
                        onClick={() => setSelected(template)}
                      >
                        Launch
                      </button>
                    </div>
                  </article>
                ))}
                {search && (
                  <p className="resultcount" role="status">
                    Showing {visible.length} of {templates.length} templates
                  </p>
                )}
              </>
            )}
          </div>
        </section>
        {detail && (
          <TemplateInspector
            key={detail.id}
            template={detail}
            onClose={() => setInspected(null)}
            onCopyYaml={() => void copyYaml(detail)}
          />
        )}
      </div>
      {selected && (
        <LaunchDialog
          key={selected.id}
          template={selected}
          onLaunched={(text, sandbox) => {
            setNotice({ kind: "success", text });
            // The sandbox exists: show it in the dashboard's inspector.
            onLaunched?.(sandbox);
          }}
          onClose={() => setSelected(null)}
        />
      )}
      {deleting && (
        <DeleteTemplateDialog
          key={deleting.id}
          template={deleting}
          onDeleted={() => void refresh()}
          onClose={() => {
            setDeleting(null);
            returnFocus.current?.focus();
          }}
        />
      )}
      <ToastHost notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
