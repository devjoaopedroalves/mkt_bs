/* ============================================
   BS LINGERIE - FESTA DA SORTE
   Main Application Script
   v2.0 - Sons + Instagram + Google Sheets
   ============================================ */

// ========================
// CONFIGURATION
// ========================
const CONFIG = {
    // Instagram da loja
    storeInstagram: 'bs.lingerie4',
    storeInstagramUrl: 'https://www.instagram.com/bs.lingerie4',
    // Google Sheets Web App URL (Apps Script)
    // Deploy your Google Apps Script and paste the URL here
    googleSheetsUrl: 'https://script.google.com/macros/s/AKfycbwZFWSC3X1CSKxbio2MNryI_eCgRILL3NcQ9jiaH2bG28EZxMu-YcJRoNhUyo6KEZMu/exec',
    // Admin password
    adminPassword: 'bs2024admin',
    // Local storage keys
    storageParticipants: 'bs_festa_participants',
    storageUsedNumbers: 'bs_festa_used_numbers',
};

// Prize configuration with weighted probabilities
// Prêmios maiores = chances menores (protege lucro)
const PRIZES = [
    { name: '5% OFF', icon: '🟢', color: '#2e7d32', weight: 35 },
    { name: '10% OFF', icon: '💚', color: '#009739', weight: 28 },
    { name: '15% OFF', icon: '💛', color: '#FEDD00', weight: 18 },
    { name: 'Calcinha Grátis', icon: '🩲', color: '#00c853', weight: 10 },
    { name: '40% OFF', icon: '💙', color: '#012169', weight: 6 },
    { name: 'Duas Calcinhas Grátis', icon: '🩲🩲', color: '#ff6b00', weight: 2 },
    { name: '50% OFF', icon: '🏆', color: '#FFD700', weight: 1 },
];

// ========================
// STATE
// ========================
let currentPlayer = null;
let isSpinning = false;
let wheelAngle = 0;
let wheelCanvas, wheelCtx;
let audioCtx = null;
let soundsEnabled = false;

// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initWheel();
    initRouletteLights();
    formatWhatsAppInput();
    
    // Enable audio on first user interaction
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
});

// ========================
// WEB AUDIO API - SOUND ENGINE
// ========================
function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        soundsEnabled = true;
        // Play a tiny silent buffer to unlock audio on mobile
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
    } catch (e) {
        console.warn('Web Audio not supported:', e);
    }
}

function ensureAudioCtx() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            soundsEnabled = true;
        } catch (e) { return false; }
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return true;
}

// --- Crowd Cheering Sound (white noise + filter = crowd roar) ---
let crowdNode = null;
let crowdGain = null;

function startCrowdSound(volume = 0.15) {
    if (!ensureAudioCtx()) return;
    stopCrowdSound();
    
    const bufferSize = audioCtx.sampleRate * 3;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < bufferSize; i++) {
            // Crowd-like noise with rhythm
            const t = i / audioCtx.sampleRate;
            const rhythm = 0.5 + 0.5 * Math.sin(t * 3 * Math.PI); // ~1.5Hz rhythm (clapping)
            const rhythm2 = 0.3 + 0.7 * Math.sin(t * 5.5 * Math.PI); // faster overlay
            data[i] = (Math.random() * 2 - 1) * rhythm * rhythm2;
        }
    }
    
    crowdNode = audioCtx.createBufferSource();
    crowdNode.buffer = buffer;
    crowdNode.loop = true;
    
    // Bandpass filter to sound more like crowd
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    
    // Second filter for warmth
    const filter2 = audioCtx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 2500;
    
    crowdGain = audioCtx.createGain();
    crowdGain.gain.value = volume;
    
    crowdNode.connect(filter);
    filter.connect(filter2);
    filter2.connect(crowdGain);
    crowdGain.connect(audioCtx.destination);
    crowdNode.start(0);
}

function setCrowdVolume(volume) {
    if (crowdGain) {
        crowdGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.1);
    }
}

function stopCrowdSound() {
    if (crowdNode) {
        try { 
            if (crowdGain) crowdGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
            setTimeout(() => {
                try { crowdNode.stop(); } catch(e) {}
                crowdNode = null;
                crowdGain = null;
            }, 500);
        } catch(e) {}
    }
}

