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

module.exports = router;
