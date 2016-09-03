const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { username, password, subsonicServer } = require('./config');

const app = express();

const router = express.Router();
router.use(cors());
router.use((req, res, next) => {
  res.set('Content-Type', 'application/vnd.api+json');
  next();
});

router.get('/server', function (req, res) {
  const data = {
    type: 'server',
    id: '0',
    attributes: {
      'aura-version': '0.2.0',
      server: 'subsonic-aura-shim',
      'server-version': '1.0.0',
      'auth-required': true,
    }
  }
  res.json({data})
});

router.get('/tracks/:id', function (req, res) {
  const id = req.params.id;
  fetch(`${subsonicServer}/getSong.view?u=${username}&p=${password}&v=1.14.0&c=shim&f=json&id=${id}`)
    .then(ssRes => ssRes.json())
    .then(json => {
      const song = json['subsonic-response']['song'];
      const data = {
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        track: song.track,
        year: song.year,
        genre: song.genre,
        type: song.contentType,
        duration: song.duration,
        bitrate: song.bitRate,
        size: song.size,
      };
      res.json({data});
    });
});

app.use('/aura', router);

app.listen(3000);
