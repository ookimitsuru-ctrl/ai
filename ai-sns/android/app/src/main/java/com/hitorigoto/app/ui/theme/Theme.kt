package com.hitorigoto.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Indigo = Color(0xFF5B5BD6)

private val LightColors = lightColorScheme(
    primary = Indigo,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE4E3FF),
    onPrimaryContainer = Color(0xFF1B1B5E),
    secondaryContainer = Color(0xFFEDEBFA),
    background = Color(0xFFFAF9FF),
    surface = Color(0xFFFAF9FF),
    surfaceVariant = Color(0xFFEFEDF7),
    onSurfaceVariant = Color(0xFF5E5C71),
    outline = Color(0xFFC9C6DB),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFBFC0FF),
    onPrimary = Color(0xFF1B1B5E),
    primaryContainer = Color(0xFF3F3FB5),
    onPrimaryContainer = Color(0xFFE4E3FF),
    secondaryContainer = Color(0xFF2E2D42),
    background = Color(0xFF131318),
    surface = Color(0xFF131318),
    surfaceVariant = Color(0xFF26252F),
    onSurfaceVariant = Color(0xFFC9C6DB),
    outline = Color(0xFF47455A),
)

@Composable
fun HitorigotoTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, content = content)
}

private val avatarPalette = listOf(
    Color(0xFFE57373), Color(0xFFF2994A), Color(0xFFD4A017), Color(0xFF6BA368),
    Color(0xFF3FA7A0), Color(0xFF4F8FD6), Color(0xFF7E6FD6), Color(0xFFC25FA8),
)

/** ハンドル名から決まるアイコンの色(同じ人は必ず同じ色) */
fun avatarColor(handle: String): Color = avatarPalette[(handle.hashCode().toLong() and 0x7fffffff).toInt() % avatarPalette.size]
