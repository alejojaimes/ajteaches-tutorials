# lambdas/list_memes/lambda_function.py
# Ruta: GET /memes
# Devuelve cada gesto con una URL temporal (prefirmada) para descargar su meme.
import json
import os

import boto3
from botocore.config import Config

TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
URL_EXPIRATION_SECONDS = 3600

table = boto3.resource("dynamodb").Table(TABLE_NAME)
s3 = boto3.client("s3", config=Config(signature_version="s3v4"))


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def lambda_handler(event, context):
    items = table.scan().get("Items", [])

    memes = {}
    for item in items:
        if "imageKey" not in item:
            continue
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": item["imageKey"]},
            ExpiresIn=URL_EXPIRATION_SECONDS,
        )
        memes[item["gestureId"]] = {"label": item.get("label", ""), "url": url}

    print(f"Memes disponibles: {len(memes)}")
    return response(200, memes)
