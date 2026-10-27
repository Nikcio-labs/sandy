import { useId } from "react";
import type { KitOption } from "../../../lib/catalog";
import Icon from "../../../common/components/Icon";
import { SearchField } from "../../../common/components/SearchField";
import { KitDetails } from "./KitDetails";

export function AgentStep({
  agents,
  agent,
  search,
  onSearch,
  onSelect,
  onBack,
  onContinue,
  onReviewSources,
}: {
  agents: KitOption[];
  agent: KitOption | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (kit: KitOption) => void;
  onBack: () => void;
  onContinue: () => void;
  onReviewSources: () => void;
}) {
  const id = useId();
  return (
    <div className="panel catalog-panel">
      <h2>Choose an agent or workload</h2>
      <p className="help intro">
        Built-in agent shortcuts use kit v2. A v3 workload starts a v3-only environment. Remote kit
        sources below come from discovered descriptors.
      </p>
      <SearchField
        id={`${id}-agent-search`}
        value={search}
        onChange={onSearch}
        placeholder="Search agents and workloads…"
        label="Search agents and workloads"
        wide
      />
      {([2, 3] as const).map((version) => {
        const items = agents.filter((kit) => kit.schema_version === version);
        return (
          items.length > 0 && (
            <fieldset className="catalog-unframed catalog-choice-group" key={version}>
              <legend>{version === 2 ? "Kit v2 agents" : "Kit v3 workloads"}</legend>
              <div className="options">
                {items.map((kit) => (
                  <label className={`option ${agent?.id === kit.id ? "selected" : ""}`} key={kit.id}>
                    <input
                      type="radio"
                      name={`${id}-agent`}
                      value={kit.id}
                      checked={agent?.id === kit.id}
                      onChange={() => onSelect(kit)}
                    />
                    <KitDetails kit={kit} />
                  </label>
                ))}
              </div>
            </fieldset>
          )
        );
      })}
      {!agents.length && (
        <div className="note">
          <h3>
            {search ? "No matching agents or workloads" : "No agents or workloads were discovered"}
          </h3>
          <p>
            {search
              ? "Try a different search."
              : "Review the discovery notes, then check your enabled providers and references."}
          </p>
          <button type="button" className="btn" onClick={() => (search ? onSearch("") : onReviewSources())}>
            {search ? "Clear search" : "Review providers"}
          </button>
        </div>
      )}
      <div className="actionbar">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn primary" disabled={!agent} onClick={onContinue}>
          Choose mixins <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
