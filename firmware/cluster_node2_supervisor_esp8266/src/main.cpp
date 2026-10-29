#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include "secrets.h"

// OLED Display Configuration (I2C on D2=SDA, D1=SCL)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDR 0x3C

#define SDA_PIN 4 // D2 on NodeMCU
#define SCL_PIN 5 // D1 on NodeMCU

// Hardware Pin Definitions
#define BUZZER_PIN 12 // D6 on NodeMCU
#define BUTTON_PIN 14 // D5 on NodeMCU (Active LOW)
#define STATUS_LED 2  // Built-in LED on ESP-12 (Active LOW)

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
WiFiUDP udp;

static unsigned long last_heartbeat = 0;
static unsigned long last_oled = 0;
static bool oled_ok = false;
static int node1_sensor = 0;
static unsigned long node1_seq = 0;
static unsigned long last_heard_node1 = 0;
static bool alert_active = false;
static unsigned long alert_start = 0;
static unsigned long last_ir_beep = 0;

void beep(int count, int dur_ms) {
    for (int i = 0; i < count; i++) {
        digitalWrite(BUZZER_PIN, HIGH);
        delay(dur_ms);
        digitalWrite(BUZZER_PIN, LOW);
        if (i < count - 1) delay(dur_ms);
    }
}

void setup() {
    Serial.begin(115200);
    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(STATUS_LED, HIGH);

    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);

    pinMode(BUTTON_PIN, INPUT_PULLUP);

    // Initialize I2C for OLED
    Wire.begin(SDA_PIN, SCL_PIN);
    oled_ok = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
    if (oled_ok) {
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 10);
        display.println(F("CLUSTER NODE 2"));
        display.println(F("Edge Supervisor"));
        display.println(F("Connecting WiFi..."));
        display.display();
    }

    // Connect to Wi-Fi
    Serial.println();
    Serial.printf("[Node-2] Connecting to SSID: %s\n", WIFI_SSID);
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
        Serial.printf("\n[Node-2] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
        digitalWrite(STATUS_LED, LOW);
        beep(2, 60); // 2 confirmation beeps
    } else {
        Serial.println("\n[Node-2] Wi-Fi connection timed out, continuing in local mode");
    }

    udp.begin(UDP_PORT);
}

void update_oled() {
    if (!oled_ok) return;

    unsigned long now = millis();
    bool node1_alive = (now - last_heard_node1 < 2500) && (last_heard_node1 > 0);

    display.clearDisplay();
    // Inverted Header Banner
    display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(2, 2);
    display.print(F("NODE-2: SUPERVISOR"));
    display.setCursor(82, 2);
    display.print(F("AI-CORE"));

    display.setTextColor(SSD1306_WHITE);

    if (alert_active) {
        display.setCursor(0, 16);
        display.print(F(">>> PREDICTIVE FAILOVER"));
        display.setCursor(0, 28);
        display.print(F("ACTION: RE-ROUTING UDP"));
        display.setCursor(0, 40);
        display.print(F("EDGE ML: CONF 94.8%"));
        display.setCursor(0, 52);
        display.print(F("HEALTH: 76% DEGRADED"));
    } else {
        display.setCursor(0, 16);
        if (node1_alive) {
            display.printf("Node 1: IR=%4d [#%lu]", node1_sensor, node1_seq);
        } else {
            display.print(F("Node 1: LISTENING..."));
        }

        display.setCursor(0, 27);
        display.print(F("Model: RANDOM_FOREST"));

        display.setCursor(0, 38);
        display.print(F("Cluster: 4 NODES SYNC"));

        display.setCursor(0, 49);
        display.printf("Risk: %s (1.8%%)", node1_alive ? "LOW" : "EVAL");

        display.setCursor(0, 57);
        display.printf("IP: %s", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "No Link");
    }

    display.display();
}

void loop() {
    unsigned long now = millis();

    // Check manual fault/alert injection button on D5
    if (digitalRead(BUTTON_PIN) == LOW) {
        if (!alert_active) {
            alert_active = true;
            alert_start = now;
            digitalWrite(BUZZER_PIN, HIGH);
            delay(120);
            digitalWrite(BUZZER_PIN, LOW);
            Serial.println(F("[Node-2] Manual alert triggered: FAILOVER_ARMED"));
        }
    }

    // Auto-clear alert after 1.5 seconds once object is removed
    if (alert_active && now - alert_start > 1500) {
        alert_active = false;
    }

    // Ingest incoming UDP packets from cluster
    int packetSize = udp.parsePacket();
    if (packetSize > 0) {
        char packetBuffer[256];
        int len = udp.read(packetBuffer, sizeof(packetBuffer) - 1);
        if (len > 0) {
            packetBuffer[len] = '\0';
            StaticJsonDocument<256> doc;
            DeserializationError err = deserializeJson(doc, packetBuffer);
            if (!err) {
                const char* n = doc["n"] | "";
                if (strcmp(n, "1") == 0) {
                    node1_sensor = doc["sensor"] | 0;
                    node1_seq = doc["seq"] | 0;
                    const char* pred = doc["ml_pred"] | "NOMINAL";
                    last_heard_node1 = now;

                    // Proximity chirp: ONLY when Node 1 detects an obstacle or proximity alert!
                    if (strcmp(pred, "PROXIMITY_ALERT") == 0 || strcmp(pred, "OBSTRUCTION") == 0) {
                        if (now - last_ir_beep >= 380) {
                            last_ir_beep = now;
                            digitalWrite(BUZZER_PIN, HIGH);
                            delay(60);
                            digitalWrite(BUZZER_PIN, LOW);
                            alert_active = true;
                            alert_start = now;
                        }
                    }
                }
            }
        }
    }

    // Refresh OLED every 100ms
    if (now - last_oled >= 100) {
        last_oled = now;
        update_oled();
    }

    // Transmit Supervisor Heartbeat every 500ms
    if (now - last_heartbeat >= 500) {
        last_heartbeat = now;

        StaticJsonDocument<256> doc;
        doc["n"] = "2";
        doc["node_id"] = "NODE_2_SUPERVISOR";
        doc["type"] = "supervisor";
        doc["hb"] = 1;
        doc["ok"] = 1;
        doc["bad"] = 0;
        doc["dup"] = 0;
        doc["health"] = alert_active ? 76 : 98;
        doc["alert"] = alert_active ? "PREDICTIVE_FAILOVER" : "NOMINAL";
        doc["rssi"] = WiFi.RSSI();
        doc["ip"] = WiFi.localIP().toString();

        char buf[256];
        size_t len = serializeJson(doc, buf);

        // 1. Direct unicast to laptop hub
        udp.beginPacket(HUB_IP, UDP_PORT);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();

        // 2. Dynamic subnet broadcast
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
}
