#include <Arduino.h>
#include <RH_ASK.h>
#include <SPI.h> // Dependency for RadioHead

// ==========================================
// PIN DEFINITIONS (Arduino Uno R3)
// ==========================================
#define RX_433_PIN      11  // XY-MK-5V Data out -> Digital Pin 11
#define RELAY_PIN       7   // 5V Relay Control -> Digital Pin 7
#define STATUS_LED_PIN  13  // Onboard LED indicator
#define RX_SPEED_BPS    2000

// RadioHead ASK driver (speed, rxPin, txPin, pttPin)
RH_ASK rf433_rx(RX_SPEED_BPS, RX_433_PIN, 12, 0);

// ==========================================
// AIR-GAP MECHANISM STATE
// ==========================================
static bool airgap_isolated = false;
static uint32_t failover_frames_received = 0;

// ==========================================
// CRC-16-CCITT VALIDATION
// ==========================================
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

void trip_airgap_relay(uint16_t seq) {
    airgap_isolated = true;
    // Per PRD Section 9: Assert Pin 7 HIGH to energize coil and snap NC contact open
    digitalWrite(RELAY_PIN, HIGH);
    digitalWrite(STATUS_LED_PIN, HIGH);

    Serial.print(F("{\"event\":\"AIRGAP_TRIPPED\",\"status\":\"ISOLATED\",\"seq\":"));
    Serial.print(seq);
    Serial.print(F(",\"rx_count\":"));
    Serial.print(failover_frames_received);
    Serial.println(F(",\"action\":\"RELAY_OPEN_CIRCUIT\"}"));
}

void reset_airgap_relay() {
    airgap_isolated = false;
    // De-energize coil: relay contacts return to Normally Closed (NC) nominal path
    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(STATUS_LED_PIN, LOW);

    Serial.println(F("{\"event\":\"AIRGAP_RESET\",\"status\":\"NOMINAL_CLOSED\",\"action\":\"CIRCUIT_RESTORED\"}"));
}

void setup() {
    Serial.begin(115200);
    
    pinMode(RELAY_PIN, OUTPUT);
    pinMode(STATUS_LED_PIN, OUTPUT);
    
    // Initial state: Nominal circuit connected (Coil unpowered)
    reset_airgap_relay();

    if (rf433_rx.init()) {
        Serial.println(F("[AIRGAP_NODE] RadioHead 433MHz ASK Receiver Initialized on Pin 11"));
    } else {
        Serial.println(F("[AIRGAP_NODE] RadioHead ASK Receiver init failed"));
    }

    Serial.println(F("[AIRGAP_NODE] Online. Ready for 433MHz failover packet or Serial TRIP/RESET."));
}

void loop() {
    // Check for direct serial commands for manual bench testing
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.equalsIgnoreCase("TRIP") || cmd.equalsIgnoreCase("ISOLATE")) {
            trip_airgap_relay(9999);
        } else if (cmd.equalsIgnoreCase("RESET") || cmd.equalsIgnoreCase("RESTORE")) {
            reset_airgap_relay();
        } else if (cmd.equalsIgnoreCase("STATUS")) {
            Serial.print(F("{\"status\":\""));
            Serial.print(airgap_isolated ? "ISOLATED" : "NOMINAL");
            Serial.print(F("\",\"rx_count\":"));
            Serial.print(failover_frames_received);
            Serial.println(F("}"));
        }
    }

    // Check for incoming 433 MHz RF packet
    uint8_t buf[RH_ASK_MAX_MESSAGE_LEN];
    uint8_t buflen = sizeof(buf);

    if (rf433_rx.recv(buf, &buflen)) {
        // Strict 8-byte frame validation per PRD Section 6.4
        if (buflen == 8) {
            uint8_t preamble   = buf[0];
            uint8_t version    = buf[1];
            uint8_t src_node   = buf[2];
            uint8_t status_code= buf[3];
            uint16_t seq       = ((uint16_t)buf[4] << 8) | buf[5];
            uint16_t rx_crc    = ((uint16_t)buf[6] << 8) | buf[7];

            uint16_t calc_crc = crc16_ccitt(buf, 6);

            // Authenticate fields
            if (preamble == 0xAA && version == 0x01 && src_node == 0x02 && status_code == 0x55 && rx_crc == calc_crc) {
                failover_frames_received++;
                if (!airgap_isolated) {
                    trip_airgap_relay(seq);
                }
            } else {
                Serial.println(F("[AIRGAP_NODE] Invalid checksum or unauthorized 433MHz frame rejected"));
            }
        }
    }
}
