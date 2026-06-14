import asyncio
import calendar
import logging
import os
import re
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone, date
from typing import List, Sequence, Tuple
from urllib.parse import quote

import httpx

from ai_service.models import (
  UserPreferences,
  VenueCandidate,
  SuggestionLocation,
  ExternalRef,
)
from ai_service.intent_normalizer import normalize_intent

logger = logging.getLogger("ai_inspire_service")

_GEOCODE_CACHE: dict[str, Tuple[float | None, float | None]] = {}


def _parse_date(value: str | None) -> date | None:
  if not value:
    return None
  try:
    return date.fromisoformat(value)
  except Exception:
    return None


def _resolve_date_window(date_range) -> Tuple[datetime | None, datetime | None]:
  """Translate UI date presets into concrete UTC windows for provider filters."""
  today = datetime.now(timezone.utc).date()
  start_date: date | None = None
  end_date: date | None = None

  if getattr(date_range, "mode", None) == "explicit":
    start_date = _parse_date(getattr(date_range, "startDate", None))
    end_date = _parse_date(getattr(date_range, "endDate", None)) or start_date
  else:
    label = (getattr(date_range, "label", "") or "").lower()
    if "today" in label:
      start_date = end_date = today
    elif "next week" in label:
      start_date = today + timedelta(days=(7 - today.weekday() or 7))
      end_date = start_date + timedelta(days=6)
    elif "this week" in label:
      start_date = today
      end_date = today + timedelta(days=max(0, 6 - today.weekday()))
    elif "next month" in label:
      month = today.month + 1
      year = today.year + (1 if month > 12 else 0)
      month = month if month <= 12 else 1
      start_date = date(year, month, 1)
      last_day = calendar.monthrange(year, month)[1]
      end_date = date(year, month, last_day)
    elif "this month" in label:
      start_date = today
      last_day = calendar.monthrange(today.year, today.month)[1]
      end_date = date(today.year, today.month, last_day)
    else:
      start_date = today
      end_date = today + timedelta(days=30)

  if not start_date:
    return (None, None)
  if not end_date:
    end_date = start_date
  if end_date < start_date:
    end_date = start_date

  start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
  end_dt = datetime.combine(end_date, datetime.max.time().replace(microsecond=0), tzinfo=timezone.utc)
  return (start_dt, end_dt)


def _format_iso(dt: datetime | None) -> str | None:
  if not dt:
    return None
  return dt.strftime("%Y-%m-%dT%H:%M:%S")


async def _geocode_location(location: str, api_key: str | None) -> Tuple[float | None, float | None]:
  """Approximate lat/lng for providers that need coordinates."""
  if not location or not api_key:
    return (None, None)
  cache_key = location.strip().lower()
  if cache_key in _GEOCODE_CACHE:
    return _GEOCODE_CACHE[cache_key]

  url = "https://maps.googleapis.com/maps/api/geocode/json"
  params = {"address": location, "key": api_key}
  try:
    async with httpx.AsyncClient(timeout=8.0) as client:
      resp = await client.get(url, params=params)
      if resp.status_code != 200:
        return (None, None)
      data = resp.json()
      first = (data.get("results") or [None])[0] or {}
      loc = first.get("geometry", {}).get("location", {}) if isinstance(first, dict) else {}
      lat = loc.get("lat")
      lng = loc.get("lng")
      if lat is not None and lng is not None:
        _GEOCODE_CACHE[cache_key] = (float(lat), float(lng))
        return _GEOCODE_CACHE[cache_key]
  except Exception:
    return (None, None)
  return (None, None)


_ART_HINT_TOKENS = [
  "art",
  "arts",
  "painting",
  "gallery",
  "museum",
  "exhibit",
  "exhibition",
  "pottery",
  "ceramic",
  "craft",
  "studio",
  "creative",
  "drawing",
  "sketch",
  "sculpture",
  "photography",
]


