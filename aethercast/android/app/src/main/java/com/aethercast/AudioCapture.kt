package com.aethercast

import android.annotation.SuppressLint
import android.media.*
import kotlinx.coroutines.*

class AudioCapture(private val packetizer: Packetizer) {
    private var recorder: AudioRecord? = null
    private var encoder: MediaCodec? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var running = false

    @SuppressLint("MissingPermission")
    fun start() {
        running = true
        val sampleRate = 48000
        val channelConfig = AudioFormat.CHANNEL_IN_STEREO
        val audioFormat = AudioFormat.ENCODING_PCM_16BIT
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        recorder = AudioRecord(MediaRecorder.AudioSource.REMOTE_SUBMIX, sampleRate, channelConfig, audioFormat, minBuf * 2)
        encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
            configure(MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 2).apply {
                setInteger(MediaFormat.KEY_BIT_RATE, 128000)
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            }, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            start()
        }
        scope.launch { feedEncoder() }
        scope.launch { drainAudioEncoder() }
    }

    private suspend fun feedEncoder() {
        val buf = ShortArray(2048)
        recorder?.startRecording()
        while (running && scope.isActive) {
            val read = recorder?.read(buf, 0, buf.size) ?: 0
            if (read > 0) {
                val idx = encoder?.dequeueInputBuffer(10000) ?: -1
                if (idx >= 0) {
                    val inBuf = encoder?.getInputBuffer(idx)
                    if (inBuf != null) {
                        inBuf.clear()
                        inBuf.asShortBuffer().put(buf, 0, read)
                        encoder?.queueInputBuffer(idx, 0, read * 2, System.nanoTime() / 1000, 0)
                    }
                }
            }
        }
    }

    private suspend fun drainAudioEncoder() {
        val info = MediaCodec.BufferInfo()
        while (running && scope.isActive) {
            val idx = encoder?.dequeueOutputBuffer(info, 10000) ?: -1
            if (idx >= 0) {
                val out = encoder?.getOutputBuffer(idx)
                if (out != null) {
                    val bytes = ByteArray(info.size)
                    out.get(bytes)
                    // Strip ADTS header if present (first 7 bytes matching 0xFFF)
                    val payload = if (bytes.size > 7 && bytes[0] == 0xFF.toByte() && (bytes[1].toInt() and 0xF0) == 0xF0) {
                        bytes.copyOfRange(7, bytes.size)
                    } else {
                        bytes
                    }
                    packetizer.send(payload, info.presentationTimeUs * 1000, isAudio = true, isKey = false)
                }
                encoder?.releaseOutputBuffer(idx, false)
            }
        }
    }

    fun stop() {
        running = false
        try { recorder?.stop() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
        try { encoder?.stop() } catch (_: Exception) {}
        try { encoder?.release() } catch (_: Exception) {}
        scope.cancel()
    }
}
