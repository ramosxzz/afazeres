import { useStore } from "../store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span className="toast-kanji">{t.kanji ?? (t.tone === "error" ? "✕" : t.tone === "success" ? "◎" : "・")}</span>
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
