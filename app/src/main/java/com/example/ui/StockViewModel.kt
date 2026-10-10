package com.example.ui

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.auth.AuthManager
import com.example.data.model.ColorTintLog
import com.example.data.model.DailyCashflowRecord
import com.example.data.model.DynamicUiConfig
import com.example.data.model.Item
import com.example.data.model.TransactionRecord
import com.example.data.model.LedgerAccount
import com.example.data.model.LedgerEntry
import com.example.data.model.QuotationRecord
import com.example.data.pref.AppLogoStyle
import com.example.data.pref.BankingInfo
import com.example.data.pref.BankingPreferenceManager
import com.example.data.pref.LogoPreferenceManager
import com.example.data.remote.AppUpdateManager
import com.example.data.remote.DynamicUiManager
import com.example.data.remote.UpdateStatus
import com.example.data.repository.BillRowData
import com.example.data.repository.StockRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale

sealed class CurrentScreen {
    object Main : CurrentScreen()
    data class ItemDetail(val itemId: String) : CurrentScreen()
    object BillFlow : CurrentScreen()
    data class LedgerAccountDetail(val accountId: String) : CurrentScreen()
    object GstCalculator : CurrentScreen()
    object SmartSynonymSearch : CurrentScreen()
}

enum class NavigationTab {
    HOME, ITEMS, BILLING, TRANSACTIONS, SETTINGS
}

data class GroupStat(
    val groupKey: String,
    val itemCount: Int,
    val totalQty: Double,
    val percentage: Int
)

class StockViewModel(application: Application) : AndroidViewModel(application) {
    val authManager = AuthManager(application)
    val repository = StockRepository(application)
    val dynamicUiManager = DynamicUiManager(application)
    val appUpdateManager = AppUpdateManager(application)
    val logoPreferenceManager = LogoPreferenceManager(application)
    val bankingPreferenceManager = BankingPreferenceManager(application)
    val bankingInfo: StateFlow<BankingInfo> = bankingPreferenceManager.currentBankingInfo

    private val themePrefs = application.getSharedPreferences("theme_prefs", android.content.Context.MODE_PRIVATE)
    private val _customThemeColor = MutableStateFlow(themePrefs.getString("theme_color", "#4C6FFF") ?: "#4C6FFF")
    val customThemeColor: StateFlow<String> = _customThemeColor.asStateFlow()

    fun setCustomThemeColor(hexColor: String) {
        _customThemeColor.value = hexColor
        themePrefs.edit().putString("theme_color", hexColor).apply()
        showToast("Theme changed successfully")
    }

    val selectedLogo: StateFlow<AppLogoStyle> = logoPreferenceManager.selectedLogo
    val bannerUrl: StateFlow<String?> = logoPreferenceManager.bannerUrl
    val customLogoUrl: StateFlow<String?> = logoPreferenceManager.customLogoUrl

    fun selectLogo(logo: AppLogoStyle) {
        logoPreferenceManager.selectLogo(logo)
        logoPreferenceManager.saveCustomLogoUrl(null)
        viewModelScope.launch {
            try {
                repository.saveStoreProfile(bannerUrl.value, null)
            } catch (e: Exception) {
                Log.e("StockViewModel", "Failed to sync logo to Supabase", e)
            }
        }
        showToast("Logo changed to ${logo.title}")
    }

    fun updateStoreBanner(url: String?) {
        logoPreferenceManager.saveBannerUrl(url)
        viewModelScope.launch {
            try {
                repository.saveStoreProfile(url, customLogoUrl.value)
            } catch (e: Exception) {
                Log.e("StockViewModel", "Failed to sync banner to Supabase", e)
            }
        }
        showToast("Store banner updated & saved!")
    }

