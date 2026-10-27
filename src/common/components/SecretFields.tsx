import { useId, useState } from "react";
import type { KitCredential } from "../../lib/catalog";
import type { LaunchSecret } from "../../lib/templates";
import Icon from "./Icon";
import "./SecretFields.css";

/**
 * Optional secret inputs for the credential services a template's kits
 * declare. Values are stored with `sbx secret set` during launch — either
 * globally or scoped to the new sandbox. Empty fields store nothing: the
 * launch reuses whatever is already in the secret store.
 */
export function SecretFields({
  credentials,
  values,
  onChange,
  disabled,
}: {
  credentials: KitCredential[];
  values: Record<string, LaunchSecret | undefined>;
  onChange: (service: string, secret: LaunchSecret | undefined) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [revealed, setRevealed] = useState<string[]>([]);

  if (!credentials.length) return null;
  const reveal = (service: string) =>
    setRevealed((current) =>
      current.includes(service)
        ? current.filter((name) => name !== service)
        : [...current, service],
    );

  return (
    <div className="secret-fields">
      <p className="help">
        These kits authenticate through the sandbox proxy. Store a secret now, or leave
        everything blank to use what’s already saved on this computer.
      </p>
      {credentials.map((credential) => {
        const secret = values[credential.service];
        const shown = revealed.includes(credential.service);
        return (
          <div className="secret-field" key={credential.service}>
            <label className="field" htmlFor={`${id}-secret-${credential.service}`}>
              {credential.service} secret
              {credential.required && <span className="badge">required by kit</span>}
            </label>
            <div className="path-row secret-input">
              <input
                id={`${id}-secret-${credential.service}`}
                type={shown ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                placeholder="Leave blank to keep the stored value"
                value={secret?.value ?? ""}
                onChange={(event) =>
                  onChange(
                    credential.service,
                    event.target.value
                      ? {
                          service: credential.service,
                          value: event.target.value,
                          sandbox_scoped: secret?.sandbox_scoped ?? true,
                        }
                      : undefined,
                  )
                }
              />
              <button
                type="button"
                className="btn"
                disabled={disabled}
                aria-label={shown ? "Hide secret value" : "Show secret value"}
                onClick={() => reveal(credential.service)}
              >
                <Icon name={shown ? "close" : "search"} size={16} />
              </button>
            </div>
            {secret && (
              <label className="check" htmlFor={`${id}-scope-${credential.service}`}>
                <input
                  id={`${id}-scope-${credential.service}`}
                  type="checkbox"
                  disabled={disabled}
                  checked={secret.sandbox_scoped}
                  onChange={(event) =>
                    onChange(credential.service, {
                      ...secret,
                      sandbox_scoped: event.target.checked,
                    })
                  }
                />
                Only let this sandbox use it
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
