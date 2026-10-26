// Node A: IoT device. Sends sensor readings over real Wi-Fi, measures its own
// link health every packet, and falls back to 433 MHz radio when Wi-Fi fails
// (on its own reflex, or ahead of time when the laptop agent tells it to).
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <RH_ASK.h>
#include <SPI.h>
#include <ArduinoJson.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill in your hotspot name/password"
#endif

// ---------------- Pins ----------------
#define OLED_SDA_PIN   21
#define OLED_SCL_PIN   22
#define TX_433_PIN     17
#define SENSOR_PIN        34   // ADC1 only: ADC2 pins stop working while Wi-Fi is on
#define BUZZER_PIN     25   // active buzzer, HIGH = beep
#define RH_UNUSED_RX   35   // input-only pin, RadioHead needs some RX pin
#define RH_UNUSED_PTT  33   // never pass 0 here: RadioHead drives this pin as an output

#define UDP_PORT       4210
#define RADIO_BEACON_MS 5000  // standby frame so the laptop knows the radio path is alive

RH_ASK rf433(2000, RH_UNUSED_RX, TX_433_PIN, RH_UNUSED_PTT);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
WiFiUDP udp;
IPAddress server_ip;
bool oled_ok = false;

// ---------------- Link state ----------------
enum Mode : uint8_t { MODE_WIFI = 0, MODE_RADIO = 1 };
Mode mode = MODE_WIFI;
bool agent_forced_radio = false;   // set by laptop agent (pre-emptive switch)
const char *mode_why = "boot";

uint16_t seq = 0;
uint32_t send_interval_ms = 500;
uint32_t last_send = 0, last_beacon = 0, buzzer_off_at = 0;

// Last 10 packets: was each acked, and how long did the ack take
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

uint16_t crc16_ccitt(const uint8_t *d, size_t n) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < n; i++) {
        crc ^= (uint16_t)d[i] << 8;
        for (int j = 0; j < 8; j++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return crc;
}

void beep(uint32_t ms) {
    digitalWrite(BUZZER_PIN, HIGH);
    buzzer_off_at = millis() + ms;
}

void set_mode(Mode m, const char *why) {
    if (m == mode) return;
    mode = m;
    mode_why = why;
    beep(m == MODE_RADIO ? 400 : 120);
    Serial.printf("[NODE_A] mode -> %s (%s)\n", m == MODE_RADIO ? "RADIO" : "WIFI", why);
}

// Loss % and mean RTT over packets old enough to have been answered
void link_stats(uint8_t &loss_pct, uint16_t &rtt_mean) {
    uint32_t now = millis();
    int n = 0, lost = 0, rtt_n = 0;
    uint32_t rtt_sum = 0;
    for (int i = 0; i < HIST; i++) {
        if (sent_at[i] == 0 || now - sent_at[i] < 400) continue;
        n++;
        if (acked[i]) { rtt_sum += rtt_ms[i]; rtt_n++; } else lost++;
    }
    loss_pct = n ? (lost * 100) / n : 0;
    rtt_mean = rtt_n ? rtt_sum / rtt_n : 1000;  // 1000 = "no answers at all"
}

void handle_udp() {
    int len = udp.parsePacket();
    if (len <= 0) return;
    char buf[128];
    len = udp.read(buf, sizeof(buf) - 1);
    buf[len] = 0;
    StaticJsonDocument<128> doc;
    if (deserializeJson(doc, buf)) return;

    if (doc.containsKey("ack")) {
        uint16_t s = doc["ack"];
        for (int i = 0; i < HIST; i++) {
            if (sent_seq[i] == s && sent_at[i] && !acked[i]) {
                acked[i] = true;
                rtt_ms[i] = millis() - sent_at[i];
                if (consecutive_acks < 255) consecutive_acks++;
            }
        }
        server_ip = udp.remoteIP();  // learn the laptop's address from its first reply
    }
    const char *cmd = doc["cmd"];
    if (!cmd) return;
    if (!strcmp(cmd, "radio")) { agent_forced_radio = true; set_mode(MODE_RADIO, "agent"); }
    else if (!strcmp(cmd, "wifi")) { agent_forced_radio = false; }
    else if (!strcmp(cmd, "rate")) { send_interval_ms = constrain((int)doc["ms"], 250, 5000); }
}

// 16-byte radio frame, decoded by the Uno gateway
void send_radio(uint16_t s, uint16_t sensor, int8_t rssi, uint8_t loss, uint16_t rtt, bool connected) {
    uint8_t f[16];
    f[0] = 0xA5; f[1] = 0x02; f[2] = 0x0A;
    f[3] = (mode == MODE_RADIO ? 1 : 0) | (connected ? 2 : 0);
    f[4] = s >> 8; f[5] = s;
    f[6] = sensor >> 8; f[7] = sensor;
    f[8] = (uint8_t)rssi; f[9] = loss;
    f[10] = rtt >> 8; f[11] = rtt;
    f[12] = last_reason; f[13] = WiFi.channel();
    uint16_t crc = crc16_ccitt(f, 14);
    f[14] = crc >> 8; f[15] = crc;
    rf433.send(f, sizeof(f));  // returns once the previous frame has finished
}

void draw(uint16_t sensor, int8_t rssi, uint8_t loss) {
    if (!oled_ok) return;
    display.clearDisplay();
    if (mode == MODE_RADIO) {
        display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
        display.setCursor(4, 3);
        display.print("RADIO FALLBACK 433M");
    } else {
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(4, 3);
        display.print("LINK: WI-FI");
    }
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 20); display.printf("why : %s", mode_why);
    display.setCursor(0, 31); display.printf("rssi: %d dBm", rssi);
    display.setCursor(0, 42); display.printf("loss: %u%%  #%u", loss, seq);
    display.setCursor(0, 53); display.printf("IR: %u", sensor);
    display.display();
}

