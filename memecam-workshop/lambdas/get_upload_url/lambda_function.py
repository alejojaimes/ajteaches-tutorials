# lambdas/get_upload_url/lambda_function.py
# Ruta: POST /memes/upload-url
# Devuelve un permiso temporal para que el navegador suba un meme directo a S3.
import base64
import json
import os

import boto3
from botocore.config import Config

BUCKET_NAME = os.environ["BUCKET_NAME"]
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
EXPIRATION_SECONDS = 300

GESTURES = {
    "open_mouth", "smile", "fist", "head_tilt",
    "touch_head", "head_back", "two_fists", "thumbs_up",
}
CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}

s3 = boto3.client("s3", config=Config(signature_version="s3v4"))


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def lambda_handler(event, context):
    try:
        body = parse_body(event)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return response(400, {"error": "El body debe ser un JSON válido"})

    gesture_id = body.get("gestureId")
    content_type = body.get("contentType")

    if gesture_id not in GESTURES:
        return response(400, {"error": f"Gesto desconocido: {gesture_id}"})
    if content_type not in CONTENT_TYPES:
        return response(400, {"error": "Solo se permiten imágenes JPG, PNG, GIF o WEBP"})

    key = f"memes/{gesture_id}.{CONTENT_TYPES[content_type]}"

    # Un POST prefirmado permite poner condiciones: tipo de archivo y tamaño máximo.
    upload = s3.generate_presigned_post(
        Bucket=BUCKET_NAME,
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, MAX_SIZE_BYTES],
        ],
        ExpiresIn=EXPIRATION_SECONDS,
    )

    print(f"Permiso de subida generado para {key}")
    return response(200, {"key": key, "upload": upload})
