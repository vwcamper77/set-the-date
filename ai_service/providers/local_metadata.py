import json
import os
from typing import List

from ai_service.models import UserPreferences, VenueCandidate, SuggestionLocation, ExternalRef

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ai_inspire_me_events_with_metadata.json")


class LocalMetadataProvider:
  """Lightweight provider that returns static ideas from ai_inspire_me_events_with_metadata.json."""

  def __init__(self, data_path: str = DATA_PATH) -> None:
    self.data_path = data_path
    self._cache = None

  def _load(self) -> List[dict]:
    if self._cache is not None:
      return self._cache
    try:
      with open(self.data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
      self._cache = data.get("events", [])
    except Exception:
      self._cache = []
    return self._cache

  async def search(self, prefs: UserPreferences) -> List[VenueCandidate]:
    data = self._load()
    vibe = (prefs.vibe or "").lower()
    event_type = (prefs.eventType or "").lower()
    results: List[VenueCandidate] = []

    def score(item: dict) -> int:
      s = 0
      name = (item.get("name") or "").lower()
      category = (item.get("category") or "").lower()
      if name and any(tok in name for tok in vibe.split()):
        s += 2
      if category and category in vibe:
        s += 2
      if category and category in event_type:
        s += 1
      if event_type and event_type in name:
        s += 1
      return s

    ranked = sorted(data, key=score, reverse=True)
    top = [item for item in ranked if score(item) > 0][:5] or ranked[:5]

    for idx, item in enumerate(top):
      results.append(
        VenueCandidate(
          id=f"local-{idx}-{item.get('name','idea')}",
          title=item.get("name") or "Suggested idea",
          category=item.get("category"),
          type="event",
          location=SuggestionLocation(
            name=prefs.location,
            address=prefs.location,
            lat=None,
            lng=None,
          ),
          external=ExternalRef(source="local_metadata", url=None, sourceId=None),
          roughPrice=item.get("budget"),
          description=item.get("description") or item.get("ideal_time"),
        )
      )

    return results