// --- Roulette Tick Sound ---
function playTickSound(pitch = 800) {
    if (!ensureAudioCtx()) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = pitch;
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.06);
}

// --- Spinning Whoosh Sound ---
let spinOsc = null;
let spinGain = null;

function startSpinSound() {
    if (!ensureAudioCtx()) return;
    stopSpinSound();
    
    spinOsc = audioCtx.createOscillator();
    spinGain = audioCtx.createGain();
    
    spinOsc.type = 'sawtooth';
    spinOsc.frequency.value = 100;
    spinGain.gain.value = 0.04;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    
    spinOsc.connect(filter);
    filter.connect(spinGain);
    spinGain.connect(audioCtx.destination);
    spinOsc.start(0);
}

function updateSpinSound(speed) {
    // speed: 0 to 1, where 1 = fastest
    if (spinOsc) {
        spinOsc.frequency.setTargetAtTime(80 + speed * 300, audioCtx.currentTime, 0.05);
    }
    if (spinGain) {
        spinGain.gain.setTargetAtTime(0.02 + speed * 0.06, audioCtx.currentTime, 0.05);
    }
}

function stopSpinSound() {
    if (spinOsc) {
        try {
            if (spinGain) spinGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
            setTimeout(() => {
                try { spinOsc.stop(); } catch(e) {}
                spinOsc = null;
                spinGain = null;
            }, 300);
        } catch(e) {}
    }
}

// --- Celebration Horn / Victory Sound ---
function playVictoryHorn() {
    if (!ensureAudioCtx()) return;
    
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6 - triumphant chord
    
    notes.forEach((freq, i) => {
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'square';
            osc.frequency.value = freq;
            
            gain.gain.value = 0;
            gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.05);
            gain.gain.setTargetAtTime(0.05, audioCtx.currentTime + 0.1, 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 2000;
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 1.5);
        }, i * 120);
    });
}

// --- Stadium Drum Roll ---
function playDrumRoll(durationMs = 2000) {
    if (!ensureAudioCtx()) return;
    
    const interval = 60;
    const beats = Math.floor(durationMs / interval);
    
    for (let i = 0; i < beats; i++) {
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'triangle';
            osc.frequency.value = 80 + Math.random() * 40;
            gain.gain.value = 0.06 + (i / beats) * 0.08; // crescendo
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.08);
        }, i * interval);
    }
}

// --- Firework Boom ---
function playBoomSound() {
    if (!ensureAudioCtx()) return;
    
    const bufferSize = audioCtx.sampleRate * 0.5;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        const t = i / audioCtx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 8);
    }
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    
    const gain = audioCtx.createGain();
    gain.gain.value = 0.25;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    source.start(0);
}

