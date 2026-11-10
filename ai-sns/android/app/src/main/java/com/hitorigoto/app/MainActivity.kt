package com.hitorigoto.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.hitorigoto.app.ui.AppRoot
import com.hitorigoto.app.ui.theme.HitorigotoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as HitorigotoApp).container
        setContent {
            HitorigotoTheme {
                AppRoot(container)
            }
        }
    }
}
