package com.example.ui.screens

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FileOpen
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.model.ColorTintLog
import com.example.data.model.Item
import com.example.data.repository.ColorMachineImportResult
import com.example.ui.StockViewModel
import com.example.ui.theme.BrandBlue
import com.example.ui.theme.DangerRed
import com.example.ui.theme.SuccessGreen
import com.example.ui.theme.WarningAmber
import com.example.util.ColorMachineParser
import com.example.util.ParsedTintRow
import kotlinx.coroutines.launch

@Composable
fun ColorMachineTintDialog(
    viewModel: StockViewModel,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val allItems by viewModel.allItems.collectAsState()
    val tintLogs by viewModel.allTintLogs.collectAsState()

    var selectedTab by remember { mutableStateOf(0) } // 0 = Import, 1 = Tint History
    var rawInputText by remember { mutableStateOf("") }
    var parsedRows by remember { mutableStateOf<List<ParsedTintRow>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var isProcessing by remember { mutableStateOf(false) }
    var showPasteDialog by remember { mutableStateOf(false) }
    var importResult by remember { mutableStateOf<ColorMachineImportResult?>(null) }

    // Manual mappings: tintRecordId -> itemId
    val manualMappings = remember { mutableStateMapOf<String, String>() }

    // Auto-load report if sent via external intent
    val incomingReportPayload by viewModel.incomingTintReport.collectAsState()
    androidx.compose.runtime.LaunchedEffect(incomingReportPayload) {
        incomingReportPayload?.let { payload ->
            if (payload.rows.isNotEmpty()) {
                rawInputText = payload.rawText
                val resolved = payload.rows.map { row ->
                    if (row.matchedItem == null && allItems.isNotEmpty()) {
                        val matched = ColorMachineParser.findBestMatchingItem(
                            row.productName,
                            row.baseCode,
                            row.canFactor,
                            allItems
                        )
                        if (matched != null) {
                            val unitClean = matched.unit.trim().lowercase()
                            val isPureBulkLiters = unitClean in listOf("ltr", "l", "liter", "liters", "litre", "litres") &&
                                matched.size.isBlank() &&
                                !Regex("\\b(1|4|10|20)\\s*(ltr|l|lit|liter|litres)\\b", RegexOption.IGNORE_CASE).containsMatchIn(matched.name)
                            val (deductQty, deductUnit) = if (isPureBulkLiters) {
                                Pair(row.totalLiters, "Ltr")
                            } else {
                                Pair(row.noOfCans.toDouble(), if (matched.unit.isNotBlank()) matched.unit else "pcs")
                            }
                            row.copy(
                                matchedItem = matched,
                                deductQty = deductQty,
                                deductUnit = deductUnit
                            )
                        } else row
                    } else row
                }
                parsedRows = resolved
                manualMappings.clear()
                importResult = null
                selectedTab = 0
            }
        }
    }

    // Rematch whenever allItems loads or updates
    androidx.compose.runtime.LaunchedEffect(allItems) {
        if (allItems.isNotEmpty() && parsedRows.isNotEmpty()) {
            val needsRematching = parsedRows.any { it.matchedItem == null }
            if (needsRematching) {
                parsedRows = parsedRows.map { row ->
                    if (row.matchedItem == null) {
                        val matched = ColorMachineParser.findBestMatchingItem(
                            row.productName,
                            row.baseCode,
                            row.canFactor,
                            allItems
                        )
                        if (matched != null) {
                            val unitClean = matched.unit.trim().lowercase()
                            val isPureBulkLiters = unitClean in listOf("ltr", "l", "liter", "liters", "litre", "litres") &&
                                matched.size.isBlank() &&
                                !Regex("\\b(1|4|10|20)\\s*(ltr|l|lit|liter|litres)\\b", RegexOption.IGNORE_CASE).containsMatchIn(matched.name)
                            val (deductQty, deductUnit) = if (isPureBulkLiters) {
                                Pair(row.totalLiters, "Ltr")
                            } else {
                                Pair(row.noOfCans.toDouble(), if (matched.unit.isNotBlank()) matched.unit else "pcs")
                            }
                            row.copy(
                                matchedItem = matched,
                                deductQty = deductQty,
                                deductUnit = deductUnit
                            )
                        } else row
                    } else row
                }
            }
        }
    }

    // Modal to pick item manually
    var selectingRowForMapping by remember { mutableStateOf<ParsedTintRow?>(null) }

    // Filter chip: 0 = All, 1 = New Only, 2 = Already Processed, 3 = Unmatched
    var filterMode by remember { mutableStateOf(0) }

    // File picker launcher supporting .xls, .xlsx, .csc, .csv, .txt
    val fileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                isLoading = true
                try {
                    val stream = context.contentResolver.openInputStream(uri)
                    if (stream != null) {
                        val (rows, rawText) = stream.use { s ->
                            viewModel.parseColorMachineStream(s)
                        }
                        if (rows.isNotEmpty()) {
                            rawInputText = rawText
                            parsedRows = rows
                            manualMappings.clear()
                            importResult = null
                            viewModel.showToast("Loaded ${rows.size} tint records")
                        } else {
                            viewModel.showToast("No tint records recognized in selected file")
                        }
                    } else {
                        viewModel.showToast("Could not open selected file")
                    }
                } catch (e: Exception) {
                    viewModel.showToast("Failed to read file: ${e.message}")
                } finally {
                    isLoading = false
                }
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        val view = androidx.compose.ui.platform.LocalView.current
        androidx.compose.runtime.DisposableEffect(view) {
            val window = (view.parent as? androidx.compose.ui.window.DialogWindowProvider)?.window
            window?.let { w ->
                androidx.core.view.WindowCompat.setDecorFitsSystemWindows(w, false)
            }
            onDispose {}
        }

        Surface(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 12.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Header Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.primaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Palette,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Color Machine Tint Import",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Corob / Smart Tint / CSC Auto Stock Deduction",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                TabRow(selectedTabIndex = selectedTab) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = { Text("Import & Deduct") },
                        icon = { Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp)) }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = { Text("Tint History (${tintLogs.size})") },
                        icon = { Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(18.dp)) }
                    )
                }

                if (selectedTab == 0) {
                    // TAB 0: IMPORT & DEDUCT
                    if (importResult != null) {
                        // SUCCESS RESULT VIEW
                        val res = importResult!!
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = SuccessGreen,
                                modifier = Modifier.size(64.dp)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "Stock Successfully Updated!",
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = SuccessGreen
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Processed ${res.newProcessedCount} new tint operations.",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            if (res.skippedAlreadyProcessedCount > 0) {
                                Text(
                                    text = "${res.skippedAlreadyProcessedCount} older rows were already updated previously and skipped.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Spacer(modifier = Modifier.height(20.dp))

                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(
                                        text = "Summary of Deductions:",
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.titleSmall
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text("• Total Paint Cans Deducted: ${res.totalCansDeducted} cans")
                                    Text("• Total Volume Tinted: ${String.format(java.util.Locale.US, "%.2f", res.totalLitersDeducted)} Ltr")
                                    Text("• Stock Transactions Created: ${res.deductions.size} records")
                                }
                            }

                            Spacer(modifier = Modifier.height(24.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                OutlinedButton(onClick = {
                                    importResult = null
                                    parsedRows = emptyList()
                                }) {
                                    Text("Import Another File")
                                }
                                Button(onClick = onDismiss) {
                                    Text("Done")
                                }
                            }
                        }
                    } else if (parsedRows.isEmpty()) {
                        // NO FILE LOADED YET: SHOW UPLOAD OPTIONS
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator()
                                Spacer(modifier = Modifier.height(16.dp))
                                Text("Reading and parsing tint machine report…")
                            } else {
                                Card(
                                    shape = RoundedCornerShape(16.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(
                                        modifier = Modifier.padding(20.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.FileOpen,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(48.dp)
                                        )
                                        Spacer(modifier = Modifier.height(12.dp))
                                        Text(
                                            text = "Upload Machine Export File",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = "Select your .XLS, .XLSX, .CSV, or .CSC report generated from your tint machine app (Corob, Smart Tint, etc.)",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Spacer(modifier = Modifier.height(16.dp))
                                        Button(
                                            onClick = {
                                                fileLauncher.launch(
                                                    arrayOf(
                                                        "application/vnd.ms-excel",
                                                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                                        "text/csv",
                                                        "text/comma-separated-values",
                                                        "text/plain",
                                                        "*/*"
                                                    )
                                                )
                                            },
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Choose .XLS / .XLSX / .CSV Report")
                                        }
                                        Spacer(modifier = Modifier.height(10.dp))
                                        OutlinedButton(
                                            onClick = { showPasteDialog = true },
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Icon(Icons.Default.ContentPaste, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Or Paste Report Text")
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(20.dp))

                                // Information Card
                                Card(
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.Info, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Smart Features:", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                                        }
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Text(
                                            text = "• Automatic Stock Deduction: Automatically deducts can count or exact liters from your inventory based on CAN_FACTOR.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(
                                            text = "• Duplicate Protection: If you upload a file containing already updated dates & times, those rows will be skipped automatically and only new tints will be deducted.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(
                                            text = "• Date & Time Preserved: Stock movements are recorded with the exact machine tint date & time.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    } else {
                        val newCount = parsedRows.count { !it.isAlreadyProcessed }
                        val alreadyCount = parsedRows.count { it.isAlreadyProcessed }
                        val unmatchedCount = parsedRows.count { !it.isAlreadyProcessed && (it.matchedItem == null && manualMappings[it.tintRecordId] == null) }
                        val totalLiters = parsedRows.filter { !it.isAlreadyProcessed }.sumOf { it.totalLiters }

                        val filteredRows = when (filterMode) {
                            1 -> parsedRows.filter { !it.isAlreadyProcessed }
                            2 -> parsedRows.filter { it.isAlreadyProcessed }
                            3 -> parsedRows.filter { !it.isAlreadyProcessed && (it.matchedItem == null && manualMappings[it.tintRecordId] == null) }
                            else -> parsedRows
                        }

                        Column(modifier = Modifier.fillMaxSize()) {
                            // Top Stats Card
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text(
                                                text = "${parsedRows.size} Tint Records Found",
                                                fontWeight = FontWeight.Bold,
                                                style = MaterialTheme.typography.titleMedium
                                            )
                                            Text(
                                                text = "$newCount New • $alreadyCount Skipped • $unmatchedCount Unmatched",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = if (unmatchedCount > 0) DangerRed else MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                        BadgePill(
                                            text = "${String.format(java.util.Locale.US, "%.1f", totalLiters)} Ltr Total",
                                            bgColor = MaterialTheme.colorScheme.primary,
                                            textColor = Color.White
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(10.dp))

                                    // Filter chips
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        FilterChip(
                                            selected = filterMode == 0,
                                            onClick = { filterMode = 0 },
                                            label = { Text("All (${parsedRows.size})", fontSize = 11.sp) }
                                        )
                                        FilterChip(
                                            selected = filterMode == 1,
                                            onClick = { filterMode = 1 },
                                            label = { Text("New ($newCount)", fontSize = 11.sp) }
                                        )
                                        FilterChip(
                                            selected = filterMode == 2,
                                            onClick = { filterMode = 2 },
                                            label = { Text("Skipped ($alreadyCount)", fontSize = 11.sp) }
                                        )
                                        FilterChip(
                                            selected = filterMode == 3,
                                            onClick = { filterMode = 3 },
                                            label = { Text("Unmatched ($unmatchedCount)", fontSize = 11.sp) }
                                        )
                                    }
                                }
                            }

                            // Items List
                            LazyColumn(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                                contentPadding = PaddingValues(bottom = 48.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                items(filteredRows) { row ->
                                    val manualMappedId = manualMappings[row.tintRecordId]
                                    val effectiveItem = if (manualMappedId != null) {
                                        allItems.find { it.id == manualMappedId }
                                    } else if (row.matchedItem != null && allItems.any { it.id == row.matchedItem?.id }) {
                                        allItems.find { it.id == row.matchedItem?.id }
                                    } else if (row.matchedItem != null) {
                                        row.matchedItem
                                    } else {
                                        ColorMachineParser.findBestMatchingItem(row.productName, row.baseCode, row.canFactor, allItems)
                                    }

                                    if (row.matchedItem == null && effectiveItem != null) {
                                        row.matchedItem = effectiveItem
                                    }

                                    TintRowCard(
                                        row = row,
                                        matchedItem = effectiveItem,
                                        onSelectMapping = {
                                            selectingRowForMapping = row
                                        },
                                        onDelete = {
                                            parsedRows = parsedRows.filter { it.tintRecordId != row.tintRecordId }
                                            manualMappings.remove(row.tintRecordId)
                                        }
                                    )
                                }
                            }

                            // Bottom Action Bar
                            Surface(
                                tonalElevation = 8.dp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .navigationBarsPadding()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    OutlinedButton(
                                        onClick = {
                                            parsedRows = emptyList()
                                            manualMappings.clear()
                                        },
                                        modifier = Modifier.height(48.dp)
                                    ) {
                                        Text("Clear")
                                    }

                                    Button(
                                        onClick = {
                                            scope.launch {
                                                isProcessing = true
                                                try {
                                                    val res = viewModel.processColorMachineImport(
                                                        rows = parsedRows,
                                                        manualItemMappings = manualMappings.toMap(),
                                                        autoCreateMissing = true
                                                    )
                                                    if (res.isSuccess) {
                                                        importResult = res.getOrNull()
                                                        parsedRows = parsedRows.map { it.copy(isAlreadyProcessed = true) }
                                                    } else {
                                                        viewModel.showToast("Error: ${res.exceptionOrNull()?.message}")
                                                    }
                                                } finally {
                                                    isProcessing = false
                                                }
                                            }
                                        },
                                        enabled = newCount > 0 && !isProcessing,
                                        colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
                                        modifier = Modifier.height(48.dp)
                                    ) {
                                        if (isProcessing) {
                                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White)
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Deducting Stock…")
                                        } else {
                                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("Apply Deductions ($newCount New)")
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // TAB 1: TINT HISTORY
                    if (tintLogs.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    imageVector = Icons.Default.History,
                                    contentDescription = null,
                                    modifier = Modifier.size(48.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = "No Machine Tint History Yet",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "When you import .CSC or .CSV reports, all tinted shades and date/time logs will be archived here.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                            contentPadding = PaddingValues(bottom = 32.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(tintLogs) { log ->
                                TintHistoryCard(log = log)
                            }
                        }
                    }
                }
            }
        }
    }

    // Modal to paste CSV / CSC content manually
    if (showPasteDialog) {
        var pasteText by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showPasteDialog = false },
            title = { Text("Paste Machine Report") },
            text = {
                Column {
                    Text(
                        text = "Paste the raw CSV or CSC text copied from your tinting machine:",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = pasteText,
                        onValueChange = { pasteText = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp),
                        placeholder = { Text("DEALER_CODE,DEALER_NAME,MACHINE_TYPE,...\n383594,Shahjahan Hardware,corob,...", fontSize = 11.sp) }
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (pasteText.isNotBlank()) {
                            scope.launch {
                                rawInputText = pasteText
                                parsedRows = viewModel.parseColorMachineContent(pasteText)
                                manualMappings.clear()
                                showPasteDialog = false
                            }
                        }
                    }
                ) {
                    Text("Parse & Review")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPasteDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Modal to manually select an inventory item for a row
    if (selectingRowForMapping != null) {
        val row = selectingRowForMapping!!
        var searchQuery by remember { mutableStateOf(row.productName.take(10)) }

        val filteredItems = remember(searchQuery, allItems) {
            if (searchQuery.isBlank()) allItems.take(20)
            else allItems.filter {
                it.name.contains(searchQuery, ignoreCase = true) ||
                it.code.contains(searchQuery, ignoreCase = true) ||
                it.brand.contains(searchQuery, ignoreCase = true)
            }.take(30)
        }

        AlertDialog(
            onDismissRequest = { selectingRowForMapping = null },
            title = {
                Column {
                    Text("Match Inventory Item", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = "${row.productName} (${row.baseCode}) ${row.canFactor}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Search items…") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp)
                    ) {
                        items(filteredItems) { item ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        manualMappings[row.tintRecordId] = item.id
                                        selectingRowForMapping = null
                                    }
                                    .padding(vertical = 10.dp, horizontal = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.name, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    Text(
                                        text = "Size: ${item.size.ifBlank { "-" }} • Code: ${item.code.ifBlank { "-" }} • Qty: ${item.qty} ${item.unit}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Button(
                                    onClick = {
                                        manualMappings[row.tintRecordId] = item.id
                                        selectingRowForMapping = null
                                    },
                                    modifier = Modifier.height(32.dp)
                                ) {
                                    Text("Pick", fontSize = 12.sp)
                                }
                            }
                            HorizontalDivider()
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { selectingRowForMapping = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun TintRowCard(
    row: ParsedTintRow,
    matchedItem: Item?,
    onSelectMapping: () -> Unit,
    onDelete: () -> Unit
) {
    val isProcessed = row.isAlreadyProcessed
    val cardBg = if (isProcessed) {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
    } else {
        MaterialTheme.colorScheme.surface
    }

    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (isProcessed) Color.Transparent else MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                shape = RoundedCornerShape(12.dp)
            )
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // Header: Date/Time + Status Badge + Delete Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${row.tintDateRaw} • ${row.tintTimeRaw}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isProcessed) {
                        BadgePill(
                            text = "Already Deducted ✓",
                            bgColor = Color.LightGray.copy(alpha = 0.4f),
                            textColor = Color.DarkGray
                        )
                    } else {
                        BadgePill(
                            text = "NEW (Will Deduct)",
                            bgColor = SuccessGreen.copy(alpha = 0.15f),
                            textColor = SuccessGreen
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    IconButton(
                        onClick = onDelete,
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Remove item from report",
                            tint = DangerRed,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Product & Base Details
            Text(
                text = row.productName,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Base: ${row.baseCode}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text("•", color = MaterialTheme.colorScheme.outline)
                Text(
                    text = "${row.canFactor} Pack (×${row.noOfCans})",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = SuccessGreen
                )
                Text("•", color = MaterialTheme.colorScheme.outline)
                Text(
                    text = "Total: ${String.format(java.util.Locale.US, "%.1f", row.totalLiters)} Ltr",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Size, Brand, Type Pills (CRITICAL User requirement)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                BadgePill(
                    text = "Size: ${matchedItem?.size?.ifBlank { null } ?: row.canFactor}",
                    bgColor = MaterialTheme.colorScheme.primaryContainer,
                    textColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
                BadgePill(
                    text = "Brand: ${matchedItem?.brand?.ifBlank { null } ?: "Asian Paints"}",
                    bgColor = MaterialTheme.colorScheme.secondaryContainer,
                    textColor = MaterialTheme.colorScheme.onSecondaryContainer
                )
                BadgePill(
                    text = "Type: ${matchedItem?.type?.ifBlank { null } ?: "Paint"}",
                    bgColor = MaterialTheme.colorScheme.tertiaryContainer,
                    textColor = MaterialTheme.colorScheme.onTertiaryContainer
                )
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Matched Item Section showing which liter it is deducting from
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (matchedItem != null) {
                    val qtyFormatted = if (row.deductQty == row.deductQty.toInt().toDouble()) "${row.deductQty.toInt()}" else "${row.deductQty}"
                    val willDeduct = "$qtyFormatted ${row.deductUnit}"
                    val currentQty = matchedItem.qty.coerceAtLeast(0.0)
                    val newQty = (matchedItem.qty - row.deductQty).coerceAtLeast(0.0)

                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Deducting from: ${matchedItem.name} (${row.canFactor} Pack)",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        if (!isProcessed) {
                            Text(
                                text = "Stock: $currentQty → $newQty (Deduct -$willDeduct)",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (newQty <= 0.0 && currentQty <= 0.0) DangerRed else SuccessGreen
                            )
                        }
                    }
                } else {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = WarningAmber, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Column {
                            Text(
                                text = "No direct stock match",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = WarningAmber
                            )
                            Text(
                                text = "Will auto-create or tap Match",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                if (!isProcessed) {
                    OutlinedButton(
                        onClick = onSelectMapping,
                        modifier = Modifier.height(32.dp)
                    ) {
                        Text(if (matchedItem != null) "Change" else "Match", fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun TintHistoryCard(log: ColorTintLog) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${log.tintDate} • ${log.tintTime}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                BadgePill(
                    text = "-${log.qtyDeducted} deducted",
                    bgColor = DangerRed.copy(alpha = 0.12f),
                    textColor = DangerRed
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = log.productName,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.bodyMedium
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Base: ${log.baseCode}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )
                Text("•", color = MaterialTheme.colorScheme.outline)
                Text(
                    text = "${log.canFactor} Pack (${log.noOfCans} cans / ${String.format(java.util.Locale.US, "%.1f", log.liters)} Ltr)",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = SuccessGreen
                )
            }

            if (log.matchedItemName != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Deducted from: ${log.matchedItemName} (${log.canFactor} Pack)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
