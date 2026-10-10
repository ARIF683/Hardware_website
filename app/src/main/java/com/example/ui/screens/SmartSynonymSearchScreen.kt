package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.Item
import com.example.ui.StockViewModel
import com.example.ui.theme.BrandBlue
import com.example.util.ItemSearchMatcher

data class SynonymGroup(
    val term: String,
    val synonyms: List<String>,
    val description: String
)

@Composable
fun SmartSynonymSearchScreen(
    viewModel: StockViewModel,
    onOpenItemDetail: (String) -> Unit
) {
    val allItems by viewModel.allItems.collectAsState()
    var synonymQuery by remember { mutableStateOf("") }
    var selectedGlossaryTerm by remember { mutableStateOf<String?>(null) }

    val hardwareGlossary = remember {
        listOf(
            SynonymGroup("Tap / Faucet", listOf("tap", "faucet", "cock", "bib cock", "pillar cock", "stop cock", "mixer"), "Water flow control fixtures and valves."),
            SynonymGroup("Fasteners (Nut & Bolt)", listOf("nut", "bolt", "screw", "fastener", "washer", "anchor", "nail", "rivet"), "Hardware for joining and securing structures."),
            SynonymGroup("Pipes & Fittings", listOf("pipe", "tube", "pvc", "cpvc", "gi", "elbow", "socket", "tee", "bend", "conduit"), "Plumbing and electrical conduit pipes."),
            SynonymGroup("Paints & Primers", listOf("paint", "primer", "distemper", "emulsion", "enamel", "red oxide", "putty", "stain"), "Surface finishing, sealants, and color coatings."),
            SynonymGroup("Locks & Latches", listOf("lock", "padlock", "mortise", "latch", "handle", "tower bolt", "hinge"), "Door security and ironmongery hardware."),
            SynonymGroup("Cement & Adhesives", listOf("cement", "adhesive", "fevicol", "m-seal", "silicone", "sealant", "epoxy", "mortar"), "Binding and sealing agents.")
        )
    }

    // Filter items based on synonymQuery or glossary selection
    val effectiveQuery = selectedGlossaryTerm ?: synonymQuery
    val matchedItems = remember(allItems, effectiveQuery) {
        if (effectiveQuery.isBlank()) {
            allItems.take(20)
        } else {
            allItems.filter { item ->
                ItemSearchMatcher.matchScore(item, effectiveQuery) > 0 ||
                item.aliases.lowercase().contains(effectiveQuery.lowercase()) ||
                item.type.lowercase().contains(effectiveQuery.lowercase())
            }.sortedByDescending { ItemSearchMatcher.matchScore(it, effectiveQuery) }
        }
    }

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
                Icon(Icons.Default.SwapHoriz, contentDescription = null, tint = BrandBlue)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Smart Hardware Synonym Search", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.width(48.dp))
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Search Bar
        OutlinedTextField(
            value = synonymQuery,
            onValueChange = {
                synonymQuery = it
                selectedGlossaryTerm = null
            },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            placeholder = { Text("Search by slang, nickname, or item (e.g. 'tap', 'nut', 'primer')...") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(10.dp))

        // Hardware Slang & Synonym Glossary Chips
        Text("COMMON HARDWARE TERMINOLOGY DICTIONARY", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.height(4.dp))

        androidx.compose.foundation.lazy.LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(hardwareGlossary) { group ->
                val isSelected = selectedGlossaryTerm == group.term
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (isSelected) BrandBlue else MaterialTheme.colorScheme.surfaceVariant,
                    border = BorderStroke(1.dp, if (isSelected) BrandBlue else MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.clickable {
                        selectedGlossaryTerm = if (isSelected) null else group.term
                        synonymQuery = ""
                    }
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text(
                            text = group.term,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "${group.synonyms.size} synonyms",
                            fontSize = 9.sp,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Results Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Matching Inventory (${matchedItems.size})",
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (selectedGlossaryTerm != null || synonymQuery.isNotBlank()) {
                TextButton(onClick = {
                    synonymQuery = ""
                    selectedGlossaryTerm = null
                }) {
                    Text("Clear Filter", fontSize = 11.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        // Results List
        if (matchedItems.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("No hardware items match this synonym query.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(matchedItems) { item ->
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenItemDetail(item.id) }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.name, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Spacer(modifier = Modifier.height(2.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (item.brand.isNotBlank()) Text("Brand: ${item.brand}", fontSize = 11.sp, color = BrandBlue)
                                    if (item.size.isNotBlank()) Text("Size: ${item.size}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (item.type.isNotBlank()) Text("Type: ${item.type}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                if (item.aliases.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text("Synonyms/Aliases: ${item.aliases}", fontSize = 11.sp, color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Qty: ${item.qty.toInt()} ${item.unit}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text("₹${item.price}", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = BrandBlue)
                            }
                        }
                    }
                }
            }
        }
    }
}
