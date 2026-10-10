package com.example.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme = darkColorScheme(
    primary = StaticBrandBlueLight,
    onPrimary = Color.White,
    primaryContainer = StaticBrandBlueDark,
    onPrimaryContainer = Color.White,
    secondary = StaticBrandBlueLight,
    onSecondary = Color.White,
    tertiary = WarningAmber,
    background = DarkBg,
    onBackground = DarkText,
    surface = DarkSurface,
    onSurface = DarkText,
    surfaceVariant = DarkCard,
    onSurfaceVariant = DarkMuted,
    outline = DarkBorder,
    error = DangerRed,
    onError = Color.White
)

private val LightColorScheme = lightColorScheme(
    primary = StaticBrandBlue,
    onPrimary = Color.White,
    primaryContainer = StaticBrandBlueSoft,
    onPrimaryContainer = StaticBrandBlueDark,
    secondary = StaticBrandBlue,
    onSecondary = Color.White,
    tertiary = WarningAmber,
    background = LightBg,
    onBackground = LightText,
    surface = LightSurface,
    onSurface = LightText,
    surfaceVariant = LightCard,
    onSurfaceVariant = LightMuted,
    outline = LightBorder,
    error = DangerRed,
    onError = Color.White
)

@Composable
fun StockManagerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    customThemeColor: String = "#4C6FFF",
    content: @Composable () -> Unit
) {
    val baseColor = try {
        Color(android.graphics.Color.parseColor(customThemeColor))
    } catch (e: Exception) {
        Color(0xFF4C6FFF)
    }

    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme.copy(
            primary = baseColor,
            secondary = baseColor,
            primaryContainer = baseColor.copy(alpha = 0.22f),
            onPrimaryContainer = Color.White
        )
        else -> LightColorScheme.copy(
            primary = baseColor,
            secondary = baseColor,
            primaryContainer = baseColor.copy(alpha = 0.15f)
        )
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
