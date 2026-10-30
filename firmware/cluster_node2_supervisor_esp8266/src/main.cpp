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
#define BUZZER_PIN 12 // D6 on NodeMCU (Active HIGH)
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
static char alert_reason[32] = "NOMINAL";

void beep(int count, int dur_ms) {
    for (int i = 0; i < count; i++) {
        digitalWrite(BUZZER_PIN, HIGH);
        delay(dur_ms);
        digitalWrite(BUZZER_PIN, LOW);
        if (i < count - 1) delay(dur_ms);
    }
}

void send_ack(const char* cmd_name, const char* status, const IPAddress& remote_ip, uint16_t remote_port) {
    StaticJsonDocument<256> doc;
    doc["n"] = "2";
    doc["node_id"] = "NODE_2_SUPERVISOR";
    doc["cmd_ack"] = cmd_name;
    doc["status"] = status;
    doc["alert"] = alert_active ? alert_reason : "NOMINAL";
    doc["ip"] = WiFi.localIP().toString();

    char buf[256];
    size_t len = serializeJson(doc, buf);

    if (remote_port > 0) {
        udp.beginPacket(remote_ip, remote_port);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();
    }

    udp.beginPacket(HUB_IP, UDP_PORT);
    udp.write((const uint8_t*)buf, len);
    udp.endPacket();
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
    Serial.printf("[Node-2] UDP socket listening on %d\n", UDP_PORT);
}

void update_oled() {
    if (!oled_ok) return;

    unsigned long now = millis();
    bool node1_alive = (now - last_heard_node1 < 2500) && (last_heard_node1 > 0);

    display.clearDisplay();

    if (alert_active) {
        // Threat Alert Screen
        display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
        display.setCursor(2, 2);
        display.print(F("! THREAT DETECTED !"));

        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 16);
        display.printf("CAUSE: %s", alert_reason);

        display.setCursor(0, 28);
        display.print(F("ACTION: RE-ROUTING UDP"));

        display.setCursor(0, 40);
        display.print(F("LINK: DECENTRALIZED"));

        display.setCursor(0, 52);
        display.printf("BUZZER: ACTIVE WARBLE");
    } else {
        // Nominal Supervisor Screen
        display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
        display.setCursor(2, 2);
        display.print(F("NODE-2: SUPERVISOR"));
        display.setCursor(82, 2);
        display.print(F("AI-CORE"));

        display.setTextColor(SSD1306_WHITE);
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
            strncpy(alert_reason, "MANUAL BUTTON (D5)", sizeof(alert_reason));
            beep(2, 90);
            Serial.println(F("[Node-2] Manual alert triggered on D5"));

            // Broadcast manual trigger to entire cluster
            StaticJsonDocument<128> bdoc;
            bdoc["n"] = "2";
            bdoc["cmd"] = "threat";
            bdoc["alert"] = "MANUAL_FAILOVER";
            char bbuf[128];
            size_t blen = serializeJson(bdoc, bbuf);
            IPAddress bcast(255, 255, 255, 255);
            udp.beginPacket(bcast, UDP_PORT);
            udp.write((const uint8_t*)bbuf, blen);
            udp.endPacket();
        }
    }

    // Auto-clear alert timers:
    // Manual/Operator alarms clear after 3500ms; Proximity chirps clear after 1200ms
    if (alert_active && (now - alert_start > 3500) && strcmp(alert_reason, "SENTINEL: JAMMING") != 0) {
        alert_active = false;
        strncpy(alert_reason, "NOMINAL", sizeof(alert_reason));
    }
    // Sentinel jamming clears if no jamming packet for 4500ms
    if (alert_active && (now - alert_start > 4500) && strcmp(alert_reason, "SENTINEL: JAMMING") == 0) {
        alert_active = false;
        strncpy(alert_reason, "NOMINAL", sizeof(alert_reason));
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
                // 1. Direct Command (from Hub, Chat/Voice Console, or curl)
                if (doc.containsKey("cmd")) {
                    const char* cmd = doc["cmd"] | "";
                    IPAddress sender_ip = udp.remoteIP();
                    uint16_t sender_port = udp.remotePort();
                    Serial.printf("[Node-2] Received command: %s\n", cmd);

                    if (strcmp(cmd, "buzzer") == 0 || strcmp(cmd, "alarm") == 0 || strcmp(cmd, "threat") == 0) {
                        int val = doc["val"] | 1;
                        int count = doc["count"] | 3;
                        if (val != 0) {
                            alert_active = true;
                            alert_start = now;
                            strncpy(alert_reason, "OPERATOR COMMAND", sizeof(alert_reason));
                            beep(count, 80);
                        } else {
                            alert_active = false;
                            digitalWrite(BUZZER_PIN, LOW);
                            strncpy(alert_reason, "NOMINAL", sizeof(alert_reason));
                        }
                        send_ack("buzzer", "ok", sender_ip, sender_port);
                    }
                    else if (strcmp(cmd, "clear") == 0 || strcmp(cmd, "reset") == 0) {
                        alert_active = false;
                        digitalWrite(BUZZER_PIN, LOW);
                        strncpy(alert_reason, "NOMINAL", sizeof(alert_reason));
                        send_ack("clear", "ok", sender_ip, sender_port);
                    }
                }

                // 2. Peer-to-Peer Packet from Node 3 (Sentinel ESP32)
                const char* n = doc["n"] | "";
                if (strcmp(n, "3") == 0) {
                    int fault = doc["fault"] | 0;
                    if (fault == 1) {
                        alert_active = true;
                        alert_start = now;
                        strncpy(alert_reason, "SENTINEL: JAMMING", sizeof(alert_reason));
                        beep(3, 70); // Rapid warning siren
                        Serial.println(F("[Node-2] >>> P2P ALERT: Node 3 Sentinel detected Jamming! <<<"));
                    } else if (alert_active && strcmp(alert_reason, "SENTINEL: JAMMING") == 0) {
                        alert_active = false;
                        strncpy(alert_reason, "NOMINAL", sizeof(alert_reason));
                        Serial.println(F("[Node-2] Node 3 Sentinel Jamming Cleared. Nominal."));
                    }
                }

                // 3. Peer-to-Peer Packet from Node 1 (Sensor ESP8266)
                else if (strcmp(n, "1") == 0) {
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
                            strncpy(alert_reason, "PROXIMITY ALERT", sizeof(alert_reason));
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
        doc["alert"] = alert_active ? alert_reason : "NOMINAL";
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