    fun updateStoreLogo(url: String?) {
        logoPreferenceManager.saveCustomLogoUrl(url)
        viewModelScope.launch {
            try {
                repository.saveStoreProfile(bannerUrl.value, url)
            } catch (e: Exception) {
                Log.e("StockViewModel", "Failed to sync logo to Supabase", e)
            }
        }
        showToast("Store logo updated & saved!")
    }

    val uiConfig: StateFlow<DynamicUiConfig> = dynamicUiManager.uiConfig
    val isUiConfigRefreshing: StateFlow<Boolean> = dynamicUiManager.isRefreshing
    val lastUiSyncedTime: StateFlow<Long> = dynamicUiManager.lastSyncedTime
    val updateStatus: StateFlow<UpdateStatus> = appUpdateManager.status

    val isAnnouncementDismissed = MutableStateFlow(false)
    val isUpdateBannerDismissed = MutableStateFlow(false)

    val isAuthed: StateFlow<Boolean> = authManager.isAuthed
    val isAdmin: StateFlow<Boolean> = authManager.isAdmin
    val lockRemainingSeconds: StateFlow<Int> = authManager.lockRemainingSeconds

    val syncStatus: StateFlow<String> = repository.syncStatus
    val isRealtimeLive: StateFlow<Boolean> = repository.isRealtimeLive
    val pendingQueueCount: StateFlow<Int> = repository.pendingQueueCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val allItems: StateFlow<List<Item>> = repository.allItems
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allTransactions: StateFlow<List<TransactionRecord>> = repository.allTransactions
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val recentTransactions: StateFlow<List<TransactionRecord>> = repository.recentTransactions
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allQuotations: StateFlow<List<QuotationRecord>> = repository.allQuotations
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allLedgerAccounts: StateFlow<List<LedgerAccount>> = repository.allLedgerAccounts
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allDailyCashflow: StateFlow<List<DailyCashflowRecord>> = repository.allDailyCashflow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allTintLogs: StateFlow<List<ColorTintLog>> = repository.allTintLogs
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _currentScreen = MutableStateFlow<CurrentScreen>(CurrentScreen.Main)
    val currentScreen: StateFlow<CurrentScreen> = _currentScreen.asStateFlow()

    private val _currentTab = MutableStateFlow(NavigationTab.ITEMS)
    val currentTab: StateFlow<NavigationTab> = _currentTab.asStateFlow()

    // Filters and UI state
    val searchQuery = MutableStateFlow("")
    val groupBy = MutableStateFlow("none") // "none", "name", "cost", "price", "type", "brand", "size", "mrp", "unit"
    val selectedGroup = MutableStateFlow<String?>(null)
    val inStockOnly = MutableStateFlow(false)
    val sortOption = MutableStateFlow("o") // "o", "n", "nz", "q", "c"
    val selectedItemIds = MutableStateFlow<Set<String>>(emptySet())
    val isSelectionMode = MutableStateFlow(false)

    private val _toastEvent = MutableSharedFlow<String>()
    val toastEvent: SharedFlow<String> = _toastEvent.asSharedFlow()

    fun showToast(msg: String) {
        viewModelScope.launch { _toastEvent.emit(msg) }
    }

    init {
        // Trigger initial remote load when ViewModel initializes
        viewModelScope.launch {
            repository.loadFromRemote()
        }
        // Fetch dynamic UI config from GitHub
        viewModelScope.launch {
            dynamicUiManager.refreshConfig()
        }
        // Check for latest APK updates from GitHub Releases
        viewModelScope.launch {
            appUpdateManager.checkForUpdates()
        }
    }

    fun refreshUiConfig() {
        viewModelScope.launch {
            val success = dynamicUiManager.refreshConfig()
            if (success) {
                showToast("UI configuration updated from GitHub!")
            } else {
                showToast("Could not reach GitHub. Using offline cached UI.")
            }
        }
    }

    fun checkForUpdates() {
        viewModelScope.launch {
            val result = appUpdateManager.checkForUpdates()
            if (result != null && result.isNewerThanCurrent) {
                showToast("New update found: ${result.tagName}")
            } else {
                showToast("You are on the latest version!")
            }
        }
    }

