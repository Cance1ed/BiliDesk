import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close(): void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  // Play the exit (same path as the entrance) before unmounting.
  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(close, 200);
  }, [close]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, textarea, select, a[href]',
        ) || [],
      );
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [requestClose]);
  return (
    <div
      className="modal-backdrop"
      data-closing={closing ? '' : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭弹窗" onClick={requestClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
