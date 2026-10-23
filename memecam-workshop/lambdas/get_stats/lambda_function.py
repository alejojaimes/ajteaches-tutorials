# lambdas/get_stats/lambda_function.py
# Ruta: GET /stats
# Devuelve el ranking de gestos más usados.
import json
import os

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    items = table.scan().get("Items", [])

    ranking = [
        {
            "gestureId": item["gestureId"],
            "label": item.get("label", item["gestureId"]),
            # DynamoDB devuelve los números como Decimal; se convierten a int.
            "count": int(item.get("count", 0)),
        }
        for item in items
    ]
    ranking.sort(key=lambda row: row["count"], reverse=True)

    total = sum(row["count"] for row in ranking)
    return response(200, {"total": total, "ranking": ranking})
