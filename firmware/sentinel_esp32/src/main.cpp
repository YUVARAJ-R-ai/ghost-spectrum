#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

// =========================================================================
// GHOST-SPECTRUM // HARDENED SENTINEL FIRMWARE (ESP32-WROOM-32)
// High-Speed Promiscuous L2 Wi-Fi Sniffer + NRF24 125-Ch RPD Carrier Sweeper
// Zero-Allocation Interrupt Handlers, Spinlock Protection & WDT Resilience
// =========================================================================

// Pin Definitions for VSPI NRF24L01+
#define NRF_CE_PIN    4
#define NRF_CSN_PIN   5
#define NRF_SCK_PIN   18
#define NRF_MISO_PIN  19
#define NRF_MOSI_PIN  23

// NRF24L01+ Registers & SPI Commands
#define NRF_CMD_R_REGISTER    0x00
#define NRF_CMD_W_REGISTER    0x20
#define NRF_CMD_FLUSH_RX      0xE2
#define NRF_REG_CONFIG        0x00
#define NRF_REG_EN_AA         0x01
#define NRF_REG_EN_RXADDR     0x02
#define NRF_REG_RF_CH         0x05
#define NRF_REG_RF_SETUP      0x06
#define NRF_REG_STATUS        0x07
#define NRF_REG_RPD           0x09

// Telemetry & Timing Configuration
#define TELEMETRY_INTERVAL_MS 200
#define MAX_TRACKED_MACS      32
#define SERIAL_BAUD_RATE      921600

// Thread-safe spinlock for Core 0 (Sniffer ISR) to Core 1 (Telemetry) sharing
static portMUX_TYPE synchMux = portMUX_INITIALIZER_UNLOCKED;

// Frame counts within active sliding window
static volatile uint32_t deauth_count = 0;
static volatile uint32_t disassoc_count = 0;
static volatile uint32_t beacon_count = 0;
static volatile uint32_t data_count = 0;
static volatile uint32_t total_frames = 0;

// Raw MAC Tracking buffer (Stored as raw bytes to avoid snprintf in ISR)
static uint8_t tracked_macs[MAX_TRACKED_MACS][6];
static volatile uint8_t tracked_mac_count = 0;
static uint8_t last_target_bssid_raw[6] = {0, 0, 0, 0, 0, 0};

// NRF24 State & Energy Bins (125 Channels: 2.400 GHz - 2.524 GHz)
static bool nrf_hardware_present = false;
static uint8_t nrf_energy_bins[125];

// Operating Channels
static uint8_t current_wifi_channel = 6;
static uint32_t telemetry_seq = 0;
static unsigned long last_telemetry_time = 0;

// Reusable static JSON buffer in DRAM (Prevents stack overflow on loop task)
static StaticJsonDocument<2560> jsonDoc;

// Hardware SPI Interface
static SPIClass vspi(VSPI);

// =========================================================================
// LOW-LEVEL NRF24 HARDWARE SPI DRIVER WITH TIMEOUT & VALIDATION
// =========================================================================
static inline uint8_t nrf_read_reg(uint8_t reg) {
    digitalWrite(NRF_CSN_PIN, LOW);
    vspi.transfer(NRF_CMD_R_REGISTER | (reg & 0x1F));
    uint8_t val = vspi.transfer(0x00);
    digitalWrite(NRF_CSN_PIN, HIGH);
    return val;
}

static inline void nrf_write_reg(uint8_t reg, uint8_t val) {
    digitalWrite(NRF_CSN_PIN, LOW);
    vspi.transfer(NRF_CMD_W_REGISTER | (reg & 0x1F));
    vspi.transfer(val);
    digitalWrite(NRF_CSN_PIN, HIGH);
}

static bool nrf_check_connection() {
    // Write test channel and read back to verify physical bus integrity
    nrf_write_reg(NRF_REG_RF_CH, 42);
    uint8_t ch = nrf_read_reg(NRF_REG_RF_CH);
    if (ch != 42) return false;

    nrf_write_reg(NRF_REG_RF_CH, 84);
    ch = nrf_read_reg(NRF_REG_RF_CH);
    return (ch == 84);
}

static void nrf_init() {
    pinMode(NRF_CE_PIN, OUTPUT);
    pinMode(NRF_CSN_PIN, OUTPUT);
    digitalWrite(NRF_CE_PIN, LOW);
    digitalWrite(NRF_CSN_PIN, HIGH);

    vspi.begin(NRF_SCK_PIN, NRF_MISO_PIN, NRF_MOSI_PIN, NRF_CSN_PIN);
    vspi.setFrequency(8000000); // 8MHz SPI clock
    delay(30);

    nrf_hardware_present = nrf_check_connection();

    if (nrf_hardware_present) {
        // Disable Auto-Acknowledgement for raw spectrum carrier detection
        nrf_write_reg(NRF_REG_EN_AA, 0x00);
        // Enable RX Pipe 0
        nrf_write_reg(NRF_REG_EN_RXADDR, 0x01);
        // Set RF Data Rate: 1 Mbps, Output Power: 0 dBm (Highest RX Sensitivity)
        nrf_write_reg(NRF_REG_RF_SETUP, 0x06);
        // PWR_UP = 1, PRIM_RX = 1, CRC disabled for continuous carrier sense
        nrf_write_reg(NRF_REG_CONFIG, 0x03);
    }
}

