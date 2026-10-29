import { useEffect, useId, useRef } from "react";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Sources from "../../settings/components/Sources";
import type { Provider } from "../../../lib/catalog";
import { useCreateFlow } from "../hooks/useCreateFlow";
import { SourcesPanel } from "./SourcesPanel";
import { AgentStep } from "./AgentStep";
import { MixinStep } from "./MixinStep";
import { ReviewStep } from "./ReviewStep";
import { FinishedPanel } from "./FinishedPanel";
import { SelectionChips } from "./SelectionChips";
import "./CreatePage.css";

export interface CreatePageProps {
  onClose: () => void;
  onTemplates?: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** Called with the sandbox name after the wizard launches one. */
  onLaunched?: (sandbox: string) => void;
  /** Present when the wizard edits an existing template instead of creating one. */
  templateId?: string;
  /** Dialog mode: the host dialog owns the close affordance and title. */
  inDialog?: boolean;
}

export default function CreatePage({
  onClose,
  onTemplates,
  onBusyChange,
  onLaunched,
  templateId,
  inDialog = false,
}: CreatePageProps) {
  const id = useId();
  const flow = useCreateFlow({ onBusyChange, templateId, onLaunched });
  const sectionRef = useRef<HTMLElement>(null);
  const {
    editing,
    step,
    moveTo,
    busy,
    error,
    providers,
    catalog,
    setCatalog,
    onProvidersChange,
    discover,
    agents,
    agent,
    agentSearch,
    setAgentSearch,
    selectAgent,
    compatible,
    matchingMixins,
    mixinGroups,
    mixins,
    mixinSearch,
    setMixinSearch,
    providerFilter,
    setProviderFilter,
    providerLabel,
    toggleMixin,
    removeMixin,
    changeArgument,
    inputValid,
    request,
    name,
    setName,
    workspace,
    setWorkspace,
    mountless,
    setMountless,
    savePath,
    setSavePath,
    submit,
    browse,
    saved,
    launched,
    launchOutput,
    copyNotice,
    retryLaunch,
    copy,
  } = flow;

  // A step change swaps the whole panel below the shared heading, and the
  // scroll position belongs to the page (or host dialog), not the step —
  // otherwise a tall step leaves the next one opened mid-scroll. The scroller
  // is the nearest scrollable ancestor (the dialog body in the dialog, .main
  // on the page); the effect skips the first render, where the page is
  // already at the top.
  const stepRef = useRef(step);
  useEffect(() => {
    if (stepRef.current === step) return;
    stepRef.current = step;
    let scroller = sectionRef.current?.parentElement;
    while (scroller) {
      if (scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    scroller?.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const addProvider = (next: Provider[]) => next;

  const title = saved ? "Your sandbox is ready" : editing ? "Edit template" : "Create a sandbox";

  return (
    <section
      ref={sectionRef}
      className={`catalog-page ${inDialog ? "catalog-page-dialog" : "standalone-page"}`}
      aria-labelledby={`${id}-title`}
      aria-busy={busy !== null}
    >
      <header className="pagehead sectionhead catalog-page-heading">
        <div>
          <h1 id={`${id}-title`} className={inDialog ? "catalog-dialog-title" : undefined}>
            {title}
          </h1>
          {!saved && step > 0 && agent && (
            <SelectionChips
              agent={agent}
              mixins={mixins}
              onRemoveMixin={removeMixin}
              onEditAgent={() => moveTo(1)}
            />
          )}
        </div>
        {!inDialog && (
          <button type="button" className="btn" disabled={busy !== null} onClick={onClose}>
            <Icon name="close" size={16} /> {saved ? "Close" : "Cancel"}
          </button>
        )}
        {inDialog && (
          /* Hidden affordance the host dialog presses on Escape so the
             wizard's discard guard still runs. */
          <button
            type="button"
            className="sr-only"
            data-wizard-cancel
            disabled={busy !== null}
            onClick={() => {
              if (saved || step === 0) onClose();
            }}
          >
            Cancel wizard
          </button>
        )}
      </header>
      {error && (
        <ErrorBanner
          title={saved ? "Launch needs attention." : "We couldn’t complete that step."}
          actionLabel={step === 0 && !saved ? "Try again" : undefined}
          disabled={busy !== null || !providers}
          onAction={step === 0 && !saved ? () => void discover() : undefined}
        >
          <p>{error}</p>
        </ErrorBanner>
      )}
      {saved ? (
        <FinishedPanel
          saved={saved}
          launched={launched}
          launchOutput={launchOutput}
          busy={busy !== null}
          error={error}
          copyNotice={copyNotice}
          edited={editing}
          onRetryLaunch={() => void retryLaunch()}
          onCopy={() => void copy()}
          onTemplates={onTemplates}
          onClose={onClose}
          onLaunched={onLaunched}
        />
      ) : (
        <>
          {step === 0 && (
            <div className="panel catalog-panel">
              {busy === "discover" || busy === "load" ? (
                <div className="catalog-discovering">
                  <span className="spinner" />
                  <h2>Finding kits…</h2>
                  <p className="help intro">Reading what your sources offer.</p>
                </div>
              ) : (
                <>
                  <Sources
                    disabled={busy !== null}
                    onChange={onProvidersChange}
                    onAdd={addProvider}
                  />
                  {providers && (
                    <SourcesPanel
                      providers={providers}
                      busy={busy !== null}
                      onDiscover={() => void discover()}
                      onDiscoverRefresh={() => void discover(undefined, true)}
                    />
                  )}
                </>
              )}
            </div>
          )}
          {step > 0 && catalog && (
            <>
              {catalog.warnings.length > 0 && step === 1 && (
                <details className="warnings">
                  <summary>Discovery notes ({catalog.warnings.length})</summary>
                  <ul>
                    {catalog.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="textbtn"
                    disabled={busy !== null}
                    onClick={() => {
                      setAgentSearch("");
                      setCatalog(null);
                    }}
                  >
                    Review sources
                  </button>
                </details>
              )}
              <div>
                {step === 1 && (
                  <AgentStep
                    agents={agents}
                    agent={agent}
                    search={agentSearch}
                    onSearch={setAgentSearch}
                    onSelect={selectAgent}
                    onContinue={() => moveTo(2)}
                    onReviewSources={() => moveTo(0)}
                  />
                )}
                {step === 2 && agent && (
                  <MixinStep
                    agent={agent}
                    compatible={compatible}
                    matchingMixins={matchingMixins}
                    mixinGroups={mixinGroups}
                    mixins={mixins}
                    values={flow.values}
                    search={mixinSearch}
                    onSearch={setMixinSearch}
                    providerFilter={providerFilter}
                    onProviderFilter={setProviderFilter}
                    providerLabel={providerLabel}
                    onToggleMixin={toggleMixin}
                    onRemoveMixin={removeMixin}
                    onArgumentChange={changeArgument}
                    onBack={() => moveTo(1)}
                    onContinue={() => inputValid && moveTo(3)}
                  />
                )}
                {step === 3 && request && agent && (
                  <ReviewStep
                    agent={agent}
                    mixins={mixins}
                    selectedKits={flow.selectedKits}
                    name={name}
                    onName={setName}
                    workspace={workspace}
                    onWorkspace={setWorkspace}
                    mountless={mountless}
                    onMountless={setMountless}
                    savePath={savePath}
                    onSavePath={setSavePath}
                    editing={editing}
                    busy={busy !== null}
                    request={request}
                    onSubmit={(launch) => void submit(launch)}
                    onBrowse={(target) => void browse(target)}
                    onBack={() => moveTo(2)}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
