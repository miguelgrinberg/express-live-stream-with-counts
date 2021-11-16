const stream = document.getElementById('stream');
const identityInput = document.getElementById('identity');
const streamNameInput = document.getElementById('streamName');
const startEndButton = document.getElementById('streamStartEnd');
const video = document.getElementsByTagName('video')[0];

let streaming = false;
let room;
let streamDetails;
let countUpdateTimer;

let liveNotification = document.createElement('div');
liveNotification.innerHTML = 'LIVE';
liveNotification.id = 'liveNotification';
liveNotification.classList.add('absolute', 'top-10', 'left-48', 'p-2', 'bg-red-500', 'text-white');

const addLocalVideo = async () => {
  const videoTrack = await Twilio.Video.createLocalVideoTrack();
  const trackElement = videoTrack.attach();
  stream.appendChild(trackElement);
};

const startStream = async (streamName, identity) => {
  // Create the livestream
  const startStreamResponse = await fetch('/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'streamName': streamName
    })
  });

  streamDetails = await startStreamResponse.json();
  const roomId = streamDetails.roomId;

  // Get an Access Token
  const tokenResponse = await fetch('/streamerToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'identity': identity,
      'room': roomId
    })
  });

  const tokenData = await tokenResponse.json();

  // Connect to the Video Room
  room = await Twilio.Video.connect(tokenData.token);
  streaming = true;

  stream.insertBefore(liveNotification, video);
  countUpdateTimer = setInterval(async () => {
    const countResponse = await fetch('/audienceCount');
    const countData = await countResponse.json();
    liveNotification.innerText = `LIVE [${countData.count}]`;
  }, 5000);

  startEndButton.disabled = false;
  startEndButton.classList.replace('bg-green-500', 'bg-red-500');
  startEndButton.classList.replace('hover:bg-green-500', 'hover:bg-red-700');
}

const endStream = async () => {
  // If streaming, end the stream
  if (streaming) {
    clearInterval(countUpdateTimer);

    try {
      const response = await fetch('/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          streamDetails: streamDetails
        })
      });

      const data = await response.json();
      room.disconnect();
      streaming = false;
      liveNotification.remove();

      startEndButton.innerHTML = 'start stream';
      startEndButton.classList.replace('bg-red-500', 'bg-green-500');
      startEndButton.classList.replace('hover:bg-red-500', 'hover:bg-green-700');
      identityInput.disabled = false;
      streamNameInput.disabled = false;

    } catch (error) {
      console.log(error)
    }
  }
}

const startOrEndStream = async (event) => {
  event.preventDefault();
  if (!streaming) {
    const streamName = streamNameInput.value;
    const identity = identityInput.value;

    startEndButton.innerHTML = 'end stream';
    startEndButton.disabled = true;
    identityInput.disabled = true;
    streamNameInput.disabled = true;

    try {
      await startStream(streamName, identity);

    } catch (error) {
      console.log(error);
      alert('Unable to start livestream.');
      startEndButton.innerHTML = 'start stream';
      startEndButton.disabled = false;
      identityInput.disabled = false;
      streamNameInput.disabled = false;
    }

  }
  else {
    endStream();
  }
};

startEndButton.addEventListener('click', startOrEndStream);

window.addEventListener('beforeunload', async (event) => {
  event.preventDefault();
  await endStream();
  e.returnValue = '';
});

addLocalVideo();
