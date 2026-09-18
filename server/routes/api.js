const express = require('express');
const spotify = require('../services/spotifyApi');
const youtube = require('../services/youtubeApi');

function requireSpotify(req, res, next) {
  if (!req.session.spotify) return res.status(401).json({ error: 'Connect Spotify first.' });
  next();
}

function requireGoogle(req, res, next) {
  if (!req.session.google) return res.status(401).json({ error: 'Connect YouTube first.' });
  next();
}

function apiRouter() {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({
      spotify: req.session.spotify ? { displayName: req.session.spotify.displayName } : null,
      google: !!req.session.google,
    });
  });

  // List every playlist (public + private + collaborative) the logged-in
  // Spotify user owns or follows.
  router.get('/playlists', requireSpotify, async (req, res) => {
    try {
      const items = await spotify.listAllPlaylists(req.session.spotify.accessToken);
      res.json(
        items.map((p) => ({
          id: p.id,
          name: p.name,
          trackCount: p.tracks.total,
          public: p.public,
          owner: p.owner ? p.owner.display_name : null,
        }))
      );
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.status(502).json({ error: 'Could not fetch Spotify playlists.' });
    }
  });

  // Migrates one playlist: reads its tracks from Spotify, searches YouTube
  // for each, creates a new (private) YouTube playlist, and adds matches.
  //
  // NOTE: YouTube's search.list costs 100 quota units per call against a
  // default 10,000-unit daily budget - so this endpoint can only make
  // roughly 90-100 track matches per day until a quota increase is granted.
  // If the quota runs out mid-migration, we stop and return what we have
  // so far rather than failing the whole request.
  router.post('/migrate/:playlistId', requireSpotify, requireGoogle, async (req, res) => {
    const { playlistId } = req.params;
    try {
      const [spotifyTracks, playlistMeta] = await Promise.all([
        spotify.getPlaylistTracks(req.session.spotify.accessToken, playlistId),
        fetchPlaylistName(req.session.spotify.accessToken, playlistId),
      ]);

      const oauthClient = youtube.buildOAuthClient({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${process.env.BASE_URL}/auth/google/callback`,
      });
      const yt = youtube.youtubeClient(oauthClient, req.session.google);

      const newPlaylistId = await youtube.createPlaylist(yt, {
        title: playlistMeta,
        description: 'Migrated from Spotify',
      });

      const results = [];
      let quotaExhausted = false;

      for (const track of spotifyTracks) {
        if (quotaExhausted) {
          results.push({ ...track, status: 'skipped_quota' });
          continue;
        }
        try {
          const videoId = await youtube.findBestMatch(yt, track);
          if (!videoId) {
            results.push({ ...track, status: 'no_match' });
            continue;
          }
          await youtube.addVideoToPlaylist(yt, { playlistId: newPlaylistId, videoId });
          results.push({ ...track, status: 'added', videoId });
        } catch (err) {
          const reason = err.errors?.[0]?.reason || err.message;
          if (reason === 'quotaExceeded') {
            quotaExhausted = true;
            results.push({ ...track, status: 'skipped_quota' });
          } else {
            results.push({ ...track, status: 'error', reason });
          }
        }
      }

      res.json({
        youtubePlaylistId: newPlaylistId,
        youtubePlaylistUrl: `https://music.youtube.com/playlist?list=${newPlaylistId}`,
        total: results.length,
        added: results.filter((r) => r.status === 'added').length,
        quotaExhausted,
        results,
      });
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.status(500).json({ error: 'Migration failed.' });
    }
  });

  return router;
}

async function fetchPlaylistName(accessToken, playlistId) {
  // Cheap lookup just for a title - reuse the tracks call's own playlist,
  // or fall back to a generic name if anything goes wrong.
  try {
    const axios = require('axios');
    const { data } = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data.name;
  } catch {
    return 'Migrated Spotify Playlist';
  }
}

module.exports = { apiRouter };
