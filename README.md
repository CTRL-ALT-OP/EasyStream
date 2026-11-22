# EasyStream

EasyStream is a Windows desktop console for a two-camera live setup. It shows a wide camera and a PTZ camera, drives the PTZ over VISCA, aims the PTZ from the wide picture after calibration, and controls OBS Studio for scenes, streaming, and recording.

The media panel plays a bundled pitch deck and demo video so the layout can be used without a real presentation source.

## Requirements

- [Node.js](https://nodejs.org/) 22 (20.19 or newer also works)
- npm
- [OBS Studio](https://obsproject.com/) 28 or newer, with the built-in WebSocket server enabled
- A wide camera and a PTZ camera that publish RTSP
- A PTZ camera that accepts VISCA over TCP

`ffmpeg` is included through the `ffmpeg-static` dependency. You do not install it separately.

## Installation

```bash
npm install
```

## Run

Development, with hot reload:

```bash
npm run dev
```

Production build, then open the built app:

```bash
npm run build
npm run preview
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-check the project without emitting files |
| `npm test` | Run the Vitest suite |

## Connect OBS

EasyStream connects to OBS on this machine at `ws://127.0.0.1:4455` with the password `EasyStream`.

In OBS:

1. Open **Tools → WebSocket Server Settings**.
2. Enable the WebSocket server.
3. Leave the port at `4455`, or change the port in `electron/obsClient.ts` if you use another one.
4. Set the server password to `EasyStream`.
5. Start OBS before EasyStream, or leave it running. EasyStream retries the connection on its own.

The Output panel shows **Connecting**, **Disconnected**, **Standby**, or **Live**. When OBS is connected, scene cards appear and **Start Streaming** / **Start Recording** talk to OBS. **Stream Settings** reads the current service, server, resolution, and frame rate. Those fields are display-only.

## Connect the cameras

Open **Cameras → Camera settings**. Defaults assume both streams and VISCA are on this machine:

| Setting | Default |
| --- | --- |
| Wide RTSP URL | `rtsp://127.0.0.1:8554/1` |
| PTZ RTSP URL | `rtsp://127.0.0.1:8554/2` |
| VISCA host | `127.0.0.1` |
| VISCA port | `1259` |
| Pan range | `-2448` to `2448` |
| Tilt range | `-432` to `1296` |
| Zoom range | `0` to `16384` (`0x4000`) |

Pan, tilt, and zoom are VISCA units. Set the ranges to the travel your camera actually allows, or mark them during calibration (below). **Save** writes the form and reconnects the feeds.

The status line under the form reports each link: Wide, PTZ, and VISCA as connecting, live/open, or offline.

## Calibrate aim

Calibration teaches EasyStream where the PTZ is looking inside the wide picture. After a valid profile, the wide preview can drive the PTZ.

1. Confirm VISCA is **open**. **Recalibrate** stays disabled until it is.
2. Choose **Recalibrate**. The lens zooms wide.
3. Move the camera until the PTZ image sits on one edge of the wide view, then mark that edge: left, right, top, or bottom. Arrow keys and WASD move the camera in this dialog.
4. Mark all four edges. The span has to be wide enough (at least 40 pan units and 20 tilt units).
5. Choose **Start sampling**. EasyStream visits a grid inside those limits, grabs frames from both cameras, and fits a model.
6. Wait for the progress line to finish, or choose **Cancel**.

A successful run stores the profile with the rest of the app settings. The status line then reports a median error as a percent of the PTZ frame. Changing the RTSP URLs or the VISCA address means the stored profile no longer matches; calibrate again.

On the wide preview, after calibration:

- **Click** a point to center the PTZ there.
- **Drag** a rectangle to frame that region.
- A box on the wide image shows the current PTZ field of view.

Click the picture-in-picture to swap which camera is large.

## Using the panels

The window opens with five docks: Preview, PTZ, Lighting (titled **Camera**), Output, and Media.

### Preview

Live wide and PTZ pictures. Lighting sliders affect the PTZ image here. Swap feeds with the picture-in-picture.

### PTZ

The status pill is **Online** when VISCA is open.

- Hold an arrow to drive. A short press nudges.
- The center home button recalls the first preset (Stage Wide) when that preset has a saved pose. Otherwise it sends the camera's VISCA home command.
- **Zoom Out** and **Zoom In** step on a click and drive while held. The meter is zoom as a percent of the configured range.
- **Preset Recalls** move to a stored pan, tilt, and zoom and show a thumbnail from when the preset was saved.
- **Set**, then a preset card, stores the current pose on that card. **Escape** or **Cancel** leaves set mode.

Starter presets are Stage Wide, Podium, Worship, Audience, Center Aisle, and Right Stage. They have no pose until you set one.

### Camera (lighting)

- **Pan/Zoom Speed** runs from `0.6x` to `1.6x` and scales manual moves.
- Brightness, contrast, saturation, and warmth grade the preview. They are applied in the app.
- **Lighting Presets** recall a saved grade. **Set**, then a card, stores the current sliders on that card.

Starter looks are Neutral, Bright Stage, Warm Service, and Cool LED.

### Output

Scene thumbnails, the program picture, stream and record toggles, and the read-only stream settings dialog. Scene pages appear when the grid cannot fit every scene.

### Media

**Open File** offers two bundled items:

- `EasyStream pitch deck.pptx` — five slides, with Previous and Next
- `event-opener-demo.mp4` — play, pause, and a seek bar

## Keyboard

These keys drive the PTZ when focus is not in a text field:

| Key | Action |
| --- | --- |
| Arrow keys or `W` `A` `S` `D` | Pan and tilt. Tap to nudge, hold to drive. |
| `Q` | Zoom out |
| `E` | Zoom in |
| `Escape` | Leave preset set mode |

Diagonal keys combine into a diagonal VISCA move.

## Layout

- Drag a panel by its top bar to move it. Drop beside another panel to sit next to it, or onto it to stack them as tabs.
- Drag the splitters between panels and between the two rows to resize.
- **Docks** in the menu bar shows or hides a panel. A check mark means it is open.
- The window remembers its size. The dock arrangement is saved with the other settings.

## Where settings are stored

EasyStream writes two files in the Electron user-data folder. On Windows that is:

`%APPDATA%\easystream-demo\`

| File | Contents |
| --- | --- |
| `app-settings.json` | PTZ presets, lighting presets, dock layout, camera connection and limits, calibration profile |
| `window-state.json` | Window size and whether it was maximized |

Delete `app-settings.json` to return to the built-in presets, camera defaults, and dock layout the next time the app starts.

## Project layout

```
electron/          Main process: window, VISCA, RTSP, calibration, OBS client
src/               React renderer: docks and panels
shared/            Settings, camera, VISCA, and aim types used by both sides
public/demo-assets Slides and the demo video
```

The renderer talks to the main process only through the `easystream` API exposed by `electron/preload.ts`.

## Development notes

- `npm run dev` uses `electron-vite`. The renderer loads from the Vite URL; a production launch loads the built `index.html`.
- Dev builds show extra tooltips (`DevTooltips`). Production builds omit them.
- Tests live next to the code they cover (`*.test.ts` under `src/` and `shared/`) and run in Node with Vitest.
