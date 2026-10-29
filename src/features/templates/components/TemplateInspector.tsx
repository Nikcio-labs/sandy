import type { RefObject } from "react";
import type { SavedTemplate } from "../../../lib/templates";
import Icon from "../../../common/components/Icon";
import "./TemplateInspector.css";

export function TemplateInspector({
  template,
  headRef,
  onBack,
  onEdit,
  onDelete,
  onLaunch,
  onCopyYaml,
}: {
  template: SavedTemplate;
  /** Focus target for the pane's heading, focused on open like the Settings panes. */
  headRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onEdit?: (templateId: string) => void;
  /** The triggering button is passed back so focus can return to it if the template survives. */
  onDelete: (template: SavedTemplate, trigger: HTMLButtonElement) => void;
  onLaunch: (template: SavedTemplate) => void;
  onCopyYaml: () => void;
}) {
  return (
    <section className="panel pane" aria-label={`Details for ${template.name}`}>
      <header className="panehead">
        <button
          type="button"
          className="iconbtn"
          aria-label="Back to templates"
          onClick={onBack}
        >
          <Icon name="back" size={18} />
        </button>
        <h2 tabIndex={-1} ref={headRef}>
          {template.name}
        </h2>
        <div className="panehead-actions">
          <button type="button" className="btn primary" onClick={() => onLaunch(template)}>
            <Icon name="create" size={16} /> Launch
          </button>
          {onEdit && (
            <button type="button" className="btn" onClick={() => onEdit(template.id)}>
              <Icon name="edit" size={14} /> Edit
            </button>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={(event) => onDelete(template, event.currentTarget)}
          >
            <Icon name="trash" size={14} /> Delete
          </button>
        </div>
      </header>
      <div className="panecontent templatepanebody">
        <div className="actions">
          <span className="badge">{template.agent}</span>
          <span className="badge violet">Kit v{template.kit_version}</span>
        </div>
        <dl className="details">
          <dt>Workspace</dt>
          <dd>{template.workspace || "None (mountless)"}</dd>
          <dt>Template file</dt>
          <dd>
            <code>{template.path}</code>
          </dd>
        </dl>
        <pre aria-label={`Saved YAML for ${template.name}`}>
          <code>{template.content}</code>
        </pre>
        <button type="button" className="textbtn" onClick={onCopyYaml}>
          <Icon name="clipboard" size={13} /> Copy YAML
        </button>
      </div>
    </section>
  );
}
