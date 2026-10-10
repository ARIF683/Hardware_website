package com.example.data.remote

import android.util.Log
import com.example.data.model.DailyCashflowRecord
import com.example.data.model.Item
import com.example.data.model.LedgerAccount
import com.example.data.model.LedgerEntry
import com.example.data.model.QuotationRecord
import com.example.data.model.PurchaseRecord
import com.example.data.model.TransactionRecord
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

class SupabaseClient(
    private val baseUrl: String = "https://xkjvcufajsyqbzjjllma.supabase.co",
    private val apiKey: String = "sb_publishable_sXokssWnrTPWROtmfHjoWA_LRqVPt8V"
) {
    private val tag = "SupabaseClient"
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    class SafeStringAdapter {
        @com.squareup.moshi.FromJson
        fun fromJson(reader: com.squareup.moshi.JsonReader): String {
            if (reader.peek() == com.squareup.moshi.JsonReader.Token.NULL) {
                reader.nextNull<Unit>()
                return ""
            }
            return reader.nextString()
        }

        @com.squareup.moshi.ToJson
        fun toJson(writer: com.squareup.moshi.JsonWriter, value: String?) {
            writer.value(value ?: "")
        }
    }

    val moshi: Moshi = Moshi.Builder()
        .add(SafeStringAdapter())
        .addLast(KotlinJsonAdapterFactory())
        .build()

    private val itemListAdapter = moshi.adapter<List<Item>>(
        Types.newParameterizedType(List::class.java, Item::class.java)
    ).serializeNulls()
    private val txListAdapter = moshi.adapter<List<TransactionRecord>>(
        Types.newParameterizedType(List::class.java, TransactionRecord::class.java)
    ).serializeNulls()
    private val cashflowListAdapter = moshi.adapter<List<DailyCashflowRecord>>(
        Types.newParameterizedType(List::class.java, DailyCashflowRecord::class.java)
    ).serializeNulls()
    private val quotationListAdapter = moshi.adapter<List<QuotationRecord>>(
        Types.newParameterizedType(List::class.java, QuotationRecord::class.java)
    ).serializeNulls()
    private val ledgerAccountListAdapter = moshi.adapter<List<LedgerAccount>>(
        Types.newParameterizedType(List::class.java, LedgerAccount::class.java)
    ).serializeNulls()
    private val ledgerEntryListAdapter = moshi.adapter<List<LedgerEntry>>(
        Types.newParameterizedType(List::class.java, LedgerEntry::class.java)
    ).serializeNulls()
    private val purchaseAdapter = moshi.adapter(PurchaseRecord::class.java).serializeNulls()

    // Standard HTTP client with timeouts
    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    // WebSocket client with NO read timeout (0) so it never drops long-lived subscriptions
    private val wsHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private fun newRequestBuilder(path: String): Request.Builder {
        val url = if (path.startsWith("http")) path else "$baseUrl/rest/v1/$path"
        return Request.Builder()
            .url(url)
            .addHeader("apikey", apiKey)
            .addHeader("Authorization", "Bearer $apiKey")
            .addHeader("Content-Type", "application/json")
    }

    suspend fun fetchAllItems(): List<Item> = withContext(Dispatchers.IO) {
        val result = mutableListOf<Item>()
        var offset = 0
        while (true) {
            val req = newRequestBuilder("items?select=*&order=o.asc&limit=1000&offset=$offset")
                .get()
                .build()
            val resp: Response = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) {
                val err = resp.body?.string() ?: "HTTP ${resp.code}"
                throw Exception("Failed to load items: $err")
            }
            val body = resp.body?.string() ?: "[]"
            val page = itemListAdapter.fromJson(body) ?: emptyList()
            result.addAll(page)
            if (page.size < 1000) break
            offset += 1000
        }
        result
    }

    suspend fun fetchRecentTransactions(limit: Int = 500): List<TransactionRecord> = withContext(Dispatchers.IO) {
        val req = newRequestBuilder("transactions?select=*&order=created_at.desc&limit=$limit")
            .get()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to load transactions: $err")
        }
        val body = resp.body?.string() ?: "[]"
        txListAdapter.fromJson(body) ?: emptyList()
    }

    suspend fun upsertItems(items: List<Item>): Unit = withContext(Dispatchers.IO) {
        if (items.isEmpty()) return@withContext
        val json = itemListAdapter.toJson(items)
        val req = newRequestBuilder("items?on_conflict=id")
            .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
            .post(json.toRequestBody(jsonMediaType))
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to upsert items: $err")
        }
    }

    suspend fun patchItem(id: String, patchJson: String): Unit = withContext(Dispatchers.IO) {
        val req = newRequestBuilder("items?id=eq.${java.net.URLEncoder.encode(id, "UTF-8")}")
            .addHeader("Prefer", "return=minimal")
            .patch(patchJson.toRequestBody(jsonMediaType))
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to patch item $id: $err")
        }
    }

    suspend fun deleteItems(ids: List<String>): Unit = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        val idsFormatted = ids.joinToString(",") { java.net.URLEncoder.encode(it, "UTF-8") }
        val req = newRequestBuilder("items?id=in.($idsFormatted)")
            .delete()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to delete items: $err")
        }
    }

    suspend fun deleteAllItems(): Unit = withContext(Dispatchers.IO) {
        val req = newRequestBuilder("items?id=not.is.null")
            .delete()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to delete all items: $err")
        }
    }

    suspend fun insertTransactions(transactions: List<TransactionRecord>): Unit = withContext(Dispatchers.IO) {
        if (transactions.isEmpty()) return@withContext
        val json = txListAdapter.toJson(transactions)
        
        // 1. Try plain POST first (standard PostgREST insert without on_conflict to avoid Postgres 42P10 error)
        var req = newRequestBuilder("transactions")
            .addHeader("Prefer", "return=minimal")
            .post(json.toRequestBody(jsonMediaType))
            .build()
        var resp = okHttpClient.newCall(req).execute()
        if (resp.isSuccessful) return@withContext

        val firstErr = resp.body?.string() ?: "HTTP ${resp.code}"
        Log.w(tag, "First attempt to insert transactions failed: $firstErr. Retrying with fallback payload...")

        // 2. Fallback: If table has id column instead of or in addition to client_id
        try {
            val jsonArray = org.json.JSONArray()
            for (tx in transactions) {
                val obj = org.json.JSONObject().apply {
                    put("id", tx.clientId)
                    put("client_id", tx.clientId)
                    if (tx.itemId != null) put("item_id", tx.itemId)
                    put("item_name", tx.itemName)
                    put("action", tx.action)
                    put("qty", tx.qty)
                    put("balance", tx.balance)
                    put("note", tx.note)
                    put("unit", tx.unit)
                    put("created_at", tx.createdAt)
                }
                jsonArray.put(obj)
            }
            req = newRequestBuilder("transactions")
                .addHeader("Prefer", "return=minimal")
                .post(jsonArray.toString().toRequestBody(jsonMediaType))
                .build()
            resp = okHttpClient.newCall(req).execute()
            if (resp.isSuccessful) return@withContext

            // 3. Fallback: Strip client_id completely if Supabase table does not have client_id column
            val jsonArrayNoClientId = org.json.JSONArray()
            for (tx in transactions) {
                val obj = org.json.JSONObject().apply {
                    if (tx.itemId != null) put("item_id", tx.itemId)
                    put("item_name", tx.itemName)
                    put("action", tx.action)
                    put("qty", tx.qty)
                    put("balance", tx.balance)
                    put("note", tx.note)
                    put("unit", tx.unit)
                    put("created_at", tx.createdAt)
                }
                jsonArrayNoClientId.put(obj)
            }
            req = newRequestBuilder("transactions")
                .addHeader("Prefer", "return=minimal")
                .post(jsonArrayNoClientId.toString().toRequestBody(jsonMediaType))
                .build()
            resp = okHttpClient.newCall(req).execute()
            if (resp.isSuccessful) return@withContext

            val finalErr = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to insert transactions: $finalErr")
        } catch (e: Exception) {
            throw Exception("Failed to insert transactions: ${e.message ?: firstErr}")
        }
    }

    suspend fun clearTransactions(): Unit = withContext(Dispatchers.IO) {
        val req = newRequestBuilder("transactions?id=not.is.null")
            .delete()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to clear transactions: $err")
        }
    }

    suspend fun insertPurchase(purchase: PurchaseRecord): Unit = withContext(Dispatchers.IO) {
        val json = purchaseAdapter.toJson(purchase)
        val req = newRequestBuilder("purchases")
            .addHeader("Prefer", "return=minimal")
            .post(json.toRequestBody(jsonMediaType))
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to record purchase: $err")
        }
    }

    suspend fun fetchAllCashflow(): List<DailyCashflowRecord> = withContext(Dispatchers.IO) {
        val req = newRequestBuilder("daily_cashflow?select=*&order=date.desc&limit=2000")
            .get()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            throw Exception("Failed to fetch cashflow: $err")
        }
        val body = resp.body?.string() ?: "[]"
        val jsonArr = JSONArray(body)
        val list = mutableListOf<DailyCashflowRecord>()
        for (i in 0 until jsonArr.length()) {
            val obj = jsonArr.getJSONObject(i)
            list.add(parseCashflowFromDb(obj))
        }
        list
    }

    suspend fun upsertCashflow(records: List<DailyCashflowRecord>): Unit = withContext(Dispatchers.IO) {
        if (records.isEmpty()) return@withContext

        var includeTitle = true
        var includePaymentMode = true

        fun buildPayload(rec: DailyCashflowRecord, incTitle: Boolean, incPaymentMode: Boolean): JSONObject {
            val cleanType = rec.type.uppercase()
            val cleanTitle = rec.title.ifBlank { rec.category.ifBlank { if (cleanType == "SALE") "Sale" else "Expense" } }
            val cleanCategory = rec.category.ifBlank { cleanTitle }
            return JSONObject().apply {
                put("id", rec.id)
                put("date", rec.date.ifEmpty { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) })
                put("type", cleanType)
                if (incTitle) {
                    put("title", cleanTitle)
                }
                put("category", cleanCategory)
                put("amount", rec.amount)
                if (incPaymentMode) {
                    put("payment_mode", rec.paymentMode.ifBlank { "Cash" })
                }
                put("note", rec.note)
                put("created_at", rec.createdAt.ifEmpty { SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date()) })
            }
        }

        fun makeJsonArray(incTitle: Boolean, incPaymentMode: Boolean): JSONArray {
            val jsonArray = JSONArray()
            for (rec in records) {
                jsonArray.put(buildPayload(rec, incTitle, incPaymentMode))
            }
            return jsonArray
        }

        try {
            // 1. Try batch UPSERT with title and payment_mode on_conflict=id
            var req = newRequestBuilder("daily_cashflow?on_conflict=id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(makeJsonArray(includeTitle, includePaymentMode).toString().toRequestBody(jsonMediaType))
                .build()
            var resp = okHttpClient.newCall(req).execute()
            if (resp.isSuccessful) return@withContext

            val err1 = resp.body?.string() ?: "HTTP ${resp.code}"
            Log.w(tag, "Upsert cashflow batch attempt 1 failed: $err1")

            if (err1.contains("PGRST204")) {
                if (err1.contains("title")) includeTitle = false
                if (err1.contains("payment")) includePaymentMode = false
            }

            // 2. Retry batch UPSERT with adjusted schema flags
            req = newRequestBuilder("daily_cashflow?on_conflict=id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(makeJsonArray(includeTitle, includePaymentMode).toString().toRequestBody(jsonMediaType))
                .build()
            resp = okHttpClient.newCall(req).execute()
            if (resp.isSuccessful) return@withContext

            val err2 = resp.body?.string() ?: "HTTP ${resp.code}"
            Log.w(tag, "Upsert cashflow batch attempt 2 failed: $err2")
            if (err2.contains("PGRST204")) {
                if (err2.contains("title")) includeTitle = false
                if (err2.contains("payment")) includePaymentMode = false
            }

            // 3. Per-record fallback: try UPSERT, then PATCH (update), then POST (insert)
            var successCount = 0
            var lastSingleErr: String? = null
            for (rec in records) {
                try {
                    var obj = buildPayload(rec, includeTitle, includePaymentMode)

                    // Try 3a: Single record UPSERT with on_conflict=id
                    var singleReq = newRequestBuilder("daily_cashflow?on_conflict=id")
                        .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                        .post(JSONArray().put(obj).toString().toRequestBody(jsonMediaType))
                        .build()
                    var singleResp = okHttpClient.newCall(singleReq).execute()
                    if (singleResp.isSuccessful) {
                        successCount++
                        continue
                    }

                    var sErr = singleResp.body?.string() ?: "HTTP ${singleResp.code}"
                    if (sErr.contains("PGRST204")) {
                        if (sErr.contains("title")) includeTitle = false
                        if (sErr.contains("payment")) includePaymentMode = false
                        obj = buildPayload(rec, includeTitle, includePaymentMode)
                        // Retry 3a
                        singleReq = newRequestBuilder("daily_cashflow?on_conflict=id")
                            .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                            .post(JSONArray().put(obj).toString().toRequestBody(jsonMediaType))
                            .build()
                        singleResp = okHttpClient.newCall(singleReq).execute()
                        if (singleResp.isSuccessful) {
                            successCount++
                            continue
                        }
                    }

                    // Try 3b: Single record PATCH if record already exists
                    val patchReq = newRequestBuilder("daily_cashflow?id=eq.${java.net.URLEncoder.encode(rec.id, "UTF-8")}")
                        .addHeader("Prefer", "return=minimal")
                        .patch(obj.toString().toRequestBody(jsonMediaType))
                        .build()
                    val patchResp = okHttpClient.newCall(patchReq).execute()
                    if (patchResp.isSuccessful) {
                        successCount++
                        continue
                    }

                    // Try 3c: Single record POST (insert)
                    val postReq = newRequestBuilder("daily_cashflow")
                        .addHeader("Prefer", "return=minimal")
                        .post(JSONArray().put(obj).toString().toRequestBody(jsonMediaType))
                        .build()
                    val postResp = okHttpClient.newCall(postReq).execute()
                    if (postResp.isSuccessful) {
                        successCount++
                    } else {
                        val err = postResp.body?.string() ?: "HTTP ${postResp.code}"
                        Log.w(tag, "Single cashflow record ${rec.id} upsert error: $err")
                        lastSingleErr = err
                    }
                } catch (e: Exception) {
                    Log.e(tag, "Failed single cashflow upsert for ${rec.id}", e)
                    lastSingleErr = e.message
                }
            }

            if (successCount < records.size) {
                throw Exception("Cashflow sync incomplete ($successCount/${records.size} synced): ${lastSingleErr ?: err1}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to upsert cashflow records", e)
            throw e
        }
    }

    suspend fun deleteCashflow(ids: List<String>): Unit = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        try {
            val idsFormatted = ids.joinToString(",") { java.net.URLEncoder.encode(it, "UTF-8") }
            var req = newRequestBuilder("daily_cashflow?id=in.($idsFormatted)")
                .delete()
                .build()
            var resp = okHttpClient.newCall(req).execute()
            if (resp.isSuccessful) return@withContext

            if (ids.size == 1) {
                val singleId = java.net.URLEncoder.encode(ids[0], "UTF-8")
                req = newRequestBuilder("daily_cashflow?id=eq.$singleId")
                    .delete()
                    .build()
                resp = okHttpClient.newCall(req).execute()
                if (resp.isSuccessful) return@withContext
            }

            val err = resp.body?.string() ?: "HTTP ${resp.code}"
            if (resp.code == 404 || err.contains("PGRST200") || err.contains("does not exist")) {
                return@withContext
            }
            throw Exception("Failed to delete cashflow: $err")
        } catch (e: Exception) {
            val msg = e.message ?: ""
            if (msg.contains("PGRST200") || msg.contains("404") || msg.contains("does not exist")) {
                return@withContext
            }
            throw e
        }
    }

    // ==================== QUOTATIONS SYNC ====================
    suspend fun fetchAllQuotations(): List<QuotationRecord> = withContext(Dispatchers.IO) {
        try {
            val req = newRequestBuilder("quotations?select=*&order=created_at.desc&limit=1000")
                .get()
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) return@withContext emptyList()
            val body = resp.body?.string() ?: "[]"
            val jsonArr = JSONArray(body)
            val list = mutableListOf<QuotationRecord>()
            for (i in 0 until jsonArr.length()) {
                val obj = jsonArr.getJSONObject(i)
                list.add(parseQuotationFromDb(obj))
            }
            list
        } catch (e: Exception) {
            Log.w(tag, "Failed to fetch quotations", e)
            emptyList()
        }
    }

    suspend fun upsertQuotations(records: List<QuotationRecord>): Unit = withContext(Dispatchers.IO) {
        if (records.isEmpty()) return@withContext
        try {
            val jsonArray = JSONArray()
            for (q in records) {
                val obj = JSONObject().apply {
                    put("id", q.id)
                    put("quotation_no", q.quotationNo)
                    put("customer_name", q.customerName)
                    put("customer_phone", q.customerPhone)
                    put("customer_address", q.customerAddress)
                    put("date", q.date)
                    put("valid_until", q.validUntil)
                    val itemsArray = try { JSONArray(q.itemsJson) } catch (e: Exception) { JSONArray() }
                    put("items", itemsArray)
                    put("subtotal", q.subtotal)
                    put("discount", q.discount)
                    put("tax_percent", q.taxPercent)
                    put("tax_amount", q.taxAmount)
                    put("grand_total", q.grandTotal)
                    put("status", q.status)
                    put("notes", q.notes)
                    put("created_at", q.createdAt)
                }
                jsonArray.put(obj)
            }
            val req = newRequestBuilder("quotations?on_conflict=id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(jsonArray.toString().toRequestBody(jsonMediaType))
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) {
                val err = resp.body?.string() ?: "HTTP ${resp.code}"
                Log.e(tag, "Failed to upsert quotations: $err")
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to upsert quotations", e)
        }
    }

    suspend fun deleteQuotations(ids: List<String>): Unit = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        val idsFormatted = ids.joinToString(",") { java.net.URLEncoder.encode(it, "UTF-8") }
        val req = newRequestBuilder("quotations?id=in.($idsFormatted)")
            .delete()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            Log.e(tag, "Failed to delete quotations: ${resp.body?.string()}")
        }
    }

    // ==================== LEDGER ACCOUNTS SYNC ====================
    suspend fun fetchAllLedgerAccounts(): List<LedgerAccount> = withContext(Dispatchers.IO) {
        try {
            val req = newRequestBuilder("ledger_accounts?select=*&order=name.asc&limit=1000")
                .get()
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) return@withContext emptyList()
            val body = resp.body?.string() ?: "[]"
            val jsonArr = JSONArray(body)
            val list = mutableListOf<LedgerAccount>()
            for (i in 0 until jsonArr.length()) {
                val obj = jsonArr.getJSONObject(i)
                list.add(parseLedgerAccountFromDb(obj))
            }
            list
        } catch (e: Exception) {
            Log.w(tag, "Failed to fetch ledger accounts", e)
            emptyList()
        }
    }

    suspend fun upsertLedgerAccounts(records: List<LedgerAccount>): Unit = withContext(Dispatchers.IO) {
        if (records.isEmpty()) return@withContext
        try {
            val jsonArray = JSONArray()
            for (acc in records) {
                val obj = JSONObject().apply {
                    put("id", acc.id)
                    put("name", acc.name)
                    put("phone", acc.phone)
                    put("address", acc.address)
                    put("type", acc.type)
                    put("net_balance", acc.netBalance)
                    put("credit_limit", acc.creditLimit)
                    put("notes", acc.notes)
                    put("created_at", acc.createdAt)
                    put("updated_at", acc.updatedAt)
                }
                jsonArray.put(obj)
            }
            val req = newRequestBuilder("ledger_accounts?on_conflict=id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(jsonArray.toString().toRequestBody(jsonMediaType))
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) {
                Log.e(tag, "Failed to upsert ledger accounts: ${resp.body?.string()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to upsert ledger accounts", e)
        }
    }

    suspend fun deleteLedgerAccounts(ids: List<String>): Unit = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        val idsFormatted = ids.joinToString(",") { java.net.URLEncoder.encode(it, "UTF-8") }
        val req = newRequestBuilder("ledger_accounts?id=in.($idsFormatted)")
            .delete()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            Log.e(tag, "Failed to delete ledger accounts: ${resp.body?.string()}")
        }
    }

    // ==================== STORE PROFILE SYNC (BANNER & AVATAR) ====================
    suspend fun fetchStoreProfile(): Pair<String?, String?> = withContext(Dispatchers.IO) {
        try {
            val req = newRequestBuilder("purchases?client_id=eq.00000000-0000-0000-0000-000000000001&limit=1")
                .get()
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) return@withContext Pair(null, null)
            val body = resp.body?.string() ?: "[]"
            val jsonArr = JSONArray(body)
            if (jsonArr.length() > 0) {
                val obj = jsonArr.getJSONObject(0)
                var first: JSONObject? = null
                val linesObj = obj.opt("lines")
                if (linesObj is JSONArray && linesObj.length() > 0) {
                    first = linesObj.optJSONObject(0)
                } else if (linesObj is String && linesObj.isNotBlank()) {
                    try {
                        val parsedArr = JSONArray(linesObj)
                        if (parsedArr.length() > 0) first = parsedArr.optJSONObject(0)
                    } catch (_: Exception) {}
                }
                val banner = first?.optString("bannerUrl")?.takeIf { it.isNotBlank() }
                val logo = (first?.optString("logoUrl")?.takeIf { it.isNotBlank() }
                    ?: first?.optString("avatarUrl")?.takeIf { it.isNotBlank() })
                return@withContext Pair(banner, logo)
            }
            Pair(null, null)
        } catch (e: Exception) {
            Log.w(tag, "Failed to fetch store profile from Supabase", e)
            Pair(null, null)
        }
    }

    suspend fun saveStoreProfile(bannerUrl: String?, logoUrl: String?): Unit = withContext(Dispatchers.IO) {
        try {
            val linesArr = JSONArray().apply {
                put(JSONObject().apply {
                    put("bannerUrl", bannerUrl ?: "")
                    put("logoUrl", logoUrl ?: "")
                    put("avatarUrl", logoUrl ?: "")
                })
            }
            val payload = JSONObject().apply {
                put("client_id", "00000000-0000-0000-0000-000000000001")
                put("supplier", "__STORE_PROFILE__")
                put("bill_no", "CONFIG")
                put("bill_date", SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()))
                put("total", 0)
                put("lines", linesArr)
            }
            val req = newRequestBuilder("purchases?on_conflict=client_id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) {
                Log.e(tag, "Failed to save store profile: ${resp.body?.string()}")
            } else {
                Log.d(tag, "Successfully saved store profile to Supabase: banner=$bannerUrl, logo=$logoUrl")
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to save store profile", e)
        }
    }

    // ==================== TINT PROCESSED IDS SYNC ====================
    suspend fun fetchProcessedTintIds(): Set<String> = withContext(Dispatchers.IO) {
        try {
            val req = newRequestBuilder("purchases?client_id=eq.00000000-0000-0000-0000-000000000002&limit=1")
                .get()
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) return@withContext emptySet()
            val body = resp.body?.string() ?: return@withContext emptySet()
            val arr = JSONArray(body)
            if (arr.length() > 0) {
                val row = arr.getJSONObject(0)
                val lines = row.optJSONArray("lines") ?: return@withContext emptySet()
                val set = mutableSetOf<String>()
                for (i in 0 until lines.length()) {
                    val id = lines.optString(i)
                    if (id.isNotBlank()) set.add(id)
                }
                return@withContext set
            }
            emptySet()
        } catch (e: Exception) {
            Log.w(tag, "Failed to fetch processed tint ids from Supabase", e)
            emptySet()
        }
    }

    suspend fun saveProcessedTintIds(ids: Set<String>): Unit = withContext(Dispatchers.IO) {
        try {
            if (ids.isEmpty()) return@withContext
            val existing = fetchProcessedTintIds()
            val merged = (existing + ids).toList()
            val linesArr = JSONArray()
            for (id in merged) {
                linesArr.put(id)
            }
            val payload = JSONObject().apply {
                put("client_id", "00000000-0000-0000-0000-000000000002")
                put("supplier", "__TINT_PROCESSED_IDS__")
                put("bill_no", "TINT_LOGS")
                put("bill_date", SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()))
                put("total", merged.size)
                put("lines", linesArr)
            }
            val req = newRequestBuilder("purchases?on_conflict=client_id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) {
                Log.e(tag, "Failed to save processed tint ids: ${resp.body?.string()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to save processed tint ids", e)
        }
    }

    // ==================== LEDGER ENTRIES SYNC ====================
    suspend fun fetchAllLedgerEntries(): List<LedgerEntry> = withContext(Dispatchers.IO) {
        try {
            val req = newRequestBuilder("ledger_entries?select=*&order=created_at.desc&limit=5000")
                .get()
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) return@withContext emptyList()
            val body = resp.body?.string() ?: "[]"
            val jsonArr = JSONArray(body)
            val list = mutableListOf<LedgerEntry>()
            for (i in 0 until jsonArr.length()) {
                val obj = jsonArr.getJSONObject(i)
                list.add(parseLedgerEntryFromDb(obj))
            }
            list
        } catch (e: Exception) {
            Log.w(tag, "Failed to fetch ledger entries", e)
            emptyList()
        }
    }

    suspend fun upsertLedgerEntries(records: List<LedgerEntry>): Unit = withContext(Dispatchers.IO) {
        if (records.isEmpty()) return@withContext
        try {
            val jsonArray = JSONArray()
            for (entry in records) {
                val obj = JSONObject().apply {
                    put("id", entry.id)
                    put("account_id", entry.accountId)
                    put("type", entry.type)
                    put("amount", entry.amount)
                    put("balance_after", entry.balanceAfter)
                    put("date", entry.date)
                    put("description", entry.description)
                    put("bill_ref", entry.billRef)
                    put("created_at", entry.createdAt)
                }
                jsonArray.put(obj)
            }
            val req = newRequestBuilder("ledger_entries?on_conflict=id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(jsonArray.toString().toRequestBody(jsonMediaType))
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) {
                Log.e(tag, "Failed to upsert ledger entries: ${resp.body?.string()}")
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to upsert ledger entries", e)
        }
    }

    suspend fun deleteLedgerEntries(ids: List<String>): Unit = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        val idsFormatted = ids.joinToString(",") { java.net.URLEncoder.encode(it, "UTF-8") }
        val req = newRequestBuilder("ledger_entries?id=in.($idsFormatted)")
            .delete()
            .build()
        val resp = okHttpClient.newCall(req).execute()
        if (!resp.isSuccessful) {
            Log.e(tag, "Failed to delete ledger entries: ${resp.body?.string()}")
        }
    }

    fun parseItemFromDb(obj: JSONObject): Item {
        val mrpVal = if (obj.has("mrp") && !obj.isNull("mrp")) {
            val v = obj.optDouble("mrp")
            if (v.isNaN()) null else v
        } else null

        return Item(
            id = obj.optString("id"),
            o = obj.optInt("o", 0),
            name = obj.optString("name"),
            code = obj.optString("code", ""),
            barcode = obj.optString("barcode", ""),
            type = obj.optString("type", ""),
            brand = obj.optString("brand", ""),
            size = obj.optString("size", ""),
            aliases = obj.optString("aliases", ""),
            mrp = mrpVal,
            cost = obj.optDouble("cost", 0.0),
            price = obj.optDouble("price", 0.0),
            qty = obj.optDouble("qty", 0.0),
            low = obj.optDouble("low", 0.0),
            unit = obj.optString("unit", "pcs").ifEmpty { "pcs" },
            imageUrl = if (obj.has("image_url") && !obj.isNull("image_url")) obj.optString("image_url").ifEmpty { null } else null,
            updatedAt = obj.optString("updated_at", "")
        )
    }

    fun parseCashflowFromDb(obj: JSONObject): DailyCashflowRecord {
        val cat = obj.optString("category", "General")
        val titleVal = obj.optString("title", cat).ifBlank { cat }
        val dateVal = obj.optString("date", obj.optString("entry_date", obj.optString("entryDate", "")))
        return DailyCashflowRecord(
            id = obj.optString("id"),
            type = obj.optString("type", "SALE"),
            amount = obj.optDouble("amount", 0.0),
            title = titleVal,
            category = cat,
            paymentMode = obj.optString("payment_mode", obj.optString("paymentMode", "Cash")).ifEmpty { "Cash" },
            date = dateVal,
            note = obj.optString("note", ""),
            createdAt = obj.optString("created_at", obj.optString("createdAt", ""))
        )
    }

    fun parseQuotationFromDb(obj: JSONObject): QuotationRecord {
        val itemsArray = when {
            obj.has("items") && !obj.isNull("items") -> obj.get("items").toString()
            obj.has("items_json") && !obj.isNull("items_json") -> obj.get("items_json").toString()
            else -> "[]"
        }
        return QuotationRecord(
            id = obj.optString("id"),
            quotationNo = obj.optString("quotation_no", obj.optString("quotationNo", "")),
            customerName = obj.optString("customer_name", obj.optString("customerName", "")),
            customerPhone = obj.optString("customer_phone", obj.optString("customerPhone", "")),
            customerAddress = obj.optString("customer_address", obj.optString("customerAddress", "")),
            date = obj.optString("date", ""),
            validUntil = obj.optString("valid_until", obj.optString("validUntil", "")),
            itemsJson = itemsArray,
            subtotal = obj.optDouble("subtotal", 0.0),
            discount = obj.optDouble("discount", 0.0),
            taxPercent = obj.optDouble("tax_percent", obj.optDouble("taxPercent", 0.0)),
            taxAmount = obj.optDouble("tax_amount", obj.optDouble("taxAmount", 0.0)),
            grandTotal = obj.optDouble("grand_total", obj.optDouble("grandTotal", 0.0)),
            status = obj.optString("status", "Draft"),
            notes = obj.optString("notes", ""),
            createdAt = obj.optString("created_at", obj.optString("createdAt", ""))
        )
    }

    fun parseLedgerAccountFromDb(obj: JSONObject): LedgerAccount {
        return LedgerAccount(
            id = obj.optString("id"),
            name = obj.optString("name"),
            phone = obj.optString("phone", ""),
            address = obj.optString("address", ""),
            type = obj.optString("type", "CUSTOMER"),
            netBalance = obj.optDouble("net_balance", obj.optDouble("netBalance", 0.0)),
            creditLimit = obj.optDouble("credit_limit", obj.optDouble("creditLimit", 0.0)),
            notes = obj.optString("notes", ""),
            createdAt = obj.optString("created_at", obj.optString("createdAt", "")),
            updatedAt = obj.optString("updated_at", obj.optString("updatedAt", ""))
        )
    }

    fun parseLedgerEntryFromDb(obj: JSONObject): LedgerEntry {
        return LedgerEntry(
            id = obj.optString("id"),
            accountId = obj.optString("account_id", obj.optString("accountId", "")),
            type = obj.optString("type", "GAVE"),
            amount = obj.optDouble("amount", 0.0),
            balanceAfter = obj.optDouble("balance_after", obj.optDouble("balanceAfter", 0.0)),
            date = obj.optString("date", ""),
            description = obj.optString("description", ""),
            billRef = obj.optString("bill_ref", obj.optString("billRef", "")),
            createdAt = obj.optString("created_at", obj.optString("createdAt", ""))
        )
    }

    // Realtime WebSocket support matching Phoenix channels protocol and Hardware_website
    fun connectRealtime(
        coroutineScope: CoroutineScope,
        onStatusChanged: (Boolean) -> Unit,
        onItemChanged: (type: String, item: Item?, oldId: String?) -> Unit,
        onCashflowChanged: ((type: String, cashflow: DailyCashflowRecord?, oldId: String?) -> Unit)? = null,
        onQuotationChanged: ((type: String, quotation: QuotationRecord?, oldId: String?) -> Unit)? = null,
        onLedgerAccountChanged: ((type: String, account: LedgerAccount?, oldId: String?) -> Unit)? = null,
        onLedgerEntryChanged: ((type: String, entry: LedgerEntry?, oldId: String?) -> Unit)? = null,
        onStoreProfileChanged: ((bannerUrl: String?, logoUrl: String?) -> Unit)? = null,
        onClosedOrFailed: () -> Unit
    ): WebSocket? {
        val wsUrl = baseUrl.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=$apiKey&vsn=1.0.0"
        val request = Request.Builder().url(wsUrl).build()

        var webSocket: WebSocket? = null
        var heartbeatJob: Job? = null

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(tag, "Realtime WS connected to Supabase")
                val tables = listOf("items", "purchases", "daily_cashflow", "quotations", "ledger_accounts", "ledger_entries")
                tables.forEach { table ->
                    val joinMsg = JSONObject().apply {
                        put("topic", "realtime:public:$table")
                        put("event", "phx_join")
                        put("ref", "join_${table}_${System.currentTimeMillis()}")
                        put("payload", JSONObject().apply {
                            put("config", JSONObject().apply {
                                put("broadcast", JSONObject().apply { put("self", false) })
                                put("presence", JSONObject().apply { put("key", "") })
                                put("postgres_changes", JSONArray().apply {
                                    put(JSONObject().apply {
                                        put("event", "*")
                                        put("schema", "public")
                                        put("table", table)
                                    })
                                })
                            })
                        })
                    }
                    webSocket.send(joinMsg.toString())
                }

                // Start Phoenix heartbeat loop every 20 seconds
                heartbeatJob?.cancel()
                heartbeatJob = coroutineScope.launch {
                    var hbCounter = 1L
                    while (isActive) {
                        delay(20_000)
                        val hbMsg = JSONObject().apply {
                            put("topic", "phoenix")
                            put("event", "heartbeat")
                            put("payload", JSONObject())
                            put("ref", "hb_${hbCounter++}")
                        }
                        webSocket.send(hbMsg.toString())
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val root = JSONObject(text)
                    val event = root.optString("event")
                    val payload = root.optJSONObject("payload")
                    val topic = root.optString("topic")

                    if (event == "phx_reply" && payload?.optString("status") == "ok") {
                        if (topic.contains("items")) {
                            Log.d(tag, "Subscribed to realtime items successfully")
                            onStatusChanged(true)
                        }
                    } else if (event == "system" && payload?.optString("status") == "ok") {
                        Log.d(tag, "Realtime system subscription confirmed")
                        onStatusChanged(true)
                    } else if (event == "postgres_changes") {
                        val dataObj = payload?.optJSONObject("data") ?: payload
                        val table = dataObj?.optString("table") ?: payload?.optString("table") ?: ""
                        val type = dataObj?.optString("type") ?: ""
                        val record = dataObj?.optJSONObject("record") ?: dataObj?.optJSONObject("new")
                        val oldRecord = dataObj?.optJSONObject("old_record") ?: dataObj?.optJSONObject("old")

                        fun extractOldId(): String? {
                            val idFromRecord = record?.optString("id")?.ifEmpty { null }
                            val idFromOldRecord = oldRecord?.optString("id")?.ifEmpty { null }
                            val idFromDataObj = dataObj?.optString("id")?.ifEmpty { null }
                            val idFromPayload = payload?.optString("id")?.ifEmpty { null }
                            return idFromRecord ?: idFromOldRecord ?: idFromDataObj ?: idFromPayload
                        }

                        if (topic.contains("daily_cashflow") || table == "daily_cashflow") {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val cashflow = parseCashflowFromDb(it)
                                    onCashflowChanged?.invoke(type, cashflow, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = extractOldId()
                                onCashflowChanged?.invoke("DELETE", null, oldId)
                            }
                        } else if (topic.contains("quotations") || table == "quotations") {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val q = parseQuotationFromDb(it)
                                    onQuotationChanged?.invoke(type, q, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = extractOldId()
                                onQuotationChanged?.invoke("DELETE", null, oldId)
                            }
                        } else if (topic.contains("ledger_accounts") || table == "ledger_accounts") {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val a = parseLedgerAccountFromDb(it)
                                    onLedgerAccountChanged?.invoke(type, a, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = extractOldId()
                                onLedgerAccountChanged?.invoke("DELETE", null, oldId)
                            }
                        } else if (topic.contains("ledger_entries") || table == "ledger_entries") {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val e = parseLedgerEntryFromDb(it)
                                    onLedgerEntryChanged?.invoke(type, e, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = extractOldId()
                                onLedgerEntryChanged?.invoke("DELETE", null, oldId)
                            }
                        } else if (topic.contains("items") || table == "items") {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val item = parseItemFromDb(it)
                                    onItemChanged(type, item, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = record?.optString("id") ?: oldRecord?.optString("id")
                                onItemChanged("DELETE", null, oldId)
                            }
                        } else if (topic.contains("purchases") || table == "purchases") {
                            val clientId = record?.optString("client_id")
                            val supplier = record?.optString("supplier")
                            if (clientId == "00000000-0000-0000-0000-000000000001" || supplier == "__STORE_PROFILE__") {
                                var first: JSONObject? = null
                                val linesObj = record?.opt("lines")
                                if (linesObj is JSONArray && linesObj.length() > 0) {
                                    first = linesObj.optJSONObject(0)
                                } else if (linesObj is String && linesObj.isNotBlank()) {
                                    try {
                                        val parsedArr = JSONArray(linesObj)
                                        if (parsedArr.length() > 0) first = parsedArr.optJSONObject(0)
                                    } catch (_: Exception) {}
                                }
                                val banner = first?.optString("bannerUrl")?.takeIf { it.isNotBlank() }
                                val logo = (first?.optString("logoUrl")?.takeIf { it.isNotBlank() }
                                    ?: first?.optString("avatarUrl")?.takeIf { it.isNotBlank() })
                                onStoreProfileChanged?.invoke(banner, logo)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(tag, "Error parsing realtime message: $text", e)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(tag, "Realtime WS closing: $code / $reason")
                heartbeatJob?.cancel()
                onStatusChanged(false)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(tag, "Realtime WS closed: $code / $reason")
                heartbeatJob?.cancel()
                onStatusChanged(false)
                onClosedOrFailed()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(tag, "Realtime WS failure: ${t.message}")
                heartbeatJob?.cancel()
                onStatusChanged(false)
                onClosedOrFailed()
            }
        }

        webSocket = wsHttpClient.newWebSocket(request, listener)
        return webSocket
    }

    suspend fun uploadImageToCloudinary(imageBytes: ByteArray, fileName: String = "item_${System.currentTimeMillis()}.jpg"): Result<String> = withContext(Dispatchers.IO) {
        val base64Fallback by lazy {
            "data:image/jpeg;base64," + android.util.Base64.encodeToString(imageBytes, android.util.Base64.NO_WRAP)
        }
        try {
            // 1. Request signature from Supabase Edge Function
            val signReq = newRequestBuilder("sign-cloudinary-upload")
                .url("$baseUrl/functions/v1/sign-cloudinary-upload")
                .addHeader("apikey", apiKey)
                .addHeader("Authorization", "Bearer $apiKey")
                .post("""{"folder":"items"}""".toRequestBody(jsonMediaType))
                .build()

            val signResp = okHttpClient.newCall(signReq).execute()
            val signBodyStr = signResp.body?.string() ?: ""
            if (!signResp.isSuccessful) {
                Log.w("SupabaseClient", "Edge function signing error ($signBodyStr), using base64 fallback")
                return@withContext Result.success(base64Fallback)
            }

            val signJson = JSONObject(signBodyStr)
            val signature = signJson.optString("signature")
            val timestamp = signJson.optLong("timestamp")
            val cloudApiKey = signJson.optString("apiKey")
            val cloudName = signJson.optString("cloudName")
            val folder = signJson.optString("folder", "items")

            if (signature.isEmpty() || cloudName.isEmpty()) {
                Log.w("SupabaseClient", "Incomplete signature response, using base64 fallback")
                return@withContext Result.success(base64Fallback)
            }

            // 2. Upload file directly to Cloudinary using signed payload
            val multipartBody = okhttp3.MultipartBody.Builder()
                .setType(okhttp3.MultipartBody.FORM)
                .addFormDataPart("api_key", cloudApiKey)
                .addFormDataPart("timestamp", timestamp.toString())
                .addFormDataPart("signature", signature)
                .addFormDataPart("folder", folder)
                .addFormDataPart(
                    "file",
                    fileName,
                    imageBytes.toRequestBody("image/jpeg".toMediaType())
                )
                .build()

            val uploadReq = Request.Builder()
                .url("https://api.cloudinary.com/v1_1/$cloudName/image/upload")
                .post(multipartBody)
                .build()

            val uploadResp = okHttpClient.newCall(uploadReq).execute()
            val uploadBody = uploadResp.body?.string() ?: ""
            if (!uploadResp.isSuccessful) {
                Log.w("SupabaseClient", "Cloudinary upload failed ($uploadBody), using base64 fallback")
                return@withContext Result.success(base64Fallback)
            }

            val uploadJson = JSONObject(uploadBody)
            val secureUrl = uploadJson.optString("secure_url").ifEmpty { uploadJson.optString("url") }
            if (secureUrl.isNotEmpty()) {
                Result.success(secureUrl)
            } else {
                Result.success(base64Fallback)
            }
        } catch (e: Exception) {
            Log.w("SupabaseClient", "Image upload exception (${e.message}), using base64 fallback")
            Result.success("data:image/jpeg;base64," + android.util.Base64.encodeToString(imageBytes, android.util.Base64.NO_WRAP))
        }
    }
}

