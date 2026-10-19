#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_now.h>

#define WIFI_CHANNEL 11
#define SEND_FREQUENCY_HZ 100
#define LED_PIN 2

// Fixed transmitter MAC for easy receiver filtering
static const uint8_t TX_MAC[] = {0x1a, 0x00, 0x00, 0x00, 0x00, 0x00};
static const uint8_t BROADCAST_MAC[] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};

typedef struct __attribute__((packed)) {
    uint32_t seq;
    uint32_t timestamp_ms;
    uint8_t payload[32];
} kinesis_packet_t;

void setup() {
    Serial.begin(921600);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    // Initialize WiFi in STA mode
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    // Set custom MAC
    esp_wifi_set_mac(WIFI_IF_STA, TX_MAC);

    // Lock to channel
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    // Disable WiFi power saving to keep RF chain active with zero latency
    esp_wifi_set_ps(WIFI_PS_NONE);

    // Init ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[TX ERROR] ESP-NOW initialization failed!");
        return;
    }

    // Configure peer
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, BROADCAST_MAC, 6);
    peerInfo.channel = WIFI_CHANNEL;
    peerInfo.ifidx = WIFI_IF_STA;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("[TX ERROR] Failed to add peer!");
        return;
    }

    // Configure 802.11n HT20 OFDM rate (MCS0) to produce subcarriers for CSI
    esp_wifi_config_espnow_rate(WIFI_IF_STA, WIFI_PHY_RATE_MCS0_LGI);

    Serial.println("==================================================");
    Serial.println("  KINESIS Transmitter (TX) Initialized");
    Serial.printf("  Channel: %d | Target Rate: %d Hz\n", WIFI_CHANNEL, SEND_FREQUENCY_HZ);
    Serial.println("==================================================");
}

void loop() {
    static uint32_t seq = 0;
    static unsigned long last_heartbeat = 0;

    kinesis_packet_t pkt;
    pkt.seq = seq++;
    pkt.timestamp_ms = millis();
    memset(pkt.payload, 0xAA, sizeof(pkt.payload));

    esp_err_t res = esp_now_send(BROADCAST_MAC, (const uint8_t *)&pkt, sizeof(pkt));
    (void)res;

    // Heartbeat LED and Serial report every 1s
    if (millis() - last_heartbeat >= 1000) {
        last_heartbeat = millis();
        digitalWrite(LED_PIN, !digitalRead(LED_PIN));
        Serial.printf("[TX] Active: sent pkt %u (%lu ms)\n", pkt.seq, pkt.timestamp_ms);
    }

    delay(1000 / SEND_FREQUENCY_HZ);
}
