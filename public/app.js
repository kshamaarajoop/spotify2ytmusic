async function refreshStatus() {
  const res = await fetch('/api/status');
  const status = await res.json();

  const spotifyStatusEl = document.getElementById('spotify-status');
  const googleStatusEl = document.getElementById('google-status');

  spotifyStatusEl.textContent = status.spotify
    ? `Connected as ${status.spotify.displayName}`
    : 'Not connected';
  googleStatusEl.textContent = status.google ? 'Connected' : 'Not connected';

  if (status.spotify && status.google) {
    document.getElementById('playlists-section').hidden = false;
    loadPlaylists();
  }
}

async function loadPlaylists() {
  const listEl = document.getElementById('playlists-list');
  listEl.textContent = 'Loading your Spotify playlists…';
  try {
    const res = await fetch('/api/playlists');
    if (!res.ok) throw new Error((await res.json()).error);
    const playlists = await res.json();
    listEl.innerHTML = '';
    for (const p of playlists) {
      const row = document.createElement('div');
      row.className = 'playlist-row';
      row.innerHTML = `
        <span>${escapeHtml(p.name)} · ${p.trackCount} tracks ${p.public ? '' : '(private)'}</span>
        <button data-id="${p.id}">Migrate</button>
      `;
      row.querySelector('button').addEventListener('click', (e) => migrate(p.id, e.target));
      listEl.appendChild(row);
    }
  } catch (err) {
    listEl.textContent = `Could not load playlists: ${err.message}`;
  }
}

async function migrate(playlistId, buttonEl) {
  buttonEl.disabled = true;
  buttonEl.textContent = 'Migrating…';
  try {
    const res = await fetch(`/api/migrate/${playlistId}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Migration failed');
    showResult(data);
  } catch (err) {
    showError(err.message);
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = 'Migrate';
  }
}

function showResult(data) {
  const section = document.getElementById('result-section');
  section.hidden = false;
  document.getElementById('result-summary').innerHTML = `
    Added <strong>${data.added}</strong> / ${data.total} tracks to
    <a href="${data.youtubePlaylistUrl}" target="_blank" rel="noopener">your new YouTube Music playlist</a>.
    ${data.quotaExhausted ? '<br><em>Stopped early: YouTube\'s daily search quota ran out. Re-run this playlist tomorrow to pick up the rest.</em>' : ''}
  `;
  const rows = data.results
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.title)}</td>
        <td>${escapeHtml(r.artist)}</td>
        <td class="status-${r.status}">${r.status.replace('_', ' ')}</td>
      </tr>`
    )
    .join('');
  document.getElementById('result-table').innerHTML = `
    <table>
      <thead><tr><th>Title</th><th>Artist</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  section.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
  const el = document.getElementById('error-banner');
  el.hidden = false;
  el.textContent = message;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Surface OAuth callback errors passed via query string.
const params = new URLSearchParams(window.location.search);
if (params.get('error')) showError(`Connection failed: ${params.get('error')}`);

refreshStatus();
