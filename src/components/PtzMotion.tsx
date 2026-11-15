import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { drivePtz, holdZoom, nudgePtz, stepZoom, stopPtzMotion, stopZoomMotion } from '../lib/cameras';
import type { DriveDirection } from '../../shared/visca';

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
const TAP_WINDOW_MS = 170;
const LABELS: Record<Direction, string> = { up: 'Tilt up', down: 'Tilt down', left: 'Pan left', right: 'Pan right' };

const vectorFor = (active: (direction: Direction) => boolean) => {
  let x = 0;
  let y = 0;
  if (active('left')) x -= 1;
  if (active('right')) x += 1;
  if (active('up')) y += 1;
  if (active('down')) y -= 1;
  return { x, y };
};

const driveDirection = (x: number, y: number): DriveDirection | null => {
  if (x === 0 && y === 0) return null;
  if (x < 0 && y > 0) return 'upLeft';
  if (x > 0 && y > 0) return 'upRight';
  if (x < 0 && y < 0) return 'downLeft';
  if (x > 0 && y < 0) return 'downRight';
  if (y > 0) return 'up';
  if (y < 0) return 'down';
  return x < 0 ? 'left' : 'right';
};

export function PtzMotionProvider({ children }: PtzMotionProviderProps) {
  const pointerCounts = useRef<Record<Direction, number>>({ up: 0, down: 0, left: 0, right: 0 });
  const pointerDirections = useRef(new Map<number, Direction>());
  const keys = useRef(new Set<Direction>());
  const zoomKeys = useRef(new Set<ZoomDirection>());
  const holdTimer = useRef<number | null>(null);
  const zoomTimer = useRef<number | null>(null);
  const driving = useRef(false);
  const zooming = useRef(false);
  const gestureVector = useRef({ x: 0, y: 0 });
  const [held, setHeld] = useState<Direction[]>([]);
  const [heldZoom, setHeldZoom] = useState<ZoomDirection[]>([]);

  const directionActive = (direction: Direction) => pointerCounts.current[direction] > 0 || keys.current.has(direction);

  const publishHeld = () => {
    const next = DIRECTIONS.filter(directionActive);
    setHeld((current) => (current.join() === next.join() ? current : next));
    const nextZoom = ZOOM_DIRECTIONS.filter((direction) => zoomKeys.current.has(direction));
    setHeldZoom((current) => (current.join() === nextZoom.join() ? current : nextZoom));
    document.body.classList.toggle('ptz-nudging', next.length > 0 || nextZoom.length > 0);
  };

  const syncDrive = () => {
    const vector = vectorFor(directionActive);
    const direction = driveDirection(vector.x, vector.y);
    if (!direction) {
      if (driving.current) {
        driving.current = false;
        void stopPtzMotion();
      }
      return;
    }
    driving.current = true;
    void drivePtz(direction);
  };

  const beginPan = () => {
    gestureVector.current = vectorFor(directionActive);
    publishHeld();
    if (driving.current) {
      syncDrive();
      return;
    }
    if (holdTimer.current !== null) {
      return;
    }
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      syncDrive();
    }, TAP_WINDOW_MS);
  };

  const endPan = () => {
    publishHeld();
    if (DIRECTIONS.some(directionActive)) {
      if (driving.current) {
        syncDrive();
      }
      return;
    }
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      const { x, y } = gestureVector.current;
      if (x !== 0 || y !== 0) {
        void nudgePtz(x, y);
      }
    } else if (driving.current) {
      driving.current = false;
      void stopPtzMotion();
    }
  };

  const syncZoom = () => {
    const zoomIn = zoomKeys.current.has('in');
    const zoomOut = zoomKeys.current.has('out');
    if (zoomIn === zoomOut) {
      if (zooming.current) {
        zooming.current = false;
        void stopZoomMotion();
      }
      return;
    }
    zooming.current = true;
    void holdZoom(zoomIn ? 'tele' : 'wide');
  };

  const beginZoom = () => {
    publishHeld();
    if (zooming.current) {
      syncZoom();
      return;
    }
    if (zoomTimer.current !== null) {
      return;
    }
    zoomTimer.current = window.setTimeout(() => {
      zoomTimer.current = null;
      syncZoom();
    }, TAP_WINDOW_MS);
  };

  const endZoom = (direction: ZoomDirection) => {
    publishHeld();
    if (zoomKeys.current.size > 0) {
      if (zooming.current) {
        syncZoom();
      }
      return;
    }
    if (zoomTimer.current !== null) {
      window.clearTimeout(zoomTimer.current);
      zoomTimer.current = null;
      void stepZoom(direction);
    } else if (zooming.current) {
      zooming.current = false;
      void stopZoomMotion();
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const direction = KEY_DIRECTIONS[event.key];
      const zoomDirection = KEY_ZOOM[event.key];
      if (!direction && !zoomDirection) {
        return;
      }
      event.preventDefault();
      if (direction) {
        if (keys.current.has(direction)) {
          return;
        }
        keys.current.add(direction);
        beginPan();
      }
      if (zoomDirection) {
        if (zoomKeys.current.has(zoomDirection)) {
          return;
        }
        zoomKeys.current.add(zoomDirection);
        beginZoom();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.key];
      if (direction && keys.current.delete(direction)) {
        endPan();
      }
      const zoomDirection = KEY_ZOOM[event.key];
      if (zoomDirection && zoomKeys.current.delete(zoomDirection)) {
        endZoom(zoomDirection);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const bindDirection = useCallback((direction: Direction) => {
    const press = (event: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerDirections.current.has(event.pointerId)) {
        return;
      }
      pointerDirections.current.set(event.pointerId, direction);
      pointerCounts.current[direction] += 1;
      event.currentTarget.setPointerCapture(event.pointerId);
      beginPan();
    };
    const release = (event: React.PointerEvent<HTMLButtonElement>) => {
      const pressed = pointerDirections.current.get(event.pointerId);
      if (!pressed) {
        return;
      }
      pointerDirections.current.delete(event.pointerId);
      pointerCounts.current[pressed] = Math.max(0, pointerCounts.current[pressed] - 1);
      endPan();
    };
    return {
      type: 'button' as const,
      className: held.includes(direction) ? 'is-held' : undefined,
      'aria-label': LABELS[direction],
      onPointerDown: press,
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release
    };
  }, [held]);

  const zoom = useCallback((direction: ZoomDirection) => {
    void stepZoom(direction);
  }, []);

  const motion = useMemo(() => ({ held, heldZoom, bindDirection, zoom }), [bindDirection, held, heldZoom, zoom]);
  return <PtzMotionContext.Provider value={motion}>{children}</PtzMotionContext.Provider>;
}

export const usePtzMotion = () => {
  const context = useContext(PtzMotionContext);
  if (!context) {
    throw new Error('PTZ motion controls must be rendered inside PtzMotionProvider.');
  }
  return context;
};
