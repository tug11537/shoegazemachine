let audioCtx, delay, feedback, outputGain, reverb, micInput;
let analyser, canvasCtx, visualizerCanvas;
let isPlaying = false;
let sourceStream;
let animationFrameId;
let currentDistortion = 400;
let currentDelayTime = 0.5;

const particles = [];
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = Math.random() * 2 + 1;
    this.vx = Math.random() * 2 - 1;
    this.vy = Math.random() * 2 - 1;
    this.alpha = 1;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 0.01;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${this.alpha})`;
    ctx.fill();
  }
}

function makeDistortionCurve(amount = 400) {
  currentDistortion = amount;
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
  analyser.fftSize = 1024;
  streamSource.connect(analyser);

  visualizerCanvas = document.getElementById('visualizer');
  visualizerCanvas.width = window.innerWidth;
  visualizerCanvas.height = window.innerHeight;
  canvasCtx = visualizerCanvas.getContext('2d');

  animateVisualizer();
}

function animateVisualizer() {
  animationFrameId = requestAnimationFrame(animateVisualizer);

  if (!canvasCtx || !analyser) return;

  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;

  const bufferLength = analyser.frequencyBinCount;
  const freqData = new Uint8Array(bufferLength);
  const timeData = new Uint8Array(bufferLength);

  analyser.getByteFrequencyData(freqData);
  analyser.getByteTimeDomainData(timeData);

  const hueBase = currentDelayTime * 360;
  canvasCtx.fillStyle = `hsla(${hueBase}, 50%, 10%, 0.1)`;
  canvasCtx.fillRect(0, 0, width, height);

  // Glitch: shift canvas slightly when distortion is high
  if (currentDistortion > 600) {
    const offsetX = Math.random() * 10 - 5;
    const offsetY = Math.random() * 10 - 5;
    canvasCtx.translate(offsetX, offsetY);
  }

  // Frequency Bars
  const barWidth = (width / bufferLength) * 2.5;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const barHeight = freqData[i];
    const hue = (hueBase + i) % 360;
    canvasCtx.fillStyle = `hsl(${hue}, 100%, 60%)`;
    canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
    x += barWidth + 1;
  }

  // Oscilloscope Line
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  canvasCtx.beginPath();
  const sliceWidth = width * 1.0 / bufferLength;
  let xLine = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = timeData[i] / 128.0;
    const y = v * height / 2;
    if (i === 0) {
      canvasCtx.moveTo(xLine, y);
    } else {
      canvasCtx.lineTo(xLine, y);
    }
    xLine += sliceWidth;
  }
  canvasCtx.stroke();

  // Radial Glow Pulse
  const avg = freqData.reduce((a, b) => a + b, 0) / bufferLength;
  const radius = avg * 1.2;
  const centerX = width / 2;
  const centerY = height / 2;

  const gradient = canvasCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, `hsla(${hueBase}, 100%, 70%, 0.4)`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  canvasCtx.beginPath();
  canvasCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  canvasCtx.fillStyle = gradient;
  canvasCtx.fill();

  // Dreamy Particle System
  if (Math.random() < 0.5) particles.push(new Particle(centerX, centerY));
  particles.forEach((p, i) => {
    p.update();
    p.draw(canvasCtx);
    if (p.alpha <= 0) particles.splice(i, 1);
  });

  // Reset transform if glitch was applied
  if (currentDistortion > 600) {
    canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

async function startAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();

  reverb = new Tone.Reverb({ decay: 6, preDelay: 0.03, wet: 0.7 }).toDestination();
  await reverb.generate();

  micInput = new Tone.UserMedia();
  await micInput.open();
  micInput.connect(reverb);

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  sourceStream = audioCtx.createMediaStreamSource(stream);
  setupVisualizer(audioCtx, sourceStream);

  delay = audioCtx.createDelay();
  delay.delayTime.value = currentDelayTime;

  feedback = audioCtx.createGain();
  feedback.gain.value = 0.4;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1000;

  const distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(currentDistortion);
  distortion.oversample = '4x';

  outputGain = audioCtx.createGain();
  outputGain.gain.value = 0.8;

  delay.connect(feedback);
  feedback.connect(delay);

  sourceStream.connect(delay);
  delay.connect(filter);
  sourceStream.connect(filter);
  filter.connect(distortion);
  distortion.connect(outputGain);
  outputGain.connect(audioCtx.destination);

  // Knob interactivity
  delayTimeKnob.on('change', v => {
    currentDelayTime = v;
    delay.delayTime.value = v;
  });
  feedbackKnob.on('change', v => feedback.gain.value = v);
  decayKnob.on('change', v => reverb.decay = v);
  preDelayKnob.on('change', v => reverb.preDelay = v);
  wetKnob.on('change', v => reverb.wet.value = v);
  filterFreqKnob.on('change', v => filter.frequency.value = v);
  distortionKnob.on('change', v => {
    currentDistortion = v;
    distortion.curve = makeDistortionCurve(v);
  });
}

function stopAudio() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (canvasCtx) {
    canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
  }
  if (micInput) {
    micInput.close();
  }
  isPlaying = false;
  document.getElementById('start').textContent = 'Start Audio';
}

window.onload = () => {
  window.delayTimeKnob = new Nexus.Dial('#delayTimeKnob', { size: [75, 75], min: 0.01, max: 1, step: 0.01, value: 0.5 });
  window.feedbackKnob = new Nexus.Dial('#feedbackKnob', { size: [75, 75], min: 0, max: 0.9, step: 0.01, value: 0.4 });
  window.decayKnob = new Nexus.Dial('#decayKnob', { size: [75, 75], min: 0.1, max: 10, step: 0.1, value: 6 });
  window.preDelayKnob = new Nexus.Dial('#preDelayKnob', { size: [75, 75], min: 0, max: 1, step: 0.01, value: 0.03 });
  window.wetKnob = new Nexus.Dial('#wetKnob', { size: [75, 75], min: 0, max: 1, step: 0.01, value: 0.7 });
  window.filterFreqKnob = new Nexus.Dial('#filterFreqKnob', { size: [75, 75], min: 200, max: 8000, step: 10, value: 1000 });
  window.distortionKnob = new Nexus.Dial('#distortionKnob', { size: [75, 75], min: 0, max: 800, step: 1, value: 400 });

  document.getElementById('start').addEventListener('click', async () => {
    if (!isPlaying) {
      await startAudio();
      isPlaying = true;
      document.getElementById('start').textContent = 'Stop Audio';
    } else {
      stopAudio();
    }
  });
};