    fun startDownloadAndInstall(url: String) {
        viewModelScope.launch {
            appUpdateManager.downloadAndInstall(url)
        }
    }

    fun navigateTo(tab: NavigationTab) {
        _currentTab.value = tab
        _currentScreen.value = CurrentScreen.Main
        selectedGroup.value = null
        selectedItemIds.value = emptySet()
        isSelectionMode.value = false
    }

    val billingKhataSubTab = MutableStateFlow(0) // 0 = Quotes / Estimates, 1 = Khata Ledger

    fun setBillingKhataSubTab(subTab: Int) {
        billingKhataSubTab.value = subTab
    }

    fun navigateToQuotes() {
        billingKhataSubTab.value = 0
        navigateTo(NavigationTab.BILLING)
    }

    fun navigateToKhata() {
        billingKhataSubTab.value = 1
        navigateTo(NavigationTab.BILLING)
    }

    fun openItemDetail(itemId: String) {
        _currentScreen.value = CurrentScreen.ItemDetail(itemId)
    }

    fun openBillFlow() {
        _currentScreen.value = CurrentScreen.BillFlow
    }

    fun openGstCalculator() {
        _currentScreen.value = CurrentScreen.GstCalculator
    }

    fun openSmartSynonymSearch() {
        _currentScreen.value = CurrentScreen.SmartSynonymSearch
    }

    fun navigateBack(): Boolean {
        if (_currentScreen.value !is CurrentScreen.Main) {
            _currentScreen.value = CurrentScreen.Main
            return true
        }
        if (selectedGroup.value != null) {
            selectedGroup.value = null
            return true
        }
        if (isSelectionMode.value) {
            isSelectionMode.value = false
            selectedItemIds.value = emptySet()
            return true
        }
        return false
    }

    data class FilterState(
        val query: String,
        val gb: String,
        val sGrp: String?,
        val inStock: Boolean,
        val sort: String
    )

    private val filterStateFlow = combine(
        searchQuery,
        groupBy,
        selectedGroup,
        inStockOnly,
        sortOption
    ) { q, gb, sg, ins, sort ->
        FilterState(q, gb, sg, ins, sort)
    }