def _contains_token(text: str, token: str) -> bool:
  """Return True when token appears as a whole word/phrase within text."""
  text_lower = (text or "").lower()
  token_lower = token.lower()
  if not text_lower or not token_lower:
    return False
  if " " in token_lower:
    return token_lower in text_lower
  return re.search(rf"\\b{re.escape(token_lower)}\\b", text_lower) is not None


def _has_art_intent(vibe: str, event_type: str) -> bool:
  """Detect genuine art/creative intent without matching words like 'party'."""
  combined = f"{vibe or ''} {event_type or ''}".strip()
  if not combined:
    return False
  combined_lower = combined.lower()
  if "martial art" in combined_lower:
    return False
  return any(_contains_token(combined_lower, token) for token in _ART_HINT_TOKENS)


def _is_art_candidate(name: str | None, primary_type: str | None, description: str | None = None) -> bool:
  """Check if a provider result is likely art-related."""
  if primary_type in {"art_gallery", "museum"}:
    return True
  text_blob = " ".join(part for part in [name or "", description or ""] if part)
  if not text_blob:
    return False
  return _has_art_intent(text_blob, "")


def _vibe_keywords(prefs: UserPreferences) -> List[str]:
  """Map vibe keywords to provider-friendly search terms."""
  vibe = prefs.vibe.lower()
  terms: List[str] = []

  keyword_map = [
    (["art", "paint", "drawing", "gallery", "pottery", "sketch"], ["art class", "painting class", "pottery class", "art studio"]),
    (["yoga", "pilates", "fitness", "gym", "wellness", "stretch"], ["yoga class", "yoga studio", "pilates studio", "fitness class", "wellness studio"]),
    (["fishing", "lake", "pond"], ["fishing lake", "fishing pond"]),
    (["girly night", "girls night", "hen", "bachelorette"], ["cocktail bar", "rooftop bar"]),
    (["darts"], ["darts bar", "pub with darts"]),
    (["chess", "board game", "tabletop", "catan"], ["board game cafe", "games night", "board games"]),
    (["live music", "gig", "concert"], ["live music", "concert venue"]),
    (["escape room"], ["escape room"]),
    (["karaoke"], ["karaoke bar"]),
    (["bowling"], ["bowling alley"]),
    (["outdoor", "outdoors"], ["park", "hiking", "scenic walk"]),
    (["family"], ["family friendly", "kids friendly"]),
    (["beach", "coast", "seaside", "sea", "cliff", "cliffs", "coastal"], ["beach", "coastal walk", "clifftop walk"]),
    (["walk", "hike", "hiking", "trail"], ["scenic walk", "hiking trail"]),
  ]

  for tokens, mapped in keyword_map:
    if any(_contains_token(vibe, token) for token in tokens):
      terms.extend(mapped)

  if prefs.eventType.lower().startswith("meal") or "drink" in prefs.eventType.lower():
    terms.append("restaurant")
    terms.append("bar")
  if prefs.eventType.lower().startswith("trip"):
    terms.append("weekend trip ideas")
  if prefs.eventType.lower().startswith("day out"):
    terms.append("day trip ideas")
  if prefs.eventType.lower().startswith("night"):
    terms.append("nightlife")
  if not terms:
    terms.extend(["group friendly", "fun venue"])
  return list(dict.fromkeys(terms))  # dedupe while preserving order


def _should_skip_for_art(vibe: str, event_type: str, category: str | None) -> bool:
  if not _has_art_intent(vibe, event_type):
    return False
  skip_types = {"bar", "night_club", "liquor_store", "restaurant"}
  if category and category in skip_types:
    return True
  return False


def _should_skip_for_yoga(vibe: str, category: str | None) -> bool:
  if "yoga" not in vibe and "pilates" not in vibe and "fitness" not in vibe:
    return False
  skip_types = {"art_gallery", "museum"}
  if category and category in skip_types:
    return True
  return False