// --- Celebration Whistle ---
function playWhistle() {
    if (!ensureAudioCtx()) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 2800;
    osc.frequency.linearRampToValueAtTime(3200, audioCtx.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(2600, audioCtx.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(3400, audioCtx.currentTime + 0.5);
    
    gain.gain.value = 0.06;
    gain.gain.setTargetAtTime(0, audioCtx.currentTime + 0.5, 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.8);
}

// ========================
// PARTICLES BACKGROUND
// ========================
function initParticles() {
    const container = document.getElementById('particles-container');
    const colors = ['#009739', '#FEDD00', '#012169', '#ffffff', '#00c853', '#FFD700'];
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        const size = Math.random() * 6 + 2;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100;
        const duration = Math.random() * 10 + 8;
        const delay = Math.random() * 10;
        
        particle.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            left: ${left}%;
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
            opacity: ${Math.random() * 0.5 + 0.2};
            box-shadow: 0 0 ${size * 2}px ${color};
        `;
        container.appendChild(particle);
    }
}

// ========================
// ROULETTE LIGHTS
// ========================
function initRouletteLights() {
    const lightsContainer = document.querySelector('.roulette-lights');
    if (!lightsContainer) return;
    
    const numLights = 24;
    const radius = 168;
    
    for (let i = 0; i < numLights; i++) {
        const angle = (i / numLights) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        const light = document.createElement('div');
        light.style.cssText = `
            position: absolute;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${i % 2 === 0 ? '#FEDD00' : '#00c853'};
            top: 50%;
            left: 50%;
            transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px));
            box-shadow: 0 0 8px ${i % 2 === 0 ? '#FEDD00' : '#00c853'};
            animation: lightBlink 0.8s ease-in-out infinite ${i * 0.1}s alternate;
        `;
        lightsContainer.appendChild(light);
    }
    
    if (!document.getElementById('light-blink-style')) {
        const style = document.createElement('style');
        style.id = 'light-blink-style';
        style.textContent = `
            @keyframes lightBlink {
                0% { opacity: 0.3; transform: translate(var(--tx, 0), var(--ty, 0)) scale(0.8); }
                100% { opacity: 1; transform: translate(var(--tx, 0), var(--ty, 0)) scale(1.2); }
            }
        `;
        document.head.appendChild(style);
    }
}

// ========================
// SCREEN NAVIGATION
// ========================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }
}

function showHeroScreen() {
    showScreen('hero-screen');
}

function showFormScreen() {
    showScreen('form-screen');
    document.getElementById('nome').focus();
}

function showRouletteScreen() {
    showScreen('roulette-screen');
    setTimeout(() => {
        resizeWheel();
        drawWheel();
    }, 100);
}

function showResultScreen() {
    showScreen('result-screen');
}

// ========================
// WHATSAPP INPUT MASK
// ========================
function formatWhatsAppInput() {
    const input = document.getElementById('whatsapp');
    input.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        
        if (value.length > 6) {
            value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
        } else if (value.length > 2) {
            value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
        } else if (value.length > 0) {
            value = `(${value}`;
        }
        
        e.target.value = value;
    });
}

// ========================
// FORM HANDLING
// ========================
function handleFormSubmit(event) {
    event.preventDefault();
    
    const nome = document.getElementById('nome').value.trim();
    const instagram = document.getElementById('instagram').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();
    const whatsappClean = whatsapp.replace(/\D/g, '');
    
    if (!nome || !instagram || !whatsappClean) {
        showFormError('Preencha todos os campos! 📝');
        return false;
    }
    
    if (whatsappClean.length < 10) {
        showFormError('WhatsApp inválido! Use o formato (00) 00000-0000 📱');
        return false;
    }
    
    const usedNumbers = getUsedNumbers();
    if (usedNumbers.includes(whatsappClean)) {
        showFormError('Esse WhatsApp já participou! Cada número só pode jogar uma vez. 🚫');
        return false;
    }
    
    let insta = instagram;
    if (!insta.startsWith('@')) insta = '@' + insta;
    
    currentPlayer = {
        nome,
        instagram: insta,
        whatsapp: whatsappClean,
        whatsappFormatted: whatsapp,
    };
    
    document.getElementById('player-display-name').textContent = `🎉 ${nome}, é sua vez!`;
    
    showRouletteScreen();
    return false;
}

function showFormError(message) {
    const errorEl = document.getElementById('form-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    
    errorEl.style.animation = 'none';
    void errorEl.offsetHeight;
    errorEl.style.animation = 'screenShake 0.5s ease-in-out';
    
    setTimeout(() => {
        errorEl.classList.add('hidden');
    }, 5000);
}

// ========================
// LOCAL STORAGE
// ========================
function getUsedNumbers() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.storageUsedNumbers) || '[]');
    } catch { return []; }
}

function saveUsedNumber(number) {
    const numbers = getUsedNumbers();
    numbers.push(number);
    localStorage.setItem(CONFIG.storageUsedNumbers, JSON.stringify(numbers));
}

function getParticipants() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.storageParticipants) || '[]');
    } catch { return []; }
}

function saveParticipant(participant) {
    const participants = getParticipants();
    participants.push(participant);
    localStorage.setItem(CONFIG.storageParticipants, JSON.stringify(participants));
}

// ========================
// GOOGLE SHEETS INTEGRATION
// ========================
function sendToGoogleSheets(participant) {
    if (!CONFIG.googleSheetsUrl) {
        console.warn('Google Sheets URL not configured. Set CONFIG.googleSheetsUrl');
        return;
    }
    
    const data = {
        nome: participant.nome,
        instagram: participant.instagram,
        whatsapp: participant.whatsappFormatted || participant.whatsapp,
        premio: `${participant.prizeIcon} ${participant.prize}`,
        codigo: participant.code,
        data: participant.date,
        hora: participant.time,
    };
    
    // Send to Google Apps Script Web App
    fetch(CONFIG.googleSheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).then(() => {
        console.log('✅ Dados enviados para Google Sheets');
    }).catch(err => {
        console.error('❌ Erro ao enviar para Google Sheets:', err);
    });
}

// ========================
// ROULETTE WHEEL DRAWING
// ========================
function initWheel() {
    wheelCanvas = document.getElementById('roulette-wheel');
    wheelCtx = wheelCanvas.getContext('2d');
    resizeWheel();
    drawWheel();
}

function resizeWheel() {
    const container = document.querySelector('.roulette-outer-ring');
    if (!container) return;
    const size = container.clientWidth - 20;
    wheelCanvas.width = size * 2;
    wheelCanvas.height = size * 2;
    wheelCanvas.style.width = size + 'px';
    wheelCanvas.style.height = size + 'px';
    wheelCtx.scale(2, 2);
}

function drawWheel(rotation = 0) {
    const canvas = wheelCanvas;
    const ctx = wheelCtx;
    const size = canvas.width / 2;
    const center = size / 2;
    const radius = center - 5;
    
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(rotation);
    
    const totalWeight = PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let startAngle = 0;
    
    PRIZES.forEach((prize, i) => {
        const sliceAngle = (prize.weight / totalWeight) * Math.PI * 2;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, lightenColor(prize.color, 30));
        gradient.addColorStop(0.5, prize.color);
        gradient.addColorStop(1, darkenColor(prize.color, 20));
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Text and Icon
        ctx.save();
        ctx.rotate(startAngle + sliceAngle / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Icon (larger)
        const iconSize = Math.min(30, radius * 0.18);
        ctx.font = `${iconSize}px Arial`;
        ctx.fillText(prize.icon, radius * 0.65, -12);
        
        // Prize name (with outline and larger font)
        const fontSize = Math.min(16, radius * 0.08);
        ctx.font = `900 ${fontSize}px Montserrat, sans-serif`;
        
        // Setup stroke and fill
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff'; // White outline
        ctx.fillStyle = darkenColor(prize.color, 40); // Dark color for contrast
        
        const textRadius = radius * 0.65;
        const words = prize.name.split(' ');
        
        if (words.length > 2) {
            // Line 1
            ctx.strokeText(words.slice(0, 2).join(' '), textRadius, 12);
            ctx.fillText(words.slice(0, 2).join(' '), textRadius, 12);
            // Line 2
            ctx.strokeText(words.slice(2).join(' '), textRadius, 12 + fontSize * 1.2);
            ctx.fillText(words.slice(2).join(' '), textRadius, 12 + fontSize * 1.2);
        } else {
            ctx.strokeText(prize.name, textRadius, 12);
            ctx.fillText(prize.name, textRadius, 12);
        }
        
        ctx.restore();
        
        startAngle += sliceAngle;
    });
    
    // Draw center dot
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#1a1a25';
    ctx.font = `bold ${Math.min(14, radius * 0.1)}px Bebas Neue, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillText('BS', 0, 1);
    
    ctx.restore();
}

function lightenColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + amount);
    const b = Math.min(255, (num & 0x0000FF) + amount);
    return `rgb(${r},${g},${b})`;
}

function darkenColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
    const b = Math.max(0, (num & 0x0000FF) - amount);
    return `rgb(${r},${g},${b})`;
}

// ========================
// WEIGHTED RANDOM PRIZE
// ========================
function selectPrize() {
    const totalWeight = PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < PRIZES.length; i++) {
        random -= PRIZES[i].weight;
        if (random <= 0) return i;
    }
    return 0;
}

// ========================
// SPIN THE ROULETTE
// ========================
function spinRoulette() {
    if (isSpinning) return;
    isSpinning = true;
    
    const spinBtn = document.getElementById('btn-spin');
    spinBtn.disabled = true;
    spinBtn.style.opacity = '0.5';
    
    document.querySelector('.roulette-wrapper').classList.add('spinning');
    document.body.classList.add('stadium-lights-active');
    
    // 🔊 Start sounds
    startCrowdSound(0.08);
    startSpinSound();
    playDrumRoll(2000);
    
    const prizeIndex = selectPrize();
    const prize = PRIZES[prizeIndex];
    
    const totalWeight = PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let prizeStartAngle = 0;
    for (let i = 0; i < prizeIndex; i++) {
        prizeStartAngle += (PRIZES[i].weight / totalWeight) * 360;
    }
    const prizeSliceAngle = (prize.weight / totalWeight) * 360;
    const prizeMiddle = prizeStartAngle + prizeSliceAngle / 2;
    
    const targetAngle = 360 - prizeMiddle + 270;
    const extraSpins = 6 + Math.floor(Math.random() * 4); // 6-9 full rotations
    const totalRotation = extraSpins * 360 + targetAngle + (Math.random() * prizeSliceAngle * 0.6 - prizeSliceAngle * 0.3);
    
    const startAngle = wheelAngle;
    const finalAngle = startAngle + (totalRotation * Math.PI / 180);
    
    const duration = 8000; // 8 seconds for dramatic deceleration
    const startTime = performance.now();
    let lastTickSector = -1;
    
    // Calculate slice boundaries in degrees for tick sound
    const boundaries = [];
    let cumulative = 0;
    PRIZES.forEach(p => {
        cumulative += (p.weight / totalWeight) * 360;
        boundaries.push(cumulative);
    });
    
    function animateSpin(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Custom easing: easeOutQuint for very smooth long tail
        const eased = 1 - Math.pow(1 - progress, 5);
        
        const currentAngle = startAngle + (finalAngle - startAngle) * eased;
        wheelAngle = currentAngle;
        
        // 🔊 Update spin sound pitch based on speed
        const speed = 1 - Math.pow(progress, 3);
        updateSpinSound(speed);
        
        // 🔊 Crowd gets louder as we near the end
        if (progress > 0.5) {
            setCrowdVolume(0.08 + (progress - 0.5) * 0.6);
        }
        
        // 🔊 Tick sound when passing a sector boundary
        // currentAngle modulo 360 gives us where the pointer (top = 270 deg) is relative to the wheel
        // Actually, the pointer is fixed. The wheel rotates by currentAngle.
        // Slice 0 starts at angle 0. If wheel rotates by A, slice 0 is at A.
        // Pointer is at 270 degrees.
        const pointerRelAngle = (360 - (currentAngle * 180 / Math.PI % 360) + 270) % 360;
        
        let currentSector = 0;
        for (let i = 0; i < boundaries.length; i++) {
            if (pointerRelAngle <= boundaries[i]) {
                currentSector = i;
                break;
            }
        }
        
        if (currentSector !== lastTickSector && elapsed > 100) {
            lastTickSector = currentSector;
            const tickPitch = 600 + (1 - speed) * 400;
            playTickSound(tickPitch);
            
            // CSS Tremble on the pointer
            const pointer = document.querySelector('.roulette-pointer');
            pointer.classList.remove('pointer-tick');
            void pointer.offsetWidth; // trigger reflow
            pointer.classList.add('pointer-tick');
        }
        
        wheelCtx.setTransform(2, 0, 0, 2, 0, 0);
        drawWheel(currentAngle);
        
        // Wheel Vibration via CSS class at high speed
        const container = document.querySelector('.roulette-container');
        if (speed > 0.6) {
            container.classList.add('wheel-vibrate');
        } else {
            container.classList.remove('wheel-vibrate');
        }
        
        if (progress < 1) {
            requestAnimationFrame(animateSpin);
        } else {
            onSpinComplete(prize, prizeIndex);
        }
    }
    
    requestAnimationFrame(animateSpin);
}

