# QuakeLens — AWS Builder Center submission toolkit

> **Important:** Replace every bracketed placeholder with a verified fact or actual URL after deployment. Do NOT submit as publicly deployed while using the fallback preview basemap or bundled limited snapshot.

## Project title

**QuakeLens — The Earth Moves. See the Story.**

## Short description

An interactive seismic intelligence explorer that turns public USGS earthquake coordinates into an explorable, city-centered map. Compare what has been recorded near a city, inspect epicenters and depth, filter by magnitude and time, and replay the changing dataset. Built with Amazon Location Service, AWS Lambda, EventBridge, private Amazon S3, API Gateway and Amplify Hosting.

## Dataset (what it is, what's in it)

Source: [USGS GeoJSON feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php), magnitude 2.5+ earthquakes from the preceding month. Each observation includes a reported earthquake ID, epicenter longitude/latitude, magnitude, event timestamp, place description and optional depth. Ingested data may be updated by USGS. Cities use small built-in public coordinate presets, not users' personal locations.

## How the data is mapped / AWS services used

A scheduled EventBridge rule triggers AWS Lambda every 15 minutes. The Lambda downloads and validates a GeoJSON feed, then saves it in a **private S3 bucket**. An **API Gateway HTTP API** calls a read-only Lambda to return the latest dataset to a static frontend served from **AWS Amplify Hosting**. **Amazon Location Service Maps v2** supplies the base map to **MapLibre GL JS**, while GeoJSON overlays show clustered and individual earthquakes. A Haversine distance calculation powers City Lens circles of 250, 500, or 1,000 km. Daily charts and summary statistics are derived in-browser from the filtered records.

Why these services? S3 gives a simple durable data layer; Lambda and EventBridge automate updates; API Gateway exposes an HTTP read route without making the S3 bucket public; Amazon Location supplies location-aware basemaps and keeps rendering integrated with AWS; Amplify makes the experience accessible over HTTPS.

## What people can explore

1. Search curated cities including Islamabad, Lahore, Karachi, Quetta, Tokyo, Kathmandu and others.
2. Select a radius and use City Lens to inspect how many earthquakes occurred nearby **within the selected time/magnitude window**, with actual great-circle distances.
3. Change time range and magnitude threshold, pan or zoom, click a marker, and use the live event feed.
4. Use the City Comparison Lab to compare two cities at the exact same radius; see counts, nearest event and magnitude distribution; jump back to either city on the map.
5. Replay daily earthquake observations with the Time Travel control.
6. Compare global event patterns and daily activity counts; use verified USGS links.

**Scientific note:** Proximity is **not** equivalent to intensity, seismic risk, casualties or prediction. QuakeLens is an exploratory visualization of recorded data, not an early-warning system.

## Proof links (fill in later)

- **Live map URL:** [INSERT VERIFIED PUBLIC AMPLIFY HTTPS URL]
- **GitHub source:** [INSERT PUBLIC GITHUB REPO]
- **Public demo video (<3 minutes):** [INSERT YOUTUBE/VIMEO/FACEBOOK URL]
- **Screenshots:** [ADD 3–5 REAL SCREENSHOTS FROM THE LIVE APP]

## Short public demo storyboard (approx. 2:15–2:40)

**00:00–00:15 — Hook.** Show the whole dashboard. “Every day our planet shifts, but numbers in a data feed don't show the story. What if I could explore those earthquakes around the cities that matter to me?”

**00:15–00:40 — Data and AWS.** “QuakeLens pulls publicly available USGS epicenter data on a schedule using EventBridge and Lambda, stores GeoJSON privately in S3, exposes a read-only API, and uses Amazon Location Service with MapLibre for the interactive map.” Show diagram or quick AWS console cuts. Only show a functioning AWS connection.

**00:40–01:15 — City Lens.** Select Islamabad → 1,000 km → City lens. Zoom to nearby records and open a popup. Point to real distances, depths and source links. Emphasize these are observations, not earthquake predictions.

**01:15–01:45 — Global exploration.** Change to Tokyo or Indonesia, expand clusters, filter magnitude 4+ and demonstrate latest activity feed.

**01:45–02:10 — Compare + Time Travel.** Briefly compare Islamabad and Tokyo using the City Comparison Lab, then demonstrate playback and the data-driven daily chart. “The chart and each plotted event update from the same dataset.”

**02:10–02:35 — Reliability + close.** Show public HTTPS URL, a quick glimpse of GitHub code, then finish with: “QuakeLens connects public earthquake data, AWS automation and city-based context, turning a dataset into something people can explore.”

No voice-over claims about “earthquake prediction”, “risk score”, “24/7 high availability” or “real time alerts” without those features actually being implemented and proven.

## Criteria self-review (25% each)

| Criterion | Strong evidence |
|---|---|
| Technical innovation | City Lens geodesic radius, two-city magnitude comparison, replay timeline, AWS scheduled pipeline |
| Craft and execution | Responsive UI, actual map tiles, operational AWS data, documented tests, graceful fallbacks |
| Usefulness and impact | Understand observation proximity and timelines; verified source links and careful scientific framing |
| Creativity and storytelling | Clear narrative, distinctive visual language, short focused demo, honest scientific caveats |

## Submission checklist

- [ ] Newly submitted/unpublished entry and Builder Center profile meeting Rules
- [ ] Dataset and metadata described
- [ ] Why/how AWS location/data services are used described
- [ ] AWS service(s) actually used in the running app
- [ ] Working public live map link OR clearly demonstrated running instance
- [ ] Public video URL <3 minutes included in the **demo field**
- [ ] Optional GitHub repo added
- [ ] At least 3 genuine screenshots accurately reflect the live project
- [ ] All links work for logged-out viewers
- [ ] Complete submission before **Nov 3, 2026, 2:00 AM Pakistan time** (Nov 2, 1 PM PST)
