import type { SandboxInfo } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import { Avatar } from "../../../common/components/Avatar";
import { StatePill } from "../../../common/components/StatePill";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { stateKind } from "../../../common/lib/sandboxState";
import type { SandboxAction } from "../sandboxActions";
import "./SandboxList.css";

export function SandboxList({
  sandboxes,
  visible,
  error,
  refreshing,
  installed,
  selected,
  pending,
  actionLabels,
  search,
  onSearch,
  onRefresh,
  onSelect,
  onOpen,
  onCreate,
}: {
  sandboxes: SandboxInfo[] | null;
  visible: SandboxInfo[];
  error: string | null;
  refreshing: boolean;
  installed: boolean;
  selected: string | null;
  pending: Map<string, SandboxAction>;
  actionLabels: Record<SandboxAction, string>;
  search: string;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  /** Passing null deselects and closes the inspector. */
  onSelect: (name: string | null) => void;
  onOpen: (sandbox: SandboxInfo) => void;
  onCreate: () => void;
}) {
  const loading = sandboxes === null;
  return (
    <>
      {/* Refresh failures sit above the panel so the last known rows stay
          visible and recover without replaying the list. */}
      {error && (
        <ErrorBanner
          title="Couldn’t refresh your sandboxes."
          actionLabel="Try again"
          disabled={refreshing}
          onAction={onRefresh}
        >
          <p>{error}</p>
        </ErrorBanner>
      )}
      <section className="panel" aria-label="Local sandboxes" aria-busy={loading || refreshing}>
      <div className="listhead">
        <h2>All sandboxes</h2>
        {sandboxes !== null && <span className="badge">{sandboxes.length}</span>}
        <label className="search">
          <Icon name="search" size={14} />
          <input
            aria-label="Search sandboxes"
            placeholder="Search sandboxes…"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        <button
          className="iconbtn"
          aria-label="Refresh sandboxes"
          title="Refresh sandboxes"
          disabled={refreshing || loading || !installed}
          onClick={onRefresh}
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
      {loading && !error && installed && (
        <div role="status">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="skeleton" key={index} aria-hidden="true">
              <div className="bone face" />
              <div>
                <div className="bone line" />
                <div className="bone line short" />
              </div>
            </div>
          ))}
          <p className="help panelnotice">Loading local sandboxes…</p>
        </div>
      )}
      {!loading && visible.length === 0 && (
        <div className="empty">
          <span className={`avatar ${search ? "sand" : ""}`}>
            <Icon name={search ? "search" : "dune"} size={22} />
          </span>
          <h3>{search ? "No matching sandboxes" : "Room for your next project"}</h3>
          <p>
            {search
              ? "Try another name, agent, or workspace."
              : "Choose an agent and a project folder, or start without a host folder."}
          </p>
          {search ? (
            <button className="btn" onClick={() => onSearch("")}>
              Clear search
            </button>
          ) : (
            <button className="btn primary" onClick={onCreate}>
              Create sandbox
            </button>
          )}
        </div>
      )}
      <div className="rows">
        {visible.map((sandbox) => {
          const running = stateKind(sandbox.state) === "running";
          const busy = pending.has(sandbox.name);
          return (
            <div
              key={sandbox.name}
              className={`row ${selected === sandbox.name ? "selected" : ""}`}
              aria-busy={busy}
            >
              <button
                className="rowselect"
                aria-label={`Show details for ${sandbox.name}`}
                aria-pressed={selected === sandbox.name}
                onClick={() => onSelect(selected === sandbox.name ? null : sandbox.name)}
              >
                <Avatar name={sandbox.name} />
                <span className="rowinfo">
                  <span className="rowname">{sandbox.name}</span>
                  <span className="rowmeta">
                    {sandbox.agent && <span className="agent">{sandbox.agent}</span>}
                    {sandbox.workspace || "No host workspace"}
                  </span>
                </span>
                <StatePill
                  state={sandbox.state}
                  pending={pending.get(sandbox.name) && actionLabels[pending.get(sandbox.name)!]}
                />
              </button>
              <span className="rowaction">
                <button
                  className={`btn small ${running ? "primary" : ""}`}
                  disabled={busy || !installed}
                  aria-label={
                    busy
                      ? `Working on ${sandbox.name}`
                      : `${running ? "Open" : "Start"} ${sandbox.name}`
                  }
                  onClick={() => onOpen(sandbox)}
                >
                  {busy ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : running ? (
                    "Open"
                  ) : (
                    "Start"
                  )}
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {search && sandboxes !== null && (
        <p className="resultcount" role="status" hidden={!search}>
          Showing {visible.length} of {sandboxes.length} sandboxes
        </p>
      )}
    </section>
    </>
  );
}
