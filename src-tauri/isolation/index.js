// This file runs in the isolation context: a sandboxed iframe that a
// compromised frontend cannot reach, making it the trusted side of the IPC.
// Every message the frontend sends to the Rust core passes through this hook
// first, so it is the place to reject or rewrite calls from a malicious or
// supply-chain-compromised frontend before they can do any harm.
window.__TAURI_ISOLATION_HOOK__ = (payload) => {
  console.log("isolation hook", payload);
  return payload;
};
