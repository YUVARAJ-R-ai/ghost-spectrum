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
#define SENSOR_PIN A0
#define STATUS_LED 2 // Built-in LED on ESP-12 (Active LOW)

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
WiFiUDP udp;

static unsigned long seq = 0;
static unsigned long last_send = 0;
static unsigned long last_oled = 0;
static bool oled_ok = false;
static int last_sensor = 0;
static int sensor_baseline = 512;

void setup() {
    Serial.begin(115200);
    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(STATUS_LED, HIGH);

    // Initialize I2C for OLED
    Wire.begin(SDA_PIN, SCL_PIN);
    oled_ok = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
    if (oled_ok) {
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 10);
        display.println(F("CLUSTER NODE 1"));
        display.println(F("Sensor + Edge-ML"));
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
        digitalWrite(STATUS_LED, LOW); // Solid on
    } else {
        Serial.println("\n[Node-1] Wi-Fi connection timed out, continuing in local mode");
    }

    // Auto-calibrate IR sensor baseline at power-up
    long sum = 0;
    for (int i = 0; i < 20; i++) {
        sum += analogRead(SENSOR_PIN);
        delay(10);
    }
    sensor_baseline = sum / 20;
    last_sensor = sensor_baseline;
    Serial.printf("[Node-1] Calibrated IR baseline: %d\n", sensor_baseline);

    udp.begin(UDP_PORT);
}

void update_oled(int val, const char* ml_status) {
    if (!oled_ok) return;

    display.clearDisplay();
    // Inverted Header Banner
    display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(2, 2);
    display.print(F("NODE-1: SENSOR"));
    display.setCursor(80, 2);
    display.print(WiFi.status() == WL_CONNECTED ? F("WIFI:OK") : F("WIFI:OFF"));

    // Normal Text
    display.setTextColor(SSD1306_WHITE);

    // Telemetry Line 1: Sequence & Raw Value
    display.setCursor(0, 16);
    display.printf("Seq: #%-5lu IR:%4d", seq, val);

    // Visual IR Sensor Bar (deviation from baseline mapped to 0..120 px)
    int delta = abs(val - sensor_baseline);
    int bar_w = map(constrain(delta, 0, 400), 0, 400, 0, 120);
    display.drawRect(0, 26, 122, 7, SSD1306_WHITE);
    display.fillRect(1, 27, bar_w, 5, SSD1306_WHITE);

    // Telemetry Line 2: Edge ML Status
    display.setCursor(0, 36);
    display.printf("Edge-AI: %s", ml_status);

    // Telemetry Line 3: RSSI & IP
    display.setCursor(0, 46);
    display.printf("RSSI: %d dBm", WiFi.RSSI());

    display.setCursor(0, 56);
    display.printf("IP: %s", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "No Link");

    display.display();
}

void loop() {
    unsigned long now = millis();

    // Read analog IR sensor (0 to 1023)
    int raw = analogRead(SENSOR_PIN);
    last_sensor = (last_sensor * 3 + raw) / 4; // Smooth filter

    // Edge inference: detect abrupt anomaly/obstruction compared to baseline
    int delta = abs(last_sensor - sensor_baseline);
    bool detected = (delta > 180);
    const char* ml_pred = detected ? "PROXIMITY_ALERT" : "NOMINAL";

    // Periodically adapt baseline very slowly ONLY when idle (no object detected)
    if (!detected && (now % 3000 < 20)) {
        sensor_baseline = (sensor_baseline * 19 + last_sensor) / 20;
    }

    // Refresh OLED every 100ms
    if (now - last_oled >= 100) {
        last_oled = now;
        update_oled(last_sensor, ml_pred);
    }

    // Transmit UDP Telemetry every 350ms
    if (now - last_send >= 350) {
        last_send = now;
        seq++;

        // Flash onboard LED briefly
        digitalWrite(STATUS_LED, HIGH);

        StaticJsonDocument<256> doc;
        doc["n"] = "1";
        doc["node_id"] = "NODE_1_SENSOR";
        doc["type"] = "sensor";
        doc["seq"] = seq;
        doc["sensor"] = last_sensor;
        doc["rssi"] = WiFi.RSSI();
        doc["rtt"] = 14.5;
        doc["loss"] = 0;
        doc["reason"] = 0;
        doc["mode"] = "wifi";
        doc["ml_pred"] = ml_pred;
        doc["ip"] = WiFi.localIP().toString();

        char buf[256];
        size_t len = serializeJson(doc, buf);

        // 1. Direct unicast to known laptop hub
        udp.beginPacket(HUB_IP, UDP_PORT);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();

        // 2. Dynamic subnet broadcast (calculates 10.99.2.255, 192.168.43.255 automatically!)
        IPAddress subnetBroadcast = WiFi.localIP();
        subnetBroadcast[3] = 255;
        udp.beginPacket(subnetBroadcast, UDP_PORT);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();

        // 3. Global broadcast for peer-to-peer supervisor sync
        IPAddress broadcastIp(255, 255, 255, 255);
        udp.beginPacket(broadcastIp, UDP_PORT);
        udp.write((const uint8_t*)buf, len);
        udp.endPacket();

        digitalWrite(STATUS_LED, LOW);
    }
}
