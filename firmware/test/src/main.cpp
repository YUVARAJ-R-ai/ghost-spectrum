
#include <Arduino.h>
#include <SPI.h>
#include <RF24.h>

// Constructor order: CE, CSN
RF24 radio(9, 8);

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=== nRF24L01 Diagnostic ===");
    Serial.println("Starting radio...");

    // Keep the Uno in SPI master mode
    pinMode(10, OUTPUT);

    if (!radio.begin()) {
        Serial.println("FAIL: Radio did not respond over SPI.");
        Serial.println("Check power, wiring, and module condition.");
        return;
    }

    Serial.println("PASS: Radio responded!");

    radio.setPALevel(RF24_PA_LOW);
    radio.setDataRate(RF24_1MBPS);

    if (radio.isChipConnected()) {
        Serial.println("PASS: Chip connection verified.");
    } else {
        Serial.println("FAIL: Chip connection check failed.");
    }

    Serial.println("\nRadio configuration:");
    radio.printDetails();

    Serial.println("\nDiagnostic finished.");
}

void loop() {
    delay(1000);
}
