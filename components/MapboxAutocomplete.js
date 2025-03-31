import { useState, useEffect } from 'react';

const MapboxAutocomplete = ({ setLocation }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}&autocomplete=true&limit=5`
        );
        const data = await res.json();
        setSuggestions(data.features || []);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      }
    };

    fetchSuggestions();
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
