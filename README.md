# ◉ QuakeLens — The earth moves. See the story.

An interactive seismic-intelligence explorer built for the **AWS Builder Center Weekend Challenge: Map It (Oct 30–Nov 2, 2026)**. Real USGS earthquake records, city-centered distance analysis, magnitudes, time travel, click-to-inspect details, a live events feed, and AWS-hosted automated ingestion.

> **Status:** Functional local application and AWS deployment source are included. **Not yet deployed to AWS**. Complete the configuration and deployment steps below; do not claim a publicly live AWS map until the deployment has been tested. Winning a challenge is not guaranteed.

## What makes QuakeLens different

Instead of only marking earthquake epicenters, QuakeLens answers a location-based question: **what has been recorded near a city, how far away, and when?** It begins with the Pakistani region but can explore Iceland, Japan, Türkiye, USA, and other global locations. Country/city presets are intentionally curated and are not presented as automatic geocoding.

- **City Lens:** Explore city-centered circles of **250 / 500 / 1,000 km**, with actual Haversine distances to observed epicenters.
- **Live/updated feeds:** The default source is the [USGS M2.5+ past-month GeoJSON feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php). When the AWS pipeline is configured the app reads the cached data from AWS API Gateway and S3.
- **Time Travel:** Animate or scrub through an actual dataset's dates; 24 hours / 7 days / 30 days and magnitude filters.
- **Clusters + individual events:** Zoom from aggregated regions to individual events; select an event to inspect magnitude, depth, coordinates and a verifiable USGS link.
- **Daily chart and stats:** Derived from records, not hard-coded metrics.
- **City Comparison Lab:** Put two cities side by side using an identical observation window/radius and magnitude distribution—then jump straight from the comparison to either city on the map.
- **Data provenance:** Status indicator distinguishes AWS, direct USGS and offline bundled reference data.
- **Responsive editorial UI:** Designed for desktop and mobile (desktop recommended for judges).

## 30-second local launch

You need **Python 3**. No `npm install`, Docker, or frontend build required.

```bash
cd QuakeLens
python3 -m http.server 8080
```

Open **http://localhost:8080**. The app attempts to load a public preview basemap and the live USGS earthquake feed; both require an internet connection. If the USGS full-month fetch fails, the app attempts official 7-day M2.5+ and 30-day M4.5+ **partial feeds** with explicit labels, then a **very limited, clearly labeled historical USGS snapshot (15 events, M4.5+, Oct 28, 2026)** is shown instead. This is only for offline UI exploration and **is not a substitute for the real dataset in your submission**.

Use the `RETRY LIVE DATA` control to re-request the dataset; hover over the control for a failure summary and inspect browser DevTools Console/Network if feeds fail. Without an Amazon Location key, the app uses a Carto basemap preview; **this is NOT the competition-ready AWS-map configuration**. To use Amazon Location Service, follow [Deployment guide](docs/DEPLOYMENT.md).

## Repository layout

```text
QuakeLens/
├── index.html                    # Accessible app shell
├── config.js                     # Browser-side public API configuration
├── assets/
│   ├── app.js                    # Interactions, map layers, live data and charts
│   ├── geo.js                    # Pure geo/math filters and data validation
│   └── styles.css                # Custom responsive design system
├── data/usgs-reference.geojson   # Small authentic reference snapshot, labeled
├── infra/
│   ├── versions.tf               # Terraform requirements and region
│   ├── main.tf                   # Scheduled Lambda + private S3 + read-only API
│   └── lambda/
│       ├── ingest.py             # Fetch and validate USGS GeoJSON
│       └── read.py               # Read private S3 data for HTTP API
├── tests/geo.test.mjs            # Native Node.js unit tests
├── docs/DEPLOYMENT.md            # AWS setup and operations checklist
├── docs/SUBMISSION.md            # Submission write-up and short demo script
├── amplify.yml                  # Amplify Hosting static build
└── package.json                 # Convenient test command (zero dependencies)
```

## Architecture

```text
USGS 2.5+ Earthquake GeoJSON (past 30 days)
                 |
          EventBridge rule
          every 15 minutes
                 |
        Ingest AWS Lambda ──> Private Amazon S3 bucket
                                           |
                                Read-only AWS Lambda
                                           |
                                   API Gateway HTTP
                                           |
                 QuakeLens in browser (AWS Amplify Hosting)
                          /                 \
               GeoJSON analysis          MapLibre GL JS
                                              |
                                    Amazon Location Service
                                         (Maps v2 API)
```

- **EventBridge** schedules freshness; **ingest Lambda** calls the public USGS feed and validates it; **S3** stores the current snapshot privately.
- **API Gateway** exposes a throttled read-only endpoint backed by **read Lambda**; the bucket is not public.
- **Amazon Location Service v2** serves MapLibre tiles using a **public browser API key restricted to map actions and approved website referers**.
- **AWS Amplify Hosting** serves the app over HTTPS with a Git-based deployment workflow.

## Source & accuracy

- USGS Earthquake Hazards Program: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- Amazon Location Service map integration: https://docs.aws.amazon.com/location/latest/developerguide/how-to-display-a-map.html
- Amazon Location API keys: https://docs.aws.amazon.com/location/latest/developerguide/using-apikeys.html
- This app does **not** predict earthquakes, shaking intensity, casualties, safety, or risk. Distances are epicenter-to-city-center great-circle distances; earthquake *depth* is a separate attribute.
- The available data is time/magnitude limited by the USGS feed. Small earthquakes, other catalogs, fault lines and long-term risk are outside the scope of this implementation. Regional counts depend on earthquake-reporting coverage.
- Earthquake magnitude values may represent different reported magnitude types. An accurate paper would not call every value "Richter scale". The app uses neutral "magnitude" labels.
- A USGS feed may revise or remove events; updated records supersede older snapshots.

## Tests

```bash
node --test tests/geo.test.mjs
python3 -m py_compile infra/lambda/*.py
python3 -m unittest discover -s tests -p "test_*.py"
```

Tests cover Haversine distances, circle closure, invalid/duplicate records, time and magnitude filters, city radius, replay cutoff, computed statistics, chart binning, GeoJSON conversion, and mocked AWS ingestion/read contract checks. These are **unit tests, not browser/AWS deployment verification**.

## Deployment

Follow **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** to run `terraform apply`, seed S3, configure a restricted Amazon Location Service key, connect GitHub to Amplify, and smoke-test the final HTTPS URL.

AWS services may cost money even for a small project; review prices, make an AWS Budget alert, configure permissions carefully, and delete resources with `terraform destroy` when no longer needed. The HTTP API is intentionally public for a read-only, publicly available dataset: API request volume can still generate costs.

## Challenge submission

Use **[docs/SUBMISSION.md](docs/SUBMISSION.md)** for a ready-to-edit write-up, demo storyboard under 3 minutes, proof checklist and honesty notes. Add actual GitHub, public demo, and video URLs only after they exist.

## License

MIT for project code. USGS dataset rights and Amazon/CARTO map tile terms are governed by their respective publishers; no ownership of those materials is claimed.
