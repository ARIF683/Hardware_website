package com.example.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

val StaticBrandBlue = Color(0xFF4C6FFF)
val StaticBrandBlueDark = Color(0xFF3855D6)
val StaticBrandBlueLight = Color(0xFF7B93FF)
val StaticBrandBlueSoft = Color(0xFFEEF2FF)

val BrandBlue: Color
    @Composable
    get() = MaterialTheme.colorScheme.primary

val BrandBlueDark: Color
    @Composable
    get() = MaterialTheme.colorScheme.primaryContainer

val BrandBlueLight: Color
    @Composable
    get() = MaterialTheme.colorScheme.primary

val BrandBlueSoft: Color
    @Composable
    get() = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.15f)

val SuccessGreen = Color(0xFF16A34A)
val SuccessGreenLight = Color(0xFFDCFCE7)
val DangerRed = Color(0xFFEF4444)
val DangerRedLight = Color(0xFFFEE2E2)
val WarningAmber = Color(0xFFF59E0B)
val WarningAmberLight = Color(0xFFFEF3C7)
val BrandAmber = Color(0xFFF59E0B)

val DarkBg = Color(0xFF12141A)
val DarkSurface = Color(0xFF1E222B)
val DarkCard = Color(0xFF252B37)
val DarkBorder = Color(0xFF2A2F3A)
val DarkText = Color(0xFFEEF0F5)
val DarkMuted = Color(0xFF9AA3B2)

val LightBg = Color(0xFFF8FAFC)
val LightSurface = Color(0xFFFFFFFF)
val LightCard = Color(0xFFF1F5F9)
val LightBorder = Color(0xFFECEEF2)
val LightText = Color(0xFF14171F)
val LightMuted = Color(0xFF6B7280)
