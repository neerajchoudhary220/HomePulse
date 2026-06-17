// UI Elements
const uiWSStatus = document.getElementById('uiWSStatus');
const espPulseRing = document.getElementById('espPulseRing');
const espStatusText = document.getElementById('espStatusText');
const espIpAddress = document.getElementById('espIpAddress');
const bulbWrapper = document.getElementById('bulbWrapper');
const powerStateBadge = document.getElementById('powerStateBadge');
const soundWaves = document.getElementById('soundWaves');
const alarmStatusText = document.getElementById('alarmStatusText');
const silenceBtn = document.getElementById('silenceBtn');
const hindiStatusBanner = document.getElementById('hindiStatusBanner');
const audioPermissionBanner = document.getElementById('audioPermissionBanner');
const btnAudioUnlock = document.getElementById('btnAudioUnlock');

// State variables
let uiSocket = null;
let currentAppState = {
  isESPConnected: false,
  lightStatus: "unknown",
  alarmSilenced: false
};

// Web Audio API Alarm Setup
let audioCtx = null;
let sirenOsc1 = null;
let sirenOsc2 = null;
let sirenLfo = null;
let sirenGain = null;
let userInteractedWithAudio = false;

// Helper to check and toggle audio permission banner
function checkAudioBannerState() {
  if (audioPermissionBanner) {
    if (userInteractedWithAudio || (audioCtx && audioCtx.state === 'running')) {
      audioPermissionBanner.style.display = 'none';
    } else {
      audioPermissionBanner.style.display = 'flex';
    }
  }
}

// Initialize Web Audio Context
function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        if (audioCtx.state === 'running') {
          userInteractedWithAudio = true;
          checkAudioBannerState();
        }
      }).catch(() => {});
    }
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    if (audioCtx.state === 'running') {
      userInteractedWithAudio = true;
    }
    checkAudioBannerState();
  } catch (error) {
    // console.error("Failed to initialize Web Audio:", error);
  }
}

// Start wailing siren audio (Realistic detuned dual sawtooth wail)
function startAlarmAudio() {
  if (sirenOsc1) return; // Already running
  if (!audioCtx || audioCtx.state === 'suspended') return;
  
  try {
    sirenOsc1 = audioCtx.createOscillator();
    sirenOsc2 = audioCtx.createOscillator();
    sirenLfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    sirenGain = audioCtx.createGain();
    
    // Sawtooth waves detuned by +/- 15 cents create a powerful, vibrating beating alarm effect
    sirenOsc1.type = 'sawtooth';
    sirenOsc1.frequency.setValueAtTime(680, audioCtx.currentTime); // Base frequency (680 Hz)
    sirenOsc1.detune.setValueAtTime(-15, audioCtx.currentTime);
    
    sirenOsc2.type = 'sawtooth';
    sirenOsc2.frequency.setValueAtTime(680, audioCtx.currentTime);
    sirenOsc2.detune.setValueAtTime(15, audioCtx.currentTime);
    
    // Slow wail LFO (1.5 sweeps per second)
    sirenLfo.type = 'sine';
    sirenLfo.frequency.setValueAtTime(1.5, audioCtx.currentTime);
    
    // Wail modulation depth (+/- 180Hz)
    lfoGain.gain.setValueAtTime(180, audioCtx.currentTime);
    
    // Volume level controls (gain is loud and wailing)
    sirenGain.gain.setValueAtTime(0, audioCtx.currentTime);
    sirenGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1); // fade in wail
    
    // Connections: LFO -> LFO-Gain -> Both Osc Frequencies
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc1.frequency);
    lfoGain.connect(sirenOsc2.frequency);
    
    // Connections: Oscs -> Main Gain -> Audio Output
    sirenOsc1.connect(sirenGain);
    sirenOsc2.connect(sirenGain);
    sirenGain.connect(audioCtx.destination);
    
    sirenOsc1.start();
    sirenOsc2.start();
    sirenLfo.start();
    
    console.log("Realistic dual-sawtooth wailing siren started.");
  } catch (err) {
    console.error("Siren playback error:", err);
  }
}

