const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../assets/json/sensor_readings.json');

// Default initial state (excluding history logs)
const defaultState = {
  isESPConnected: false,
  lightStatus: "unknown", // "on", "off", or "unknown"
  alarmSilenced: false,
  lastUpdateTime: new Date().toISOString()
};

// In-memory status state
let currentState = { ...defaultState };

// Helper to read data from JSON file
function readFromFile() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      // Ensure directories exist
      fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
      fs.writeFileSync(FILE_PATH, JSON.stringify(defaultState, null, 2), 'utf8');
      return defaultState;
    }
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    if (!data.trim()) {
      return defaultState;
    }
    return JSON.parse(data);
  } catch (error) {
    // console.error('Error reading sensor readings file:', error);
    return defaultState;
  }
}

// Helper to write data to JSON file
function writeToFile(state) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    // console.error('Error writing to sensor readings file:', error);
  }
}

// Initialize controller state from file
function init() {
  const fileData = readFromFile();
  currentState = {
    ...currentState,
    lightStatus: fileData.lightStatus || "unknown",
    alarmSilenced: fileData.alarmSilenced ?? false
  };
}

// Get the current real-time state
function getCurrentState() {
  return {
    ...currentState,
    lastUpdateTime: new Date().toISOString()
  };
}

// Set ESP8266 connection status
function setConnectionStatus(isConnected) {
  currentState.isESPConnected = isConnected;
  saveState();
}

// Set Light status
function setLightStatus(status) {
  // status can be "on" or "off"
  const previousStatus = currentState.lightStatus;
  currentState.lightStatus = status;

  if (previousStatus !== status) {
    // If light comes back ON, auto-reset the alarm silence flag so it triggers next time light goes off
    if (status === 'on') {
      currentState.alarmSilenced = false;
    }
  }
  
  saveState();
}

// Silence alarm manually from UI
function silenceAlarm(isSilenced) {
  currentState.alarmSilenced = isSilenced;
  saveState();
}

// Save in-memory state to file
function saveState() {
  const stateToSave = {
    lightStatus: currentState.lightStatus,
    alarmSilenced: currentState.alarmSilenced,
    lastUpdateTime: new Date().toISOString()
  };
  writeToFile(stateToSave);
}

// Initialize state
init();

module.exports = {
  getCurrentState,
  setConnectionStatus,
  setLightStatus,
  silenceAlarm
};
