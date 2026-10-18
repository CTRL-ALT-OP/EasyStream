import { Focus, Home, Minus, Plus, RotateCcw, RotateCw, ZoomIn } from 'lucide-react';
import type { CropRect, PtzPreset } from '../types';

type PtzControlsProps = {
  crop: CropRect;
  presets: PtzPreset[];
  activePresetId: string | null;
  onCropChange: (crop: CropRect) => void;
  onPresetRecall: (preset: PtzPreset) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeCrop = (crop: CropRect): CropRect => ({
  x: clamp(crop.x, 0, 100 - crop.width),
  y: clamp(crop.y, 0, 100 - crop.height),
  width: clamp(crop.width, 12, 90),
  height: clamp(crop.height, 12, 70)
});

export function PtzControls({ crop, presets, activePresetId, onCropChange, onPresetRecall }: PtzControlsProps) {
  const move = (dx: number, dy: number) => {
    onCropChange(normalizeCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }));
  };

  const zoom = (scale: number) => {
    const nextWidth = clamp(crop.width * scale, 12, 90);
    const nextHeight = clamp(crop.height * scale, 12, 70);
    onCropChange(
      normalizeCrop({
        x: crop.x + (crop.width - nextWidth) / 2,
        y: crop.y + (crop.height - nextHeight) / 2,
        width: nextWidth,
        height: nextHeight
      })
    );
  };

  return (
    <aside className="ptz-panel glass-card">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Camera Module</span>
          <h2>PTZ Control</h2>
        </div>
        <span className="status-pill online">Online</span>
      </div>

      <div className="joystick" aria-label="PTZ directional controls">
        <button onClick={() => move(0, -crop.height * 0.18)} aria-label="Pan up">
          <RotateCcw size={18} />
        </button>
        <button onClick={() => move(-crop.width * 0.18, 0)} aria-label="Pan left">
          <Minus size={18} />
        </button>
        <button className="home-button" onClick={() => onPresetRecall(presets[0])} aria-label="Recall stage wide">
          <Home size={20} />
        </button>
        <button onClick={() => move(crop.width * 0.18, 0)} aria-label="Pan right">
          <Plus size={18} />
        </button>
        <button onClick={() => move(0, crop.height * 0.18)} aria-label="Pan down">
          <RotateCw size={18} />
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

      <div className="preset-list">
        <div className="subheading">
          <Focus size={16} />
          Preset Recalls
        </div>
        {presets.map((preset) => (
          <button
            key={preset.id}
            className={`preset-button ${activePresetId === preset.id ? 'active' : ''}`}
            onClick={() => onPresetRecall(preset)}
          >
            <span>{preset.label}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}