// Stop wailing siren audio
function stopAlarmAudio() {
  if (!sirenOsc1) return;
  
  try {
    const osc1ToStop = sirenOsc1;
    const osc2ToStop = sirenOsc2;
    const lfoToStop = sirenLfo;
    const gainToStop = sirenGain;
    
    sirenOsc1 = null;
    sirenOsc2 = null;
    sirenLfo = null;
    sirenGain = null;
    
    if (gainToStop && audioCtx) {
      gainToStop.gain.cancelScheduledValues(audioCtx.currentTime);
      gainToStop.gain.setValueAtTime(gainToStop.gain.value, audioCtx.currentTime);
      gainToStop.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    }
    
    setTimeout(() => {
      try {
        if (osc1ToStop) osc1ToStop.stop();
        if (osc2ToStop) osc2ToStop.stop();
        if (lfoToStop) lfoToStop.stop();
      } catch (e) {}
    }, 250);
    
    console.log("Realistic dual-sawtooth wailing siren stopped.");
  } catch (err) {
    console.error("Siren shutdown error:", err);
  }
}

// Check and trigger audio alert based on light status & silence state
function evaluateAlarmAudioState() {
  const isAlarmTriggered = 
    currentAppState.isESPConnected && 
    currentAppState.lightStatus === 'off' && 
    !currentAppState.alarmSilenced;

  if (isAlarmTriggered && userInteractedWithAudio) {
    startAlarmAudio();
  } else {
    stopAlarmAudio();
  }
}

// Automatically attempt to start/resume audio on any user interaction
function handleUserInteraction() {
  initAudio();
  if (audioCtx && audioCtx.state === 'running') {
    userInteractedWithAudio = true;
    checkAudioBannerState();
    evaluateAlarmAudioState();
    window.removeEventListener('click', handleUserInteraction);
    window.removeEventListener('touchstart', handleUserInteraction);
    window.removeEventListener('keydown', handleUserInteraction);
  }
}

// Attach silent listeners to capture the first user gesture
window.addEventListener('click', handleUserInteraction);
window.addEventListener('touchstart', handleUserInteraction);
window.addEventListener('keydown', handleUserInteraction);

// Attempt instant start on load (in case browser has cached autoplay permission)
try {
  initAudio();
  checkAudioBannerState();
} catch (e) {}

