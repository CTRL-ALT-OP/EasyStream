import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Focus, Home, Minus, Plus, ZoomIn } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { panCrop, zoomCrop } from '../lib/crop';
import type { CropRect, PtzPreset } from '../types';

type PtzControlsProps = {
  crop: CropRect;
  presets: PtzPreset[];
  activePresetId: string | null;
  onCropChange: (crop: CropRect) => void;
  onPresetRecall: (preset: PtzPreset) => void;
  onPresetSave: (presetId: string) => void;
};

type Direction = 'up' | 'down' | 'left' | 'right';

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
  ArrowRight: 'right'
};

const TAP_FRACTION = 0.16;
const HOLD_SPEED = 0.62;
const TAP_WINDOW_MS = 170;

export function PtzControls({ crop, presets, activePresetId, onCropChange, onPresetRecall, onPresetSave }: PtzControlsProps) {
  const cropRef = useRef(crop);
  const onCropChangeRef = useRef(onCropChange);
  const pointerCounts = useRef<Record<Direction, number>>({ up: 0, down: 0, left: 0, right: 0 });
  const pointerDirections = useRef(new Map<number, Direction>());
  const keys = useRef(new Set<Direction>());
  const frame = useRef<number | null>(null);
  const moved = useRef(0);
  const gestureStartedAt = useRef(0);
  const [held, setHeld] = useState<Direction[]>([]);
  const [settingPreset, setSettingPreset] = useState(false);
  const [presetCutout, setPresetCutout] = useState<DOMRect | null>(null);
  const presetListRef = useRef<HTMLDivElement>(null);
  const beginRef = useRef<() => void>(() => undefined);
  const finishRef = useRef<(direction: Direction) => void>(() => undefined);

  cropRef.current = crop;
  onCropChangeRef.current = onCropChange;

  const directionActive = (direction: Direction) => pointerCounts.current[direction] > 0 || keys.current.has(direction);

  const publishHeld = () => {
    const next = DIRECTIONS.filter(directionActive);
    setHeld((current) => (current.join() === next.join() ? current : next));
    document.body.classList.toggle('ptz-nudging', next.length > 0);
  };

  const panBy = (dx: number, dy: number) => {
    const next = panCrop(cropRef.current, dx, dy);
    cropRef.current = next;
    onCropChangeRef.current(next);
  };

  const stopLoop = () => {
    if (frame.current !== null) {
      window.clearInterval(frame.current);
      frame.current = null;
    }
  };

  const stepHeld = (dt: number) => {
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

    if (x === 0 && y === 0) {
      return;
    }

    const length = Math.hypot(x, y);
    const current = cropRef.current;
    const distance = HOLD_SPEED * dt;
    panBy((x / length) * current.width * distance, (y / length) * current.height * distance);
    moved.current += distance;
  };

  const ensureLoop = () => {
    if (frame.current !== null) {
      return;
    }

    let last = performance.now();
    frame.current = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepHeld(dt);
    }, 32);
  };

  const finishGestureIfIdle = (direction: Direction) => {
    if (DIRECTIONS.some(directionActive)) {
      publishHeld();
      return;
    }

    stopLoop();
    const elapsed = performance.now() - gestureStartedAt.current;
    if (elapsed < TAP_WINDOW_MS && moved.current < TAP_FRACTION) {
      const [dx, dy] = VECTORS[direction];
      const remaining = TAP_FRACTION - moved.current;
      const current = cropRef.current;
      panBy(dx * current.width * remaining, dy * current.height * remaining);
    }

    moved.current = 0;
    publishHeld();
  };

  const beginGestureIfNeeded = () => {
    if (!DIRECTIONS.some(directionActive)) {
      return;
    }

    if (frame.current === null) {
      moved.current = 0;
      gestureStartedAt.current = performance.now();
      ensureLoop();
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

  useLayoutEffect(() => {
    const node = presetListRef.current;
    if (!settingPreset || !node) {
      return;
    }

    const update = () => setPresetCutout(node.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [settingPreset, presets]);

  useEffect(() => {
    if (!settingPreset) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingPreset(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingPreset]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.key];
      if (!direction) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      event.preventDefault();
      if (event.repeat || keys.current.has(direction)) {
        return;
      }

      keys.current.add(direction);
      beginRef.current();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.key];
      if (!direction || !keys.current.has(direction)) {
        return;
      }

      keys.current.delete(direction);
      finishRef.current(direction);
    };

    const releaseAll = () => {
      const active = DIRECTIONS.filter((direction) => pointerCounts.current[direction] > 0 || keys.current.has(direction));
      keys.current.clear();
      pointerCounts.current = { up: 0, down: 0, left: 0, right: 0 };
      pointerDirections.current.clear();
      if (active.length > 0) {
        finishRef.current(active[0]);
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

  const bindDirection = (direction: Direction) => ({
    type: 'button' as const,
    className: held.includes(direction) ? 'is-held' : undefined,
    'aria-label': direction === 'up' ? 'Tilt up' : direction === 'down' ? 'Tilt down' : direction === 'left' ? 'Pan left' : 'Pan right',
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
  });

  const zoom = (scale: number) => {
    onCropChange(zoomCrop(crop, scale));
  };

  return (
    <aside className="ptz-panel glass-card" data-devtip="ptz">
      <div className="panel-heading">
        <h2>PTZ</h2>
        <span className="status-pill online">Online</span>
      </div>

      <div className="joystick" aria-label="PTZ directional controls">
        <button {...bindDirection('up')}>
          <ArrowUp size={18} />
        </button>
        <button {...bindDirection('left')}>
          <ArrowLeft size={18} />
        </button>
        <button className="home-button" type="button" onClick={() => onPresetRecall(presets[0])} aria-label="Recall stage wide">
          <Home size={18} />
        </button>
        <button {...bindDirection('right')}>
          <ArrowRight size={18} />
        </button>
        <button {...bindDirection('down')}>
          <ArrowDown size={18} />
        </button>
      </div>

      <div className="zoom-strip">
        <button onClick={() => zoom(1.18)}>
          <Minus size={16} />
          Zoom Out
        </button>
        <div className="zoom-meter">
          <ZoomIn size={16} />
          <span>{Math.round(10000 / crop.width)}%</span>
        </div>
        <button onClick={() => zoom(0.82)}>
          <Plus size={16} />
          Zoom In
        </button>
      </div>

      <div className={`preset-list position-preset-list ${settingPreset ? 'is-setting' : ''}`} ref={presetListRef}>
        <div className="subheading">
          <Focus size={16} />
          <span>Preset Recalls</span>
          <button
            type="button"
            className="preset-set-toggle"
            onClick={() => {
              setSettingPreset((current) => !current);
            }}
          >
            {settingPreset ? 'Cancel' : 'Set'}
          </button>
        </div>
        {presets.map((preset) => (
          <button
            key={preset.id}
            className={`preset-button ${activePresetId === preset.id ? 'active' : ''}`}
            onClick={() => {
              if (settingPreset) {
                onPresetSave(preset.id);
                setSettingPreset(false);
                return;
              }

              onPresetRecall(preset);
            }}
          >
            <span>{preset.label}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>
      {settingPreset &&
        presetCutout &&
        createPortal(
          <div className="preset-set-scrim" aria-hidden="true">
            <span style={{ top: 0, left: 0, right: 0, height: presetCutout.top }} />
            <span style={{ top: presetCutout.top, left: 0, width: presetCutout.left, height: presetCutout.height }} />
            <span
              style={{
                top: presetCutout.top,
                left: presetCutout.right,
                right: 0,
                height: presetCutout.height
              }}
            />
            <span style={{ top: presetCutout.bottom, left: 0, right: 0, bottom: 0 }} />
          </div>,
          document.body
        )}
    </aside>
  );
}
