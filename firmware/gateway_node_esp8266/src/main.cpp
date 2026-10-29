// Node B: 433 MHz Radio Gateway & Telemetry Forwarder (ESP8266).
// Receives 16-byte RF frames from Node A via XY-MK-5V 433 MHz receiver,
// validates header, length, and CRC16-CCITT, decodes telemetry fields,
// forwards data to laptop over Wi-Fi UDP and USB Serial, and renders
// live diagnostics on SSD1306 I2C OLED display.

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <RH_ASK.h>
#include <SPI.h>
#include "radio_protocol.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill in your hotspot credentials"
#endif

// ---------------- Pin Configurations for ESP8266 ----------------
// NodeMCU pin mappings:
// D1 = GPIO5 (I2C SCL)
// D2 = GPIO4 (I2C SDA)
// D5 = GPIO14 (433 MHz Receiver DATA)
// D6 = GPIO12 (Unused TX pin required by RadioHead)
// D7 = GPIO13 (Unused PTT pin required by RadioHead)

#define OLED_SDA_PIN    4    // D2 on NodeMCU / D1 mini
#define OLED_SCL_PIN    5    // D1 on NodeMCU / D1 mini
#define OLED_I2C_ADDR   0x3C
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT   64

#define RX_433_PIN      14   // D5: XY-MK-5V DATA pin (powered at 3V3 for safe logic level)
#define RH_UNUSED_TX    12   // D6: Driven as output by RadioHead
#define RH_UNUSED_PTT   13   // D7: Driven as output by RadioHead

#ifndef UDP_PORT
#define UDP_PORT        4210
#endif

#define OLED_REFRESH_MS 200  // Non-blocking OLED update interval (5 Hz)
#define HB_INTERVAL_MS  2000 // Gateway health heartbeat interval

// ---------------- Hardware Drivers ----------------
RH_ASK rf433(2000, RX_433_PIN, RH_UNUSED_TX, RH_UNUSED_PTT);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
WiFiUDP udp;
IPAddress server_ip;

// ---------------- Statistics and State ----------------
uint32_t frames_valid = 0;
uint32_t frames_invalid = 0;
uint32_t frames_dup = 0;
uint32_t last_valid_rx_at = 0;
uint32_t last_oled_update = 0;
uint32_t last_heartbeat = 0;
uint32_t last_wifi_reconnect_attempt = 0;
bool oled_ok = false;

// Duplicate frame tracking using circular window
#define SEQ_HISTORY_SIZE 32
uint16_t recent_seqs[SEQ_HISTORY_SIZE];
size_t recent_count = 0;
size_t recent_head = 0;

// Last decoded frame cache for OLED display
RadioFrame last_frame;
bool has_last_frame = false;
bool last_frame_was_dup = false;

bool is_duplicate_seq(uint16_t s) {
    for (size_t i = 0; i < recent_count; i++) {
        if (recent_seqs[i] == s) return true;
    }
    return false;
}

void record_seq(uint16_t s) {
    if (recent_count < SEQ_HISTORY_SIZE) {
        recent_seqs[recent_count++] = s;
    } else {
        recent_seqs[recent_head] = s;
        recent_head = (recent_head + 1) % SEQ_HISTORY_SIZE;
    }
}

// Forward decoded telemetry to laptop over USB Serial and Wi-Fi UDP
void forward_telemetry(const RadioFrame &rf, bool is_dup, uint32_t age_ms) {
    bool is_radio = (rf.flags & RADIO_FLAG_MODE_RADIO) != 0;
    bool is_conn  = (rf.flags & RADIO_FLAG_WIFI_CONN) != 0;

    char json[256];
    snprintf(json, sizeof(json),
             "{\"n\":\"B\",\"transport\":\"433MHz\",\"seq\":%u,\"sensor\":%u,\"rssi\":%d,"
             "\"loss\":%u,\"rtt\":%u,\"reason\":%u,\"ch\":%u,\"mode\":\"%s\","
             "\"connected\":%d,\"frames_ok\":%lu,\"frames_bad\":%lu,\"frames_dup\":%lu,"
             "\"dup\":%d,\"age_ms\":%lu}",
             rf.seq, rf.sensor, rf.rssi,
             rf.loss_pct, rf.rtt_ms, rf.disconnect_reason, rf.wifi_channel,
             is_radio ? "radio" : "wifi",
             is_conn ? 1 : 0,
             (unsigned long)frames_valid,
             (unsigned long)frames_invalid,
             (unsigned long)frames_dup,
             is_dup ? 1 : 0,
             (unsigned long)age_ms);

    // 1. Output to USB serial
    Serial.println(json);

    // 2. Forward over UDP if Wi-Fi connected
    if (WiFi.status() == WL_CONNECTED) {
        udp.beginPacket(server_ip, UDP_PORT);
        udp.write((const uint8_t *)json, strlen(json));
        udp.endPacket();
    }
}

// Periodic gateway health report distinct from sensor readings
void emit_heartbeat() {
    uint32_t now = millis();
    uint32_t rx_age = (last_valid_rx_at == 0) ? 999999 : (now - last_valid_rx_at);
    bool wifi_ok = (WiFi.status() == WL_CONNECTED);

    char hb[192];
    snprintf(hb, sizeof(hb),
             "{\"n\":\"B\",\"hb\":1,\"wifi\":%d,\"ip\":\"%s\",\"rssi\":%d,"
             "\"ok\":%lu,\"bad\":%lu,\"dup\":%lu,\"last_rx_age_ms\":%lu}",
             wifi_ok ? 1 : 0,
             wifi_ok ? WiFi.localIP().toString().c_str() : "0.0.0.0",
             wifi_ok ? WiFi.RSSI() : -100,
             (unsigned long)frames_valid,
             (unsigned long)frames_invalid,
             (unsigned long)frames_dup,
             (unsigned long)rx_age);

    Serial.println(hb);

    if (wifi_ok) {
        udp.beginPacket(server_ip, UDP_PORT);
        udp.write((const uint8_t *)hb, strlen(hb));
        udp.endPacket();
    }
}

