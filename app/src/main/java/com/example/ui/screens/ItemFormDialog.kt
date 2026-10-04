package com.example.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.model.Item
import com.example.ui.StockViewModel
import com.example.ui.components.ValuePickerDialog
import com.example.ui.theme.BrandBlue

@Composable
fun ItemFormDialog(
    itemToEdit: Item?,
    viewModel: StockViewModel,
    onDismiss: () -> Unit
) {
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
    var openingQty by remember { mutableStateOf("") }
    var lowStock by remember { mutableStateOf(itemToEdit?.low?.toString() ?: "0") }
    var aliases by remember { mutableStateOf(itemToEdit?.aliases ?: "") }

    var pickerField by remember { mutableStateOf<String?>(null) } // "type", "brand", "size", "unit"

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

                // Type Field with DB suggestions & full picker
                DatabaseAutocompleteField(
                    label = "Type",
                    value = type,
                    placeholder = "e.g. Pipe, Fitting, Tool",
                    onValueChange = { type = it },
                    dbSuggestions = typeSuggestions,
                    onOpenFullPicker = { pickerField = "type" }
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Brand Field with DB suggestions & full picker
                DatabaseAutocompleteField(
                    label = "Brand",
                    value = brand,
                    placeholder = "e.g. Bosch, Astral, Tata",
                    onValueChange = { brand = it },
                    dbSuggestions = brandSuggestions,
                    onOpenFullPicker = { pickerField = "brand" }
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Size Field with DB suggestions & full picker
                DatabaseAutocompleteField(
                    label = "Size",
                    value = size,
                    placeholder = "e.g. 1/2 inch, 10mm, 1L",
                    onValueChange = { size = it },
                    dbSuggestions = sizeSuggestions,
                    onOpenFullPicker = { pickerField = "size" }
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Unit Field with DB suggestions & full picker
                DatabaseAutocompleteField(
                    label = "Unit",
                    value = unit,
                    placeholder = "e.g. pcs, kg, box",
                    onValueChange = { unit = it },
                    dbSuggestions = unitSuggestions,
                    onOpenFullPicker = { pickerField = "unit" }
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

                if (!isEdit) {
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = openingQty,
                        onValueChange = { openingQty = it },
                        label = { Text("Opening quantity") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

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
                                openingQty = openingQty.trim().toDoubleOrNull() ?: 0.0
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

    // Field Picker Dialogs (Shows all distinct items from DB with counts)
    pickerField?.let { field ->
        val counts = when (field) {
            "type" -> typeSuggestions
            "brand" -> brandSuggestions
            "size" -> sizeSuggestions
            "unit" -> unitSuggestions
            else -> emptyList()
        }

        ValuePickerDialog(
            title = "Select ${field.replaceFirstChar { it.uppercase() }} from DB",
            optionsWithCount = counts,
            currentValue = when (field) {
                "type" -> type
                "brand" -> brand
                "size" -> size
                "unit" -> unit
                else -> ""
            },
            onSelect = { selectedVal ->
                when (field) {
                    "type" -> type = selectedVal
                    "brand" -> brand = selectedVal
                    "size" -> size = selectedVal
                    "unit" -> unit = selectedVal.ifBlank { "pcs" }
                }
                pickerField = null
            },
            onDismiss = { pickerField = null }
        )
    }
}

@Composable
private fun DatabaseAutocompleteField(
    label: String,
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    dbSuggestions: List<Pair<String, Int>>,
    onOpenFullPicker: () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            placeholder = { Text(placeholder) },
            singleLine = true,
            trailingIcon = {
                IconButton(onClick = onOpenFullPicker) {
                    Icon(
                        imageVector = Icons.Default.ArrowDropDown,
                        contentDescription = "Select $label from DB"
                    )
                }
            },
            modifier = Modifier.fillMaxWidth()
        )

        // Show horizontal scrollable chips from Database
        if (dbSuggestions.isNotEmpty()) {
            Spacer(modifier = Modifier.height(4.dp))
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 2.dp)
            ) {
                // Show top 6 most used values from DB
                items(dbSuggestions.take(6)) { (sugValue, count) ->
                    val isSelected = sugValue.equals(value.trim(), ignoreCase = true)
                    SuggestionChip(
                        onClick = { onValueChange(sugValue) },
                        label = {
                            Text(
                                text = if (count > 0) "$sugValue ($count)" else sugValue,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = if (isSelected) BrandBlue.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            labelColor = if (isSelected) BrandBlue else MaterialTheme.colorScheme.onSurface
                        )
                    )
                }

                // If more than 6, show a "All (N) ▾" chip to open the full list
                if (dbSuggestions.size > 6) {
                    item {
                        SuggestionChip(
                            onClick = onOpenFullPicker,
                            label = {
                                Text(
                                    text = "All ${dbSuggestions.size} from DB ▾",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = BrandBlue,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        )
                    }
                }
            }
        }
    }
}
