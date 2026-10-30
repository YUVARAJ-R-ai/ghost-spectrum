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

#define SDA_PIN 4 // D2 on NodeMCU (I2C SDA)
#define SCL_PIN 5 // D1 on NodeMCU (I2C SCL)

// Hardware Pin Definitions
#define SENSOR_PIN A0
#define STATUS_LED 2    // Built-in LED on ESP-12 (Active LOW)
#define BAR_LED_1 13    // D7 on NodeMCU (Proximity Level 1)
#define BAR_LED_2 12    // D6 on NodeMCU (Proximity Level 2)
#define BAR_LED_3 14    // D5 on NodeMCU (Proximity Level 3 / Critical)
#define BUTTON_PIN 0    // D3 on NodeMCU (Active LOW Flash button / Input)

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
WiFiUDP udp;

// System State Variables
static unsigned long seq = 0;
static unsigned long last_send = 0;
static unsigned long last_send_time = 0;
static unsigned long last_oled = 0;
static unsigned long last_led_blink = 0;
static unsigned long last_btn_press = 0;
static bool led_blink_state = false;
static bool oled_ok = false;
static int last_sensor = 0;
static int sensor_baseline = 512;
static float measured_rtt = 14.5;

// Dynamic Settings & Overrides
static unsigned long telemetry_interval_ms = 350;
static bool manual_led_override = false;
static bool manual_led_val = false;
static bool alarm_strobe_active = false;
static unsigned long alarm_strobe_start = 0;
static char last_cmd_status[32] = "NOMINAL";
static unsigned long last_cmd_time = 0;

void recalibrate_baseline() {
    Serial.println(F("[Node-1] Recalibrating ambient optical baseline..."));
    long sum = 0;
    for (int i = 0; i < 25; i++) {
        sum += analogRead(SENSOR_PIN);
        delay(8);
    }
    sensor_baseline = sum / 25;
    last_sensor = sensor_baseline;
    snprintf(last_cmd_status, sizeof(last_cmd_status), "CALIBRATED:%d", sensor_baseline);
    last_cmd_time = millis();
    Serial.printf("[Node-1] Recalibration complete. New baseline: %d\n", sensor_baseline);
}

void send_cmd_ack(const char* cmd_name, const char* status, const IPAddress& remote_ip, uint16_t remote_port) {
    StaticJsonDocument<256> doc;
    doc["n"] = "1";
    doc["node_id"] = "NODE_1_SENSOR";
    doc["cmd_ack"] = cmd_name;
    doc["status"] = status;
    doc["baseline"] = sensor_baseline;
    doc["rate_ms"] = telemetry_interval_ms;
    doc["led"] = manual_led_override ? (manual_led_val ? 1 : 0) : (abs(last_sensor - sensor_baseline) > 180 ? 1 : 0);
    doc["mode"] = "wifi";

    char buf[256];
    size_t len = serializeJson(doc, buf);

    // Send ACK directly back to sender
    udp.beginPacket(remote_ip, remote_port);
    udp.write((const uint8_t*)buf, len);
    udp.endPacket();

    // Also send ACK to known Hub IP to update hub status
    udp.beginPacket(HUB_IP, UDP_PORT);
    udp.write((const uint8_t*)buf, len);
    udp.endPacket();
}

