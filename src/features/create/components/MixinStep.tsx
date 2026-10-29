import { useId } from "react";
import type { KitArguments, KitOption } from "../../../lib/kit";
import { SearchField } from "../../../common/components/SearchField";
import { KitCard } from "./KitCard";
import { KitInputs } from "./KitInputs";

export function MixinStep({
  agent,
  compatible,
  matchingMixins,
  mixinGroups,
  mixins,
  values,
  search,
  onSearch,
  providerFilter,
  onProviderFilter,
  providerLabel,
  onToggleMixin,
  onRemoveMixin,
  onArgumentChange,
  onBack,
  onContinue,
}: {
  agent: KitOption;
  compatible: KitOption[];
  matchingMixins: KitOption[];
  mixinGroups: string[];
  mixins: KitOption[];
  values: KitArguments;
  search: string;
  onSearch: (value: string) => void;
  providerFilter: string;
  onProviderFilter: (value: string) => void;
  providerLabel: (providerId: string) => string;
  onToggleMixin: (kit: KitOption, checked: boolean) => void;
  onRemoveMixin: (kit: KitOption) => void;
  onArgumentChange: (kitId: string, argument: string, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const id = useId();
  const selectedKits = [agent, ...mixins];
  return (
    <form
      className="panel catalog-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <div className="sectionhead">
        <div>
          <h2>Add tools to {agent.name}</h2>
          <p className="help intro">
            Everything works without extras. Add-ons customize the sandbox.
          </p>
        </div>
        <SearchField
          id={`${id}-mixin-search`}
          value={search}
          onChange={onSearch}
          placeholder="Search add-ons…"
          label="Search add-ons"
        />
      </div>
      {mixinGroups.length > 1 && (
        <label className="field" htmlFor={`${id}-provider-filter`}>
          Source
          <select
            id={`${id}-provider-filter`}
            value={providerFilter}
            onChange={(event) => onProviderFilter(event.target.value)}
          >
            <option value="">All sources</option>
            {[...new Set(compatible.map((kit) => kit.provider_id))].map((providerId) => (
              <option key={providerId} value={providerId}>
                {providerLabel(providerId)}
              </option>
            ))}
          </select>
        </label>
      )}
      {mixinGroups.map((providerId) => (
        <fieldset className="catalog-unframed" key={providerId}>
          <div className="options">
            {matchingMixins
              .filter((kit) => kit.provider_id === providerId)
              .map((kit) => {
                const selected = mixins.some((item) => item.id === kit.id);
                const duplicateName =
                  !selected &&
                  (agent.name === kit.name || mixins.some((item) => item.name === kit.name));
                return (
                  <label className={`option ${selected ? "selected" : ""}`} key={kit.id}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={duplicateName}
                      onChange={(event) => onToggleMixin(kit, event.target.checked)}
                    />
                    <KitCard kit={kit} />
                    {duplicateName && (
                      <span className="help">Same name as a tool already selected.</span>
                    )}
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}
      {!matchingMixins.length && (
        <div className="note">
          <p>
            {compatible.length
              ? "Nothing matches your search."
              : "No add-ons were found for this agent. You can continue without any."}
          </p>
          {search && (
            <button type="button" className="btn" onClick={() => onSearch("")}>
              Clear search
            </button>
          )}
        </div>
      )}
      {mixins.length > 0 && (
        <div className="catalog-selected">
          <h3>Your add-ons</h3>
          <ul>
            {mixins.map((kit) => (
              <li key={kit.id}>
                <span>{kit.name}</span>
                <button
                  type="button"
                  className="textbtn"
                  onClick={() => onRemoveMixin(kit)}
                  aria-label={`Remove ${kit.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <KitInputs kits={selectedKits} values={values} disabled={false} onChange={onArgumentChange} />
      <div className="actionbar">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="btn primary">
          Name your sandbox
        </button>
      </div>
    </form>
  );
}
