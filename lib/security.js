// Security headers for HTML that Functions build. Pages' _headers file doesn't apply to Function responses,
// so site/_headers carries the same set for static files; keep the two in sync.
// The CSP is Report-Only until it has been tested against the live page. The script hashes are the inline
// theme scripts in site/index.html and in 404.html / credits.html; recompute them if those scripts change.
export const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Content-Security-Policy-Report-Only": "default-src 'self'; script-src 'self' 'sha256-Nwa/zPZ+Kbj4m2NybTcolWA7jGlvCxeeC41iL77dMyo=' 'sha256-h+KO9wvJ892kZxPvCNNCGdtsWg18lwGQhL+rTKm/thI='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

// A copy of the response with the headers above set (responses from fetch have immutable headers).
export function secure(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
  return out;
}
