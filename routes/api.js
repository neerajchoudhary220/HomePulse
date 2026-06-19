const express = require('express');
const router = express.Router();
const sensorController = require('../controllers/sensorController');

// Get current sensor and connection status
router.get('/status', (req, res) => {
  res.json(sensorController.getCurrentState());
});

// Get simplified power status for third-party public API use
router.get('/live', (req, res) => {
  const state = sensorController.getCurrentState();
  let powerState = "unknown";
  if (state.isESPConnected) {
    powerState = state.lightStatus;
  }
  res.json({ power: powerState });
});

// Silence/unsilence the alarm
router.post('/alarm/silence', (req, res) => {
  const { silence } = req.body;
  if (typeof silence !== 'boolean') {
    return res.status(400).json({ error: 'Invalid payload. "silence" must be a boolean.' });
  }
  
  sensorController.silenceAlarm(silence);
  
  // Broadcast update to all UI clients (will be handled in server code by calling a broadcast function)
  if (req.app.get('broadcastUpdate')) {
    req.app.get('broadcastUpdate')();
  }
  
  res.json({ success: true, state: sensorController.getCurrentState() });
});

const timerController = require('../controllers/timerController');

// Verify Password for Power Timer Switch Page
router.post('/verify-timer-password', (req, res) => {
  const { password } = req.body;
  const correctPassword = process.env.TIMER_PASSWORD || 'admin123';
  if (password === correctPassword) {
    return res.json({ success: true });
  }
  res.json({ success: false, error: 'Incorrect password' });
});

// Get current timer & alarm settings
router.get('/timer/settings', (req, res) => {
  res.json(timerController.getSettings());
});

module.exports = router;
