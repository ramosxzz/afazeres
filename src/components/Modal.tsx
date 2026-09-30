import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  kanji?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, kanji, children, footer, wide }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>("[autofocus], input, textarea, select, button");
      first?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true">
        {kanji && <div className="modal-kanji" aria-hidden="true">{kanji}</div>}
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function confirmDialog(message: string) {
  return window.confirm(message);
}
