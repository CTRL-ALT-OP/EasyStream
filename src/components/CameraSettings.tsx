import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CameraConfig } from '../../shared/cameras';
import { beginCalibration, cancelCalibrationRun, getCameraState, saveCameraConfig, useCamera, zoomToWide } from '../lib/cameras';
import { PtzFrame, WideFrame } from './PreviewFrames';
import { usePtzMotion } from './PtzMotion';

type EdgeMarks = {
  left: number | null;
  right: number | null;
  up: number | null;
  down: number | null;
};

const emptyMarks = (): EdgeMarks => ({ left: null, right: null, up: null, down: null });

const limitsFromMarks = (marks: EdgeMarks) => {
  if (marks.left === null || marks.right === null || marks.up === null || marks.down === null) {
    return null;
  }
  const panMin = Math.min(marks.left, marks.right);
  const panMax = Math.max(marks.left, marks.right);
  const tiltMin = Math.min(marks.up, marks.down);
  const tiltMax = Math.max(marks.up, marks.down);
  if (panMax - panMin < 40 || tiltMax - tiltMin < 20) {
    return null;
  }
  return { panMin, panMax, tiltMin, tiltMax };
};

type CameraSettingsProps = {
  onClose: () => void;
};

function CalibrationPreview() {
  const [mainFeed, setMainFeed] = useState<'wide' | 'ptz'>('wide');
  const pipFeed = mainFeed === 'wide' ? 'ptz' : 'wide';
  const showPip = () => setMainFeed(pipFeed);

  return (
    <div className="limit-preview">
      <div className="limit-stage">
        {mainFeed === 'wide' ? <WideFrame /> : <PtzFrame />}
        <div className="pip-label">{mainFeed === 'wide' ? 'Wide' : 'PTZ'}</div>
        <div
          className="pip-feed limit-pip"
          role="button"
          tabIndex={0}
          onClick={showPip}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              showPip();
            }
          }}
        >
          <div className="pip-label">{pipFeed === 'wide' ? 'Wide' : 'PTZ'}</div>
          {pipFeed === 'wide' ? <WideFrame compact /> : <PtzFrame compact />}
        </div>
      </div>
    </div>
  );
}

