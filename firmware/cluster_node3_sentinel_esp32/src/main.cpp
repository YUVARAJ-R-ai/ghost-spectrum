#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ArduinoJson.h>
#include "secrets.h"

// Hardware Pin Definitions for ESP32
#define STATUS_LED 2      // Onboard Blue LED on most ESP32 DevKits
#define BUTTON_PIN 27     // Pushbutton for Fault / Anomaly Injection
#define SENSOR_PIN 34     // Optional Secondary Analog Sensor

WiFiUDP udp;
static unsigned long last_send = 0;
static unsigned long seq = 0;
static bool fault_latched = false;
static unsigned long fault_start = 0;

void setup() {
    Serial.begin(115200);
    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(STATUS_LED, LOW);

    pinMode(BUTTON_PIN, INPUT_PULLUP);

    Serial.println();
    Serial.printf("[Node-3 Sentinel] Connecting to SSID: %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    int timeout = 0;
    while (WiFi.status() != WL_CONNECTED && timeout < 25) {
        delay(250);
        Serial.print(".");
        digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
        timeout++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[Node-3 Sentinel] Connected! IP: %s Channel: %d\n", 
                      WiFi.localIP().toString().c_str(), WiFi.channel());
        digitalWrite(STATUS_LED, HIGH);
    } else {
        Serial.println("\n[Node-3 Sentinel] Wi-Fi connection timed out, continuing in fallback mode");
    }

    udp.begin(UDP_PORT);
    Serial.printf("[Node-3 Sentinel] UDP socket listening on %d\n", UDP_PORT);
}

void transmit_packet(bool is_fault) {
    seq++;
    StaticJsonDocument<256> doc;
    doc["n"] = "3";
    doc["node_id"] = "NODE_3_SENTINEL";
    doc["type"] = "sentinel";
    doc["seq"] = seq;
    doc["fault"] = is_fault ? 1 : 0;
    doc["anomaly"] = is_fault ? "CHANNEL_JAMMING" : "NOMINAL";
    doc["rssi"] = WiFi.RSSI();
    doc["ch"] = WiFi.channel();
    doc["ip"] = WiFi.localIP().toString();

    char buf[256];
    size_t len = serializeJson(doc, buf);

    // 1. Direct unicast to laptop hub
    udp.beginPacket(HUB_IP, UDP_PORT);
    udp.write((const uint8_t*)buf, len);
    udp.endPacket();

    // 2. Dynamic subnet broadcast (peer-to-peer to Node 1 & Node 2)
    IPAddress subnetBroadcast = WiFi.localIP();
    subnetBroadcast[3] = 255;
    udp.beginPacket(subnetBroadcast, UDP_PORT);
    udp.write((const uint8_t*)buf, len);
    udp.endPacket();

    // 3. Global broadcast
    IPAddress broadcastIp(255, 255, 255, 255);
    udp.beginPacket(broadcastIp, UDP_PORT);
    udp.write((const uint8_t*)buf, len);
    udp.endPacket();
}

void loop() {
    unsigned long now = millis();

    // Ingest incoming commands (e.g. from chat console or hub)
    int packetSize = udp.parsePacket();
    if (packetSize > 0) {
        char packetBuffer[128];
        int len = udp.read(packetBuffer, sizeof(packetBuffer) - 1);
        if (len > 0) {
            packetBuffer[len] = '\0';
            StaticJsonDocument<128> doc;
            if (!deserializeJson(doc, packetBuffer)) {
                const char* cmd = doc["cmd"] | "";
                if (strcmp(cmd, "threat") == 0 || strcmp(cmd, "jam") == 0) {
                    fault_latched = true;
                    fault_start = now;
                    digitalWrite(STATUS_LED, LOW);
                    transmit_packet(true);
                    Serial.println(F("[Node-3 Sentinel] Threat command received: Jamming simulation active"));
                } else if (strcmp(cmd, "clear") == 0 || strcmp(cmd, "reset") == 0) {
                    fault_latched = false;
                    digitalWrite(STATUS_LED, HIGH);
                    transmit_packet(false);
                    Serial.println(F("[Node-3 Sentinel] Clear command received: Nominal"));
                }
            }
        }
    }

    // Check button on GPIO 27 for anomaly/fault injection
    if (digitalRead(BUTTON_PIN) == LOW) {
        if (!fault_latched) {
            fault_latched = true;
            fault_start = now;
            digitalWrite(STATUS_LED, LOW); // LED indicates anomaly
            Serial.println(F("[Node-3 Sentinel] >>> ANOMALY INJECTION TRIGGERED (RF Interference Sim)"));
            // Immediate zero-latency broadcast to cluster
            transmit_packet(true);
        }
    }

    // Auto-release fault latch after 4 seconds
    if (fault_latched && now - fault_start > 4000) {
        fault_latched = false;
        digitalWrite(STATUS_LED, HIGH);
        Serial.println(F("[Node-3 Sentinel] Anomaly cleared: link nominal"));
        // Immediate broadcast that threat is resolved
        transmit_packet(false);
    }

    // Telemetry send interval (500ms)
    if (now - last_send >= 500) {
        last_send = now;
        digitalWrite(STATUS_LED, fault_latched ? LOW : HIGH);
        transmit_packet(fault_latched);
        digitalWrite(STATUS_LED, fault_latched ? HIGH : LOW);
    }
}
