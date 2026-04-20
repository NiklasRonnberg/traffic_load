const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const infoBox = document.getElementById("infoBox");
// Load map image
const img = new Image();
img.src = "assets/traffic.png";
let scale=1, offsetY=0, imageLoaded=false;
const soundToggleBtn = document.getElementById("soundToggle");
const noiseToggleBtn = document.getElementById("noiseToggle");
const synthToggleBtn = document.getElementById("synthToggle");

const minHue = 340;
const maxHue = 70;

let soundEnabled = false;
let currentVolumes = [0,0,0,0,0,0,0];
let targetVolumes  = [0,0,0,0,0,0,0];

let noiseStarted = false;
let noiseEnabled = false;
let audioContext;
let noiseFilter;
let noiseGain;
let lfo;
let lfoGainNode;
let lfoOffset;
let lfo2;
let lfo2GainNode;
let lfoMix = 0;
let lfoMixGain1;
let lfoMixGain2;
let lfoSum;

let synthStarted = false;
let synthEnabled = false;
let tone1Osc1, tone1Osc2, tone1Osc3;
let tone2Osc1, tone2Osc2, tone2Osc3;
let synthGain;
let synthDefaultGain = 0.01;
let deTune = 0;
let tone2Detune = 0;

let currentTraffic = 0;

// Preload audio
const audioPlayers = [
    new Audio("assets/level0.mp3"),
    new Audio("assets/level1.mp3"),
    new Audio("assets/level2.mp3"),
    new Audio("assets/level3.mp3"),
    new Audio("assets/level4.mp3"),
    new Audio("assets/level5.mp3"),
    new Audio("assets/birds.mp3")
];
audioPlayers.forEach(p => { p.loop = true; p.volume = 0; });

soundToggleBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = `Sound: ${soundEnabled ? "ON":"OFF"}`;
    if(soundEnabled){
        audioPlayers.forEach(p => { p.currentTime=0; p.play().catch(()=>{}); });
    } else {
        audioPlayers.forEach(p => { p.pause(); });
    }
});

noiseToggleBtn.addEventListener("click", async () => {
   if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.audioWorklet.addModule('pinknoise.js');
    }
    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }
    if (!noiseStarted) {  // ensure we only create it once
        await createNoiseSound();
        noiseStarted = true;
    }
    noiseEnabled = !noiseEnabled;
    noiseToggleBtn.textContent = `Noise: ${noiseEnabled ? "ON":"OFF"}`;
});

synthToggleBtn.addEventListener("click", async () => {
   if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.audioWorklet.addModule('pinknoise.js');
    }
    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }
    if (!synthStarted) {  // ensure we only create it once
        await createSynthSound();
        synthStarted = true;
    }
    synthEnabled = !synthEnabled;
    synthToggleBtn.textContent = `Synth: ${synthEnabled ? "ON":"OFF"}`;
});


img.onload = function(){ imageLoaded=true; resizeCanvas(); }

function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if(!imageLoaded) return;
    scale = canvas.width/img.width;
    offsetY = (canvas.height / 2) - (img.height * scale / 2);
    drawImage();
}

function drawImage(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,offsetY,canvas.width,img.height*scale);
}

window.addEventListener("resize", resizeCanvas);

// Handle touch as mouse
function handlePointer(x, y) {
    if(!imageLoaded) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = x - rect.left;
    const mouseY = y - rect.top;
    const radius = 25;

    let maxWeightedTraffic = 0;

    for(let dx = -radius; dx <= radius; dx++){
        for(let dy = -radius; dy <= radius; dy++){
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist <= radius){
                const px = Math.round(mouseX + dx);
                const py = Math.round(mouseY + dy);
                if(px >= 0 && py >= 0 && px < canvas.width && py < canvas.height){
                    const pixel = ctx.getImageData(px, py, 1, 1).data;
                    const hsv = rgbToHsv(pixel[0], pixel[1], pixel[2]);
                    const hue = hsv.h;
                    if(hsv.s > 25 && ((hue >= 0 && hue <= maxHue) || (hue >= minHue && hue <= 360))){
                        const trafficValue = hueToTraffic(hue);
                        const distanceFactor = 1 - dist/radius;
                        const weightedTraffic = trafficValue * distanceFactor;
                        maxWeightedTraffic = Math.max(maxWeightedTraffic, weightedTraffic);
                    } 
                    
                }
            }
        }
    }

    currentTraffic = maxWeightedTraffic;
    infoBox.textContent = `Traffic: ${(currentTraffic*100).toFixed(1)}%`;
    if (currentTraffic == 0) {
        infoBox.style.backgroundColor = 'rgba(25, 25, 25, 0.75)';
        infoBox.style.color = 'rgb(255, 255, 255)';
    } else {
        infoBox.style.backgroundColor = trafficLevelToHsl(currentTraffic);
        if (currentTraffic <= 0.5) {
            infoBox.style.color = 'rgb(0, 0, 0)';
        } else {
            infoBox.style.color = 'rgb(255, 255, 255)';
        }
    }
}