function onSpinComplete(prize, prizeIndex) {
    isSpinning = false;
    
    // 🔊 Stop spinning sounds, play victory
    stopSpinSound();
    setCrowdVolume(0.5); // Crowd goes wild
    playVictoryHorn();
    playWhistle();
    
    // ⚽🔊 GOOOOL! Play the goal celebration audio
    playGoalAudio();
    
    setTimeout(() => playBoomSound(), 200);
    setTimeout(() => playBoomSound(), 600);
    setTimeout(() => playBoomSound(), 1000);
    setTimeout(() => playWhistle(), 800);
    
    // Fade out crowd after celebration
    setTimeout(() => stopCrowdSound(), 4000);
    
    document.querySelector('.roulette-wrapper').classList.remove('spinning');
    document.body.classList.remove('stadium-lights-active');
    document.querySelector('.roulette-container').style.transform = '';
    
    const now = new Date();
    const participant = {
        ...currentPlayer,
        prize: prize.name,
        prizeIcon: prize.icon,
        date: now.toLocaleDateString('pt-BR'),
        time: now.toLocaleTimeString('pt-BR'),
        timestamp: now.toISOString(),
        code: generateCode(),
    };
    
    saveParticipant(participant);
    saveUsedNumber(currentPlayer.whatsapp);
    
    // 📊 Send to Google Sheets
    sendToGoogleSheets(participant);
    
    showResult(participant);
    
    setTimeout(() => {
        launchCelebration();
    }, 300);
}

