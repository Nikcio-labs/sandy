import type { ConnectionInfo } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";

export type Feedback = { kind: "success" | "error"; text: string };

export function ServerInfo({
  info,
  loading,
  error,
  busy,
  onReload,
  onCopy,
}: {
  info: ConnectionInfo | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onReload: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <section className="connection-server" aria-labelledby="connection-server-title" aria-busy={loading}>
      <h3 id="connection-server-title">SSH server information</h3>
      {loading && (
        <p className="connection-loading" role="status">
          <span className="spinner" /> Reading connection information…
        </p>
      )}
      {error && (
        <ErrorBanner title="Couldn’t read SSH connection information." onAction={onReload} disabled={loading || busy}>
          <p>{error}</p>
        </ErrorBanner>
      )}
      {info && (
        <div className="command">
          <code>{info.command}</code>
          <button
            className="iconbtn"
            aria-label="Copy SSH command"
            title="Copy SSH command"
            disabled={busy}
            onClick={() => onCopy(info.command, "SSH command")}
          >
            <Icon name="clipboard" size={19} />
          </button>
        </div>
      )}
    </section>
  );
}
