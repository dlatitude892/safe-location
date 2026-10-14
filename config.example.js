// Safe Location settings that should NOT be committed to Git.
//
// 1. Copy this file and name the copy config.js (in the same folder).
// 2. Fill in your values below. config.js is listed in .gitignore, so it stays on your computer.
//
// The site works without config.js; anything left empty simply falls back to the default behaviour.
window.SAFE_LOCATION_CONFIG = {
  // Free CARTO basemaps key for the "Dark" map style. Request one at https://carto.com/basemaps/apikey
  // (no account needed, the key arrives by email). Free for non-commercial use up to 5 million tile
  // requests per month. Without a key, "Dark" uses recoloured OpenStreetMap tiles instead.
  cartoApiKey: "",

  // Set to false to hide accounts and backup and keep history on this device only.
  // (The site must be opened from the Safe Location server, `npm run dev`, for accounts to work.)
  sync: true
};
