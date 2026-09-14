use wgpu::*;
use winit::event_loop::EventLoop;
use winit::window::Window;
use tokio::sync::mpsc;
use crate::decoder::HwDecoder;
use crate::net::Frame;

pub async fn run_render_loop(
    window: Window,
    event_loop: EventLoop<()>,
    mut rx: mpsc::Receiver<Frame>,
) -> anyhow::Result<()> {
    let instance = Instance::new(InstanceDescriptor::default());
    let surface = instance.create_surface(&window)?;
    let adapter = instance
        .request_adapter(&RequestAdapterOptions {
            compatible_surface: Some(&surface),
            power_preference: PowerPreference::HighPerformance,
            ..Default::default()
        })
        .await
        .expect("Failed to find compatible graphics adapter");

    let (device, queue) = adapter
        .request_device(&DeviceDescriptor::default(), None)
        .await?;

    let size = window.inner_size();
    let width = if size.width > 0 { size.width } else { 2560 };
    let height = if size.height > 0 { size.height } else { 1440 };

    let config = SurfaceConfiguration {
        usage: TextureUsages::RENDER_ATTACHMENT,
        format: TextureFormat::Bgra8UnormSrgb,
        width,
        height,
        present_mode: PresentMode::Mailbox,
        alpha_mode: CompositeAlphaMode::Auto,
        view_formats: vec![],
        desired_maximum_frame_latency: 2,
    };
    surface.configure(&device, &config);

    let shader = device.create_shader_module(ShaderModuleDescriptor {
        label: Some("enhance_wgsl"),
        source: ShaderSource::Wgsl(include_str!("../shaders/enhance.wgsl").into()),
    });

    let _pipeline = device.create_compute_pipeline(&ComputePipelineDescriptor {
        label: Some("ai_enhance_pipeline"),
        layout: None,
        module: &shader,
        entry_point: "main",
        compilation_options: PipelineCompilationOptions::default(),
        cache: None,
    });

    let mut decoder = HwDecoder::new();
    let mut last_frame: Option<Vec<u8>> = None;

    log::info!("Starting AetherCast GPU render loop (Mailbox low-latency mode)...");

    event_loop.run(move |event, elwt| {
        elwt.set_control_flow(winit::event_loop::ControlFlow::Poll);

        match event {
            winit::event::Event::WindowEvent {
                event: winit::event::WindowEvent::RedrawRequested,
                ..
            } => {
                while let Ok(frame) = rx.try_recv() {
                    if let Some(rgb) = decoder.decode(&frame.data, frame.ts_ns) {
                        last_frame = Some(rgb);
                    }
                }

                if let Some(ref _pixels) = last_frame {
                    if let Ok(output) = surface.get_current_texture() {
                        let view = output.texture.create_view(&TextureViewDescriptor::default());
                        let mut encoder = device.create_command_encoder(&CommandEncoderDescriptor {
                            label: Some("Render Encoder"),
                        });

                        {
                            let _render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                                label: Some("Main Render Pass"),
                                color_attachments: &[Some(RenderPassColorAttachment {
                                    view: &view,
                                    resolve_target: None,
                                    ops: Operations {
                                        load: LoadOp::Clear(Color { r: 0.05, g: 0.05, b: 0.08, a: 1.0 }),
                                        store: StoreOp::Store,
                                    },
                                })],
                                depth_stencil_attachment: None,
                                timestamp_writes: None,
                                occlusion_query_set: None,
                            });
                        }

                        queue.submit(std::iter::once(encoder.finish()));
                        output.present();
                    }
                }
                window.request_redraw();
            }
            winit::event::Event::WindowEvent {
                event: winit::event::WindowEvent::CloseRequested,
                ..
            } => {
                elwt.exit();
            }
            _ => {}
        }
    })?;

    Ok(())
}
