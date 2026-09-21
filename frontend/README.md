# CLSL AI frontend

This folder contains the complete farmer/dealer Progressive Web App and the
administration portal UI.

- `app/` — pages, API gateways, components, styles and browser-side logic.
- `public/` — logo, mascot, PWA manifest/service worker and product images.

Run the frontend from the repository root so the shared deployment commands
remain stable:

```powershell
npm run dev
npm run build
npm start
```

Vinext is configured with `appDir: "frontend"`; backend code is not bundled
into the browser application. Browser API routes call the private FastAPI
service through loopback on the deployment host.
