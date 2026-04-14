// Vercel Serverless Function — /api/spotify
// Returns currently playing OR last played track from Spotify

const client_id     = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

const TOKEN_ENDPOINT           = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_ENDPOINT     = 'https://api.spotify.com/v1/me/player/currently-playing';
const RECENTLY_PLAYED_ENDPOINT = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

async function getAccessToken() {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  return res.json();
}

async function getNowPlaying(access_token) {
  const res = await fetch(NOW_PLAYING_ENDPOINT, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  // 204 = nothing playing, 200 = something is playing
  if (res.status === 200) {
    const data = await res.json();
    if (data.is_playing && data.item) {
      return {
        isPlaying: true,
        title: data.item.name,
        artists: data.item.artists.map(a => a.name).join(', '),
        albumArt: data.item.album.images[0]?.url || '',
        albumName: data.item.album.name,
        spotifyUrl: data.item.external_urls.spotify,
        duration: Math.floor(data.item.duration_ms / 1000),
        progress: Math.floor((data.progress_ms || 0) / 1000),
      };
    }
  }

  return null;
}

async function getRecentlyPlayed(access_token) {
  const res = await fetch(RECENTLY_PLAYED_ENDPOINT, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (res.status === 200) {
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const track = data.items[0].track;
      return {
        isPlaying: false,
        title: track.name,
        artists: track.artists.map(a => a.name).join(', '),
        albumArt: track.album.images[0]?.url || '',
        albumName: track.album.name,
        spotifyUrl: track.external_urls.spotify,
        duration: Math.floor(track.duration_ms / 1000),
        progress: 0,
        playedAt: data.items[0].played_at,
      };
    }
  }

  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache for 30s on CDN, serve stale for 60s while revalidating
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { access_token } = await getAccessToken();

    // 1. Try currently playing
    const nowPlaying = await getNowPlaying(access_token);
    if (nowPlaying) {
      return res.status(200).json(nowPlaying);
    }

    // 2. Fallback to recently played
    const recent = await getRecentlyPlayed(access_token);
    if (recent) {
      return res.status(200).json(recent);
    }

    // 3. Nothing found
    return res.status(200).json({ isPlaying: false, title: null });
  } catch (error) {
    console.error('Spotify API error:', error);
    return res.status(500).json({ error: 'Failed to fetch Spotify data' });
  }
}
