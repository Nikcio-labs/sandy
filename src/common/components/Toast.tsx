import Icon from "./Icon";

export type ToastNotice = { kind: "success" | "error"; text: string };

export function Toast({ notice, onDismiss }: { notice: ToastNotice; onDismiss: () => void }) {
  return (
    <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <Icon name={notice.kind === "success" ? "check" : "info"} size={16} />
      <span>{notice.text}</span>
      <button className="iconbtn" aria-label="Dismiss notification" onClick={onDismiss}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
