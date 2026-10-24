import Icon from "../../../common/components/Icon";

/**
 * The discovery trigger below the provider editor. Unsaved provider changes
 * are persisted by discovery itself, so they don't block the action.
 */
export function DiscoveryStep({
  providers,
  busy,
  onDiscover,
}: {
  providers: { enabled: boolean }[];
  busy: boolean;
  onDiscover: () => void;
}) {
  return (
    <div className="catalog-actions">
      <button
        type="button"
        className="primary"
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
      <span className="catalog-help">
        Only kits with supported metadata will be offered. Unsaved provider changes are saved
        when you discover.
      </span>
    </div>
  );
}
