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


def _vibe_keywords(prefs: UserPreferences) -> List[str]:
  """Map vibe keywords to provider-friendly search terms."""
  vibe = prefs.vibe.lower()
  terms: List[str] = []

  keyword_map = [
    (["fishing", "lake", "pond"], ["fishing lake", "fishing pond"]),
    (["girly night", "girls night", "hen", "bachelorette"], ["cocktail bar", "rooftop bar"]),
    (["darts"], ["darts bar", "pub with darts"]),
    (["chess", "board game", "tabletop", "catan"], ["board game cafe", "games night", "board games"]),
    (["live music", "gig", "concert"], ["live music", "concert venue"]),
    (["escape room"], ["escape room"]),
    (["karaoke"], ["karaoke bar"]),
    (["bowling"], ["bowling alley"]),
    (["outdoor", "outdoors"], ["park", "hiking"]),
    (["family"], ["family friendly", "kids friendly"]),
  ]

  for tokens, mapped in keyword_map:
    if any(token in vibe for token in tokens):
      terms.extend(mapped)

  if prefs.eventType.lower().startswith("meal") or "drink" in prefs.eventType.lower():
    terms.append("restaurant")
    terms.append("bar")
  if prefs.eventType.lower().startswith("trip"):
    terms.append("weekend trip ideas")
  if prefs.eventType.lower().startswith("night"):
    terms.append("nightlife")
  if not terms:
    terms.extend(["group friendly", "fun venue"])
  return list(dict.fromkeys(terms))  # dedupe while preserving order


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
    terms = _vibe_keywords(prefs)
    query = ", ".join([terms[0]] + [prefs.location]) if terms else f"{prefs.location} group venue"
    params = {"query": query, "key": self.api_key}
    candidates: List[VenueCandidate] = []

    async with httpx.AsyncClient(timeout=8.0) as client:
      for attempt in range(2):
        try:
          resp = await client.get(self.base_url, params=params)
          if resp.status_code != 200:
            continue
          data = resp.json()
          for idx, item in enumerate(data.get("results", [])):
            loc = item.get("geometry", {}).get("location", {})
            candidates.append(
              VenueCandidate(
                id=item.get("place_id") or f"google-{idx}",
                title=item.get("name") or "Suggested venue",
                category=(item.get("types") or [None])[0],
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

    return candidates


class EventbriteProvider(VenueProvider):
  def __init__(self, api_key: str) -> None:
    self.api_key = api_key
    self.base_url = "https://www.eventbriteapi.com/v3/events/search/"

  async def search(self, prefs: UserPreferences) -> List[VenueCandidate]:
    headers = {"Authorization": f"Bearer {self.api_key}"}
    params = {
      "location.address": prefs.location,
      "expand": "venue",
      "sort_by": "date",
      "page_size": 10,
    }
    if prefs.dateRange.mode == "explicit" and prefs.dateRange.startDate:
      params["start_date.range_start"] = f"{prefs.dateRange.startDate}T00:00:00"
      if prefs.dateRange.endDate:
        params["start_date.range_end"] = f"{prefs.dateRange.endDate}T23:59:59"

    candidates: List[VenueCandidate] = []
    async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
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
                roughPrice=event.get("is_free") and "Free" or None,
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