def _is_irrelevant(primary_type: str | None, vibe: str, event_type: str) -> bool:
  """Filter out clearly unrelated venue categories based on vibe/event_type."""
  if not primary_type:
    return False
  vibe_lower = vibe.lower()
  event_lower = event_type.lower()
  art_intent = _has_art_intent(vibe_lower, event_lower)

  # Art/class: avoid nightlife/food
  if art_intent or _contains_token(vibe_lower, "class"):
    if primary_type in {"bar", "night_club", "liquor_store", "restaurant"}:
      return True
  # Yoga/fitness: avoid nightlife and art galleries
  if any(tok in vibe_lower for tok in ["yoga", "pilates", "fitness", "gym", "wellness"]):
    if primary_type in {"bar", "night_club", "liquor_store", "art_gallery", "museum", "casino"}:
      return True
  # Outdoors/walks: avoid nightlife/indoor leisure unless night vibe explicitly requested
  if any(tok in vibe_lower for tok in ["walk", "hike", "hiking", "trail", "beach", "coast", "cliff", "outdoor", "outdoors", "coastal"]):
    if "night" not in vibe_lower and "night" not in event_lower:
      if primary_type in {"bar", "night_club", "liquor_store", "restaurant", "art_gallery", "museum", "casino", "movie_theater"}:
        return True
  # If the user said "night out" or event type night, don't over-filter bars
  if "night out" in vibe_lower or event_lower.startswith("night"):
    return False

  return False


class VenueProvider(ABC):
  """Provider interface for fetching candidate venues or events."""

  @abstractmethod
  async def search(self, prefs: UserPreferences) -> List[VenueCandidate]:
    raise NotImplementedError


