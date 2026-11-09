# ABIN.EXE — Technical Artist Portfolio

A responsive dark industrial portfolio with an embedded, procedural low-poly driving playground built with Three.js.

## Requirements
- Node.js 20.19+ (or a current Node.js release supported by Vite)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## Production build

```bash
npm run build
npm run preview
```

The production-ready static site is generated in `dist/` and can be deployed to Netlify, Vercel, GitHub Pages (with base-path configuration if hosted in a subfolder), or any static web host.

## Game controls
- W / Up: accelerate
- S / Down: reverse / brake
- A / Left and D / Right: steer
- Space: handbrake
- R: reset the car

Collect all eight floating data chips to finish the run. The scene is generated from Three.js primitives, so no external 3D assets are required.

## Customise
- Edit text, sections, navigation and project metadata in `index.html`.
- Adjust colours, layout and responsive styling in `src/style.css` (`--blue` is the main accent).
- Adjust the game world, props, car physics and controls in `src/main.js`.
- Replace the placeholder `hello@abin.dev` mailto address and project studies with your real contact details and work before publishing.

## Notes
The portfolio uses Google Fonts when online and falls back to system fonts if unavailable. The embedded game requires WebGL. On mobile, the site layout is responsive, but the current driving controls are keyboard-first; add touch controls in `src/main.js` if mobile gameplay is a priority.
