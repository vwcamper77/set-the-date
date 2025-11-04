import { useState, useEffect, useRef } from 'react';

const DEBOUNCE_MS = 300;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

const MapboxAutocomplete = ({ setLocation, initialValue = '' }) => {
  const [query, setQuery] = useState(initialValue || '');
  const [suggestions, setSuggestions] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setQuery(initialValue || '');
  }, [initialValue]);

  useEffect(() => {
    const trimmed = query.trim();

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!trimmed) {
      setSuggestions([]);
      setFetchError(null);
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
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          const details = await res.text().catch(() => '');
          if (!controller.signal.aborted) {
            console.warn('Mapbox suggestions request failed', res.status, details);
            setFetchError(res.status === 401 || res.status === 403 ? 'Your location search token is invalid or restricted.' : 'Location search is temporarily unavailable.');
            setSuggestions([]);
          }
          return;
        }

        const data = await res.json();
        if (!controller.signal.aborted) {
          setFetchError(null);
          setSuggestions(data.features || []);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn('Error fetching suggestions:', error);
        if (!controller.signal.aborted) {
          setFetchError('Location search is temporarily unavailable.');
          setSuggestions([]);
        }
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
    setFetchError(null);
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
      {fetchError && (
        <p className="mt-2 text-sm text-red-600">
          {fetchError}
        </p>
      )}
    </div>
  );
};

export default MapboxAutocomplete;
