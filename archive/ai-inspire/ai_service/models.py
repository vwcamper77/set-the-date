from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class DateRange(BaseModel):
  """Date window supplied by the frontend."""

  mode: Literal["relative", "explicit"]
  label: Optional[str] = None
  startDate: Optional[str] = None
  endDate: Optional[str] = None


class AccessibilityPrefs(BaseModel):
  needsStepFree: bool = False


class UserPreferences(BaseModel):
  """Top level request payload shared between the UI and service."""

  groupSize: int = Field(..., ge=1)
  location: str = Field(..., min_length=2)
  dateRange: DateRange
  vibe: str = Field(..., min_length=2)
  eventType: str = Field(..., min_length=2)
  budgetLevel: Optional[str] = None
  accessibility: AccessibilityPrefs = AccessibilityPrefs()
  ageRangeHint: Optional[str] = None
  refreshToken: Optional[int | str] = None


class SuggestionLocation(BaseModel):
  name: Optional[str] = None
  address: Optional[str] = None
  lat: Optional[float] = None
  lng: Optional[float] = None


class ExternalRef(BaseModel):
  source: Optional[str] = None
  url: Optional[str] = None
  sourceId: Optional[str] = None


class VenueCandidate(BaseModel):
  """Raw venue or event record returned by a provider before LLM ranking."""

  id: str
  title: str
  category: Optional[str] = None
  type: Literal["venue", "event"] = "venue"
  location: SuggestionLocation = SuggestionLocation()
  external: ExternalRef = ExternalRef()
  roughPrice: Optional[str] = None
  rating: Optional[float] = None
  description: Optional[str] = None


class EnrichedSuggestion(BaseModel):
  """LLM-ranked suggestion returned to the Next.js app."""

  id: str
  title: str
  category: Optional[str] = None
  type: Literal["venue", "event"] = "venue"
  recommendedFlow: Literal["meals_drinks", "trip", "general"] = "general"
  location: SuggestionLocation = SuggestionLocation()
  external: ExternalRef = ExternalRef()
  dateFitSummary: Optional[str] = None
  groupFitSummary: Optional[str] = None
  whySuitable: Optional[str] = None
  roughPrice: Optional[str] = None
  imageUrl: Optional[str] = None


class SuggestEventsResponse(BaseModel):
  suggestions: List[EnrichedSuggestion] = []