    // Filtered items logic
    val filteredItems: StateFlow<List<Item>> = combine(
        allItems,
        filterStateFlow
    ) { items: List<Item>, filters: FilterState ->
        var list: List<Item> = items

        // Filter in stock
        if (filters.inStock) {
            list = list.filter { it.qty > 0 }
        }

        // Filter selected group
        if (filters.sGrp != null && filters.gb != "none") {
            list = list.filter { getGroupKey(it, filters.gb) == filters.sGrp }
        }

        // Sorting
        list = when (filters.sort) {
            "n" -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
            "nz" -> list.sortedWith(compareByDescending(String.CASE_INSENSITIVE_ORDER) { it.name })
            "q" -> list.sortedByDescending { it.qty }
            "c" -> list.sortedByDescending { it.cost }
            else -> list.sortedBy { it.o }
        }

        // Search matching
        val trimmedQuery = filters.query.trim()
        if (trimmedQuery.isNotEmpty()) {
            val scored = list.mapNotNull { item: Item ->
                val score = com.example.util.ItemSearchMatcher.matchScore(item, trimmedQuery)
                if (score > 0) Pair(item, score) else null
            }

            scored.sortedByDescending { it.second }
                .map { it.first }
        } else {
            list
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Grouping stats
    val groupStats: StateFlow<List<GroupStat>> = combine(
        allItems,
        groupBy,
        inStockOnly
    ) { items, gb, inStock ->
        if (gb == "none") return@combine emptyList()
        val list = if (inStock) items.filter { it.qty > 0 } else items
        val map = mutableMapOf<String, Pair<Int, Double>>()

        for (item in list) {
            val key = getGroupKey(item, gb)
            val current = map[key] ?: Pair(0, 0.0)
            map[key] = Pair(current.first + 1, current.second + item.qty)
        }

        val totalQtyAll = list.sumOf { maxOf(it.qty, 0.0) }
        map.keys.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it }).map { k ->
            val p = map[k]!!
            val pct = if (totalQtyAll > 0) ((maxOf(p.second, 0.0) / totalQtyAll) * 100).toInt() else 0
            GroupStat(
                groupKey = k,
                itemCount = p.first,
                totalQty = p.second,
                percentage = pct
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private fun getGroupKey(item: Item, gb: String): String {
        return when (gb) {
            "name" -> item.name.ifEmpty { "—" }
            "cost" -> formatRupees(item.cost)
            "price" -> formatRupees(item.price)
            "type" -> item.type.ifEmpty { "—" }
            "brand" -> item.brand.ifEmpty { "—" }
            "size" -> item.size.ifEmpty { "—" }
            "mrp" -> item.mrp?.let { formatRupees(it) } ?: "—"
            "unit" -> item.unit.ifEmpty { "pcs" }
            else -> "—"
        }
    }

    fun toggleItemSelection(id: String) {
        val current = selectedItemIds.value.toMutableSet()
        if (current.contains(id)) {
            current.remove(id)
        } else {
            current.add(id)
        }
        selectedItemIds.value = current
        if (current.isEmpty()) {
            isSelectionMode.value = false
        }
    }

    fun selectAllFiltered() {
        val allIds = filteredItems.value.map { it.id }.toSet()
        selectedItemIds.value = allIds
    }

    fun updateItem(item: Item) {
        viewModelScope.launch {
            try {
                repository.saveItem(
                    id = item.id,
                    name = item.name,
                    code = item.code,
                    barcode = item.barcode,
                    type = item.type,
                    brand = item.brand,
                    size = item.size,
                    unit = item.unit,
                    mrp = item.mrp,
                    cost = item.cost,
                    price = item.price,
                    low = item.low,
                    aliases = item.aliases,
                    openingQty = item.qty,
                    imageUrl = item.imageUrl
                )
            } catch (e: Exception) {
                Log.e("StockViewModel", "Failed to update item", e)
            }
        }
    }

    fun saveItem(
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
        openingQty: Double,
        imageUrl: String? = null
    ) {
        viewModelScope.launch {
            try {
                repository.saveItem(
                    id = id,
                    name = name,
                    code = code,
                    barcode = barcode,
                    type = type,
                    brand = brand,
                    size = size,
                    unit = unit,
                    mrp = mrp,
                    cost = cost,
                    price = price,
                    low = low,
                    aliases = aliases,
                    openingQty = openingQty,
                    imageUrl = imageUrl
                )
                showToast(if (id != null) "Item updated" else "Item created")
            } catch (e: Exception) {
                showToast("Failed to save: ${e.message}")
            }
        }
    }

    suspend fun uploadItemImage(bytes: ByteArray): Result<String> {
        return repository.uploadItemImage(bytes)
    }

    fun performTransaction(itemId: String, action: String, qty: Double, note: String) {
        viewModelScope.launch {
            val res = repository.performTransaction(itemId, action, qty, note)
            if (res.isSuccess) {
                showToast("Transaction recorded")
            } else {
                showToast("Error: ${res.exceptionOrNull()?.message}")
            }
        }
    }

    fun deleteItem(id: String) {
        viewModelScope.launch {
            repository.deleteItem(id)
            if (_currentScreen.value is CurrentScreen.ItemDetail) {
                _currentScreen.value = CurrentScreen.Main
            }
            showToast("Item deleted")
        }
    }

    fun deleteSelectedItems() {
        val ids = selectedItemIds.value.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            repository.deleteItems(ids)
            selectedItemIds.value = emptySet()
            isSelectionMode.value = false
            showToast("Deleted ${ids.size} items")
        }
    }

    fun updateSelectedType(type: String) {
        val ids = selectedItemIds.value.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            repository.updateBulkType(ids, type)
            selectedItemIds.value = emptySet()
            isSelectionMode.value = false
            showToast("Updated type for ${ids.size} items")
        }
    }

    fun updateSelectedUnit(unit: String) {
        val ids = selectedItemIds.value.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            repository.updateBulkUnit(ids, unit)
            selectedItemIds.value = emptySet()
            isSelectionMode.value = false
            showToast("Updated unit for ${ids.size} items")
        }
    }

