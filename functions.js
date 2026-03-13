const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const infoBox = document.getElementById("infoBox");
// Load map image
const img = new Image();
img.src = "assets/traffic.png";
let scale=1, offsetY=0, imageLoaded=false;
const soundToggleBtn = document.getElementById("soundToggle");
const synthToggleBtn = document.getElementById("synthToggle");

const minHue = 340;
const maxHue = 70;

let soundEnabled = false;
let currentVolumes = [0,0,0,0,0,0,0];
let targetVolumes  = [0,0,0,0,0,0,0];

let synthEnabled = false;
let audioContext;
let synthFilter;
let synthGain;
let lfo;
let lfoGainNode;
let lfoOffset;
let lfo2;
let lfo2GainNode;
let lfoMix = 0;
let lfoMixGain1;
let lfoMixGain2;
let lfoSum;

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

synthToggleBtn.addEventListener("click", () => {
    initAudio();
    synthEnabled = !synthEnabled;
    synthToggleBtn.textContent = `Synth: ${synthEnabled ? "ON":"OFF"}`;
});


img.onload = function(){ imageLoaded=true; resizeCanvas(); }

function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if(!imageLoaded) return;
    scale = canvas.width/img.width;
    offsetY = (canvas.height - img.height*scale)/2;
    drawImage();
}

function drawImage(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,offsetY,canvas.width,img.height*scale);
}

window.addEventListener("resize", resizeCanvas);

// Mouse movement: max-weighted traffic
canvas.addEventListener("mousemove", function(event){
    if(!imageLoaded) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const radius = 25;

    let maxWeightedTraffic = 0;

    for(let dx=-radius; dx<=radius; dx++){
        for(let dy=-radius; dy<=radius; dy++){
        const dist = Math.sqrt(dx*dx + dy*dy);
        if(dist <= radius){
            const px = Math.round(mouseX + dx);
            const py = Math.round(mouseY + dy);
            if(px>=0 && py>=0 && px<canvas.width && py<canvas.height){
            const pixel = ctx.getImageData(px, py, 1, 1).data;
            const hsv = rgbToHsv(pixel[0], pixel[1], pixel[2]);
            const hue = hsv.h;

            if(hsv.s>25 && ((hue>=0 && hue<=maxHue)||(hue>=minHue && hue<=360))){
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
});


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
    if (synthGain && lfo) {
        let lag = 0.5;
        if (synthEnable) {
            setSynthGain(currentTraffic, lag);
            const cutoff = mapRange(currentTraffic, 0, 1, 2500, 150);
            setSynthFreq(cutoff, lag);
            setSynthLfoFreq(5 * (1 - currentTraffic) + 0.1, lag);
            setSynthLfoDepth(currentTraffic, lag);
            setLfoMix(currentTraffic, lag);
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

async function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext) {
        createSyntSound();
    }
}

async function createSyntSound() {
    if (!audioContext) return;

    const audioCtx = audioContext;
    const now = audioCtx.currentTime;

    // --- Gain (output level) ---
    synthGain = audioCtx.createGain();
    synthGain.gain.value = 0;

    // --- Bandpass filter ---
    synthFilter = audioCtx.createBiquadFilter();
    synthFilter.type = "bandpass";
    synthFilter.frequency.value = 1500;
    synthFilter.Q.value = 1;

    // --- Pink noise worklet ---
    await audioCtx.audioWorklet.addModule('pinknoise.js');
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
    pinkNoiseNode.connect(synthFilter);
    synthFilter.connect(ampGain);
    ampGain.connect(synthGain);
    synthGain.connect(audioCtx.destination);

    // --- Start modulation sources ---
    lfo.start(now);
    lfo2.start(now);
    lfoOffset.start(now);
}

function setSynthGain(targetLevel, lagTime = 0) {
    const now = synthGain.context.currentTime;

    synthGain.gain.cancelScheduledValues(now);
    synthGain.gain.setTargetAtTime(targetLevel, now, lagTime);
}

function setSynthFreq(targetFreq, lagTime = 0) {
    const now = synthFilter.context.currentTime;

    synthFilter.frequency.cancelScheduledValues(now);
    synthFilter.frequency.setTargetAtTime(targetFreq, now, lagTime);
}

function setSynthLfoFreq(targetFreq, lagTime = 0) {
    const now = lfo.context.currentTime;

    lfo.frequency.cancelScheduledValues(now);
    lfo.frequency.setTargetAtTime(targetFreq, now, lagTime);
}

function setSynthLfoDepth(depth = 0, lagTime = 0.25) {
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