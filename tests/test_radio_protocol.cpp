#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../firmware/common/radio_protocol.h"

// Circular window duplicate detector matching Node B's implementation
#define SEQ_WINDOW_SIZE 32

typedef struct {
    uint16_t window[SEQ_WINDOW_SIZE];
    size_t count;
    size_t head;
} SeqTracker;

void seq_tracker_init(SeqTracker *t) {
    memset(t, 0, sizeof(*t));
}

bool seq_tracker_is_duplicate(SeqTracker *t, uint16_t seq) {
    for (size_t i = 0; i < t->count; i++) {
        if (t->window[i] == seq) {
            return true;
        }
    }
    return false;
}

void seq_tracker_add(SeqTracker *t, uint16_t seq) {
    if (t->count < SEQ_WINDOW_SIZE) {
        t->window[t->count++] = seq;
    } else {
        t->window[t->head] = seq;
        t->head = (t->head + 1) % SEQ_WINDOW_SIZE;
    }
}

int main(void) {
    printf("=== Running Radio Protocol Host Unit Tests ===\n");

    // Test 1: CRC16-CCITT baseline
    {
        const uint8_t test_data[] = { '1', '2', '3', '4', '5', '6', '7', '8', '9' };
        // For standard CCITT with Poly 0x1021 and Init 0xFFFF:
        uint16_t crc = radio_crc16_ccitt(test_data, sizeof(test_data));
        printf("[TEST 1] CRC16 test vector: 0x%04X\n", crc);
        assert(crc == 0x29B1);
        printf("  -> PASS: CRC16 matches CCITT standard (0x29B1)\n");
    }

    // Test 2: Pack and unpack valid frame
    {
        RadioFrame orig;
        orig.flags = RADIO_FLAG_MODE_RADIO | RADIO_FLAG_WIFI_CONN;
        orig.seq = 1042;
        orig.sensor = 2850;
        orig.rssi = -68;
        orig.loss_pct = 15;
        orig.rtt_ms = 45;
        orig.disconnect_reason = 202; // e.g. AUTH_FAIL
        orig.wifi_channel = 6;

        uint8_t wire[RADIO_FRAME_LEN];
        radio_pack_frame(&orig, wire);

        // Verify wire fields
        assert(wire[0] == 0xA5);
        assert(wire[1] == 0x02);
        assert(wire[2] == 0x0A);
        assert(wire[3] == 0x03);
        assert(wire[4] == (1042 >> 8) && wire[5] == (1042 & 0xFF));
        assert(wire[6] == (2850 >> 8) && wire[7] == (2850 & 0xFF));
        assert((int8_t)wire[8] == -68);
        assert(wire[9] == 15);
        assert(wire[10] == 0 && wire[11] == 45);
        assert(wire[12] == 202);
        assert(wire[13] == 6);

        RadioFrame decoded;
        RadioDecodeStatus st = radio_unpack_frame(wire, sizeof(wire), &decoded);
        assert(st == RADIO_OK);
        assert(decoded.magic == 0xA5);
        assert(decoded.version == 0x02);
        assert(decoded.type == 0x0A);
        assert(decoded.flags == 0x03);
        assert(decoded.seq == 1042);
        assert(decoded.sensor == 2850);
        assert(decoded.rssi == -68);
        assert(decoded.loss_pct == 15);
        assert(decoded.rtt_ms == 45);
        assert(decoded.disconnect_reason == 202);
        assert(decoded.wifi_channel == 6);

        printf("  -> PASS: Valid frame packing and unpacking identical\n");
    }

    // Test 3: Invalid frame length
    {
        uint8_t short_buf[15] = { 0xA5, 0x02, 0x0A };
        RadioFrame decoded;
        RadioDecodeStatus st = radio_unpack_frame(short_buf, sizeof(short_buf), &decoded);
        assert(st == RADIO_ERR_LENGTH);

        uint8_t long_buf[17] = { 0xA5, 0x02, 0x0A };
        st = radio_unpack_frame(long_buf, sizeof(long_buf), &decoded);
        assert(st == RADIO_ERR_LENGTH);

        st = radio_unpack_frame(NULL, 16, &decoded);
        assert(st == RADIO_ERR_LENGTH);

        printf("  -> PASS: Length validation rejects short/long/null frames\n");
    }

    // Test 4: Header validation (magic, version, type)
    {
        RadioFrame rf = {0};
        uint8_t wire[RADIO_FRAME_LEN];
        radio_pack_frame(&rf, wire);

        // Corrupt magic
        wire[0] = 0x5A;
        assert(radio_unpack_frame(wire, 16, &rf) == RADIO_ERR_MAGIC);
        wire[0] = 0xA5;

        // Corrupt version
        wire[1] = 0x01;
        assert(radio_unpack_frame(wire, 16, &rf) == RADIO_ERR_VERSION);
        wire[1] = 0x02;

        // Corrupt type
        wire[2] = 0xFF;
        assert(radio_unpack_frame(wire, 16, &rf) == RADIO_ERR_TYPE);
        wire[2] = 0x0A;

        printf("  -> PASS: Header validation catches invalid magic, version, and type\n");
    }

    // Test 5: CRC corruption detection
    {
        RadioFrame rf = {0};
        rf.seq = 50;
        rf.sensor = 1000;
        uint8_t wire[RADIO_FRAME_LEN];
        radio_pack_frame(&rf, wire);

        // Valid frame first
        assert(radio_unpack_frame(wire, 16, &rf) == RADIO_OK);

        // Flip 1 bit in payload
        wire[6] ^= 0x01;
        assert(radio_unpack_frame(wire, 16, &rf) == RADIO_ERR_CRC);
        wire[6] ^= 0x01; // Restore

        // Flip 1 bit in CRC itself
        wire[15] ^= 0x02;
        assert(radio_unpack_frame(wire, 16, &rf) == RADIO_ERR_CRC);

        printf("  -> PASS: CRC16 detects single-bit and byte-level payload/CRC corruption\n");
    }

    // Test 6: Sequence number rollover and duplicate detection
    {
        SeqTracker tracker;
        seq_tracker_init(&tracker);

        // Sequence numbers leading to rollover
        uint16_t seqs[] = { 65534, 65535, 0, 1, 2 };
        for (int i = 0; i < 5; i++) {
            uint16_t s = seqs[i];
            assert(!seq_tracker_is_duplicate(&tracker, s));
            seq_tracker_add(&tracker, s);
        }

        // Duplicate test
        assert(seq_tracker_is_duplicate(&tracker, 65535));
        assert(seq_tracker_is_duplicate(&tracker, 0));
        assert(seq_tracker_is_duplicate(&tracker, 2));
        assert(!seq_tracker_is_duplicate(&tracker, 3));

        printf("  -> PASS: Sequence rollover (65535 -> 0) and duplicate tracking verified\n");
    }

    printf("\n>>> ALL HOST PROTOCOL TESTS PASSED <<<\n");
    return 0;
}
