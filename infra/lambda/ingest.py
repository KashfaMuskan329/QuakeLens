"""AWS Lambda scheduled ingestion: fetch USGS M2.5+ month feed, validate, store private S3 object."""
import json
import os
import urllib.request
from datetime import datetime, timezone

SOURCE = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'


def handler(event, context):
    import boto3  # Available in the AWS Lambda Python runtime
    request = urllib.request.Request(SOURCE, headers={'User-Agent': 'QuakeLens-OpenDataExplorer/1.0 (USGS public feed)'})
    with urllib.request.urlopen(request, timeout=12) as response:
        raw = response.read(8_000_001)
        if len(raw) > 8_000_000:
            raise ValueError('USGS feed exceeded size limit')
        payload = json.loads(raw)
    if payload.get('type') != 'FeatureCollection' or not isinstance(payload.get('features'), list):
        raise ValueError('USGS returned invalid GeoJSON data')
    if not payload['features']:
        raise ValueError('USGS feed empty; preserving previous data')
    payload.setdefault('metadata', {})['quakelensFetchedAt'] = datetime.now(timezone.utc).isoformat()
    payload['metadata']['quakelensSource'] = SOURCE
    body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    boto3.client('s3').put_object(Bucket=os.environ['DATA_BUCKET'], Key='earthquakes/latest.geojson', Body=body, ContentType='application/geo+json', CacheControl='max-age=300')
    return {'statusCode': 200, 'body': json.dumps({'stored': len(payload['features']), 'bytes': len(body)})}
