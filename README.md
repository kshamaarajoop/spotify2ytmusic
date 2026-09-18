# Spotify → YouTube Music playlist migrator

Node/Express app that lets a user log in to Spotify and YouTube (via OAuth),
pick one of their Spotify playlists (public, private, or collaborative), and
create a matching playlist on YouTube Music.

## How matching works

For each Spotify track we call the YouTube Data API's `search.list` with
`"<artist> - <title>"` restricted to the Music category, take the first
result, and add it to a newly created (private) YouTube playlist.

**Quota constraint (important):** `search.list` costs 100 quota units, and a
new Google Cloud project gets 10,000 units/day by default — so you can match
roughly **90–100 tracks per day** until Google approves a quota increase
request. The app stops gracefully and tells the user to retry tomorrow if it
runs out mid-migration, rather than failing outright.

## 1. Register OAuth apps

**Spotify** — https://developer.spotify.com/dashboard
1. Create an app.
2. Add Redirect URI: `<BASE_URL>/auth/spotify/callback`
   (e.g. `https://your-app.onrender.com/auth/spotify/callback`, or
   `http://localhost:3000/auth/spotify/callback` for local dev)
3. Copy the Client ID and Client Secret.

**Google / YouTube** — https://console.cloud.google.com
1. Create a project, then enable **YouTube Data API v3** under "APIs & Services".
2. Configure the OAuth consent screen (External, add the `youtube` scope).
   While the app is unpublished/in testing, only accounts you add as test
   users can log in — fine for personal use, but note this if you want other
   people to use it.
3. Create an OAuth Client ID, type **Web application**.
4. Add Authorized redirect URI: `<BASE_URL>/auth/google/callback`
5. Copy the Client ID and Client Secret.

## 2. Local setup

```bash
npm install
cp .env.example .env
# fill in .env with the values from step 1
npm start
```

Visit http://localhost:3000, connect both accounts, pick a playlist, migrate.

## 3. Deploy (Render free tier)

1. Push this folder to a GitHub repo.
2. On Render: New → Web Service → connect the repo. `render.yaml` pre-fills
   the build/start commands.
3. Set the env vars in the Render dashboard (`BASE_URL` = your Render URL,
   plus the Spotify/Google credentials from step 1).
4. **Update the redirect URIs** in both the Spotify and Google consoles to
   use the real Render URL, not localhost.

Railway and Fly.io work the same way — same env vars, same redirect-URI
update — this app has no Render-specific code.

## Known limitations / next steps

- Sessions (and OAuth tokens) live in server memory (`express-session`'s
  default store). They're wiped on every restart, and this won't work if you
  ever scale to more than one instance. Fine for personal/demo use; swap in
  `connect-redis` or a database-backed store before sharing this widely.
- Migration runs synchronously in one HTTP request. For very large playlists
  this could be slow enough to hit a host's request timeout — a next step
  would be to stream progress over Server-Sent Events or a background job
  queue instead.
- Track matching is a single best-guess YouTube search; it can occasionally
  pick a cover, live version, or lyric video instead of the original.
- Publishing the Google OAuth consent screen (so any user can log in, not
  just added test users) requires Google's app verification process.
# spotify2ytmusic
