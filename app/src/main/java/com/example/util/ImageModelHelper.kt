package com.example.util

import android.util.Base64
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

object ImageModelHelper {
    @Composable
    fun rememberImageModel(imageUrl: String?): Any? {
        return remember(imageUrl) {
            if (imageUrl.isNullOrBlank()) {
                null
            } else if (imageUrl.startsWith("data:image")) {
                try {
                    val base64Data = imageUrl.substringAfter(",")
                    Base64.decode(base64Data, Base64.DEFAULT)
                } catch (e: Exception) {
                    imageUrl
                }
            } else {
                imageUrl
            }
        }
    }
}
