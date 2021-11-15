const streamPlayer = document.getElementById('player');
const startEndButton = document.getElementById('streamStartEnd');

let player;
let watchingStream = false;

const watchStream = async () => {
  try {
    const response = await fetch('/audienceToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();

    if (data.message) {
      alert(data.message);
      return;
    }

    player = await Twilio.Live.Player.connect(data.token, {playerWasmAssetsPath: '../livePlayer'});
    player.play();
    streamPlayer.appendChild(player.videoElement);

    watchingStream = true;
    startEndButton.innerHTML = 'leave stream';
    startEndButton.classList.replace('bg-green-500', 'bg-red-500');
    startEndButton.classList.replace('hover:bg-green-500', 'hover:bg-red-700');

  } catch (error) {
    console.log(error);
    alert('Unable to connect to livestream');
  }
}

const leaveStream = () => {
  player.disconnect();
  watchingStream = false;
  startEndButton.innerHTML = 'watch stream';
  startEndButton.classList.replace('bg-red-500', 'bg-green-500');
  startEndButton.classList.replace('hover:bg-red-500', 'hover:bg-green-700');
}

const watchOrLeaveStream = async (event) => {
  event.preventDefault();
  if (!watchingStream) {
    await watchStream();
  }
  else {
    leaveStream();
  }
};

startEndButton.addEventListener('click', watchOrLeaveStream);
