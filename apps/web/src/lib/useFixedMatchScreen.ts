import { useEffect } from 'react';

/**
 * Locks the document viewport while a match screen is mounted so the board
 * never scrolls up or down (especially while dragging a barrier). The class is
 * removed on unmount, restoring normal page scrolling.
 */
export function useFixedMatchScreen(active = true): void {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add('match-fixed');
    return () => document.body.classList.remove('match-fixed');
  }, [active]);
}
