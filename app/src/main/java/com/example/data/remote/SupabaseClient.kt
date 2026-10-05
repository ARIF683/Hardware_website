package com.example.data.remote

import android.util.Log
import com.example.data.model.DailyCashflowRecord
import com.example.data.model.Item
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
import java.util.concurrent.TimeUnit

class SupabaseClient(
    private val baseUrl: String = "https://xkjvcufajsyqbzjjllma.supabase.co",
    private val apiKey: String = "sb_publishable_sXokssWnrTPWROtmfHjoWA_LRqVPt8V"
) {
    private val tag = "SupabaseClient"
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    val moshi: Moshi = Moshi.Builder()
        .addLast(KotlinJsonAdapterFactory())
        .build()

    private val itemListAdapter = moshi.adapter<List<Item>>(
        Types.newParameterizedType(List::class.java, Item::class.java)
    )
    private val txListAdapter = moshi.adapter<List<TransactionRecord>>(
        Types.newParameterizedType(List::class.java, TransactionRecord::class.java)
    )
    private val cashflowListAdapter = moshi.adapter<List<DailyCashflowRecord>>(
        Types.newParameterizedType(List::class.java, DailyCashflowRecord::class.java)
    )
    private val purchaseAdapter = moshi.adapter(PurchaseRecord::class.java)

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
        val resultList = mutableListOf<DailyCashflowRecord>()
        val seenIds = mutableSetOf<String>()

        // 1. Fetch from purchases table (used by website)
        try {
            val req = newRequestBuilder("purchases?select=*&order=created_at.desc&limit=2000")
                .get()
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (resp.isSuccessful) {
                val body = resp.body?.string() ?: "[]"
                val array = JSONArray(body)
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    val cf = parseCashflowFromPurchaseObj(obj)
                    if (cf.id.isNotEmpty() && seenIds.add(cf.id)) {
                        resultList.add(cf)
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(tag, "Fetch purchases non-success", e)
        }

        // 2. Fetch from daily_cashflow table (used by app)
        try {
            val req = newRequestBuilder("daily_cashflow?select=*&order=created_at.desc&limit=2000")
                .get()
                .build()
            val resp = okHttpClient.newCall(req).execute()
            if (resp.isSuccessful) {
                val body = resp.body?.string() ?: "[]"
                val list = cashflowListAdapter.fromJson(body) ?: emptyList()
                for (cf in list) {
                    if (cf.id.isNotEmpty() && seenIds.add(cf.id)) {
                        resultList.add(cf)
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(tag, "Fetch daily_cashflow non-success", e)
        }

        resultList
    }

    suspend fun upsertCashflow(records: List<DailyCashflowRecord>): Unit = withContext(Dispatchers.IO) {
        if (records.isEmpty()) return@withContext

        // 1. Upsert to purchases table for website compatibility
        try {
            val purchasesArray = JSONArray()
            for (rec in records) {
                val obj = JSONObject().apply {
                    put("client_id", rec.id)
                    put("id", rec.id)
                    put("supplier", rec.category.ifEmpty { if (rec.type == "SALE") "Counter Sale" else "Purchase Expense" })
                    put("bill_no", rec.title)
                    put("bill_date", rec.date)
                    put("total", rec.amount)
                    put("type", rec.type)
                    put("category", rec.category)
                    put("payment_mode", rec.paymentMode)
                    put("note", rec.note)
                    put("created_at", rec.createdAt)
                    val lines = JSONArray().apply {
                        put(JSONObject().apply {
                            put("qty", 1)
                            put("name", rec.category)
                            put("rate", rec.amount)
                            put("bill_name", rec.note)
                        })
                    }
                    put("lines", lines)
                }
                purchasesArray.put(obj)
            }
            val reqPurchases = newRequestBuilder("purchases")
                .addHeader("Prefer", "return=minimal")
                .post(purchasesArray.toString().toRequestBody(jsonMediaType))
                .build()
            okHttpClient.newCall(reqPurchases).execute()
        } catch (e: Exception) {
            Log.w(tag, "Upsert to purchases table warning", e)
        }

        // 2. Upsert to daily_cashflow table
        try {
            val json = cashflowListAdapter.toJson(records)
            var req = newRequestBuilder("daily_cashflow?on_conflict=id")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(json.toRequestBody(jsonMediaType))
                .build()
            var resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) {
                req = newRequestBuilder("daily_cashflow")
                    .addHeader("Prefer", "return=minimal")
                    .post(json.toRequestBody(jsonMediaType))
                    .build()
                resp = okHttpClient.newCall(req).execute()
            }
        } catch (e: Exception) {
            Log.w(tag, "Upsert to daily_cashflow table warning", e)
        }
    }

    suspend fun deleteCashflow(ids: List<String>): Unit = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        val idsFormatted = ids.joinToString(",") { java.net.URLEncoder.encode(it, "UTF-8") }

        // 1. Delete from purchases table by client_id and id
        try {
            val req1 = newRequestBuilder("purchases?client_id=in.($idsFormatted)").delete().build()
            okHttpClient.newCall(req1).execute()

            val req2 = newRequestBuilder("purchases?id=in.($idsFormatted)").delete().build()
            okHttpClient.newCall(req2).execute()
        } catch (e: Exception) {
            Log.w(tag, "Delete from purchases table warning", e)
        }

        // 2. Delete from daily_cashflow table
        try {
            val req = newRequestBuilder("daily_cashflow?id=in.($idsFormatted)").delete().build()
            okHttpClient.newCall(req).execute()
        } catch (e: Exception) {
            Log.w(tag, "Delete from daily_cashflow table warning", e)
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
            updatedAt = obj.optString("updated_at", "")
        )
    }

    fun parseCashflowFromDb(obj: JSONObject): DailyCashflowRecord {
        return DailyCashflowRecord(
            id = obj.optString("id"),
            type = obj.optString("type"),
            amount = obj.optDouble("amount", 0.0),
            title = obj.optString("title"),
            category = obj.optString("category"),
            paymentMode = obj.optString("payment_mode", "Cash").ifEmpty { "Cash" },
            date = obj.optString("date"),
            note = obj.optString("note", ""),
            createdAt = obj.optString("created_at", "")
        )
    }

    fun parseCashflowFromPurchaseObj(obj: JSONObject): DailyCashflowRecord {
        val clientId = obj.optString("client_id").ifEmpty { obj.optString("id") }
        val supplier = obj.optString("supplier")
        val isSale = obj.optString("type") == "SALE" || supplier.lowercase(Locale.ROOT).contains("sale")
        val total = obj.optDouble("total", obj.optDouble("amount", 0.0))
        val billDate = obj.optString("bill_date").ifEmpty { obj.optString("date") }
        val category = obj.optString("category").ifEmpty {
            if (supplier.isNotEmpty()) supplier else if (isSale) "Counter Sale" else "Purchase / Expense"
        }
        val title = obj.optString("title", supplier.ifEmpty { if (isSale) "Counter Sale" else "Purchase / Expense" })
        val paymentMode = obj.optString("payment_mode", obj.optString("paymentMode", "Cash")).ifEmpty { "Cash" }
        val note = obj.optString("note", obj.optString("bill_no", ""))
        val createdAt = obj.optString("created_at", obj.optString("createdAt", ""))

        return DailyCashflowRecord(
            id = clientId,
            type = if (isSale) "SALE" else "EXPENSE",
            amount = total,
            title = title,
            category = category,
            paymentMode = paymentMode,
            date = billDate,
            note = note,
            createdAt = createdAt
        )
    }

    // Realtime WebSocket support matching Phoenix channels protocol
    fun connectRealtime(
        coroutineScope: CoroutineScope,
        onStatusChanged: (Boolean) -> Unit,
        onItemChanged: (type: String, item: Item?, oldId: String?) -> Unit,
        onCashflowChanged: ((type: String, cashflow: DailyCashflowRecord?, oldId: String?) -> Unit)? = null,
        onClosedOrFailed: () -> Unit
    ): WebSocket? {
        val wsUrl = baseUrl.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=$apiKey&vsn=1.0.0"
        val request = Request.Builder().url(wsUrl).build()

        var webSocket: WebSocket? = null
        var heartbeatJob: Job? = null

        val listener = object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                Log.d(tag, "Realtime WS connected to Supabase")
                val joinMsg = JSONObject().apply {
                    put("topic", "realtime:public:items")
                    put("event", "phx_join")
                    put("ref", "join_${System.currentTimeMillis()}")
                    put("payload", JSONObject().apply {
                        put("config", JSONObject().apply {
                            put("broadcast", JSONObject().apply { put("self", false) })
                            put("presence", JSONObject().apply { put("key", "") })
                            val changeArr = JSONArray().apply {
                                put(JSONObject().apply {
                                    put("event", "*")
                                    put("schema", "public")
                                    put("table", "items")
                                })
                                put(JSONObject().apply {
                                    put("event", "*")
                                    put("schema", "public")
                                    put("table", "daily_cashflow")
                                })
                                put(JSONObject().apply {
                                    put("event", "*")
                                    put("schema", "public")
                                    put("table", "purchases")
                                })
                            }
                            put("postgres_changes", changeArr)
                        })
                    })
                }
                ws.send(joinMsg.toString())

                // Join purchases topic for website WS compatibility
                val joinPurchasesMsg = JSONObject().apply {
                    put("topic", "realtime:public:purchases")
                    put("event", "phx_join")
                    put("ref", "join_purch_${System.currentTimeMillis()}")
                    put("payload", JSONObject().apply {
                        put("config", JSONObject().apply {
                            put("broadcast", JSONObject().apply { put("self", false) })
                            put("presence", JSONObject().apply { put("key", "") })
                            val changeArr = JSONArray().apply {
                                put(JSONObject().apply {
                                    put("event", "*")
                                    put("schema", "public")
                                    put("table", "purchases")
                                })
                            }
                            put("postgres_changes", changeArr)
                        })
                    })
                }
                ws.send(joinPurchasesMsg.toString())

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
                        ws.send(hbMsg.toString())
                    }
                }
            }

            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val root = JSONObject(text)
                    val event = root.optString("event")
                    val payload = root.optJSONObject("payload")

                    if (event == "phx_reply" && payload?.optString("status") == "ok") {
                        val topic = root.optString("topic")
                        if (topic == "realtime:public:items" || topic == "realtime:public:purchases") {
                            Log.d(tag, "Subscribed to $topic successfully")
                            onStatusChanged(true)
                        }
                    } else if (event == "system" && payload?.optString("status") == "ok") {
                        Log.d(tag, "Realtime system subscription confirmed")
                        onStatusChanged(true)
                    } else if (event == "postgres_changes") {
                        val dataObj = payload?.optJSONObject("data") ?: payload
                        val table = dataObj?.optString("table") ?: payload?.optString("table") ?: ""
                        val type = dataObj?.optString("type") ?: ""
                        val record = dataObj?.optJSONObject("record")
                        val oldRecord = dataObj?.optJSONObject("old_record")

                        if (table == "daily_cashflow") {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val cashflow = parseCashflowFromDb(it)
                                    onCashflowChanged?.invoke(type, cashflow, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = record?.optString("id") ?: oldRecord?.optString("id")
                                onCashflowChanged?.invoke("DELETE", null, oldId)
                            }
                        } else if (table == "purchases") {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val cashflow = parseCashflowFromPurchaseObj(it)
                                    onCashflowChanged?.invoke(type, cashflow, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = record?.optString("client_id") ?: record?.optString("id") ?: oldRecord?.optString("client_id") ?: oldRecord?.optString("id")
                                onCashflowChanged?.invoke("DELETE", null, oldId)
                            }
                        } else {
                            if (type == "INSERT" || type == "UPDATE") {
                                record?.let {
                                    val item = parseItemFromDb(it)
                                    onItemChanged(type, item, null)
                                }
                            } else if (type == "DELETE") {
                                val oldId = record?.optString("id") ?: oldRecord?.optString("id")
                                onItemChanged("DELETE", null, oldId)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(tag, "Error parsing realtime message: $text", e)
                }
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                Log.d(tag, "Realtime WS closing: $code / $reason")
                heartbeatJob?.cancel()
                onStatusChanged(false)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                Log.d(tag, "Realtime WS closed: $code / $reason")
                heartbeatJob?.cancel()
                onStatusChanged(false)
                onClosedOrFailed()
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.w(tag, "Realtime WS failure: ${t.message}")
                heartbeatJob?.cancel()
                onStatusChanged(false)
                onClosedOrFailed()
            }
        }

        webSocket = wsHttpClient.newWebSocket(request, listener)
        return webSocket
    }
}
