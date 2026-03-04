# GitHub-Only Deployment (Static + Auto-Refresh)

This mode hosts TNWW entirely from GitHub Pages with no always-on backend server.

## What this does
- Builds `tnww-widget.js` and `tnww-widget.css`
- Pulls fresh source data (Dropbox sampling, Open-Meteo, USGS) during CI
- Exports static JSON endpoints under `static-api/v1/*`
- Deploys to GitHub Pages

Updates are scheduled hourly by:
- `.github/workflows/pages-static.yml`

## One-time GitHub setup
1. Push this repo to GitHub.
2. In the repo: `Settings -> Pages`
3. Set source to `GitHub Actions`.
4. Save.

## Run first deploy
1. Go to `Actions -> Deploy GitHub Pages (Static TNWW)`.
2. Click `Run workflow`.
3. Wait for deployment to finish.
4. Open the Pages URL and verify:
   - `/embed-example.html`
   - `/static-api/v1/forecast.json`

## Custom domain option
If you want a dedicated subdomain (recommended), set Pages custom domain to:
- `tnww.harpethconservancy.org`

Then create a CNAME DNS record in your DNS provider for that subdomain pointing to your GitHub Pages hostname.

## Embed on harpethconservancy.org
Use a Custom HTML block (or equivalent) with your Pages URL:

```html
<link rel="stylesheet" href="https://YOUR-PAGES-HOST/tnww-widget.css" />
<div id="tnww"></div>
<script
  src="https://YOUR-PAGES-HOST/tnww-widget.js"
  data-api="https://YOUR-PAGES-HOST/static-api"
  data-target="tnww"
  defer
></script>
```

Replace `YOUR-PAGES-HOST` with either:
- `USERNAME.github.io/REPO` (project pages), or
- your custom domain (for example `tnww.harpethconservancy.org`)

## Notes
- This is static hosting. The API endpoints are pre-generated JSON files.
- Hourly schedule is best-effort on GitHub Actions and may not run exactly on the minute.
- If a provider is temporarily unavailable, rerun the workflow manually.
