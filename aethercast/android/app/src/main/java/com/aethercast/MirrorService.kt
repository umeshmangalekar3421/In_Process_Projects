package com.aethercast

import android.app.*
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.*
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.view.Display
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import java.net.DatagramSocket
import java.net.InetAddress

class MirrorService : Service() {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var videoEncoder: MediaCodec? = null
    private var audioCapture: AudioCapture? = null
    private var packetizer: Packetizer? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") {
            stopSelf()
            return START_NOT_STICKY
        }

        val data = intent?.getParcelableExtra<Intent>("projection") ?: return START_NOT_STICKY
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = projectionManager.getMediaProjection(Activity.RESULT_OK, data)

        val ip = getSharedPreferences("cfg", MODE_PRIVATE).getString("pc_ip", "127.0.0.1")!!
        packetizer = Packetizer(DatagramSocket(), InetAddress.getByName(ip), 5900)

        startForeground(1, buildNotification())
        setupDisplayAndEncoder()

        audioCapture = AudioCapture(packetizer!!)
        audioCapture?.start()

        return START_STICKY
    }

    private fun setupDisplayAndEncoder() {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = applicationContext.resources.displayMetrics
        val w = (metrics.widthPixels).coerceAtMost(1920)
        val h = (metrics.heightPixels).coerceAtMost(1080)
        val density = metrics.densityDpi

        videoEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).apply {
            val fmt = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
                setInteger(MediaFormat.KEY_BIT_RATE, 12_000_000)
                setInteger(MediaFormat.KEY_FRAME_RATE, 60)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_LATENCY, 0)
                setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline)
            }
            configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }

        val surface = videoEncoder!!.createInputSurface()
        virtualDisplay = projection!!.createVirtualDisplay(
            "AetherCast",
            w,
            h,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            surface,
            object : VirtualDisplay.Callback() {
                override fun onResized(w: Int, h: Int) {
                    restartEncoder(w, h)
                }
            },
            null
        )

        videoEncoder!!.start()
        scope.launch { drainEncoder(videoEncoder!!) }
    }

    private suspend fun drainEncoder(codec: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        while (scope.isActive) {
            val idx = codec.dequeueOutputBuffer(info, 10000)
            if (idx >= 0) {
                val buf = codec.getOutputBuffer(idx)
                if (buf != null) {
                    val bytes = ByteArray(info.size)
                    buf.get(bytes)
                    packetizer?.send(
                        bytes,
                        info.presentationTimeUs * 1000,
                        isAudio = false,
                        isKey = (info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0
                    )
                }
                codec.releaseOutputBuffer(idx, false)
            }
        }
    }

    private fun restartEncoder(w: Int, h: Int) {
        scope.launch {
            packetizer?.sendControl("{\"type\":\"rotation\",\"w\":$w,\"h\":$h}")
            videoEncoder?.stop()
            videoEncoder?.release()
            virtualDisplay?.release()
            setupDisplayAndEncoder()
        }
    }

    private fun buildNotification(): Notification {
        val channelId = "mirror"
        val chan = NotificationChannel(channelId, "Mirroring", NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(chan)

        val stopIntent = Intent(this, MirrorService::class.java).apply { action = "STOP" }
        val pendingStop = PendingIntent.getService(this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("AetherCast Active")
            .setContentText("Screen & Audio Mirroring Running")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .addAction(android.R.drawable.ic_delete, "Stop", pendingStop)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        try { projection?.stop() } catch (_: Exception) {}
        virtualDisplay?.release()
        try { videoEncoder?.stop() } catch (_: Exception) {}
        videoEncoder?.release()
        audioCapture?.stop()
        packetizer?.close()
    }
}
