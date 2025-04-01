let audioCtx, delay, feedback, outputGain;

document.getElementById('start').onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const source = audioCtx.createMediaStreamSource(stream);

  // Delay setup
  delay = audioCtx.createDelay();
  delay.delayTime.value = 0.5;

  // Feedback GainNode
  feedback = audioCtx.createGain();
  feedback.gain.value = 0.4;

  // Output volume
  outputGain = audioCtx.createGain();
  outputGain.gain.value = 0.8;

  // Feedback loop: delay -> feedback -> delay
  delay.connect(feedback);
  feedback.connect(delay);

  // Signal flow: source -> delay -> outputGain -> destination
  source.connect(delay);
  delay.connect(outputGain);
  outputGain.connect(audioCtx.destination);

  // UI slider to control delay time
  document.getElementById('delayTime').oninput = (e) => {
    delay.delayTime.value = parseFloat(e.target.value);
  };

  // Slider to control feedback amount
  const feedbackSlider = document.getElementById('feedback');
  if (feedbackSlider) {
    feedbackSlider.oninput = (e) => {
      feedback.gain.value = parseFloat(e.target.value);
    };
  }
};

