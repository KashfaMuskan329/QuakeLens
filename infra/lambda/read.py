"""AWS Lambda read-only API: serve stored USGS GeoJSON without exposing S3 publicly."""
import json
import os


def handler(event, context):
    import boto3  # Available in the AWS Lambda Python runtime
    try:
        result = boto3.client('s3').get_object(Bucket=os.environ['DATA_BUCKET'], Key='earthquakes/latest.geojson')
        raw = result['Body'].read()
        return {'statusCode': 200, 'headers': {'Content-Type': 'application/geo+json', 'Cache-Control': 'public, max-age=120'}, 'body': raw.decode('utf-8')}
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') in ('NoSuchKey', '404'):
            return {'statusCode': 503, 'headers': {'Content-Type': 'application/json'}, 'body': json.dumps({'error':'Dataset not seeded yet; invoke the ingestion Lambda once.'})}
        raise