class GooglePlacesProvider(VenueProvider):
  def __init__(self, api_key: str) -> None:
    self.api_key = api_key
    self.base_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"

  async def search(self, prefs: UserPreferences) -> List[VenueCandidate]:
    normal = normalize_intent(prefs.vibe, prefs.eventType)
    extra_tags = normal.get("tags", [])
    terms = _vibe_keywords(prefs) + extra_tags
    queries: List[str] = []
    art_intent = _has_art_intent(prefs.vibe, prefs.eventType)
    refresh_level = 0
    try:
      refresh_level = max(0, min(3, int(prefs.refreshToken or 0)))
    except Exception:
      refresh_level = 0

    # widen search terms when user presses refresh
    max_terms = 3 + refresh_level  # 3 by default, up to 6 on later refreshes
    fallback_terms = ["group friendly", "fun venue", "things to do", "events near", "popular spots"]

    combined_terms = terms if terms else []
    if refresh_level > 0:
      combined_terms = combined_terms + fallback_terms

    if combined_terms:
      for term in combined_terms[:max_terms]:
        queries.append(f"{term} {prefs.location}")
    else:
      queries.append(f"{prefs.location} group venue")

    candidates: List[VenueCandidate] = []
    seen_ids = set()

    async with httpx.AsyncClient(timeout=8.0) as client:
      for query in queries:
        params = {"query": query, "key": self.api_key}
        for attempt in range(2):
          try:
            resp = await client.get(self.base_url, params=params)
            if resp.status_code != 200:
              continue
            data = resp.json()
            for idx, item in enumerate(data.get("results", [])):
              place_id = item.get("place_id") or f"google-{query}-{idx}"
              if place_id in seen_ids:
                continue
              seen_ids.add(place_id)
              loc = item.get("geometry", {}).get("location", {})
              primary_type = (item.get("types") or [None])[0]
              if not art_intent and _is_art_candidate(item.get("name"), primary_type, item.get("business_status")):
                continue
              if _should_skip_for_art(prefs.vibe, prefs.eventType, primary_type):
                continue
              if _should_skip_for_yoga(prefs.vibe.lower(), primary_type):
                continue
              if _is_irrelevant(primary_type, prefs.vibe, prefs.eventType):
                continue
              candidates.append(
                VenueCandidate(
                  id=place_id,
                  title=item.get("name") or "Suggested venue",
                  category=primary_type,
                  location=SuggestionLocation(
                    name=item.get("vicinity") or prefs.location,
                    address=item.get("formatted_address"),
                    lat=loc.get("lat"),
                    lng=loc.get("lng"),
                  ),
                  external=ExternalRef(
                    source="google_places",
                    url=f'https://www.google.com/maps/search/?api=1&query={quote((item.get("name") or "") + " " + (item.get("formatted_address") or prefs.location))}'
                    + (f'&query_place_id={item.get("place_id")}' if item.get("place_id") else ""),
                    sourceId=item.get("place_id"),
                  ),
                  roughPrice=None,
                  rating=item.get("rating"),
                  description=item.get("business_status"),
                )
              )
            break
          except httpx.RequestError:
            if attempt == 1:
              raise
            await asyncio.sleep(0.25)
      # If nothing matched and the user explicitly mentioned classes/art, run a broader pass
      class_intent = any(_contains_token(prefs.vibe, token) for token in ["class", "lesson", "course"])
      if not candidates and (art_intent or class_intent):
        fallback_query = f"{prefs.location} art class"
        params = {"query": fallback_query, "key": self.api_key}
        try:
          resp = await client.get(self.base_url, params=params)
          if resp.status_code == 200:
            data = resp.json()
            for idx, item in enumerate(data.get("results", [])):
              place_id = item.get("place_id") or f"google-{fallback_query}-{idx}"
              if place_id in seen_ids:
                continue
              seen_ids.add(place_id)
              loc = item.get("geometry", {}).get("location", {})
              primary_type = (item.get("types") or [None])[0]
              if not art_intent and _is_art_candidate(item.get("name"), primary_type, item.get("business_status")):
                continue
              if _should_skip_for_art(prefs.vibe, prefs.eventType, primary_type):
                continue
              if _should_skip_for_yoga(prefs.vibe.lower(), primary_type):
                continue
              if _is_irrelevant(primary_type, prefs.vibe, prefs.eventType):
                continue
              candidates.append(
                VenueCandidate(
                  id=place_id,
                  title=item.get("name") or "Suggested venue",
                  category=primary_type,
                  location=SuggestionLocation(
                    name=item.get("vicinity") or prefs.location,
                    address=item.get("formatted_address"),
                    lat=loc.get("lat"),
                    lng=loc.get("lng"),
                  ),
                  external=ExternalRef(
                    source="google_places",
                    url=f'https://www.google.com/maps/search/?api=1&query={quote((item.get("name") or "") + " " + (item.get("formatted_address") or prefs.location))}'
                    + (f'&query_place_id={item.get("place_id")}' if item.get("place_id") else ""),
                    sourceId=item.get("place_id"),
                  ),
                  roughPrice=None,
                  rating=item.get("rating"),
                  description=item.get("business_status"),
                )
              )
        except httpx.RequestError:
          pass

    return candidates