// Connect UI to Backend WebSocket server
function connectUiSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/ui`;
  
  uiSocket = new WebSocket(wsUrl);

  uiSocket.onopen = () => {
    console.log("UI WebSocket Connected.");
    uiWSStatus.className = 'server-status-pill connected';
    uiWSStatus.querySelector('.status-label').textContent = 'Dashboard Connected';
  };

  uiSocket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.event === 'init' || message.event === 'status_update') {
        currentAppState = message.data;
        updateUI();
      }
    } catch (err) {
      console.error("Error processing websocket payload:", err);
    }
  };

  uiSocket.onclose = () => {
    console.warn("UI WebSocket Disconnected. Reconnecting...");
    uiWSStatus.className = 'server-status-pill disconnected';
    uiWSStatus.querySelector('.status-label').textContent = 'Dashboard Offline';
    
    // Stop sound alarm when backend connection goes offline to be safe
    stopAlarmAudio();
    
    setTimeout(connectUiSocket, 3000);
  };

  uiSocket.onerror = (err) => {
    console.error("UI Socket error:", err);
    uiSocket.close();
  };
}

// Silence alarm toggle handler (shared by button and bulb click)
function toggleAlarmSilence() {
  const targetSilence = !currentAppState.alarmSilenced;
  
  // If user silences alarm, make sure we have audio context initialized
  if (!userInteractedWithAudio) {
    initAudio();
  }
  
  if (uiSocket && uiSocket.readyState === WebSocket.OPEN) {
    uiSocket.send(JSON.stringify({
      action: 'silence',
      value: targetSilence
    }));
  } else {
    // Fallback to REST API if WebSocket is offline
    fetch('/api/alarm/silence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ silence: targetSilence })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        currentAppState = data.state;
        updateUI();
      }
    })
    .catch(err => console.error("Error silencing alarm via HTTP:", err));
  }
}

silenceBtn.addEventListener('click', toggleAlarmSilence);
bulbWrapper.addEventListener('click', toggleAlarmSilence);

// Update UI Layout with new status state
function updateUI() {
  // 1. ESP8266 Status Ring
  if (currentAppState.isESPConnected) {
    espPulseRing.className = 'connection-status-circle connected';
    espStatusText.textContent = 'ONLINE';
    espIpAddress.textContent = 'Active WS Session';
  } else {
    espPulseRing.className = 'connection-status-circle disconnected';
    espStatusText.textContent = 'OFFLINE';
    espIpAddress.textContent = 'N/A';
  }

  // 2. Power / Light Status
  const status = currentAppState.lightStatus;
  const isESPConnected = currentAppState.isESPConnected;
  bulbWrapper.className = 'bulb-wrapper'; // Reset
  powerStateBadge.className = 'power-status-badge'; // Reset

  if (isESPConnected && status === 'on') {
    bulbWrapper.classList.add('on');
    powerStateBadge.classList.add('on');
    powerStateBadge.textContent = 'MAINS POWER: ON';
    
    // Update Hindi Banner
    hindiStatusBanner.className = 'hindi-banner on';
    hindiStatusBanner.textContent = 'बिजली चालू है';
  } else if (isESPConnected && status === 'off') {
    bulbWrapper.classList.add('off');
    powerStateBadge.classList.add('off');
    powerStateBadge.textContent = 'MAINS POWER: OFF';
    
    // Update Hindi Banner
    hindiStatusBanner.className = 'hindi-banner off';
    hindiStatusBanner.textContent = 'बिजली चली गई है!';
  } else {
    // If ESP8266 is disconnected or status is unknown, show as unknown
    bulbWrapper.classList.add('unknown');
    powerStateBadge.classList.add('unknown');
    powerStateBadge.textContent = 'STATUS UNKNOWN';
    
    // Update Hindi Banner
    hindiStatusBanner.className = 'hindi-banner unknown';
    hindiStatusBanner.textContent = 'कनेक्ट नहीं है - बिजली की स्थिति अज्ञात है';
  }

  // 3. Audio Alarm Controller Card
  const alarmWaves = soundWaves;
  alarmWaves.className = 'alarm-wave-container'; // Reset
  
  // Compute state flags
  const isAlarmTriggered = currentAppState.isESPConnected && status === 'off';

  if (isAlarmTriggered) {
    if (currentAppState.alarmSilenced) {
      alarmWaves.classList.add('silenced');
      alarmStatusText.className = 'alarm-status-banner silenced';
      alarmStatusText.textContent = 'Alarm Warning Silenced via UI';
      
      silenceBtn.className = 'btn btn-alarm-toggle silenced';
      silenceBtn.querySelector('span').textContent = 'Alarm Silenced';
    } else {
      alarmWaves.classList.add('playing');
      alarmStatusText.className = 'alarm-status-banner warning';
      alarmStatusText.textContent = 'WARNING: GRID POWER FAILURE!';
      
      silenceBtn.className = 'btn btn-alarm-toggle';
      silenceBtn.querySelector('span').textContent = 'Silence Siren Audio';
    }
  } else {
    alarmWaves.classList.add('idle');
    alarmStatusText.className = 'alarm-status-banner normal';
    
    if (!currentAppState.isESPConnected) {
      alarmStatusText.textContent = 'Standby - Waiting for ESP8266 connection';
    } else {
      alarmStatusText.textContent = 'Standby - Mains Grid Power Normal';
    }

    silenceBtn.className = 'btn btn-alarm-toggle silenced';
    silenceBtn.querySelector('span').textContent = 'Siren Audio Idle';
  }

  // Evaluate sound play
  evaluateAlarmAudioState();
}

// Bind direct click to unlock audio button
if (btnAudioUnlock) {
  btnAudioUnlock.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audioCtx) {
      initAudio();
    }
    if (audioCtx) {
      audioCtx.resume().then(() => {
        userInteractedWithAudio = true;
        checkAudioBannerState();
        evaluateAlarmAudioState();
      });
    }
  });
}

// Start the Dashboard connection
connectUiSocket();
