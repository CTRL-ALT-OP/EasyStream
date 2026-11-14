import { DevTooltips } from './components/DevTooltips';
import { FeedProjectionProvider } from './components/PreviewFrames';
import { PtzMotionProvider } from './components/PtzMotion';
import { PtzDockProvider } from './components/PtzDockControls';
import { dockBlocks } from './docks/blocks';
import { DockLayout } from './docks/DockLayout';
import type { DockLayoutState } from './docks/types';

function App({ initialDockLayout }: { initialDockLayout: DockLayoutState | null }) {
  return (
    <div className="app-shell">
      {import.meta.env.DEV && <DevTooltips />}
      <FeedProjectionProvider>
        <PtzDockProvider>
          <PtzMotionProvider>
            <DockLayout blocks={dockBlocks} initialLayout={initialDockLayout} />
          </PtzMotionProvider>
        </PtzDockProvider>
      </FeedProjectionProvider>
    </div>
  );
}

export default App;
