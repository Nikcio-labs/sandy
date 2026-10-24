import { useId, useState } from "react";
import type { Provider } from "../../../lib/catalog";
import { refreshBundledMixins } from "../../../lib/catalog";
import Icon from "../../../common/components/Icon";

/**
 * The discovery trigger below the provider editor: optional Docker Hub query,
 * the "Discover kits" action, and the offline snapshot refresh. The provider
 * editor itself lives in `features/settings`. Unsaved provider changes are
 * persisted by discovery itself, so they don't block the action.
 */
export function DiscoveryStep({
  providers,
  hubQuery,
  onHubQuery,
  busy,
  onDiscover,
}: {
  providers: Provider[];
  hubQuery: string;
  onHubQuery: (value: string) => void;
  busy: boolean;
  onDiscover: () => void;
}) {
  const id = useId();
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNotice(null);
    try {
      const count = await refreshBundledMixins();
      // The catalog in memory predates the reload, so rediscover immediately
      // for the reloaded snapshot to reach the kit list.
      onDiscover();
      setRefreshNotice(`Offline mixins reloaded (${count} kits).`);
    } catch (failure) {
      setRefreshNotice(`Couldn’t reload the offline mixins. ${String(failure)}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {providers.some((provider) => provider.kind === "dockerhub" && provider.enabled) && (
        <label className="catalog-field catalog-hub-query" htmlFor={`${id}-hub-query`}>
          Docker Hub search (optional)
          <input
            id={`${id}-hub-query`}
            value={hubQuery}
            placeholder="Search kits"
            disabled={busy}
            onChange={(event) => onHubQuery(event.target.value)}
          />
          <span className="catalog-help">
            Narrows discovery results, including Docker Hub. Search runs only when you choose
            Discover kits. Specific repositories use their selected reference.
          </span>
        </label>
      )}
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
        <button type="button" className="ghost" disabled={busy || refreshing} onClick={() => void refresh()}>
          {refreshing ? (
            <>
              <span className="spinner" /> Reloading…
            </>
          ) : (
            <>
              <Icon name="refresh" size={16} /> Reload offline mixins
            </>
          )}
        </button>
        <span className="catalog-help">
          Only kits with supported metadata will be offered. Unsaved provider changes are saved
          when you discover. When GitHub blocks discovery, the bundled offline mixins from
          nikcio/docker-sandboxing are offered instead.
        </span>
      </div>
      {refreshNotice && (
        <p className="catalog-help" role="status">
          {refreshNotice}
        </p>
      )}
    </>
  );
}
