// Node B: 433 MHz radio gateway (ESP32). Receives Node A's radio frames, checks
// them, and forwards the readings to the laptop over USB serial as JSON lines.
// The relay clicks on while Node A is in radio-fallback mode.
#include <Arduino.h>
#include <RH_ASK.h>
#include <SPI.h> // RadioHead needs it to compile

#define RX_433_PIN      4    // XY-MK-5V DATA. Power the receiver from 3V3 so its data line stays 3.3V-safe for the ESP32
#define RELAY_PIN       13
#define LED_PIN         2    // onboard LED
#define RELAY_HOLD_MS   3000  // relay stays on this long after the last fallback frame

// tx/ptt pins are unused here but RadioHead drives them as OUTPUTs: use free, non-strapping GPIOs
RH_ASK rf433(2000, RX_433_PIN, 25, 33);

uint32_t last_fallback_frame = 0, last_heartbeat = 0, frames_ok = 0, frames_bad = 0;
bool relay_on = false;

uint16_t crc16_ccitt(const uint8_t *d, size_t n) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < n; i++) {
        crc ^= (uint16_t)d[i] << 8;
        for (int j = 0; j < 8; j++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return crc;
}

void set_relay(bool on) {
    if (on == relay_on) return;
    relay_on = on;
    digitalWrite(RELAY_PIN, on ? HIGH : LOW);
    digitalWrite(LED_PIN, on ? HIGH : LOW);
}

void setup() {
    Serial.begin(115200);
    pinMode(RELAY_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);
    set_relay(false);
    if (!rf433.init()) Serial.println(F("{\"n\":\"B\",\"error\":\"radio init failed\"}"));
    Serial.println(F("{\"n\":\"B\",\"status\":\"up\"}"));
}

void loop() {
    uint8_t f[RH_ASK_MAX_MESSAGE_LEN];
    uint8_t len = sizeof(f);
    uint32_t now = millis();

    if (rf433.recv(f, &len)) {
        uint16_t crc = ((uint16_t)f[14] << 8) | f[15];
        if (len == 16 && f[0] == 0xA5 && f[1] == 0x02 && f[2] == 0x0A && crc == crc16_ccitt(f, 14)) {
            frames_ok++;
            bool fallback = f[3] & 1;
            if (fallback) { last_fallback_frame = now; set_relay(true); }
            Serial.print(F("{\"n\":\"B\",\"seq\":"));      Serial.print(((uint16_t)f[4] << 8) | f[5]);
            Serial.print(F(",\"sensor\":"));               Serial.print(((uint16_t)f[6] << 8) | f[7]);
            Serial.print(F(",\"rssi\":"));                Serial.print((int8_t)f[8]);
            Serial.print(F(",\"loss\":"));                Serial.print(f[9]);
            Serial.print(F(",\"rtt\":"));                 Serial.print(((uint16_t)f[10] << 8) | f[11]);
            Serial.print(F(",\"reason\":"));              Serial.print(f[12]);
            Serial.print(F(",\"ch\":"));                  Serial.print(f[13]);
            Serial.print(F(",\"connected\":"));           Serial.print((f[3] & 2) ? 1 : 0);
            Serial.print(F(",\"mode\":\""));              Serial.print(fallback ? F("radio") : F("wifi"));
            Serial.println(F("\"}"));
        } else {
            frames_bad++;
        }
    }

    if (relay_on && now - last_fallback_frame > RELAY_HOLD_MS) set_relay(false);

    if (now - last_heartbeat > 2000) {
        last_heartbeat = now;
        Serial.print(F("{\"n\":\"B\",\"hb\":1,\"ok\":"));  Serial.print(frames_ok);
        Serial.print(F(",\"bad\":"));                     Serial.print(frames_bad);
        Serial.print(F(",\"relay\":"));                   Serial.print(relay_on ? 1 : 0);
        Serial.println(F("}"));
    }
}
