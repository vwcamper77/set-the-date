import json
import os
from abc import ABC, abstractmethod
from typing import List

import httpx

from ai_service.models import (
  UserPreferences,
  VenueCandidate,
  EnrichedSuggestion,
  SuggestionLocation,
  ExternalRef,
)


def _resolve_flow(prefs: UserPreferences) -> str:
  event_type = prefs.eventType.lower()
  if "meal" in event_type or "drink" in event_type:
    return "meals_drinks"
  if "trip" in event_type or "weekend" in event_type or "holiday" in event_type:
    return "trip"
  if "night" in event_type:
    return "general"
  return "general"


def _fallback_rank(prefs: UserPreferences, raw_results: List[VenueCandidate]) -> List[EnrichedSuggestion]:
  """Simple deterministic ranking used when LLM fails."""
  results: List[EnrichedSuggestion] = []
  flow = _resolve_flow(prefs)
  for idx, item in enumerate(raw_results[:5]):
    results.append(
      EnrichedSuggestion(
        id=item.id or f"suggestion-{idx}",
        title=item.title,
        category=item.category,
        type=item.type,
        recommendedFlow=flow,
        location=item.location if isinstance(item.location, SuggestionLocation) else SuggestionLocation(),
        external=item.external if isinstance(item.external, ExternalRef) else ExternalRef(),
        dateFitSummary="Good for your chosen dates",
        groupFitSummary=f"Works for around {prefs.groupSize} people.",
        whySuitable=item.description or f"Matches the vibe: {prefs.vibe}.",
        roughPrice=item.roughPrice,
        imageUrl=None,
      )
    )
  return results


def _build_prompt(prefs: UserPreferences, raw_results: List[VenueCandidate]) -> str:
  candidates_json = [
    {
      "id": c.id,
      "title": c.title,
      "category": c.category,
      "type": c.type,
      "location": {
        "name": c.location.name,
        "address": c.location.address,
      },
      "external": {"source": c.external.source, "url": c.external.url},
      "price": c.roughPrice,
      "rating": c.rating,
      "description": c.description,
    }
    for c in raw_results[:8]
  ]

  return f"""
You are helping people plan group events. Rank the supplied venue/event candidates and respond with JSON only.
User preferences:
- group size: {prefs.groupSize}
- location: {prefs.location}
- dates: {prefs.dateRange.label or (prefs.dateRange.startDate or '') + ' to ' + (prefs.dateRange.endDate or '')}
- vibe: {prefs.vibe}
- event type: {prefs.eventType}
- budget: {prefs.budgetLevel or 'unknown'}
- accessibility: step free needed = {prefs.accessibility.needsStepFree}

Candidate options (JSON):
{json.dumps(candidates_json, ensure_ascii=False)}

Return a JSON object with a single key "suggestions": a list of up to 5 entries. Each entry must include:
- id (from candidate)
- title
- category
- type ("venue" or "event")
- recommendedFlow ("meals_drinks", "trip", or "general")
- location: name and address if known
- external: source and url
- dateFitSummary
- groupFitSummary
- whySuitable
- roughPrice
Respond with valid JSON only and nothing else.
""".strip()


class LlmClient(ABC):
  @abstractmethod
  async def rank_and_annotate(
    self, user_query: UserPreferences, raw_results: List[VenueCandidate]
  ) -> List[EnrichedSuggestion]:
    raise NotImplementedError


class OllamaLlmClient(LlmClient):
  def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3") -> None:
    self.base_url = base_url.rstrip("/")
    self.model = model

  async def rank_and_annotate(
    self, user_query: UserPreferences, raw_results: List[VenueCandidate]
  ) -> List[EnrichedSuggestion]:
    if not raw_results:
      return []
    prompt = _build_prompt(user_query, raw_results)
    payload = {"model": self.model, "prompt": prompt, "stream": False}
    try:
      async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{self.base_url}/api/generate", json=payload)
        resp.raise_for_status()
        data = resp.json()
        content = data.get("response") or ""
        parsed = json.loads(content)
        suggestions = parsed.get("suggestions", [])
        return [
          EnrichedSuggestion(
            id=item.get("id", f"ollama-{idx}"),
            title=item.get("title", "Suggested option"),
            category=item.get("category"),
            type=item.get("type", "venue"),
            recommendedFlow=item.get("recommendedFlow", _resolve_flow(user_query)),  # type: ignore[arg-type]
            location=SuggestionLocation(**(item.get("location") or {})),
            external=ExternalRef(**(item.get("external") or {})),
            dateFitSummary=item.get("dateFitSummary"),
            groupFitSummary=item.get("groupFitSummary"),
            whySuitable=item.get("whySuitable"),
            roughPrice=item.get("roughPrice"),
            imageUrl=item.get("imageUrl"),
          )
          for idx, item in enumerate(suggestions)
        ]
    except Exception:
      return _fallback_rank(user_query, raw_results)


