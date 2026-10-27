import { useEffect, useState } from "react";
import Icon from "./Icon";
import "./Toast.css";

export type ToastNotice = { kind: "success" | "error"; text: string };

export function Toast({ notice, onDismiss }: { notice: ToastNotice; onDismiss: () => void }) {
  // The leaving class plays the CSS exit transition before unmounting.
  const [leaving, setLeaving] = useState(false);

  const dismiss = () => setLeaving(true);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onDismiss, 120);
    return () => clearTimeout(timer);
  }, [leaving, onDismiss]);

  return (
    <div className={`toast ${notice.kind} ${leaving ? "leaving" : ""}`.trim()} role={notice.kind === "error" ? "alert" : "status"}>
      <Icon name={notice.kind === "success" ? "check" : "info"} size={16} />
      <span>{notice.text}</span>
      <button className="iconbtn" aria-label="Dismiss notification" onClick={dismiss}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
