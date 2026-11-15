import { useEffect, useState } from 'react';

const NOTES = {
  preview: {
    title: 'Camera preview',
    body: 'PTZ camera with a fixed wide-angle camera mounted below, and transformation logic to get coordinates from the wide-angle feed.'
  },
  ptz: {
    title: 'PTZ controls',
    body: 'Re-use the existing PTZ controls. Add lighting and set controls.'
  },
  output: {
    title: 'Output',
    body: 'Scenes, streaming, and recording control the OBS program output.'
  },
  media: {
    title: 'Media',
    body: 'Connect with PowerPoint in the background, and support media playback locally.'
  }
} as const;

type DevTipId = keyof typeof NOTES;

type Tip = {
  id: DevTipId;
  x: number;
  y: number;
};

const isDevTipId = (value: string | undefined): value is DevTipId => value !== undefined && value in NOTES;

const sectionAt = (x: number, y: number): DevTipId | null => {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    const section = node.closest('[data-devtip]');
    if (section instanceof HTMLElement && isDevTipId(section.dataset.devtip)) {
      return section.dataset.devtip;
    }
  }

  return null;
};

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

export function DevTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let held = false;
    let x = 0;
    let y = 0;

    const update = () => {
      if (!held) {
        setTip(null);
        return;
      }

      const id = sectionAt(x, y);
      setTip(id ? { id, x, y } : null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'i' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      held = true;
      update();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'i') {
        return;
      }

      held = false;
      setTip(null);
    };

    const onPointerMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (held) {
        update();
      }
    };

    const release = () => {
      held = false;
      setTip(null);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', release);
    };
  }, []);

  if (!tip) {
    return null;
  }

  const note = NOTES[tip.id];
  const width = 320;
  const height = 108;
  const margin = 12;
  const offset = 16;
  let left = tip.x + offset;
  let top = tip.y + offset;
  if (left + width > window.innerWidth - margin) {
    left = tip.x - width - offset;
  }
  if (top + height > window.innerHeight - margin) {
    top = tip.y - height - offset;
  }

  return (
    <div className="dev-tooltip" role="tooltip" style={{ left: Math.max(margin, left), top: Math.max(margin, top) }}>
      <span>Dev</span>
      <strong>{note.title}</strong>
      <p>{note.body}</p>
    </div>
  );
}
