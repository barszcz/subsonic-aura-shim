const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const Loki = require('lokijs');
const _ = require('lodash/fp');
const queryString = require('query-string');
const { username, password, subsonicServer } = require('./config');

const app = express();

const db = new Loki('auradb.json');
const tracksColl = db.getCollection('tracks') || db.addCollection('tracks', {
  indices: ['id'],
});

function subsonicRequest(endpoint, id) {
  const qs = queryString.stringify({
    u: username,
    p: password,
    v: '1.14.0',
    c: 'shim',
    f: 'json',
    id,
  });
  const url = `${subsonicServer}/${endpoint}.view?${qs}`;
  return fetch(url).then(res => res.json());
}

// worst promise chain ever. Blame Subsonic.
subsonicRequest('getArtists')
  .then(json => json['subsonic-response'].artists.index)
  .then(_.flow(_.flatMap('artist'), _.map('id')))
  .then(artistIds => {
    const artistPromises = artistIds.map(id => subsonicRequest('getArtist', id));
    return Promise.all(artistPromises);
  })
  .then(_.flow(
    _.flatMap(artistJson => artistJson['subsonic-response'].artist.album),
    _.map('id'))
  )
  .then(albumIds => {
    const albumPromises = albumIds.map(id => subsonicRequest('getAlbum', id));
    return Promise.all(albumPromises);
  })
  .then(albums => {
    const tracks = _.flow(
      _.flatMap(albumJson => albumJson['subsonic-response'].album.song),
      _.map(song => (
        {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          track: song.track,
          year: song.year,
          genre: song.genre || '',
          type: song.contentType,
          duration: song.duration,
          bitrate: song.bitRate,
          size: song.size,
        }
      ))
    )(albums);
    tracksColl.insert(tracks);
  });

const router = express.Router();
router.use(cors());
router.use((req, res, next) => {
  res.set('Content-Type', 'application/vnd.api+json');
  next();
});

router.get('/server', (req, res) => {
  const data = {
    type: 'server',
    id: '0',
    attributes: {
      'aura-version': '0.2.0',
      server: 'subsonic-aura-shim',
      'server-version': '1.0.0',
      'auth-required': true,
    },
  };
  res.json({ data });
});

router.get('/tracks', (req, res) => {
  const results = tracksColl.where(_.T);
  res.json({
    data: {
      attributes: results,
      type: 'tracks',
    },
  });
});

router.get('/tracks/:id', (req, res) => {
  const id = req.params.id;
  const track = tracksColl.findOne({ id });
  delete track.meta;
  res.json({
    data: {
      attributes: track,
      type: 'tracks',
      id,
    },
  });
});

// This doesn't work super great yet,
// but I don't feel like fighting Git to not check it in.
router.get('/tracks/:id/audio', (req, res) => {
  const id = req.params.id;
  fetch(`${subsonicServer}/stream.view?u=${username}&p=${password}&v=1.14.0&c=shim&f=json&id=${id}`)
    .then(ssRes => {
      const contentType = ssRes.headers.get('content-type');
      const duration = ssRes.headers.get('x-content-duration');
      res.set('Content-Type', contentType);
      res.set('Content-Disposition', 'attachment');
      res.set('X-Content-Duration', duration);
      return ssRes.buffer();
    })
    .then(buf => {
      res.send(buf);
    });
});

app.use('/aura', router);

app.listen(3000);
