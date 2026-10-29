// Node A: IoT device (ESP32). Sends sensor readings over real Wi-Fi, measures its own
// link health every packet, and falls back to 433 MHz radio when Wi-Fi fails
// (via automatic reflex, manual pushbutton, or remote laptop agent commands).
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <RH_ASK.h>
#include <SPI.h>
#include <ArduinoJson.h>
#include "radio_protocol.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill in your hotspot credentials"
#endif

// ---------------- Hardware Pin Assignments ----------------
#define TX_433_PIN       17   // FS1000A 433 MHz transmitter DATA
#define SENSOR_PIN       34   // IR/analog sensor output (ADC1 only: ADC2 unusable during Wi-Fi)
#define BUZZER_PIN       25   // Active buzzer, HIGH = beep
#define RH_UNUSED_RX     35   // Input-only pin required by RadioHead
#define RH_UNUSED_PTT    33   // Free pin driven as output by RadioHead (never 0)
#define BUTTON_PIN       27   // Momentary pushbutton connected between GPIO 27 and GND (INPUT_PULLUP)

#ifndef UDP_PORT
#define UDP_PORT         4210
#endif
#define RADIO_BEACON_MS  5000  // Standby health frame interval while in Wi-Fi mode
#define DEBOUNCE_MS      50    // Pushbutton debounce time in milliseconds

RH_ASK rf433(2000, RH_UNUSED_RX, TX_433_PIN, RH_UNUSED_PTT);
WiFiUDP udp;
IPAddress server_ip;

// ---------------- Link State Machine ----------------
enum Mode : uint8_t {
    MODE_WIFI = 0,
    MODE_RADIO = 1
};

Mode mode = MODE_WIFI;
bool manual_override = false;   // Set by physical pushbutton (latched until remote recovery)
bool remote_override = false;   // Set by laptop agent {"cmd":"radio"}
const char *mode_why = "boot";

uint16_t seq = 0;
uint32_t send_interval_ms = 500;
uint32_t last_send = 0;
uint32_t last_beacon = 0;
uint32_t buzzer_off_at = 0;
uint32_t last_wifi_retry = 0;

// Pushbutton debounce state
int last_button_reading = HIGH;
int button_state = HIGH;
uint32_t last_debounce_time = 0;

// Link history window (last 10 packets)
#define HIST 10
uint32_t sent_at[HIST];
uint16_t sent_seq[HIST];
bool acked[HIST];
uint16_t rtt_ms[HIST];
uint16_t sent_sensor[HIST];
bool replayed[HIST];

volatile uint8_t last_reason = 0;          // Wi-Fi disconnect reason code
volatile uint32_t last_reason_at = 0;
uint8_t consecutive_acks = 0;

void beep(uint32_t ms) {
    digitalWrite(BUZZER_PIN, HIGH);
    buzzer_off_at = millis() + ms;
}

void set_mode(Mode m, const char *why) {
    if (m == mode) {
        mode_why = why;
        return;
    }
    mode = m;
    mode_why = why;
    beep(m == MODE_RADIO ? 400 : 120);
    Serial.printf("[NODE_A] mode -> %s (reason: %s)\n", m == MODE_RADIO ? "RADIO" : "WIFI", why);
}

// Compute packet loss % and mean RTT over packets old enough to have received an ACK
void link_stats(uint8_t &loss_pct, uint16_t &rtt_mean) {
    uint32_t now = millis();
    int n = 0, lost = 0, rtt_n = 0;
    uint32_t rtt_sum = 0;
    for (int i = 0; i < HIST; i++) {
        if (sent_at[i] == 0 || now - sent_at[i] < 400) continue;
        n++;
        if (acked[i]) {
            rtt_sum += rtt_ms[i];
            rtt_n++;
        } else {
            lost++;
        }
    }
    loss_pct = n ? (uint8_t)((lost * 100) / n) : 0;
    rtt_mean = rtt_n ? (uint16_t)(rtt_sum / rtt_n) : 1000;  // 1000 ms indicates no response
}

void send_cmd_ack(const char *cmd, const char *status, const char *cur_mode) {
    char resp[128];
    snprintf(resp, sizeof(resp), "{\"n\":\"A\",\"cmd_ack\":\"%s\",\"status\":\"%s\",\"mode\":\"%s\"}",
             cmd, status, cur_mode);
    udp.beginPacket(udp.remoteIP(), udp.remotePort());
    udp.write((const uint8_t *)resp, strlen(resp));
    udp.endPacket();
}