// Mouse mouse
canvas.addEventListener("mousemove", e => handlePointer(e.clientX, e.clientY));

// Touch events
canvas.addEventListener("touchstart", e => {
    e.preventDefault(); // prevent scrolling
    const touch = e.touches[0];
    handlePointer(touch.clientX, touch.clientY);
}, {passive: false});

canvas.addEventListener("touchmove", e => {
    e.preventDefault(); // prevent scrolling
    const touch = e.touches[0];
    handlePointer(touch.clientX, touch.clientY);
}, {passive: false});

function updateVolumes(){
    if (soundEnabled){
        targetVolumes[0] = currentTraffic<=0.25 ? 0.2+0.8*(currentTraffic/0.25) : 1;
        targetVolumes[1] = currentTraffic<0.2 ? 0 : currentTraffic<=0.4 ? (currentTraffic-0.2)/0.2 : 1;
        targetVolumes[2] = currentTraffic<0.4 ? 0 : currentTraffic<=0.6 ? (currentTraffic-0.4)/0.2 : 1;
        targetVolumes[3] = currentTraffic<0.6 ? 0 : currentTraffic<=0.75 ? (currentTraffic-0.6)/0.15 : 1;
        targetVolumes[4] = currentTraffic<0.75 ? 0 : currentTraffic<=0.85 ? (currentTraffic-0.75)/0.1 : 1;
        targetVolumes[5] = currentTraffic<0.8 ? 0 : currentTraffic<=1 ? (currentTraffic-0.8)/0.2 : 1;
        targetVolumes[6] = Math.max(0,0.02*(1-currentTraffic));
    } else {
        targetVolumes.fill(0);
    }

    const dt = 1/60;
    const lagTime = 1;
    for (let i = 0; i < audioPlayers.length; i++){
        currentVolumes[i] += (targetVolumes[i]-currentVolumes[i])*dt/lagTime;
        audioPlayers[i].volume = currentVolumes[i];
        
    }
    if (noiseGain && lfo) {
        let lag = 0.5;
        if (noiseEnabled) {
            setNoiseGain(currentTraffic, lag);
            const cutoff = mapRange(currentTraffic, 0, 1, 2500, 150);
            setNoiseFreq(cutoff, lag);
            setNoiseLfoFreq(5 * (1 - currentTraffic) + 0.1, lag);
            setNoiseLfoDepth(currentTraffic, lag);
            setLfoMix(currentTraffic, lag);
        } else {
            setNoiseGain(0, 1);
        }
    }
    if (synthGain) {
        let lag = 0.5;
        if (synthEnabled) {
            setSynthGain(currentTraffic * 0.1 + synthDefaultGain, lag);
            if (currentTraffic > 0) {
                setSynthDetune((currentTraffic - 0.1) * 25, 1);
                setTone2Detune((currentTraffic - 0.1) * 250, 1);
            } else {
                setSynthDetune(1, 1);
                setTone2Detune(0, 1);
            }
        } else {
            setSynthGain(0, 1);
        }
        
    }
    requestAnimationFrame(updateVolumes);
}
updateVolumes();

// RGB -> HSV
function rgbToHsv(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min;
    let h=0,s=max===0?0:delta/max,v=max;
    if(delta!==0){
        if(max===r) h=(g-b)/delta + (g<b?6:0);
        else if(max===g) h=(b-r)/delta+2;
        else h=(r-g)/delta+4;
        h*=60;
    }
    return {h:Math.round(h), s:Math.round(s*100), v:Math.round(v*100)};
}

function hueToTraffic(h){
    let hAdj = h;
    if(h>=minHue) hAdj -= 360;
    const traffic = (maxHue - hAdj)/(maxHue - (minHue-360));
    return Math.max(0, Math.min(1, traffic));
}