    fun updateSelectedImage(imageUrl: String) {
        val ids = selectedItemIds.value.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            repository.updateBulkImage(ids, imageUrl)
            selectedItemIds.value = emptySet()
            isSelectionMode.value = false
            showToast("Updated photo for ${ids.size} items")
        }
    }

    fun confirmBill(supplier: String, billNo: String, billDate: String, rows: List<BillRowData>) {
        viewModelScope.launch {
            repository.confirmBill(supplier, billNo, billDate, rows)
            _currentScreen.value = CurrentScreen.Main
            _currentTab.value = NavigationTab.ITEMS
            showToast("Bill confirmed & synced")
        }
    }

    fun retrySync() {
        viewModelScope.launch {
            repository.retrySync()
            showToast("Retrying sync…")
        }
    }

    fun clearSyncQueue() {
        viewModelScope.launch {
            repository.clearSyncQueue()
            showToast("Pending sync queue cleared")
        }
    }

    fun reconnectRealtime() {
        viewModelScope.launch {
            repository.initRealtime(force = true)
            showToast("Connecting to Realtime…")
        }
    }

    fun reloadFromDatabase() {
        viewModelScope.launch {
            repository.loadFromRemote()
            showToast("Reloaded from database")
        }
    }

    fun uploadAllToDatabase() {
        viewModelScope.launch {
            repository.uploadAllToDatabase()
            val status = repository.syncStatus.value
            if (status.startsWith("Synced")) {
                showToast("All cashflow & data successfully synced to DB ✓")
            } else {
                showToast("Sync result: $status")
            }
        }
    }

    fun clearTransactionHistory() {
        viewModelScope.launch {
            repository.clearTransactionHistory()
            showToast("Transaction history cleared")
        }
    }

    fun deleteAllItems() {
        viewModelScope.launch {
            repository.deleteAllData()
            showToast("All data (items, cashflow, khata, quotes) deleted")
        }
    }

    fun deleteAllData() {
        deleteAllItems()
    }

    fun importItems(items: List<Item>, replace: Boolean) {
        viewModelScope.launch {
            repository.importItems(items, replace)
            showToast("Imported ${items.size} items")
        }
    }

    // ==================== QUOTATION ACTIONS ====================
    fun saveQuotation(quotation: QuotationRecord) {
        viewModelScope.launch {
            repository.saveQuotation(quotation)
            showToast("Saved Estimate #${quotation.quotationNo}")
        }
    }

    fun deleteQuotation(id: String) {
        viewModelScope.launch {
            repository.deleteQuotation(id)
            showToast("Estimate deleted")
        }
    }

    fun convertQuotationToSale(quotation: QuotationRecord) {
        viewModelScope.launch {
            val result = repository.convertQuotationToSale(quotation)
            if (result.isSuccess) {
                showToast("Converted to Sale! Stock deducted & logged ✓")
            } else {
                showToast("Failed to convert: ${result.exceptionOrNull()?.message}")
            }
        }
    }

    // ==================== LEDGER ACTIONS ====================
    fun saveLedgerAccount(account: LedgerAccount) {
        viewModelScope.launch {
            repository.saveLedgerAccount(account)
            showToast("Saved account: ${account.name}")
        }
    }

    fun deleteLedgerAccount(id: String) {
        viewModelScope.launch {
            repository.deleteLedgerAccount(id)
            showToast("Account deleted")
        }
    }

    fun addLedgerEntry(
        accountId: String,
        type: String,
        amount: Double,
        date: String,
        description: String,
        billRef: String
    ) {
        viewModelScope.launch {
            val res = repository.addLedgerEntry(accountId, type, amount, date, description, billRef)
            if (res.isSuccess) {
                showToast("Ledger entry added ✓")
            } else {
                showToast("Error: ${res.exceptionOrNull()?.message}")
            }
        }
    }

    fun getEntriesForAccount(accountId: String): Flow<List<LedgerEntry>> {
        return repository.getEntriesForAccount(accountId)
    }

    fun updateLedgerEntry(updatedEntry: LedgerEntry) {
        viewModelScope.launch {
            val res = repository.updateLedgerEntry(updatedEntry)
            if (res.isSuccess) {
                showToast("Ledger entry updated & balance recalculated ✓")
            } else {
                showToast("Error updating entry: ${res.exceptionOrNull()?.message}")
            }
        }
    }

    fun deleteLedgerEntry(entryId: String, accountId: String) {
        viewModelScope.launch {
            repository.deleteLedgerEntry(entryId, accountId)
            showToast("Entry deleted")
        }
    }

    // Daily Sales & Expenses Cashflow Operations
    fun addDailyCashflow(
        type: String, // "SALE" or "EXPENSE"
        amount: Double,
        title: String,
        category: String,
        paymentMode: String,
        date: String,
        note: String
    ) {
        viewModelScope.launch {
            val cleanTitle = title.trim()
            val cleanCategory = category.trim().ifBlank { cleanTitle.ifBlank { if (type.uppercase() == "SALE") "Counter Sale" else "General Expense" } }
            val cleanDate = date.trim().ifBlank { java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(java.util.Date()) }

            val record = DailyCashflowRecord(
                id = java.util.UUID.randomUUID().toString(),
                type = type.uppercase(),
                amount = amount,
                title = cleanTitle.ifBlank { cleanCategory },
                category = cleanCategory,
                paymentMode = paymentMode.trim().ifBlank { "Cash" },
                date = cleanDate,
                note = note.trim(),
                createdAt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(java.util.Date())
            )
            val res = repository.addDailyCashflow(record)
            if (res.isSuccess) {
                showToast("${if (type == "SALE") "Sale" else "Expense"} of ₹$amount added ✓")
            } else {
                showToast("Error adding record: ${res.exceptionOrNull()?.message}")
            }
        }
    }

    fun updateDailyCashflow(record: DailyCashflowRecord) {
        viewModelScope.launch {
            val res = repository.updateDailyCashflow(record)
            if (res.isSuccess) {
                showToast("Transaction updated ✓")
            } else {
                showToast("Error updating record: ${res.exceptionOrNull()?.message}")
            }
        }
    }

    fun deleteDailyCashflow(id: String) {
        viewModelScope.launch {
            val res = repository.deleteDailyCashflow(id)
            if (res.isSuccess) {
                showToast("Transaction deleted")
            } else {
                showToast("Error deleting: ${res.exceptionOrNull()?.message}")
            }
        }
    }

    data class TintReportImportPayload(
        val rows: List<com.example.util.ParsedTintRow>,
        val rawText: String,
        val fileName: String
    )

    private val _incomingTintReport = MutableStateFlow<TintReportImportPayload?>(null)
    val incomingTintReport: StateFlow<TintReportImportPayload?> = _incomingTintReport.asStateFlow()

    fun clearIncomingTintReport() {
        _incomingTintReport.value = null
    }

    suspend fun getAvailableItemsForMatching(): List<Item> {
        val inMemory = allItems.value
        if (inMemory.isNotEmpty()) return inMemory
        val fromDb = try { repository.getAllItemsList() } catch (_: Exception) { emptyList() }
        if (fromDb.isNotEmpty()) return fromDb
        return try {
            withTimeoutOrNull(2000L) {
                repository.allItems.first { it.isNotEmpty() }
            } ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun parseColorMachineContent(content: String): List<com.example.util.ParsedTintRow> {
        val processedIds = repository.getProcessedTintRecordIds()
        val items = getAvailableItemsForMatching()
        return com.example.util.ColorMachineParser.parse(content, items, processedIds)
    }

    suspend fun parseColorMachineStream(
        inputStream: java.io.InputStream
    ): Pair<List<com.example.util.ParsedTintRow>, String> {
        val processedIds = repository.getProcessedTintRecordIds()
        val items = getAvailableItemsForMatching()
        return com.example.util.ColorMachineParser.parseFromStream(inputStream, items, processedIds)
    }

    fun loadExternalTintReport(context: android.content.Context, uri: android.net.Uri) {
        viewModelScope.launch {
            try {
                val fileName = com.example.util.SpreadsheetReportParser.getFileName(context, uri)
                val stream = context.contentResolver.openInputStream(uri)
                if (stream == null) {
                    showToast("Could not open file: $fileName")
                    return@launch
                }
                val (rows, rawText) = stream.use { s ->
                    parseColorMachineStream(s)
                }

                if (rows.isNotEmpty()) {
                    _incomingTintReport.value = TintReportImportPayload(rows, rawText, fileName)
                    showToast("Opened tint report ($fileName): ${rows.size} records ready for review")
                } else {
                    showToast("No tint dispense records recognized in $fileName")
                }
            } catch (e: Exception) {
                showToast("Failed to parse report: ${e.message}")
            }
        }
    }

    suspend fun processColorMachineImport(
        rows: List<com.example.util.ParsedTintRow>,
        manualItemMappings: Map<String, String> = emptyMap(),
        autoCreateMissing: Boolean = false
    ): Result<com.example.data.repository.ColorMachineImportResult> {
        return repository.processColorMachineImport(rows, manualItemMappings, autoCreateMissing)
    }

    suspend fun processBillScanImport(
        supplierName: String,
        billNumber: String,
        items: List<com.example.util.ParsedBillItem>
    ): Boolean {
        return repository.processBillScanImport(supplierName, billNumber, items)
    }

    fun saveBankDetails(
        bankName: String,
        accountHolder: String,
        accountNumber: String,
        ifscCode: String,
        branchName: String,
        upiId: String
    ) {
        bankingPreferenceManager.saveBankDetails(
            bankName, accountHolder, accountNumber, ifscCode, branchName, upiId
        )
        showToast("Banking details saved successfully!")
    }

    fun saveSignatureFromUri(uri: android.net.Uri, onResult: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            val res = bankingPreferenceManager.saveSignatureFromUri(uri)
            if (res.isSuccess) {
                showToast("Authorized signature uploaded successfully!")
                onResult(true)
            } else {
                showToast("Failed to save signature: ${res.exceptionOrNull()?.message}")
                onResult(false)
            }
        }
    }

    fun saveQrCodeFromUri(uri: android.net.Uri, onResult: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            val res = bankingPreferenceManager.saveQrCodeFromUri(uri)
            if (res.isSuccess) {
                showToast("Payment QR code uploaded successfully!")
                onResult(true)
            } else {
                showToast("Failed to save QR code: ${res.exceptionOrNull()?.message}")
                onResult(false)
            }
        }
    }

    fun clearSignature() {
        bankingPreferenceManager.clearSignature()
        showToast("Signature removed")
    }

    fun clearQrCode() {
        bankingPreferenceManager.clearQrCode()
        showToast("QR code removed")
    }

    companion object {
        fun formatRupees(amount: Double): String {
            return String.format(Locale.ENGLISH, "₹%.2f", amount)
        }
    }
}