// ⚽ Goal celebration audio (gol.mp3)
let goalAudio = null;

function playGoalAudio() {
    try {
        if (!goalAudio) {
            goalAudio = new Audio('gol.mp3');
            goalAudio.volume = 0.7;
        }
        goalAudio.currentTime = 0;
        goalAudio.play().catch(e => console.warn('Goal audio blocked:', e));
    } catch (e) {
        console.warn('Could not play goal audio:', e);
    }
}

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'BS-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ========================
// RESULT DISPLAY (Instagram)
// ========================

// Prize-specific redemption rules
const PRIZE_RULES = {
    '5% OFF': {
        instruction: 'Retire seu prêmio realizando qualquer compra na BS Lingerie.',
        rules: 'Válido em compras na loja. Não cumulativo com outras promoções.',
    },
    '10% OFF': {
        instruction: 'Retire seu prêmio realizando qualquer compra na BS Lingerie.',
        rules: 'Válido em compras na loja. Não cumulativo com outras promoções.',
    },
    '15% OFF': {
        instruction: 'Retire seu prêmio realizando qualquer compra na BS Lingerie.',
        rules: 'Válido em compras na loja. Não cumulativo com outras promoções.',
    },
    '40% OFF': {
        instruction: 'Retire seu prêmio realizando qualquer compra na BS Lingerie.',
        rules: 'Válido em compras na loja. Prêmio exclusivo! Não cumulativo com outras promoções.',
    },
    'Calcinha Grátis': {
        instruction: 'Retire seu prêmio realizando qualquer compra na BS Lingerie.',
        rules: 'Válida na compra de qualquer valor. Limitada a 1 unidade por cliente. Não cumulativa.',
    },
    'Duas Calcinhas Grátis': {
        instruction: 'Retire seu prêmio realizando qualquer compra na BS Lingerie.',
        rules: 'Válida na compra de qualquer valor. Limitada a 2 unidades por cliente. Não cumulativa.',
    },
    '50% OFF': {
        instruction: '🔥 PRÊMIO SUPER RARO! Retire realizando qualquer compra na BS Lingerie.',
        rules: 'Válido em compras na loja. Prêmio exclusivo e super raro! Não cumulativo com outras promoções.',
    },
};

function showResult(participant) {
    document.getElementById('result-player-name').textContent = participant.nome;
    document.getElementById('result-prize-icon').textContent = participant.prizeIcon;
    document.getElementById('result-prize-name').textContent = participant.prize;
    document.getElementById('result-code').textContent = `Código: ${participant.code}`;
    
    // Set prize-specific rules
    const rules = PRIZE_RULES[participant.prize] || {
        instruction: 'Retire seu prêmio na BS Lingerie.',
        rules: '',
    };
    
    document.getElementById('result-instruction').innerHTML = 
        `${rules.instruction}`;
    document.getElementById('result-rules').textContent = rules.rules;
    
    // Instagram DM link
    document.getElementById('btn-instagram-claim').href = 
        `https://ig.me/m/${CONFIG.storeInstagram}`;
    
    showResultScreen();
}

// ========================
// CELEBRATION EFFECTS
// ========================
function launchCelebration() {
    launchConfetti();
    launchFireworks();
    
    // 🔊 Boom sounds with fireworks
    playBoomSound();
    
    setTimeout(() => { launchConfetti(); playBoomSound(); }, 1000);
    setTimeout(() => { launchConfetti(); playBoomSound(); }, 2500);
    setTimeout(() => { launchFireworks(); playBoomSound(); }, 1500);
    setTimeout(() => { launchFireworks(); playWhistle(); }, 3000);
}

