import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key


TABLE_NAME = os.environ["TABLE_NAME"]
MAX_ITEMS = 100

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def to_json_safe(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, list):
        return [to_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: to_json_safe(item) for key, item in value.items()}
    return value


def respond(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        "body": json.dumps(payload),
    }


def parse_limit(event):
    query = event.get("queryStringParameters") or {}
    raw_limit = query.get("limit")

    if raw_limit is None:
        return MAX_ITEMS

    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return MAX_ITEMS

    return max(1, min(limit, MAX_ITEMS))


def parse_pk(event):
    query = event.get("queryStringParameters") or {}
    raw_pk = query.get("pk")

    if not isinstance(raw_pk, str):
        return None

    pk = raw_pk.strip()
    return pk or None


def query_all_by_pk(pk):
    items = []
    query_args = {
        "KeyConditionExpression": Key("pk").eq(pk),
    }

    while True:
        result = table.query(**query_args)
        items.extend(result.get("Items", []))

        last_evaluated_key = result.get("LastEvaluatedKey")

        if not last_evaluated_key:
            break

        query_args["ExclusiveStartKey"] = last_evaluated_key

    return items


def lambda_handler(event, _context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = (event.get("rawPath") or "").rstrip("/") or "/"

    if method != "GET":
        return respond(405, {"error": "Only GET is supported for this endpoint."})

    if path not in ("/api/datapoints", "/datapoints"):
        return respond(400, {"error": "Use GET /api/datapoints to load datapoints."})

    pk = parse_pk(event)

    if pk:
        items = [to_json_safe(item) for item in query_all_by_pk(pk)]
        has_more = False
    else:
        result = table.scan(Limit=parse_limit(event))
        items = [to_json_safe(item) for item in result.get("Items", [])]
        has_more = "LastEvaluatedKey" in result

    items.sort(key=lambda item: (str(item.get("pk", "")), str(item.get("sk", ""))))

    return respond(
        200,
        {
            "items": items,
            "count": len(items),
            "hasMore": has_more,
            "pk": pk,
        },
    )