function trafficLevelToHsl(trafficLevel) {
    const hueStart = 60;   // yellow
    const hueEnd = 348;    // red
    const lightStart = 85; // %
    const lightEnd = 37;   // %

    // Calculate hue difference going "backwards" (negative direction)
    let hueDiff = hueEnd - hueStart;
    if (hueDiff > 180) hueDiff -= 360; // choose shortest path around wheel
    if (hueDiff < -180) hueDiff += 360;

    const hue = (hueStart + hueDiff * trafficLevel + 360) % 360;
    const light = lightStart + (lightEnd - lightStart) * trafficLevel;

    return `hsl(${hue}, 100%, ${light}%, 0.75)`;
}

async function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext) {
        createNoiseSound();
        createSynthSound();
    }
}

async function createNoiseSound() {
    if (!audioContext) return;

    const audioCtx = audioContext;
    const now = audioCtx.currentTime;

    // --- Gain (output level) ---
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0;

    // --- Bandpass filter ---
    noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1500;
    noiseFilter.Q.value = 1;

    // --- Pink noise worklet ---
    const pinkNoiseNode = new AudioWorkletNode(audioCtx, 'pink-noise-processor');

    // --- AM parameters ---
    const amplitudeRange = 0.5;
    const lfoOffsetValue = 0.5;

    // --- Gain stage where AM happens ---
    const ampGain = audioCtx.createGain();

    // --- LFO 1 (square) ---
    lfo = audioCtx.createOscillator();
    lfo.type = "square";
    lfo.frequency.setValueAtTime(1, now);
    // --- LFO 2 (triangle) ---
    lfo2 = audioCtx.createOscillator();
    lfo2.type = "triangle";
    lfo2.frequency.setValueAtTime(1, now);

    // --- LFO scaling ---
    lfoGainNode = audioCtx.createGain();
    lfoGainNode.gain.setValueAtTime(amplitudeRange, now);
    lfo2GainNode = audioCtx.createGain();
    lfo2GainNode.gain.setValueAtTime(amplitudeRange, now);

    // --- LFO Mix ---
    lfoMixGain1 = audioCtx.createGain();
    lfoMixGain2 = audioCtx.createGain();

    lfoMixGain1.gain.setValueAtTime(lfoMix, now);
    lfoMixGain2.gain.setValueAtTime(1 - lfoMix, now);

    // --- Sum node ---
    lfoSum = audioCtx.createGain();

    // --- Connect LFOs through mix nodes into sum ---
    lfo.connect(lfoGainNode);
    lfoGainNode.connect(lfoMixGain1);
    lfoMixGain1.connect(lfoSum);

    lfo2.connect(lfo2GainNode);
    lfo2GainNode.connect(lfoMixGain2);
    lfoMixGain2.connect(lfoSum);

    // --- DC offset as constant source ---
    lfoOffset = audioCtx.createConstantSource();
    lfoOffset.offset.setValueAtTime(lfoOffsetValue, now);
    lfoOffset.connect(lfoSum);

    // --- Connect sum + offset to ampGain ---
    lfoSum.connect(ampGain.gain);

    // --- Audio routing ---
    pinkNoiseNode.connect(noiseFilter);
    noiseFilter.connect(ampGain);
    ampGain.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    // --- Start modulation sources ---
    lfo.start(now);
    lfo2.start(now);
    lfoOffset.start(now);
}

function setNoiseGain(targetLevel, lagTime = 0) {
    const now = noiseGain.context.currentTime;

    noiseGain.gain.cancelScheduledValues(now);
    noiseGain.gain.setTargetAtTime(targetLevel, now, lagTime);
}

function setNoiseFreq(targetFreq, lagTime = 0) {
    const now = noiseFilter.context.currentTime;

    noiseFilter.frequency.cancelScheduledValues(now);
    noiseFilter.frequency.setTargetAtTime(targetFreq, now, lagTime);
}

function setNoiseLfoFreq(targetFreq, lagTime = 0) {
    const now = lfo.context.currentTime;

    lfo.frequency.cancelScheduledValues(now);
    lfo.frequency.setTargetAtTime(targetFreq, now, lagTime);
}

function setNoiseLfoDepth(depth = 0, lagTime) {
    const now = lfoGainNode.context.currentTime;
    const amplitudeRange = depth / 2;
    const offset = 1 - amplitudeRange;

    lfoGainNode.gain.cancelScheduledValues(now);
    lfoGainNode.gain.setTargetAtTime(amplitudeRange, now, lagTime);
    lfo2GainNode.gain.cancelScheduledValues(now);
    lfo2GainNode.gain.setTargetAtTime(amplitudeRange, now, lagTime);

    lfoMixGain1.gain.cancelScheduledValues(now);
    lfoMixGain1.gain.setTargetAtTime(lfoMix, now, lagTime);
    lfoMixGain2.gain.cancelScheduledValues(now);
    lfoMixGain2.gain.setTargetAtTime(1 - lfoMix, now, lagTime);

    lfoOffset.offset.cancelScheduledValues(now);
    lfoOffset.offset.setTargetAtTime(offset, now, lagTime);
}

