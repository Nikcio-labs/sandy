export type Method = "terminal" | "opencode" | "vscode";

const methods: { id: Method; label: string }[] = [
  { id: "terminal", label: "Terminal" },
  { id: "opencode", label: "OpenCode Desktop" },
  { id: "vscode", label: "VS Code" },
];

export function ConnectionMethods({
  method,
  busy,
  onSelect,
}: {
  method: Method;
  busy: boolean;
  onSelect: (method: Method) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="Connection method">
      {methods.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={method === item.id}
          aria-controls="connection-method"
          disabled={busy}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
