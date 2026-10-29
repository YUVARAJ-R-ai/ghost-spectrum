
#include <Arduino.h>
#include <RH_ASK.h>
#include <SPI.h>

// RadioHead ASK receiver:
// speed = 2000 bps
// RX pin = GPIO14 (D5)
// TX and PTT are unused
RH_ASK driver(2000, 14, 4, 5);

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("=== ESP8266 433 MHz RECEIVER ===");

    if (!driver.init()) {
        Serial.println("ERROR: Radio initialization failed!");
        while (true) {
            delay(1000);
        }
    }

    Serial.println("Radio initialized.");
    Serial.println("Waiting for messages...");
}

void loop() {
    uint8_t buffer[RH_ASK_MAX_MESSAGE_LEN];
    uint8_t bufferLength = sizeof(buffer);

    if (driver.recv(buffer, &bufferLength)) {
        Serial.print("Received: ");

        for (uint8_t i = 0; i < bufferLength; i++) {
            Serial.write(buffer[i]);
        }

        Serial.println();
    }

    delay(1);
}
