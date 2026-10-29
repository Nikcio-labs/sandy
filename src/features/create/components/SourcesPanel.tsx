import Icon from "../../../common/components/Icon";

/**
 * The action footer of the sources step: the retry and the cache bypass.
 * The wizard re-discovers on its own whenever sources change, so this only
 * appears after a failed or empty discovery.
 */
export function SourcesPanel({
  providers,
  busy,
  onDiscover,
  onDiscoverRefresh,
}: {
  providers: { enabled: boolean }[];
  busy: boolean;
  onDiscover: () => void;
  onDiscoverRefresh: () => void;
}) {
  return (
    <div className="actionbar">
      <button
        type="button"
        className="btn primary"
        disabled={busy || !providers.some((provider) => provider.enabled)}
        onClick={onDiscover}
      >
        {busy ? (
          <>
            <span className="spinner" /> Looking for kits…
          </>
        ) : (
          <>
            Try again <Icon name="arrow" size={16} />
          </>
        )}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={onDiscoverRefresh}>
        <Icon name="refresh" size={16} /> Ignore saved results
      </button>
      <span className="help">
        Results are cached per source. “Ignore saved results” asks GitHub again.
      </span>
    </div>
  );
}