export function CameraSettings({ onClose }: CameraSettingsProps) {
  const config = useCamera((current) => current.config);
  const status = useCamera((current) => current.status);
  const calibration = useCamera((current) => current.calibration);
  const progress = useCamera((current) => current.progress);
  const notice = useCamera((current) => current.notice);
  const pose = useCamera((current) => current.pose);
  const [draft, setDraft] = useState<CameraConfig>(config);
  const [settingLimits, setSettingLimits] = useState(false);
  const [marks, setMarks] = useState<EdgeMarks>(emptyMarks);
  const { bindDirection } = usePtzMotion();

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const update = (patch: Partial<CameraConfig>) => setDraft((current) => ({ ...current, ...patch }));
  const number = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const markedLimits = limitsFromMarks(marks);
  const marksReady = marks.left !== null && marks.right !== null && marks.up !== null && marks.down !== null;
  const showPreview = settingLimits || progress !== null;

  const markEdge = (edge: keyof EdgeMarks) => {
    const current = getCameraState().pose;
    if (!current) {
      return;
    }
    const value = edge === 'left' || edge === 'right' ? current.pan : current.tilt;
    setMarks((existing) => ({ ...existing, [edge]: value }));
  };

  const startFromMarks = async () => {
    if (!markedLimits) {
      return;
    }
    const next = { ...draft, ...markedLimits };
    setDraft(next);
    setSettingLimits(false);
    await saveCameraConfig(next);
    await beginCalibration();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className={`settings-modal camera-settings${showPreview ? ' is-wide' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void saveCameraConfig(draft);
          onClose();
        }}
      >
        <div className="panel-heading">
          <h2>Cameras</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            Close
          </button>
        </div>
        {showPreview ? (
          <div className="limit-layout">
            <div className="limit-step">
            {settingLimits ? (
              <>
            <p className="camera-settings-status">
              The lens is zoomed wide. Move until the PTZ image sits on an edge of the wide view, then mark that edge. Sampling stays inside these four positions. Arrow keys and WASD also move the camera.
              {pose ? ` Now at pan ${pose.pan}, tilt ${pose.tilt}.` : ' Waiting for a position from the camera.'}
            </p>
            <div className="joystick" aria-label="PTZ directional controls">
              <button {...bindDirection('up')}>
                <ArrowUp size={18} />
              </button>
              <button {...bindDirection('left')}>
                <ArrowLeft size={18} />
              </button>
              <button type="button" className="home-button" tabIndex={-1} disabled aria-hidden />
              <button {...bindDirection('right')}>
                <ArrowRight size={18} />
              </button>
              <button {...bindDirection('down')}>
                <ArrowDown size={18} />
              </button>
            </div>
            <div className="limit-marks">
              <button type="button" className={marks.left !== null ? 'is-set' : undefined} onClick={() => markEdge('left')}>
                <strong>Left edge</strong>
                <span>{marks.left === null ? 'Mark current pan' : marks.left}</span>
              </button>
              <button type="button" className={marks.right !== null ? 'is-set' : undefined} onClick={() => markEdge('right')}>
                <strong>Right edge</strong>
                <span>{marks.right === null ? 'Mark current pan' : marks.right}</span>
              </button>
              <button type="button" className={marks.up !== null ? 'is-set' : undefined} onClick={() => markEdge('up')}>
                <strong>Top edge</strong>
                <span>{marks.up === null ? 'Mark current tilt' : marks.up}</span>
              </button>
              <button type="button" className={marks.down !== null ? 'is-set' : undefined} onClick={() => markEdge('down')}>
                <strong>Bottom edge</strong>
                <span>{marks.down === null ? 'Mark current tilt' : marks.down}</span>
              </button>
            </div>
            {marksReady && !markedLimits ? (
              <p className="camera-settings-status">Those edges are too close. Move further so the wide view has a real range.</p>
            ) : null}
              </>
            ) : (
              <p className="camera-settings-status">
                {progress ? `${progress.phase} ${progress.completed}/${Math.max(progress.total, 1)}` : 'Working.'}
              </p>
            )}
            </div>
            <CalibrationPreview />
          </div>
        ) : null}
        {showPreview ? null : (
        <div className="settings-grid">
          <label className="wide">
            Wide RTSP URL
            <input value={draft.wideUrl} onChange={(event) => update({ wideUrl: event.target.value })} />
          </label>
          <label className="wide">
            PTZ RTSP URL
            <input value={draft.ptzUrl} onChange={(event) => update({ ptzUrl: event.target.value })} />
          </label>
          <label>
            VISCA host
            <input value={draft.viscaHost} onChange={(event) => update({ viscaHost: event.target.value })} />
          </label>
          <label>
            VISCA port
            <input value={draft.viscaPort} onChange={(event) => update({ viscaPort: number(event.target.value, draft.viscaPort) })} />
          </label>
          <label>
            Pan min
            <input value={draft.panMin} onChange={(event) => update({ panMin: number(event.target.value, draft.panMin) })} />
          </label>
          <label>
            Pan max
            <input value={draft.panMax} onChange={(event) => update({ panMax: number(event.target.value, draft.panMax) })} />
          </label>
          <label>
            Tilt min
            <input value={draft.tiltMin} onChange={(event) => update({ tiltMin: number(event.target.value, draft.tiltMin) })} />
          </label>
          <label>
            Tilt max
            <input value={draft.tiltMax} onChange={(event) => update({ tiltMax: number(event.target.value, draft.tiltMax) })} />
          </label>
          <label>
            Zoom min
            <input value={draft.zoomMin} onChange={(event) => update({ zoomMin: number(event.target.value, draft.zoomMin) })} />
          </label>
          <label>
            Zoom max
            <input value={draft.zoomMax} onChange={(event) => update({ zoomMax: number(event.target.value, draft.zoomMax) })} />
          </label>
        </div>
        )}
        {showPreview ? null : (
          <p className="camera-settings-status">
            Wide {status.wide}, PTZ {status.ptz}, VISCA {status.visca}.
            {calibration?.status === 'valid'
              ? ` Calibration error about ${calibration.validation.medianFramePercent.toFixed(1)}% of the PTZ frame.`
              : ' Not calibrated.'}
          </p>
        )}
        {progress ? (
          <p className="camera-settings-status">
            {progress.phase} {progress.completed}/{Math.max(progress.total, 1)}
          </p>
        ) : null}
        {notice ? <p className="camera-settings-status">{notice}</p> : null}
        {status.message ? <p className="camera-settings-status">{status.message}</p> : null}
        <div className="camera-settings-actions">
          {settingLimits ? (
            <>
              <button type="button" className="action-button" onClick={() => setSettingLimits(false)}>
                Back
              </button>
              <button type="button" className="action-button primary" disabled={!markedLimits || progress !== null} onClick={() => void startFromMarks()}>
                Start sampling
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="action-button"
                disabled={progress !== null || status.visca !== 'open'}
                onClick={() => {
                  setMarks(emptyMarks());
                  setSettingLimits(true);
                  void zoomToWide();
                }}
              >
                Recalibrate
              </button>
              <button type="button" className="action-button" disabled={progress === null} onClick={() => void cancelCalibrationRun()}>
                Cancel
              </button>
              <button type="submit" className="action-button primary">
                Save
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
