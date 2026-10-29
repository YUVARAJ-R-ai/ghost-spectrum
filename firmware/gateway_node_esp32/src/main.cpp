// Node B: 433 MHz radio gateway (ESP32 version). Receives Node A's radio frames, checks
// them safely (verifying length before access), and forwards the readings to the laptop over USB serial.
#include <Arduino.h>
#include <RH_ASK.h>
#include <SPI.h>
#include "radio_protocol.h"

#define RX_433_PIN      4    // XY-MK-5V DATA. Power receiver from 3V3 so data line stays 3.3V-safe
#define LED_PIN         2    // Onboard LED

// tx/ptt pins are unused here but RadioHead drives them as OUTPUTs: use free, non-strapping GPIOs
RH_ASK rf433(2000, RX_433_PIN, 25, 33);

uint32_t last_fallback_frame = 0, last_heartbeat = 0, frames_ok = 0, frames_bad = 0;

void setup() {
    Serial.begin(115200);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    if (!rf433.init()) Serial.println(F("{\"n\":\"B\",\"error\":\"radio init failed\"}"));
    Serial.println(F("{\"n\":\"B\",\"status\":\"up\"}"));
}

void loop() {
    uint8_t f[RH_ASK_MAX_MESSAGE_LEN];
    uint8_t len = sizeof(f);
    uint32_t now = millis();

    if (rf433.recv(f, &len)) {
        // Safe check: verify length and header before accessing frame bytes
        RadioFrame rf;
        RadioDecodeStatus status = radio_unpack_frame(f, len, &rf);

        if (status == RADIO_OK) {
            frames_ok++;
            bool fallback = (rf.flags & RADIO_FLAG_MODE_RADIO) != 0;
            if (fallback) {
                last_fallback_frame = now;
                digitalWrite(LED_PIN, HIGH);
            }

            Serial.print(F("{\"n\":\"B\",\"seq\":"));      Serial.print(rf.seq);
            Serial.print(F(",\"sensor\":"));               Serial.print(rf.sensor);
            Serial.print(F(",\"rssi\":"));                Serial.print(rf.rssi);
            Serial.print(F(",\"loss\":"));                Serial.print(rf.loss_pct);
            Serial.print(F(",\"rtt\":"));                 Serial.print(rf.rtt_ms);
            Serial.print(F(",\"reason\":"));              Serial.print(rf.disconnect_reason);
            Serial.print(F(",\"ch\":"));                  Serial.print(rf.wifi_channel);
            Serial.print(F(",\"connected\":"));           Serial.print((rf.flags & RADIO_FLAG_WIFI_CONN) ? 1 : 0);
            Serial.print(F(",\"mode\":\""));              Serial.print(fallback ? F("radio") : F("wifi"));
            Serial.println(F("\"}"));
        } else {
            frames_bad++;
        }
    }

    if (now - last_fallback_frame > 3000) {
        digitalWrite(LED_PIN, LOW);
    }

    if (now - last_heartbeat > 2000) {
        last_heartbeat = now;
        Serial.print(F("{\"n\":\"B\",\"hb\":1,\"ok\":"));  Serial.print(frames_ok);
        Serial.print(F(",\"bad\":"));                     Serial.print(frames_bad);
        Serial.println(F("}"));
    }
}
