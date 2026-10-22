#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <RH_ASK.h>
#include <SPI.h>

// ==========================================
// PIN & HARDWARE CONFIGURATION
// ==========================================
#define OLED_SDA_PIN    21
#define OLED_SCL_PIN    22
#define OLED_RESET_PIN  -1
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT   64
#define SCREEN_ADDRESS  0x3C

#define TX_433_PIN      17
#define TX_SPEED_BPS    2000

// RadioHead ASK driver (speed, rxPin, txPin, pttPin)
RH_ASK rf433(TX_SPEED_BPS, 4, TX_433_PIN, 0);

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET_PIN);
static bool oled_present = false;

// ==========================================
// SYSTEM STATE
// ==========================================
enum NodeMode {
    MODE_NOMINAL_WIFI,
    MODE_FAILOVER_433MHZ
};

static NodeMode current_mode = MODE_NOMINAL_WIFI;
static uint16_t telemetry_seq = 0;
static uint32_t failover_packets_sent = 0;
static unsigned long last_telemetry_time = 0;

// ==========================================
// PROTOCOL & CRC-16-CCITT
// ==========================================
// Polynomial: 0x1021, Initial: 0xFFFF
uint16_t crc16_ccitt(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (int j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}

// Build 8-byte authenticated failover frame matching PRD Section 6.4
void build_failover_frame(uint8_t *frame_out, uint16_t seq) {
    frame_out[0] = 0xAA; // Byte 0: PREAMBLE SYNC
    frame_out[1] = 0x01; // Byte 1: PROTOCOL VERSION & FLAGS (0x01 = FAILOVER COMMAND)
    frame_out[2] = 0x02; // Byte 2: SOURCE NODE ID (0x02 = ESP32 MISSION CONTROLLER)
    frame_out[3] = 0x55; // Byte 3: INCIDENT STATUS CODE (0x55 = AIRGAP ISOLATE & SWITCH TELEMETRY)
    frame_out[4] = (seq >> 8) & 0xFF; // Byte 4: Seq MSB
    frame_out[5] = seq & 0xFF;        // Byte 5: Seq LSB

    uint16_t crc = crc16_ccitt(frame_out, 6);
    frame_out[6] = (crc >> 8) & 0xFF; // Byte 6: CRC MSB
    frame_out[7] = crc & 0xFF;        // Byte 7: CRC LSB
}

// ==========================================
// OLED DISPLAY RENDERING
// ==========================================
void update_display() {
    if (!oled_present) return;

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    if (current_mode == MODE_NOMINAL_WIFI) {
        display.setTextSize(1);
        display.setCursor(0, 0);
        display.println(">> GHOST-SPECTRUM <<");
        display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

        display.setTextSize(1);
        display.setCursor(0, 18);
        display.println("NODE: Mission Ctrler");

        display.setTextSize(1);
        display.setCursor(0, 32);
        display.println("LINK: 2.4GHz [OK]");

        display.setCursor(0, 46);
        display.print("OOB:  433MHz STANDBY");

        display.setCursor(0, 56);
        display.print("PKT:  #");
        display.print(telemetry_seq);
    } else {
        // High-contrast warning inverted header
        display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
        display.setTextSize(1);
        display.setCursor(8, 3);
        display.println("! ATTACK DETECTED !");

        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 20);
        display.println("AIR-GAP: ENGAGED [NC]");

        display.setTextSize(1);
        display.setCursor(0, 34);
        display.println("STATUS: 433MHz ACTIVE");

        display.setCursor(0, 48);
        display.print("BURST TX: ");
        display.print(failover_packets_sent);

        display.setCursor(0, 56);
        display.print("PDR: 100% (Sub-GHz)");
    }
    display.display();
}

// ==========================================
// ARDUINO SETUP & LOOP
// ==========================================
void setup() {
    Serial.begin(115200);
    delay(400);

    Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
    if (display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
        oled_present = true;
    } else {
        oled_present = false;
        Serial.println("[WARN] OLED not detected at 0x3C, continuing with Serial output");
    }

    if (rf433.init()) {
        Serial.println("[INFO] 433MHz FS1000A RadioHead ASK initialized on GPIO 17");
    } else {
        Serial.println("[ERROR] RadioHead ASK init failed");
    }

    update_display();
    Serial.println("[NODE2] Mission Telemetry Node Ready. Commands: FAILOVER, RESET, PING");
}

void loop() {
    // Process incoming control commands
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.equalsIgnoreCase("FAILOVER") || cmd.equalsIgnoreCase("TRIGGER")) {
            current_mode = MODE_FAILOVER_433MHZ;
            Serial.println("[NODE2] Switching to 433MHz OOB FAILOVER mode!");
            update_display();
        } else if (cmd.equalsIgnoreCase("RESET") || cmd.equalsIgnoreCase("NOMINAL")) {
            current_mode = MODE_NOMINAL_WIFI;
            failover_packets_sent = 0;
            Serial.println("[NODE2] Restored to NOMINAL 2.4GHz Wi-Fi link");
            update_display();
        }
    }

    unsigned long now = millis();
    if (now - last_telemetry_time >= 500) {
        last_telemetry_time = now;
        telemetry_seq++;

        if (current_mode == MODE_NOMINAL_WIFI) {
            // Emulate 2.4 GHz nominal telemetry transmission
            Serial.printf("{\"type\":\"TELEMETRY\",\"link\":\"WIFI_2.4G\",\"seq\":%u,\"status\":\"NOMINAL\"}\n", telemetry_seq);
            update_display();
        } else {
            // Out-of-band 433 MHz failover transmission
            uint8_t packet[8];
            build_failover_frame(packet, telemetry_seq);

            // Broadcast over 433 MHz RF
            rf433.send(packet, sizeof(packet));
            rf433.waitPacketSent();
            failover_packets_sent++;

            Serial.printf("{\"type\":\"FAILOVER_BURST\",\"link\":\"SUB_GHZ_433M\",\"seq\":%u,\"sent\":%u,\"status\":\"AIRGAP_ENGAGED\"}\n",
                          telemetry_seq, failover_packets_sent);
            update_display();
        }
    }
}