void setup() {
    Serial.begin(115200);
    pinMode(BUZZER_PIN, OUTPUT);
    analogSetPinAttenuation(SENSOR_PIN, ADC_11db);

    Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
    oled_ok = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    if (!oled_ok) Serial.println("[WARN] OLED not found at 0x3C");
    if (!rf433.init()) Serial.println("[ERROR] RadioHead init failed");

    WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
        last_reason = info.wifi_sta_disconnected.reason;
        last_reason_at = millis();
    }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
    WiFi.persistent(false);   // no flash writes while RadioHead's timer ISR runs
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    udp.begin(UDP_PORT);
#ifdef SERVER_IP
    server_ip = IPAddress(SERVER_IP);
#else
    server_ip = IPAddress(255, 255, 255, 255);  // broadcast until the laptop answers
#endif
    Serial.println("[NODE_A] up");
}

void loop() {
    uint32_t now = millis();
    handle_udp();
    if (buzzer_off_at && now > buzzer_off_at) { digitalWrite(BUZZER_PIN, LOW); buzzer_off_at = 0; }
    if (now - last_send < send_interval_ms) return;
    last_send = now;
    seq++;

    bool connected = WiFi.status() == WL_CONNECTED;
    int8_t rssi = connected ? WiFi.RSSI() : -100;
    uint16_t sensor = analogRead(SENSOR_PIN);
    if (now - last_reason_at > 10000) last_reason = 0;  // forget stale reasons
    uint8_t loss; uint16_t rtt;
    link_stats(loss, rtt);

    // Reflex: no Wi-Fi, or the last 3 packets went unanswered -> radio now
    int slot = seq % HIST;
    bool last3_lost = true;
    for (int k = 1; k <= 3; k++) {
        int i = (slot - k + HIST) % HIST;
        if (!sent_at[i] || acked[i]) last3_lost = false;
    }
    if (!connected || last3_lost) { consecutive_acks = 0; set_mode(MODE_RADIO, connected ? "no reply" : "wifi lost"); }
    else if (mode == MODE_RADIO && !agent_forced_radio && consecutive_acks >= 4) set_mode(MODE_WIFI, "recovered");

    // Store-and-forward: any reading Wi-Fi didn't confirm within 800 ms is resent over radio
    // (max 2 per loop: each 433 MHz frame takes ~160 ms on air)
    int resent = 0;
    for (int k = HIST - 1; k >= 1 && resent < 2; k--) {
        int i = (slot - k + HIST) % HIST;
        if (sent_at[i] && !acked[i] && !replayed[i] && now - sent_at[i] > 800 && now - sent_at[i] < 8000) {
            send_radio(sent_seq[i], sent_sensor[i], rssi, loss, rtt, connected);
            replayed[i] = true;
            resent++;
        }
    }

    sent_seq[slot] = seq; sent_at[slot] = now; acked[slot] = false; sent_sensor[slot] = sensor;
    replayed[slot] = mode == MODE_RADIO;  // radio-mode readings go out on radio right below

    if (connected) {
        char msg[200];
        snprintf(msg, sizeof(msg),
                 "{\"n\":\"A\",\"seq\":%u,\"sensor\":%u,\"rssi\":%d,\"loss\":%u,\"rtt\":%u,"
                 "\"reason\":%u,\"ch\":%u,\"mode\":\"%s\",\"why\":\"%s\"}",
                 seq, sensor, rssi, loss, rtt, last_reason, WiFi.channel(),
                 mode == MODE_RADIO ? "radio" : "wifi", mode_why);
        udp.beginPacket(server_ip, UDP_PORT);
        udp.write((const uint8_t *)msg, strlen(msg));
        udp.endPacket();
    }
    if (mode == MODE_RADIO || now - last_beacon > RADIO_BEACON_MS) {
        last_beacon = now;
        send_radio(seq, sensor, rssi, loss, rtt, connected);
    }
    draw(sensor, rssi, loss);
}