static void nrf_sweep_125_channels() {
    if (!nrf_hardware_present) {
        // Retry connection every sweep in case module was reconnected
        if (nrf_check_connection()) {
            nrf_init();
        } else {
            memset(nrf_energy_bins, 0, sizeof(nrf_energy_bins));
            return;
        }
    }

    for (uint8_t ch = 0; ch < 125; ch++) {
        digitalWrite(NRF_CE_PIN, LOW);
        nrf_write_reg(NRF_REG_RF_CH, ch);
        digitalWrite(NRF_CE_PIN, HIGH);
        
        // Settling time for carrier detection filter
        delayMicroseconds(135);

        // Read RPD (Received Power Detector, bit 0 is asserted if carrier > -64 dBm)
        uint8_t rpd = nrf_read_reg(NRF_REG_RPD);
        nrf_energy_bins[ch] = (rpd & 0x01);

        digitalWrite(NRF_CE_PIN, LOW);
    }

    // Safety sanity check: If all 125 channels read 1, bus is floating/disconnected!
    uint32_t active_count = 0;
    for (int i = 0; i < 125; i++) {
        if (nrf_energy_bins[i]) active_count++;
    }
    if (active_count == 125) {
        // Verify if module is actually alive or bus disconnected
        if (!nrf_check_connection()) {
            nrf_hardware_present = false;
            memset(nrf_energy_bins, 0, sizeof(nrf_energy_bins));
        }
    }
}

// =========================================================================
// SHANNON SPECTRAL ENTROPY CALCULATION (NORMALIZED TO [0.0, 1.0])
// =========================================================================
static float calculate_spectral_entropy() {
    uint32_t sum_energy = 0;
    for (int i = 0; i < 125; i++) {
        sum_energy += nrf_energy_bins[i];
    }

    if (sum_energy == 0) return 0.0f;

    float entropy = 0.0f;
    for (int i = 0; i < 125; i++) {
        if (nrf_energy_bins[i] > 0) {
            float p_i = (float)nrf_energy_bins[i] / (float)sum_energy;
            entropy -= p_i * (logf(p_i) / logf(2.0f));
        }
    }
    // Normalize by log2(125) = 6.965784
    return min(1.0f, max(0.0f, entropy / 6.965784f));
}

// =========================================================================
// HIGH-SPEED 802.11 PROMISCUOUS PACKET SNIFFER (ZERO-ALLOCATION ISR)
// =========================================================================
static void IRAM_ATTR wifi_promiscuous_rx(void *buf, wifi_promiscuous_pkt_type_t type) {
    wifi_promiscuous_pkt_t *pkt = (wifi_promiscuous_pkt_t *)buf;
    uint16_t len = pkt->rx_ctrl.sig_len;
    if (len < 24) return; // Discard invalid or truncated fragments

    uint8_t *payload = pkt->payload;
    uint16_t frame_ctrl = payload[0] | (payload[1] << 8);

    uint8_t frame_type    = (frame_ctrl & 0x000C) >> 2;
    uint8_t frame_subtype = (frame_ctrl & 0x00F0) >> 4;

    portENTER_CRITICAL_ISR(&synchMux);
    total_frames++;

    if (frame_type == 0x00) { // Management Frame
        if (frame_subtype == 0x0C) { // Deauthentication (0x00C0)
            deauth_count++;
            // Capture source MAC and target BSSID directly without snprintf
            const uint8_t *src_mac = &payload[10];
            bool found = false;
            for (uint8_t i = 0; i < tracked_mac_count; i++) {
                if (memcmp(tracked_macs[i], src_mac, 6) == 0) {
                    found = true;
                    break;
                }
            }
            if (!found && tracked_mac_count < MAX_TRACKED_MACS) {
                memcpy(tracked_macs[tracked_mac_count], src_mac, 6);
                tracked_mac_count++;
            }
            memcpy(last_target_bssid_raw, &payload[16], 6);
        } else if (frame_subtype == 0x0A) { // Disassociation (0x00A0)
            disassoc_count++;
        } else if (frame_subtype == 0x08) { // Beacon (0x0080)
            beacon_count++;
        }
    } else if (frame_type == 0x02) { // Data Frame
        data_count++;
    }
    portEXIT_CRITICAL_ISR(&synchMux);
}

