import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedTemplate } from "../../../lib/templates";
import { listTemplates, registerTemplate, templateWarnings } from "../../../lib/templates";
import { pickLocalTemplate } from "../../../lib/catalog";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { useMountedRef } from "../../../common/hooks/useMountedRef";
import { useBusyReporting } from "../../../common/hooks/useBusyReporting";
import { Toast, type ToastNotice } from "../../../common/components/Toast";
import { copyText } from "../../../common/lib/clipboard";
import { LaunchDialog } from "./LaunchDialog";
import { DeleteTemplateDialog } from "./DeleteTemplateDialog";
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
  const [selected, setSelected] = useState<SavedTemplate | null>(null);
  const [deleting, setDeleting] = useState<SavedTemplate | null>(null);
  const [adding, setAdding] = useState(false);
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

  const addLocal = async () => {
    if (adding) return;
    setAdding(true);
    setError(null);
    try {
      const path = await pickLocalTemplate();
      if (path) {
        await registerTemplate(path);
        if (mounted.current) {
          setNotice({ kind: "success", text: "Template added from your computer." });
          await refresh();
        }
      }
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      if (mounted.current) setAdding(false);
    }
  };

  const visible = (templates ?? []).filter((template) =>
    `${template.name} ${template.agent} ${template.workspace} ${template.path}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

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
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => void addLocal()}
            >
              <Icon name="folder" size={16} /> <span>Add local template</span>
            </button>
            <button type="button" className="btn primary" onClick={onCreate}>
              <Icon name="create" size={16} /> <span>Create template</span>
            </button>
          </div>
        }
      />
      <section className="panel" aria-busy={loading}>
        <div className="listhead">
          <h2>Saved on this computer</h2>
          {templates !== null && <span className="badge">{templates.length}</span>}
          <label className="search">
            <Icon name="search" size={14} />
            <input
              aria-label="Search templates"
              type="search"
              placeholder="Search templates…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
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
        <div className="templatelist">
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
              <div className="actions">
                <button type="button" className="btn" onClick={() => void addLocal()}>
                  <Icon name="folder" size={16} /> Add local template
                </button>
                <button type="button" className="btn primary" onClick={onCreate}>
                  Create template
                </button>
              </div>
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
                <article className="template" key={template.id}>
                  <div className="split">
                    <div>
                      <h3>{template.name}</h3>
                      <div className="actions templatebadges">
                        <span className="badge">{template.agent}</span>
                        <span className="badge violet">Kit v{template.kit_version}</span>
                        {template.registered && (
                          <span className="badge local">Local file</span>
                        )}
                      </div>
                    </div>
                    <div className="actions">
                      {onEdit && !template.registered && (
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
                        aria-label={
                          template.registered
                            ? `Remove ${template.name} from Sandy`
                            : `Delete ${template.name}`
                        }
                        onClick={(event) => {
                          returnFocus.current = event.currentTarget;
                          setDeleting(template);
                        }}
                      >
                        <Icon name="trash" size={14} /> {template.registered ? "Remove" : "Delete"}
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
                  </div>
                  <dl className="details template-details">
                    <dt>Workspace</dt>
                    <dd>{template.workspace || "None (mountless)"}</dd>
                    <dt>Template file</dt>
                    <dd>
                      <code>{template.path}</code>
                    </dd>
                  </dl>
                  {template.registered && (
                    <p className="help template-note">
                      Registered from a file on this computer. Sandy does not change it; edit the
                      file itself and refresh to pick up your changes.
                    </p>
                  )}
                  <details className="template-output">
                    <summary>Preview saved YAML</summary>
                    <pre aria-label={`Saved YAML for ${template.name}`}>
                      <code>{template.content}</code>
                    </pre>
                    <button
                      type="button"
                      className="textbtn"
                      onClick={() => void copyYaml(template)}
                    >
                      <Icon name="clipboard" size={13} /> Copy YAML
                    </button>
                  </details>
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
      <div className="toasts" aria-live="polite" aria-atomic="true">
        {notice && <Toast notice={notice} onDismiss={() => setNotice(null)} />}
      </div>
    </div>
  );
}