// --- CONFETTI ---
function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const confettiPieces = [];
    const colors = ['#009739', '#FEDD00', '#012169', '#ffffff', '#00c853', '#FFD700', '#ff6b00'];
    const shapes = ['rect', 'circle', 'star'];
    
    for (let i = 0; i < 200; i++) {
        confettiPieces.push({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * 200,
            w: Math.random() * 10 + 5,
            h: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            shape: shapes[Math.floor(Math.random() * shapes.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            speedX: (Math.random() - 0.5) * 6,
            speedY: Math.random() * 4 + 2,
            gravity: 0.05 + Math.random() * 0.05,
            opacity: 1,
            swing: Math.random() * 0.1,
            swingSpeed: Math.random() * 0.02 + 0.01,
            swingOffset: Math.random() * Math.PI * 2,
        });
    }
    
    let confettiFrame;
    function animateConfetti() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        
        confettiPieces.forEach(p => {
            if (p.opacity <= 0) return;
            alive = true;
            
            p.speedY += p.gravity;
            p.x += p.speedX + Math.sin(p.swingOffset) * p.swing;
            p.y += p.speedY;
            p.rotation += p.rotationSpeed;
            p.swingOffset += p.swingSpeed;
            
            if (p.y > canvas.height + 20) {
                p.opacity -= 0.02;
            }
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            
            if (p.shape === 'rect') {
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            } else if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                drawStar(ctx, 0, 0, 5, p.w / 2, p.w / 4);
            }
            
            ctx.restore();
        });
        
        if (alive) {
            confettiFrame = requestAnimationFrame(animateConfetti);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cancelAnimationFrame(confettiFrame);
        }
    }
    
    animateConfetti();
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
}

// --- FIREWORKS ---
function launchFireworks() {
    const canvas = document.getElementById('fireworks-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const fireworks = [];
    const particles = [];
    const colors = ['#009739', '#FEDD00', '#012169', '#ffffff', '#00c853', '#FFD700'];
    
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            fireworks.push({
                x: canvas.width * (0.2 + Math.random() * 0.6),
                y: canvas.height,
                targetY: canvas.height * (0.15 + Math.random() * 0.3),
                speed: 8 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                trail: [],
                exploded: false,
            });
        }, i * 300);
    }
    
    let fwFrame;
    function animateFireworks() {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        fireworks.forEach((fw, i) => {
            if (!fw.exploded) {
                fw.y -= fw.speed;
                fw.trail.push({ x: fw.x, y: fw.y, opacity: 1 });
                if (fw.trail.length > 10) fw.trail.shift();
                
                fw.trail.forEach((t, ti) => {
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
                    ctx.fillStyle = fw.color;
                    ctx.globalAlpha = ti / fw.trail.length * 0.8;
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
                
                ctx.beginPath();
                ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                
                if (fw.y <= fw.targetY) {
                    fw.exploded = true;
                    // 🔊 Boom on explosion
                    playBoomSound();
                    
                    const numParticles = 60 + Math.floor(Math.random() * 40);
                    for (let j = 0; j < numParticles; j++) {
                        const angle = (j / numParticles) * Math.PI * 2;
                        const speed = 2 + Math.random() * 4;
                        particles.push({
                            x: fw.x,
                            y: fw.y,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            color: colors[Math.floor(Math.random() * colors.length)],
                            life: 1,
                            decay: 0.01 + Math.random() * 0.02,
                            size: 2 + Math.random() * 2,
                        });
                    }
                }
            }
        });
        
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.life -= p.decay;
            
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.fill();
            
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        
        ctx.globalAlpha = 1;
        
        if (particles.length > 0 || fireworks.some(fw => !fw.exploded)) {
            fwFrame = requestAnimationFrame(animateFireworks);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cancelAnimationFrame(fwFrame);
        }
    }
    
    animateFireworks();
}

// ========================
// WINDOW RESIZE
// ========================
window.addEventListener('resize', () => {
    if (wheelCanvas) {
        resizeWheel();
        wheelCtx.setTransform(2, 0, 0, 2, 0, 0);
        drawWheel(wheelAngle);
    }
});
