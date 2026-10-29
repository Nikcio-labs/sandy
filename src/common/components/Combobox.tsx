import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import Icon from "./Icon";
import "./Combobox.css";

/**
 * A typeable dropdown: a text input with the app-styled option popup.
 * Neither half is covered by native controls — a `<select>` cannot be typed
 * into, and a `<datalist>` popup is browser chrome that cannot match the
 * app's selects. Fully custom text is always accepted; the caller validates
 * the final value.
 */
export function Combobox({
  value,
  onChange,
  options,
  renderOption,
  placeholder,
  label,
  disabled,
  emptyHint,
  describedBy,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** Label override for an option (e.g. "global" → "Global — every sandbox"). */
  renderOption?: (option: string) => string;
  placeholder: string;
  /** Accessible name for the input and its popup. */
  label: string;
  disabled?: boolean;
  /** Shown when the open popup has no matches for the typed text. */
  emptyHint?: string;
  /** id of an element describing the input (e.g. the field's help text). */
  describedBy?: string;
  /** Ref for focusing the input from outside (dialog open autofocus). */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const show = renderOption ?? ((option: string) => option);
  // The same value can arrive from several sources (a name stored in many
  // scopes, a sandbox that already has secrets); the popup shows it once.
  const unique = useMemo(() => [...new Set(options)], [options]);

  const needle = value.trim().toLowerCase();
  const matches = needle
    ? unique.filter((option) => option.toLowerCase().includes(needle))
    : unique;

  // Keep the highlight inside the shrinking (or empty) match list.
  useEffect(() => {
    if (active >= matches.length) setActive(Math.max(matches.length - 1, 0));
  }, [matches.length, active]);

  // A pointerdown anywhere else closes the popup; outside clicks must not
  // race the option's own pointerdown selection.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      // A highlighted match is chosen; without one, Enter falls through to
      // the surrounding form/dialog.
      if (matches[active] !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        pick(matches[active]);
      }
    } else if (event.key === "Escape") {
      // The popup closes first; a second Escape reaches the dialog.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="combobox" ref={root}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          open && matches[active] !== undefined ? `${id}-option-${active}` : undefined
        }
        aria-autocomplete="list"
        aria-label={label}
        aria-describedby={describedBy}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={keyDown}
      />
      <Icon name="chevron-right" size={14} className="comboboxchevron" />
      {open && (
        <ul className="comboboxlist" role="listbox" id={`${id}-list`} aria-label={label}>
          {matches.map((option, index) => (
            <li
              key={option}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option === value}
              className={index === active ? "active" : undefined}
              // preventDefault keeps the input focused so the popup's
              // keyboard model survives a mouse pick.
              onPointerDown={(event) => {
                event.preventDefault();
                pick(option);
              }}
              onPointerEnter={() => setActive(index)}
            >
              {show(option)}
            </li>
          ))}
          {matches.length === 0 && <li className="comboboxempty">{emptyHint}</li>}
        </ul>
      )}
    </div>
  );
}
