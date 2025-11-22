import { useState, useEffect, useRef } from 'react';

const DEBOUNCE_MS = 300;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

const MapboxAutocomplete = ({ setLocation, initialValue = '' }) => {
  const [query, setQuery] = useState(initialValue || '');
  const [suggestions, setSuggestions] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  const abortRef = useRef(null);
  const skipNextFetchRef = useRef(false); // prevents a new fetch immediately after picking a suggestion

  useEffect(() => {
    setQuery(initialValue || '');
  }, [initialValue]);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    if (!isFocused) {
      return;
    }

    const trimmed = query.trim();

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!MAPBOX_TOKEN) {
      console.warn('Missing Mapbox access token');
      setFetchError('Location search is unavailable right now, but you can still type a place name manually.');
      return;
    }

    if (!trimmed) {
      setSuggestions([]);
      setFetchError(null);
      setLocation('');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          trimmed
        )}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5&types=address,place,poi,locality`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          const details = await res.text().catch(() => '');
          if (!controller.signal.aborted) {
            console.warn('Mapbox suggestions request failed', res.status, details);
            setFetchError(
              res.status === 401 || res.status === 403
                ? 'Your location search token is invalid or restricted.'
                : 'Location search is temporarily unavailable.'
            );
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
  }, [query, isFocused, setLocation]);

  const handleSelectLocation = (location) => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    skipNextFetchRef.current = true;

    const formattedLocation = location;

    setLocation(formattedLocation);
    setQuery(formattedLocation);
    setSuggestions([]);
    setFetchError(null);
  };

  return (
    <div>
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search for location"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            if (value.trim()) {
              setLocation(value);
            } else {
              setLocation('');
              setSuggestions([]);
              setFetchError(null);
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            if (!query.trim()) {
              setLocation('');
              setSuggestions([]);
              setFetchError(null);
            }
          }}
          className="w-full border p-2 rounded pr-20 overflow-x-auto whitespace-nowrap"
        />
        {query?.length > 0 && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600 underline-offset-2 hover:underline z-10 bg-white px-1"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              setLocation('');
              setSuggestions([]);
              setFetchError(null);
            }}
          >
            Clear
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <ul className="bg-white border rounded shadow-lg w-full">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              className="p-2 cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectLocation(suggestion.place_name);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                handleSelectLocation(suggestion.place_name);
              }}
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
