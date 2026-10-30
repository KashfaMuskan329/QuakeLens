# 🎒 QuakeLens — Start here

**Jani, poora project source package mein hai.** Yeh currently *local runnable app + AWS deployment code* hai; abhi tumhare AWS account par deploy nahin hua.

## Step 1 — Apne PC pe project run karo

1. ZIP extract karo.
2. `QuakeLens` folder VS Code mein open karo.
3. VS Code terminal mein ye command run karo:

**Windows (Python installed ho):**

```powershell
py -m http.server 8080
```

**Ubuntu/Linux:**

```bash
python3 -m http.server 8080
```

4. Browser mein `http://localhost:8080` kholo.
5. Internet connected hona chahiye. Live USGS records load honge. AWS key abhi empty hai, is liye local preview mein alternate (non-AWS) basemap use hoga. Agar full 30-day USGS feed slow ho, app official partial feeds try karegi. Agar sab remote feeds fail ho jaayen, 15 historical records ka clearly labeled reference fallback milega. `RETRY LIVE DATA` button se dobara load karo; hover title / browser Console mein failures dekh sakte ho.

## Step 2 — App ko test karo

- `City lens` → Islamabad → 1,000 km
- City change → Tokyo; map zoom, clusters and point details
- Magnitude M4+ and Last 7 Days
- Timeline play/pause
- City Comparison Lab → Islamabad vs Tokyo
- Map markers par click; USGS evidence URL check

## Step 3 — Winning-grade AWS launch

Pehle [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) follow karo. Short version:

1. AWS CLI + Terraform locally configure karo (IAM credentials kabhi chat/GitHub par share nahin karni).
2. `cd infra` → `terraform init` → `terraform plan` → `terraform apply`.
3. Ingestion Lambda manually once invoke karo, API endpoint verify karo.
4. Amazon Location Service ka **referer-restricted, map-only API key** create karo.
5. Root `config.js` mein public AWS Maps key aur Terraform `data_api_url` do.
6. GitHub public repo → Amplify Hosting deploy → live HTTPS URL verify.
7. Real screenshots aur public <3min video record karke challenge project submit karo.

## What's ready vs pending

**Ready:** Frontend code, styles, global map logic, city analysis, filters, comparison, time playback, real USGS feed logic, offline labeled snapshot, Terraform pipeline, seven automated tests, README, AWS guide, demo outline.

**Pending in your account:** AWS resources, restricted map key, GitHub push, public live map, browser/device smoke test, real screenshots and video.

Main challenge ka last submission time: **Nov 3, 2026, 2:00 AM Pakistan time**. Public code or a public demo should reflect genuine, functional AWS integration, not the local non-AWS preview.
