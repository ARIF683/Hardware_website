package com.example.data.repository

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import com.example.data.local.AppDatabase
import com.example.data.model.ColorTintLog
import com.example.data.model.DailyCashflowRecord
import com.example.data.model.Item
import com.example.data.model.PurchaseLine
import com.example.data.model.PurchaseRecord
import com.example.data.model.SyncQueueItem
import com.example.data.model.TransactionRecord
import com.example.data.remote.SupabaseClient
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.WebSocket
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class BillRowData(
    val id: String = "",
    val name: String,
    val rate: Double,
    val qty: Double,
    val type: String = "",
    val brand: String = "",
    val size: String = "",
    val unit: String = "pcs",
    val matchedItem: Item? = null,
    val include: Boolean = true
)

class StockRepository(
    private val context: Context,
    private val database: AppDatabase = AppDatabase.getDatabase(context),
    private val supabaseClient: SupabaseClient = SupabaseClient()
) {
    private val tag = "StockRepository"
    private val repositoryScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val allItems: Flow<List<Item>> = database.itemDao().getAllItems()
    val allTransactions: Flow<List<TransactionRecord>> = database.transactionDao().getAllTransactions()
    val recentTransactions: Flow<List<TransactionRecord>> = database.transactionDao().getRecentTransactions(5)
    val allTintLogs: Flow<List<ColorTintLog>> = database.colorTintDao().getAllTintLogs()
    val pendingQueueCount: Flow<Int> = database.syncQueueDao().getCountFlow()

    suspend fun getAllItemsList(): List<Item> = database.itemDao().getAllItemsList()

    private val _syncStatus = MutableStateFlow("Connecting…")
    val syncStatus: StateFlow<String> = _syncStatus.asStateFlow()

    private val _isRealtimeLive = MutableStateFlow(false)
    val isRealtimeLive: StateFlow<Boolean> = _isRealtimeLive.asStateFlow()

    private var realtimeWs: WebSocket? = null
    private var isFlushing = false
    private var autoSyncJob: Job? = null

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

    private val moshi: Moshi = Moshi.Builder()
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
    private val quotationListAdapter = moshi.adapter<List<com.example.data.model.QuotationRecord>>(
        Types.newParameterizedType(List::class.java, com.example.data.model.QuotationRecord::class.java)
    ).serializeNulls()
    private val ledgerAccountListAdapter = moshi.adapter<List<com.example.data.model.LedgerAccount>>(
        Types.newParameterizedType(List::class.java, com.example.data.model.LedgerAccount::class.java)
    ).serializeNulls()
    private val ledgerEntryListAdapter = moshi.adapter<List<com.example.data.model.LedgerEntry>>(
        Types.newParameterizedType(List::class.java, com.example.data.model.LedgerEntry::class.java)
    ).serializeNulls()
    private val purchaseAdapter = moshi.adapter(PurchaseRecord::class.java).serializeNulls()

    init {
        // Start background realtime listener and queue flusher
        initRealtime()
        startPeriodicSync()
    }

    private fun isOnline(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val activeNetwork = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun nowIso(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    private var reconnectJob: Job? = null

    @Synchronized
    fun initRealtime(force: Boolean = false) {
        if (realtimeWs != null && !force) return
        if (force) {
            try { realtimeWs?.close(1000, "reconnect") } catch (e: Exception) {}
            realtimeWs = null
        }
        reconnectJob?.cancel()

        realtimeWs = supabaseClient.connectRealtime(
            coroutineScope = repositoryScope,
            onStatusChanged = { live ->
                _isRealtimeLive.value = live
            },
            onItemChanged = { type, item, oldId ->
                repositoryScope.launch {
                    try {
                        val targetId = item?.id ?: oldId ?: ""
                        val pending = database.syncQueueDao().getAll()
                        val hasPending = pending.any { q ->
                            q.payloadJson.contains(targetId)
                        }
                        if (hasPending) return@launch

                        when (type) {
                            "INSERT", "UPDATE" -> {
                                if (item != null) {
                                    val local = database.itemDao().getItemByIdOnce(item.id)
                                    if (local == null || item.updatedAt >= local.updatedAt) {
                                        database.itemDao().insert(item)
                                    }
                                }
                            }
                            "DELETE" -> {
                                if (oldId != null) {
                                    database.itemDao().deleteById(oldId)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(tag, "Error handling realtime event", e)
                    }
                }
            },
            onCashflowChanged = { type, cashflow, oldId ->
                repositoryScope.launch {
                    try {
                        val targetId = cashflow?.id ?: oldId ?: ""
                        val pending = database.syncQueueDao().getAll()
                        val hasPending = pending.any { q ->
                            q.payloadJson.contains(targetId)
                        }
                        if (hasPending) return@launch

                        when (type) {
                            "INSERT", "UPDATE" -> {
                                if (cashflow != null) {
                                    database.dailyCashflowDao().insert(cashflow)
                                }
                            }
                            "DELETE" -> {
                                if (oldId != null) {
                                    database.dailyCashflowDao().deleteById(oldId)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(tag, "Error handling realtime cashflow event", e)
                    }
                }
            },
            onQuotationChanged = { type, quotation, oldId ->
                repositoryScope.launch {
                    try {
                        val targetId = quotation?.id ?: oldId ?: ""
                        val pending = database.syncQueueDao().getAll()
                        val hasPending = pending.any { q -> q.payloadJson.contains(targetId) }
                        if (hasPending) return@launch
                        when (type) {
                            "INSERT", "UPDATE" -> if (quotation != null) database.quotationDao().insert(quotation)
                            "DELETE" -> if (oldId != null) database.quotationDao().deleteById(oldId)
                        }
                    } catch (e: Exception) { Log.e(tag, "Error handling realtime quotation", e) }
                }
            },
            onLedgerAccountChanged = { type, account, oldId ->
                repositoryScope.launch {
                    try {
                        val targetId = account?.id ?: oldId ?: ""
                        val pending = database.syncQueueDao().getAll()
                        val hasPending = pending.any { q -> q.payloadJson.contains(targetId) }
                        if (hasPending) return@launch
                        when (type) {
                            "INSERT", "UPDATE" -> if (account != null) database.ledgerDao().insertAccount(account)
                            "DELETE" -> if (oldId != null) database.ledgerDao().deleteAccountById(oldId)
                        }
                    } catch (e: Exception) { Log.e(tag, "Error handling realtime ledger account", e) }
                }
            },
            onLedgerEntryChanged = { type, entry, oldId ->
                repositoryScope.launch {
                    try {
                        val targetId = entry?.id ?: oldId ?: ""
                        val pending = database.syncQueueDao().getAll()
                        val hasPending = pending.any { q -> q.payloadJson.contains(targetId) }
                        if (hasPending) return@launch
                        when (type) {
                            "INSERT", "UPDATE" -> if (entry != null) database.ledgerDao().insertEntry(entry)
                            "DELETE" -> if (oldId != null) database.ledgerDao().deleteEntryById(oldId)
                        }
                    } catch (e: Exception) { Log.e(tag, "Error handling realtime ledger entry", e) }
                }
            },
            onStoreProfileChanged = { banner, logo ->
                repositoryScope.launch {
                    val pref = com.example.data.pref.LogoPreferenceManager(context)
                    if (banner != null || logo != null) {
                        pref.saveBannerUrl(banner)
                        pref.saveCustomLogoUrl(logo)
                    }
                }
            },
            onClosedOrFailed = {
                realtimeWs = null
                _isRealtimeLive.value = false
                // Auto-reconnect after 5 seconds matching index.html
                reconnectJob?.cancel()
                reconnectJob = repositoryScope.launch {
                    delay(5000)
                    if (isOnline()) {
                        initRealtime()
                    }
                }
            }
        )
    }

    private fun startPeriodicSync() {
        autoSyncJob?.cancel()
        autoSyncJob = repositoryScope.launch {
            while (isActive) {
                if (isOnline()) {
                    flushQueue()
                }
                delay(15_000)
            }
        }
    }

    private fun parsePendingIds(payloadJson: String): List<String> {
        return try {
            val trimmed = payloadJson.trim()
            if (trimmed.startsWith("[")) {
                val arr = org.json.JSONArray(trimmed)
                val list = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    val item = arr.get(i)
                    if (item is JSONObject) {
                        if (item.has("id")) list.add(item.getString("id"))
                    } else if (item is String) {
                        list.add(item)
                    }
                }
                list
            } else if (trimmed.startsWith("{")) {
                val obj = JSONObject(trimmed)
                if (obj.has("id")) listOf(obj.getString("id")) else emptyList()
            } else {
                listOf(trimmed)
            }
        } catch (e: Exception) {
            listOf(payloadJson)
        }
    }

    suspend fun loadFromRemote() = withContext(Dispatchers.IO) {
        _syncStatus.value = "Loading…"
        try {
            val remoteItems = try { supabaseClient.fetchAllItems() } catch (e: Exception) { null }
            val remoteTx = try { supabaseClient.fetchRecentTransactions(500) } catch (e: Exception) { null }
            val remoteCashflow = try { supabaseClient.fetchAllCashflow() } catch (e: Exception) { null }
            val remoteQuotations = try { supabaseClient.fetchAllQuotations() } catch (e: Exception) { null }
            val remoteLedgerAcc = try { supabaseClient.fetchAllLedgerAccounts() } catch (e: Exception) { null }
            val remoteLedgerEntries = try { supabaseClient.fetchAllLedgerEntries() } catch (e: Exception) { null }

            val pendingQueue = database.syncQueueDao().getAll()

            if (remoteItems != null && remoteItems.isNotEmpty()) database.itemDao().insertAll(remoteItems)
            if (remoteTx != null && remoteTx.isNotEmpty()) database.transactionDao().insertAll(remoteTx)

            // Reconcile Cashflow (Purge records deleted remotely)
            if (remoteCashflow != null) {
                if (remoteCashflow.isNotEmpty()) {
                    database.dailyCashflowDao().insertAll(remoteCashflow)
                }
                val remoteIds = remoteCashflow.map { it.id }.toSet()
                val pendingCashflowIds = pendingQueue
                    .filter { it.type.contains("Cashflow", ignoreCase = true) }
                    .flatMap { parsePendingIds(it.payloadJson) }
                    .toSet()

                val localCashflows = database.dailyCashflowDao().getAllCashflowList()
                for (local in localCashflows) {
                    if (!remoteIds.contains(local.id) && !pendingCashflowIds.contains(local.id)) {
                        database.dailyCashflowDao().deleteById(local.id)
                    }
                }
            }

            // Reconcile Quotations
            if (remoteQuotations != null) {
                if (remoteQuotations.isNotEmpty()) {
                    database.quotationDao().insertAll(remoteQuotations)
                }
                val remoteIds = remoteQuotations.map { it.id }.toSet()
                val pendingQuotationIds = pendingQueue
                    .filter { it.type.contains("Quotation", ignoreCase = true) }
                    .flatMap { parsePendingIds(it.payloadJson) }
                    .toSet()

                val localQuotations = database.quotationDao().getAllQuotationsList()
                for (local in localQuotations) {
                    if (!remoteIds.contains(local.id) && !pendingQuotationIds.contains(local.id)) {
                        database.quotationDao().deleteById(local.id)
                    }
                }
            }

            // Reconcile Ledger Accounts
            if (remoteLedgerAcc != null) {
                if (remoteLedgerAcc.isNotEmpty()) {
                    database.ledgerDao().insertAllAccounts(remoteLedgerAcc)
                }
                val remoteIds = remoteLedgerAcc.map { it.id }.toSet()
                val pendingAccIds = pendingQueue
                    .filter { it.type.contains("LedgerAcc", ignoreCase = true) }
                    .flatMap { parsePendingIds(it.payloadJson) }
                    .toSet()

                val localAccounts = database.ledgerDao().getAllAccountsList()
                for (local in localAccounts) {
                    if (!remoteIds.contains(local.id) && !pendingAccIds.contains(local.id)) {
                        database.ledgerDao().deleteAccountById(local.id)
                    }
                }
            }

            // Reconcile Ledger Entries
            if (remoteLedgerEntries != null) {
                if (remoteLedgerEntries.isNotEmpty()) {
                    database.ledgerDao().insertAllEntries(remoteLedgerEntries)
                }
                val remoteIds = remoteLedgerEntries.map { it.id }.toSet()
                val pendingEntryIds = pendingQueue
                    .filter { it.type.contains("LedgerEntry", ignoreCase = true) }
                    .flatMap { parsePendingIds(it.payloadJson) }
                    .toSet()

                val localEntries = database.ledgerDao().getAllEntriesList()
                for (local in localEntries) {
                    if (!remoteIds.contains(local.id) && !pendingEntryIds.contains(local.id)) {
                        database.ledgerDao().deleteEntryById(local.id)
                    }
                }
            }

            try {
                val (remoteBanner, remoteLogo) = supabaseClient.fetchStoreProfile()
                val pref = com.example.data.pref.LogoPreferenceManager(context)
                if (remoteBanner != null || remoteLogo != null) {
                    pref.saveBannerUrl(remoteBanner)
                    pref.saveCustomLogoUrl(remoteLogo)
                }
            } catch (e: Exception) {
                Log.w(tag, "Failed to sync store profile from Supabase", e)
            }

            _syncStatus.value = "Synced ✓"
            flushQueue()
            initRealtime(force = true)
        } catch (e: Exception) {
            Log.e(tag, "Failed to load from remote", e)
            _syncStatus.value = "Offline · ${e.message ?: "Sync error"}"
            initRealtime()
        }
    }

    suspend fun uploadItemImage(bytes: ByteArray): Result<String> {
        return supabaseClient.uploadImageToCloudinary(bytes)
    }

    suspend fun saveItem(
        id: String?,
        name: String,
        code: String,
        barcode: String,
        type: String,
        brand: String,
        size: String,
        unit: String,
        mrp: Double?,
        cost: Double,
        price: Double,
        low: Double,
        aliases: String,
        openingQty: Double = 0.0,
        imageUrl: String? = null
    ): Item = withContext(Dispatchers.IO) {
        val now = nowIso()
        if (id != null) {
            // Edit existing item
            val existing = database.itemDao().getItemByIdOnce(id)
            val newQty = openingQty
            val updated = Item(
                id = id,
                o = existing?.o ?: 0,
                name = name,
                code = code,
                barcode = barcode,
                type = type,
                brand = brand,
                size = size,
                unit = unit,
                aliases = aliases,
                mrp = mrp,
                cost = cost,
                price = price,
                qty = newQty,
                low = low,
                imageUrl = imageUrl ?: existing?.imageUrl,
                updatedAt = now
            )
            database.itemDao().insert(updated)
            enqueueOp("upsert", itemListAdapter.toJson(listOf(updated)))

            if (existing != null && newQty != existing.qty) {
                val diff = newQty - existing.qty
                val tx = TransactionRecord(
                    clientId = UUID.randomUUID().toString(),
                    itemId = updated.id,
                    itemName = updated.name,
                    action = if (diff > 0) "in" else "out",
                    qty = kotlin.math.abs(diff),
                    balance = newQty,
                    note = "Stock adjustment",
                    unit = updated.unit,
                    createdAt = now
                )
                database.transactionDao().insert(tx)
                enqueueOp("tx", txListAdapter.toJson(listOf(tx)))
            }

            flushQueue()
            updated
        } else {
            // New item
            val maxO = database.itemDao().getMaxOrder() ?: -1
            val newId = System.currentTimeMillis().toString(36) + (1000..9999).random().toString(36)
            val newItem = Item(
                id = newId,
                o = maxO + 1,
                name = name,
                code = code,
                barcode = barcode,
                type = type,
                brand = brand,
                size = size,
                unit = unit,
                aliases = aliases,
                mrp = mrp,
                cost = cost,
                price = price,
                qty = openingQty,
                low = low,
                imageUrl = imageUrl,
                updatedAt = now
            )
            database.itemDao().insert(newItem)
            enqueueOp("upsert", itemListAdapter.toJson(listOf(newItem)))

            if (openingQty != 0.0) {
                val tx = TransactionRecord(
                    clientId = UUID.randomUUID().toString(),
                    itemId = newItem.id,
                    itemName = newItem.name,
                    action = "in",
                    qty = openingQty,
                    balance = openingQty,
                    note = "Opening stock",
                    unit = newItem.unit,
                    createdAt = now
                )
                database.transactionDao().insert(tx)
                enqueueOp("tx", txListAdapter.toJson(listOf(tx)))
            }
            flushQueue()
            newItem
        }
    }

    suspend fun performTransaction(
        itemId: String,
        action: String, // "in" or "out"
        qty: Double,
        note: String
    ): Result<Unit> = withContext(Dispatchers.IO) {
        val item = database.itemDao().getItemByIdOnce(itemId)
            ?: return@withContext Result.failure(Exception("Item not found"))

        val newBalance = if (action == "in") item.qty + qty else item.qty - qty
        val now = nowIso()

        val updatedItem = item.copy(qty = newBalance, updatedAt = now)
        database.itemDao().insert(updatedItem)

        val tx = TransactionRecord(
            clientId = UUID.randomUUID().toString(),
            itemId = item.id,
            itemName = item.name,
            action = action,
            qty = qty,
            balance = newBalance,
            note = note,
            unit = item.unit,
            createdAt = now
        )
        database.transactionDao().insert(tx)

        // Queue for sync
        val patchObj = JSONObject().apply {
            put("qty", newBalance)
            put("updated_at", now)
        }
        enqueueOp("patch", JSONObject().apply {
            put("id", item.id)
            put("patch", patchObj)
        }.toString())

        enqueueOp("tx", txListAdapter.toJson(listOf(tx)))
        flushQueue()
        Result.success(Unit)
    }

    suspend fun deleteItem(id: String) = withContext(Dispatchers.IO) {
        database.itemDao().deleteById(id)
        enqueueOp("delete", id)
        flushQueue()
    }

    suspend fun deleteItems(ids: List<String>) = withContext(Dispatchers.IO) {
        database.itemDao().deleteByIds(ids)
        enqueueOp("deleteBatch", ids.joinToString(","))
        flushQueue()
    }

    suspend fun deleteAllData() = withContext(Dispatchers.IO) {
        database.itemDao().deleteAll()
        enqueueOp("deleteAll", "{}")
        
        database.quotationDao().deleteAll()
        // Remote delete for quotations can be added to SupabaseClient if needed, 
        // for now we follow the same pattern as deleteAll for items
        
        database.ledgerDao().deleteAllAccounts()
        database.ledgerDao().deleteAllEntries()
        
        database.dailyCashflowDao().deleteAll()
        
        flushQueue()
    }

    suspend fun clearTransactionHistory() = withContext(Dispatchers.IO) {
        database.transactionDao().deleteAll()
        enqueueOp("clearTx", "{}")
        flushQueue()
    }

    suspend fun updateBulkType(ids: List<String>, type: String) = withContext(Dispatchers.IO) {
        val now = nowIso()
        val itemsToUpdate = mutableListOf<Item>()
        for (id in ids) {
            val item = database.itemDao().getItemByIdOnce(id)
            if (item != null) {
                val updated = item.copy(type = type, updatedAt = now)
                itemsToUpdate.add(updated)
            }
        }
        database.itemDao().insertAll(itemsToUpdate)
        enqueueOp("upsert", itemListAdapter.toJson(itemsToUpdate))
        flushQueue()
    }

    suspend fun updateBulkUnit(ids: List<String>, unit: String) = withContext(Dispatchers.IO) {
        val now = nowIso()
        val itemsToUpdate = mutableListOf<Item>()
        for (id in ids) {
            val item = database.itemDao().getItemByIdOnce(id)
            if (item != null) {
                val updated = item.copy(unit = unit, updatedAt = now)
                itemsToUpdate.add(updated)
            }
        }
        database.itemDao().insertAll(itemsToUpdate)
        enqueueOp("upsert", itemListAdapter.toJson(itemsToUpdate))
        flushQueue()
    }

    suspend fun updateBulkImage(ids: List<String>, imageUrl: String) = withContext(Dispatchers.IO) {
        val now = nowIso()
        val itemsToUpdate = mutableListOf<Item>()
        for (id in ids) {
            val item = database.itemDao().getItemByIdOnce(id)
            if (item != null) {
                val updated = item.copy(imageUrl = imageUrl, updatedAt = now)
                itemsToUpdate.add(updated)
            }
        }
        database.itemDao().insertAll(itemsToUpdate)
        enqueueOp("upsert", itemListAdapter.toJson(itemsToUpdate))
        flushQueue()
    }

    suspend fun confirmBill(
        supplier: String,
        billNo: String,
        billDate: String,
        rows: List<BillRowData>
    ) = withContext(Dispatchers.IO) {
        val included = rows.filter { it.include && it.name.trim().isNotEmpty() }
        if (included.isEmpty()) return@withContext

        val now = nowIso()
        val allExistingItems = database.itemDao().getAllItemsList()
        val maxO = database.itemDao().getMaxOrder() ?: -1
        var nextO = maxO + 1

        val updatedItems = mutableListOf<Item>()
        val newItems = mutableListOf<Item>()
        val newTransactions = mutableListOf<TransactionRecord>()
        val purchaseLines = mutableListOf<PurchaseLine>()
        var totalAmount = 0.0

        for (row in included) {
            val lineTotal = row.rate * row.qty
            totalAmount += lineTotal

            val matched = row.matchedItem ?: allExistingItems.firstOrNull { it.name.trim().equals(row.name.trim(), ignoreCase = true) }

            if (matched != null) {
                val newQty = matched.qty + row.qty
                val updated = matched.copy(
                    cost = if (row.rate > 0) row.rate else matched.cost,
                    type = if (row.type.isNotEmpty()) row.type else matched.type,
                    brand = if (row.brand.isNotEmpty()) row.brand else matched.brand,
                    size = if (row.size.isNotEmpty()) row.size else matched.size,
                    unit = if (row.unit.isNotEmpty()) row.unit else matched.unit,
                    qty = newQty,
                    updatedAt = now
                )
                updatedItems.add(updated)
                purchaseLines.add(
                    PurchaseLine(
                        itemId = matched.id,
                        name = matched.name,
                        qty = row.qty,
                        rate = row.rate,
                        billName = row.name,
                        created = false
                    )
                )

                if (row.qty > 0) {
                    newTransactions.add(
                        TransactionRecord(
                            clientId = UUID.randomUUID().toString(),
                            itemId = matched.id,
                            itemName = matched.name,
                            action = "in",
                            qty = row.qty,
                            balance = newQty,
                            note = "Bill: ${billNo.ifEmpty { "Purchase" }} (${supplier.ifEmpty { "Supplier" }})",
                            unit = updated.unit,
                            createdAt = now
                        )
                    )
                }
            } else {
                val newId = System.currentTimeMillis().toString(36) + (1000..9999).random().toString(36)
                val newItem = Item(
                    id = newId,
                    o = nextO++,
                    name = row.name.trim(),
                    type = row.type,
                    brand = row.brand,
                    size = row.size,
                    unit = if (row.unit.isNotEmpty()) row.unit else "pcs",
                    cost = row.rate,
                    price = 0.0,
                    qty = row.qty,
                    low = 0.0,
                    updatedAt = now
                )
                newItems.add(newItem)
                purchaseLines.add(
                    PurchaseLine(
                        itemId = newId,
                        name = newItem.name,
                        qty = row.qty,
                        rate = row.rate,
                        billName = row.name,
                        created = true
                    )
                )

                if (row.qty > 0) {
                    newTransactions.add(
                        TransactionRecord(
                            clientId = UUID.randomUUID().toString(),
                            itemId = newId,
                            itemName = newItem.name,
                            action = "in",
                            qty = row.qty,
                            balance = row.qty,
                            note = "Bill: ${billNo.ifEmpty { "Purchase" }} (${supplier.ifEmpty { "Supplier" }})",
                            unit = newItem.unit,
                            createdAt = now
                        )
                    )
                }
            }
        }

        if (updatedItems.isNotEmpty()) {
            database.itemDao().insertAll(updatedItems)
            enqueueOp("upsert", itemListAdapter.toJson(updatedItems))
        }
        if (newItems.isNotEmpty()) {
            database.itemDao().insertAll(newItems)
            enqueueOp("upsert", itemListAdapter.toJson(newItems))
        }
        if (newTransactions.isNotEmpty()) {
            database.transactionDao().insertAll(newTransactions)
            enqueueOp("tx", txListAdapter.toJson(newTransactions))
        }

        val purchaseRecord = PurchaseRecord(
            supplier = supplier,
            billNo = billNo,
            billDate = billDate,
            total = totalAmount,
            lines = purchaseLines
        )
        enqueueOp("purchase", purchaseAdapter.toJson(purchaseRecord))
        flushQueue()
    }

    suspend fun uploadAllToDatabase() = withContext(Dispatchers.IO) {
        _syncStatus.value = "Uploading to DB..."
        database.syncQueueDao().deleteAll()

        val errors = mutableListOf<String>()

        val allCashflow = database.dailyCashflowDao().getAllCashflowList()
        if (allCashflow.isNotEmpty()) {
            try {
                supabaseClient.upsertCashflow(allCashflow)
            } catch (e: Exception) {
                Log.e(tag, "uploadAllToDatabase cashflow failed", e)
                errors.add("Cashflow: ${e.message}")
            }
        }

        val allItems = database.itemDao().getAllItemsList()
        if (allItems.isNotEmpty()) {
            try {
                supabaseClient.upsertItems(allItems)
            } catch (e: Exception) {
                Log.e(tag, "uploadAllToDatabase items failed", e)
                errors.add("Items: ${e.message}")
            }
        }

        val allQuotations = database.quotationDao().getAllQuotationsList()
        if (allQuotations.isNotEmpty()) {
            try {
                supabaseClient.upsertQuotations(allQuotations)
            } catch (e: Exception) {
                Log.e(tag, "uploadAllToDatabase quotations failed", e)
                errors.add("Quotations: ${e.message}")
            }
        }

        val allAccounts = database.ledgerDao().getAllAccountsList()
        if (allAccounts.isNotEmpty()) {
            try {
                supabaseClient.upsertLedgerAccounts(allAccounts)
            } catch (e: Exception) {
                Log.e(tag, "uploadAllToDatabase accounts failed", e)
                errors.add("Accounts: ${e.message}")
            }
        }

        val allEntries = database.ledgerDao().getAllEntriesList()
        if (allEntries.isNotEmpty()) {
            try {
                supabaseClient.upsertLedgerEntries(allEntries)
            } catch (e: Exception) {
                Log.e(tag, "uploadAllToDatabase entries failed", e)
                errors.add("Entries: ${e.message}")
            }
        }

        if (errors.isEmpty()) {
            _syncStatus.value = "Synced ✓"
        } else {
            _syncStatus.value = "Sync error: ${errors.joinToString("; ")}"
        }
    }

    suspend fun importItems(items: List<Item>, replace: Boolean) = withContext(Dispatchers.IO) {
        if (replace) {
            database.itemDao().deleteAll()
            enqueueOp("deleteAll", "{}")
        }
        database.itemDao().insertAll(items)
        enqueueOp("upsert", itemListAdapter.toJson(items))
        flushQueue()
    }

    private suspend fun enqueueOp(type: String, payloadJson: String) {
        database.syncQueueDao().insert(
            SyncQueueItem(type = type, payloadJson = payloadJson)
        )
    }

    suspend fun retrySync() {
        isFlushing = false
        initRealtime(force = true)
        flushQueue()
    }

    suspend fun flushQueue(): Unit = withContext(Dispatchers.IO) {
        if (isFlushing) return@withContext
        val queue = database.syncQueueDao().getAll()
        if (queue.isEmpty()) {
            _syncStatus.value = "Synced ✓"
            return@withContext
        }

        if (!isOnline()) {
            _syncStatus.value = "Offline · ${queue.size} pending"
            return@withContext
        }

        isFlushing = true
        _syncStatus.value = "Syncing ${queue.size} pending…"

        try {
            val opsToDelete = mutableListOf<Long>()
            var lastErrorMsg: String? = null

            for (op in queue) {
                try {
                    when (op.type) {
                        "upsert" -> {
                            val items = itemListAdapter.fromJson(op.payloadJson) ?: emptyList()
                            supabaseClient.upsertItems(items)
                        }
                        "patch" -> {
                            val json = JSONObject(op.payloadJson)
                            val id = json.getString("id")
                            val patch = json.getJSONObject("patch").toString()
                            supabaseClient.patchItem(id, patch)
                        }
                        "delete" -> {
                            supabaseClient.deleteItems(listOf(op.payloadJson))
                        }
                        "deleteBatch" -> {
                            val ids = op.payloadJson.split(",").filter { it.isNotEmpty() }
                            supabaseClient.deleteItems(ids)
                        }
                        "deleteAll" -> {
                            supabaseClient.deleteAllItems()
                        }
                        "tx" -> {
                            val txs = txListAdapter.fromJson(op.payloadJson) ?: emptyList()
                            supabaseClient.insertTransactions(txs)
                        }
                        "clearTx" -> {
                            supabaseClient.clearTransactions()
                        }
                        "purchase" -> {
                            val pur = purchaseAdapter.fromJson(op.payloadJson)
                            if (pur != null) {
                                supabaseClient.insertPurchase(pur)
                            }
                        }
                        "upsertCashflow" -> {
                            val records = cashflowListAdapter.fromJson(op.payloadJson) ?: emptyList()
                            supabaseClient.upsertCashflow(records)
                        }
                        "deleteCashflow" -> {
                            supabaseClient.deleteCashflow(listOf(op.payloadJson))
                        }
                        "upsertQuotations" -> {
                            val items = quotationListAdapter.fromJson(op.payloadJson) ?: emptyList()
                            supabaseClient.upsertQuotations(items)
                        }
                        "deleteQuotation" -> {
                            supabaseClient.deleteQuotations(listOf(op.payloadJson))
                        }
                        "upsertLedgerAcc" -> {
                            val items = ledgerAccountListAdapter.fromJson(op.payloadJson) ?: emptyList()
                            supabaseClient.upsertLedgerAccounts(items)
                        }
                        "deleteLedgerAcc" -> {
                            supabaseClient.deleteLedgerAccounts(listOf(op.payloadJson))
                        }
                        "upsertLedgerEntry" -> {
                            val items = ledgerEntryListAdapter.fromJson(op.payloadJson) ?: emptyList()
                            supabaseClient.upsertLedgerEntries(items)
                        }
                        "deleteLedgerEntry" -> {
                            supabaseClient.deleteLedgerEntries(listOf(op.payloadJson))
                        }
                    }
                    opsToDelete.add(op.id)
                } catch (e: Exception) {
                    Log.e(tag, "Error processing sync item #${op.id} (${op.type})", e)
                    lastErrorMsg = e.message
                    // Discard invalid/failed op so queue is never permanently stuck
                    opsToDelete.add(op.id)
                }
            }

            for (id in opsToDelete) {
                database.syncQueueDao().deleteById(id)
            }

            val remaining = database.syncQueueDao().getAll().size
            if (remaining == 0) {
                _syncStatus.value = "Synced ✓"
            } else {
                _syncStatus.value = "Pending $remaining · ${lastErrorMsg ?: "retry soon"}"
            }
        } catch (e: Exception) {
            Log.e(tag, "Queue flush failed", e)
            val remaining = database.syncQueueDao().getAll().size
            _syncStatus.value = "Pending $remaining · ${e.message ?: "retry soon"}"
        } finally {
            isFlushing = false
        }
    }

    suspend fun clearSyncQueue() = withContext(Dispatchers.IO) {
        database.syncQueueDao().deleteAll()
        _syncStatus.value = "Synced ✓"
    }

    // ==================== QUOTATIONS / ESTIMATES ====================
    val allQuotations: Flow<List<com.example.data.model.QuotationRecord>> = database.quotationDao().getAllQuotations()

    suspend fun saveQuotation(quotation: com.example.data.model.QuotationRecord) = withContext(Dispatchers.IO) {
        database.quotationDao().insert(quotation)
        enqueueOp("upsertQuotations", quotationListAdapter.toJson(listOf(quotation)))
        flushQueue()
    }

    suspend fun deleteQuotation(id: String) = withContext(Dispatchers.IO) {
        database.quotationDao().deleteById(id)
        enqueueOp("deleteQuotation", id)
        flushQueue()
    }

    /**
     * Converts an accepted Quotation into a confirmed Sale:
     * 1. Marks Quotation status as "Converted"
     * 2. Automatically deducts items from stock (Stock OUT)
     * 3. Creates transaction records and queues sync
     */
    suspend fun convertQuotationToSale(quotation: com.example.data.model.QuotationRecord): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val items = com.example.util.InvoicePrintManager.parseLineItems(quotation.itemsJson)
            val updatedQuot = quotation.copy(status = "Converted")
            database.quotationDao().insert(updatedQuot)

            val now = nowIso()
            val txList = mutableListOf<TransactionRecord>()
            val itemsToUpdate = mutableListOf<Item>()

            for (lineItem in items) {
                if (lineItem.itemId != null) {
                    val existing = database.itemDao().getItemByIdOnce(lineItem.itemId)
                    if (existing != null) {
                        val newQty = existing.qty - lineItem.qty
                        val updatedItem = existing.copy(qty = newQty, updatedAt = now)
                        itemsToUpdate.add(updatedItem)

                        val tx = TransactionRecord(
                            clientId = UUID.randomUUID().toString(),
                            itemId = existing.id,
                            itemName = existing.name,
                            action = "out",
                            qty = lineItem.qty,
                            balance = newQty,
                            note = "Sale Est #${quotation.quotationNo} (${quotation.customerName})",
                            unit = existing.unit,
                            createdAt = now
                        )
                        txList.add(tx)
                    }
                }
            }

            if (itemsToUpdate.isNotEmpty()) {
                database.itemDao().insertAll(itemsToUpdate)
                enqueueOp("upsert", itemListAdapter.toJson(itemsToUpdate))
            }
            if (txList.isNotEmpty()) {
                database.transactionDao().insertAll(txList)
                enqueueOp("tx", txListAdapter.toJson(txList))
            }

            flushQueue()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(tag, "Failed to convert quotation to sale", e)
            Result.failure(e)
        }
    }

    // ==================== LEDGER / KHATA ====================
    val allLedgerAccounts: Flow<List<com.example.data.model.LedgerAccount>> = database.ledgerDao().getAllAccounts()

    fun getEntriesForAccount(accountId: String): Flow<List<com.example.data.model.LedgerEntry>> {
        return database.ledgerDao().getEntriesForAccount(accountId)
    }

    suspend fun saveLedgerAccount(account: com.example.data.model.LedgerAccount) = withContext(Dispatchers.IO) {
        database.ledgerDao().insertAccount(account)
        enqueueOp("upsertLedgerAcc", ledgerAccountListAdapter.toJson(listOf(account)))
        flushQueue()
    }

    suspend fun deleteLedgerAccount(id: String) = withContext(Dispatchers.IO) {
        database.ledgerDao().deleteEntriesForAccount(id)
        database.ledgerDao().deleteAccountById(id)
        enqueueOp("deleteLedgerAcc", id)
        flushQueue()
    }

    suspend fun addLedgerEntry(
        accountId: String,
        type: String, // "GAVE" (Debit) or "GOT" (Credit)
        amount: Double,
        date: String,
        description: String,
        billRef: String
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val account = database.ledgerDao().getAccountById(accountId)
                ?: return@withContext Result.failure(Exception("Account not found"))

            // For Customer: GAVE increases balance (they owe you more), GOT decreases balance
            // For Supplier: GOT increases balance (you owe them more), GAVE decreases balance (you paid them)
            val newBalance = if (account.type == "SUPPLIER") {
                if (type == "GOT") account.netBalance + amount else account.netBalance - amount
            } else {
                if (type == "GAVE") account.netBalance + amount else account.netBalance - amount
            }

            val now = nowIso()
            val entry = com.example.data.model.LedgerEntry(
                id = UUID.randomUUID().toString(),
                accountId = accountId,
                type = type,
                amount = amount,
                balanceAfter = newBalance,
                date = date,
                description = description,
                billRef = billRef,
                createdAt = now
            )

            val updatedAccount = account.copy(netBalance = newBalance, updatedAt = now)
            database.ledgerDao().insertEntry(entry)
            database.ledgerDao().insertAccount(updatedAccount)

            enqueueOp("upsertLedgerEntry", ledgerEntryListAdapter.toJson(listOf(entry)))
            enqueueOp("upsertLedgerAcc", ledgerAccountListAdapter.toJson(listOf(updatedAccount)))
            flushQueue()

            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(tag, "Failed to add ledger entry", e)
            Result.failure(e)
        }
    }

    suspend fun updateLedgerEntry(
        updatedEntry: com.example.data.model.LedgerEntry
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            database.ledgerDao().insertEntry(updatedEntry)
            enqueueOp("upsertLedgerEntry", ledgerEntryListAdapter.toJson(listOf(updatedEntry)))
            recalculateAccountBalanceInternal(updatedEntry.accountId)
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(tag, "Failed to update ledger entry", e)
            Result.failure(e)
        }
    }

    suspend fun deleteLedgerEntry(entryId: String, accountId: String) = withContext(Dispatchers.IO) {
        database.ledgerDao().deleteEntryById(entryId)
        enqueueOp("deleteLedgerEntry", entryId)
        recalculateAccountBalanceInternal(accountId)
    }

    val allDailyCashflow: Flow<List<com.example.data.model.DailyCashflowRecord>> = database.dailyCashflowDao().getAllCashflow()

    fun getCashflowForMonth(monthPrefix: String): Flow<List<com.example.data.model.DailyCashflowRecord>> {
        return database.dailyCashflowDao().getCashflowForMonth(monthPrefix)
    }

    suspend fun addDailyCashflow(record: com.example.data.model.DailyCashflowRecord): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            database.dailyCashflowDao().insert(record)
            enqueueOp("upsertCashflow", cashflowListAdapter.toJson(listOf(record)))
            try {
                supabaseClient.upsertCashflow(listOf(record))
            } catch (e: Exception) {
                Log.w(tag, "Direct upsert cashflow failed, queued for background sync", e)
            }
            flushQueue()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(tag, "Failed to insert cashflow record", e)
            Result.failure(e)
        }
    }

    suspend fun updateDailyCashflow(record: com.example.data.model.DailyCashflowRecord): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            database.dailyCashflowDao().update(record)
            enqueueOp("upsertCashflow", cashflowListAdapter.toJson(listOf(record)))
            try {
                supabaseClient.upsertCashflow(listOf(record))
            } catch (e: Exception) {
                Log.w(tag, "Direct update cashflow failed, queued for background sync", e)
            }
            flushQueue()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(tag, "Failed to update cashflow record", e)
            Result.failure(e)
        }
    }

    suspend fun deleteDailyCashflow(id: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            database.dailyCashflowDao().deleteById(id)
            enqueueOp("deleteCashflow", id)
            try {
                supabaseClient.deleteCashflow(listOf(id))
            } catch (e: Exception) {
                Log.w(tag, "Direct delete cashflow failed, queued for background sync", e)
            }
            flushQueue()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(tag, "Failed to delete cashflow record", e)
            Result.failure(e)
        }
    }

    private suspend fun recalculateAccountBalanceInternal(accountId: String) {
        val account = database.ledgerDao().getAccountById(accountId) ?: return
        val entries = database.ledgerDao().getEntriesForAccountOnce(accountId)

        var runningBalance = 0.0
        val updatedEntries = mutableListOf<com.example.data.model.LedgerEntry>()

        for (entry in entries) {
            val netDelta = if (account.type == "SUPPLIER") {
                if (entry.type == "GOT") entry.amount else -entry.amount
            } else {
                if (entry.type == "GAVE") entry.amount else -entry.amount
            }
            runningBalance += netDelta
            if (entry.balanceAfter != runningBalance) {
                updatedEntries.add(entry.copy(balanceAfter = runningBalance))
            }
        }

        for (u in updatedEntries) {
            database.ledgerDao().insertEntry(u)
            enqueueOp("upsertLedgerEntry", ledgerEntryListAdapter.toJson(listOf(u)))
        }

        val updatedAccount = account.copy(netBalance = runningBalance, updatedAt = nowIso())
        database.ledgerDao().insertAccount(updatedAccount)
        enqueueOp("upsertLedgerAcc", ledgerAccountListAdapter.toJson(listOf(updatedAccount)))
        flushQueue()
    }

    suspend fun fetchStoreProfile(): Pair<String?, String?> = supabaseClient.fetchStoreProfile()

    suspend fun saveStoreProfile(bannerUrl: String?, logoUrl: String?) {
        supabaseClient.saveStoreProfile(bannerUrl, logoUrl)
    }

    suspend fun getProcessedTintRecordIds(): Set<String> = withContext(Dispatchers.IO) {
        val fromDb = database.colorTintDao().getAllProcessedRecordIds().toSet()
        val prefs = context.getSharedPreferences("tint_machine_prefs", Context.MODE_PRIVATE)
        val fromPrefs = prefs.getStringSet("processed_tint_ids", emptySet()) ?: emptySet()
        val fromTx = database.transactionDao().getAllTransactionsList()
            .mapNotNull { tx ->
                if (tx.clientId.startsWith("tint_tx_")) {
                    tx.clientId.removePrefix("tint_tx_")
                } else null
            }.toSet()
        val remoteIds = try {
            supabaseClient.fetchProcessedTintIds()
        } catch (_: Exception) {
            emptySet()
        }
        fromDb + fromPrefs + fromTx + remoteIds
    }

    suspend fun processColorMachineImport(
        rows: List<com.example.util.ParsedTintRow>,
        manualItemMappings: Map<String, String> = emptyMap(),
        autoCreateMissing: Boolean = false
    ): Result<ColorMachineImportResult> = withContext(Dispatchers.IO) {
        try {
            val processedIds = getProcessedTintRecordIds().toMutableSet()
            val allCurrentItems = database.itemDao().getAllItemsList().associateBy { it.id }.toMutableMap()
            val deductions = mutableListOf<ColorMachineDeductionItem>()
            val unmapped = mutableListOf<com.example.util.ParsedTintRow>()
            val newTintLogs = mutableListOf<ColorTintLog>()
            val newTransactions = mutableListOf<TransactionRecord>()
            val updatedItemsMap = mutableMapOf<String, Item>()

            var totalLiters = 0.0
            var totalCans = 0
            var newCount = 0
            var skippedCount = 0

            val now = nowIso()

            for (row in rows) {
                if (processedIds.contains(row.tintRecordId)) {
                    skippedCount++
                    continue
                }

                var targetItem: Item? = null
                val manualId = manualItemMappings[row.tintRecordId]
                if (!manualId.isNullOrBlank()) {
                    targetItem = updatedItemsMap[manualId] ?: allCurrentItems[manualId]
                }
                if (targetItem == null) {
                    val candidate = row.matchedItem ?: com.example.util.ColorMachineParser.findBestMatchingItem(
                        productName = row.productName,
                        baseCode = row.baseCode,
                        canFactor = row.canFactor,
                        items = allCurrentItems.values.toList()
                    )
                    if (candidate != null) {
                        targetItem = updatedItemsMap[candidate.id] ?: allCurrentItems[candidate.id]
                    }
                }

                if (targetItem == null && autoCreateMissing) {
                    val cleanFactor = row.canFactor.ifBlank { "1 LIT" }
                    val newItemId = "paint_" + System.currentTimeMillis().toString(36) + (100..999).random()
                    val newItem = Item(
                        id = newItemId,
                        name = "${row.productName} (${row.baseCode}) $cleanFactor",
                        code = row.baseCode,
                        type = "Paint",
                        brand = "Asian Paints",
                        size = cleanFactor,
                        unit = "can",
                        qty = 0.0,
                        updatedAt = now
                    )
                    allCurrentItems[newItemId] = newItem
                    updatedItemsMap[newItemId] = newItem
                    targetItem = newItem
                }

                if (targetItem == null) {
                    unmapped.add(row)
                    continue
                }

                val prevQty = targetItem.qty
                val deductQty = row.deductQty
                val newQty = prevQty - deductQty
                val updatedItem = targetItem.copy(
                    qty = newQty,
                    updatedAt = now
                )

                allCurrentItems[updatedItem.id] = updatedItem
                updatedItemsMap[updatedItem.id] = updatedItem

                val txNote = "Color Tint: Base ${row.baseCode} • ${row.canFactor} Pack (${row.totalLiters} Ltr dispensed)"

                val tx = TransactionRecord(
                    clientId = "tint_tx_${row.tintRecordId}",
                    itemId = updatedItem.id,
                    itemName = updatedItem.name,
                    action = "out",
                    qty = deductQty,
                    balance = newQty,
                    note = txNote,
                    unit = updatedItem.unit,
                    createdAt = if (row.tintTimestampIso.isNotBlank()) row.tintTimestampIso else now
                )
                newTransactions.add(tx)

                val tintLog = ColorTintLog(
                    tintRecordId = row.tintRecordId,
                    productName = row.productName,
                    shadeName = row.shadeName,
                    shadeCode = row.shadeCode,
                    baseCode = row.baseCode,
                    canFactor = row.canFactor,
                    liters = row.totalLiters,
                    noOfCans = row.noOfCans,
                    tintDate = row.tintDateRaw,
                    tintTime = row.tintTimeRaw,
                    tintTimestamp = row.tintTimestampIso,
                    matchedItemId = updatedItem.id,
                    matchedItemName = updatedItem.name,
                    qtyDeducted = deductQty,
                    processedAt = now,
                    colorantUsed = row.colorantUsed,
                    colorantQuantity = row.colorantQuantity
                )
                newTintLogs.add(tintLog)

                processedIds.add(row.tintRecordId)
                totalLiters += row.totalLiters
                totalCans += row.noOfCans
                newCount++

                deductions.add(
                    ColorMachineDeductionItem(
                        row = row,
                        item = updatedItem,
                        previousQty = prevQty,
                        newQty = newQty,
                        deductQty = deductQty,
                        unit = updatedItem.unit
                    )
                )
            }

            if (updatedItemsMap.isNotEmpty()) {
                database.itemDao().insertAll(updatedItemsMap.values.toList())
                for (item in updatedItemsMap.values) {
                    val patchObj = JSONObject().apply {
                        put("qty", item.qty)
                        put("updated_at", now)
                    }
                    enqueueOp("patch", JSONObject().apply {
                        put("id", item.id)
                        put("patch", patchObj)
                    }.toString())
                }
            }

            if (newTransactions.isNotEmpty()) {
                database.transactionDao().insertAll(newTransactions)
                enqueueOp("tx", txListAdapter.toJson(newTransactions))
            }

            if (newTintLogs.isNotEmpty()) {
                database.colorTintDao().insertAll(newTintLogs)
            }

            val prefs = context.getSharedPreferences("tint_machine_prefs", Context.MODE_PRIVATE)
            prefs.edit().putStringSet("processed_tint_ids", HashSet(processedIds)).apply()

            try {
                supabaseClient.saveProcessedTintIds(processedIds)
            } catch (e: Exception) {
                Log.w(tag, "Failed to sync processed tint ids to Supabase: ${e.message}")
            }

            flushQueue()

            Result.success(
                ColorMachineImportResult(
                    totalRows = rows.size,
                    newProcessedCount = newCount,
                    skippedAlreadyProcessedCount = skippedCount,
                    totalLitersDeducted = totalLiters,
                    totalCansDeducted = totalCans,
                    deductions = deductions,
                    unmappedRows = unmapped
                )
            )
        } catch (e: Exception) {
            Log.e(tag, "Error processing color machine import", e)
            Result.failure(e)
        }
    }

    suspend fun processBillScanImport(
        supplierName: String,
        billNumber: String,
        items: List<com.example.util.ParsedBillItem>
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val now = nowIso()
            val allCurrentItems = database.itemDao().getAllItemsList().associateBy { it.id }.toMutableMap()
            val newTransactions = mutableListOf<TransactionRecord>()
            val updatedItems = mutableListOf<Item>()

            for (row in items) {
                val matched = row.matchedItem ?: continue
                val target = allCurrentItems[matched.id] ?: continue

                val newCost = if (row.updatePrice && row.selectedRate > 0) row.selectedRate else target.cost
                val newQty = if (row.addStock) target.qty + row.selectedQty else target.qty

                val updatedItem = target.copy(
                    cost = newCost,
                    price = if (row.updatePrice && row.selectedRate > 0) java.lang.Math.max(target.price, newCost * 1.2) else target.price,
                    qty = newQty,
                    updatedAt = now
                )

                allCurrentItems[updatedItem.id] = updatedItem
                updatedItems.add(updatedItem)

                if (row.addStock && row.selectedQty > 0.0) {
                    val tx = TransactionRecord(
                        clientId = UUID.randomUUID().toString(),
                        itemId = updatedItem.id,
                        itemName = updatedItem.name,
                        action = "in",
                        qty = row.selectedQty,
                        balance = newQty,
                        note = "Bill Scan: Supplier $supplierName (Bill #${billNumber.ifBlank { "N/A" }}) - Rate: ₹${row.selectedRate}",
                        unit = updatedItem.unit,
                        createdAt = now
                    )
                    newTransactions.add(tx)
                }
            }

            if (updatedItems.isNotEmpty()) {
                database.itemDao().insertAll(updatedItems)
                enqueueOp("upsertItems", itemListAdapter.toJson(updatedItems))
            }

            if (newTransactions.isNotEmpty()) {
                database.transactionDao().insertAll(newTransactions)
                enqueueOp("tx", txListAdapter.toJson(newTransactions))
            }

            flushQueue()
            true
        } catch (e: Exception) {
            Log.e(tag, "Error processing bill scan import", e)
            false
        }
    }
}

data class ColorMachineDeductionItem(
    val row: com.example.util.ParsedTintRow,
    val item: Item,
    val previousQty: Double,
    val newQty: Double,
    val deductQty: Double,
    val unit: String
)

data class ColorMachineImportResult(
    val totalRows: Int,
    val newProcessedCount: Int,
    val skippedAlreadyProcessedCount: Int,
    val totalLitersDeducted: Double,
    val totalCansDeducted: Int,
    val deductions: List<ColorMachineDeductionItem>,
    val unmappedRows: List<com.example.util.ParsedTintRow>
)
