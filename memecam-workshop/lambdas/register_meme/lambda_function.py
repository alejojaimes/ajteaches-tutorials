# lambdas/register_meme/lambda_function.py
# Disparador: S3 (ObjectCreated) sobre el prefijo memes/
# Cada vez que se sube una imagen a memes/<gesto>.<ext>, la registra en DynamoDB.
import os
from datetime import datetime, timezone
from urllib.parse import unquote_plus

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
table = boto3.resource("dynamodb").Table(TABLE_NAME)

GESTURES = {
    "open_mouth": "Abrir la boca",
    "smile": "Sonreír",
    "fist": "Mostrar el puño",
    "head_tilt": "Inclinar la cabeza",
    "touch_head": "Tocarse la cabeza",
    "head_back": "Cabeza hacia atrás",
    "two_fists": "Mostrar los dos puños",
    "thumbs_up": "Pulgar arriba",
}


def lambda_handler(event, context):
    registered = []

    for record in event.get("Records", []):
        # Las llaves llegan codificadas como URL (un espacio llega como "+")
        key = unquote_plus(record["s3"]["object"]["key"])
        file_name = key.split("/")[-1]
        gesture_id = file_name.rsplit(".", 1)[0]

        if gesture_id not in GESTURES:
            print(f"Ignorado: '{key}' no corresponde a ningún gesto conocido")
            continue

        table.update_item(
            Key={"gestureId": gesture_id},
            UpdateExpression="SET #label = :label, #imageKey = :key, #updatedAt = :now",
            ExpressionAttributeNames={
                "#label": "label",
                "#imageKey": "imageKey",
                "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues={
                ":label": GESTURES[gesture_id],
                ":key": key,
                ":now": datetime.now(timezone.utc).isoformat(),
            },
        )
        print(f"Meme registrado: {gesture_id} -> {key}")
        registered.append(gesture_id)

    return {"registered": registered}