class EventbriteProvider(VenueProvider):
  def __init__(self, api_key: str) -> None:
    self.api_key = api_key
    self.base_url = "https://www.eventbriteapi.com/v3/events/search/"

  async def search(self, prefs: UserPreferences) -> List[VenueCandidate]:
    headers = {"Authorization": f"Bearer {self.api_key}"}
    vibe = (prefs.vibe or "").strip()
    event_type = (prefs.eventType or "").strip()
    art_intent = _has_art_intent(vibe, event_type)
    normal = normalize_intent(prefs.vibe, prefs.eventType)
    extra_tags = normal.get("tags", [])
    try:
      refresh_level = max(0, min(3, int(prefs.refreshToken or 0)))
    except Exception:
      refresh_level = 0

    params = {
      "location.address": prefs.location,
      "location.within": f"{50 + (refresh_level * 20)}km",
      "expand": "venue",
      "sort_by": "date",
      "page_size": 20,
      "token": self.api_key,  # keep token in querystring for Eventbrite quirks/proxies
    }
    if refresh_level > 0:
      params["page"] = min(refresh_level + 1, 4)

    start_dt, end_dt = _resolve_date_window(prefs.dateRange)
    start_iso = _format_iso(start_dt)
    end_iso = _format_iso(end_dt)
    if start_iso:
      params["start_date.range_start"] = start_iso
    if end_iso:
      params["start_date.range_end"] = end_iso

    # Add keywords to widen results
    keywords = []
    if vibe:
      keywords.append(vibe)
    if event_type and event_type.lower() not in (vibe.lower() if vibe else ""):
      keywords.append(event_type)
    if extra_tags:
      keywords.extend(extra_tags)
    if keywords:
      params["q"] = " ".join(keywords)

    candidates: List[VenueCandidate] = []
    async with httpx.AsyncClient(timeout=12.0, headers=headers) as client:
      for attempt in range(2):
        try:
          resp = await client.get(self.base_url, params=params)
          if resp.status_code != 200:
            logger.warning(
              "Eventbrite search failed (status=%s, attempt=%s, params_q=%s, location=%s, body=%s)",
              resp.status_code,
              attempt + 1,
              params.get("q"),
              params.get("location.address"),
              resp.text[:200],
            )
            if resp.status_code == 404:
              # Stop retrying on hard 404 to avoid noisy logs and wasted calls
              break
            continue
          data = resp.json()
          events = data.get("events", [])
          logger.info(
            "Eventbrite returned %s events for q=%s location=%s",
            len(events),
            params.get("q"),
            params.get("location.address"),
          )
          for event in events:
            venue = event.get("venue", {}) or {}
            title_text = event.get("name", {}).get("text", "Event") or "Event"
            summary_text = event.get("summary")
            primary_type = event.get("category_id") if isinstance(event.get("category_id"), str) else None
            if not art_intent and _is_art_candidate(title_text, primary_type, summary_text):
              continue
            candidates.append(
              VenueCandidate(
                id=event.get("id", ""),
                title=title_text,
                category="event",
                type="event",
                description=summary_text,
                location=SuggestionLocation(
                  name=venue.get("name") or prefs.location,
                  address=venue.get("address", {}).get("localized_multi_line_address_display", [None])[0]
                  if isinstance(venue.get("address", {}).get("localized_multi_line_address_display"), Sequence)
                  else venue.get("address", {}).get("localized_address_display"),
                  lat=float(venue.get("latitude")) if venue.get("latitude") else None,
                  lng=float(venue.get("longitude")) if venue.get("longitude") else None,
                ),
                external=ExternalRef(
                  source="eventbrite",
                  url=event.get("url"),
                  sourceId=event.get("id"),
                ),
                roughPrice="Free" if event.get("is_free") else None,
              )
            )
          break
        except httpx.RequestError:
          if attempt == 1:
            raise
          await asyncio.sleep(0.25)
    return candidates


