# TNWW Widget

## Local Dev
```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3\widget
npm install
npm run dev
```

## Build
```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3\widget
npm run build
```

Build outputs:
- `dist/tnww-widget.js`
- `dist/tnww-widget.css`

## Model Overlay Toggle (UI)
The model overlay feature is implemented, and button visibility is controlled by one flag:

- File: `src/components/TimeseriesChart.tsx`
- Constant: `SHOW_MODEL_OVERLAY_TOGGLE`
  - `false` = hide button from users
  - `true` = show "Show/Hide Model Overlay" button

This only controls button visibility. Overlay logic remains in the code.
