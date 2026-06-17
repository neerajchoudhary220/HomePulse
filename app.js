const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const apiRouter = require('./routes/api');
const sensorController = require('./controllers/sensorController');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Setup middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up routes
app.use('/api', apiRouter);

// Fallback to index.html for unknown frontend routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Set of active WebSocket clients
const uiClients = new Set();
const espClients = new Set();
const statusClients = new Set();

// Function to broadcast current state to all connected UI and status clients
function broadcastUpdate() {
  const state = sensorController.getCurrentState();
  const payload = JSON.stringify({ event: 'status_update', data: state });
  uiClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });

  // Broadcast simplified live power status to public third-party clients
  let powerState = "unknown";
  if (state.isESPConnected) {
    powerState = state.lightStatus;
  }
  const publicPayload = JSON.stringify({ power: powerState });
  statusClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(publicPayload);
    }
  });
}

// Attach the broadcast function to app so controllers can access it
app.set('broadcastUpdate', broadcastUpdate);

// Heartbeat Ping-Pong to detect dead/ghost client connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 3000); // Check every 3 seconds

wss.on('close', () => {
  clearInterval(interval);
});

// Handle WebSocket connections
wss.on('connection', (ws, request, clientType) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  if (clientType === 'esp') {
    espClients.add(ws);
    sensorController.setConnectionStatus(espClients.size > 0);
    broadcastUpdate();

    // console.log(`[ESP8266] Client connected from ${request.socket.remoteAddress}`);

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString());
        // console.log('[ESP8266] Data received:', payload);

        // Expected format: { "light": "on"/"off" } or { "light": true/false }
        if (payload.light !== undefined) {
          let status;
          if (typeof payload.light === 'boolean') {
            status = payload.light ? 'on' : 'off';
          } else {
            status = String(payload.light).toLowerCase() === 'on' ? 'on' : 'off';
          }
          sensorController.setLightStatus(status);
          broadcastUpdate();
        }
      } catch (err) {
        // console.error('[ESP8266] Error parsing message:', err.message);
      }
    });

    ws.on('close', () => {
      espClients.delete(ws);
      sensorController.setConnectionStatus(espClients.size > 0);
      broadcastUpdate();
      // console.log('[ESP8266] Client disconnected');
    });

    ws.on('error', (err) => {
      // console.error('[ESP8266] Socket error:', err.message);
      ws.close();
    });

  } else if (clientType === 'ui') {
    uiClients.add(ws);
    // console.log(`[UI] Client connected. Total UI clients: ${uiClients.size}`);

    // Immediately send the current status to the newly connected UI
    ws.send(JSON.stringify({ event: 'init', data: sensorController.getCurrentState() }));

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString());
        // console.log('[UI] Message received:', payload);

        // UI requesting action
        if (payload.action === 'silence') {
          sensorController.silenceAlarm(!!payload.value);
          broadcastUpdate();
        }
      } catch (err) {
        // console.error('[UI] Error parsing message:', err.message);
      }
    });

    ws.on('close', () => {
      uiClients.delete(ws);
      // console.log(`[UI] Client disconnected. Total UI clients: ${uiClients.size}`);
    });

    ws.on('error', (err) => {
      // console.error('[UI] Socket error:', err.message);
      ws.close();
    });
  } else if (clientType === 'status') {
    statusClients.add(ws);
    // console.log(`[Status API] Public API Client connected. Total status clients: ${statusClients.size}`);

    // Send current status immediately on connection
    let powerState = "unknown";
    const state = sensorController.getCurrentState();
    if (state.isESPConnected) {
      powerState = state.lightStatus;
    }
    ws.send(JSON.stringify({ power: powerState }));

    ws.on('close', () => {
      statusClients.delete(ws);
      // console.log(`[Status API] Public API Client disconnected. Total status clients: ${statusClients.size}`);
    });

    ws.on('error', (err) => {
      // console.error('[Status API] Socket error:', err.message);
      ws.close();
    });
  }
});

// Handle HTTP upgrades to WebSocket
server.on('upgrade', (request, socket, head) => {
  const urlObj = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/ws/esp') {
    const token = urlObj.searchParams.get('token');
    const secretToken = process.env.ESP_TOKEN || 'HomePulseESP8266SecretToken2026';

    if (token !== secretToken) {
      // console.warn(`[Security] Unauthorized upgrade request to /ws/esp from IP: ${request.socket.remoteAddress}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, 'esp');
    });
  } else if (pathname === '/ws/ui') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, 'ui');
    });
  } else if (pathname === '/ws/status') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, 'status');
    });
  } else {
    // Route not supported for WS upgrade
    socket.destroy();
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  // console.log(`=============================================`);
  // console.log(` HomePulse Server running on port ${PORT} `);
  // console.log(` WebSocket URL for ESP8266: ws://localhost:${PORT}/ws/esp?token=<TOKEN>`);
  // console.log(` WebSocket URL for UI:      ws://localhost:${PORT}/ws/ui`);
  // console.log(` Public WS Live Status API: ws://localhost:${PORT}/ws/status`);
  // console.log(` Public HTTP Live Status:   http://localhost:${PORT}/api/live`);
  // console.log(`=============================================`);
});
