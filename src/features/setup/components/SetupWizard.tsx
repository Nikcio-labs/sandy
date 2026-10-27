import { useEffect, useRef, useState } from "react";
import type { SetupStatus } from "../../../lib/sandbox";
import { setupSsh } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import { SETUP_STEPS, REQUIRED_STEPS } from "../../setup/setupSteps";
import type { SetupStep } from "../../setup/setupSteps";
import "./SetupWizard.css";

interface Props {
  status: SetupStatus | null;
  onCheckSetup: () => Promise<SetupStatus | null>;
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
  onStepDone?: (step: string) => void;
}

export default function SetupWizard({ status, onCheckSetup, onDone, onBusyChange, onStepDone }: Props) {
  const [current, setCurrent] = useState(() =>
    Math.max(
      0,
      SETUP_STEPS.findIndex((step) => !step.isDone(status)),
    ),
  );
  const [states, setStates] = useState<Record<string, "running" | "done" | "error" | "opened">>({});
  const [errorOutput, setErrorOutput] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [checking, setChecking] = useState(false);
  /** The automatic post-login SSH setup, and its quiet outcome. */
  const [sshBusy, setSshBusy] = useState(false);
  const [sshFailed, setSshFailed] = useState(false);
  const step = SETUP_STEPS[current];
  const busy = Object.values(states).includes("running");
  const isDone = (item: SetupStep) => item.isDone(status) || states[item.id] === "done";
  const requiredDone = REQUIRED_STEPS.every(isDone);
  const done = isDone(step);
  const failed = states[step.id] === "error" || errorOutput !== null;
  // The install step hands off to a terminal and returns immediately, so
  // its button never reports busy; the check decides when it flips done.
  const runsInTerminal = step.id === "install";
  const terminalOpened = states[step.id] === "opened";
  // `sbx` commands only work once the user has signed in (step 2).
  const signedIn = !!status?.signed_in || states.login === "done";
  const needsCli = current > 0 && !isDone(SETUP_STEPS[0]);
  const loginStep = SETUP_STEPS.find((item) => item.id === "login")!;
  const loginDone = isDone(loginStep);

  // SSH setup is not a wizard step: it needs an authenticated CLI (so it
  // cannot run in the install terminal), but it needs no decisions from
  // the user. Once sign-in completes, run it once, quietly in the
  // background; a failure only surfaces in Settings, where it can be
  // retried.
  const sshAttempted = useRef(false);
  useEffect(() => {
    if (!loginDone || sshAttempted.current) return;
    sshAttempted.current = true;
    setSshBusy(true);
    setupSsh()
      .then(() => setSshFailed(false))
      .catch(() => setSshFailed(true))
      .finally(() => setSshBusy(false));
  }, [loginDone]);

  const run = async () => {
    if (busy || checking) return;
    setErrorOutput(null);
    if (runsInTerminal) {
      // The install runs in a visible terminal: sudo and winget prompts
      // need a real console the user can answer, so Sandy cannot capture
      // it. The check decides when the step flips done.
      try {
        await step.run();
        setStates((previous) => ({ ...previous, [step.id]: "opened" }));
      } catch (error) {
        setErrorOutput(String(error));
      }
      return;
    }
    setStates((previous) => ({ ...previous, [step.id]: "running" }));
    onBusyChange(true);
    try {
      await step.run();
      await onCheckSetup();
      onStepDone?.(step.id);
      setStates((previous) => ({ ...previous, [step.id]: "done" }));
    } catch (error) {
      setStates((previous) => ({ ...previous, [step.id]: "error" }));
      setErrorOutput(String(error));
    } finally {
      onBusyChange(false);
    }
  };

  /** Re-run the setup check after a terminal-driven step may have finished. */
  const checkNow = async () => {
    if (checking || busy) return;
    setChecking(true);
    setErrorOutput(null);
    try {
      const next = await onCheckSetup();
      onStepDone?.(step.id);
      if (next && step.isDone(next)) {
        setStates((previous) => ({ ...previous, [step.id]: "done" }));
      }
    } catch (error) {
      setErrorOutput(String(error));
    } finally {
      setChecking(false);
    }
  };

  const jumpTo = (index: number) => {
    setCurrent(index);
    setFinished(false);
    setErrorOutput(null);
  };

  const next = () => {
    if (current === SETUP_STEPS.length - 1) setFinished(true);
    else jumpTo(current + 1);
  };

  return (
    <section className="setup-flow" aria-labelledby="setup-title">
      <h2 id="setup-title">Setup</h2>
      <ol className="steps" aria-label="Setup steps">
        {SETUP_STEPS.map((item, index) => (
          <li key={item.id}>
            <button
              className={`${current === index && !finished ? "current" : ""} ${isDone(item) ? "complete" : ""}`.trim() || undefined}
              aria-current={current === index && !finished ? "step" : undefined}
              aria-label={`Step ${index + 1}: ${item.label}`}
              disabled={busy || checking}
              onClick={() => jumpTo(index)}
            >
              <span className="step-number">
                {isDone(item) ? <Icon name="check" size={16} /> : index + 1}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {finished ? (
        <div className="panel setup-finish">
          <span className={`empty-icon ${requiredDone ? "green" : ""}`}>
            <Icon name={requiredDone ? "check" : "shield"} size={34} />
          </span>
          <h3>
            {requiredDone
              ? "You’re all set"
              : `${REQUIRED_STEPS.filter((item) => !isDone(item)).length} step${
                  REQUIRED_STEPS.filter((item) => !isDone(item)).length === 1 ? "" : "s"
                } left for later`}
          </h3>
          <p>
            {requiredDone
              ? "Your sandbox tools are configured and ready to use."
              : "You can use Sandy now; the remaining steps can wait."}
          </p>
          <div className="actionbar">
            <button className="btn primary" onClick={onDone}>
              Start using Sandy <Icon name="arrow" size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className="panel step-card" aria-busy={busy || checking}>
          <h3>{step.title}</h3>
          <p className="step-description">{step.description}</p>
          {step.guide && (
            <ul className="step-guide">
              {step.guide.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="step-feedback" aria-live="polite">
            {failed ? (
              <p className="step-note failure">
                Something didn’t go through. You can try again.
              </p>
            ) : done ? (
              <p className="step-note success">
                <Icon name="check" size={18} />
                {states[step.id] === "done" || runsInTerminal
                  ? "Done — you’re good to go."
                  : "Already set up on this computer. One less thing to do!"}
              </p>
            ) : needsCli ? (
              <p className="step-note">Install the CLI in step 1 before running this step.</p>
            ) : null}
          </div>
          {/* The automatic SSH setup runs right after sign-in; its result is
              worth a line, but never a step of its own. */}
          {current === SETUP_STEPS.indexOf(loginStep) && (
            <p className="step-note" role="status">
              {sshBusy ? (
                <>
                  <span className="spinner" /> Setting up SSH access…
                </>
              ) : sshFailed ? (
                <>
                  <Icon name="info" size={16} /> SSH setup couldn’t finish. You can run
                  <code> sbx setup ssh</code> later.
                </>
              ) : isDone(loginStep) && status?.ssh_set_up ? (
                <>
                  <Icon name="check" size={16} /> SSH access is set up.
                </>
              ) : null}
            </p>
          )}
          {errorOutput && (
            <details className="step-output failure" open>
              <summary>View error details</summary>
              <pre>{errorOutput}</pre>
            </details>
          )}
          <div className="actionbar">
            {current > 0 && (
              <button
                className="btn"
                disabled={busy || checking}
                onClick={() => {
                  setCurrent((value) => value - 1);
                  setErrorOutput(null);
                }}
              >
                Back
              </button>
            )}
            {runsInTerminal ? (
              <>
                <button
                  className={`btn ${terminalOpened ? "" : "primary"}`}
                  onClick={run}
                >
                  {terminalOpened ? "Reopen install" : step.action}
                  <Icon name="terminal" size={16} />
                </button>
                <button
                  className="btn"
                  disabled={checking}
                  onClick={() => void checkNow()}
                >
                  {checking ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
                  {checking ? "Checking…" : "Check install"}
                </button>
              </>
            ) : done && !failed ? (
              <>
                <button className="btn primary" disabled={busy || checking} onClick={next}>
                  {current === SETUP_STEPS.length - 1 ? "Finish setup" : "Continue"}
                  <Icon name="arrow" size={17} />
                </button>
                <button className="textbtn" disabled={busy || checking} onClick={run}>
                  Run again
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn primary"
                  disabled={busy || checking || needsCli || (step.requiresLogin && !signedIn)}
                  onClick={run}
                >
                  {busy ? <span className="spinner" /> : null}
                  {failed ? "Try again" : step.action}
                  {!busy && <Icon name="arrow" size={17} />}
                </button>
                <button
                  className="textbtn"
                  disabled={busy || checking}
                  onClick={next}
                >
                  {step.optional ? "Skip for now" : "Decide later"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {!finished && (
        <div className="setup-footer">
          <button className="textbtn" disabled={busy || checking} onClick={onDone}>
            Set up later
          </button>
        </div>
      )}
    </section>
  );
}
