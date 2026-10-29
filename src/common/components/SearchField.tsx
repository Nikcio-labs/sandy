import Icon from "./Icon";

/**
 * The shared search input: a `.search` field with a magnifier icon.
 * `wide` stretches it across the row for toolbar placements.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  id,
  wide,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name; the placeholder alone is not announced reliably. */
  label: string;
  id?: string;
  wide?: boolean;
  /** Extra layout hook (e.g. a toolbar flex rule) beyond the search chrome. */
  className?: string;
}) {
  const classes = ["search", wide ? "wide" : "", className].filter(Boolean).join(" ");
  return (
    <label className={classes}>
      <Icon name="search" size={14} />
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