class MeetupProvider(VenueProvider):
  def __init__(self, api_key: str, geocode_key: str | None = None) -> None:
    self.api_key = api_key
    self.geocode_key = geocode_key
    self.base_url = "https://api.meetup.com/find/upcoming_events"

  async def search(self, prefs: UserPreferences) -> List[VenueCandidate]:
    vibe = (prefs.vibe or "").strip()
    event_type = (prefs.eventType or "").strip()
    normal = normalize_intent(prefs.vibe, prefs.eventType)
    extra_tags = normal.get("tags", [])
    try:
      refresh_level = max(0, min(3, int(prefs.refreshToken or 0)))
    except Exception:
      refresh_level = 0

    start_dt, end_dt = _resolve_date_window(prefs.dateRange)
    lat, lng = await _geocode_location(prefs.location, self.geocode_key)

    keywords = []
    if vibe:
      keywords.append(vibe)
    if event_type and event_type.lower() not in (vibe.lower() if vibe else ""):
      keywords.append(event_type)
    if extra_tags:
      keywords.extend(extra_tags)
    query_text = " ".join(dict.fromkeys([k for k in keywords if k])) or prefs.location

    params = {
      "key": self.api_key,
      "text": query_text,
      "page": 30,
      "sign": "true",
      "photo-host": "public",
      "fields": "plain_text_no_images_description",
      "order": "time",
    }
    if lat is not None and lng is not None:
      params["lat"] = lat
      params["lon"] = lng
      params["radius"] = f"{50 + (refresh_level * 20)}"
    start_iso = _format_iso(start_dt)
    end_iso = _format_iso(end_dt)
    if start_iso:
      params["start_date_range"] = start_iso
    if end_iso:
      params["end_date_range"] = end_iso

    candidates: List[VenueCandidate] = []
    seen_ids = set()
    async with httpx.AsyncClient(timeout=12.0) as client:
      for attempt in range(2):
        try:
          resp = await client.get(self.base_url, params=params)
          if resp.status_code != 200:
            logger.warning(
              "Meetup search failed (status=%s, attempt=%s, location=%s, body=%s)",
              resp.status_code,
              attempt + 1,
              prefs.location,
              resp.text[:200],
            )
            if resp.status_code in (401, 403, 404):
              break
            continue
          data = resp.json()
          events = data.get("events", [])
          logger.info("Meetup returned %s events for location=%s", len(events), prefs.location)
          for idx, event in enumerate(events):
            event_id = str(event.get("id") or f"meetup-{idx}")
            if event_id in seen_ids:
              continue
            seen_ids.add(event_id)
            venue = event.get("venue") or {}
            group = event.get("group") or {}
            title_text = event.get("name") or "Meetup event"
            description = event.get("plain_text_no_images_description") or event.get("description")
            if not _has_art_intent(vibe, event_type) and _is_art_candidate(title_text, "event", description):
              continue
            address_parts = [
              venue.get("address_1"),
              venue.get("city"),
              venue.get("country"),
            ]
            address = ", ".join(part for part in address_parts if part)
            fee = event.get("fee") or {}
            rough_price = None
            try:
              amount = float(fee.get("amount"))
              if amount == 0:
                rough_price = "Free"
            except Exception:
              rough_price = "Free" if fee else None
            candidates.append(
              VenueCandidate(
                id=event_id,
                title=title_text,
                category="event",
                type="event",
                description=description,
                location=SuggestionLocation(
                  name=venue.get("name") or group.get("name") or prefs.location,
                  address=address or None,
                  lat=float(venue.get("lat")) if venue.get("lat") else None,
                  lng=float(venue.get("lon")) if venue.get("lon") else None,
                ),
                external=ExternalRef(
                  source="meetup",
                  url=event.get("link") or event.get("event_url"),
                  sourceId=event_id,
                ),
                roughPrice=rough_price,
              )
            )
          break
        except httpx.RequestError:
          if attempt == 1:
            raise
          await asyncio.sleep(0.25)
    return candidates


