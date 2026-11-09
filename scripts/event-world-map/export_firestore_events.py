#!/usr/bin/env python3
"""Read-only Firestore poll export for Set The Date world-map video.

Output contains only createdAt, lat, lon. Never exports personal data.
Use administrator credentials, not a browser or public HTTP endpoint.
"""
import argparse
import base64
import collections
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
from urllib.parse import quote

START = dt.datetime(2025, 4, 1, tzinfo=dt.timezone.utc)
END = dt.datetime(2026, 10, 24, tzinfo=dt.timezone.utc)  # exclusive
QA_EMAILS = {
    "gavinfern@hotmail.com", "hello@setthedate.app", "test@gmail.com",
    "setthedateapp@gmail.com", "booking@chateaumontfelix.com",
    "nicheescapes@gmail.com",
}
INVALID_PLACES = {"", "-", "unknown", "tbc", "tbd", "n/a", "online",
                  "anywhere", "to be confirmed", "virtual", "zoom", "tba"}


def as_utc(value):
    if isinstance(value, dt.datetime):
        return value.replace(tzinfo=dt.timezone.utc) if value.tzinfo is None else value.astimezone(dt.timezone.utc)
    if isinstance(value, dict):
        seconds = value.get("seconds", value.get("_seconds"))
        if seconds is not None:
            return dt.datetime.fromtimestamp(float(seconds), dt.timezone.utc)
    if isinstance(value, str):
        try:
            x = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            return x.replace(tzinfo=dt.timezone.utc) if x.tzinfo is None else x.astimezone(dt.timezone.utc)
        except ValueError:
            return None
    return None


def firebase_client(project_id):
    import firebase_admin
    from firebase_admin import credentials, firestore
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        credential = credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"])
    elif os.getenv("FIREBASE_PRIVATE_KEY") or os.getenv("FIREBASE_PRIVATE_KEY_BASE64"):
        secret = os.getenv("FIREBASE_PRIVATE_KEY")
        if not secret:
            secret = base64.b64decode(os.environ["FIREBASE_PRIVATE_KEY_BASE64"]).decode("utf-8")
        service_email = os.getenv("FIREBASE_CLIENT_EMAIL")
        if not service_email:
            raise RuntimeError("FIREBASE_CLIENT_EMAIL must be set when using a private key")
        credential = credentials.Certificate({
            "type": "service_account", "project_id": project_id,
            "client_email": service_email, "private_key": secret.replace("\\n", "\n"),
            "token_uri": "https://oauth2.googleapis.com/token"
        })
    else:
        credential = credentials.ApplicationDefault()
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credential, {"projectId": project_id})
    return firestore.client()


def resolve_place(raw, session, token, cache):
    query = re.sub(r"\s+", " ", raw.strip())
    if query.lower() in INVALID_PLACES:
        return None
    key = query.casefold()
    if key in cache:
        return cache[key]
    endpoint = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + quote(query, safe="") + ".json"
    response = session.get(endpoint, params={
        "access_token": token, "types": "place,locality,region,country",
        "limit": 4, "autocomplete": "false",
    }, timeout=20)
    response.raise_for_status()
    features = response.json().get("features", [])
    candidates = [
        f for f in features
        if float(f.get("relevance", 0)) >= 0.80
        and any(t in ("place", "locality", "region", "country")
                for t in f.get("place_type", []))
        and len(f.get("center", [])) >= 2
    ]
    result = None
    if candidates:
        top = candidates[0]
        # If another plausible candidate has a similar score, do not guess.
        next_best = candidates[1] if len(candidates) > 1 else None
        if not next_best or float(top["relevance"]) - float(next_best["relevance"]) >= .10:
            lon, lat = map(float, top["center"][:2])
            if -85 <= lat <= 85 and -180 <= lon <= 180:
                result = {"lat": round(lat, 2), "lon": round(lon, 2)}
    cache[key] = result
    time.sleep(.075)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", required=True, help="Confirm the live Firebase project ID")
    parser.add_argument("--out", required=True, help="Private JSON output path")
    parser.add_argument("--include-test", action="store_true", help="Include known QA accounts")
    args = parser.parse_args()
    token = os.getenv("MAPBOX_ACCESS_TOKEN") or os.getenv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN")
    if not token:
        parser.error("Set MAPBOX_ACCESS_TOKEN (never put it in this script or commit it)")
    import requests
    db = firebase_client(args.project_id)

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path = out_path.parent / "geocode_cache.json"
    try:
        cache = json.loads(cache_path.read_text("utf-8")) if cache_path.exists() else {}
    except (OSError, ValueError):
        cache = {}

    counts = collections.Counter()
    events = []
    session = requests.Session()

    # Read ONLY the required fields. No vote subcollections, titles or tokens.
    for snapshot in db.collection("polls").select(["createdAt", "location", "organiserEmail"]).stream():
        counts["poll_records_read"] += 1
        poll = snapshot.to_dict() or {}
        organiser_email = str(poll.get("organiserEmail") or "").strip().casefold()
        if not args.include_test and organiser_email in QA_EMAILS:
            counts["known_test_records_excluded"] += 1
            continue
        when = as_utc(poll.get("createdAt"))
        if when is None or not START <= when < END:
            counts["no_creation_time_or_outside_period"] += 1
            continue
        place = poll.get("location")
        if not isinstance(place, str) or not place.strip():
            counts["no_event_location"] += 1
            continue
        try:
            point = resolve_place(place, session, token, cache)
        except requests.RequestException:
            counts["geocoder_errors"] += 1
            continue
        if not point:
            counts["ambiguous_or_unmapped_event_location"] += 1
            continue
        events.append({
            "createdAt": when.isoformat().replace("+00:00", "Z"),
            "lat": point["lat"], "lon": point["lon"],
        })
        counts["mapped_event_locations"] += 1

    events.sort(key=lambda row: row["createdAt"])
    # Neither output file contains email, organiser name, event title or poll ID.
    out_path.write_text(json.dumps(events, indent=2) + "\n", encoding="utf-8")
    cache_path.write_text(json.dumps(cache, indent=2) + "\n", encoding="utf-8")
    audit = {"project": args.project_id,
             "period_start_inclusive": START.isoformat(),
             "period_end_exclusive": END.isoformat(),
             "counts": dict(counts),
             "mapped_share_of_non_test_records": round(
                 len(events) / max(1, counts["poll_records_read"] -
                                   counts["known_test_records_excluded"]), 4)}
    out_path.with_suffix(".audit.json").write_text(
        json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))
    if not events:
        print("No geocoded events. Video rendering must not proceed.", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