void handle_incoming_udp() {
    int packetSize = udp.parsePacket();
    if (packetSize <= 0) return;

    char packetBuffer[256];
    int len = udp.read(packetBuffer, sizeof(packetBuffer) - 1);
    if (len <= 0) return;
    packetBuffer[len] = '\0';

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, packetBuffer);
    if (err) return;

    // Check if packet is a hub ACK for RTT calculation
    if (doc.containsKey("ack")) {
        unsigned long ack_seq = doc["ack"] | 0;
        if (ack_seq == seq && last_send_time > 0) {
            measured_rtt = (float)(millis() - last_send_time);
        }
        return;
    }

    // Process incoming commands
    if (doc.containsKey("cmd")) {
        const char* cmd = doc["cmd"] | "";
        IPAddress remote_ip = udp.remoteIP();
        uint16_t remote_port = udp.remotePort();

        Serial.printf("[Node-1] Received command '%s' from %s:%d\n", cmd, remote_ip.toString().c_str(), remote_port);

        if (strcmp(cmd, "zero") == 0) {
            recalibrate_baseline();
            send_cmd_ack("zero", "ok", remote_ip, remote_port);
        }
        else if (strcmp(cmd, "led") == 0) {
            int val = doc["val"] | -1;
            if (val == -1) {
                // Toggle if val is not provided
                manual_led_val = !manual_led_val;
            } else {
                manual_led_val = (val != 0);
            }
            manual_led_override = true;
            alarm_strobe_active = false;
            snprintf(last_cmd_status, sizeof(last_cmd_status), "LED:%s", manual_led_val ? "ON" : "OFF");
            last_cmd_time = millis();
            Serial.printf("[Node-1] Manual LED set to %d\n", manual_led_val ? 1 : 0);
            send_cmd_ack("led", "ok", remote_ip, remote_port);
        }
        else if (strcmp(cmd, "buzzer") == 0 || strcmp(cmd, "threat") == 0 || strcmp(cmd, "alarm") == 0) {
            alarm_strobe_active = true;
            alarm_strobe_start = millis();
            snprintf(last_cmd_status, sizeof(last_cmd_status), "ALERT:THREAT");
            last_cmd_time = millis();
            Serial.println(F("[Node-1] Cluster threat/buzzer alarm received: engaging emergency LED strobe"));
            send_cmd_ack("buzzer", "ok", remote_ip, remote_port);
        }
        else if (strcmp(cmd, "clear") == 0 || strcmp(cmd, "reset") == 0) {
            alarm_strobe_active = false;
            manual_led_override = false;
            snprintf(last_cmd_status, sizeof(last_cmd_status), "NOMINAL");
            last_cmd_time = millis();
            send_cmd_ack("clear", "ok", remote_ip, remote_port);
        }
        else if (strcmp(cmd, "rate") == 0) {
            int ms = doc["ms"] | 350;
            telemetry_interval_ms = constrain(ms, 25, 10000);
            snprintf(last_cmd_status, sizeof(last_cmd_status), "RATE:%lums", telemetry_interval_ms);
            last_cmd_time = millis();
            Serial.printf("[Node-1] Telemetry rate set to %lu ms\n", telemetry_interval_ms);
            send_cmd_ack("rate", "ok", remote_ip, remote_port);
        }
        else if (strcmp(cmd, "auto") == 0 || strcmp(cmd, "resume") == 0) {
            manual_led_override = false;
            alarm_strobe_active = false;
            snprintf(last_cmd_status, sizeof(last_cmd_status), "MODE:AUTO");
            last_cmd_time = millis();
            send_cmd_ack("auto", "ok", remote_ip, remote_port);
        }
        else {
            send_cmd_ack(cmd, "unknown_cmd", remote_ip, remote_port);
        }
    }

    // Direct Peer-to-Peer Packet from Node 3 (Sentinel ESP32)
    const char* n = doc["n"] | "";
    if (strcmp(n, "3") == 0) {
        int fault = doc["fault"] | 0;
        if (fault == 1) {
            alarm_strobe_active = true;
            alarm_strobe_start = millis();
            snprintf(last_cmd_status, sizeof(last_cmd_status), "JAM:RF-ALERT");
            last_cmd_time = millis();
            Serial.println(F("[Node-1] >>> P2P ALERT: Node 3 Sentinel detected Jamming! <<<"));
        } else if (alarm_strobe_active) {
            alarm_strobe_active = false;
            snprintf(last_cmd_status, sizeof(last_cmd_status), "JAM:CLEARED");
            last_cmd_time = millis();
        }
    }
}

