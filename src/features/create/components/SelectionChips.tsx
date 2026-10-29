import type { KitOption } from "../../../lib/kit";
import Icon from "../../../common/components/Icon";

/**
 * The running selection as chips under the page title: the one summary the
 * user can glance at from any step, with direct removal and an edit jump.
 */
export function SelectionChips({
  agent,
  mixins,
  onRemoveMixin,
  onEditAgent,
}: {
  agent: KitOption | null;
  mixins: KitOption[];
  onRemoveMixin: (kit: KitOption) => void;
  onEditAgent: () => void;
}) {
  return (
    <div className="chips" aria-label="Your selection">
      {agent ? (
        <button
          type="button"
          className="chip chip-agent"
          title="Change agent"
          onClick={onEditAgent}
        >
          <Icon name="terminal" size={13} /> {agent.name}
        </button>
      ) : (
        <span className="chip chip-empty">No agent yet</span>
      )}
      {mixins.map((kit) => (
        <span className="chip" key={kit.id}>
          {kit.name}
          <button
            type="button"
            className="chip-x"
            aria-label={`Remove ${kit.name}`}
            onClick={() => onRemoveMixin(kit)}
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}
