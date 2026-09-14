git # AetherCast Wire Protocol v1

- **Transport**: UDP (Wi-Fi) or TCP via `adb forward` (USB)
- **Header**: 20 bytes, little-endian
  | Offset | Size | Field       | Description                          |
  |--------|------|-------------|--------------------------------------|
  | 0      | 2    | magic       | `0xAEC4`                             |
  | 2      | 1    | version     | `0x01`                               |
  | 3      | 1    | flags       | `0x01`=key, `0x02`=audio, `0x04`=control |
  | 4      | 4    | seq         | Monotonic packet counter             |
  | 8      | 8    | timestamp   | Capture clock (nanoseconds)          |
  | 16     | 4    | payload_len | Bytes following header               |
- **Video**: H.264 Baseline/High, CBR, GOP=1s, Annex-B NALUs
- **Audio**: AAC-LC, 48kHz stereo, ~20ms frames, ADTS stripped
- **Control**: JSON string in payload (rotation, preset, ping, disconnect)
- **Sync**: All PTS from `SystemClock.elapsedRealtimeNanos()`
- **Late Frame Policy**: Game mode drops if `now - ts > 25ms`
- **Security**: LAN-only, pairing token in control handshake, no cloud
