mod net;
mod decoder;
mod audio;
mod gpu;

use anyhow::Result;
use winit::event_loop::EventLoop;
use winit::window::WindowBuilder;

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    log::info!("Starting AetherCast Desktop Application...");

    let event_loop = EventLoop::new()?;
    let window = WindowBuilder::new()
        .with_title("AetherCast — Low Latency 2K AI Mirroring")
        .with_inner_size(winit::dpi::LogicalSize::new(1280, 720))
        .build(&event_loop)?;
    
    let (video_tx, video_rx) = tokio::sync::mpsc::channel(60);
    let (audio_tx, audio_rx) = tokio::sync::mpsc::channel(120);
    
    tokio::spawn(net::run_receiver("0.0.0.0:5900", video_tx, audio_tx));
    tokio::spawn(audio::run_audio_sink(audio_rx));
    
    gpu::run_render_loop(window, event_loop, video_rx).await?;
    Ok(())
}
