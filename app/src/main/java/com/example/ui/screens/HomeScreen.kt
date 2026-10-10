package com.example.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.util.ImageModelHelper
import com.example.R
import com.example.data.model.TransactionRecord
import com.example.data.remote.UpdateStatus
import com.example.ui.NavigationTab
import com.example.ui.StockViewModel
import com.example.ui.theme.BrandAmber
import com.example.ui.theme.BrandBlue
import com.example.ui.theme.DangerRed
import com.example.ui.theme.SuccessGreen
import com.example.ui.theme.WarningAmber
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Locale

// Custom tap & long press modifier for banner and logo
fun Modifier.onLongPress3s(onLongPress: () -> Unit): Modifier = pointerInput(Unit) {
    detectTapGestures(
        onTap = { onLongPress() },
        onLongPress = { onLongPress() }
    )
}

@Composable
fun HomeScreen(viewModel: StockViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val items by viewModel.allItems.collectAsState()
    val recentTx by viewModel.recentTransactions.collectAsState()
    val uiConfig by viewModel.uiConfig.collectAsState()
    val updateStatus by viewModel.updateStatus.collectAsState()
    val isAnnouncementDismissed by viewModel.isAnnouncementDismissed.collectAsState()
    val isUpdateBannerDismissed by viewModel.isUpdateBannerDismissed.collectAsState()
    val quotations by viewModel.allQuotations.collectAsState()
    val ledgerAccounts by viewModel.allLedgerAccounts.collectAsState()
    val selectedLogo by viewModel.selectedLogo.collectAsState()
    val bannerUrl by viewModel.bannerUrl.collectAsState()
    val customLogoUrl by viewModel.customLogoUrl.collectAsState()
    val isRealtimeLive by viewModel.isRealtimeLive.collectAsState()

    var isUploadingBanner by remember { mutableStateOf(false) }
    var isUploadingLogo by remember { mutableStateOf(false) }
    var showColorMachineDialog by remember { mutableStateOf(false) }

    // Cover Banner Photo Picker
    val bannerPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                isUploadingBanner = true
                viewModel.showToast("Uploading new banner to Cloudinary...")
                try {
                    val bytes = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            val bitmap = BitmapFactory.decodeStream(input)
                            if (bitmap != null) {
                                val maxW = 1600
                                val maxH = 900
                                val scale = minOf(maxW.toFloat() / bitmap.width, maxH.toFloat() / bitmap.height, 1.0f)
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
                            val url = result.getOrNull()
                            viewModel.updateStoreBanner(url)
                        } else {
                            viewModel.showToast("Banner upload failed: ${result.exceptionOrNull()?.message}")
                        }
                    }
                } catch (e: Exception) {
                    viewModel.showToast("Error: ${e.message}")
                } finally {
                    isUploadingBanner = false
                }
            }
        }
    }

    // Store Logo Photo Picker
    val logoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                isUploadingLogo = true
                viewModel.showToast("Uploading new logo to Cloudinary...")
                try {
                    val bytes = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            val bitmap = BitmapFactory.decodeStream(input)
                            if (bitmap != null) {
                                val maxDim = 512
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
                            val url = result.getOrNull()
                            viewModel.updateStoreLogo(url)
                        } else {
                            viewModel.showToast("Logo upload failed: ${result.exceptionOrNull()?.message}")
                        }
                    }
                } catch (e: Exception) {
                    viewModel.showToast("Error: ${e.message}")
                } finally {
                    isUploadingLogo = false
                }
            }
        }
    }

    val totalItems = items.size
    val totalQty = items.sumOf { it.qty }
    val costVal = items.sumOf { it.qty * it.cost }
    val priceVal = items.sumOf { it.qty * it.price }
    val profit = priceVal - costVal
    val lowStockCount = items.count { it.qty < 0 || (it.low > 0 && it.qty <= it.low) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
    ) {
        // Dynamic Announcement Banner from Server-Driven UI (changes immediately without APK reinstall)
        if (uiConfig.announcement.enabled && !isAnnouncementDismissed && uiConfig.announcement.message.isNotBlank()) {
            item {
                Spacer(modifier = Modifier.height(12.dp))
                val bannerBg = when (uiConfig.announcement.severity) {
                    "warning" -> WarningAmber.copy(alpha = 0.15f)
                    "alert" -> DangerRed.copy(alpha = 0.15f)
                    "success" -> SuccessGreen.copy(alpha = 0.15f)
                    else -> BrandBlue.copy(alpha = 0.12f)
                }
                val bannerIcon = when (uiConfig.announcement.severity) {
                    "warning" -> Icons.Default.Warning
                    "alert" -> Icons.Default.Warning
                    else -> Icons.Default.Info
                }
                val bannerTint = when (uiConfig.announcement.severity) {
                    "warning" -> WarningAmber
                    "alert" -> DangerRed
                    "success" -> SuccessGreen
                    else -> BrandBlue
                }

                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = bannerBg),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(imageVector = bannerIcon, contentDescription = null, tint = bannerTint)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = uiConfig.announcement.message,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f)
                        )
                        if (uiConfig.announcement.dismissible) {
                            IconButton(onClick = { viewModel.isAnnouncementDismissed.value = true }) {
                                Icon(Icons.Default.Close, contentDescription = "Dismiss", modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }

        // In-App Seamless Auto-Updater Banner
        when (val status = updateStatus) {
            is UpdateStatus.Available -> {
                if (!isUpdateBannerDismissed) {
                    item {
                        Spacer(modifier = Modifier.height(12.dp))
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.SystemUpdate,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "New Update Available (${status.info.tagName})",
                                            fontWeight = FontWeight.Bold,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                        Text(
                                            text = status.info.title,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                                        )
                                    }
                                    IconButton(onClick = { viewModel.isUpdateBannerDismissed.value = true }) {
                                        Icon(Icons.Default.Close, contentDescription = "Dismiss")
                                    }
                                }
                                Spacer(modifier = Modifier.height(10.dp))
                                Button(
                                    onClick = { viewModel.startDownloadAndInstall(status.info.apkDownloadUrl) },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                                ) {
                                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Install Update In 1 Tap")
                                }
                            }
                        }
                    }
                }
            }
            is UpdateStatus.Downloading -> {
                item {
                    Spacer(modifier = Modifier.height(12.dp))
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Download, contentDescription = null, tint = BrandBlue)
                                Spacer(modifier = Modifier.width(10.dp))
                                Text(
                                    text = "Downloading update... ${(status.progress * 100).toInt()}%",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            LinearProgressIndicator(
                                progress = { status.progress },
                                modifier = Modifier.fillMaxWidth(),
                                color = BrandBlue
                            )
                        }
                    }
                }
            }
            is UpdateStatus.ReadyToInstall -> {
                item {
                    Spacer(modifier = Modifier.height(12.dp))
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = SuccessGreen.copy(alpha = 0.15f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = SuccessGreen)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Update Downloaded!", fontWeight = FontWeight.Bold)
                                Text("Ready to install on your device.", style = MaterialTheme.typography.bodySmall)
                            }
                            Button(
                                onClick = { viewModel.appUpdateManager.installApk(status.apkFile) },
                                colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen)
                            ) {
                                Text("Install")
                            }
                        }
                    }
                }
            }
            else -> {}
        }

        item {
            val selectedLogo by viewModel.selectedLogo.collectAsState()
            val isRealtimeLive by viewModel.isRealtimeLive.collectAsState()

            Spacer(modifier = Modifier.height(14.dp))

            // Facebook-style Cover Photo & Profile Card
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Facebook Cover Photo Banner (Click or long press to change)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .clickable {
                                viewModel.showToast("Opening photo picker for Cover Banner...")
                                bannerPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            }
                            .onLongPress3s {
                                viewModel.showToast("Opening photo picker for Cover Banner...")
                                bannerPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            }
                    ) {
                        if (!bannerUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = ImageModelHelper.rememberImageModel(bannerUrl),
                                contentDescription = "Store Cover Banner",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop,
                                error = painterResource(id = R.drawable.img_store_cover_banner_1791306669322),
                                fallback = painterResource(id = R.drawable.img_store_cover_banner_1791306669322)
                            )
                        } else {
                            Image(
                                painter = painterResource(id = R.drawable.img_store_cover_banner_1791306669322),
                                contentDescription = "Store Cover Banner",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        }

                        // Elegant gradient vignette
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    androidx.compose.ui.graphics.Brush.verticalGradient(
                                        colors = listOf(
                                            Color.Black.copy(alpha = 0.2f),
                                            Color.Black.copy(alpha = 0.65f)
                                        )
                                    )
                                )
                        )

                        if (isUploadingBanner) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Color.Black.copy(alpha = 0.6f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Updating banner...", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        // Top right: Live Sync Status Pill
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = if (isRealtimeLive) SuccessGreen.copy(alpha = 0.92f) else Color.Black.copy(alpha = 0.65f),
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(Color.White)
                                )
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(
                                    text = if (isRealtimeLive) "LIVE SYNC" else "LOCAL READY",
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color.White,
                                    letterSpacing = 0.5.sp
                                )
                            }
                        }
                    }

                    // Profile details with Overlapping Avatar (3s long press to change)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                    ) {
                        // Overlapping Avatar positioned halfway across cover boundary
                        Box(
                            modifier = Modifier
                                .offset(y = (-36).dp)
                                .size(72.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surface)
                                .border(3.dp, MaterialTheme.colorScheme.surface, CircleShape)
                                .clickable {
                                    viewModel.showToast("Opening photo picker for Logo...")
                                    logoPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                }
                                .onLongPress3s {
                                    viewModel.showToast("Opening photo picker for Logo...")
                                    logoPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                }
                        ) {
                            if (!customLogoUrl.isNullOrBlank()) {
                                AsyncImage(
                                    model = ImageModelHelper.rememberImageModel(customLogoUrl),
                                    contentDescription = "Store Custom Logo",
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(CircleShape),
                                    contentScale = ContentScale.Crop,
                                    error = painterResource(id = selectedLogo.resId),
                                    fallback = painterResource(id = selectedLogo.resId)
                                )
                            } else {
                                Image(
                                    painter = painterResource(id = selectedLogo.resId),
                                    contentDescription = selectedLogo.title,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(CircleShape),
                                    contentScale = ContentScale.Crop
                                )
                            }

                            if (isUploadingLogo) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(Color.Black.copy(alpha = 0.5f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White, strokeWidth = 2.5.dp)
                                }
                            }
                        }
                    }

                    // Store Title, Verification & Tagline
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 16.dp, end = 16.dp, top = 0.dp, bottom = 14.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = uiConfig.theme.storeTitle.ifBlank { "S.A.HARDWARE" },
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Black,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = "Verified Store",
                                tint = BrandBlue,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        if (uiConfig.theme.tagline.isNotBlank()) {
                            Text(
                                text = uiConfig.theme.tagline,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Facebook-Style Action Buttons Row
                        if (uiConfig.features.showQuickActions) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                // + Quick Bill Primary Button
                                Button(
                                    onClick = { viewModel.openBillFlow() },
                                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.weight(1.2f),
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp, horizontal = 10.dp)
                                ) {
                                    Icon(Icons.Default.Receipt, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("+ Quick Bill", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }

                                // Quotes Button
                                FilledTonalButton(
                                    onClick = { viewModel.navigateToQuotes() },
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.weight(1f),
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp, horizontal = 8.dp)
                                ) {
                                    Icon(Icons.Default.Description, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Quotes (${quotations.size})", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }

                                // Khata Button
                                FilledTonalButton(
                                    onClick = { viewModel.navigateToKhata() },
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.weight(1f),
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp, horizontal = 8.dp)
                                ) {
                                    Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, modifier = Modifier.size(15.dp), tint = SuccessGreen)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Khata (${ledgerAccounts.size})", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }

                            // Tint Machine Report Opener Button
                            FilledTonalButton(
                                onClick = { showColorMachineDialog = true },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp, horizontal = 10.dp)
                            ) {
                                Icon(Icons.Default.Palette, contentDescription = null, modifier = Modifier.size(15.dp), tint = BrandBlue)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Tint Machine Report (.XLS / .CSV)", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }

                            // GST Calculator Button
                            Button(
                                onClick = { viewModel.openGstCalculator() },
                                colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp, horizontal = 6.dp)
                            ) {
                                Text("📊 GST & E-Way Calc", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
        }

        if (lowStockCount > 0 && uiConfig.features.showLowStockAlert) {
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp)
                        .clickable {
                            viewModel.inStockOnly.value = false
                            viewModel.navigateTo(NavigationTab.ITEMS)
                        }
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = DangerRed
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "$lowStockCount items low or negative in stock",
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Text(
                                text = "Tap to review items in inventory",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.8f)
                            )
                        }
                    }
                }
            }
        }

        item {
            // Stats Grid 2 columns
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                StatCard(
                    title = "Items",
                    value = "$totalItems",
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "Total quantity",
                    value = if (totalQty % 1.0 == 0.0) totalQty.toLong().toString() else "%.1f".format(totalQty),
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                StatCard(
                    title = "Stock value (cost)",
                    value = StockViewModel.formatRupees(costVal),
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "Stock value (price)",
                    value = StockViewModel.formatRupees(priceVal),
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                StatCard(
                    title = "Potential profit",
                    value = StockViewModel.formatRupees(profit),
                    valueColor = if (profit >= 0) SuccessGreen else DangerRed,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "Low / negative stock",
                    value = "$lowStockCount",
                    valueColor = if (lowStockCount > 0) DangerRed else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Recent Transactions",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                TextButton(onClick = { viewModel.navigateTo(NavigationTab.TRANSACTIONS) }) {
                    Text("View all")
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        if (recentTx.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No transactions yet.\nOpen an item and tap + New.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        } else {
            items(recentTx) { tx ->
                TransactionRowItem(
                    tx = tx,
                    onItemClick = {
                        if (!tx.itemId.isNullOrEmpty()) {
                            viewModel.openItemDetail(tx.itemId)
                        }
                    }
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
            }
        }

        item {
            Spacer(modifier = Modifier.height(80.dp))
        }
    }

    if (showColorMachineDialog) {
        ColorMachineTintDialog(
            viewModel = viewModel,
            onDismiss = { showColorMachineDialog = false }
        )
    }
}

@Composable
fun StatCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface
) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = value,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = valueColor,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun TransactionRowItem(
    tx: TransactionRecord,
    onItemClick: () -> Unit
) {
    val isIn = tx.action == "in"
    val dateFormatted = remember(tx.createdAt) {
        try {
            val sdfIn = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            val date = sdfIn.parse(tx.createdAt.take(19))
            val sdfOut = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
            date?.let { sdfOut.format(it) } ?: tx.createdAt
        } catch (e: Exception) {
            tx.createdAt
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onItemClick)
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = tx.itemName,
                fontWeight = FontWeight.Medium,
                style = MaterialTheme.typography.bodyLarge
            )
            Spacer(modifier = Modifier.height(2.dp))
            val noteDetails = listOfNotNull(
                dateFormatted,
                tx.note.takeIf { it.isNotBlank() }
            ).joinToString(" · ")
            Text(
                text = noteDetails,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Column(horizontalAlignment = Alignment.End) {
            val sign = if (isIn) "+" else "−"
            val qtyStr = if (tx.qty % 1.0 == 0.0) tx.qty.toLong().toString() else "%.1f".format(tx.qty)
            val unitStr = if (tx.unit != "pcs" && tx.unit.isNotBlank()) " ${tx.unit}" else ""
            Text(
                text = "$sign$qtyStr$unitStr",
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                color = if (isIn) SuccessGreen else DangerRed
            )
            Text(
                text = "Bal ${if (tx.balance % 1.0 == 0.0) tx.balance.toLong().toString() else "%.1f".format(tx.balance)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
