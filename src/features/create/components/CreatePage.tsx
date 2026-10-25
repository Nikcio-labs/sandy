import { useId } from "react";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Providers from "../../settings/components/Providers";
import { useCreateFlow } from "../hooks/useCreateFlow";
import { DiscoveryStep } from "./DiscoveryStep";
import { AgentStep } from "./AgentStep";
import { MixinStep } from "./MixinStep";
import { ReviewStep } from "./ReviewStep";
import { FinishedPanel } from "./FinishedPanel";
import { RecipeAside } from "./RecipeAside";

export interface CreatePageProps {
  onClose: () => void;
  onTemplates?: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** Present when the wizard edits an existing template instead of creating one. */
  templateId?: string;
}

const STEPS = ["Providers", "Agent or workload", "Mixins & inputs", "Project & review"];

export default function CreatePage({ onClose, onTemplates, onBusyChange, templateId }: CreatePageProps) {
  const id = useId();
  const flow = useCreateFlow({ onBusyChange, templateId });
  const {
    editing,
    step,
    moveTo,
    busy,
    error,
    providers,
    catalog,
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

  return (
    <section className="standalone-page catalog-page" aria-labelledby={`${id}-title`} aria-busy={busy !== null}>
      <header className="pagehead sectionhead catalog-page-heading">
        <div>
          <span className="eyebrow">
            {editing ? "EDIT SAVED TEMPLATE" : "YOUR NEXT WORKSPACE"}
          </span>
          <h1 id={`${id}-title`}>
            {saved ? "Your template is ready" : editing ? "Edit template" : "Create a sandbox"}
          </h1>
          <p className="help">
            {saved
              ? "A reusable starting point, saved on your computer."
              : editing
                ? "Change the kits, inputs, or project, then save the same template again."
                : "Choose your tools. Bring your project. Make it yours."}
          </p>
        </div>
        <button type="button" className="btn" disabled={busy !== null} onClick={onClose}>
          <Icon name="close" size={16} /> {saved ? "Close" : "Cancel"}
        </button>
      </header>
      {!saved && (
        <ol className="steps" aria-label="Sandbox creation steps">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className={`${step === index ? "current" : ""} ${step > index ? "complete" : ""}`.trim() || undefined}
                aria-current={step === index ? "step" : undefined}
                disabled={busy !== null || index > step}
                onClick={() => moveTo(index)}
              >
                <span className="step-number">
                  {step > index ? <Icon name="check" size={14} /> : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <ErrorBanner
          title={saved ? "Launch needs attention." : "We couldn’t complete that step."}
          actionLabel={step === 0 && !saved ? "Retry discovery" : undefined}
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
        />
      ) : (
        <>
          {step === 0 && (
            <div className="panel catalog-panel">
              <h2>Start with your kit sources</h2>
              <p className="help intro">
                Enable the providers you want to use and choose their versions. Discovery reads kit
                descriptors from those saved references.
              </p>
              <Providers
                disabled={busy !== null}
                onChange={onProvidersChange}
              />
              {providers && (
                <DiscoveryStep
                  providers={providers}
                  busy={busy !== null}
                  onDiscover={() => void discover()}
                  onDiscoverRefresh={() => void discover(true)}
                />
              )}
            </div>
          )}
          {step > 0 && !catalog && (
            <div className="panel catalog-panel">
              <p className="help intro">
                No discovery results. Review your kit sources and discover kits again.
              </p>
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null}
                onClick={() => moveTo(0)}
              >
                Review kit sources
              </button>
            </div>
          )}
          {step > 0 && catalog && (
            <>
              {catalog.warnings.length > 0 && (
                <details className="warnings" open>
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
                    onClick={() => moveTo(0)}
                  >
                    Review sources and retry discovery
                  </button>
                </details>
              )}
              <div className="wizardgrid">
                <div>
                  {step === 1 && (
                    <AgentStep
                      agents={agents}
                      agent={agent}
                      search={agentSearch}
                      onSearch={setAgentSearch}
                      onSelect={selectAgent}
                      onBack={() => moveTo(0)}
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
                <RecipeAside agent={agent} mixins={mixins} workspace={workspace} mountless={mountless} />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
