const axios = require('axios');

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Scopes: read the user's own private playlists + collaborative ones.
// (Public playlists are readable without any scope, but we want one
// consistent auth flow that covers both.)
const SCOPES = ['playlist-read-private', 'playlist-read-collaborative'].join(' ');

function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens({ code, redirectUri, clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const { data } = await axios.post(SPOTIFY_TOKEN_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  // data: { access_token, token_type, scope, expires_in, refresh_token }
  return data;
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const { data } = await axios.post(SPOTIFY_TOKEN_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  return data; // { access_token, expires_in, ... }
}

async function getCurrentUser(accessToken) {
  const { data } = await axios.get(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

// Fetches ALL of the current user's playlists (public + private + collaborative),
// paging through Spotify's 50-per-page limit.
async function listAllPlaylists(accessToken) {
  const playlists = [];
  let url = `${SPOTIFY_API_BASE}/me/playlists?limit=50`;
  while (url) {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    playlists.push(...data.items);
    url = data.next; // Spotify gives the full next-page URL, or null when done
  }
  return playlists;
}

// Fetches every track in a playlist (paged), returning a flat list of
// { title, artist, album } ready to be matched against YouTube.
async function getPlaylistTracks(accessToken, playlistId) {
  const tracks = [];
  let url = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    for (const item of data.items) {
      const track = item.track;
      if (!track) continue; // local files / removed tracks can come back null
      tracks.push({
        title: track.name,
        artist: (track.artists || []).map((a) => a.name).join(', '),
        album: track.album ? track.album.name : '',
      });
    }
    url = data.next;
  }
  return tracks;
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getCurrentUser,
  listAllPlaylists,
  getPlaylistTracks,
};
