import { useEffect, type ReactNode } from 'react';

interface GameOptionsProps {
  readonly title?: string;
  readonly closeLabel?: string;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

/**
 * Lightweight in-match options sheet. Holds the move log, match details and the
 * standard Blockade instructions without letting the game viewport scroll.
 */
export function GameOptions({ title = 'Options', closeLabel = 'Close options', onClose, children }: GameOptionsProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="game-options-backdrop" onClick={onClose}>
      <section
        className="game-options"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="game-options-head">
          <h2>{title}</h2>
          <button type="button" className="game-options-close" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </header>
        <div className="game-options-body">{children}</div>
      </section>
    </div>
  );
}
