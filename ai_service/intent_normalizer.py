import json
import os
from typing import Dict, List

DATA_PATH = os.path.join(os.path.dirname(__file__), "ai_inspire_me_events_linked_vibes.json")

_CACHE = None


def _load_vocab() -> List[dict]:
  global _CACHE
  if _CACHE is not None:
    return _CACHE
  try:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
      data = json.load(f)
    _CACHE = data.get("vibes", [])
  except Exception:
    _CACHE = []
  return _CACHE


def normalize_intent(vibe: str, event_type: str) -> Dict[str, List[str]]:
  """Return tags/categories derived from linked vibes metadata to enrich providers."""
  vibe_lower = (vibe or "").lower()
  type_lower = (event_type or "").lower()
  tags: List[str] = []
  categories: List[str] = []

  for entry in _load_vocab():
    label = (entry.get("label") or "").lower()
    if not label:
      continue
    if label in vibe_lower or label in type_lower:
      tags.extend(entry.get("tags", []))
      categories.extend(entry.get("categories", []))

  # de-duplicate while preserving order
  def dedupe(items: List[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for item in items:
      if item and item not in seen:
        seen.add(item)
        out.append(item)
    return out

  return {"tags": dedupe(tags), "categories": dedupe(categories)}