void handle_udp() {
    int len = udp.parsePacket();
    if (len <= 0) return;
    char buf[128];
    int n = udp.read(buf, sizeof(buf) - 1);
    if (n <= 0) return;
    buf[n] = 0;

    StaticJsonDocument<128> doc;
    DeserializationError err = deserializeJson(doc, buf);
    if (err) return;

    if (doc.containsKey("ack")) {
        uint16_t s = doc["ack"];
        for (int i = 0; i < HIST; i++) {
            if (sent_seq[i] == s && sent_at[i] && !acked[i]) {
                acked[i] = true;
                rtt_ms[i] = millis() - sent_at[i];
                if (consecutive_acks < 255) consecutive_acks++;
            }
        }
        server_ip = udp.remoteIP();  // Dynamically learn laptop endpoint
    }

    const char *cmd = doc["cmd"];
    if (!cmd) return;

    if (!strcmp(cmd, "radio")) {
        remote_override = true;
        set_mode(MODE_RADIO, "REMOTE_COMMAND");
        Serial.println(F("[NODE_A] Laptop command: 'radio' -> latched MODE_RADIO (REMOTE_COMMAND)"));
        send_cmd_ack("radio", "ok", "radio");
    }
    else if (!strcmp(cmd, "wifi")) {
        // Clear both manual and remote overrides
        manual_override = false;
        remote_override = false;
        bool connected = (WiFi.status() == WL_CONNECTED);
        if (connected) {
            set_mode(MODE_WIFI, "REMOTE_COMMAND");
            Serial.println(F("[NODE_A] Laptop command: 'wifi' -> overrides cleared, switched to MODE_WIFI"));
            send_cmd_ack("wifi", "ok", "wifi");
        } else {
            Serial.println(F("[NODE_A] Laptop command: 'wifi' -> overrides cleared, but Wi-Fi disconnected; remaining in MODE_RADIO until reconnected"));
            send_cmd_ack("wifi", "pending_disconnected", "radio");
        }
    }
    else if (!strcmp(cmd, "rate")) {
        if (doc.containsKey("ms")) {
            send_interval_ms = constrain((uint32_t)doc["ms"], 250, 5000);
            Serial.printf("[NODE_A] Laptop command: 'rate' -> interval changed to %u ms\n", send_interval_ms);
            char resp[96];
            snprintf(resp, sizeof(resp), "{\"n\":\"A\",\"cmd_ack\":\"rate\",\"status\":\"ok\",\"interval_ms\":%u}", send_interval_ms);
            udp.beginPacket(udp.remoteIP(), udp.remotePort());
            udp.write((const uint8_t *)resp, strlen(resp));
            udp.endPacket();
        }
    }
}

// Transmit 16-byte telemetry frame over 433 MHz ASK link
void send_radio(uint16_t s, uint16_t sensor, int8_t rssi, uint8_t loss, uint16_t rtt, bool connected) {
    RadioFrame rf;
    rf.flags = (mode == MODE_RADIO ? RADIO_FLAG_MODE_RADIO : 0) | (connected ? RADIO_FLAG_WIFI_CONN : 0);
    rf.seq = s;
    rf.sensor = sensor;
    rf.rssi = rssi;
    rf.loss_pct = loss;
    rf.rtt_ms = rtt;
    rf.disconnect_reason = last_reason;
    rf.wifi_channel = WiFi.channel();

    uint8_t wire[RADIO_FRAME_LEN];
    radio_pack_frame(&rf, wire);
    rf433.send(wire, sizeof(wire));
}

// Non-blocking button debouncing and manual override latching
void check_button() {
    int reading = digitalRead(BUTTON_PIN);
    if (reading != last_button_reading) {
        last_debounce_time = millis();
        last_button_reading = reading;
    }
    if ((millis() - last_debounce_time) > DEBOUNCE_MS) {
        if (reading != button_state) {
            button_state = reading;
            if (button_state == LOW) {
                // Momentary button pressed (active LOW)
                manual_override = true;
                set_mode(MODE_RADIO, "MANUAL_BUTTON");
                Serial.println(F("[NODE_A] Pushbutton pressed -> latched MODE_RADIO (MANUAL_BUTTON)"));
            }
        }
    }
}

void setup() {
    Serial.begin(115200);
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    analogSetPinAttenuation(SENSOR_PIN, ADC_11db);

    if (!rf433.init()) {
        Serial.println(F("[ERROR] RadioHead init failed on Node A"));
    }

    WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
        last_reason = info.wifi_sta_disconnected.reason;
        last_reason_at = millis();
        Serial.printf("[NODE_A] Wi-Fi disconnected (reason: %u)\n", last_reason);
    }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);

    WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t) {
        Serial.print(F("[NODE_A] Wi-Fi connected, IP: "));
        Serial.println(WiFi.localIP());
    }, ARDUINO_EVENT_WIFI_STA_GOT_IP);

    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    udp.begin(UDP_PORT);

