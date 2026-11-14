import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Focus, Gauge, Home, Minus, Plus, SlidersHorizontal, Sun, ZoomIn } from 'lucide-react';
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PtzFrame } from './PreviewFrames';
import { usePtzMotion } from './PtzMotion';
import {
  recallLightingPreset,
  recallPreset,
  saveLightingPreset,
  savePreset,
  setCameraLook,
  setPanZoomSpeed,
  useSession
} from '../lib/session';
import type { CameraLook, CropRect } from '../types';

type PtzDockContextValue = {
  settingPositionPreset: boolean;
  settingLightingPreset: boolean;
  setPositionPresetMode: (enabled: boolean) => void;
  setLightingPresetMode: (enabled: boolean) => void;
};

type PtzDockProviderProps = {
  children: React.ReactNode;
};

type LightingField = keyof CameraLook;
type PresetLike = {
  id: string;
  label: string;
};

type PtzPresetThumbnailProps = {
  crop: CropRect;
  look: CameraLook;
};

const PtzDockContext = createContext<PtzDockContextValue | null>(null);
const PRESET_CARD_MIN_WIDTH = 96;
const PRESET_CARD_ESTIMATED_HEIGHT = 58;
const PRESET_GRID_GAP = 6;

const estimatePresetCardHeight = (
  containerWidth: number,
  columns: number,
  estimatedHeight: number,
  aspectRatio: number | undefined
) => {
  if (!aspectRatio) {
    return estimatedHeight;
  }

  const columnWidth = (containerWidth - PRESET_GRID_GAP * (columns - 1)) / columns;
  const titleAndPaddingHeight = 31;
  return columnWidth / aspectRatio + titleAndPaddingHeight;
};

const choosePresetGrid = ({
  itemCount,
  containerWidth,
  availableHeight,
  maxColumns,
  requireAllItems,
  cardEstimatedHeight,
  cardAspectRatio
}: {
  itemCount: number;
  containerWidth: number;
  availableHeight: number;
  maxColumns: number;
  requireAllItems: boolean;
  cardEstimatedHeight: number;
  cardAspectRatio?: number;
}) => {
  const candidates = Array.from({ length: maxColumns }, (_, index) => {
    const columns = index + 1;
    const cardHeight = estimatePresetCardHeight(containerWidth, columns, cardEstimatedHeight, cardAspectRatio);
    const maxRows = Math.max(0, Math.floor((availableHeight + PRESET_GRID_GAP) / (cardHeight + PRESET_GRID_GAP)));
    const rowsNeeded = Math.max(1, Math.ceil(itemCount / columns));
    const rows = requireAllItems ? rowsNeeded : Math.min(maxRows, rowsNeeded);
    return {
      columns,
      rows,
      capacity: columns * rows,
      balance: Math.abs(columns - rows),
      cardHeight,
      score: columns + rows,
      valid: rows <= maxRows
    };
  }).filter((candidate) => candidate.valid && candidate.capacity > 0 && candidate.rows > 0);

  const fallback = { columns: 1, rows: 1, capacity: 1 };
  if (candidates.length === 0) {
    return fallback;
  }

  if (!requireAllItems) {
    candidates.sort((a, b) => b.capacity - a.capacity || a.score - b.score || a.balance - b.balance || a.columns - b.columns);
    return candidates[0];
  }

  candidates.sort((a, b) => a.score - b.score || a.balance - b.balance || a.columns - b.columns);
  return candidates[0];
};

function usePresetCutout(isSetting: boolean, listRef: React.RefObject<HTMLDivElement | null>) {
  const [presetCutout, setPresetCutout] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!isSetting || !node) {
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
  }, [isSetting, listRef]);

  return presetCutout;
}

