package com.example.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.data.model.Item
import com.example.ui.StockViewModel
import com.example.ui.components.SimpleConfirmDialog
import com.example.ui.theme.BrandBlue
import com.example.ui.theme.DangerRed
import com.example.util.ImageModelHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

@Composable
fun ItemDetailScreen(
    itemId: String,
    viewModel: StockViewModel,
    onEditItem: (Item) -> Unit,
    onOpenTransactionDialog: (Item) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val items by viewModel.allItems.collectAsState()
    val isAdmin by viewModel.isAdmin.collectAsState()
    val item = items.firstOrNull { it.id == itemId }

    var showMenu by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var isUploadingImage by remember { mutableStateOf(false) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null && item != null) {
            scope.launch {
                isUploadingImage = true
                viewModel.showToast("Uploading item photo...")
                try {
                    val bytes = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            val bitmap = BitmapFactory.decodeStream(input)
                            if (bitmap != null) {
                                val maxDim = 800
                                val scale = minOf(maxDim.toFloat() / bitmap.width, maxDim.toFloat() / bitmap.height, 1.0f)
                                val scaled = if (scale < 1.0f) {
                                    Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
                                } else bitmap
                                val finalBitmap = if (scaled.hasAlpha()) {
                                    val whiteBg = Bitmap.createBitmap(scaled.width, scaled.height, Bitmap.Config.ARGB_8888)
                                    val canvas = android.graphics.Canvas(whiteBg)
                                    canvas.drawColor(android.graphics.Color.WHITE)
                                    canvas.drawBitmap(scaled, 0f, 0f, null)
                                    whiteBg
                                } else scaled
                                val bos = ByteArrayOutputStream()
                                finalBitmap.compress(Bitmap.CompressFormat.JPEG, 85, bos)
                                bos.toByteArray()
                            } else null
                        }
                    }
                    if (bytes != null && bytes.isNotEmpty()) {
                        val result = viewModel.uploadItemImage(bytes)
                        if (result.isSuccess) {
                            val newUrl = result.getOrNull()
                            val updatedItem = item.copy(imageUrl = newUrl)
                            viewModel.updateItem(updatedItem)
                            viewModel.showToast("Item photo uploaded & synced!")
                        } else {
                            viewModel.showToast("Upload failed: ${result.exceptionOrNull()?.message}")
                        }
                    }
                } catch (e: Exception) {
                    viewModel.showToast("Error: ${e.message}")
                } finally {
                    isUploadingImage = false
                }
            }
        }
    }

    if (item == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text("Item not found", color = MaterialTheme.colorScheme.onSurface)
        }
        return
    }

    val margin = if (item.cost > 0) {
        "%.1f%%".format(((item.price - item.cost) / item.cost) * 100)
    } else {
        "—"
    }
    val stockValue = item.qty * item.cost

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B1120))
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 24.dp)
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            // Main Product Card (Exact matching design from screenshot)
            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                border = BorderStroke(1.dp, Color(0xFF1E293B)),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp)
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Hero Top Banner Image (Height 260dp, full-width, circular close button top-right)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp)
                            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    ) {
                        if (!item.imageUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = ImageModelHelper.rememberImageModel(item.imageUrl),
                                contentDescription = item.name,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(
                                        Brush.linearGradient(
                                            listOf(Color(0xFF1E293B), Color(0xFF0F172A))
                                        )
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(
                                        Icons.Default.CameraAlt,
                                        contentDescription = null,
                                        tint = Color(0xFF64748B),
                                        modifier = Modifier.size(44.dp)
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = "NO IMAGE",
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color(0xFF94A3B8),
                                        letterSpacing = 1.sp
                                    )
                                }
                            }
                        }

                        // Circular Close Button Top Right (Matching screenshot)
                        IconButton(
                            onClick = { viewModel.navigateBack() },
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(12.dp)
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = 0.55f))
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Close",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        // Uploading overlay
                        if (isUploadingImage) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Color.Black.copy(alpha = 0.6f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Text(
                                        "Uploading photo...",
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    // Card Body Details (Matching screenshot)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp)
                    ) {
                        // Title: Item Name
                        Text(
                            text = item.name,
                            fontSize = 21.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )

                        Spacer(modifier = Modifier.height(4.dp))

                        // Subtitle: SKU & Category
                        val categoryStr = item.type.ifBlank { "GENERAL" }
                        val skuStr = item.code.ifBlank { "—" }
                        Text(
                            text = "SKU: $skuStr · Category: $categoryStr",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF94A3B8)
                        )

                        Spacer(modifier = Modifier.height(18.dp))

                        // 2x2 Stats Card Box
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color(0xFF1E293B).copy(alpha = 0.75f))
                                .border(1.dp, Color(0xFF334155).copy(alpha = 0.7f), RoundedCornerShape(16.dp))
                                .padding(16.dp)
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                // Row 1: Purchase Cost & Selling Price
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Purchase Cost",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = Color(0xFF94A3B8)
                                        )
                                        Spacer(modifier = Modifier.height(3.dp))
                                        Text(
                                            text = StockViewModel.formatRupees(item.cost),
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color.White
                                        )
                                    }

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Selling Price",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = Color(0xFF94A3B8)
                                        )
                                        Spacer(modifier = Modifier.height(3.dp))
                                        Text(
                                            text = StockViewModel.formatRupees(item.price),
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF22C55E) // Bright emerald green
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(16.dp))

                                // Row 2: Quantity in Stock & Profit Margin
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Quantity In Stock",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = Color(0xFF94A3B8)
                                        )
                                        Spacer(modifier = Modifier.height(3.dp))
                                        val qtyStr = if (item.qty % 1.0 == 0.0) item.qty.toLong().toString() else "%.1f".format(item.qty)
                                        val unitStr = if (item.unit.isNotBlank()) " ${item.unit}" else " pcs"
                                        Text(
                                            text = "$qtyStr$unitStr",
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF60A5FA) // Indigo/blue accent
                                        )
                                    }

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Profit Margin",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = Color(0xFF94A3B8)
                                        )
                                        Spacer(modifier = Modifier.height(3.dp))
                                        Text(
                                            text = margin,
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color.White
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        // Bottom Action Buttons Row (Attach Photo + Close)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Button(
                                onClick = {
                                    photoPickerLauncher.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                    )
                                },
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFF4F46E5) // Indigo 600
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp)
                            ) {
                                Icon(
                                    Icons.Default.CameraAlt,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = Color.White
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = if (item.imageUrl.isNullOrBlank()) "Attach Photo" else "Change Photo",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }

                            Button(
                                onClick = { viewModel.navigateBack() },
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFF1E293B)
                                ),
                                border = BorderStroke(1.dp, Color(0xFF334155)),
                                modifier = Modifier
                                    .height(48.dp)
                                    .padding(horizontal = 4.dp)
                            ) {
                                Text(
                                    text = "Close",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Secondary Specifications & Actions Card
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                border = BorderStroke(1.dp, Color(0xFF1E293B)),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp)
                ) {
                    Text(
                        text = "Item Specifications",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    DarkDetailKeyValueRow("Barcode", item.barcode.ifEmpty { "—" })
                    DarkDetailKeyValueRow("Brand", item.brand.ifEmpty { "—" })
                    DarkDetailKeyValueRow("Size", item.size.ifEmpty { "—" })
                    DarkDetailKeyValueRow("Unit", item.unit.ifEmpty { "pcs" })
                    DarkDetailKeyValueRow("MRP", item.mrp?.let { StockViewModel.formatRupees(it) } ?: "—")
                    DarkDetailKeyValueRow("Total Stock Value", StockViewModel.formatRupees(stockValue))

                    if (item.aliases.isNotBlank()) {
                        DarkDetailKeyValueRow(
                            "Aliases",
                            item.aliases.split("|").filter { it.isNotBlank() }.joinToString(", ")
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Secondary Action Row: Quick Transaction & Edit
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = { onOpenTransactionDialog(item) },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp)
                        ) {
                            Text("+ New Transaction", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = { onEditItem(item) },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                            border = BorderStroke(1.dp, Color(0xFF475569)),
                            modifier = Modifier.height(44.dp)
                        ) {
                            Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Edit", fontSize = 13.sp)
                        }

                        if (isAdmin) {
                            IconButton(
                                onClick = { showDeleteDialog = true },
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(DangerRed.copy(alpha = 0.15f))
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete", tint = DangerRed)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDeleteDialog) {
        SimpleConfirmDialog(
            title = "Delete item",
            message = "Delete “${item.name}”? This cannot be undone.",
            confirmText = "Delete",
            isDanger = true,
            onConfirm = {
                viewModel.deleteItem(item.id)
                showDeleteDialog = false
            },
            onDismiss = { showDeleteDialog = false }
        )
    }
}

@Composable
fun DarkDetailKeyValueRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = 13.sp,
            color = Color(0xFF94A3B8)
        )
        Text(
            text = value,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Color.White
        )
    }
    HorizontalDivider(color = Color(0xFF1E293B))
}
