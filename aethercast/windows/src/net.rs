use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct Frame {
    pub seq: u32,
    pub ts_ns: u64,
    pub data: Vec<u8>,
    pub is_audio: bool,
    pub is_key: bool,
}

pub async fn run_receiver(addr: &str, v_tx: mpsc::Sender<Frame>, a_tx: mpsc::Sender<Frame>) {
    let sock = UdpSocket::bind(addr).await.expect("Failed to bind UDP socket");
    log::info!("AetherCast UDP Receiver listening on {}", addr);
    let mut buf = [0u8; 65536];
    let start = Instant::now();

    loop {
        let (len, _) = match sock.recv_from(&mut buf).await {
            Ok(res) => res,
            Err(e) => {
                log::error!("UDP receive error: {}", e);
                continue;
            }
        };

        if len < 20 {
            continue;
        }

        let h = &buf[..20];
        let magic = u16::from_le_bytes([h[0], h[1]]);
        if magic != 0xAEC4 {
            continue;
        }

        let flags = h[3];
        let seq = u32::from_le_bytes([h[4], h[5], h[6], h[7]]);
        let ts = u64::from_le_bytes([h[8], h[9], h[10], h[11], h[12], h[13], h[14], h[15]]);
        let plen = u32::from_le_bytes([h[16], h[17], h[18], h[19]]) as usize;

        if 20 + plen > len {
            continue;
        }

        let payload = buf[20..20 + plen].to_vec();

        // Game mode late-frame drop threshold (25ms)
        let now_ns = start.elapsed().as_nanos() as u64;
        if (flags & 0x02) == 0 && now_ns.saturating_sub(ts) > 25_000_000 {
            log::warn!("Dropping late video frame seq={} latency={}ms", seq, (now_ns.saturating_sub(ts)) / 1_000_000);
            continue;
        }

        let frame = Frame {
            seq,
            ts_ns: ts,
            data: payload,
            is_audio: (flags & 0x02) != 0,
            is_key: (flags & 0x01) != 0,
        };

        if frame.is_audio {
            let _ = a_tx.send(frame).await;
        } else {
            let _ = v_tx.send(frame).await;
        }
    }
}
