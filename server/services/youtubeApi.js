const { google } = require('googleapis');

// Only scope we need: manage the user's own YouTube account (create playlists,
// add items to them). Read-only search does not require auth at all, but we
// keep everything under one authenticated client for simplicity.
const SCOPES = ['https://www.googleapis.com/auth/youtube'];

function buildOAuthClient({ clientId, clientSecret, redirectUri }) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function buildAuthUrl(oauthClient, state) {
  return oauthClient.generateAuthUrl({
    access_type: 'offline', // needed to get a refresh_token
    prompt: 'consent', // force refresh_token on every login during dev
    scope: SCOPES,
    state,
  });
}

async function exchangeCodeForTokens(oauthClient, code) {
  const { tokens } = await oauthClient.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, ... }
}

function youtubeClient(oauthClient, tokens) {
  oauthClient.setCredentials(tokens);
  return google.youtube({ version: 'v3', auth: oauthClient });
}

// Searches YouTube for the best-guess match of a Spotify track.
// This is the expensive call: search.list costs 100 quota units against a
// default 10,000/day budget, i.e. ~90-100 of these per day per project.
async function findBestMatch(youtube, { title, artist }) {
  const query = `${artist} - ${title}`;
  const res = await youtube.search.list({
    part: 'snippet',
    q: query,
    type: 'video',
    videoCategoryId: '10', // "Music" category
    maxResults: 1,
  });
  const item = res.data.items && res.data.items[0];
  return item ? item.id.videoId : null;
}

async function createPlaylist(youtube, { title, description }) {
  const res = await youtube.playlists.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: { title, description },
      status: { privacyStatus: 'private' },
    },
  });
  return res.data.id;
}

async function addVideoToPlaylist(youtube, { playlistId, videoId }) {
  await youtube.playlistItems.insert({
    part: 'snippet',
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
  });
}

module.exports = {
  buildOAuthClient,
  buildAuthUrl,
  exchangeCodeForTokens,
  youtubeClient,
  findBestMatch,
  createPlaylist,
  addVideoToPlaylist,
};
