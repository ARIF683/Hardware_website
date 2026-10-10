package com.example.util

import android.graphics.Bitmap
import android.util.Base64
import com.example.BuildConfig
import com.example.data.model.Item
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

data class ParsedBillItem(
    val particulars: String,
    val quantity: Double,
    val rate: Double,
    val amount: Double,
    var matchedItem: Item? = null,
    var selectedQty: Double = quantity,
    var selectedRate: Double = rate,
    var updatePrice: Boolean = true,
    var addStock: Boolean = true
)

data class ParsedBillResult(
    val supplierName: String,
    val billNumber: String,
    val date: String,
    val totalAmount: Double,
    val items: List<ParsedBillItem>
)

object GeminiBillScanner {
    private val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    fun bitmapToBase64(bitmap: Bitmap): String {
        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
        return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
    }

    suspend fun parseBill(bitmap: Bitmap, inventoryItems: List<Item>): ParsedBillResult {
        val apiKey = BuildConfig.GEMINI_API_KEY
        if (apiKey.isBlank()) {
            throw IllegalStateException("Gemini API key is missing. Please set GEMINI_API_KEY in the AI Studio Secrets panel.")
        }

        val prompt = "You are an expert OCR and invoice parsing assistant for hardware and paint stores. Analyze this cash memo / supplier bill image carefully, interpreting paint store abbreviations and size x quantity notation (e.g. 1 x 6 = 1 Ltr pack size with 6 cans, 1/2 x 8 = 500ml/gm pack size with 8 cans, 200 x 10 = 200ml/gm with 10 cans, 10 x 1 = 10 Ltr pack with 1 can): Cowhite primer 1x6, Cowhite primer 1/2x8, Black 200x10, B.White 1/2x8, AB-11 10x1, AB-17 10x1, AB-2 10x1, Sparc int 1x6, Sparc ext 1x6. Extract supplier name, date (e.g. 14/08/26), total amount (16312), and line items with correct pack size and quantity. Return ONLY valid JSON in this exact structure: {\"supplierName\": \"string\", \"billNumber\": \"string\", \"date\": \"string\", \"totalAmount\": 0.0, \"items\": [{\"particulars\": \"string\", \"quantity\": 0.0, \"rate\": 0.0, \"amount\": 0.0}]}"

        val requestJson = JSONObject().apply {
            put("contents", JSONArray().apply {
                put(JSONObject().apply {
                    put("parts", JSONArray().apply {
                        put(JSONObject().put("text", prompt))
                        put(JSONObject().put("inlineData", JSONObject().apply {
                            put("mimeType", "image/jpeg")
                            put("data", bitmapToBase64(bitmap))
                        }))
                    })
                })
            })
            put("generationConfig", JSONObject().put("responseMimeType", "application/json"))
        }

        val url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=$apiKey"
        val body = requestJson.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder().url(url).post(body).build()

        val response = client.newCall(request).execute()
        val responseStr = response.body?.string() ?: throw Exception("Empty response from Gemini OCR service.")
        if (!response.isSuccessful) {
            throw Exception("Gemini API error (${response.code}): $responseStr")
        }

        val root = JSONObject(responseStr)
        val candidates = root.optJSONArray("candidates") ?: throw Exception("No candidates in Gemini response.")
        val firstCandidate = candidates.optJSONObject(0) ?: throw Exception("Empty candidates list.")
        val content = firstCandidate.optJSONObject("content") ?: throw Exception("No content object.")
        val parts = content.optJSONArray("parts") ?: throw Exception("No parts array.")
        val firstPart = parts.optJSONObject(0) ?: throw Exception("Empty parts list.")
        val text = firstPart.optString("text", "")

        val cleanJson = text.trim()
            .removePrefix("```json")
            .removePrefix("```")
            .removeSuffix("```")
            .trim()

        val billObj = JSONObject(cleanJson)
        val supplierName = billObj.optString("supplierName", "")
        val billNumber = billObj.optString("billNumber", "")
        val date = billObj.optString("date", "")
        val totalAmount = billObj.optDouble("totalAmount", 0.0)

        val itemsArray = billObj.optJSONArray("items") ?: JSONArray()
        val billItems = mutableListOf<ParsedBillItem>()

        for (i in 0 until itemsArray.length()) {
            val itemObj = itemsArray.getJSONObject(i)
            val particulars = itemObj.optString("particulars", "")
            val quantity = itemObj.optDouble("quantity", 1.0)
            val rate = itemObj.optDouble("rate", 0.0)
            val amount = itemObj.optDouble("amount", quantity * rate)

            val parsedItem = ParsedBillItem(
                particulars = particulars,
                quantity = quantity,
                rate = rate,
                amount = amount
            )
            parsedItem.matchedItem = findBestMatchingInventoryItem(particulars, inventoryItems)
            billItems.add(parsedItem)
        }

        return ParsedBillResult(
            supplierName = supplierName,
            billNumber = billNumber,
            date = date,
            totalAmount = totalAmount,
            items = billItems
        )
    }

    private fun findBestMatchingInventoryItem(particulars: String, items: List<Item>): Item? {
        if (items.isEmpty()) return null
        val pClean = particulars.trim().uppercase()
        val tokens = pClean.split(Regex("[\\s-_/]+")).filter { it.length > 1 }

        var bestScore = 0
        var bestItem: Item? = null

        for (item in items) {
            var score = 0
            val nameUpper = item.name.uppercase()
            val codeUpper = item.code.uppercase()
            val aliasesUpper = item.aliases.uppercase()

            if (nameUpper == pClean || codeUpper == pClean) {
                score += 100
            } else if (nameUpper.contains(pClean) || pClean.contains(nameUpper)) {
                score += 80
            } else if (aliasesUpper.contains(pClean)) {
                score += 70
            } else {
                for (token in tokens) {
                    if (nameUpper.contains(token) || aliasesUpper.contains(token)) {
                        score += 25
                    }
                }
            }

            if (score > bestScore && score >= 20) {
                bestScore = score
                bestItem = item
            }
        }
        return bestItem
    }
}
