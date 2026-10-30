# QuakeLens — AWS deployment runbook

**Current state:** The source is prepared, not deployed. Use your own AWS account locally. Never paste AWS IAM credentials, an AWS secret key, `.aws/credentials`, or Terraform state into this chat or a public repository.

### 1. Check prerequisites & costs

- Terraform CLI >= 1.5; AWS CLI v2; Git/GitHub account; Python 3 for local run.
- AWS IAM permissions to create Lambda, IAM roles, CloudWatch logs, S3, API Gateway, EventBridge, Amazon Location API keys, and Amplify Hosting.
- AWS Budget alert and billing awareness. Restrict publicly usable map API keys by website referer. This public read API is throttled; for a large audience add WAF, monitoring and more protections.
- The AWS v2 Maps URL uses `maps.geo.REGION.amazonaws.com` in a supported Amazon Location region. Default `ap-south-1` (Mumbai).

### 2. Deploy the ingestion pipeline with Terraform

In the **QuakeLens/infra** directory, ensure you have configured AWS CLI locally (`aws sts get-caller-identity` should show **your** AWS account).

```bash
cd QuakeLens/infra
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
terraform output data_api_url
```

Copy the `data_api_url` value from Terraform output. It should look like `https://....execute-api.ap-south-1.amazonaws.com/earthquakes`.

The first EventBridge invocation may not run immediately, so manually seed the feed **once**:

```bash
aws lambda invoke \
  --function-name "$(terraform output -raw ingest_lambda_name)" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  /tmp/quakelens-ingest-result.json
cat /tmp/quakelens-ingest-result.json
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$(terraform output -raw data_api_url)"
curl -s "$(terraform output -raw data_api_url)" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["metadata"]["title"], len(d["features"]))'
```

The last command should report a current USGS title and a **non-zero count**, not an error.

**Troubleshooting:** If the GET endpoint returns 503, inspect CloudWatch logs for `quakelens-ingest` and manually invoke it again. Lambda must reach `earthquake.usgs.gov`. If AWS permissions deny access, check IAM policy and region.

### 3. Configure Amazon Location Service v2 map tiles

1. Go to **AWS Console → Amazon Location Service → API keys → Create API key** in the **same region** (example `ap-south-1`).
2. Give it a name such as `QuakeLensWebMaps`. Select only Maps / map provider `default` resources and the map-rendering actions (the documented `geo-maps:*` for v2 map rendering). The appropriate resource ARN is `arn:aws:geo-maps:ap-south-1::provider/default` for this region.
3. Add **allowed referers**: `http://localhost:8080/*` for local testing and `https://YOUR-AMPLIFY-DOMAIN/*` for the deployed site. If you don't yet know your Amplify domain, add it after creating the site; keep key use restricted to known domains. Add a sensible expiry and rotate as necessary.
4. Copy the returned **`v1.public...` API key**. It is a browser-use key, **not** an IAM access key. It will be readable by browser visitors—therefore referer/resource/action restrictions and billing alerts matter.
5. Edit the root `config.js` (replace placeholders):

```js
window.QUAKELENS_CONFIG = {
  awsRegion: 'ap-south-1',
  amazonLocationApiKey: 'v1.public.REPLACE_WITH_RESTRICTED_MAPS_API_KEY',
  dataApiUrl: 'https://REPLACE.execute-api.ap-south-1.amazonaws.com/earthquakes',
};
```

The frontend builds its map with the **official Amazon Location Maps v2 MapLibre style descriptor**. If the key is empty, it deliberately uses a public non-AWS basemap for local prototyping; this fallback must **not** be passed off as AWS map integration in your submission.

### 4. Run and test locally

```bash
cd QuakeLens
python3 -m http.server 8080
```

Visit `http://localhost:8080`. Expected status is **AWS PIPELINE LIVE**, not `OFFLINE SNAPSHOT`. Open dev tools to verify map tiles from `maps.geo.ap-south-1.amazonaws.com` and GeoJSON from your `execute-api` endpoint. Test city, magnitude, 30/7/1 day filters, event details, timeline, map style and mobile layout.

If key restrictions block the map, verify AWS region, map permissions, exact referer patterns and the browser Network response. Do **not** solve this by using IAM secret keys in the browser.

### 5. Publish GitHub repo and deploy via Amplify Hosting

```bash
cd QuakeLens
node --test tests/geo.test.mjs
git init
git add .
git commit -m "Build QuakeLens seismic explorer and AWS geodata pipeline"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/quakelens.git
git push -u origin main
```

Create a new **public** GitHub repository first; replace `YOUR-ACCOUNT`. **Do not run `git init` inside an existing sensitive work repo.** Avoid committing Terraform state or IAM credentials (excluded by `.gitignore`). A restricted **maps-only browser key** is explicitly public-facing, but if you would rather keep its value out of version control, inject the appropriate public configuration as a deployment artifact and avoid committing the populated `config.js`.

In **AWS Console → Amplify Hosting**, create an app from your GitHub repo, select branch `main`, and allow it to use the included `amplify.yml`. It creates `dist/` containing `index.html`, `config.js`, `assets/`, and `data/`. Wait for deployment success, open the final HTTPS `amplifyapp.com` URL, and confirm Amazon Location API-key allowed referers include that exact origin/pattern.

For any custom domain use the same HTTPS referer restriction.

### 6. Competition-ready smoke test

- [ ] Final public URL opens in an incognito browser, no sign-in needed
- [ ] Header reports `AWS PIPELINE LIVE`, NOT fallback snapshot
- [ ] Amazon Location tile network requests succeed
- [ ] Global map markers and clusters visible
- [ ] City Lens: select Islamabad / 1,000 km → ring and nearby records
- [ ] City Lens: try Tokyo / 500 km to show denser seismic records
- [ ] Slider filters events and chart; timeline play/pause works
- [ ] Feed item opens popup with honest USGS link and computed distance
- [ ] Mobile interactions usable
- [ ] No private keys in repository; `git status` clean
- [ ] Demo recording and public video URL checked, <3 minutes
- [ ] AWS Builder Center project *unpublished previously* and complete

### 7. Operating and cleanup

```bash
# Check the ingestion logs
aws logs tail /aws/lambda/quakelens-ingest --since 30m

# Remove infrastructure when no longer needed (does NOT remove Amplify hosting or the map API key)
cd QuakeLens/infra
terraform destroy
```

Delete the Amplify app and Amazon Location API key separately if ending the project. Verify S3 bucket is empty before Terraform destroy; the private dataset object may need to be removed first. Use AWS Billing / Budgets to monitor actual charges.

**Architecture limitations:** No authentication for the public read-only API; public traffic may incur AWS charges even with throttling. There is no claim of a full hazard/impact model, no earthquake forecasting, and no individual-level location collection. Coordinates use manually maintained city presets and recorded USGS epicenters.
