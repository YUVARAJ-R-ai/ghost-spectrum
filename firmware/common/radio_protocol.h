#ifndef RADIO_PROTOCOL_H
#define RADIO_PROTOCOL_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define RADIO_FRAME_LEN         16
#define RADIO_MAGIC             0xA5
#define RADIO_VERSION           0x02
#define RADIO_TYPE_TELEMETRY    0x0A

#define RADIO_FLAG_MODE_RADIO   (1 << 0)  // Bit 0: 1 = radio mode, 0 = Wi-Fi mode
#define RADIO_FLAG_WIFI_CONN    (1 << 1)  // Bit 1: 1 = Node A Wi-Fi is connected

typedef enum {
    RADIO_OK = 0,
    RADIO_ERR_LENGTH,
    RADIO_ERR_MAGIC,
    RADIO_ERR_VERSION,
    RADIO_ERR_TYPE,
    RADIO_ERR_CRC
} RadioDecodeStatus;

typedef struct {
    uint8_t  magic;             // Byte 0: 0xA5
    uint8_t  version;           // Byte 1: 0x02
    uint8_t  type;              // Byte 2: 0x0A
    uint8_t  flags;             // Byte 3: bit 0 = mode (1:radio, 0:wifi), bit 1 = wifi connected
    uint16_t seq;               // Bytes 4-5: sequence number (big-endian)
    uint16_t sensor;            // Bytes 6-7: sensor reading (big-endian)
    int8_t   rssi;              // Byte 8: signed 8-bit RSSI
    uint8_t  loss_pct;          // Byte 9: loss percentage (0-100)
    uint16_t rtt_ms;            // Bytes 10-11: RTT in ms (big-endian)
    uint8_t  disconnect_reason; // Byte 12: last Wi-Fi disconnect reason code
    uint8_t  wifi_channel;      // Byte 13: Wi-Fi channel
    uint16_t crc;               // Bytes 14-15: CRC16-CCITT over bytes 0-13 (big-endian)
} RadioFrame;

/**
 * CRC16-CCITT implementation (Poly: 0x1021, Init: 0xFFFF).
 * Matches existing Node A and Node B implementations.
 */
static inline uint16_t radio_crc16_ccitt(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (int j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : (crc << 1);
        }
    }
    return crc;
}

/**
 * Serializes a RadioFrame into a 16-byte wire buffer with big-endian fields and CRC16.
 */
static inline void radio_pack_frame(const RadioFrame *rf, uint8_t out[RADIO_FRAME_LEN]) {
    out[0] = RADIO_MAGIC;
    out[1] = RADIO_VERSION;
    out[2] = RADIO_TYPE_TELEMETRY;
    out[3] = rf->flags;
    out[4] = (uint8_t)(rf->seq >> 8);
    out[5] = (uint8_t)(rf->seq & 0xFF);
    out[6] = (uint8_t)(rf->sensor >> 8);
    out[7] = (uint8_t)(rf->sensor & 0xFF);
    out[8] = (uint8_t)rf->rssi;
    out[9] = rf->loss_pct;
    out[10] = (uint8_t)(rf->rtt_ms >> 8);
    out[11] = (uint8_t)(rf->rtt_ms & 0xFF);
    out[12] = rf->disconnect_reason;
    out[13] = rf->wifi_channel;
    uint16_t crc = radio_crc16_ccitt(out, 14);
    out[14] = (uint8_t)(crc >> 8);
    out[15] = (uint8_t)(crc & 0xFF);
}

/**
 * Validates wire buffer length and header, verifies CRC16-CCITT,
 * and if valid, unpacks the 16-byte buffer into a RadioFrame structure.
 * 
 * CRITICAL SAFETY: Verifies len == 16 before accessing byte indices beyond 0.
 */
static inline RadioDecodeStatus radio_unpack_frame(const uint8_t *buf, size_t len, RadioFrame *rf) {
    if (buf == NULL || len != RADIO_FRAME_LEN) {
        return RADIO_ERR_LENGTH;
    }
    if (buf[0] != RADIO_MAGIC) {
        return RADIO_ERR_MAGIC;
    }
    if (buf[1] != RADIO_VERSION) {
        return RADIO_ERR_VERSION;
    }
    if (buf[2] != RADIO_TYPE_TELEMETRY) {
        return RADIO_ERR_TYPE;
    }
    uint16_t expected_crc = ((uint16_t)buf[14] << 8) | (uint16_t)buf[15];
    uint16_t computed_crc = radio_crc16_ccitt(buf, 14);
    if (expected_crc != computed_crc) {
        return RADIO_ERR_CRC;
    }
    if (rf != NULL) {
        rf->magic = buf[0];
        rf->version = buf[1];
        rf->type = buf[2];
        rf->flags = buf[3];
        rf->seq = ((uint16_t)buf[4] << 8) | (uint16_t)buf[5];
        rf->sensor = ((uint16_t)buf[6] << 8) | (uint16_t)buf[7];
        rf->rssi = (int8_t)buf[8];
        rf->loss_pct = buf[9];
        rf->rtt_ms = ((uint16_t)buf[10] << 8) | (uint16_t)buf[11];
        rf->disconnect_reason = buf[12];
        rf->wifi_channel = buf[13];
        rf->crc = expected_crc;
    }
    return RADIO_OK;
}

#ifdef __cplusplus
}
#endif

#endif // RADIO_PROTOCOL_H
