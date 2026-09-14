# AetherCast

PC-side AI screen studio for gamers and live creators. The phone only hardware-encodes the frame; all enhancement, 2K upscale, and streaming happen on the laptop/PC so game FPS stays intact.

## Why it beats typical mirror apps

- **No AI on the handset.** Capture uses the device encoder only (H.264/HEVC). Decode + adaptive shaders run on the PC GPU.
- **Adaptive, not a fixed LUT.** Each frame is sampled for luma/contrast; sharpen, denoise, and gamma rebalance automatically.
- **Wi‑Fi Direct / LAN and USB 3 tether** with game vs creator latency profiles.
- **No watermark.** Clean 2K output path for OBS / RTMP.
- Studio UI includes live HUD (resolution, FPS, latency class) and a lightweight **mobile sender** view.

## Run

```bash
cd aethercast
npm install
npm run dev
```

Use **Receive / capture demo** or **Webcam** to drive the PC enhancer. **Open mobile sender** shows the low-CPU capture role.
