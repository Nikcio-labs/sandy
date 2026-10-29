import type { KitOption } from "../../../lib/catalog";

export function KitCard({ kit }: { kit: KitOption }) {
  // The backend's synthesized built-in descriptions end in " (v2)"; the kit
  // format is not a choice the user makes, so it never reads it.
  const description = kit.description.replace(/\s*\(v2\)$/, "");
  return (
    <span className="option-body kitcard">
      <span className="option-title">
        <strong>{kit.name}</strong>
        {kit.provider_id === "builtin" && <span className="badge soft">Included</span>}
        {kit.required_agent && <span className="kitcard-note">for {kit.required_agent}</span>}
      </span>
      <span className="kitcard-description">{description}</span>
    </span>
  );
}