// =========================================================================
// SETUP & INITIALIZATION
// =========================================================================
void setup() {
    // Expand hardware UART TX FIFO to 4096 bytes to prevent blocking at 921600 baud
    Serial.setTxBufferSize(4096);
    Serial.begin(SERIAL_BAUD_RATE);
    delay(400);

    // Initialize SPI and NRF24 carrier sweeper
    nrf_init();

    // Initialize ESP32 Wi-Fi in Promiscuous Sniffer mode
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);
    esp_wifi_set_storage(WIFI_STORAGE_RAM);
    esp_wifi_set_mode(WIFI_MODE_NULL);
    esp_wifi_start();

    esp_wifi_set_promiscuous(true);
    esp_wifi_set_promiscuous_rx_cb(&wifi_promiscuous_rx);
    esp_wifi_set_channel(current_wifi_channel, WIFI_SECOND_CHAN_NONE);

    // Initial startup confirmation
    jsonDoc.clear();
    jsonDoc["node"] = "SENTINEL";
    jsonDoc["status"] = "ONLINE";
    jsonDoc["baud"] = SERIAL_BAUD_RATE;
    jsonDoc["nrf_present"] = nrf_hardware_present;
    jsonDoc["channel"] = current_wifi_channel;
    serializeJson(jsonDoc, Serial);
    Serial.println();
}

// =========================================================================
// MAIN PROCESSING LOOP (CORE 1)
// =========================================================================
void loop() {
    // Process incoming control commands from Edge Agent
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.startsWith("CH:")) {
            int new_ch = cmd.substring(3).toInt();
            if (new_ch >= 1 && new_ch <= 13) {
                current_wifi_channel = (uint8_t)new_ch;
                esp_wifi_set_channel(current_wifi_channel, WIFI_SECOND_CHAN_NONE);
            }
        } else if (cmd.equalsIgnoreCase("PING")) {
            Serial.printf("{\"node\":\"SENTINEL\",\"status\":\"PONG\",\"ch\":%u,\"nrf\":%s}\n",
                          current_wifi_channel, nrf_hardware_present ? "true" : "false");
        }
    }

    unsigned long now = millis();
    if (now - last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_time = now;
        telemetry_seq++;

        // 1. Copy atomic snapshot of frame counters under spinlock protection
        uint32_t snap_deauth, snap_disassoc, snap_beacon, snap_data;
        uint8_t snap_unique_macs;
        uint8_t snap_bssid[6];

        portENTER_CRITICAL(&synchMux);
        snap_deauth = deauth_count;
        snap_disassoc = disassoc_count;
        snap_beacon = beacon_count;
        snap_data = data_count;
        snap_unique_macs = tracked_mac_count;
        memcpy(snap_bssid, last_target_bssid_raw, 6);

        // Reset counters for next window
        deauth_count = 0;
        disassoc_count = 0;
        beacon_count = 0;
        data_count = 0;
        tracked_mac_count = 0;
        portEXIT_CRITICAL(&synchMux);

        // 2. Format BSSID string in loop task (outside ISR)
        char bssid_str[18];
        snprintf(bssid_str, sizeof(bssid_str), "%02X:%02X:%02X:%02X:%02X:%02X",
                 snap_bssid[0], snap_bssid[1], snap_bssid[2],
                 snap_bssid[3], snap_bssid[4], snap_bssid[5]);

        // 3. Perform 125-channel RF carrier energy sweep
        nrf_sweep_125_channels();
        float spectral_entropy = calculate_spectral_entropy();

        uint32_t active_bins = 0;
        for (int i = 0; i < 125; i++) {
            if (nrf_energy_bins[i] > 0) active_bins++;
        }
        float energy_ratio = (float)active_bins / 125.0f;

        // 4. Construct JSON payload using pre-allocated static document
        jsonDoc.clear();
        jsonDoc["seq"] = telemetry_seq;
        jsonDoc["timestamp_ms"] = now;
        jsonDoc["channel"] = current_wifi_channel;
        jsonDoc["deauth_count"] = snap_deauth;
        jsonDoc["disassoc_count"] = snap_disassoc;
        jsonDoc["beacon_count"] = snap_beacon;
        jsonDoc["data_count"] = snap_data;
        jsonDoc["target_bssid"] = bssid_str;
        jsonDoc["unique_source_macs"] = snap_unique_macs;
        jsonDoc["nrf_energy_ratio"] = roundf(energy_ratio * 1000.0f) / 1000.0f;
        jsonDoc["spectral_entropy"] = roundf(spectral_entropy * 1000.0f) / 1000.0f;
        jsonDoc["nrf_present"] = nrf_hardware_present;

        JsonArray bins = jsonDoc.createNestedArray("nrf_bins");
        for (int i = 0; i < 125; i++) {
            bins.add(nrf_energy_bins[i]);
        }

        // 5. Stream JSON over UART
        serializeJson(jsonDoc, Serial);
        Serial.println();
    }

    // Yield CPU to FreeRTOS watchdog / idle task
    vTaskDelay(1);
}
