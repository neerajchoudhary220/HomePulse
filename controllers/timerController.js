const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../assets/json/timer_settings.json');

const defaultSettings = {
  controlMainSource: false,
  relayState: "off",
  timer: {
    active: false,
    duration: 0,
    remaining: 0,
    action: "off"
  },
  alarm: {
    active: false,
    time: "16:00",
    action: "off"
  }
};

let settings = { ...defaultSettings };
let onStateChangeCallback = null;
let lastAlarmTriggeredTime = "";
let lastMainsState = false;

function readFromFile() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
      fs.writeFileSync(FILE_PATH, JSON.stringify(defaultSettings, null, 2), 'utf8');
      return defaultSettings;
    }
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    if (!data.trim()) return defaultSettings;
    return JSON.parse(data);
  } catch (error) {
    return defaultSettings;
  }
}

function writeToFile() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    // Silent
  }
}

function init(onStateChange) {
  onStateChangeCallback = onStateChange;
  const fileData = readFromFile();
  
  const controlMainSourceVal = fileData.controlMainSource !== undefined 
    ? fileData.controlMainSource 
    : (fileData.inverterCondition ?? false);

  // Generate current local time in Asia/Kolkata for alarm default fallback
  const localDateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const localDate = new Date(localDateStr);
  const defaultHour = String(localDate.getHours()).padStart(2, '0');
  const defaultMin = String(localDate.getMinutes()).padStart(2, '0');
  const defaultTime = `${defaultHour}:${defaultMin}`;

  const alarmData = fileData.alarm || {};

  settings = {
    controlMainSource: !!controlMainSourceVal,
    relayState: fileData.relayState || "off",
    timer: {
      active: false, // Reset active timers on server boot
      duration: fileData.timer?.duration || 0,
      remaining: 0,
      action: fileData.timer?.action || "off"
    },
    alarm: {
      active: !!alarmData.active,
      time: alarmData.time || defaultTime,
      action: alarmData.action || "off"
    }
  };
  
  // Start the background intervals
  startTimerInterval();
  startAlarmInterval();
}

function getEffectiveRelayState() {
  if (settings.controlMainSource && !lastMainsState) {
    return "off";
  }
  return settings.relayState;
}

function getSettings() {
  return {
    ...settings,
    lastMainsState,
    effectiveRelayState: getEffectiveRelayState()
  };
}

function saveSettings() {
  writeToFile();
  if (onStateChangeCallback) {
    onStateChangeCallback();
  }
}

function setControlMainSource(value) {
  settings.controlMainSource = !!value;
  saveSettings();
}

function setRelayState(state) {
  if (state === "on" || state === "off") {
    settings.relayState = state;
    saveSettings();
  }
}

function setTimer(active, duration, action) {
  settings.timer.active = !!active;
  settings.timer.duration = Number(duration) || 0;
  settings.timer.remaining = !!active ? Number(duration) : 0;
  settings.timer.action = action === "on" ? "on" : "off";
  saveSettings();
}

function setAlarm(active, time, action) {
  settings.alarm.active = !!active;
  settings.alarm.time = time || "16:00"; // format HH:MM 24h
  settings.alarm.action = action === "on" ? "on" : "off";
  saveSettings();
}

// Background Intervals
function startTimerInterval() {
  setInterval(() => {
    if (settings.timer.active) {
      if (settings.timer.remaining > 0) {
        settings.timer.remaining -= 1;
        if (onStateChangeCallback) {
          onStateChangeCallback(); // Keep UI updated of countdown
        }
      } else {
        settings.timer.active = false;
        settings.relayState = settings.timer.action;
        saveSettings();
      }
    }
  }, 1000);
}

function startAlarmInterval() {
  setInterval(() => {
    if (settings.alarm.active) {
      const localDateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const localDate = new Date(localDateStr);
      const hours = String(localDate.getHours()).padStart(2, '0');
      const minutes = String(localDate.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hours}:${minutes}`;

      if (currentTimeStr === settings.alarm.time && lastAlarmTriggeredTime !== currentTimeStr) {
        lastAlarmTriggeredTime = currentTimeStr;
        settings.relayState = settings.alarm.action;
        settings.alarm.active = false; // Disable scheduled trigger automatically
        saveSettings();
      }
    }
  }, 10000); // check every 10 seconds
}

// Handle main power change (Inverter/Main Source Logic)
function handleMainPowerChange(isMainsOn) {
  if (lastMainsState !== isMainsOn) {
    lastMainsState = isMainsOn;
    saveSettings();
  }
}

module.exports = {
  init,
  getSettings,
  setControlMainSource,
  setRelayState,
  setTimer,
  setAlarm,
  handleMainPowerChange
};
