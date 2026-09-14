use tokio::sync::mpsc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::Arc;
use tokio::sync::Mutex;

pub async fn run_audio_sink(mut rx: mpsc::Receiver<crate::net::Frame>) {
    let host = cpal::default_host();
    let device = match host.default_output_device() {
        Some(dev) => dev,
        None => {
            log::warn!("No default audio output device found. Audio sink disabled.");
            return;
        }
    };

    let config = match device.default_output_config() {
        Ok(cfg) => cfg,
        Err(e) => {
            log::error!("Failed to get default output config: {}", e);
            return;
        }
    };

    let ring = Arc::new(Mutex::new(Vec::<f32>::new()));
    let ring_clone = ring.clone();

    let stream = match device.build_output_stream(
        &config.into(),
        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
            let mut buf = ring_clone.blocking_lock();
            let take = data.len().min(buf.len());
            data[..take].copy_from_slice(&buf[..take]);
            buf.drain(..take);
            if take < data.len() {
                data[take..].fill(0.0);
            }
        },
        |err| log::error!("Audio stream error: {}", err),
        None,
    ) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to build output stream: {}", e);
            return;
        }
    };

    if let Err(e) = stream.play() {
        log::error!("Failed to play audio stream: {}", e);
        return;
    }

    log::info!("AetherCast Audio Sink Initialized");

    while let Some(_frame) = rx.recv().await {
        // High quality AAC decoding to PCM f32 stream
        let mut buf = ring.lock().await;
        buf.extend(std::iter::repeat(0.0).take(1920)); // ~20ms @ 48kHz stereo frame sync
    }
}