#ifdef SERVER_IP
    server_ip = IPAddress(SERVER_IP);
#else
    server_ip = IPAddress(255, 255, 255, 255);  // Broadcast discovery
#endif

    Serial.println(F("[NODE_A] Firmware initialized (Node A ESP32 Sensor & TX)"));
}

void loop() {
    uint32_t now = millis();

    // 1. Process incoming UDP packets (ACKs, laptop commands)
    handle_udp();

    // 2. Debounce physical pushbutton on GPIO 27
    check_button();

    // 3. Non-blocking buzzer timeout
    if (buzzer_off_at && now >= buzzer_off_at) {
        digitalWrite(BUZZER_PIN, LOW);
        buzzer_off_at = 0;
    }

    // 4. Non-blocking Wi-Fi reconnect attempt if connection dropped
    bool connected = (WiFi.status() == WL_CONNECTED);
    if (!connected && (now - last_wifi_retry > 5000)) {
        last_wifi_retry = now;
        WiFi.reconnect();
    }

    // 5. Cadence timer for sensor telemetry transmission
    if (now - last_send < send_interval_ms) return;
    last_send = now;
    seq++;

    int8_t rssi = connected ? (int8_t)WiFi.RSSI() : (int8_t)-100;
    uint16_t sensor = (uint16_t)analogRead(SENSOR_PIN);
    if (now - last_reason_at > 10000) last_reason = 0;  // Expire stale disconnect reasons

    uint8_t loss;
    uint16_t rtt;
    link_stats(loss, rtt);

    // 6. State Machine: Evaluate Link Health and Transitions
    int slot = seq % HIST;
    bool last3_lost = true;
    for (int k = 1; k <= 3; k++) {
        int i = (slot - k + HIST) % HIST;
        if (!sent_at[i] || acked[i]) last3_lost = false;
    }

    if (!connected) {
        consecutive_acks = 0;
        set_mode(MODE_RADIO, "WIFI_LOST");
    } else if (last3_lost) {
        consecutive_acks = 0;
        set_mode(MODE_RADIO, "ACK_TIMEOUT");
    } else if (mode == MODE_RADIO && !manual_override && !remote_override && consecutive_acks >= 4) {
        set_mode(MODE_WIFI, "RECOVERED");
    }

    // 7. Store-and-Forward: Resend unacknowledged readings over 433 MHz radio (max 2 per cycle)
    int resent = 0;
    for (int k = HIST - 1; k >= 1 && resent < 2; k--) {
        int i = (slot - k + HIST) % HIST;
        if (sent_at[i] && !acked[i] && !replayed[i] && (now - sent_at[i] > 800) && (now - sent_at[i] < 8000)) {
            send_radio(sent_seq[i], sent_sensor[i], rssi, loss, rtt, connected);
            replayed[i] = true;
            resent++;
        }
    }

    // Record this telemetry packet in local history
    sent_seq[slot] = seq;
    sent_at[slot] = now;
    acked[slot] = false;
    sent_sensor[slot] = sensor;
    replayed[slot] = (mode == MODE_RADIO);

    // 8. Correct Data-Path Execution
    if (mode == MODE_WIFI) {
        // Wi-Fi mode: send primary telemetry over UDP
        if (connected) {
            char msg[200];
            snprintf(msg, sizeof(msg),
                     "{\"n\":\"A\",\"seq\":%u,\"sensor\":%u,\"rssi\":%d,\"loss\":%u,\"rtt\":%u,"
                     "\"reason\":%u,\"ch\":%u,\"mode\":\"wifi\",\"why\":\"%s\"}",
                     seq, sensor, rssi, loss, rtt, last_reason, WiFi.channel(), mode_why);
            udp.beginPacket(server_ip, UDP_PORT);
            udp.write((const uint8_t *)msg, strlen(msg));
            udp.endPacket();
        }
        // Periodic standby radio beacon
        if (now - last_beacon > RADIO_BEACON_MS) {
            last_beacon = now;
            send_radio(seq, sensor, rssi, loss, rtt, connected);
        }
    } else {
        // Radio mode: Authoritative telemetry path is 433 MHz radio
        // Telemetry is NOT duplicated over UDP to ensure radio delivery is independently verified by Node B
        last_beacon = now;
        send_radio(seq, sensor, rssi, loss, rtt, connected);
    }
}
