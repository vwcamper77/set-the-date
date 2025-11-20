import asyncio
import os
from abc import ABC, abstractmethod
from typing import List, Sequence
from urllib.parse import quote

import httpx

from ai_service.models import (
  UserPreferences,
  VenueCandidate,
  SuggestionLocation,
  ExternalRef,
)
from ai_service.intent_normalizer import normalize_intent


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
    if any(token in vibe for token in tokens):
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


def _should_skip_for_art(vibe: str, category: str | None) -> bool:
  if "art" not in vibe:
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

  # Art/class: avoid nightlife/food
  if "art" in vibe_lower or "class" in vibe_lower:
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
    if terms:
      for term in terms[:3]:  # limit number of calls
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
              if _should_skip_for_art(prefs.vibe.lower(), primary_type):
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
      # If nothing matched and vibe suggests classes, run a broader pass
      if not candidates and any(tok in prefs.vibe.lower() for tok in ["class", "art", "lesson", "course"]):
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
              if _should_skip_for_art(prefs.vibe.lower(), primary_type):
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
    normal = normalize_intent(prefs.vibe, prefs.eventType)
    extra_tags = normal.get("tags", [])

    params = {
      "location.address": prefs.location,
      "location.within": "50km",
      "expand": "venue",
      "sort_by": "date",
      "page_size": 20,
    }

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

    # Translate relative chips into a window
    if prefs.dateRange.mode == "explicit" and prefs.dateRange.startDate:
      params["start_date.range_start"] = f"{prefs.dateRange.startDate}T00:00:00"
      if prefs.dateRange.endDate:
        params["start_date.range_end"] = f"{prefs.dateRange.endDate}T23:59:59"

    candidates: List[VenueCandidate] = []
    async with httpx.AsyncClient(timeout=12.0, headers=headers) as client:
      for attempt in range(2):
        try:
          resp = await client.get(self.base_url, params=params)
          if resp.status_code != 200:
            continue
          data = resp.json()
          events = data.get("events", [])
          for event in events:
            venue = event.get("venue", {}) or {}
            candidates.append(
              VenueCandidate(
                id=event.get("id", ""),
                title=event.get("name", {}).get("text", "Event"),
                category="event",
                type="event",
                description=event.get("summary"),
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


def build_providers() -> List[VenueProvider]:
  """Create available providers based on environment."""
  providers: List[VenueProvider] = []
  google_key = os.getenv("GOOGLE_PLACES_API_KEY")
  eventbrite_key = os.getenv("EVENTBRITE_API_KEY")

  if google_key:
    providers.append(GooglePlacesProvider(google_key))
  if eventbrite_key:
    providers.append(EventbriteProvider(eventbrite_key))
  return providers
