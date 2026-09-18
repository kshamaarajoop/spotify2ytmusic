const crypto = require('crypto');
const express = require('express');
const youtube = require('../services/youtubeApi');

function googleAuthRouter() {
  const router = express.Router();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.BASE_URL}/auth/google/callback`;

  router.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.googleState = state;
    const oauthClient = youtube.buildOAuthClient({ clientId, clientSecret, redirectUri });
    res.redirect(youtube.buildAuthUrl(oauthClient, state));
  });

  router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/?error=google_${error}`);
    if (!state || state !== req.session.googleState) {
      return res.redirect('/?error=google_state_mismatch');
    }
    try {
      const oauthClient = youtube.buildOAuthClient({ clientId, clientSecret, redirectUri });
      const tokens = await youtube.exchangeCodeForTokens(oauthClient, code);
      req.session.google = tokens; // { access_token, refresh_token, expiry_date }
      res.redirect('/?connected=google');
    } catch (err) {
      console.error('Google callback error:', err.message);
      res.redirect('/?error=google_token_exchange_failed');
    }
  });

  return router;
}

module.exports = { googleAuthRouter };