function PresetSetScrim({ cutout }: { cutout: DOMRect | null }) {
  if (!cutout) {
    return null;
  }

  return createPortal(
    <div className="preset-set-scrim" aria-hidden="true">
      <span style={{ top: 0, left: 0, right: 0, height: cutout.top }} />
      <span style={{ top: cutout.top, left: 0, width: cutout.left, height: cutout.height }} />
      <span style={{ top: cutout.top, left: cutout.right, right: 0, height: cutout.height }} />
      <span style={{ top: cutout.bottom, left: 0, right: 0, bottom: 0 }} />
    </div>,
    document.body
  );
}

export function PtzDockProvider({ children }: PtzDockProviderProps) {
  const [settingPositionPreset, setSettingPositionPreset] = useState(false);
  const [settingLightingPreset, setSettingLightingPreset] = useState(false);
  const settingAnyPreset = settingPositionPreset || settingLightingPreset;

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

  const setPositionPresetMode = useCallback((enabled: boolean) => {
    setSettingPositionPreset(enabled);
    if (enabled) {
      setSettingLightingPreset(false);
    }
  }, []);

  const setLightingPresetMode = useCallback((enabled: boolean) => {
    setSettingLightingPreset(enabled);
    if (enabled) {
      setSettingPositionPreset(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      settingPositionPreset,
      settingLightingPreset,
      setPositionPresetMode,
      setLightingPresetMode
    }),
    [setLightingPresetMode, setPositionPresetMode, settingLightingPreset, settingPositionPreset]
  );

  return <PtzDockContext.Provider value={value}>{children}</PtzDockContext.Provider>;
}

function usePtzDockContext() {
  const context = useContext(PtzDockContext);
  if (!context) {
    throw new Error('PTZ dock controls must be rendered inside PtzDockProvider.');
  }

  return context;
}

const PtzPresetThumbnail = memo(function PtzPresetThumbnail({ crop, look }: PtzPresetThumbnailProps) {
  return (
    <div className="preset-live-preview">
      <PtzFrame crop={crop} look={look} downsampled />
    </div>
  );
});

function PagedPresetList<TPreset extends PresetLike>({
  className,
  isSetting,
  listRef,
  icon,
  title,
  setLabel,
  items,
  activeId,
  onSetToggle,
  cardMinWidth = PRESET_CARD_MIN_WIDTH,
  cardEstimatedHeight = PRESET_CARD_ESTIMATED_HEIGHT,
  cardAspectRatio,
  renderItem
}: {
  className: string;
  isSetting: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  icon: React.ReactNode;
  title: string;
  setLabel: string;
  items: TPreset[];
  activeId: string | null;
  onSetToggle: () => void;
  cardMinWidth?: number;
  cardEstimatedHeight?: number;
  cardAspectRatio?: number;
  renderItem: (item: TPreset) => React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(4);
  const [showPager, setShowPager] = useState(true);
  const [pageColumns, setPageColumns] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageStart = page * pageSize;
  const visibleItems = useMemo(() => items.slice(pageStart, pageStart + pageSize), [items, pageSize, pageStart]);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const updatePageSize = () => {
      const headingHeight = node.querySelector('.subheading')?.getBoundingClientRect().height ?? 26;
      const maxColumns = Math.max(1, Math.floor((node.clientWidth + PRESET_GRID_GAP) / (cardMinWidth + PRESET_GRID_GAP)));
      const noPagerHeight = Math.max(0, node.clientHeight - headingHeight - PRESET_GRID_GAP);
      const noPagerGrid = choosePresetGrid({
        itemCount: items.length,
        containerWidth: node.clientWidth,
        availableHeight: noPagerHeight,
        maxColumns,
        requireAllItems: true,
        cardEstimatedHeight,
        cardAspectRatio
      });
      const noPagerPageSize = noPagerGrid.capacity;

      if (items.length <= noPagerPageSize) {
        setShowPager(false);
        setPageSize(noPagerPageSize);
        setPageColumns(noPagerGrid.columns);
        return;
      }

      const pagerHeight = node.querySelector('.preset-pager')?.getBoundingClientRect().height ?? 16;
      const availableHeight = Math.max(0, node.clientHeight - headingHeight - pagerHeight - PRESET_GRID_GAP * 2);
      const pagerGrid = choosePresetGrid({
        itemCount: items.length,
        containerWidth: node.clientWidth,
        availableHeight,
        maxColumns,
        requireAllItems: false,
        cardEstimatedHeight,
        cardAspectRatio
      });
      setShowPager(true);
      setPageSize(Math.max(1, pagerGrid.capacity));
      setPageColumns(pagerGrid.columns);
    };

    updatePageSize();
    const observer = new ResizeObserver(updatePageSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cardAspectRatio, cardEstimatedHeight, cardMinWidth, items.length, listRef]);

  useEffect(() => {
    setPage((current) => (showPager ? Math.min(current, totalPages - 1) : 0));
  }, [showPager, totalPages]);

  useEffect(() => {
    if (!activeId || !showPager) {
      return;
    }

    const activeIndex = items.findIndex((item) => item.id === activeId);
    if (activeIndex >= 0) {
      setPage(Math.floor(activeIndex / pageSize));
    }
  }, [activeId, items, pageSize, showPager]);

  const previousPage = () => setPage((current) => (current + totalPages - 1) % totalPages);
  const nextPage = () => setPage((current) => (current + 1) % totalPages);

  return (
    <div className={`preset-list ${showPager ? 'has-pager' : 'no-pager'} ${className} ${isSetting ? 'is-setting' : ''}`} ref={listRef}>
      <div className="subheading">
        {icon}
        <span>{title}</span>
        <button type="button" className="preset-set-toggle" onClick={onSetToggle}>
          {setLabel}
        </button>
      </div>

      <div className="preset-page-items" style={{ gridTemplateColumns: `repeat(${pageColumns}, minmax(0, 1fr))` }}>
        {visibleItems.map((item) => renderItem(item))}
      </div>

      {showPager && (
        <div className="preset-pager" aria-label={`${title} pages`}>
          <button type="button" className="preset-page-arrow" onClick={previousPage} aria-label={`Previous ${title} page`}>
            <ChevronLeft size={13} />
          </button>
          <div className="preset-page-dots">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                type="button"
                className={`preset-page-dot ${index === page ? 'active' : ''}`}
                key={index}
                onClick={() => setPage(index)}
                aria-label={`${title} page ${index + 1}`}
                aria-current={index === page ? 'page' : undefined}
              />
            ))}
          </div>
          <button type="button" className="preset-page-arrow" onClick={nextPage} aria-label={`Next ${title} page`}>
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function ZoomReadout() {
  const width = useSession((current) => current.crop.width);
  return <span>{Math.round(10000 / width)}%</span>;
}

export function PtzMainControls() {
  const { settingPositionPreset, setPositionPresetMode } = usePtzDockContext();
  const { heldZoom, bindDirection, zoom } = usePtzMotion();
  const presets = useSession((current) => current.presets);
  const look = useSession((current) => current.cameraLook);
  const activePresetId = useSession((current) => current.activePresetId);
  const positionPresetListRef = useRef<HTMLDivElement>(null);
  const presetCutout = usePresetCutout(settingPositionPreset, positionPresetListRef);

  return (
    <section className="ptz-column ptz-main-controls" data-devtip="ptz">
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
        <button className="home-button" type="button" onClick={() => recallPreset(presets[0])} aria-label="Recall stage wide">
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
        <button type="button" className={heldZoom.includes('out') ? 'is-held' : undefined} onClick={() => zoom('out')} aria-label="Zoom out (Q)">
          <Minus size={16} />
          <span>Zoom Out</span>
        </button>
        <div className="zoom-meter">
          <ZoomIn size={16} />
          <span>
            <ZoomReadout />
          </span>
        </div>
        <button type="button" className={heldZoom.includes('in') ? 'is-held' : undefined} onClick={() => zoom('in')} aria-label="Zoom in (E)">
          <Plus size={16} />
          <span>Zoom In</span>
        </button>
      </div>

      <PagedPresetList
        className="position-preset-list"
        isSetting={settingPositionPreset}
        listRef={positionPresetListRef}
        icon={<Focus size={16} />}
        title="Preset Recalls"
        setLabel={settingPositionPreset ? 'Cancel' : 'Set'}
        items={presets}
        activeId={activePresetId}
        onSetToggle={() => setPositionPresetMode(!settingPositionPreset)}
        cardMinWidth={96}
        cardEstimatedHeight={84}
        cardAspectRatio={16 / 9}
        renderItem={(preset) => (
          <button
            key={preset.id}
            className={`preset-button position-preset-card ${activePresetId === preset.id ? 'active' : ''}`}
            onClick={() => {
              if (settingPositionPreset) {
                savePreset(preset.id);
                setPositionPresetMode(false);
                return;
              }

              recallPreset(preset);
            }}
          >
            <div className="preset-preview">
              <PtzPresetThumbnail crop={preset.crop} look={look} />
            </div>
            <span>{preset.label}</span>
          </button>
        )}
      />

      <PresetSetScrim cutout={presetCutout} />
    </section>
  );
}

export function PtzLightingControls() {
  const { settingLightingPreset, setLightingPresetMode } = usePtzDockContext();
  const look = useSession((current) => current.cameraLook);
  const speed = useSession((current) => current.panZoomSpeed);
  const lightingPresets = useSession((current) => current.lightingPresets);
  const activeLightingPresetId = useSession((current) => current.activeLightingPresetId);
  const lightingPresetListRef = useRef<HTMLDivElement>(null);
  const presetCutout = usePresetCutout(settingLightingPreset, lightingPresetListRef);

  const updateLook = (field: LightingField, value: number) => {
    setCameraLook({ ...look, [field]: value });
  };

  const lightingControls: Array<{ field: LightingField; label: string; min: number; max: number; step: number; valueLabel: string }> = [
    { field: 'brightness', label: 'Brightness', min: 70, max: 130, step: 1, valueLabel: `${look.brightness}%` },
    { field: 'contrast', label: 'Contrast', min: 80, max: 130, step: 1, valueLabel: `${look.contrast}%` },
    { field: 'saturation', label: 'Saturation', min: 60, max: 140, step: 1, valueLabel: `${look.saturation}%` },
    { field: 'warmth', label: 'Warmth', min: -50, max: 50, step: 1, valueLabel: look.warmth > 0 ? `+${look.warmth}` : `${look.warmth}` }
  ];

  return (
    <section className="ptz-column ptz-extended-controls" aria-label="Camera PTZ adjustments" data-devtip="ptz">
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
          <input type="range" min={0.6} max={1.6} step={0.1} value={speed} onChange={(event) => setPanZoomSpeed(Number(event.target.value))} />
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

      <PagedPresetList
        className="lighting-preset-list"
        isSetting={settingLightingPreset}
        listRef={lightingPresetListRef}
        icon={<SlidersHorizontal size={16} />}
        title="Lighting Presets"
        setLabel={settingLightingPreset ? 'Cancel' : 'Set'}
        items={lightingPresets}
        activeId={activeLightingPresetId}
        onSetToggle={() => setLightingPresetMode(!settingLightingPreset)}
        renderItem={(preset) => (
          <button
            key={preset.id}
            className={`preset-button ${activeLightingPresetId === preset.id ? 'active' : ''}`}
            onClick={() => {
              if (settingLightingPreset) {
                saveLightingPreset(preset.id);
                setLightingPresetMode(false);
                return;
              }

              recallLightingPreset(preset);
            }}
          >
            <span>{preset.label}</span>
            <small>{preset.description}</small>
          </button>
        )}
      />

      <PresetSetScrim cutout={presetCutout} />
    </section>
  );
}