// Non-blocking OLED status update
void update_oled() {
    if (!oled_ok) return;

    uint32_t now = millis();
    bool wifi_ok = (WiFi.status() == WL_CONNECTED);

    display.clearDisplay();
    display.setTextSize(1);

    // Top Header Banner
    display.fillRect(0, 0, 128, 11, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(2, 2);
    display.print(F("GW:NODE_B"));
    display.setCursor(68, 2);
    if (wifi_ok) {
        display.print(F("WIFI:OK"));
    } else {
        display.print(F("WIFI:DISC"));
    }

    display.setTextColor(SSD1306_WHITE);

    if (has_last_frame) {
        bool is_radio = (last_frame.flags & RADIO_FLAG_MODE_RADIO) != 0;
        uint32_t age_s = (now - last_valid_rx_at) / 1000;

        // Line 2: Node A Reported Mode & Status
        display.setCursor(0, 14);
        if (is_radio) {
            display.printf("A: RADIO (FALLBACK)");
        } else {
            display.printf("A: WIFI (BEACON)");
        }

        // Line 3: Sequence & Sensor
        display.setCursor(0, 24);
        display.printf("Seq: #%-5u IR: %u", last_frame.seq, last_frame.sensor);

        // Line 4: RSSI & Loss
        display.setCursor(0, 34);
        display.printf("RSSI: %d dBm  L:%u%%", last_frame.rssi, last_frame.loss_pct);

        // Line 5: Counters
        display.setCursor(0, 44);
        display.printf("Frames: %luok %lubad", (unsigned long)frames_valid, (unsigned long)frames_invalid);

        // Line 6: Reception Age & Duplicate status
        display.setCursor(0, 54);
        display.printf("Age: %lus %s", (unsigned long)age_s, last_frame_was_dup ? "[DUP]" : "[OK]");
    } else {
        // Standby screen while waiting for first radio reception
        display.setCursor(0, 16);
        display.print(F("Waiting for Node A..."));
        display.setCursor(0, 30);
        display.printf("IP: %s", wifi_ok ? WiFi.localIP().toString().c_str() : "Connecting...");
        display.setCursor(0, 44);
        display.printf("Frames: %luok %lubad", (unsigned long)frames_valid, (unsigned long)frames_invalid);
        display.setCursor(0, 54);
        display.print(F("433MHz RX: LISTENING"));
    }

    display.display();
}

void setup() {
    Serial.begin(115200);

    // Initialize I2C for SSD1306 OLED
    Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
    oled_ok = display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR);
    if (!oled_ok) {
        Serial.println(F("{\"n\":\"B\",\"warn\":\"OLED init failed at 0x3C\"}"));
    } else {
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 20);
        display.println(F("Node B ESP8266 GW"));
        display.println(F("Booting up..."));
        display.display();
    }

    // Initialize RadioHead ASK receiver
    if (!rf433.init()) {
        Serial.println(F("{\"n\":\"B\",\"error\":\"RadioHead init failed\"}"));
    }

    // Initialize ESP8266 Wi-Fi Station
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    udp.begin(UDP_PORT);

#ifdef SERVER_IP
    server_ip = IPAddress(SERVER_IP);
#else
    server_ip = IPAddress(255, 255, 255, 255);  // Broadcast until configured
#endif

    Serial.println(F("{\"n\":\"B\",\"status\":\"up\",\"platform\":\"ESP8266\"}"));
}

void loop() {
    uint32_t now = millis();

    // 1. Non-blocking Wi-Fi Reconnect check
    if (WiFi.status() != WL_CONNECTED && (now - last_wifi_reconnect_attempt > 6000)) {
        last_wifi_reconnect_attempt = now;
        WiFi.reconnect();
    }

    // 2. Poll 433 MHz Radio Receiver
    uint8_t rx_buf[RH_ASK_MAX_MESSAGE_LEN];
    uint8_t rx_len = sizeof(rx_buf);

    if (rf433.recv(rx_buf, &rx_len)) {
        // Validate length FIRST, magic bytes, version, type, and CRC16-CCITT
        RadioFrame rf;
        RadioDecodeStatus status = radio_unpack_frame(rx_buf, rx_len, &rf);

        if (status == RADIO_OK) {
            frames_valid++;
            last_valid_rx_at = now;

            bool is_dup = is_duplicate_seq(rf.seq);
            if (is_dup) {
                frames_dup++;
            } else {
                record_seq(rf.seq);
            }

            // Update display cache
            last_frame = rf;
            has_last_frame = true;
            last_frame_was_dup = is_dup;

            // Forward telemetry to laptop
            forward_telemetry(rf, is_dup, 0);
        } else {
            frames_invalid++;
            Serial.printf("{\"n\":\"B\",\"warn\":\"invalid_frame\",\"err\":%d,\"len\":%u}\n", (int)status, rx_len);
        }
    }

    // 3. Periodic Gateway Health Heartbeat (distinct from sensor readings)
    if (now - last_heartbeat > HB_INTERVAL_MS) {
        last_heartbeat = now;
        emit_heartbeat();
    }

    // 4. Non-blocking OLED status update
    if (now - last_oled_update >= OLED_REFRESH_MS) {
        last_oled_update = now;
        update_oled();
    }
}
