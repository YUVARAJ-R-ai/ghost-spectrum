#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <rom/ets_sys.h>

#define WIFI_CHANNEL 11
#define LED_PIN 2

// Known transmitter MAC to filter out ambient Wi-Fi packets
static const uint8_t TARGET_TX_MAC[] = {0x1a, 0x00, 0x00, 0x00, 0x00, 0x00};

static volatile uint32_t s_packet_count = 0;
static volatile unsigned long s_last_pkt_time = 0;

static void IRAM_ATTR wifi_csi_rx_cb(void *ctx, wifi_csi_info_t *info) {
    if (!info || !info->buf || info->len == 0) {
        return;
    }

    // Filter packets from our transmitter MAC
    if (memcmp(info->mac, TARGET_TX_MAC, 6) != 0) {
        return;
    }

    const wifi_pkt_rx_ctrl_t *rx = &info->rx_ctrl;
    uint32_t seq = ++s_packet_count;
    s_last_pkt_time = millis();

    // Print CSV header on very first packet
    if (seq == 1) {
        ets_printf("type,seq,mac,rssi,rate,channel,noise_floor,timestamp,sig_len,len,first_word,data\n");
    }

    // Output metadata
    ets_printf("CSI_DATA,%u,%02x:%02x:%02x:%02x:%02x:%02x,%d,%d,%d,%d,%u,%u,%d,%d,\"[",
               seq,
               info->mac[0], info->mac[1], info->mac[2],
               info->mac[3], info->mac[4], info->mac[5],
               rx->rssi, rx->rate, rx->channel, rx->noise_floor,
               (uint32_t)rx->timestamp, (uint32_t)rx->sig_len,
               info->len, (int)info->first_word_invalid);

    // Output subcarrier IQ array
    ets_printf("%d", info->buf[0]);
    for (int i = 1; i < info->len; i++) {
        ets_printf(",%d", info->buf[i]);
    }
    ets_printf("]\"\n");
}

void setup() {
    Serial.begin(921600);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    // Initialize Wi-Fi in STA mode
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    // Disable power save to keep RF synthesizer locked
    esp_wifi_set_ps(WIFI_PS_NONE);

    // Set channel
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);

    // Register CSI callback
    ESP_ERROR_CHECK(esp_wifi_set_csi_rx_cb(&wifi_csi_rx_cb, NULL));

    // Configure CSI parameters
    wifi_csi_config_t csi_config = {
        .lltf_en = true,
        .htltf_en = true,
        .stbc_htltf2_en = true,
        .ltf_merge_en = true,
        .channel_filter_en = false,
        .manu_scale = false,
        .shift = false,
    };
    ESP_ERROR_CHECK(esp_wifi_set_csi_config(&csi_config));

    // Enable CSI acquisition
    ESP_ERROR_CHECK(esp_wifi_set_csi(true));

    Serial.println("==================================================");
    Serial.println("  KINESIS Receiver (RX) Active");
    Serial.printf("  Listening on Channel %d (921600 baud)\n", WIFI_CHANNEL);
    Serial.println("==================================================");
}

void loop() {
    static uint32_t last_report_count = 0;
    static unsigned long last_report_time = 0;

    // Heartbeat & status report once per second
    if (millis() - last_report_time >= 1000) {
        last_report_time = millis();
        uint32_t current_count = s_packet_count;
        uint32_t rate = current_count - last_report_count;
        last_report_count = current_count;

        if (rate > 0) {
            digitalWrite(LED_PIN, !digitalRead(LED_PIN));
        } else {
            digitalWrite(LED_PIN, LOW);
        }
    }

    delay(50);
}
