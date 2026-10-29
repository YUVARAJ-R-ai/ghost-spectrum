#include <Arduino.h>
#include <RH_ASK.h>
#include <SPI.h>

// RH_ASK(speed, receivePin, transmitPin, pttPin)
RH_ASK driver(2000, -1, 14, -1);

unsigned long counter = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("433 MHz TRANSMITTER TEST");

  if (!driver.init()) {
    Serial.println("ERROR: RadioHead transmitter init failed!");
    while (true) {
      delay(1000);
    }
  }

  Serial.println("Transmitter initialized.");
}

void loop() {
  char message[40];

  snprintf(message, sizeof(message),
           "HELLO_FROM_ESP8266_%lu", counter++);

  bool sent = driver.send(
      (uint8_t *)message,
      strlen(message)
  );

  driver.waitPacketSent();

  Serial.print(sent ? "Sent: " : "Send failed: ");
  Serial.println(message);

  delay(1000);
}