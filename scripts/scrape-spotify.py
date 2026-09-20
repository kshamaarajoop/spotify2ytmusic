#!/usr/bin/env python3
"""
Uses the community `spotifyscraper` library (MIT, AliAkhtari78) instead of
our own hand-rolled guest-token scraper. Why: it goes through Spotify's
GraphQL Pathfinder API (the same one open.spotify.com's own frontend uses),
which is NOT subject to the Web API's "owner or collaborator only"
restriction we hit on /playlists/{id}/items - and its persisted-query
hashes are kept current by the maintainer's own daily canary test against
live Spotify, which is not something worth re-implementing by hand.

This script only replaces scripts/scrape-spotify.js. Its output is the
SAME shape, at the SAME path, so scripts/migrate-from-json.js (Node) needs
zero changes.

Setup:
    pip install spotifyscraper

Usage (same playlists-to-scrape.json as the Node scraper):
    python3 scripts/scrape_with_spotifyscraper.py
"""

import json
import re
import sys
from pathlib import Path

try:
    from spotify_scraper import SpotifyClient
except ImportError:
    print("Missing dependency. Run: pip install spotifyscraper", file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
PLAYLISTS_FILE = SCRIPT_DIR / "playlists-to-scrape.json"
OUTPUT_FILE = SCRIPT_DIR.parent / "data" / "playlists.json"


def extract_playlist_id(raw):
    # get_playlist() itself accepts a URL, URI, or bare ID - but we need a
    # clean ID (not a full URL) to use as a safe filename downstream.
    match = re.search(r"playlist[/:]([A-Za-z0-9]{22})", raw)
    if match:
        return match.group(1)
    if re.fullmatch(r"[A-Za-z0-9]{22}", raw):
        return raw
    return raw  # fall back to the raw value; normalize_track's caller will still work


def normalize_track(entry):
    # playlist.tracks yields PlaylistTrack wrappers (added_at, added_by,
    # is_local, track) - not Track objects directly. Unwrap first.
    track = getattr(entry, "track", None)
    if track is None:
        return None  # local files can come back with no track object

    # track.artists is a tuple[ArtistRef, ...]; each has .name.
    artist_names = ", ".join(a.name for a in (track.artists or []) if getattr(a, "name", None))
    # track.album is an AlbumRef | None - tier-1 only, so it can legitimately
    # be absent if this track came back via the tier-2 embed-page fallback.
    album_name = ""
    if getattr(track, "album", None) is not None:
        album_name = getattr(track.album, "name", "") or ""
    return {
        "title": track.name,
        "artist": artist_names,
        "album": album_name,
    }


def main():
    if not PLAYLISTS_FILE.exists():
        print(
            f"Missing {PLAYLISTS_FILE}.\n"
            "Copy playlists-to-scrape.example.json to playlists-to-scrape.json "
            "and add your own playlist links first.",
            file=sys.stderr,
        )
        sys.exit(1)

    ids_or_urls = json.loads(PLAYLISTS_FILE.read_text())
    if not isinstance(ids_or_urls, list) or not ids_or_urls:
        print(f"{PLAYLISTS_FILE} must be a non-empty JSON array of playlist links or IDs.", file=sys.stderr)
        sys.exit(1)

    playlists = []
    with SpotifyClient() as client:
        for raw in ids_or_urls:
            print(f"Scraping {raw}...")
            try:
                playlist = client.get_playlist(raw, max_tracks=500)
                tracks = [t for t in (normalize_track(e) for e in playlist.tracks) if t is not None]
                print(f'  "{playlist.name}" - {len(tracks)} tracks')
                playlists.append({"id": extract_playlist_id(raw), "name": playlist.name, "tracks": tracks})
            except Exception as err:  # noqa: BLE001 - surface anything, keep going
                print(f"  Failed to scrape {raw}: {err}", file=sys.stderr)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(playlists, indent=2))
    print(f"\nWrote {len(playlists)} playlist(s) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()