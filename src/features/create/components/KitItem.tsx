import type { KitOption } from "../../../lib/catalog";

/**
 * The text body of a selectable kit row. The source string and kit format —
 * meaningful when debugging a template, noise while choosing — stay out of
 * sight; the backend's synthesized built-in descriptions end in " (v2)",
 * which the user never needs to read either.
 */
export function KitItem({ kit }: { kit: KitOption }) {
  const description = kit.description.replace(/\s*\(v2\)$/, "");
  return (
    <span className="kititem-body">
      <span className="kititem-title">
        <strong>{kit.name}</strong>
        {kit.provider_id === "builtin" && <span className="badge soft">Included</span>}
        {kit.required_agent && <span className="kititem-note">for {kit.required_agent}</span>}
      </span>
      <span className="kititem-description">{description}</span>
    </span>
  );
}
