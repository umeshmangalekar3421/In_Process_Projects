use ffmpeg_next as ffmpeg;
use ffmpeg::format::Pixel;
use ffmpeg::software::scaling;

pub struct HwDecoder {
    decoder: ffmpeg::decoder::Video,
    scaler: scaling::Context,
}

impl HwDecoder {
    pub fn new() -> Self {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
        let codec = ffmpeg::decoder::find(ffmpeg::codec::Id::H264).expect("H264 decoder not found");
        let dec = codec.decoder().video().expect("Failed to build video decoder");
        
        let scaler = scaling::Context::get(
            Pixel::YUV420P, 1920, 1080,
            Pixel::RGBA, 1920, 1080,
            scaling::Flags::BILINEAR,
        ).expect("Failed to initialize FFmpeg scaler context");

        Self { decoder: dec, scaler }
    }

    pub fn decode(&mut self, data: &[u8], ts: u64) -> Option<Vec<u8>> {
        let mut pkt = ffmpeg::Packet::copy(data);
        pkt.set_pts(ts as i64);
        
        if self.decoder.send_packet(&pkt).is_err() {
            return None;
        }

        let mut frame = ffmpeg::frame::Video::empty();
        if self.decoder.receive_frame(&mut frame).is_ok() {
            let mut rgb = ffmpeg::frame::Video::empty();
            if self.scaler.run(&frame, &mut rgb).is_ok() {
                return Some(rgb.data(0).to_vec());
            }
        }
        None
    }
}
