"""Host protocol verification test in Python matching the C implementation."""
import struct
import unittest

RADIO_FRAME_LEN = 16
RADIO_MAGIC = 0xA5
RADIO_VERSION = 0x02
RADIO_TYPE_TELEMETRY = 0x0A

RADIO_FLAG_MODE_RADIO = 1 << 0
RADIO_FLAG_WIFI_CONN  = 1 << 1


def crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= (b << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def pack_frame(seq, sensor, rssi, loss_pct, rtt_ms, disconnect_reason, wifi_channel, flags):
    body = struct.pack(
        ">BBBBHHbBHH",
        RADIO_MAGIC,
        RADIO_VERSION,
        RADIO_TYPE_TELEMETRY,
        flags,
        seq,
        sensor,
        rssi,
        loss_pct,
        rtt_ms,
        (disconnect_reason << 8) | wifi_channel,
    )
    # The last 2 bytes are reason and channel
    # struct pack:
    # 0: magic (1)
    # 1: version (1)
    # 2: type (1)
    # 3: flags (1)
    # 4-5: seq (2)
    # 6-7: sensor (2)
    # 8: rssi (1)
    # 9: loss (1)
    # 10-11: rtt (2)
    # 12: reason (1)
    # 13: ch (1)
    # 14-15: crc (2)
    raw = bytearray(16)
    raw[0] = RADIO_MAGIC
    raw[1] = RADIO_VERSION
    raw[2] = RADIO_TYPE_TELEMETRY
    raw[3] = flags
    raw[4] = (seq >> 8) & 0xFF
    raw[5] = seq & 0xFF
    raw[6] = (sensor >> 8) & 0xFF
    raw[7] = sensor & 0xFF
    raw[8] = rssi & 0xFF
    raw[9] = loss_pct & 0xFF
    raw[10] = (rtt_ms >> 8) & 0xFF
    raw[11] = rtt_ms & 0xFF
    raw[12] = disconnect_reason & 0xFF
    raw[13] = wifi_channel & 0xFF
    crc = crc16_ccitt(bytes(raw[:14]))
    raw[14] = (crc >> 8) & 0xFF
    raw[15] = crc & 0xFF
    return bytes(raw)


def unpack_frame(buf: bytes):
    if len(buf) != RADIO_FRAME_LEN:
        raise ValueError("Invalid length")
    if buf[0] != RADIO_MAGIC or buf[1] != RADIO_VERSION or buf[2] != RADIO_TYPE_TELEMETRY:
        raise ValueError("Invalid header")
    expected_crc = (buf[14] << 8) | buf[15]
    computed_crc = crc16_ccitt(buf[:14])
    if expected_crc != computed_crc:
        raise ValueError("CRC mismatch")
    
    rssi = buf[8]
    if rssi > 127:
        rssi -= 256
    
    return {
        "magic": buf[0],
        "version": buf[1],
        "type": buf[2],
        "flags": buf[3],
        "mode": "radio" if (buf[3] & RADIO_FLAG_MODE_RADIO) else "wifi",
        "connected": 1 if (buf[3] & RADIO_FLAG_WIFI_CONN) else 0,
        "seq": (buf[4] << 8) | buf[5],
        "sensor": (buf[6] << 8) | buf[7],
        "rssi": rssi,
        "loss": buf[9],
        "rtt": (buf[10] << 8) | buf[11],
        "reason": buf[12],
        "ch": buf[13],
        "crc": expected_crc,
    }


class TestRadioProtocol(unittest.TestCase):
    def test_crc16(self):
        self.assertEqual(crc16_ccitt(b"123456789"), 0x29B1)

    def test_roundtrip(self):
        frame = pack_frame(
            seq=1234,
            sensor=3200,
            rssi=-75,
            loss_pct=5,
            rtt_ms=38,
            disconnect_reason=201,
            wifi_channel=11,
            flags=RADIO_FLAG_MODE_RADIO | RADIO_FLAG_WIFI_CONN,
        )
        self.assertEqual(len(frame), 16)
        res = unpack_frame(frame)
        self.assertEqual(res["seq"], 1234)
        self.assertEqual(res["sensor"], 3200)
        self.assertEqual(res["rssi"], -75)
        self.assertEqual(res["loss"], 5)
        self.assertEqual(res["rtt"], 38)
        self.assertEqual(res["reason"], 201)
        self.assertEqual(res["ch"], 11)
        self.assertEqual(res["mode"], "radio")
        self.assertEqual(res["connected"], 1)

    def test_length_validation(self):
        with self.assertRaises(ValueError):
            unpack_frame(b"\xA5\x02\x0A")

    def test_crc_error(self):
        frame = bytearray(pack_frame(1, 100, -50, 0, 10, 0, 1, 0))
        frame[7] ^= 0x01  # Corrupt sensor byte
        with self.assertRaises(ValueError):
            unpack_frame(bytes(frame))


if __name__ == "__main__":
    unittest.main()