void update_leds(int delta, bool detected) {
    unsigned long now = millis();

    // Emergency Cyber Alarm Strobe
    if (alarm_strobe_active) {
        if (now - alarm_strobe_start > 4000) {
            alarm_strobe_active = false;
        } else {
            // High-visibility emergency chase strobe
            int phase = (now / 70) % 4;
            digitalWrite(BAR_LED_1, (phase == 0 || phase == 2) ? HIGH : LOW);
            digitalWrite(BAR_LED_2, (phase == 1 || phase == 3) ? HIGH : LOW);
            digitalWrite(BAR_LED_3, (phase == 0 || phase == 2) ? HIGH : LOW);
            digitalWrite(STATUS_LED, (phase % 2 == 0) ? LOW : HIGH);
            return;
        }
    }

    if (manual_led_override) {
        // Direct manual override mode
        digitalWrite(STATUS_LED, manual_led_val ? LOW : HIGH); // Active LOW
        digitalWrite(BAR_LED_1, manual_led_val ? HIGH : LOW);
        digitalWrite(BAR_LED_2, manual_led_val ? HIGH : LOW);
        digitalWrite(BAR_LED_3, manual_led_val ? HIGH : LOW);
        return;
    }

    // Dynamic Multi-LED Bargraph & Pulse Proportional to Distance
    // Level 1: Low proximity (delta >= 45)
    // Level 2: Medium proximity (delta >= 120)
    // Level 3: High / Critical proximity (delta >= 210)
    bool b1 = (delta >= 45);
    bool b2 = (delta >= 120);
    bool b3 = (delta >= 210);

    // Dynamic blink interval: proportionally faster as proximity delta increases
    // delta = 0 -> 800ms, delta = 400+ -> 40ms rapid pulse
    unsigned long blink_interval = map(constrain(delta, 0, 400), 0, 400, 800, 40);

    if (now - last_led_blink >= blink_interval) {
        last_led_blink = now;
        led_blink_state = !led_blink_state;
    }

    if (!detected) {
        // Nominal: subtle slow pulse or gentle indicators
        digitalWrite(BAR_LED_1, b1 ? HIGH : LOW);
        digitalWrite(BAR_LED_2, b2 ? HIGH : LOW);
        digitalWrite(BAR_LED_3, b3 ? HIGH : LOW);
        digitalWrite(STATUS_LED, LOW); // Solid ON when WiFi OK
    } else {
        // Active Proximity Alert: Synchronized dynamic blinking
        digitalWrite(BAR_LED_1, b1 ? HIGH : LOW);
        digitalWrite(BAR_LED_2, b2 ? HIGH : LOW);
        digitalWrite(BAR_LED_3, b3 ? (led_blink_state ? HIGH : LOW) : LOW);
        digitalWrite(STATUS_LED, led_blink_state ? LOW : HIGH);
    }
}

void update_oled(int val, const char* ml_status) {
    if (!oled_ok) return;

    unsigned long now = millis();
    display.clearDisplay();

    // Inverted Header Banner
    display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(2, 2);
    display.print(F("NODE-1: SENSOR"));
    display.setCursor(80, 2);
    if (now - last_cmd_time < 2000) {
        display.print(last_cmd_status);
    } else {
        display.print(WiFi.status() == WL_CONNECTED ? F("WIFI:OK") : F("WIFI:OFF"));
    }

    // Normal Text
    display.setTextColor(SSD1306_WHITE);

    // Line 1: Sequence, IR & Baseline
    display.setCursor(0, 15);
    display.printf("#%-4lu IR:%4d B:%-4d", seq, val, sensor_baseline);

    // Visual IR Sensor Bargraph (deviation mapped across 0..120 px)
    int delta = abs(val - sensor_baseline);
    int bar_w = map(constrain(delta, 0, 400), 0, 400, 0, 120);
    display.drawRect(0, 25, 124, 7, SSD1306_WHITE);
    if (bar_w > 0) {
        display.fillRect(2, 27, bar_w, 3, SSD1306_WHITE);
    }

    // Line 2: Edge ML Status
    display.setCursor(0, 35);
    display.printf("AI: %s", ml_status);

    // Line 3: Rate & RSSI
    display.setCursor(0, 45);
    display.printf("Rate:%lums RSSI:%d", telemetry_interval_ms, WiFi.RSSI());

    // Line 4: IP Address / Link Info
    display.setCursor(0, 55);
    display.printf("IP:%s", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "No Link");

    display.display();
}

void setup() {
    Serial.begin(115200);

    // Configure Pin Outputs & Inputs
    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(STATUS_LED, HIGH); // Active LOW -> OFF

    pinMode(BUTTON_PIN, INPUT_PULLUP);

    pinMode(BAR_LED_1, OUTPUT);
    pinMode(BAR_LED_2, OUTPUT);
    pinMode(BAR_LED_3, OUTPUT);
    digitalWrite(BAR_LED_1, LOW);
    digitalWrite(BAR_LED_2, LOW);
    digitalWrite(BAR_LED_3, LOW);

    // Initialize I2C for SSD1306 OLED
    Wire.begin(SDA_PIN, SCL_PIN);
    oled_ok = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
    if (oled_ok) {
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 10);
        display.println(F("CLUSTER NODE 1"));
        display.println(F("Optical Proximity"));
        display.println(F("Connecting WiFi..."));
        display.display();
    }

    // Connect to Wi-Fi
    Serial.println();
    Serial.printf("[Node-1] Connecting to SSID: %s\n", WIFI_SSID);
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
        Serial.printf("\n[Node-1] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
        digitalWrite(STATUS_LED, LOW); // Active LOW -> Solid ON
    } else {
        Serial.println("\n[Node-1] Wi-Fi connection timed out, continuing in local mode");
    }

    // Initial optical baseline calibration
    recalibrate_baseline();

    // Start UDP socket on port 4210 for commands and telemetry
    udp.begin(UDP_PORT);
    Serial.printf("[Node-1] UDP listening on port %d for direct commands\n", UDP_PORT);
}

