require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { spotifyAuthRouter } = require('./auth/spotify');
const { googleAuthRouter } = require('./auth/google');
const { apiRouter } = require('./routes/api');

const app = express();

app.set('trust proxy', 1); // needed on Render/Railway/Fly so secure cookies work

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.BASE_URL?.startsWith('https'),
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
    },
    // NOTE: this is the default in-memory session store. It's fine for a
    // solo/demo deployment on a single instance, but sessions (and the
    // Spotify/YouTube tokens in them) are lost on every restart and won't
    // work if you ever scale to multiple instances. Swap in a real store
    // (e.g. connect-redis) before this goes beyond personal/demo use.
  })
);

app.use(express.json());
app.use('/auth/spotify', spotifyAuthRouter());
app.use('/auth/google', googleAuthRouter());
app.use('/api', apiRouter());
app.use(express.static(path.join(__dirname, '..', 'public')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Playlist migrator listening on ${process.env.BASE_URL || `http://localhost:${port}`}`);
});