class FacebookEventsProvider(VenueProvider):
  def __init__(self, access_token: str, geocode_key: str | None = None) -> None:
    self.access_token = access_token
    self.geocode_key = geocode_key
    self.base_url = "https://graph.facebook.com/v20.0/search"

  async def search(self, prefs: UserPreferences) -> List[VenueCandidate]:
    vibe = (prefs.vibe or "").strip()
    event_type = (prefs.eventType or "").strip()
    normal = normalize_intent(prefs.vibe, prefs.eventType)
    extra_tags = normal.get("tags", [])
    try:
      refresh_level = max(0, min(3, int(prefs.refreshToken or 0)))
    except Exception:
      refresh_level = 0

    start_dt, end_dt = _resolve_date_window(prefs.dateRange)
    lat, lng = await _geocode_location(prefs.location, self.geocode_key)
    if lat is None or lng is None:
      logger.info("FacebookEventsProvider skipped: no coordinates for %s", prefs.location)
      return []

    query_parts = [vibe, event_type] + extra_tags
    query = " ".join(part for part in query_parts if part).strip() or "events near me"
    distance = 50000 + (refresh_level * 20000)
    params = {
      "type": "event",
      "q": query,
      "center": f"{lat},{lng}",
      "distance": min(distance, 120000),
      "fields": "id,name,description,start_time,end_time,place,category,is_online",
      "limit": 30,
      "access_token": self.access_token,
    }
    if start_dt:
      params["since"] = int(start_dt.timestamp())
    if end_dt:
      params["until"] = int(end_dt.timestamp())

    candidates: List[VenueCandidate] = []
    seen_ids = set()
    async with httpx.AsyncClient(timeout=12.0) as client:
      for attempt in range(2):
        try:
          resp = await client.get(self.base_url, params=params)
          if resp.status_code != 200:
            logger.warning(
              "Facebook events search failed (status=%s, attempt=%s, location=%s, body=%s)",
              resp.status_code,
              attempt + 1,
              prefs.location,
              resp.text[:200],
            )
            if resp.status_code in (400, 401, 403, 404):
              break
            continue
          data = resp.json()
          events = data.get("data", [])
          logger.info("Facebook returned %s events for location=%s", len(events), prefs.location)
          for idx, event in enumerate(events):
            event_id = str(event.get("id") or f"facebook-{idx}")
            if event_id in seen_ids:
              continue
            seen_ids.add(event_id)
            place = event.get("place") or {}
            location = place.get("location") or {}
            title_text = event.get("name") or "Facebook event"
            description = event.get("description")
            if not _has_art_intent(vibe, event_type) and _is_art_candidate(title_text, event.get("category"), description):
              continue
            address_parts = [location.get("street"), location.get("city"), location.get("country")]
            address = ", ".join(part for part in address_parts if part)
            candidates.append(
              VenueCandidate(
                id=event_id,
                title=title_text,
                category=event.get("category") or "event",
                type="event",
                description=description,
                location=SuggestionLocation(
                  name=place.get("name") or prefs.location,
                  address=address or None,
                  lat=float(location.get("latitude")) if location.get("latitude") else None,
                  lng=float(location.get("longitude")) if location.get("longitude") else None,
                ),
                external=ExternalRef(
                  source="facebook",
                  url=f"https://www.facebook.com/events/{event_id}",
                  sourceId=event_id,
                ),
                roughPrice=None,
              )
            )
          break
        except httpx.RequestError:
          if attempt == 1:
            raise
          await asyncio.sleep(0.25)
    return candidates


def build_providers() -> List[VenueProvider]:
  """Create available providers based on environment."""
  providers: List[VenueProvider] = []
  google_key = os.getenv("GOOGLE_PLACES_API_KEY")
  eventbrite_key = os.getenv("EVENTBRITE_API_KEY")
  meetup_key = os.getenv("MEETUP_API_KEY")
  facebook_token = os.getenv("FACEBOOK_GRAPH_API_TOKEN") or os.getenv("FACEBOOK_EVENTS_API_TOKEN")
  geocode_key = google_key or os.getenv("GOOGLE_MAPS_API_KEY")

  if google_key:
    providers.append(GooglePlacesProvider(google_key))
  else:
    logger.info("GOOGLE_PLACES_API_KEY not set; Google Places provider disabled.")
  if eventbrite_key:
    providers.append(EventbriteProvider(eventbrite_key))
  else:
    logger.info("EVENTBRITE_API_KEY not set; Eventbrite provider disabled.")
  if meetup_key:
    providers.append(MeetupProvider(meetup_key, geocode_key))
  else:
    logger.info("MEETUP_API_KEY not set; Meetup provider disabled.")
  if facebook_token:
    providers.append(FacebookEventsProvider(facebook_token, geocode_key))
  else:
    logger.info("FACEBOOK_GRAPH_API_TOKEN not set; Facebook Events provider disabled.")

  logger.info(
    "Providers enabled: %s",
    [provider.__class__.__name__ for provider in providers],
  )
  return providers
