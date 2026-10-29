import type { SavedTemplate } from "../../../lib/templates";
import { Pane } from "../../../common/components/Pane";
import Icon from "../../../common/components/Icon";

/**
 * The template detail pane body, rendered inside the shared Pane chrome:
 * badges, workspace and file details, and the saved YAML preview. The
 * header actions (Launch/Edit/Delete) are passed to Pane so they sit
 * beside the template name.
 */
export function TemplateInspector({
  template,
  onBack,
  onEdit,
  onDelete,
  onLaunch,
  onCopyYaml,
}: {
  template: SavedTemplate;
  onBack: () => void;
  onEdit?: (templateId: string) => void;
  /** The triggering button is passed back so focus can return to it if the template survives. */
  onDelete: (template: SavedTemplate, trigger: HTMLButtonElement) => void;
  onLaunch: (template: SavedTemplate) => void;
  onCopyYaml: () => void;
}) {
  return (
    <Pane
      label={template.name}
      onBack={onBack}
      actions={
        <>
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
        </>
      }
    >
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
    </Pane>
  );
}
