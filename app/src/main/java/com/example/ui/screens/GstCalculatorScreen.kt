package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.DriveFileRenameOutline
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import com.example.ui.StockViewModel
import com.example.ui.theme.BrandBlue
import com.example.ui.theme.DangerRed
import com.example.ui.theme.SuccessGreen
import com.example.ui.theme.WarningAmber
import com.example.util.InvoicePrintManager
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

data class GstInvoiceRow(
    val id: String,
    var itemName: String,
    var hsnCode: String,
    var qty: Double,
    var rate: Double,
    var taxRatePercent: Double, // 0.0, 5.0, 12.0, 18.0, 28.0
    var costPrice: Double = 0.0,
    var unit: String = "pcs",
    var subtitle: String = "",
    var imageUrl: String? = null
)

@Composable
fun GstCalculatorScreen(viewModel: StockViewModel) {
    val context = LocalContext.current
    val allItems by viewModel.allItems.collectAsState()
    var storeGstin by remember { mutableStateOf("27AABCS1234F1Z5") }
    var customerGstin by remember { mutableStateOf("") }
    var customerName by remember { mutableStateOf("") }
    var invoiceNo by remember { mutableStateOf("GST-${System.currentTimeMillis().toString().takeLast(6)}") }
    var invoiceDate by remember { mutableStateOf(SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date())) }
    var isInterState by remember { mutableStateOf(false) } // false = CGST + SGST, true = IGST

    val rows = remember {
        mutableStateListOf<GstInvoiceRow>()
    }

    var transporterId by remember { mutableStateOf("") }
    var vehicleNo by remember { mutableStateOf("") }
    var exportedPdfInfo by remember { mutableStateOf<Pair<File, String>?>(null) }
    var isGeneratingPdf by remember { mutableStateOf(false) }
    var showInvoicePreviewDialog by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()
    val bankingInfo by viewModel.bankingInfo.collectAsState()

    // Calculations
    val taxableTotal = rows.sumOf { it.qty * it.rate }
    val totalTaxAmount = rows.sumOf { (it.qty * it.rate) * (it.taxRatePercent / 100.0) }
    val grandTotal = taxableTotal + totalTaxAmount
    val isEWayBillRequired = grandTotal > 50000.0

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        // Top Bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = { viewModel.navigateBack() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Calculate, contentDescription = null, tint = BrandBlue)
                Spacer(modifier = Modifier.width(8.dp))
                Text("GST Tax Invoice & E-Way Calculator", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.width(48.dp))
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Header Info Card
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("Invoice & GSTIN Details", fontWeight = FontWeight.Bold, color = BrandBlue)
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = storeGstin,
                                onValueChange = { storeGstin = it },
                                label = { Text("Store GSTIN") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = customerGstin,
                                onValueChange = { customerGstin = it },
                                label = { Text("Customer GSTIN (Optional)") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = customerName,
                                onValueChange = { customerName = it },
                                label = { Text("Customer Name / Business") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = invoiceNo,
                                onValueChange = { invoiceNo = it },
                                label = { Text("Invoice No.") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Supply Type: ${if (isInterState) "Inter-State (IGST)" else "Intra-State (CGST + SGST)"}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Switch(
                                checked = isInterState,
                                onCheckedChange = { isInterState = it }
                            )
                        }
                    }
                }
            }

            // E-Way Bill Rule 138 Warning Card if > 50,000
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isEWayBillRequired) WarningAmber.copy(alpha = 0.15f) else SuccessGreen.copy(alpha = 0.12f)
                    ),
                    border = BorderStroke(1.dp, if (isEWayBillRequired) WarningAmber else SuccessGreen)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                if (isEWayBillRequired) Icons.Default.Warning else Icons.Default.Calculate,
                                contentDescription = null,
                                tint = if (isEWayBillRequired) WarningAmber else SuccessGreen,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isEWayBillRequired) "⚠️ E-WAY BILL REQUIRED (Value > ₹50,000)" else "✓ E-Way Bill Optional (Invoice Value ≤ ₹50,000)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = if (isEWayBillRequired) WarningAmber else SuccessGreen
                            )
                        }
                        if (isEWayBillRequired) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("As per Rule 138 of CGST Rules, generation of E-Way Bill is mandatory for movement of goods exceeding ₹50,000.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = transporterId,
                                    onValueChange = { transporterId = it },
                                    label = { Text("Transporter ID / GSTIN") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = vehicleNo,
                                    onValueChange = { vehicleNo = it },
                                    label = { Text("Vehicle No. (e.g. MH12AB1234)") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
            }

            // Items Header & Add Row
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Invoice Items (${rows.size})", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    OutlinedButton(onClick = {
                        rows.add(GstInvoiceRow(System.currentTimeMillis().toString(), "", "8481", 1.0, 100.0, 18.0))
                    }) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Add Item", fontSize = 12.sp)
                    }
                }
            }

            // Invoice Row Editors
            itemsIndexed(rows) { index, row ->
                var isSuggestionsOpen by remember { mutableStateOf(true) }
                val matchingItems = remember(row.itemName, allItems) {
                    val q = row.itemName.trim()
                    if (q.isBlank()) {
                        emptyList()
                    } else {
                        allItems.mapNotNull { dbItem ->
                            val score = com.example.util.ItemSearchMatcher.matchScore(dbItem, q)
                            if (score > 0) Pair(dbItem, score) else null
                        }.sortedByDescending { it.second }
                        .map { it.first }
                        .take(15)
                    }
                }

                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (!row.imageUrl.isNullOrBlank()) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)),
                                    modifier = Modifier.size(50.dp)
                                ) {
                                    AsyncImage(
                                        model = row.imageUrl,
                                        contentDescription = "Item Photo",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }
                                Spacer(modifier = Modifier.width(6.dp))
                            }
                            OutlinedTextField(
                                value = row.itemName,
                                onValueChange = { 
                                    rows[index] = row.copy(itemName = it)
                                    isSuggestionsOpen = true
                                },
                                label = { Text("Item Name (Search DB)") },
                                singleLine = true,
                                modifier = Modifier.weight(2f)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            OutlinedTextField(
                                value = row.hsnCode,
                                onValueChange = { rows[index] = row.copy(hsnCode = it) },
                                label = { Text("HSN/SAC") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = { if (rows.size > 1) rows.removeAt(index) }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete", tint = DangerRed)
                            }
                        }

                        // Prominent Cost Price Tab / Badge (Always visible, internal reference only)
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (row.costPrice > 0.0) BrandBlue.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            border = BorderStroke(1.dp, if (row.costPrice > 0.0) BrandBlue.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.Info,
                                        contentDescription = null,
                                        tint = if (row.costPrice > 0.0) BrandBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Cost Price Tab (DB Ref):",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = "(Excluded from invoice)",
                                        fontSize = 9.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Text(
                                    text = if (row.costPrice > 0.0) "₹%.2f".format(row.costPrice) else "— (Auto-loads on item selection)",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (row.costPrice > 0.0) BrandBlue else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        if (isSuggestionsOpen && matchingItems.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                shadowElevation = 2.dp,
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(4.dp)) {
                                    Text("💡 Matching Inventory Items:", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = BrandBlue, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                                    matchingItems.take(5).forEach { matched ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable {
                                                    val displayName = if (matched.size.isNotBlank() && !matched.name.contains(matched.size, ignoreCase = true)) {
                                                        "${matched.name} ${matched.size}"
                                                    } else {
                                                        matched.name
                                                    }
                                                    val meta = listOf(
                                                        matched.type.ifBlank { null }?.let { "Type: $it" },
                                                        matched.brand.ifBlank { null }?.let { "Brand: $it" },
                                                        matched.size.ifBlank { null }?.let { "Size: $it" }
                                                    ).filterNotNull().joinToString(" • ")

                                                    rows[index] = row.copy(
                                                        itemName = displayName,
                                                        costPrice = matched.cost,
                                                        rate = if (matched.price > 0.0) matched.price else (if (matched.cost > 0.0) matched.cost * 1.18 else row.rate),
                                                        unit = matched.unit,
                                                        subtitle = meta,
                                                        imageUrl = matched.imageUrl
                                                    )
                                                    isSuggestionsOpen = false
                                                }
                                                .padding(horizontal = 8.dp, vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            if (!matched.imageUrl.isNullOrBlank()) {
                                                Surface(
                                                    shape = RoundedCornerShape(4.dp),
                                                    border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)),
                                                    modifier = Modifier.size(36.dp)
                                                ) {
                                                    AsyncImage(
                                                        model = matched.imageUrl,
                                                        contentDescription = null,
                                                        contentScale = ContentScale.Crop,
                                                        modifier = Modifier.fillMaxSize()
                                                    )
                                                }
                                                Spacer(modifier = Modifier.width(8.dp))
                                            }
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(matched.name, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                                val meta = listOf(
                                                    matched.type.ifBlank { null }?.let { "Type: $it" },
                                                    matched.brand.ifBlank { null }?.let { "Brand: $it" },
                                                    matched.size.ifBlank { null }?.let { "Size: $it" }
                                                ).filterNotNull().joinToString(" • ")
                                                if (meta.isNotBlank()) {
                                                    Text(meta, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                }
                                            }
                                            Column(horizontalAlignment = Alignment.End) {
                                                if (matched.cost > 0.0) {
                                                    Surface(
                                                        shape = RoundedCornerShape(4.dp),
                                                        color = BrandBlue.copy(alpha = 0.15f),
                                                        border = BorderStroke(0.5.dp, BrandBlue.copy(alpha = 0.4f)),
                                                        modifier = Modifier.padding(bottom = 2.dp)
                                                    ) {
                                                        Text(
                                                            text = "Cost: ₹${matched.cost}",
                                                            fontSize = 10.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = BrandBlue,
                                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                                        )
                                                    }
                                                }
                                                if (matched.price > 0.0) {
                                                    Text("Sell: ₹${matched.price}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = SuccessGreen)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedTextField(
                                value = row.qty.toString(),
                                onValueChange = { rows[index] = row.copy(qty = it.toDoubleOrNull() ?: 1.0) },
                                label = { Text("Qty") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = row.rate.toString(),
                                onValueChange = { rows[index] = row.copy(rate = it.toDoubleOrNull() ?: 0.0) },
                                label = { Text("Rate (₹)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            // Tax Slab Selector
                            Column(modifier = Modifier.weight(1.2f)) {
                                Text("Tax Slab", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                    listOf(5.0, 12.0, 18.0, 28.0).forEach { slab ->
                                        val selected = row.taxRatePercent == slab
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = if (selected) BrandBlue else MaterialTheme.colorScheme.surfaceVariant,
                                            modifier = Modifier.clickable { rows[index] = row.copy(taxRatePercent = slab) }.padding(2.dp)
                                        ) {
                                            Text(
                                                text = "${slab.toInt()}%",
                                                fontSize = 10.sp,
                                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                                color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Summary Breakdown Footer Card inside LazyColumn
            item {
                Spacer(modifier = Modifier.height(4.dp))
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = BrandBlue.copy(alpha = 0.1f)),
                    border = BorderStroke(1.5.dp, BrandBlue),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Taxable Amount:", fontSize = 13.sp)
                            Text("₹%.2f".format(taxableTotal), fontWeight = FontWeight.Bold)
                        }
                        if (isInterState) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("IGST Total:", fontSize = 13.sp)
                                Text("₹%.2f".format(totalTaxAmount), fontWeight = FontWeight.Bold)
                            }
                        } else {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("CGST Total (${totalTaxAmount / 2 / taxableTotal.coerceAtLeast(1.0) * 100}%):", fontSize = 13.sp)
                                Text("₹%.2f".format(totalTaxAmount / 2), fontWeight = FontWeight.Bold)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("SGST Total:", fontSize = 13.sp)
                                Text("₹%.2f".format(totalTaxAmount / 2), fontWeight = FontWeight.Bold)
                            }
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Grand Total:", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = BrandBlue)
                            Text("₹%.2f".format(grandTotal), fontSize = 18.sp, fontWeight = FontWeight.Bold, color = BrandBlue)
                        }
                    }
                }
            }

            // Banking & Signature Status Banner
            item {
                Spacer(modifier = Modifier.height(4.dp))
                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.AccountBalance, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Banking, QR & Signature for Invoice", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                            val hasSig = bankingInfo.signaturePath != null
                            val hasQr = bankingInfo.qrCodePath != null
                            val bName = if (bankingInfo.bankName.isNotBlank()) bankingInfo.bankName else "Bank details not set"
                            val sigText = if (hasSig) "Signature ✓" else "No Signature"
                            val qrText = if (hasQr) "UPI QR ✓" else "No QR"
                            Text("$bName • $qrText • $sigText", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedButton(
                            onClick = {
                                viewModel.navigateTo(com.example.ui.NavigationTab.SETTINGS)
                            },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Settings", fontSize = 11.sp)
                        }
                    }
                }
            }

            // Generate Button inside LazyColumn
            item {
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            val validRows = rows.filter { it.itemName.isNotBlank() }
                            if (validRows.isEmpty()) {
                                viewModel.showToast("Please enter or select at least one item first!")
                            } else {
                                showInvoicePreviewDialog = true
                            }
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Visibility, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Preview", fontWeight = FontWeight.SemiBold)
                    }

                    Button(
                        onClick = {
                            val validRows = rows.filter { it.itemName.isNotBlank() }
                            if (validRows.isEmpty()) {
                                viewModel.showToast("Please enter or select at least one item first!")
                                return@Button
                            }
                            scope.launch {
                                isGeneratingPdf = true
                                try {
                                    val bInfo = viewModel.bankingInfo.value
                                    val sigBmp = viewModel.bankingPreferenceManager.getSignatureBitmap()
                                    val qrBmp = viewModel.bankingPreferenceManager.getQrCodeBitmap()

                                    val pdfItems = validRows.map { row ->
                                        val taxAmount = (row.qty * row.rate) * (row.taxRatePercent / 100.0)
                                        val bmp = if (!row.imageUrl.isNullOrBlank()) {
                                            InvoicePrintManager.loadBitmap(context, row.imageUrl)
                                        } else null

                                        InvoicePrintManager.GstTaxPdfItem(
                                            name = row.itemName,
                                            hsn = row.hsnCode,
                                            qty = row.qty,
                                            rate = row.rate,
                                            taxRatePercent = row.taxRatePercent,
                                            taxableAmount = row.qty * row.rate,
                                            taxAmount = taxAmount,
                                            totalAmount = (row.qty * row.rate) + taxAmount,
                                            unit = row.unit,
                                            subtitle = row.subtitle,
                                            imageBitmap = bmp // If null, table cell is left BLANK per requirement!
                                        )
                                    }

                                    val file = InvoicePrintManager.createGstTaxInvoicePdf(
                                        context = context,
                                        invoiceNo = invoiceNo,
                                        invoiceDate = invoiceDate,
                                        storeName = viewModel.uiConfig.value.theme.storeTitle.ifBlank { "HARDWARE & TOOLS STORE" },
                                        storeGstin = storeGstin,
                                        customerName = customerName,
                                        customerGstin = customerGstin,
                                        isInterState = isInterState,
                                        items = pdfItems,
                                        taxableTotal = taxableTotal,
                                        totalTaxAmount = totalTaxAmount,
                                        grandTotal = grandTotal,
                                        transporterId = transporterId,
                                        vehicleNo = vehicleNo,
                                        bankingInfo = bInfo,
                                        signatureBitmap = sigBmp,
                                        qrCodeBitmap = qrBmp
                                    )
                                    val cleanInvNo = invoiceNo.replace(Regex("[^a-zA-Z0-9_-]"), "_")
                                    val storagePath = InvoicePrintManager.savePdfToDownloads(
                                        context = context,
                                        sourceFile = file,
                                        displayName = "GST_Invoice_$cleanInvNo.pdf"
                                    )
                                    exportedPdfInfo = Pair(file, storagePath)
                                } catch (e: Exception) {
                                    viewModel.showToast("Failed to generate PDF: ${e.message}")
                                } finally {
                                    isGeneratingPdf = false
                                }
                            }
                        },
                        enabled = !isGeneratingPdf,
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                        modifier = Modifier.weight(1.8f)
                    ) {
                        if (isGeneratingPdf) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Exporting...", fontWeight = FontWeight.Bold)
                        } else {
                            Text("🖨️ Export PDF", fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(150.dp))
            }
        }

        // Invoice Interactive Preview Dialog
        if (showInvoicePreviewDialog) {
            val validRows = rows.filter { it.itemName.isNotBlank() }
            AlertDialog(
                onDismissRequest = { showInvoicePreviewDialog = false },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Visibility, contentDescription = null, tint = BrandBlue)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("GST Tax Invoice Preview", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                },
                text = {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 480.dp),
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surface
                    ) {
                        LazyColumn(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
                            // Invoice Header
                            item {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = BrandBlue,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        Text(viewModel.uiConfig.value.theme.storeTitle.ifBlank { "HARDWARE & TOOLS STORE" }.uppercase(), fontWeight = FontWeight.Bold, color = Color.White, fontSize = 14.sp)
                                        Text("GSTIN: $storeGstin  •  TAX INVOICE", fontSize = 10.sp, color = Color(0xFFE2E8F0))
                                        Text("Inv #: $invoiceNo  |  Date: $invoiceDate", fontSize = 10.sp, color = Color(0xFFE2E8F0))
                                    }
                                }
                                Spacer(modifier = Modifier.height(8.dp))

                                // Billed to
                                Card(
                                    shape = RoundedCornerShape(6.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                                ) {
                                    Column(modifier = Modifier.padding(8.dp)) {
                                        Text("Billed To: ${customerName.ifBlank { "Cash / Retail Customer" }}", fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                        if (customerGstin.isNotBlank()) {
                                            Text("GSTIN: $customerGstin", fontSize = 10.sp)
                                        }
                                        Text("Supply: ${if (isInterState) "Inter-State (IGST)" else "Intra-State (CGST + SGST)"}", fontSize = 10.sp)
                                    }
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            // Items Table Preview
                            item {
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = Color(0xFF334155),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(modifier = Modifier.padding(6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("#", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(18.dp))
                                        Text("Image", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(42.dp))
                                        Text("Item", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                        Text("Qty", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(36.dp))
                                        Text("Rate", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(44.dp))
                                        Text("Total", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(50.dp))
                                    }
                                }
                            }

                            itemsIndexed(validRows) { idx, r ->
                                val rowTotal = (r.qty * r.rate) + ((r.qty * r.rate) * (r.taxRatePercent / 100.0))
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(if (idx % 2 == 0) Color.Transparent else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f))
                                        .padding(horizontal = 6.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("${idx + 1}", fontSize = 10.sp, modifier = Modifier.width(18.dp))
                                    // Image: Show thumbnail if present, LEAVE BLANK if no image!
                                    Box(modifier = Modifier.width(42.dp).height(32.dp), contentAlignment = Alignment.CenterStart) {
                                        if (!r.imageUrl.isNullOrBlank()) {
                                            Surface(
                                                shape = RoundedCornerShape(4.dp),
                                                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)),
                                                modifier = Modifier.size(28.dp)
                                            ) {
                                                AsyncImage(
                                                    model = r.imageUrl,
                                                    contentDescription = null,
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            }
                                        }
                                        // If no image, box is completely blank!
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(r.itemName, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                                        if (r.subtitle.isNotBlank()) {
                                            Text(r.subtitle, fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    Text("%.1f".format(r.qty), fontSize = 10.sp, modifier = Modifier.width(36.dp))
                                    Text("₹%.0f".format(r.rate), fontSize = 10.sp, modifier = Modifier.width(44.dp))
                                    Text("₹%.2f".format(rowTotal), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(50.dp))
                                }
                                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                            }

                            // Summary & Grand Total
                            item {
                                Spacer(modifier = Modifier.height(8.dp))
                                Card(
                                    shape = RoundedCornerShape(6.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                                ) {
                                    Column(modifier = Modifier.padding(8.dp)) {
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text("Taxable Amount:", fontSize = 11.sp)
                                            Text("₹%.2f".format(taxableTotal), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text("Total GST Tax:", fontSize = 11.sp)
                                            Text("₹%.2f".format(totalTaxAmount), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text("Grand Total:", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = BrandBlue)
                                            Text("₹%.2f".format(grandTotal), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = BrandBlue)
                                        }
                                    }
                                }
                                Spacer(modifier = Modifier.height(10.dp))

                                // Banking, QR Code & Signature Preview Footer
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)),
                                    color = Color.White,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        // Bank details
                                        Column(modifier = Modifier.weight(1.3f)) {
                                            Text("BANK DETAILS:", fontWeight = FontWeight.Bold, fontSize = 9.sp, color = BrandBlue)
                                            Text("Bank: ${bankingInfo.bankName.ifBlank { "Store Bank" }}", fontSize = 8.sp, color = Color.DarkGray)
                                            Text("A/C: ${bankingInfo.accountNumber.ifBlank { "-" }}", fontSize = 8.sp, color = Color.DarkGray)
                                            Text("IFSC: ${bankingInfo.ifscCode.ifBlank { "-" }}", fontSize = 8.sp, color = Color.DarkGray)
                                            if (bankingInfo.upiId.isNotBlank()) {
                                                Text("UPI: ${bankingInfo.upiId}", fontSize = 8.sp, color = Color.DarkGray)
                                            }
                                        }

                                        // QR Code if uploaded
                                        if (bankingInfo.qrCodePath != null && File(bankingInfo.qrCodePath!!).exists()) {
                                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 4.dp)) {
                                                Surface(
                                                    shape = RoundedCornerShape(3.dp),
                                                    border = BorderStroke(0.5.dp, Color.LightGray),
                                                    modifier = Modifier.size(44.dp)
                                                ) {
                                                    AsyncImage(
                                                        model = File(bankingInfo.qrCodePath!!),
                                                        contentDescription = null,
                                                        contentScale = ContentScale.Fit,
                                                        modifier = Modifier.fillMaxSize().padding(1.dp)
                                                    )
                                                }
                                                Text("Scan to Pay", fontSize = 7.sp, fontWeight = FontWeight.Bold, color = BrandBlue)
                                            }
                                        }

                                        // Signature if uploaded
                                        Column(horizontalAlignment = Alignment.End, modifier = Modifier.weight(1f)) {
                                            Text("For Store", fontSize = 8.5.sp, fontWeight = FontWeight.Bold, color = Color.DarkGray)
                                            Spacer(modifier = Modifier.height(2.dp))
                                            if (bankingInfo.signaturePath != null && File(bankingInfo.signaturePath!!).exists()) {
                                                AsyncImage(
                                                    model = File(bankingInfo.signaturePath!!),
                                                    contentDescription = null,
                                                    contentScale = ContentScale.Fit,
                                                    modifier = Modifier.height(24.dp).width(60.dp)
                                                )
                                            } else {
                                                Text("[No signature]", fontSize = 8.sp, color = Color.Gray)
                                            }
                                            HorizontalDivider(modifier = Modifier.width(65.dp).padding(vertical = 1.dp), color = Color.Gray)
                                            Text("Authorized Signatory", fontSize = 7.5.sp, color = Color.DarkGray)
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            showInvoicePreviewDialog = false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                    ) {
                        Text("Close Preview")
                    }
                }
            )
        }

        // Exported PDF Location and Action Dialog
        exportedPdfInfo?.let { (file, storagePath) ->
            AlertDialog(
                onDismissRequest = { exportedPdfInfo = null },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = DangerRed)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("PDF Exported Successfully!", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    }
                },
                text = {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "Your GST Tax Invoice PDF has been created and saved to your device storage:",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        // Storage Location Box
                        Card(
                            shape = RoundedCornerShape(8.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Folder, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Storage Location:", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    storagePath,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = BrandBlue
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    "📁 Open the 'Files' or 'Downloads' app on your phone anytime to view or move this file.",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Quick Actions
                        OutlinedButton(
                            onClick = {
                                InvoicePrintManager.openPdf(context, file)
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Open / View PDF")
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Button(
                            onClick = {
                                InvoicePrintManager.sharePdf(context, file, "GST Tax Invoice #$invoiceNo")
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Share via WhatsApp / Email")
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        OutlinedButton(
                            onClick = {
                                InvoicePrintManager.printPdf(context, file, "GST_Invoice_$invoiceNo")
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Print A4 / Save via Android Print")
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { exportedPdfInfo = null }) {
                        Text("Done")
                    }
                }
            )
        }
    }
}