class HuggingFaceLlmClient(LlmClient):
  def __init__(self, api_token: str, model: str = "tiiuae/falcon-7b-instruct") -> None:
    self.api_token = api_token
    self.model = model
    self.api_url = f"https://api-inference.huggingface.co/models/{model}"

  async def rank_and_annotate(
    self, user_query: UserPreferences, raw_results: List[VenueCandidate]
  ) -> List[EnrichedSuggestion]:
    if not raw_results:
      return []
    prompt = _build_prompt(user_query, raw_results)
    headers = {"Authorization": f"Bearer {self.api_token}"}
    payload = {
      "inputs": prompt,
      "parameters": {"max_new_tokens": 400, "temperature": 0.2},
    }
    try:
      async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        resp = await client.post(self.api_url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and data and "generated_text" in data[0]:
          text = data[0]["generated_text"]
        else:
          text = json.dumps(data)
        parsed = json.loads(text)
        suggestions = parsed.get("suggestions", [])
        return [
          EnrichedSuggestion(
            id=item.get("id", f"huggingface-{idx}"),
            title=item.get("title", "Suggested option"),
            category=item.get("category"),
            type=item.get("type", "venue"),
            recommendedFlow=item.get("recommendedFlow", _resolve_flow(user_query)),  # type: ignore[arg-type]
            location=SuggestionLocation(**(item.get("location") or {})),
            external=ExternalRef(**(item.get("external") or {})),
            dateFitSummary=item.get("dateFitSummary"),
            groupFitSummary=item.get("groupFitSummary"),
            whySuitable=item.get("whySuitable"),
            roughPrice=item.get("roughPrice"),
            imageUrl=item.get("imageUrl"),
          )
          for idx, item in enumerate(suggestions)
        ]
    except Exception:
      return _fallback_rank(user_query, raw_results)


class GeminiLlmClient(LlmClient):
  def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
    self.api_key = api_key
    self.model = model

  async def rank_and_annotate(
    self, user_query: UserPreferences, raw_results: List[VenueCandidate]
  ) -> List[EnrichedSuggestion]:
    if not raw_results:
      return []
    prompt = _build_prompt(user_query, raw_results)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
    payload = {
      "contents": [{"parts": [{"text": prompt}]}],
      "generationConfig": {"temperature": 0.2, "maxOutputTokens": 500},
    }
    try:
      async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        parts = (
          data.get("candidates", [{}])[0]
          .get("content", {})
          .get("parts", [])
        )
        text = ""
        for part in parts:
          if isinstance(part, dict) and "text" in part:
            text += part["text"]
        parsed = json.loads(text or "{}")
        suggestions = parsed.get("suggestions", [])
        return [
          EnrichedSuggestion(
            id=item.get("id", f"gemini-{idx}"),
            title=item.get("title", "Suggested option"),
            category=item.get("category"),
            type=item.get("type", "venue"),
            recommendedFlow=item.get("recommendedFlow", _resolve_flow(user_query)),  # type: ignore[arg-type]
            location=SuggestionLocation(**(item.get("location") or {})),
            external=ExternalRef(**(item.get("external") or {})),
            dateFitSummary=item.get("dateFitSummary"),
            groupFitSummary=item.get("groupFitSummary"),
            whySuitable=item.get("whySuitable"),
            roughPrice=item.get("roughPrice"),
            imageUrl=item.get("imageUrl"),
          )
          for idx, item in enumerate(suggestions)
        ]
    except Exception:
      return _fallback_rank(user_query, raw_results)


def get_llm_client() -> LlmClient:
  backend = os.getenv("AI_BACKEND", "ollama").lower()
  if backend in ("gemini", "google"):
    token = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    if not token:
      raise RuntimeError("GEMINI_API_KEY is required for Gemini backend")
    return GeminiLlmClient(api_key=token, model=model)
  if backend == "huggingface":
    token = os.getenv("HUGGINGFACE_API_TOKEN")
    model = os.getenv("HUGGINGFACE_MODEL", "tiiuae/falcon-7b-instruct")
    if not token:
      raise RuntimeError("HUGGINGFACE_API_TOKEN is required for Hugging Face backend")
    return HuggingFaceLlmClient(api_token=token, model=model)

  model = os.getenv("OLLAMA_MODEL", "llama3")
  host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
  return OllamaLlmClient(base_url=host, model=model)
