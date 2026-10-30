import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { WallMove } from '@barricade/engine';

export type WallOrientation = 'H' | 'V';

export interface WallDragCandidate {
  readonly r: number;
  readonly c: number;
  readonly valid: boolean;
}

interface UseWallDragOptions {
  readonly size: number;
  readonly orientation: WallOrientation;
  readonly enabled: boolean;
  readonly legalWalls: readonly WallMove[];
  readonly boardRef: RefObject<HTMLDivElement | null>;
  readonly onDrop: (move: WallMove) => void;
  readonly onInvalid: () => void;
  readonly onTap?: () => void;
  readonly onDragStart?: () => void;
  readonly onDragEnd?: () => void;
}

interface InternalDrag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly active: boolean;
  readonly inside: boolean;
  readonly r: number;
  readonly c: number;
}

const MOVE_THRESHOLD = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Pointer-driven drag source for a single barrier piece.
 *
 * One drag at a time: a second pointerdown is ignored until the active drag
 * ends. The piece snaps to the nearest wall lattice point; the candidate is
 * only accepted when it is present in `legalWalls`, so overlapping, crossing
 * or route-sealing barriers can never be dropped. Releasing outside the board
 * cancels the piece instead of placing it.
 */
export function useWallDrag(options: UseWallDragOptions) {
  const [drag, setDrag] = useState<InternalDrag | null>(null);
  const dragRef = useRef<InternalDrag | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const suppressClick = useRef(false);

  const setDragState = useCallback((next: InternalDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const pointOnBoard = useCallback((clientX: number, clientY: number) => {
    const board = optionsRef.current.boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const size = optionsRef.current.size;
    const cell = rect.width / size;
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    const c = clamp(Math.round((clientX - rect.left) / cell) - 1, 0, size - 2);
    const r = clamp(Math.round((clientY - rect.top) / cell) - 1, 0, size - 2);
    return { inside, r, c };
  }, []);

  const start = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!optionsRef.current.enabled) return;
      if (dragRef.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      suppressClick.current = false;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort; window listeners still track the drag.
      }
      setDragState({
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        inside: false,
        r: 0,
        c: 0,
      });
    },
    [setDragState],
  );

  const pointerId = drag?.pointerId ?? null;

  useEffect(() => {
    if (pointerId === null) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const current = dragRef.current;
      if (!current) return;
      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      const active = current.active || distance >= MOVE_THRESHOLD;
      const point = pointOnBoard(event.clientX, event.clientY);
      if (active) event.preventDefault();
      if (!current.active && active) optionsRef.current.onDragStart?.();
      setDragState({
        ...current,
        active,
        inside: point?.inside ?? false,
        r: point?.r ?? current.r,
        c: point?.c ?? current.c,
      });
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const current = dragRef.current;
      setDragState(null);
      if (!current) return;
      if (!current.active) return;
      suppressClick.current = true;
      optionsRef.current.onDragEnd?.();
      if (!current.inside) return;
      const move: WallMove = { kind: 'wall', orientation: optionsRef.current.orientation, r: current.r, c: current.c };
      const valid = optionsRef.current.legalWalls.some(
        (wall) => wall.orientation === move.orientation && wall.r === move.r && wall.c === move.c,
      );
      if (valid) optionsRef.current.onDrop(move);
      else optionsRef.current.onInvalid();
    };

    const onCancel = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      setDragState(null);
      optionsRef.current.onDragEnd?.();
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [pointerId, pointOnBoard, setDragState]);

  const active = Boolean(drag?.active);
  const dragging = Boolean(drag);

  useEffect(() => {
    if (!active) return;
    document.body.classList.add('wall-dragging');
    return () => document.body.classList.remove('wall-dragging');
  }, [active]);

  const candidate: WallDragCandidate | null =
    drag?.active && drag.inside
      ? {
          r: drag.r,
          c: drag.c,
          valid: options.legalWalls.some(
            (wall) => wall.orientation === options.orientation && wall.r === drag.r && wall.c === drag.c,
          ),
        }
      : null;

  const onClick = useCallback(() => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    optionsRef.current.onTap?.();
  }, []);

  return {
    active,
    dragging,
    candidate,
    start,
    onClick,
  };
}
