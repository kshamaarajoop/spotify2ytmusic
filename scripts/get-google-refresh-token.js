// Run this ONCE to get a Google refresh token for the CLI migration script.
// The web app (server/) keeps tokens in a browser session because it's a
// live server; this script has no browser session to keep, so instead it
// gets a refresh_token you save to .env and reuse on every future run.
//
// Reuses the exact same OAuth helper functions the web app uses
// (server/services/youtubeApi.js) - no new auth logic, just a different
// place to run it and a different place to put the result.
//
// Setup: add this script's redirect URI as an Authorized redirect URI on
// the SAME Google Cloud OAuth client you already created:
//   http://127.0.0.1:5555/oauth-callback
//
// Usage: node scripts/get-google-refresh-token.js

require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const youtube = require('../server/services/youtubeApi');

const PORT = 3000;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth-callback`;

async function main() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env first.');
    process.exit(1);
  }

  const oauthClient = youtube.buildOAuthClient({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname !== '/oauth-callback') {
      res.end('Waiting for /oauth-callback...');
      return;
    }

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      console.error(`Google returned an error: ${error}`);
      res.end('Login failed - see terminal.');
      server.close();
      return;
    }

    try {
      const tokens = await youtube.exchangeCodeForTokens(oauthClient, code);
      if (!tokens.refresh_token) {
        console.error(
          '\nNo refresh_token in the response. Google only issues one the FIRST time you ' +
            'grant consent to an app. If you have already authorized this app before, revoke ' +
            'it at https://myaccount.google.com/permissions and run this script again.'
        );
        res.end('No refresh token returned - see terminal for how to fix this.');
        return;
      }
      console.log('\nSuccess! Add this line to your .env file:\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      res.end('Done - you can close this tab and go back to the terminal.');
    } catch (err) {
      console.error('Token exchange failed:', err.message);
      res.end('Token exchange failed - see terminal.');
    } finally {
      server.close();
    }
  });

  server.listen(PORT, () => {
    const authUrl = youtube.buildAuthUrl(oauthClient, 'cli-onetime-setup');
    console.log('Open this URL in your browser and approve access:\n');
    console.log(authUrl, '\n');
  });
}

main();
