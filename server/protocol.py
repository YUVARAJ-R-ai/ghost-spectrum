"""
Ghost-Spectrum Binary & Telemetry Protocol Definitions
Implements CRC-16-CCITT and 433 MHz Sub-GHz Frame Format per PRD Section 6.4
"""

import struct
from typing import Dict, Any, Optional

def crc16_ccitt(data: bytes) -> int:
    """Computes CRC-16-CCITT (Polynomial: 0x1021, Initial: 0xFFFF)"""
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc

def pack_subghz_frame(seq: int, status_code: int = 0x55) -> bytes:
    """
    Builds the 8-byte Sub-GHz Failover Frame per PRD Section 6.4:
    Byte 0: PREAMBLE SYNC (0xAA)
    Byte 1: PROTOCOL VERSION & FLAGS (0x01 = FAILOVER COMMAND)
    Byte 2: SOURCE NODE ID (0x02 = ESP32 MISSION CONTROLLER)
    Byte 3: INCIDENT STATUS CODE (0x55 = AIRGAP ISOLATE & SWITCH TELEMETRY)
    Byte 4-5: ROLLING SEQUENCE COUNTER (uint16_t big-endian)
    Byte 6-7: CRC-16-CCITT CHECKSUM
    """
    header = struct.pack(">BBBBH", 0xAA, 0x01, 0x02, status_code, seq & 0xFFFF)
    crc = crc16_ccitt(header)
    return header + struct.pack(">H", crc)

def unpack_subghz_frame(raw: bytes) -> Optional[Dict[str, Any]]:
    """Unpacks and validates an 8-byte Sub-GHz frame"""
    if len(raw) != 8:
        return None
    preamble, version, src_node, status_code, seq, rx_crc = struct.unpack(">BBBBHH", raw)
    calc_crc = crc16_ccitt(raw[:6])
    if preamble != 0xAA or rx_crc != calc_crc:
        return None
    return {
        "preamble": hex(preamble),
        "version": version,
        "src_node": src_node,
        "status_code": hex(status_code),
        "seq": seq,
        "crc_valid": True
    }
