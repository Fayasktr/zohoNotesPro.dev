# Debug Session: OAuth Redirect Mismatch

## Symptom
Google OAuth fails with `Error 400: redirect_uri_mismatch`.
The requested `redirect_uri` is `http://localhost:4321/auth/google/callback`.

**When:** Occurs during the redirect to Google's consent screen.
**Expected:** Successful redirect to Google sign-in.
**Actual:** Error page showing URI mismatch.

## Evidence
- Redirect URI in error: `http://localhost:4321/auth/google/callback`
- Current `app.js` config: `callbackURL: "/auth/google/callback"` (relative)
- `.env` config: `PORT=4321` (matches error)
- `trust proxy: 1` is enabled in `app.js`.

### Attempt 2
**Testing:** H4 — Render Environment Variables are missing or set to defaults
**Action:** Observed `client_id=dummy_id` in the URL error message from the hosted site. Confirmed that local `app.js` no longer has these defaults.
**Result:** Root cause identified — Render environment lacks the actual Google credentials.
**Conclusion:** CONFIRMED
