import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionInfo, SandboxInfo } from "../../../lib/sandbox";
import { connectionInfo } from "../../../lib/sandbox";
import { stateKind } from "../../../common/lib/sandboxState";
import Icon from "../../../common/components/Icon";
import { copyText } from "../../../common/lib/clipboard";
import { ConnectionMethods } from "./ConnectionMethods";
import { EditorSteps } from "./EditorSteps";
import { ServerInfo } from "./ServerInfo";
import type { Method } from "./ConnectionMethods";
import type { Feedback } from "./ServerInfo";
import "./ConnectDialog.css";

export interface ConnectDialogProps {
  sandbox: SandboxInfo;
  onOpenTerminal: () => Promise<void>;
  onClose: () => void;
}

export default function ConnectDialog({
  sandbox,
  onOpenTerminal,
  onClose,
}: ConnectDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const terminalButton = useRef<HTMLButtonElement>(null);
  const operation = useRef(false);
  const infoRequest = useRef(0);
  const [method, setMethod] = useState<Method>("terminal");
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [busy, setBusy] = useState<"terminal" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const running = stateKind(sandbox.state) === "running";

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    // The primary action, rather than the close button, is the default target.
    if (!terminalButton.current?.disabled) terminalButton.current?.focus();
    return () => node?.close();
  }, []);

  const loadInfo = useCallback(async () => {
    const request = ++infoRequest.current;
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const next = await connectionInfo(sandbox.name);
      if (request === infoRequest.current) setInfo(next);
    } catch (failure) {
      if (request === infoRequest.current) setInfoError(String(failure));
    } finally {
      if (request === infoRequest.current) setLoadingInfo(false);
    }
  }, [sandbox.name]);

  useEffect(() => {
    void loadInfo();
    return () => {
      infoRequest.current += 1;
    };
  }, [loadInfo]);

  const close = () => {
    if (!operation.current) dialog.current?.close();
  };

  const launchTerminal = async () => {
    if (operation.current || !running) return;
    operation.current = true;
    setBusy("terminal");
    setFeedback(null);
    try {
      await onOpenTerminal();
      setFeedback({
        kind: "success",
        text: `Opened your computer’s terminal for ${sandbox.name}.`,
      });
    } catch (failure) {
      setFeedback({ kind: "error", text: `Couldn’t open a terminal: ${String(failure)}` });
    } finally {
      operation.current = false;
      setBusy(null);
      terminalButton.current?.focus();
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await copyText(text);
      setFeedback({ kind: "success", text: `${label} copied.` });
    } catch (failure) {
      setFeedback({ kind: "error", text: `Couldn’t copy: ${String(failure)}` });
    }
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog connect-dialog"
      aria-labelledby="connect-title"
      aria-describedby="connect-description"
      onClose={(event) => {
        // StrictMode can reopen the dialog before an earlier close event arrives.
        if (!event.currentTarget.open) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      <button
        className="iconbtn dialogclose"
        aria-label="Close connection dialog"
        disabled={!!busy}
        onClick={close}
      >
        <Icon name="close" />
      </button>
      <div className="connect-body">
      <h2 id="connect-title">Open {sandbox.name}</h2>
      <p id="connect-description">Use your native terminal or connect your editor over SSH.</p>

      <ConnectionMethods
        method={method}
        busy={busy !== null}
        onSelect={(next) => {
          setMethod(next);
          setFeedback(null);
        }}
      />

      {!running && (
        <p className="banner">
          This sandbox is not running. Close this dialog and use <strong>Start</strong> in its
          details before connecting.
        </p>
      )}

      <section
        id="connection-method"
        className="connection-method"
        aria-labelledby="connection-method-title"
      >
        {method === "terminal" ? (
          <div className="connectguide">
            <h3 id="connection-method-title">Your sandbox, in a terminal</h3>
            <p>
              Open a Bash session in your computer’s terminal. This uses the sandbox CLI and does
              not require SSH setup.
            </p>
            <button
              ref={terminalButton}
              className="btn primary"
              disabled={!!busy || !running}
              onClick={() => void launchTerminal()}
            >
              {busy === "terminal" ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <Icon name="terminal" size={19} />
              )}
              {busy === "terminal" ? "Opening terminal…" : "Open Terminal"}
            </button>
          </div>
        ) : (
          <>
            <h3 id="connection-method-title">
              Connect with {method === "opencode" ? "OpenCode Desktop" : "VS Code"}
            </h3>
            <EditorSteps method={method} info={info} sandboxName={sandbox.name} />
          </>
        )}
      </section>

      <ServerInfo
        info={info}
        loading={loadingInfo}
        error={infoError}
        busy={busy !== null}
        onReload={() => void loadInfo()}
        onCopy={copy}
      />

      <div className="connection-feedback" aria-live="polite" aria-atomic="true">
        {feedback && (
          <p className={feedback.kind} role={feedback.kind === "error" ? "alert" : "status"}>
            <Icon name={feedback.kind === "success" ? "check" : "help"} size={19} />
            {feedback.text}
          </p>
        )}
      </div>
      </div>

      <div className="dialogfoot">
        <button type="button" className="btn" disabled={!!busy} onClick={close}>
          Done
        </button>
      </div>
    </dialog>
  );
}
