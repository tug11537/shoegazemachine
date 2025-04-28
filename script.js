// Shoegaze Machine with dreamy dry/wet blending, corrected noise gate for strumming, presets, visualizer

// Global audio + visual variables
let audioCtx, delay, feedback, outputGain, reverb, micInput;
let analyser, canvasCtx, visualizerCanvas;
let isPlaying = false;
let sourceStream;
let animationFrameId;
let currentDistortion = 400;
let currentDelayTime = 0.5;
let inputGain;

const particles = []; // Particle system for dreamy visuals

// Preset sounds
const presets = {
  "Swirly Pancakes": { delayTime: 0.18, feedback: 0.45, decay: 5, preDelay: 0.03, wet: 0.5, filterFreq: 4500, distortion: 220 },
  "Valentine Static": { delayTime: 0.22, feedback: 0.55, decay: 8, preDelay: 0.08, wet: 0.55, filterFreq: 4000, distortion: 360 },
  "Fast Cannonball": { delayTime: 0.15, feedback: 0.4, decay: 6, preDelay: 0.02, wet: 0.45, filterFreq: 5000, distortion: 180 },
  "Heaven Delay": { delayTime: 0.2, feedback: 0.5, decay: 9, preDelay: 0.05, wet: 0.7, filterFreq: 4200, distortion: 200 }
};

// Particle class
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

// Create distortion curve
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

// Setup visualizer
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

// Animate visualizer
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

  if (currentDistortion > 600) {
    const offsetX = Math.random() * 10 - 5;
    const offsetY = Math.random() * 10 - 5;
    canvasCtx.translate(offsetX, offsetY);
  }

  const barWidth = (width / bufferLength) * 2.5;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const barHeight = freqData[i];
    const hue = (hueBase + i) % 360;
    canvasCtx.fillStyle = `hsl(${hue}, 100%, 60%)`;
    canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
    x += barWidth + 1;
  }

  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  canvasCtx.beginPath();
  const sliceWidth = width * 1.0 / bufferLength;
  let xLine = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = timeData[i] / 128.0;
    const y = v * height / 2;
    if (i === 0) canvasCtx.moveTo(xLine, y);
    else canvasCtx.lineTo(xLine, y);
    xLine += sliceWidth;
  }
  canvasCtx.stroke();

  if (Math.random() < 0.5) particles.push(new Particle(width / 2, height / 2));
  particles.forEach((p, i) => {
    p.update();
    p.draw(canvasCtx);
    if (p.alpha <= 0) particles.splice(i, 1);
  });

  if (currentDistortion > 600) {
    canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// Audio processing
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

  inputGain = audioCtx.createGain();
  inputGain.gain.value = 1;

  setupVisualizer(audioCtx, inputGain);

  delay = audioCtx.createDelay();
  delay.delayTime.value = currentDelayTime;

  feedback = audioCtx.createGain();
  feedback.gain.value = 0.4;

  filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4000;

  distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(currentDistortion);
  distortion.oversample = '4x';

  outputGain = audioCtx.createGain();
  outputGain.gain.value = 0.6;

  const dryGain = audioCtx.createGain();
  dryGain.gain.value = 2;
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  inputGain.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(filter);
  filter.connect(distortion);
  distortion.connect(outputGain);

  outputGain.connect(audioCtx.destination);

  setupNoiseGate(sourceStream, inputGain);

  document.getElementById('loadPresetButton').disabled = false;
}

// Improved noise gate optimized for guitar
function setupNoiseGate(sourceNode, gateNode) {
  const analyserForGate = audioCtx.createAnalyser();
  analyserForGate.fftSize = 512;
  sourceNode.connect(analyserForGate);
  sourceNode.connect(gateNode);

  function monitorInput() {
    if (!audioCtx || !gateNode) return;

    const dataArray = new Uint8Array(analyserForGate.frequencyBinCount);
    analyserForGate.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      let val = (dataArray[i] - 128) / 128;
      sum += val * val;
    }
    let rms = Math.sqrt(sum / dataArray.length);

    const now = audioCtx.currentTime;

    if (rms < 0.0008) {
      gateNode.gain.linearRampToValueAtTime(0, now + 0.05);
    } else {
      gateNode.gain.linearRampToValueAtTime(1.0, now + 0.01);
    }

    requestAnimationFrame(monitorInput);
  }

  monitorInput();
}

// Stop everything
function stopAudio() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (canvasCtx) canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
  if (micInput) micInput.close();

  isPlaying = false;
  document.getElementById('start').textContent = 'Start Audio';
  document.getElementById('loadPresetButton').disabled = true;
}

// Load presets safely
function loadPreset(name) {
  if (!delay) {
    console.warn('Audio not started yet! Press Start Audio first.');
    return;
  }
  const p = presets[name];
  if (!p) return;

  delayTimeKnob.value = p.delayTime;
  delay.delayTime.value = p.delayTime;
  feedbackKnob.value = p.feedback;
  feedback.gain.value = p.feedback;
  decayKnob.value = p.decay;
  reverb.decay = p.decay;
  preDelayKnob.value = p.preDelay;
  reverb.preDelay = p.preDelay;
  wetKnob.value = p.wet;
  reverb.wet.value = p.wet;
  filterFreqKnob.value = p.filterFreq;
  filter.frequency.value = p.filterFreq;
  distortionKnob.value = p.distortion;
  distortion.curve = makeDistortionCurve(p.distortion);

  currentDelayTime = p.delayTime;
  currentDistortion = p.distortion;
}

// Initialize page
window.onload = () => {
  window.delayTimeKnob = new Nexus.Dial('#delayTimeKnob', {size: [75, 75], min: 0.01, max: 1, step: 0.01, value: 0.5});
  window.feedbackKnob = new Nexus.Dial('#feedbackKnob', {size: [75, 75], min: 0, max: 0.9, step: 0.01, value: 0.4});
  window.decayKnob = new Nexus.Dial('#decayKnob', {size: [75, 75], min: 0.1, max: 10, step: 0.1, value: 6 });
  window.preDelayKnob = new Nexus.Dial('#preDelayKnob', {size: [75, 75], min: 0, max: 1, step: 0.01, value: 0.03 });
  window.wetKnob = new Nexus.Dial('#wetKnob', {size: [75, 75], min: 0, max: 1, step: 0.01, value: 0.7});
  window.filterFreqKnob = new Nexus.Dial('#filterFreqKnob', {size: [75, 75], min: 200, max: 8000, step: 10, value: 4000});
  window.distortionKnob = new Nexus.Dial('#distortionKnob', {size: [75, 75], min: 0, max: 800, step: 1, value: 400});

  document.getElementById('start').addEventListener('click', async () => {
    if (!isPlaying) {
      await startAudio();
      isPlaying = true;
      document.getElementById('start').textContent = 'Stop Audio';
    } else {
      stopAudio();
    }
  });

  document.getElementById('loadPresetButton').addEventListener('click', () => {
    const selectedPreset = document.getElementById('presetSelect').value;
    loadPreset(selectedPreset);
  });
};
