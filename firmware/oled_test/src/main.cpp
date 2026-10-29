
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

Adafruit_SSD1306 display(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    &Wire,
    OLED_RESET
);

void setup() {
  Serial.begin(115200);

  // ESP8266: SDA = D2, SCL = D1
  Wire.begin(D2, D1);

  Serial.println("\nStarting OLED test...");

  // Most I2C OLEDs use address 0x3C.
  // Some use 0x3D.
  bool found = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  if (!found) {
    Serial.println("Address 0x3C failed. Trying 0x3D...");
    found = display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  }

  if (!found) {
    Serial.println("OLED not detected!");
    Serial.println("Check wiring, I2C address and display type.");
    while (true) {
      delay(1000);
    }
  }

  Serial.println("OLED initialized successfully!");

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("ESP8266 OLED TEST");

  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  display.setTextSize(2);
  display.setCursor(0, 22);
  display.println("HELLO!");

  display.setTextSize(1);
  display.setCursor(0, 50);
  display.println("I2C is working");

  display.display();
}

void loop() {
  // Static display test
}
