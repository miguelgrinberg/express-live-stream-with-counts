import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promisify } from 'util';
import express from 'express';
import crypto from 'crypto';
import twilio from 'twilio';
import redis from 'redis';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const port = 5000;

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;
const PlaybackGrant = AccessToken.PlaybackGrant;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

const twilioClient = twilio(apiKey, apiKeySecret, { accountSid: accountSid });
const redisClient = redis.createClient();
const redisGet = promisify(redisClient.get).bind(redisClient);
const redisSet = promisify(redisClient.set).bind(redisClient);
const redisIncr = promisify(redisClient.incr).bind(redisClient);
const redisDecr = promisify(redisClient.decr).bind(redisClient);

app.use(express.json());

// Serve static files from the public directory
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile('public/index.html', { root: __dirname });
});

app.get('/stream', (req, res) => {
  res.sendFile('public/streamer.html', { root: __dirname });
});

app.get('/watch', (req, res) => {
  res.sendFile('public/audience.html', { root: __dirname });
});

/**
 * Start a new livestream with a Video Room, PlayerStreamer, and MediaProcessor
 */
app.post('/start', async (req, res) => {
  const streamName  = req.body.streamName;

  try {
    // Create the WebRTC Go video room, PlayerStreamer, and MediaProcessors
    const room = await twilioClient.video.rooms.create({
      uniqueName: streamName,
      type: 'go'
    });

    const playerStreamer = await twilioClient.media.playerStreamer.create();

    const mediaProcessor = await twilioClient.media.mediaProcessor.create({
      extension: 'video-composer-v1',
      extensionContext: JSON.stringify({
        identity: 'video-composer-v1',
        room: {
          name: room.sid
        },
        outputs: [
          playerStreamer.sid
        ],
      })
    })

    // initialize viewer count
    await redisSet('live_viewer_count', 0);

    return res.status(200).send({
      roomId: room.sid,
      streamName: streamName,
      playerStreamerId: playerStreamer.sid,
      mediaProcessorId: mediaProcessor.sid
    });

  } catch(error) {
    return res.status(400).send({
      message: `Unable to create livestream`,
      error
    });
  }
});

/**
 * End a livestream
 */
app.post('/end', async (req, res) => {
  const streamDetails = req.body.streamDetails;

  // End the player streamer, media processor, and video room
  const streamName  = streamDetails.streamName;
  const roomId  = streamDetails.roomId;
  const playerStreamerId = streamDetails.playerStreamerId;
  const mediaProcessorId = streamDetails.mediaProcessorId;

  try {
    await twilioClient.media.mediaProcessor(mediaProcessorId).update({status: 'ended'});
    await twilioClient.media.playerStreamer(playerStreamerId).update({status: 'ended'});
    await twilioClient.video.rooms(roomId).update({status: 'completed'});

    return res.status(200).send({
      message: `Successfully ended stream ${streamName}`
    });

  } catch (error) {
    return res.status(400).send({
      message: `Unable to end stream`,
      error
    });
  }
});

/**
 * Get an Access Token for a streamer
 */
app.post('/streamerToken', async (req, res) => {
  if (!req.body.identity || !req.body.room) {
    return res.status(400).send({ message: `Missing identity or stream name` });
  }

  // Get the user's identity and the room name from the request
  const identity  = req.body.identity;
  const roomName  = req.body.room;

  try {
    // Create a video grant for this specific room
    const videoGrant = new VideoGrant({
      room: roomName,
    });

    // Create an access token
    const token = new AccessToken(accountSid, apiKey, apiKeySecret);

    // Add the video grant and the user's identity to the token
    token.addGrant(videoGrant);
    token.identity = identity;

    // Serialize the token to a JWT and return it to the client side
    return res.send({
      token: token.toJwt()
    });

  } catch (error) {
    return res.status(400).send({error});
  }
});

/**
 * Get an Access Token for an audience member
 */
app.post('/audienceToken', async (req, res) => {
  // Generate a random string for the identity
  const identity = crypto.randomBytes(20).toString('hex');

  try {
    // Get the first player streamer
    const playerStreamerList = await twilioClient.media.playerStreamer.list({status: 'started'});
    const playerStreamer = playerStreamerList.length ? playerStreamerList[0] : null;

    // If no one is streaming, return a message
    if (!playerStreamer){
      return res.status(200).send({
        message: `No one is streaming right now`,
      })
    }

    // Otherwise create an access token with a PlaybackGrant for the livestream
    const token = new AccessToken(accountSid, apiKey, apiKeySecret);

    // Create a playback grant and attach it to the access token
    const playbackGrant = await twilioClient.media.playerStreamer(playerStreamer.sid).playbackGrant().create({ttl: 60});

    const wrappedPlaybackGrant = new PlaybackGrant({
      grant: playbackGrant.grant
    });

    token.addGrant(wrappedPlaybackGrant);
    token.identity = identity;

    // Serialize the token to a JWT and return it to the client side
    return res.send({
      token: token.toJwt()
    });

  } catch (error) {
    res.status(400).send({
      message: `Unable to view livestream`,
      error
    });
  }
});

/**
 * Get the number of users watching the stream
 */
app.get('/audienceCount', async (req, res) => {
  return res.send({
    count: await redisGet('live_viewer_count'),
  });
});

// Start the Express server
app.listen(port, async () => {
  console.log(`Express server running on port ${port}`);
});
