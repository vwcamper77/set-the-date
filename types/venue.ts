export interface VenueEvent {
  id: string; // Unique ID (uuid or timestamp)
  title: string; // e.g., "Opera Night at Bella Vita"
  description: string; // e.g., "Special set menu + live music. Limited tables."
  fixedDate: string | null; // ISO Date String (YYYY-MM-DD) or null if flexible
  isActive: boolean; // To toggle visibility without deleting
}

export interface Venue {
  slug: string;
  venueName: string;
  featuredEvents?: VenueEvent[];
  [key: string]: any;
}
