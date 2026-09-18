const crypto = require('crypto');
const express = require('express');
const spotify = require('../services/spotifyApi');

function spotifyAuthRouter() {
  const router = express.Router();
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = `${process.env.BASE_URL}/auth/spotify/callback`;

  router.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.spotifyState = state;
    const url = spotify.buildAuthUrl({ clientId, redirectUri, state });
    res.redirect(url);
  });

  router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/?error=spotify_${error}`);
    if (!state || state !== req.session.spotifyState) {
      return res.redirect('/?error=spotify_state_mismatch');
    }
    try {
      const tokens = await spotify.exchangeCodeForTokens({
        code,
        redirectUri,
        clientId,
        clientSecret,
      });
      const profile = await spotify.getCurrentUser(tokens.access_token);
      req.session.spotify = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        displayName: profile.display_name || profile.id,
      };
      res.redirect('/?connected=spotify');
    } catch (err) {
      console.error('Spotify callback error:', err.response?.data || err.message);
      res.redirect('/?error=spotify_token_exchange_failed');
    }
  });

  return router;
}

module.exports = { spotifyAuthRouter };
