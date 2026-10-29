import type { SavedTemplate } from "../../../lib/templates";
import Icon from "../../../common/components/Icon";
import { Avatar } from "../../../common/components/Avatar";
import "./TemplateInspector.css";

export function TemplateInspector({
  template,
  onClose,
  onCopyYaml,
}: {
  template: SavedTemplate;
  onClose: () => void;
  onCopyYaml: () => void;
}) {
  return (
    <aside className="panel templateinspector" aria-label={`Details for ${template.name}`}>
      <div className="templateinshead">
        <button
          type="button"
          className="iconbtn"
          aria-label="Close template details"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
        <Avatar name={template.name} />
        <h2>{template.name}</h2>
        <div className="actions templateinsbadges">
          <span className="badge">{template.agent}</span>
          <span className="badge violet">Kit v{template.kit_version}</span>
        </div>
      </div>
      <div className="templateinsbody">
        <dl className="details templateins-details">
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
    </aside>
  );
}
