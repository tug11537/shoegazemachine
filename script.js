let audioCtx, delay, feedback, outputGain, reverb, micInput;
let analyser, canvasCtx, visualizerCanvas;

function makeDistortionCurve(amount = 400) {
  const k = typeof amount === 'number' ? amount : 50;
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * Math.PI) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function setupVisualizer(audioCtx, streamSource) {
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;

  streamSource.connect(analyser);

  visualizerCanvas = document.getElementById('visualizer');
  visualizerCanvas.width = window.innerWidth;
  visualizerCanvas.height = window.innerHeight;
  canvasCtx = visualizerCanvas.getContext('2d');

 animateVisualizer();
}

function animateVisualizer() {
  requestAnimationFrame(animateVisualizer);

  if (!canvasCtx || !analyser) {
    return;
  }


  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;

  canvasCtx.fillStyle = 'rgba(240, 220, 250, 0.05)';
  canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

  const radius = average * 1.5;
  const centerX = visualizerCanvas.width / 2;
  const centerY = visualizerCanvas.height / 2;

  const gradient = canvasCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(200, 100, 255, 0.6)');
  gradient.addColorStop(1, 'rgba(250, 200, 255, 0)');

  canvasCtx.beginPath();
  canvasCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  canvasCtx.fillStyle = gradient;
  canvasCtx.fill();
}


window.onload = () => {
  const delayTimeKnob = new Nexus.Dial('#delayTimeKnob', {
    size: [75, 75],
    min: 0.01,
    max: 1,
    step: 0.01,
    value: 0.5
  });

  const feedbackKnob = new Nexus.Dial('#feedbackKnob', {
    size: [75, 75],
    min: 0,
    max: 0.9,
    step: 0.01,
    value: 0.4
  });

  const decayKnob = new Nexus.Dial('#decayKnob', {
    size: [75, 75],
    min: 0.1,
    max: 10,
    step: 0.1,
    value: 6
  });

  const preDelayKnob = new Nexus.Dial('#preDelayKnob', {
    size: [75, 75],
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.03
  });

  const wetKnob = new Nexus.Dial('#wetKnob', {
    size: [75, 75],
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.7
  });

  const filterFreqKnob = new Nexus.Dial('#filterFreqKnob', {
    size: [75, 75],
    min: 200,
    max: 8000,
    step: 10,
    value: 1000
  });

  const distortionKnob = new Nexus.Dial('#distortionKnob', {
    size: [75, 75],
    min: 0,
    max: 800,
    step: 1,
    value: 400
  });

  document.getElementById('start').onclick = async () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();

    // Set up Tone.js (after user gesture)
    reverb = new Tone.Reverb({
      decay: 6,
      preDelay: 0.03,
      wet: 0.7
    }).toDestination();

    await reverb.generate();

    micInput = new Tone.UserMedia();
    await micInput.open();
    micInput.connect(reverb);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);
    setupVisualizer(audioCtx, source);

    // Web Audio FX
    delay = audioCtx.createDelay();
    delay.delayTime.value = 0.5;

    feedback = audioCtx.createGain();
    feedback.gain.value = 0.4;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1000;

    const distortion = audioCtx.createWaveShaper();
    distortion.curve = makeDistortionCurve(400);
    distortion.oversample = '4x';

    outputGain = audioCtx.createGain();
    outputGain.gain.value = 0.8;

    // Routing
    delay.connect(feedback);
    feedback.connect(delay);

    source.connect(delay);
    delay.connect(filter);
    source.connect(filter);
    filter.connect(distortion);
    distortion.connect(outputGain);
    outputGain.connect(audioCtx.destination);

    // Knob interactivity
    delayTimeKnob.on('change', (v) => {
      if (delay) delay.delayTime.value = v;
    });

    feedbackKnob.on('change', (v) => {
      if (feedback) feedback.gain.value = v;
    });

    decayKnob.on('change', (v) => {
      if (reverb) reverb.decay = v;
    });

    preDelayKnob.on('change', (v) => {
      if (reverb) reverb.preDelay = v;
    });

    wetKnob.on('change', (v) => {
      if (reverb) reverb.wet.value = v;
    });

    filterFreqKnob.on('change', (v) => {
      if (filter) filter.frequency.value = v;
    });

    distortionKnob.on('change', (v) => {
      if (distortion) distortion.curve = makeDistortionCurve(v);
    });
  };
};
