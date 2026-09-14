package com.aethercast

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var projectionManager: MediaProjectionManager
    private val REQUEST_CODE = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        findViewById<Button>(R.id.btnStart).setOnClickListener {
            val ip = findViewById<EditText>(R.id.etIp).text.toString().trim()
            if (ip.isEmpty()) {
                Toast.makeText(this, "Enter PC IP", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CODE)
            getSharedPreferences("cfg", MODE_PRIVATE).edit().putString("pc_ip", ip).apply()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CODE && resultCode == Activity.RESULT_OK && data != null) {
            val intent = Intent(this, MirrorService::class.java).apply {
                putExtra("projection", data)
                putExtra("preset", "game")
            }
            startForegroundService(intent)
            finish()
        }
    }
}
