#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

void setup() {
    Serial.begin(115200);
    Wire.begin();

    Serial.println("Starting OLED test...");

    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("OLED initialization failed at 0x3C");
        while (true) {}
    }

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(0, 10);
    display.println("OLED OK!");

    display.setTextSize(1);
    display.setCursor(0, 40);
    display.println("Arduino Uno test");
    display.display();

    Serial.println("OLED initialized successfully!");
}

void loop() {}