import { useState } from "react";
import type { SetupStatus } from "../../../lib/sandbox";
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
  const [states, setStates] = useState<Record<string, "running" | "done" | "error">>({});
  const [errorOutput, setErrorOutput] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const step = SETUP_STEPS[current];
  const busy = Object.values(states).includes("running");
  const isDone = (item: SetupStep) => item.isDone(status) || states[item.id] === "done";
  const requiredDone = REQUIRED_STEPS.every(isDone);
  const done = isDone(step);
  const failed = states[step.id] === "error" || errorOutput !== null;
  const needsCli = current > 0 && !isDone(SETUP_STEPS[0]);

  // The install step hands off to a terminal and returns immediately, so
  // its button never reports busy; the check decides when it flips done.
  const runsInTerminal = step.id === "install";

  const run = async () => {
    if (busy) return;
    setErrorOutput(null);
    if (runsInTerminal) {
      try {
        await step.run();
      } catch (error) {
        setErrorOutput(String(error));
      }
      void onCheckSetup().then(() => onStepDone?.(step.id));
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

  const jumpTo = (index: number) => {
    setCurrent(index);
    setFinished(false);
    setErrorOutput(null);
  };

  const next = () => {
    if (current === SETUP_STEPS.length - 1) setFinished(true);
    else setCurrent((value) => value + 1);
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
              disabled={busy}
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
        <div className="panel step-card" aria-busy={busy}>
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
            ) : done ? (              <p className="step-note success">
                <Icon name="check" size={18} />
                {states[step.id] === "done" || runsInTerminal
                  ? "Done — you’re good to go."
                  : "Already set up on this computer. One less thing to do!"}
              </p>
            ) : needsCli ? (
              <p className="step-note">Install the CLI in step 1 before running this step.</p>
            ) : null}
          </div>
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
                disabled={busy}
                onClick={() => {
                  setCurrent((value) => value - 1);
                  setErrorOutput(null);
                }}
              >
                Back
              </button>
            )}
            {done && !failed ? (
              <>
                <button className="btn primary" disabled={busy} onClick={next}>
                  {current === SETUP_STEPS.length - 1 ? "Finish setup" : "Continue"}
                  <Icon name="arrow" size={17} />
                </button>
                {!runsInTerminal && (
                  <button className="textbtn" disabled={busy} onClick={run}>
                    Run again
                  </button>
                )}
              </>
            ) : (
              <>
                <button className="btn primary" disabled={busy || needsCli} onClick={run}>
                  {failed ? "Try again" : step.action}
                  <Icon name="arrow" size={17} />
                </button>
                <button
                  className="textbtn"
                  disabled={busy}
                  onClick={() => {
                    setErrorOutput(null);
                    next();
                  }}
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
          <button className="textbtn" disabled={busy} onClick={onDone}>
            Set up later
          </button>
        </div>
      )}
    </section>
  );
}
