# lambdas/track_event/lambda_function.py
# Ruta: POST /events
# Suma 1 al contador del gesto detectado en el navegador.
import base64
import json
import os

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
table = boto3.resource("dynamodb").Table(TABLE_NAME)

GESTURES = {
    "open_mouth", "smile", "fist", "head_tilt",
    "touch_head", "head_back", "two_fists", "thumbs_up",
}


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
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
    if gesture_id not in GESTURES:
        return response(400, {"error": f"Gesto desconocido: {gesture_id}"})

    # ADD es atómico: si 30 personas hacen el gesto al mismo tiempo, no se pierde ningún conteo.
    result = table.update_item(
        Key={"gestureId": gesture_id},
        UpdateExpression="ADD #count :one",
        ExpressionAttributeNames={"#count": "count"},
        ExpressionAttributeValues={":one": 1},
        ReturnValues="UPDATED_NEW",
    )

    count = int(result["Attributes"]["count"])
    print(f"Gesto {gesture_id}: {count}")
    return response(200, {"gestureId": gesture_id, "count": count})
