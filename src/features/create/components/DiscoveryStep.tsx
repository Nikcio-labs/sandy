import Icon from "../../../common/components/Icon";

/**
 * The discovery trigger below the provider editor: the cached "Discover kits"
 * action and the "Fetch fresh" cache bypass. Unsaved provider changes are
 * persisted by discovery itself, so they don't block the action.
 */
export function DiscoveryStep({
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
            <span className="spinner" /> Discovering kits…
          </>
        ) : (
          <>
            Discover kits <Icon name="arrow" size={16} />
          </>
        )}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={onDiscoverRefresh}>
        <Icon name="refresh" size={16} /> Fetch fresh from sources
      </button>
      <span className="help">
        Discovery reuses the last result for these sources without calling GitHub. Use Fetch fresh
        to bypass that cache. Unsaved provider changes are saved when you discover.
      </span>
    </div>
  );
}
