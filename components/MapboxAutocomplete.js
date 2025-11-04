import { useState, useEffect, useRef } from 'react';

const DEBOUNCE_MS = 300;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

const MapboxAutocomplete = ({ setLocation }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const abortRef = useRef(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!trimmed) {
      setSuggestions([]);
      return;
    }

    if (!MAPBOX_TOKEN) {
      console.warn('Missing Mapbox access token');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error(`Mapbox response ${res.status}`);
        }
        const data = await res.json();
        if (!controller.signal.aborted) {
          setSuggestions(data.features || []);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error fetching suggestions:', error);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  const handleSelectLocation = (location) => {
    // Format the location to include only the city and region (if required)
    const formattedLocation = formatLocation(location);

    // Update the parent component with the selected location
    setLocation(formattedLocation);
    setQuery(formattedLocation); // Set input field to the selected location
    setSuggestions([]); // Clear suggestions list after selecting
  };

  const formatLocation = (location) => {
    const parts = location.split(',');
    if (parts.length > 2) {
      return parts.slice(0, 2).join(', '); // Only show city and region
    }
    return location; // Return full location in case of fewer parts
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Search for location"
        value={query}  // Keep the selected location in the input
        onChange={(e) => setQuery(e.target.value)}  // Update query as user types
        className="w-full border p-2 rounded mb-4"
      />
      {suggestions.length > 0 && (
        <ul className="bg-white border rounded shadow-lg w-full">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              className="p-2 cursor-pointer"
              onClick={() => handleSelectLocation(suggestion.place_name)} // Select location on click
            >
              {suggestion.place_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MapboxAutocomplete;
