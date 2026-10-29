import type { KitOption } from "../../../lib/kit";
import Icon from "../../../common/components/Icon";

/**
 * The wizard's running summary: the environment being assembled, updated
 * as the steps progress.
 */
export function RecipeAside({
  agent,
  mixins,
  workspace,
  mountless,
}: {
  agent: KitOption | null;
  mixins: KitOption[];
  workspace: string;
  mountless: boolean;
}) {
  return (
    <aside className="recipe" aria-label="Environment summary">
      <div className="recipemark">
        <Icon name="box" />
      </div>
      <h3>Your environment</h3>
      <p>
        <strong>{agent ? agent.name : "Choose a workload"}</strong>
      </p>
      <p>{agent ? `Kit format v${agent.schema_version}` : "One agent or workload"}</p>
      {mixins.map((kit) => (
        <p key={kit.id}>
          <Icon name="plus" size={12} /> {kit.name}
        </p>
      ))}
      <p>
        {mountless ? "No host workspace" : workspace.trim() || "Project folder comes next"}
      </p>
      <p>Saved as a reusable environment file. Runs locally, in its own microVM.</p>
    </aside>
  );
}
