import { ChevronLeft, ChevronRight, Radio, Settings, Square, Video } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { imageForProgram, imageForScene, readObsStreamSettings, setObsPreviewTarget, setObsRecording, setObsScene, setObsStreaming, subscribeObsImages, useObs } from '../lib/obs';
import type { ObsPreviewTarget, ObsScene, ObsStreamSettings } from '../../shared/obs';

const SCENE_COLUMNS = 3;
const SCENE_CARD_MIN_WIDTH = 96;
const SCENE_GRID_GAP = 8;
const SCENE_CARD_CHROME = 36;
const MAX_CAPTURE_WIDTH = 960;

const captureWidthFor = (cssPixels: number) => {
  if (cssPixels < 8) {
    return 0;
  }

  const pixels = cssPixels * (window.devicePixelRatio || 1);
  return Math.min(MAX_CAPTURE_WIDTH, Math.ceil(pixels / 16) * 16);
};

const sceneColumnsForWidth = (width: number) => {
  const fitted = Math.floor((width + SCENE_GRID_GAP) / (SCENE_CARD_MIN_WIDTH + SCENE_GRID_GAP));
  return Math.min(SCENE_COLUMNS, Math.max(1, fitted));
};

const sceneCardHeight = (width: number, columns: number) => {
  const columnWidth = (width - SCENE_GRID_GAP * (columns - 1)) / columns;
  return (Math.max(0, columnWidth - 14) * 9) / 16 + SCENE_CARD_CHROME;
};

const scenePageCapacity = (width: number, height: number, columns: number, itemCount: number) => {
  const cardHeight = sceneCardHeight(width, columns);
  const maxRows = Math.max(1, Math.floor((height + SCENE_GRID_GAP) / (cardHeight + SCENE_GRID_GAP)));
  const rowsNeeded = Math.max(1, Math.ceil(Math.max(itemCount, 1) / columns));
  return columns * Math.min(maxRows, rowsNeeded);
};

const statusLabel = (connection: string, streaming: boolean) => {
  if (connection === 'connecting') {
    return 'Connecting';
  }

  if (connection !== 'connected') {
    return 'Disconnected';
  }

  return streaming ? 'Live' : 'Standby';
};

let programSurface: HTMLCanvasElement | null = null;

