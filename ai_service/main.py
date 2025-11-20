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

  return SuggestEventsResponse(suggestions=suggestions or [])


if __name__ == "__main__":
  import uvicorn

  host = os.getenv("HOST", "0.0.0.0")
  port = int(os.getenv("PORT", "8000"))
  uvicorn.run("ai_service.main:app", host=host, port=port, reload=True)