void loop() {
    unsigned long now = millis();

    // Check hardware pushbutton on D3 (GPIO 0)
    if (digitalRead(BUTTON_PIN) == LOW) {
        if (now - last_btn_press > 500) {
            last_btn_press = now;
            Serial.println(F("[Node-1] Button pressed: recalibrating optical baseline..."));
            recalibrate_baseline();
            digitalWrite(BAR_LED_1, HIGH);
            digitalWrite(BAR_LED_2, HIGH);
            digitalWrite(BAR_LED_3, HIGH);
            delay(80);
            digitalWrite(BAR_LED_1, LOW);
            digitalWrite(BAR_LED_2, LOW);
            digitalWrite(BAR_LED_3, LOW);
            send_cmd_ack("button_zero", "ok", IPAddress(255, 255, 255, 255), UDP_PORT);
        }
    }

    // 1. Check for incoming direct UDP commands on 4210
    handle_incoming_udp();

    // 2. Read analog optical sensor (0 to 1023) with smoothing
    int raw = analogRead(SENSOR_PIN);
    last_sensor = (last_sensor * 3 + raw) / 4;

    // 3. Edge anomaly / proximity inference
    int delta = abs(last_sensor - sensor_baseline);
    bool detected = (delta > 180);
    const char* ml_pred = detected ? "PROXIMITY_ALERT" : "NOMINAL";

    // 4. Adapt baseline slowly ONLY when idle (no object detected & no manual override)
    if (!detected && !manual_led_override && (now % 3000 < 20)) {
        sensor_baseline = (sensor_baseline * 19 + last_sensor) / 20;
    }

    // 5. Update Multi-LED Bargraph & Dynamic Proximity Pulses
    update_leds(delta, detected);

    // 6. Refresh OLED every 100ms
    if (now - last_oled >= 100) {
        last_oled = now;
        update_oled(last_sensor, ml_pred);
    }

    // 7. Transmit UDP Telemetry dynamically based on configured telemetry_interval_ms
    if (now - last_send >= telemetry_interval_ms) {
        last_send = now;
        last_send_time = now;
        seq++;

        // Brief flash of onboard LED
        if (!manual_led_override) {
            digitalWrite(STATUS_LED, HIGH);
        }

        StaticJsonDocument<288> doc;
        doc["n"] = "1";
        doc["node_id"] = "NODE_1_SENSOR";
        doc["type"] = "sensor";
        doc["seq"] = seq;
        doc["sensor"] = last_sensor;
        doc["baseline"] = sensor_baseline;
        doc["delta"] = delta;
        doc["rssi"] = WiFi.RSSI();
        doc["rtt"] = measured_rtt;
        doc["loss"] = 0;
        doc["reason"] = 0;
        doc["mode"] = "wifi";
        doc["ml_pred"] = ml_pred;
        doc["rate_ms"] = telemetry_interval_ms;
        doc["led"] = manual_led_override ? (manual_led_val ? 1 : 0) : (detected ? 1 : 0);
        doc["ip"] = WiFi.localIP().toString();

        char buf[288];
        size_t len = serializeJson(doc, buf);

        // A. Direct unicast to laptop hub
        udp.beginPacket(HUB_IP, UDP_PORT);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();

        // B. Dynamic subnet broadcast (e.g. 10.99.2.255)
        IPAddress subnetBroadcast = WiFi.localIP();
        subnetBroadcast[3] = 255;
        udp.beginPacket(subnetBroadcast, UDP_PORT);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();

        // C. Global broadcast for peer-to-peer supervisor sync
        IPAddress broadcastIp(255, 255, 255, 255);
        udp.beginPacket(broadcastIp, UDP_PORT);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();

        if (!manual_led_override) {
            digitalWrite(STATUS_LED, LOW);
        }
    }
}
