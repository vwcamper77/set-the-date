import asyncio
import logging
import os
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ai_service.llm import get_llm_client
from ai_service.models import (
  UserPreferences,
  SuggestEventsResponse,
  EnrichedSuggestion,
  VenueCandidate,
  SuggestionLocation,
  ExternalRef,
)
from ai_service.providers import build_providers, VenueProvider
from dotenv import load_dotenv

# Load .env file when running locally so provider/LLM keys are picked up.
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_inspire_service")

app = FastAPI(
  title="Set The Date AI Inspire Service",
  version="0.1.0",
  description="Ranks venue and event ideas using LLMs plus provider data.",
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


def _prefilter_candidates(candidates: List[VenueCandidate]) -> List[VenueCandidate]:
  seen = set()
  filtered: List[VenueCandidate] = []
  for cand in candidates:
    key = cand.external.sourceId or cand.title.lower()
    if key in seen:
      continue
    seen.add(key)
    filtered.append(cand)
  return filtered


def _fallback_suggestions(prefs: UserPreferences) -> List[EnrichedSuggestion]:
  """Return simple built-in suggestions when providers/LLM fail (useful for offline/dev)."""
  vibe_lower = prefs.vibe.lower()
  location_text = prefs.location or "nearby"
  base = [
    {
      "title": "Local Pub Night",
      "category": "pub",
      "why": "Easy for a small group to meet up and grab drinks together.",
      "flow": "meals_drinks",
      "query": f"{location_text} pub",
    },
    {
      "title": "Casual Dinner",
      "category": "restaurant",
      "why": "Sit-down spot that works for conversation and food.",
      "flow": "meals_drinks",
      "query": f"{location_text} restaurant",
    },
    {
      "title": "Outdoor Walk",
      "category": "outdoors",
      "why": "Stretch your legs and catch up without needing a booking.",
      "flow": "general",
      "query": f"{location_text} park",
    },
  ]
  if "music" in vibe_lower or "gig" in vibe_lower:
    base.insert(
      0,
      {
        "title": "Live Music Spot",
        "category": "music",
        "why": "Good pick if you want a band and a lively vibe.",
        "flow": "general",
        "query": f"{location_text} live music",
      },
    )
  if "game" in vibe_lower or "board" in vibe_lower:
    base.insert(
      0,
      {
        "title": "Board Game Cafe",
        "category": "games",
        "why": "Tables, games, and snacks make it easy for everyone to join.",
        "flow": "general",
        "query": f"{location_text} board game cafe",
      },
    )

  results: List[EnrichedSuggestion] = []
  for idx, item in enumerate(base[:4]):
    query = item["query"]
    maps_url = f"https://www.google.com/maps/search/?api=1&query={quote(query)}"
    results.append(
      EnrichedSuggestion(
        id=f"fallback-{idx}",
        title=item["title"],
        category=item["category"],
        type="venue",
        recommendedFlow=item["flow"],  # type: ignore[arg-type]
        location=SuggestionLocation(name=location_text, address=None),
        external=ExternalRef(source="fallback", url=maps_url, sourceId=None),
        dateFitSummary="Good for your chosen dates",
        groupFitSummary=f"Works for around {prefs.groupSize} people.",
        whySuitable=item["why"],
        roughPrice=None,
        imageUrl=None,
      )
    )
  return results


async def _gather_provider_results(prefs: UserPreferences, providers: List[VenueProvider]) -> List[VenueCandidate]:
  tasks = [provider.search(prefs) for provider in providers]
  results: List[VenueCandidate] = []
  if not tasks:
    return results

  gathered = await asyncio.gather(*tasks, return_exceptions=True)
  for provider, outcome in zip(providers, gathered):
    if isinstance(outcome, Exception):
      logger.warning("Provider %s failed: %s", provider.__class__.__name__, outcome)
      continue
    results.extend(outcome)
  return results


@app.get("/health")
async def health() -> dict:
  return {"ok": True}


@app.post("/suggest-events", response_model=SuggestEventsResponse)
async def suggest_events(payload: UserPreferences) -> SuggestEventsResponse:
  providers = build_providers()
  if not providers:
    logger.warning("No providers configured; returning empty suggestion list.")

  try:
    raw_candidates = await _gather_provider_results(payload, providers)
  except Exception as exc:
    logger.exception("Provider lookup failed")
    raise HTTPException(status_code=502, detail=f"Provider lookup failed: {exc}") from exc

  raw_candidates = _prefilter_candidates(raw_candidates)[:10]
  llm = get_llm_client()
  try:
    suggestions = await llm.rank_and_annotate(payload, raw_candidates)
  except Exception as exc:
    logger.exception("LLM ranking failed")
    suggestions = []

  if not suggestions and raw_candidates:
    # Fallback: return sanitized provider output even if LLM parsing failed.
    for idx, cand in enumerate(raw_candidates[:5]):
      suggestions.append(
        EnrichedSuggestion(
          id=cand.id or f"direct-{idx}",
          title=cand.title,
          category=cand.category,
          type=cand.type,
          recommendedFlow="general",
          location=cand.location if isinstance(cand.location, SuggestionLocation) else SuggestionLocation(),
          external=cand.external if isinstance(cand.external, ExternalRef) else ExternalRef(),
          dateFitSummary=payload.dateRange.label or "Within your time window",
          groupFitSummary=f"Good for {payload.groupSize} people.",
          whySuitable=cand.description or f"Matches your vibe: {payload.vibe}",
          roughPrice=cand.roughPrice,
        )
      )

  if not suggestions:
    suggestions = _fallback_suggestions(payload)

  return SuggestEventsResponse(suggestions=suggestions or [])


if __name__ == "__main__":
  import uvicorn

  host = os.getenv("HOST", "0.0.0.0")
  port = int(os.getenv("PORT", "8000"))
  uvicorn.run("ai_service.main:app", host=host, port=port, reload=True)
