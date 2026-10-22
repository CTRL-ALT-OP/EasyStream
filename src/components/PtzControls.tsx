import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Focus, Gauge, Home, Minus, Plus, SlidersHorizontal, Sun, ZoomIn } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { panCrop, zoomCrop } from '../lib/crop';
import type { CameraLook, CropRect, LightingPreset, PtzPreset } from '../types';

type PtzControlsProps = {
  crop: CropRect;
  look: CameraLook;
  speed: number;
  presets: PtzPreset[];
  lightingPresets: LightingPreset[];
  activePresetId: string | null;
  activeLightingPresetId: string | null;
  onCropChange: (crop: CropRect) => void;
  onLookChange: (look: CameraLook) => void;
  onSpeedChange: (speed: number) => void;
  onPresetRecall: (preset: PtzPreset) => void;
  onPresetSave: (presetId: string) => void;
  onLightingPresetRecall: (preset: LightingPreset) => void;
  onLightingPresetSave: (presetId: string) => void;
};

type Direction = 'up' | 'down' | 'left' | 'right';
type LightingField = keyof CameraLook;

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

export function PtzControls({
  crop,
  look,
  speed,
  presets,
  lightingPresets,
  activePresetId,
  activeLightingPresetId,
  onCropChange,
  onLookChange,
  onSpeedChange,
  onPresetRecall,
  onPresetSave,
  onLightingPresetRecall,
  onLightingPresetSave
}: PtzControlsProps) {
  const cropRef = useRef(crop);
  const onCropChangeRef = useRef(onCropChange);
  const speedRef = useRef(speed);
  const pointerCounts = useRef<Record<Direction, number>>({ up: 0, down: 0, left: 0, right: 0 });
  const pointerDirections = useRef(new Map<number, Direction>());
  const keys = useRef(new Set<Direction>());
  const frame = useRef<number | null>(null);
  const moved = useRef(0);
  const gestureStartedAt = useRef(0);
  const [held, setHeld] = useState<Direction[]>([]);
  const [settingPositionPreset, setSettingPositionPreset] = useState(false);
  const [settingLightingPreset, setSettingLightingPreset] = useState(false);
  const [presetCutout, setPresetCutout] = useState<DOMRect | null>(null);
  const positionPresetListRef = useRef<HTMLDivElement>(null);
  const lightingPresetListRef = useRef<HTMLDivElement>(null);
  const beginRef = useRef<() => void>(() => undefined);
  const finishRef = useRef<(direction: Direction) => void>(() => undefined);

  cropRef.current = crop;
  onCropChangeRef.current = onCropChange;
  speedRef.current = speed;

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
    const distance = HOLD_SPEED * speedRef.current * dt;
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
    const tapFraction = TAP_FRACTION * speedRef.current;
    if (elapsed < TAP_WINDOW_MS && moved.current < tapFraction) {
      const [dx, dy] = VECTORS[direction];
      const remaining = tapFraction - moved.current;
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
  const settingAnyPreset = settingPositionPreset || settingLightingPreset;

  useLayoutEffect(() => {
    const node = settingPositionPreset ? positionPresetListRef.current : settingLightingPreset ? lightingPresetListRef.current : null;
    if (!settingAnyPreset || !node) {
      setPresetCutout(null);
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
  }, [settingAnyPreset, settingPositionPreset, settingLightingPreset, presets, lightingPresets]);

  useEffect(() => {
    if (!settingAnyPreset) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingPositionPreset(false);
        setSettingLightingPreset(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingAnyPreset]);

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

  const zoom = (direction: 'in' | 'out') => {
    const step = 0.18 * speed;
    onCropChange(zoomCrop(crop, direction === 'out' ? 1 + step : Math.max(0.62, 1 - step)));
  };

  const updateLook = (field: LightingField, value: number) => {
    onLookChange({ ...look, [field]: value });
  };

  const lightingControls: Array<{ field: LightingField; label: string; min: number; max: number; step: number; valueLabel: string }> = [
    { field: 'brightness', label: 'Brightness', min: 70, max: 130, step: 1, valueLabel: `${look.brightness}%` },
    { field: 'contrast', label: 'Contrast', min: 80, max: 130, step: 1, valueLabel: `${look.contrast}%` },
    { field: 'saturation', label: 'Saturation', min: 60, max: 140, step: 1, valueLabel: `${look.saturation}%` },
    { field: 'warmth', label: 'Warmth', min: -50, max: 50, step: 1, valueLabel: look.warmth > 0 ? `+${look.warmth}` : `${look.warmth}` }
  ];

  return (
    <aside className="ptz-panel" data-devtip="ptz">
      <div className="ptz-column ptz-main-controls">
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
          <button onClick={() => zoom('out')}>
            <Minus size={16} />
            <span>Zoom Out</span>
          </button>
          <div className="zoom-meter">
            <ZoomIn size={16} />
            <span>{Math.round(10000 / crop.width)}%</span>
          </div>
          <button onClick={() => zoom('in')}>
            <Plus size={16} />
            <span>Zoom In</span>
          </button>
        </div>

        <div className={`preset-list position-preset-list ${settingPositionPreset ? 'is-setting' : ''}`} ref={positionPresetListRef}>
          <div className="subheading">
            <Focus size={16} />
            <span>Preset Recalls</span>
            <button
              type="button"
              className="preset-set-toggle"
              onClick={() => {
                const next = !settingPositionPreset;
                setSettingPositionPreset(next);
                if (next) {
                  setSettingLightingPreset(false);
                }
              }}
            >
              {settingPositionPreset ? 'Cancel' : 'Set'}
            </button>
          </div>
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={`preset-button ${activePresetId === preset.id ? 'active' : ''}`}
              onClick={() => {
                if (settingPositionPreset) {
                  onPresetSave(preset.id);
                  setSettingPositionPreset(false);
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
      </div>

      <section className="ptz-column ptz-extended-controls" aria-label="Camera PTZ adjustments">
        <div className="panel-heading">
          <h2>Camera</h2>
          <span className="status-pill">{speed.toFixed(1)}x</span>
        </div>

        <div className="control-section">
          <div className="subheading">
            <Gauge size={16} />
            <span>Pan/Zoom Speed</span>
          </div>
          <label className="slider-control">
            <span className="slider-label">
              <span>Speed</span>
              <strong>{speed.toFixed(1)}x</strong>
            </span>
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.1}
              value={speed}
              onChange={(event) => onSpeedChange(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="control-section lighting-controls">
          <div className="subheading">
            <Sun size={16} />
            <span>Lighting</span>
          </div>
          {lightingControls.map((control) => (
            <label className="slider-control" key={control.field}>
              <span className="slider-label">
                <span>{control.label}</span>
                <strong>{control.valueLabel}</strong>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={look[control.field]}
                onChange={(event) => updateLook(control.field, Number(event.target.value))}
              />
            </label>
          ))}
        </div>

        <div className={`preset-list lighting-preset-list ${settingLightingPreset ? 'is-setting' : ''}`} ref={lightingPresetListRef}>
          <div className="subheading">
            <SlidersHorizontal size={16} />
            <span>Lighting Presets</span>
            <button
              type="button"
              className="preset-set-toggle"
              onClick={() => {
                const next = !settingLightingPreset;
                setSettingLightingPreset(next);
                if (next) {
                  setSettingPositionPreset(false);
                }
              }}
            >
              {settingLightingPreset ? 'Cancel' : 'Set'}
            </button>
          </div>
          {lightingPresets.map((preset) => (
            <button
              key={preset.id}
              className={`preset-button ${activeLightingPresetId === preset.id ? 'active' : ''}`}
              onClick={() => {
                if (settingLightingPreset) {
                  onLightingPresetSave(preset.id);
                  setSettingLightingPreset(false);
                  return;
                }

                onLightingPresetRecall(preset);
              }}
            >
              <span>{preset.label}</span>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </section>
      {settingAnyPreset &&
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