function LiveImage({ pick, resetKey, mirrorProgram = false }: { pick: () => string | null; resetKey: string; mirrorProgram?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickRef = useRef(pick);
  const mirrorRef = useRef(mirrorProgram);
  pickRef.current = pick;
  mirrorRef.current = mirrorProgram;

  useEffect(() => {
    const canvas = canvasRef.current;
    let cancelled = false;
    let shown: string | null = null;
    let busy = false;
    let pending: string | null = null;
    const isProgram = resetKey.startsWith('program:');
    if (isProgram && canvas) {
      programSurface = canvas;
    }

    const clear = () => {
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const copyProgram = () => {
      if (!canvas || !programSurface || programSurface === canvas || !programSurface.dataset.ready) {
        return false;
      }

      if (canvas.width !== programSurface.width || canvas.height !== programSurface.height) {
        canvas.width = programSurface.width;
        canvas.height = programSurface.height;
      }

      canvas.getContext('2d')?.drawImage(programSurface, 0, 0);
      return true;
    };

    const draw = async (source: string) => {
      const blob = await (await fetch(source)).blob();
      if (cancelled || pickRef.current() !== source) {
        return;
      }

      const bitmap = await createImageBitmap(blob);
      if (cancelled || !canvas || pickRef.current() !== source) {
        bitmap.close();
        return;
      }

      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }

      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      if (isProgram) {
        canvas.dataset.ready = 'true';
      }
      shown = source;
    };

    const pump = () => {
      if (cancelled || busy) {
        return;
      }

      if (mirrorRef.current && copyProgram()) {
        pending = null;
        shown = null;
        return;
      }

      const next = pending ?? pickRef.current();
      pending = null;
      if (!next) {
        if (shown !== null) {
          shown = null;
          clear();
        }
        return;
      }

      if (next === shown) {
        return;
      }

      busy = true;
      void draw(next)
        .catch(() => {
          shown = next;
        })
        .finally(() => {
          busy = false;
          if (!cancelled) {
            pump();
          }
        });
    };

    const onImage = () => {
      if (mirrorRef.current && copyProgram()) {
        pending = null;
        shown = null;
        return;
      }

      const latest = pickRef.current();
      if (latest === shown && !busy) {
        return;
      }

      pending = latest;
      pump();
    };

    onImage();
    const stop = subscribeObsImages(() => {
      if (!cancelled) {
        onImage();
      }
    });
    return () => {
      cancelled = true;
      if (programSurface === canvas) {
        programSurface = null;
      }
      stop();
    };
  }, [resetKey]);

  return <canvas className="obs-frame" ref={canvasRef} />;
}

const SceneCard = memo(function SceneCard({ scene, active, disabled }: { scene: ObsScene; active: boolean; disabled: boolean }) {
  return (
    <button
      className={`layout-card ${active ? 'active' : ''}`}
      type="button"
      disabled={disabled}
      onClick={() => {
        void setObsScene(scene.name);
      }}
    >
      <div className="layout-preview">
        <LiveImage mirrorProgram={active} pick={() => imageForScene(scene.name, scene.uuid)} resetKey={`${scene.uuid}:${active ? 'live' : 'still'}`} />
      </div>
      <span className="layout-label">{scene.name}</span>
    </button>
  );
});

function SceneGrid({
  scenes,
  activeName,
  disabled,
  connected,
  onVisibleScenes
}: {
  scenes: ObsScene[];
  activeName: string | null;
  disabled: boolean;
  connected: boolean;
  onVisibleScenes: (uuids: string[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(SCENE_COLUMNS * 2);
  const [columns, setColumns] = useState(SCENE_COLUMNS);
  const [showPager, setShowPager] = useState(false);
  const totalPages = Math.max(1, Math.ceil(scenes.length / pageSize));
  const visibleScenes = useMemo(() => scenes.slice(page * pageSize, page * pageSize + pageSize), [page, pageSize, scenes]);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      const columnCount = sceneColumnsForWidth(node.clientWidth);
      const fullCapacity = scenePageCapacity(node.clientWidth, node.clientHeight, columnCount, scenes.length);
      if (scenes.length === 0 || scenes.length <= fullCapacity) {
        setShowPager(false);
        setColumns(columnCount);
        setPageSize(Math.max(fullCapacity, 1));
        return;
      }

      const pagerHeight = node.querySelector('.preset-pager')?.getBoundingClientRect().height ?? 16;
      const availableHeight = Math.max(0, node.clientHeight - pagerHeight - SCENE_GRID_GAP);
      setShowPager(true);
      setColumns(columnCount);
      setPageSize(Math.max(1, scenePageCapacity(node.clientWidth, availableHeight, columnCount, scenes.length)));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [scenes.length]);

  useEffect(() => {
    setPage((current) => (showPager ? Math.min(current, totalPages - 1) : 0));
  }, [showPager, totalPages]);

  const sceneKey = scenes.map((scene) => scene.uuid).join('\n');
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  useEffect(() => {
    if (!activeName || !showPager) {
      return;
    }

    const activeIndex = scenesRef.current.findIndex((scene) => scene.name === activeName);
    if (activeIndex >= 0) {
      setPage(Math.floor(activeIndex / pageSize));
    }
  }, [activeName, pageSize, sceneKey, showPager]);

  useLayoutEffect(() => {
    onVisibleScenes(visibleScenes.map((scene) => scene.uuid));
  }, [onVisibleScenes, visibleScenes]);

  const previousPage = () => setPage((current) => (current + totalPages - 1) % totalPages);
  const nextPage = () => setPage((current) => (current + 1) % totalPages);

  return (
    <div className={`layout-grid ${showPager ? 'has-pager' : ''}`} ref={listRef}>
      <div className="layout-page-items" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {scenes.length === 0 ? (
          <p className="output-empty">{connected ? 'No scenes' : 'Waiting for OBS'}</p>
        ) : (
          visibleScenes.map((scene) => (
            <SceneCard key={scene.uuid} scene={scene} active={scene.name === activeName} disabled={disabled} />
          ))
        )}
      </div>
      {showPager && (
        <div className="preset-pager" aria-label="Scene pages">
          <button type="button" className="preset-page-arrow" onClick={previousPage} aria-label="Previous scene page">
            <ChevronLeft size={13} />
          </button>
          <div className="preset-page-dots">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                type="button"
                className={`preset-page-dot ${index === page ? 'active' : ''}`}
                key={index}
                onClick={() => setPage(index)}
                aria-label={`Scene page ${index + 1}`}
                aria-current={index === page ? 'page' : undefined}
              />
            ))}
          </div>
          <button type="button" className="preset-page-arrow" onClick={nextPage} aria-label="Next scene page">
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

const ProgramPreview = memo(function ProgramPreview({ sceneName }: { sceneName: string | null }) {
  return (
    <div className="output-preview">
      <div className="output-topline">
        <span>Program</span>
        <strong>{sceneName ?? 'No scene'}</strong>
      </div>
      <div className="ratio-slot">
        <div className="ratio-16x9">
          <LiveImage pick={imageForProgram} resetKey={`program:${sceneName ?? ''}`} />
        </div>
      </div>
    </div>
  );
});

export function StreamingControls() {
  const snapshot = useObs((current) => current.snapshot);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [streamSettings, setStreamSettings] = useState<ObsStreamSettings | null>(null);
  const [pending, setPending] = useState<'stream' | 'record' | null>(null);
  const connected = snapshot.connection === 'connected';
  const disabled = !connected || pending !== null;
  const panelRef = useRef<HTMLDivElement>(null);
  const [visibleSceneKey, setVisibleSceneKey] = useState('');
  const reportVisibleScenes = useCallback((uuids: string[]) => {
    const key = uuids.join('\n');
    setVisibleSceneKey((current) => (current === key ? current : key));
  }, []);

  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) {
      return;
    }

    let lastSent = '';
    const publish = () => {
      const programBox = node.querySelector<HTMLElement>('.ratio-16x9');
      const sceneBox = node.querySelector<HTMLElement>('.layout-preview');
      const target: ObsPreviewTarget = {
        active: document.visibilityState === 'visible',
        programWidth: captureWidthFor(programBox?.clientWidth ?? 0),
        sceneWidth: captureWidthFor(sceneBox?.clientWidth ?? 0),
        sceneUuids: visibleSceneKey ? visibleSceneKey.split('\n') : []
      };
      const key = `${target.active}:${target.programWidth}:${target.sceneWidth}:${visibleSceneKey}`;
      if (key === lastSent) {
        return;
      }

      lastSent = key;
      void setObsPreviewTarget(target);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    const programBox = node.querySelector('.ratio-16x9');
    const sceneGrid = node.querySelector('.layout-page-items');
    if (programBox) {
      observer.observe(programBox);
    }
    if (sceneGrid) {
      observer.observe(sceneGrid);
    }
    document.addEventListener('visibilitychange', publish);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', publish);
      window.removeEventListener('resize', publish);
    };
  }, [visibleSceneKey]);

  useEffect(() => {
    return () => {
      void setObsPreviewTarget({ active: false, programWidth: 0, sceneWidth: 0, sceneUuids: [] });
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    let cancelled = false;
    setSettingsLoading(true);
    setStreamSettings(null);
    void readObsStreamSettings().then((settings) => {
      if (cancelled) {
        return;
      }

      setStreamSettings(settings);
      setSettingsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  const toggleStream = () => {
    if (!connected || pending) {
      return;
    }

    setPending('stream');
    void setObsStreaming(!snapshot.streaming).finally(() => setPending(null));
  };

  const toggleRecord = () => {
    if (!connected || pending) {
      return;
    }

    setPending('record');
    void setObsRecording(!snapshot.recording).finally(() => setPending(null));
  };

  return (
    <section className="streaming-panel" data-devtip="output" ref={panelRef}>
      <div className="panel-heading">
        <h2>Output</h2>
        <span className={`status-pill ${connected && snapshot.streaming ? 'live' : ''}`}>{statusLabel(snapshot.connection, snapshot.streaming)}</span>
      </div>

      <div className={`streaming-content ${snapshot.error ? 'has-error' : ''}`}>
        {snapshot.error ? <p className="output-error">{snapshot.error}</p> : null}
        <SceneGrid
          scenes={snapshot.scenes}
          activeName={snapshot.programScene}
          disabled={!connected}
          connected={connected}
          onVisibleScenes={reportVisibleScenes}
        />

        <div className="stream-actions">
          <ProgramPreview sceneName={snapshot.programScene} />
          <button className={`action-button primary ${snapshot.streaming ? 'danger' : ''}`} type="button" disabled={disabled} onClick={toggleStream}>
            <Radio size={18} />
            {snapshot.streaming ? 'Stop Streaming' : 'Start Streaming'}
          </button>
          <button className={`action-button ${snapshot.recording ? 'recording' : ''}`} type="button" disabled={disabled} onClick={toggleRecord}>
            {snapshot.recording ? <Square size={18} /> : <Video size={18} />}
            {snapshot.recording ? 'Stop Recording' : 'Start Recording'}
          </button>
          <button className="action-button" type="button" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
            Stream Settings
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <h2>Stream Settings</h2>
              <button className="icon-button" type="button" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>
            {settingsLoading ? (
              <p className="output-empty">Reading OBS settings...</p>
            ) : streamSettings ? (
              <div className="settings-grid">
                <label>
                  Service
                  <input value={streamSettings.service} readOnly />
                </label>
                <label>
                  Server
                  <input value={streamSettings.server} readOnly />
                </label>
                <label>
                  Resolution
                  <input value={streamSettings.resolution} readOnly />
                </label>
                <label>
                  Frame rate
                  <input value={streamSettings.frameRate} readOnly />
                </label>
              </div>
            ) : (
              <p className="output-error">{connected ? 'Could not read stream settings from OBS.' : 'OBS is not connected.'}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
