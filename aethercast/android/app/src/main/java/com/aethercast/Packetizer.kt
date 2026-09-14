package com.aethercast

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicLong

class Packetizer(private val socket: DatagramSocket, private val target: InetAddress, private val port: Int) {
    private val seq = AtomicLong(0)

    fun send(data: ByteArray, tsNs: Long, isAudio: Boolean, isKey: Boolean) {
        val flags = (if (isAudio) 0x02 else 0) or (if (isKey) 0x01 else 0)
        val hdr = ByteBuffer.allocate(20).order(ByteOrder.LITTLE_ENDIAN).apply {
            putShort(0xAEC4.toShort())
            put(0x01.toByte())
            put(flags.toByte())
            putInt(seq.getAndIncrement().toInt())
            putLong(tsNs)
            putInt(data.size)
        }.array()
        val pkt = ByteArray(20 + data.size)
        System.arraycopy(hdr, 0, pkt, 0, 20)
        System.arraycopy(data, 0, pkt, 20, data.size)
        socket.send(DatagramPacket(pkt, pkt.size, target, port))
    }

    fun sendControl(json: String) = send(json.toByteArray(), System.nanoTime(), isAudio = false, isKey = false)

    fun close() = socket.close()
}
