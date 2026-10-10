package com.example.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.example.data.model.Item
import com.example.ui.StockViewModel
import com.example.ui.components.ValuePickerDialog
import com.example.ui.theme.BrandBlue
import com.example.ui.theme.DangerRed
import com.example.util.ImageModelHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

@Composable
fun ItemFormDialog(
    itemToEdit: Item?,
    viewModel: StockViewModel,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val allItems by viewModel.allItems.collectAsState()
    val isEdit = itemToEdit != null

    var name by remember { mutableStateOf(itemToEdit?.name ?: "") }
    var code by remember { mutableStateOf(itemToEdit?.code ?: "") }
    var barcode by remember { mutableStateOf(itemToEdit?.barcode ?: "") }
    var type by remember { mutableStateOf(itemToEdit?.type ?: "") }
    var brand by remember { mutableStateOf(itemToEdit?.brand ?: "") }
    var size by remember { mutableStateOf(itemToEdit?.size ?: "") }
    var unit by remember { mutableStateOf(itemToEdit?.unit ?: "pcs") }
    var mrp by remember { mutableStateOf(itemToEdit?.mrp?.toString() ?: "") }
    var cost by remember { mutableStateOf(if (isEdit) itemToEdit?.cost?.toString() ?: "" else "") }
    var price by remember { mutableStateOf(if (isEdit) itemToEdit?.price?.toString() ?: "" else "") }
    var openingQty by remember {
        mutableStateOf(
            if (isEdit) {
                itemToEdit?.qty?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: ""
            } else ""
        )
    }
    var lowStock by remember { mutableStateOf(itemToEdit?.low?.toString() ?: "0") }
    var aliases by remember { mutableStateOf(itemToEdit?.aliases ?: "") }
    var imageUrl by remember { mutableStateOf(itemToEdit?.imageUrl) }
    var isUploadingImage by remember { mutableStateOf(false) }

    // Android Photo Picker
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                isUploadingImage = true
                try {
                    val bytes = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            // Compress image to reasonable resolution (max 1024x1024)
                            val originalBitmap = BitmapFactory.decodeStream(input)
                            if (originalBitmap != null) {
                                val maxDimension = 1024
                                val width = originalBitmap.width
                                val height = originalBitmap.height
                                val scale = if (width > maxDimension || height > maxDimension) {
                                    maxDimension.toFloat() / maxOf(width, height)
                                } else 1.0f

                                val scaledBitmap = if (scale < 1.0f) {
                                    Bitmap.createScaledBitmap(
                                        originalBitmap,
                                        (width * scale).toInt(),
                                        (height * scale).toInt(),
                                        true
                                    )
                                } else originalBitmap

                                // Always draw on clean white background canvas to guarantee zero black pixels or alpha artifacts
                                val whiteBg = Bitmap.createBitmap(scaledBitmap.width, scaledBitmap.height, Bitmap.Config.ARGB_8888)
                                val canvas = android.graphics.Canvas(whiteBg)
                                canvas.drawColor(android.graphics.Color.WHITE)
                                canvas.drawBitmap(scaledBitmap, 0f, 0f, null)

                                val outputStream = ByteArrayOutputStream()
                                whiteBg.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
                                outputStream.toByteArray()
                            } else null
                        }
                    }

                    if (bytes != null && bytes.isNotEmpty()) {
                        val result = viewModel.uploadItemImage(bytes)
                        if (result.isSuccess) {
                            imageUrl = result.getOrNull()
                            viewModel.showToast("Image uploaded successfully!")
                        } else {
                            viewModel.showToast("Upload failed: ${result.exceptionOrNull()?.message}")
                        }
                    } else {
                        viewModel.showToast("Could not read image file")
                    }
                } catch (e: Exception) {
                    viewModel.showToast("Error processing image: ${e.message}")
                } finally {
                    isUploadingImage = false
                }
            }
        }
    }

    // Extract existing values from DB
    val typeSuggestions = remember(allItems) {
        allItems.map { it.type.trim() }.filter { it.isNotBlank() }
            .groupingBy { it }.eachCount().toList().sortedByDescending { it.second }
    }
    val brandSuggestions = remember(allItems) {
        allItems.map { it.brand.trim() }.filter { it.isNotBlank() }
            .groupingBy { it }.eachCount().toList().sortedByDescending { it.second }
    }
    val sizeSuggestions = remember(allItems) {
        allItems.map { it.size.trim() }.filter { it.isNotBlank() }
            .groupingBy { it }.eachCount().toList().sortedByDescending { it.second }
    }
    val unitSuggestions = remember(allItems) {
        val defaultUnits = listOf("pcs", "kg", "g", "L", "ml", "box", "pack", "bag", "m", "ft", "cm", "set", "pair", "dozen", "roll", "sheet")
        val existing = allItems.map { it.unit.trim() }.filter { it.isNotBlank() }
        val all = (defaultUnits + existing).distinct()
        all.map { u -> Pair(u, allItems.count { it.unit.trim().equals(u, ignoreCase = true) }) }.sortedByDescending { it.second }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(vertical = 24.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    text = if (isEdit) "Edit item" else "New item",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Image Picker & Preview Card
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(72.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.surface)
                                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(10.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            if (isUploadingImage) {
                                CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
                            } else if (!imageUrl.isNullOrBlank()) {
                                AsyncImage(
                                    model = ImageModelHelper.rememberImageModel(imageUrl),
                                    contentDescription = "Item Photo",
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        Icons.Default.Image,
                                        contentDescription = "No photo",
                                        tint = BrandBlue.copy(alpha = 0.6f),
                                        modifier = Modifier.size(24.dp)
                                    )
                                    Text(
                                        text = "NO IMAGE",
                                        fontSize = 9.sp,
                                        color = BrandBlue,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (!imageUrl.isNullOrBlank()) "Product photo added" else "Product photo (Optional)",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = if (isUploadingImage) "Uploading to Cloudinary..." else "Select image from gallery",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = {
                                        photoPickerLauncher.launch(
                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                        )
                                    },
                                    enabled = !isUploadingImage,
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                    modifier = Modifier.height(34.dp)
                                ) {
                                    Icon(Icons.Default.AddAPhoto, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(if (imageUrl.isNullOrBlank()) "Add Photo" else "Change", fontSize = 12.sp)
                                }

                                if (!imageUrl.isNullOrBlank()) {
                                    OutlinedButton(
                                        onClick = { imageUrl = null },
                                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                        modifier = Modifier.height(34.dp)
                                    ) {
                                        Text("Remove", fontSize = 12.sp, color = DangerRed)
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Item name *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text("SKU") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it },
                    label = { Text("Barcode") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Type Dropdown (ExposedDropdownMenuBox)
                ExposedDbDropdownField(
                    label = "Type",
                    value = type,
                    placeholder = "Select or enter type",
                    onValueChange = { type = it },
                    optionsWithCount = typeSuggestions
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Brand Dropdown (ExposedDropdownMenuBox)
                ExposedDbDropdownField(
                    label = "Brand",
                    value = brand,
                    placeholder = "Select or enter brand",
                    onValueChange = { brand = it },
                    optionsWithCount = brandSuggestions
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Size Dropdown (ExposedDropdownMenuBox)
                ExposedDbDropdownField(
                    label = "Size",
                    value = size,
                    placeholder = "Select or enter size",
                    onValueChange = { size = it },
                    optionsWithCount = sizeSuggestions
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Unit Dropdown (ExposedDropdownMenuBox)
                ExposedDbDropdownField(
                    label = "Unit",
                    value = unit,
                    placeholder = "Select or enter unit",
                    onValueChange = { unit = it },
                    optionsWithCount = unitSuggestions
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = mrp,
                    onValueChange = { mrp = it },
                    label = { Text("MRP (₹)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = cost,
                    onValueChange = { cost = it },
                    label = { Text("Cost (₹)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = price,
                    onValueChange = { price = it },
                    label = { Text("Price (₹)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = openingQty,
                    onValueChange = { openingQty = it },
                    label = { Text(if (isEdit) "Stock quantity" else "Opening quantity") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = lowStock,
                    onValueChange = { lowStock = it },
                    label = { Text("Low-stock alert at (0 = off)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = aliases,
                    onValueChange = { aliases = it },
                    label = { Text("Aliases (separated by |)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(onClick = onDismiss) {
                        Text("Cancel")
                    }
                    Spacer(modifier = Modifier.padding(horizontal = 4.dp))
                    Button(
                        onClick = {
                            if (name.trim().isEmpty()) {
                                viewModel.showToast("Enter item name")
                                return@Button
                            }
                            val parsedQty = openingQty.trim().toDoubleOrNull()
                            val finalQty = parsedQty ?: (if (isEdit) itemToEdit?.qty ?: 0.0 else 0.0)
                            viewModel.saveItem(
                                id = itemToEdit?.id,
                                name = name.trim(),
                                code = code.trim(),
                                barcode = barcode.trim(),
                                type = type.trim(),
                                brand = brand.trim(),
                                size = size.trim(),
                                unit = unit.ifBlank { "pcs" },
                                mrp = mrp.trim().toDoubleOrNull(),
                                cost = cost.trim().toDoubleOrNull() ?: 0.0,
                                price = price.trim().toDoubleOrNull() ?: 0.0,
                                low = lowStock.trim().toDoubleOrNull() ?: 0.0,
                                aliases = aliases.trim(),
                                openingQty = finalQty,
                                imageUrl = imageUrl
                            )
                            onDismiss()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                    ) {
                        Text("Save")
                    }
                }
            }
        }
    }

}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExposedDbDropdownField(
    label: String,
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    optionsWithCount: List<Pair<String, Int>>,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    // Filter options as user types
    val filteredOptions = remember(optionsWithCount, value) {
        val q = value.trim().lowercase()
        if (q.isEmpty()) optionsWithCount
        else optionsWithCount.filter { it.first.lowercase().contains(q) }
    }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier.fillMaxWidth()
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {
                onValueChange(it)
                expanded = true
            },
            label = { Text(label) },
            placeholder = { Text(placeholder) },
            singleLine = true,
            trailingIcon = {
                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
            },
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryEditable)
        )

        if (filteredOptions.isNotEmpty()) {
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                modifier = Modifier.heightIn(max = 240.dp)
            ) {
                filteredOptions.forEach { (option, count) ->
                    DropdownMenuItem(
                        text = {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = option,
                                    fontWeight = if (option.equals(value.trim(), ignoreCase = true)) FontWeight.Bold else FontWeight.Normal
                                )
                                if (count > 0) {
                                    Text(
                                        text = "$count in DB",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        },
                        onClick = {
                            onValueChange(option)
                            expanded = false
                        },
                        contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                    )
                }
            }
        }
    }
}
