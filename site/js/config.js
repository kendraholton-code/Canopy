/*
 * Site configuration — the only file to edit when going live.
 *
 * API_URL:
 *   "demo"   → runs the engine inside the browser with labelled sample data (nothing is sent)
 *   "/api"   → the local test server (node local/server.js)
 *   "https://script.google.com/macros/s/XXXX/exec" → the live Apps Script web app
 */
window.CANOPY_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzqxNL2Y2UrW1cBz3jVyeyS6ucoCGRDMatt7oulC7OsiztXK945NkrVIHT-cLxZzwR6uw/exec',
  // Shown if the live service cannot be reached.
  FALLBACK_MESSAGE: 'The Canopy service is not reachable right now. Please try again shortly.'
};
