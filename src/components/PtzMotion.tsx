import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { panCrop, zoomCrop } from '../lib/crop';
import { getSessionState, setCrop, subscribeSession } from '../lib/session';
import type { CropRect } from '../types';

type Direction = 'up' | 'down' | 'left' | 'right';
type ZoomDirection = 'in' | 'out';

type PtzMotionContextValue = {
  held: Direction[];
  heldZoom: ZoomDirection[];
  bindDirection: (direction: Direction) => {
    type: 'button';
    className: string | undefined;
    'aria-label': string;
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => void;
  };
  zoom: (direction: ZoomDirection) => void;
};

type PtzMotionProviderProps = {
  children: React.ReactNode;
};

const PtzMotionContext = createContext<PtzMotionContextValue | null>(null);
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const VECTORS: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0]
};
const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right'
};
const ZOOM_DIRECTIONS: ZoomDirection[] = ['out', 'in'];
const KEY_ZOOM: Record<string, ZoomDirection> = {
  q: 'out',
  e: 'in'
};
const TAP_FRACTION = 0.16;
const HOLD_SPEED = 0.62;
const TAP_WINDOW_MS = 170;
const ZOOM_TAP = 0.18;
const ZOOM_HOLD_RATE = 0.9;

export function PtzMotionProvider({ children }: PtzMotionProviderProps) {
  const cropRef = useRef(getSessionState().crop);
  const speedRef = useRef(getSessionState().panZoomSpeed);
  const pointerCounts = useRef<Record<Direction, number>>({ up: 0, down: 0, left: 0, right: 0 });
  const pointerDirections = useRef(new Map<number, Direction>());
  const keys = useRef(new Set<Direction>());
  const zoomKeys = useRef(new Set<ZoomDirection>());
  const frame = useRef<number | null>(null);
  const moved = useRef(0);
  const gestureStartedAt = useRef(0);
  const panGestureOpen = useRef(false);
  const zoomMoved = useRef(0);
  const zoomStartedAt = useRef(0);
  const zoomGestureOpen = useRef(false);
  const [held, setHeld] = useState<Direction[]>([]);
  const [heldZoom, setHeldZoom] = useState<ZoomDirection[]>([]);
  const beginRef = useRef<() => void>(() => undefined);
  const finishRef = useRef<(direction: Direction) => void>(() => undefined);
  const beginZoomRef = useRef<() => void>(() => undefined);
  const finishZoomRef = useRef<(direction: ZoomDirection) => void>(() => undefined);

  useEffect(() => {
    return subscribeSession(() => {
      cropRef.current = getSessionState().crop;
      speedRef.current = getSessionState().panZoomSpeed;
    });
  }, []);

  const directionActive = (direction: Direction) => pointerCounts.current[direction] > 0 || keys.current.has(direction);

  const publishHeld = () => {
    const next = DIRECTIONS.filter(directionActive);
    setHeld((current) => (current.join() === next.join() ? current : next));
    const nextZoom = ZOOM_DIRECTIONS.filter((direction) => zoomKeys.current.has(direction));
    setHeldZoom((current) => (current.join() === nextZoom.join() ? current : nextZoom));
    document.body.classList.toggle('ptz-nudging', next.length > 0 || nextZoom.length > 0);
  };

  const publishCrop = (next: CropRect) => {
    cropRef.current = next;
    setCrop(next);
  };

  const panBy = (dx: number, dy: number) => {
    publishCrop(panCrop(cropRef.current, dx, dy));
  };

  const zoomBy = (scale: number) => {
    publishCrop(zoomCrop(cropRef.current, scale));
  };

  const stopLoop = () => {
    if (frame.current !== null) {
      window.cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  };

  const stepFrame = (dt: number) => {
    let next = cropRef.current;
    let changed = false;
    let x = 0;
    let y = 0;
    for (const direction of DIRECTIONS) {
      if (!directionActive(direction)) {
        continue;
      }

      const [dx, dy] = VECTORS[direction];
      x += dx;
      y += dy;
    }

    if (x !== 0 || y !== 0) {
      const length = Math.hypot(x, y);
      const distance = HOLD_SPEED * speedRef.current * dt;
      next = panCrop(next, (x / length) * next.width * distance, (y / length) * next.height * distance);
      moved.current += distance;
      changed = true;
    }

    let zoomDirection = 0;
    if (zoomKeys.current.has('out')) {
      zoomDirection += 1;
    }
    if (zoomKeys.current.has('in')) {
      zoomDirection -= 1;
    }

    if (zoomDirection !== 0) {
      const rate = ZOOM_HOLD_RATE * speedRef.current * dt;
      next = zoomCrop(next, zoomDirection > 0 ? 1 + rate : Math.max(0.5, 1 - rate));
      zoomMoved.current += rate;
      changed = true;
    }

    if (changed) {
      publishCrop(next);
    }
  };

  const ensureLoop = () => {
    if (frame.current !== null) {
      return;
    }

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepFrame(dt);
      frame.current = window.requestAnimationFrame(tick);
    };
    frame.current = window.requestAnimationFrame(tick);
  };

  const finishGestureIfIdle = (direction: Direction) => {
    if (DIRECTIONS.some(directionActive)) {
      publishHeld();
      return;
    }

    const elapsed = performance.now() - gestureStartedAt.current;
    const tapFraction = TAP_FRACTION * speedRef.current;
    if (panGestureOpen.current && elapsed < TAP_WINDOW_MS && moved.current < tapFraction) {
      const [dx, dy] = VECTORS[direction];
      const remaining = tapFraction - moved.current;
      const current = cropRef.current;
      panBy(dx * current.width * remaining, dy * current.height * remaining);
    }

    panGestureOpen.current = false;
    moved.current = 0;
    if (zoomKeys.current.size === 0) {
      stopLoop();
    }
    publishHeld();
  };

  const beginGestureIfNeeded = () => {
    if (!DIRECTIONS.some(directionActive)) {
      return;
    }

    if (!panGestureOpen.current) {
      panGestureOpen.current = true;
      moved.current = 0;
      gestureStartedAt.current = performance.now();
    }

    ensureLoop();
    publishHeld();
  };

  const beginZoomGesture = () => {
    if (zoomKeys.current.size === 0) {
      return;
    }

    if (!zoomGestureOpen.current) {
      zoomGestureOpen.current = true;
      zoomMoved.current = 0;
      zoomStartedAt.current = performance.now();
    }

    ensureLoop();
    publishHeld();
  };

  const finishZoomGesture = (direction: ZoomDirection) => {
    if (zoomKeys.current.size > 0) {
      publishHeld();
      return;
    }

    if (zoomGestureOpen.current) {
      const elapsed = performance.now() - zoomStartedAt.current;
      const tap = ZOOM_TAP * speedRef.current;
      if (elapsed < TAP_WINDOW_MS && zoomMoved.current < tap) {
        const remaining = tap - zoomMoved.current;
        zoomBy(direction === 'out' ? 1 + remaining : Math.max(0.62, 1 - remaining));
      }

      zoomGestureOpen.current = false;
      zoomMoved.current = 0;
    }

    if (!DIRECTIONS.some(directionActive)) {
      stopLoop();
    }

    publishHeld();
  };

  const pressPointer = (direction: Direction, pointerId: number) => {
    if (pointerDirections.current.has(pointerId)) {
      return;
    }

    pointerDirections.current.set(pointerId, direction);
    pointerCounts.current[direction] += 1;
    beginGestureIfNeeded();
  };

  const releasePointer = (pointerId: number) => {
    const direction = pointerDirections.current.get(pointerId);
    if (!direction) {
      return;
    }

    pointerDirections.current.delete(pointerId);
    pointerCounts.current[direction] = Math.max(0, pointerCounts.current[direction] - 1);
    finishGestureIfIdle(direction);
  };

  beginRef.current = beginGestureIfNeeded;
  finishRef.current = finishGestureIfIdle;
  beginZoomRef.current = beginZoomGesture;
  finishZoomRef.current = finishZoomGesture;

  useEffect(() => {
    const controlKey = (event: KeyboardEvent) => (event.key.length === 1 ? event.key.toLowerCase() : event.key);
    const isTyping = (event: KeyboardEvent) => {
      const target = event.target;
      return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event)) {
        return;
      }

      const key = controlKey(event);
      const direction = KEY_DIRECTIONS[key];
      const zoomDirection = KEY_ZOOM[key];
      if (!direction && !zoomDirection) {
        return;
      }

      event.preventDefault();
      if (event.repeat) {
        return;
      }

      if (direction) {
        if (keys.current.has(direction)) {
          return;
        }

        keys.current.add(direction);
        beginRef.current();
        return;
      }

      if (!zoomDirection || zoomKeys.current.has(zoomDirection)) {
        return;
      }

      zoomKeys.current.add(zoomDirection);
      beginZoomRef.current();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = controlKey(event);
      const direction = KEY_DIRECTIONS[key];
      if (direction && keys.current.has(direction)) {
        keys.current.delete(direction);
        finishRef.current(direction);
      }

      const zoomDirection = KEY_ZOOM[key];
      if (zoomDirection && zoomKeys.current.has(zoomDirection)) {
        zoomKeys.current.delete(zoomDirection);
        finishZoomRef.current(zoomDirection);
      }
    };

    const releaseAll = () => {
      const active = DIRECTIONS.filter((direction) => pointerCounts.current[direction] > 0 || keys.current.has(direction));
      const activeZoom = ZOOM_DIRECTIONS.find((direction) => zoomKeys.current.has(direction));
      keys.current.clear();
      zoomKeys.current.clear();
      pointerCounts.current = { up: 0, down: 0, left: 0, right: 0 };
      pointerDirections.current.clear();
      if (active.length > 0) {
        finishRef.current(active[0]);
      }
      if (activeZoom) {
        finishZoomRef.current(activeZoom);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      stopLoop();
      document.body.classList.remove('ptz-nudging');
    };
  }, []);

  const bindDirection = useCallback((direction: Direction) => ({
    type: 'button' as const,
    className: held.includes(direction) ? 'is-held' : undefined,
    'aria-label':
      direction === 'up' ? 'Tilt up (W)' : direction === 'down' ? 'Tilt down (S)' : direction === 'left' ? 'Pan left (A)' : 'Pan right (D)',
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      pressPointer(direction, event.pointerId);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Holding still pans when the pointer cannot be captured.
      }
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => releasePointer(event.pointerId),
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => releasePointer(event.pointerId),
    onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => releasePointer(event.pointerId)
  }), [held]);

  const zoom = useCallback((direction: ZoomDirection) => {
    const step = ZOOM_TAP * speedRef.current;
    zoomBy(direction === 'out' ? 1 + step : Math.max(0.62, 1 - step));
  }, []);

  const motion = useMemo(() => ({ held, heldZoom, bindDirection, zoom }), [bindDirection, held, heldZoom, zoom]);

  return <PtzMotionContext.Provider value={motion}>{children}</PtzMotionContext.Provider>;
}

export function usePtzMotion() {
  const context = useContext(PtzMotionContext);
  if (!context) {
    throw new Error('PTZ controls must be rendered inside PtzMotionProvider.');
  }

  return context;
}
