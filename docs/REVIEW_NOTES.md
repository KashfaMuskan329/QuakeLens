# Screenshot review & feed recovery (29 Oct 2026)

Three local screenshots show the UI working, including city-ring rendering, toggle of the dark/light basemap, and an earthquake details popup. They do **not** demonstrate a live dataset or AWS infrastructure.

Current screenshots show a limited archive of 15 observations; a **zero within 250 km of Islamabad** is therefore not evidence of zero real-world earthquakes in that region/time.

This update:
- increases the month-feed timeout from 10s to 20s, and tries official USGS 7-day M2.5+ and 30-day M4.5+ sources when it fails;
- visibly flags partial datasets and keeps the 15-record archive labeled as incomplete;
- adds a manual RETRY LIVE DATA button; failures can be inspected via browser Console / Network and the button's tooltip;
- changes the misleading right-panel 'in real time' label to 'as recorded'.

No AWS resources were provisioned by this update. To submit a verified AWS-backed project, follow docs/DEPLOYMENT.md and confirm actual network requests to your AWS endpoints.

## Diagnose any remaining feed issue

1. In Chrome, press F12, open Network, filter `geojson`. Reload the page.
2. If the official feed fails, inspect whether it is a browser CORS, DNS, access denial, or timeout issue.
3. Opening the official feed URL in a tab is only a connectivity check; it is not proof that browser fetch access is allowed.
4. Once the AWS pipeline is deployed, set the `dataApiUrl` in `config.js`. The AWS read API offers a controllable browser-facing CORS endpoint instead of relying on the direct USGS requests.
