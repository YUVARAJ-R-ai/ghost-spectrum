#include <Arduino.h>

// Forward declarations for PlatformIO C++ compilation
void startPump(int speed);
void stopPump();

// Pin Definitions
const int sensorPin = A0;
const int ledPin = 13;

// L298N Motor Driver Pins
const int ENA = 9;   // PWM-capable pin on Uno
const int IN1 = 8;
const int IN2 = 7;

// Motor speed: 0 to 255 (Keep >= 200 for submersible DC pump impellers)
const int PUMP_SPEED = 255;

// Calibrated moisture thresholds
const int DRY_THRESHOLD = 600;
const int WET_THRESHOLD = 450;

bool wateringNeeded = false;

void setup() {
  Serial.begin(9600);

  pinMode(ledPin, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  // Initial state: Pump and LED off
  stopPump();
  digitalWrite(ledPin, LOW);

  Serial.println("Automatic Irrigation System Started");
}

void loop() {
  // Average 5 sensor readings
  long total = 0;

  for (int i = 0; i < 5; i++) {
    total += analogRead(sensorPin);
    delay(20);
  }

  int reading = total / 5;

  // Hysteresis to prevent rapid switching
  if (reading > DRY_THRESHOLD) {
    wateringNeeded = true;
  }
  else if (reading < WET_THRESHOLD) {
    wateringNeeded = false;
  }

  // Update LED and Pump states
  if (wateringNeeded) {
    digitalWrite(ledPin, HIGH);
    startPump(PUMP_SPEED);
  } else {
    digitalWrite(ledPin, LOW);
    stopPump();
  }

  // Serial Monitor telemetry
  Serial.print("Soil reading: ");
  Serial.print(reading);

  Serial.print(" | Watering needed: ");
  Serial.print(wateringNeeded ? "YES" : "NO");

  Serial.print(" | Pump command: ");
  Serial.println(wateringNeeded ? "ON" : "OFF");

  delay(1000);
}

// Function to activate the pump
void startPump(int speed) {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  analogWrite(ENA, constrain(speed, 0, 255));
}

// Function to safely stop the pump
void stopPump() {
  analogWrite(ENA, 0);
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
}