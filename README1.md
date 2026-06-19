# ESP32 Integration & Connection Guide

This guide describes how to connect your ESP32 (controlling the power switch relay) to the HomePulse server.

## 📡 WebSocket Connection Details

- **Endpoint Path**: `/ws/esp32`
- **Port**: `5000` (or your custom server port)
- **Auth Method**: Query Parameter Token (`?token=<ESP32_TOKEN>`)
- **Default URL**: `ws://<your-server-ip>:5000/ws/esp32?token=HomePulseESP32SecretToken2026`

---

## 💬 Communication Protocol (JSON Payloads)

### 1. Server to ESP32 (Commands)

Whenever the relay state is updated on the dashboard (manually, via timer, via alarm, or via Inverter Condition safety override), the server sends this JSON object to the ESP32:

```json
{
  "relay": "on"
}
```

_or_

```json
{
  "relay": "off"
}
```

### 2. ESP32 to Server (Status/Feedback - Optional)

If your ESP32 has a physical push button connected to toggle the relay locally, it can notify the server of its state change by sending:

```json
{
  "relay": "on"
}
```

_or_

```json
{
  "relay": "off"
}
```

---

## 🛠️ Arduino ESP32 Client Code Example

Here is a ready-to-use C++ code snippet for the ESP32 using the popular **ArduinoJson** and **WebSocketsClient** libraries:

```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

const char* ws_host = "YOUR_SERVER_IP_OR_DOMAIN";
const int ws_port = 5000;
const char* ws_path = "/ws/esp32?token=HomePulseESP32SecretToken2026";

const int RELAY_PIN = 23; // Set to your ESP32 Relay Pin

WebSocketsClient webSocket;

void handleWebSocketMessage(uint8_t * payload) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
        return;
    }

    if (doc.containsKey("relay")) {
        const char* relayState = doc["relay"];
        if (strcmp(relayState, "on") == 0) {
            digitalWrite(RELAY_PIN, HIGH); // Turn Relay ON
        } else if (strcmp(relayState, "off") == 0) {
            digitalWrite(RELAY_PIN, LOW);  // Turn Relay OFF
        }
    }
}

void webSocketEvent(WSEventType_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WSType_DISCONNECTED:
            break;
        case WSType_CONNECTED:
            break;
        case WSType_TEXT:
            handleWebSocketMessage(payload);
            break;
    }
}

void setup() {
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW); // Start with Relay OFF

    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
    }

    // Connect to WebSockets Server
    webSocket.begin(ws_host, ws_port, ws_path);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000); // Reconnect every 5 seconds if connection drops
}

void loop() {
    webSocket.loop();
}
```
