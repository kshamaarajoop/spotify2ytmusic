// Reads data/playlists.json (produced by scrape-spotify.js) and migrates
// every playlist in it to YouTube Music - reusing createPlaylist /
// findBestMatch / addVideoToPlaylist from server/services/youtubeApi.js
// completely unchanged. This script is the only thing that's new; the
// YouTube-side logic is identical to the live web app.
//
// Usage: node scripts/migrate-from-json.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const youtube = require('../server/services/youtubeApi');

const INPUT_FILE = path.join(__dirname, '..', 'data', 'playlists.json');
const RESULTS_DIR = path.join(__dirname, '..', 'data', 'results');
// Only used to satisfy the OAuth2 client constructor - refresh-token auth
// never redirects anywhere, so this value is never actually visited.
const REDIRECT_URI = 'http://127.0.0.1:5555/oauth-callback';

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`No scraped data found at ${INPUT_FILE}.\nRun node scripts/scrape-spotify.js first.`);
    process.exit(1);
  }
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.error('GOOGLE_REFRESH_TOKEN is missing from .env.\nRun node scripts/get-google-refresh-token.js once first.');
    process.exit(1);
  }

  const oauthClient = youtube.buildOAuthClient({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
  });
  // googleapis auto-refreshes the access token from this refresh_token on
  // the first API call - no browser step needed.
  const yt = youtube.youtubeClient(oauthClient, { refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const playlists = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  let quotaExhausted = false;

  for (const playlist of playlists) {
    if (quotaExhausted) {
      console.log(`\nSkipping "${playlist.name}" - quota already exhausted for today. Re-run tomorrow.`);
      continue;
    }

    console.log(`\nMigrating "${playlist.name}" (${playlist.tracks.length} tracks)...`);
    const newPlaylistId = await youtube.createPlaylist(yt, {
      title: playlist.name,
      description: 'Migrated from Spotify',
    });
    console.log(`  Created: https://music.youtube.com/playlist?list=${newPlaylistId}`);

    const results = [];
    for (const track of playlist.tracks) {
      if (quotaExhausted) {
        results.push({ ...track, status: 'skipped_quota' });
        continue;
      }
      try {
        const videoId = await youtube.findBestMatch(yt, track);
        if (!videoId) {
          results.push({ ...track, status: 'no_match' });
          console.log(`  no match: ${track.artist} - ${track.title}`);
          continue;
        }
        await youtube.addVideoToPlaylist(yt, { playlistId: newPlaylistId, videoId });
        results.push({ ...track, status: 'added', videoId });
        console.log(`  added: ${track.artist} - ${track.title}`);
      } catch (err) {
        const reason = err.errors?.[0]?.reason || err.message;
        if (reason === 'quotaExceeded') {
          quotaExhausted = true;
          results.push({ ...track, status: 'skipped_quota' });
          console.log('  YouTube daily quota exhausted - stopping here, re-run tomorrow to continue.');
        } else {
          results.push({ ...track, status: 'error', reason });
          console.log(`  error: ${track.artist} - ${track.title} (${reason})`);
        }
      }
    }

    const added = results.filter((r) => r.status === 'added').length;
    console.log(`  Done: ${added}/${results.length} added.`);

    const resultFile = path.join(RESULTS_DIR, `${playlist.id}.json`);
    fs.writeFileSync(resultFile, JSON.stringify({ playlist: playlist.name, newPlaylistId, results }, null, 2));
  }

  console.log(`\nAll done. Per-playlist results saved under ${RESULTS_DIR}`);
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
