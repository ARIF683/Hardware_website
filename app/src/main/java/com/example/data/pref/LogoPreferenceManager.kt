package com.example.data.pref

import android.content.Context
import androidx.annotation.DrawableRes
import com.example.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class AppLogoStyle(
    val id: String,
    val title: String,
    val description: String,
    @DrawableRes val resId: Int
) {
    NANO_BANANA_CIRCUIT(
        id = "nano_banana_circuit",
        title = "Nano Banana Circuits",
        description = "Futuristic neon yellow nano banana with microchip tracks",
        resId = R.drawable.nano_banana_logo_1791185750609
    ),
    NANO_BANANA_NODES(
        id = "nano_banana_nodes",
        title = "Digital Nano Banana",
        description = "Connected geometric nodes with glowing sapphire accents",
        resId = R.drawable.banana_tech_logo_1791185765354
    ),
    NANO_BANANA_CYBER(
        id = "nano_banana_cyber",
        title = "Cyber 3D Banana Mascot",
        description = "Sleek 3D cybernetic visor emblem & metallic finish",
        resId = R.drawable.cyber_banana_logo_1791185780500
    ),
    OPTION_A(
        id = "option_a",
        title = "Gear & Bolt Hexagon",
        description = "Modern amber & slate industrial geometric badge",
        resId = R.drawable.img_logo_option_a_1791181143165
    ),
    OPTION_B(
        id = "option_b",
        title = "Wrench & Hammer Shield",
        description = "Bold metallic gold & cobalt crest emblem",
        resId = R.drawable.img_logo_option_b_1791181156769
    ),
    OPTION_C(
        id = "option_c",
        title = "Tech Warehouse Cube",
        description = "Futuristic neon orange & cyan 3D stock symbol",
        resId = R.drawable.img_logo_option_c_1791181173362
    ),
    ORIGINAL(
        id = "original",
        title = "Classic Hardware Logo",
        description = "Original minimal wrench and carton icon",
        resId = R.drawable.ic_stock_logo
    )
}

class LogoPreferenceManager(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("app_logo_pref", Context.MODE_PRIVATE)

    companion object {
        private var isInitialized = false
        private val _selectedLogo = MutableStateFlow(AppLogoStyle.OPTION_A)
        private val _bannerUrl = MutableStateFlow<String?>(null)
        private val _customLogoUrl = MutableStateFlow<String?>(null)

        val selectedLogo: StateFlow<AppLogoStyle> = _selectedLogo.asStateFlow()
        val bannerUrl: StateFlow<String?> = _bannerUrl.asStateFlow()
        val customLogoUrl: StateFlow<String?> = _customLogoUrl.asStateFlow()
    }

    init {
        synchronized(LogoPreferenceManager::class.java) {
            if (!isInitialized) {
                _selectedLogo.value = loadLogo()
                _bannerUrl.value = prefs.getString("custom_banner_url", null)
                _customLogoUrl.value = prefs.getString("custom_logo_url", null)
                isInitialized = true
            }
        }
    }

    val selectedLogo: StateFlow<AppLogoStyle> = Companion.selectedLogo
    val bannerUrl: StateFlow<String?> = Companion.bannerUrl
    val customLogoUrl: StateFlow<String?> = Companion.customLogoUrl

    private fun loadLogo(): AppLogoStyle {
        val savedId = prefs.getString("selected_logo_id", AppLogoStyle.OPTION_A.id)
        return AppLogoStyle.values().find { it.id == savedId } ?: AppLogoStyle.OPTION_A
    }

    fun selectLogo(logo: AppLogoStyle) {
        prefs.edit().putString("selected_logo_id", logo.id).apply()
        _selectedLogo.value = logo
    }

    fun getBannerUrl(): String? = _bannerUrl.value ?: prefs.getString("custom_banner_url", null)

    fun saveBannerUrl(url: String?) {
        prefs.edit().putString("custom_banner_url", url).apply()
        _bannerUrl.value = url
    }

    fun getCustomLogoUrl(): String? = _customLogoUrl.value ?: prefs.getString("custom_logo_url", null)

    fun saveCustomLogoUrl(url: String?) {
        prefs.edit().putString("custom_logo_url", url).apply()
        _customLogoUrl.value = url
    }
}