function setLfoMix(mix, lagTime = 0.1) {
    lfoMix = Math.min(1, Math.max(0, mix));
    const now = lfoMixGain1.context.currentTime;

    lfoMixGain1.gain.cancelScheduledValues(now);
    lfoMixGain1.gain.setTargetAtTime(lfoMix, now, lagTime);
    lfoMixGain2.gain.cancelScheduledValues(now);
    lfoMixGain2.gain.setTargetAtTime(1 - lfoMix, now, lagTime);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
    return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

async function createSynthSound(detuneValue = 10) {
    if (!audioContext) return;

    const audioCtx = audioContext;
    const now = audioCtx.currentTime;

    deTune = detuneValue;

    synthGain = audioCtx.createGain();
    synthGain.gain.cancelScheduledValues(now);
    synthGain.gain.setValueAtTime(0, now);
    synthGain.gain.exponentialRampToValueAtTime(synthDefaultGain, now + 1);

    // --- Tone 1 : 261.63 Hz ---
    tone1Osc1 = audioCtx.createOscillator();
    tone1Osc2 = audioCtx.createOscillator();
    tone1Osc3 = audioCtx.createOscillator();

    tone1Osc1.type = "triangle";
    tone1Osc2.type = "triangle";
    tone1Osc3.type = "triangle";

    tone1Osc1.frequency.setValueAtTime(261.63, now);
    tone1Osc2.frequency.setValueAtTime(261.63, now);
    tone1Osc3.frequency.setValueAtTime(261.63, now);

    tone1Osc1.detune.setValueAtTime(0, now);
    tone1Osc2.detune.setValueAtTime(deTune, now);
    tone1Osc3.detune.setValueAtTime(-deTune, now);

    // --- Tone 2 : 392 Hz ---
    tone2Osc1 = audioCtx.createOscillator();
    tone2Osc2 = audioCtx.createOscillator();
    tone2Osc3 = audioCtx.createOscillator();

    tone2Osc1.type = "triangle";
    tone2Osc2.type = "triangle";
    tone2Osc3.type = "triangle";

    tone2Osc1.frequency.setValueAtTime(392.00, now);
    tone2Osc2.frequency.setValueAtTime(392.00, now);
    tone2Osc3.frequency.setValueAtTime(392.00, now);

    tone2Osc1.detune.setValueAtTime(tone2Detune, now);
    tone2Osc2.detune.setValueAtTime(tone2Detune + deTune, now);
    tone2Osc3.detune.setValueAtTime(tone2Detune - deTune, now);

    // --- Connect ---
    tone1Osc1.connect(synthGain);
    tone1Osc2.connect(synthGain);
    tone1Osc3.connect(synthGain);

    tone2Osc1.connect(synthGain);
    tone2Osc2.connect(synthGain);
    tone2Osc3.connect(synthGain);

    synthGain.connect(audioCtx.destination);

    // --- Start oscillators ---
    tone1Osc1.start(now);
    tone1Osc2.start(now);
    tone1Osc3.start(now);

    tone2Osc1.start(now);
    tone2Osc2.start(now);
    tone2Osc3.start(now);
}

function setSynthDetune(value = 0, lagTime = 0) {
    const now = audioContext.currentTime;

    tone1Osc2.detune.setTargetAtTime(value, now, lagTime);
    tone1Osc3.detune.setTargetAtTime(-value, now, lagTime);

    tone2Osc2.detune.setTargetAtTime(tone2Detune + value, now, lagTime);
    tone2Osc3.detune.setTargetAtTime(tone2Detune - value, now, lagTime);
}

function setSynthGain(value, lagTime = 0) {
    const now = synthGain.context.currentTime;
    synthGain.gain.setTargetAtTime(value, now, lagTime);
}

function setTone2Detune(value = 0, lagTime = 0) {
    const now = audioContext.currentTime;

    tone2Osc1.detune.setTargetAtTime(tone2Detune, now, lagTime);
    tone2Osc2.detune.setTargetAtTime(tone2Detune + value, now, lagTime);
    tone2Osc3.detune.setTargetAtTime(tone2Detune - value, now, lagTime);
}
