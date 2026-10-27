import type { KitOption } from "../../../lib/kit";

export function KitDetails({ kit }: { kit: KitOption }) {
  return (
    <span className="option-body">
      <span className="option-title">
        <strong>{kit.name}</strong>
        <span className="badge violet">
          Kit v{kit.schema_version} ·{" "}
          {kit.kind === "workload" ? "Workload" : kit.kind === "agent" ? "Agent" : "Mixin"}
        </span>
      </span>
      <span className="help intro">{kit.description || "No description provided."}</span>
      <code className="option-source">{kit.source}</code>
      {kit.required_agent && <span className="help">Requires agent: {kit.required_agent}</span>}
    </span>
  );
}
