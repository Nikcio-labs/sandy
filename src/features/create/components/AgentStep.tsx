import { useId } from "react";
import type { KitOption } from "../../../lib/catalog";
import { SearchField } from "../../../common/components/SearchField";
import { KitItem } from "./KitItem";

export function AgentStep({
  agents,
  agent,
  search,
  onSearch,
  onSelect,
  onContinue,
  onReviewSources,
}: {
  agents: KitOption[];
  agent: KitOption | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (kit: KitOption) => void;
  onContinue: () => void;
  onReviewSources: () => void;
}) {
  const id = useId();
  // Built-ins are the zero-setup choices; a discovery result can shadow a
  // built-in name, and that kit is the more specific one to show.
  const seen = new Set<string>();
  const ordered = agents
    .slice()
    .sort((left, right) => {
      const leftBuiltin = left.provider_id === "builtin" ? 0 : 1;
      const rightBuiltin = right.provider_id === "builtin" ? 0 : 1;
      return leftBuiltin - rightBuiltin || left.name.localeCompare(right.name);
    })
    .filter((kit) => (seen.has(kit.name) ? false : (seen.add(kit.name), true)));
  return (
    <div className="panel catalog-panel">
      <div className="sectionhead">
        <div>
          <h2>What will you build with?</h2>
          <p className="help intro">Pick the coding agent your sandbox runs.</p>
        </div>
        <SearchField
          id={`${id}-agent-search`}
          value={search}
          onChange={onSearch}
          placeholder="Search agents…"
          label="Search agents"
        />
      </div>
      <div className="optionlist" role="radiogroup" aria-label="Agents and workloads">
        {ordered.map((kit) => (
          <label className={`option ${agent?.id === kit.id ? "selected" : ""}`} key={kit.id}>
            <input
              type="radio"
              name={`${id}-agent`}
              value={kit.id}
              checked={agent?.id === kit.id}
              onChange={() => onSelect(kit)}
            />
            <KitItem kit={kit} />
          </label>
        ))}
      </div>
      {!agents.length && (
        <div className="note">
          <h3>{search ? "No matching agents" : "Nothing was found in your sources"}</h3>
          <p>
            {search
              ? "Try a different search."
              : "Check that your sources are reachable, then try again."}
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => (search ? onSearch("") : onReviewSources())}
          >
            {search ? "Clear search" : "Check sources"}
          </button>
        </div>
      )}
      <div className="actionbar">
        <button type="button" className="btn primary" disabled={!agent} onClick={onContinue}>
          {agent ? `Add tools to ${agent.name}` : "Choose an agent to continue"}
        </button>
      </div>
    </div>
  );
}
