# Spotify → YouTube Music playlist migrator

CLI tool that reads your Spotify playlists from Spotify's public data (no
Spotify login, no Spotify developer app) and recreates them on YouTube
Music via the official YouTube Data API v3. A full OAuth web app also
exists in this repo but currently can't be used as a genuinely public
site — see "Web app" near the bottom.

## How it works

Two scripts, with `data/playlists.json` passed between them:

1. **`scripts/scrape_with_spotifyscraper.py`** — reads your Spotify
   playlists via the `spotifyscraper` library. This goes through Spotify's
   own GraphQL Pathfinder API (the same one open.spotify.com's frontend
   itself uses), not the official public Web API — which, as of Spotify's
   February 2026 changes, restricts playlist-track reads to the account
   that owns the playlist, making it unusable for this kind of tool.
   Writes `data/playlists.json`.
2. **`scripts/migrate-from-json.js`** — reads that file, creates a matching
   private playlist on YouTube Music for each entry, and searches + adds
   every track via the real YouTube Data API v3.

No Spotify login or registered Spotify app is involved anywhere in this
flow. YouTube still needs a one-time Google OAuth login, since actually
writing a playlist to a real account requires it — but only once, not on
every run.

## Setup

### 1. Install dependencies
```bash
npm install
pip install spotifyscraper
```

### 2. Register a Google Cloud OAuth app (YouTube side only)

Nothing needs registering on the Spotify side for this flow.

1. https://console.cloud.google.com → new project → enable **YouTube Data API v3**
2. OAuth consent screen: External, add scope
   `https://www.googleapis.com/auth/youtube`, add yourself as a test user
3. Create an OAuth Client ID, type **Web application**
4. Authorized redirect URI: `http://127.0.0.1:3000/oauth-callback`

### 3. Configure environment
```bash
cp .env.example .env
# fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
```

### 4. One-time Google login
```bash
node scripts/get-google-refresh-token.js
```
Opens a URL — approve access once in your browser. The terminal then
prints a `GOOGLE_REFRESH_TOKEN=...` line; paste it into `.env`. Every
future run reuses this automatically; no browser step again unless you
revoke access.

### 5. List which playlists to migrate
```bash
cp scripts/playlists-to-scrape.example.json scripts/playlists-to-scrape.json
# edit it with your playlists' share links or IDs
```
Each playlist must be set to **Public** in Spotify to be readable this way.

## Running it

```bash
python3 scripts/scrape_with_spotifyscraper.py   # Spotify -> data/playlists.json
node scripts/migrate-from-json.js                # data/playlists.json -> YouTube Music
```

Per-playlist results (which tracks matched, which didn't, and why) are
saved to `data/results/<playlistId>.json` after each run.

## The YouTube quota constraint (important)

Each track match costs one `search.list` call — 100 quota units against
Google's default 10,000-unit daily budget, so roughly **90–100 tracks per
day** until you request a quota increase from Google. If the quota runs
out mid-migration, the script stops gracefully, logs which tracks were
skipped, and tells you to re-run tomorrow — nothing already added is lost
or redone.

## Known limitations

- Track matching is a single best-guess YouTube search — it can
  occasionally pick a cover, live version, or lyric video instead of the
  original.
- The one-time Google login supports one YouTube account at a time
  (whichever refresh token is in `.env`). Migrating to a different account
  means re-running `get-google-refresh-token.js` and overwriting it.
- `scripts/scrape-spotify.js` — an earlier, pure-Node scraper using an
  anonymous Spotify token — is kept in the repo for reference but no
  longer works: Spotify's February 2026 API changes restrict the endpoint
  it calls to the playlist's *owning* account, which an anonymous token
  can never be. Use `scrape_with_spotifyscraper.py` instead.
- `spotifyscraper` goes through an undocumented (though actively
  maintained) endpoint, not Spotify's official API. Treat this as a
  personal-project technique — not something to run at real volume or
  point at playlists other than your own.
- Re-running a migration for a playlist you already migrated creates a
  **second, duplicate** YouTube playlist rather than updating the first.

## Project structure

```
playlist-migrator/
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── render.yaml
├── docs/
│   └── BUILD-LOG.md
│
├── scripts/                          ← what you actually run
│   ├── playlists-to-scrape.example.json
│   ├── playlists-to-scrape.json        (gitignored — your real list)
│   ├── scrape_with_spotifyscraper.py   Spotify -> data/playlists.json (use this one)
│   ├── scrape-spotify.js               older Node scraper, no longer works (kept for reference)
│   ├── get-google-refresh-token.js     one-time Google login -> refresh token for .env
│   └── migrate-from-json.js            data/playlists.json -> YouTube Music
│
├── data/                              ← gitignored entirely
│   ├── playlists.json                  scraper output
│   └── results/<playlistId>.json       per-playlist migration logs
│
├── server/                           ←
│   ├── services/youtubeApi.js   youtubeApi.js is shared with scripts/migrate-from-json.js

```
