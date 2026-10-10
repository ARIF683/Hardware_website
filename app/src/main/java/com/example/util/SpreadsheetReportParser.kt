package com.example.util

import android.content.Context
import android.net.Uri
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.charset.Charset
import java.util.zip.ZipInputStream

/**
 * Universal spreadsheet and tabular report parser supporting:
 * 1. OpenXML Excel (.xlsx) files
 * 2. HTML-table / XML based Excel (.xls) reports exported by POS & tint machines
 * 3. Binary OLE2 BIFF8 (.xls) records & string table
 * 4. Plain CSV, CSC (Corob / Smart Tint), TSV, and TXT files
 */
object SpreadsheetReportParser {

    data class ParsedReportResult(
        val rows: List<List<String>>,
        val csvText: String,
        val detectedFormat: String
    )

    /**
     * Reads and parses an input stream from any spreadsheet or tint report.
     */
    fun parse(inputStream: InputStream): ParsedReportResult {
        val allBytes = inputStream.readBytes()
        if (allBytes.isEmpty()) {
            return ParsedReportResult(emptyList(), "", "empty")
        }

        // Check if ZIP / XLSX (starts with PK\x03\x04)
        if (allBytes.size >= 4 &&
            allBytes[0] == 0x50.toByte() &&
            allBytes[1] == 0x4B.toByte() &&
            allBytes[2] == 0x03.toByte() &&
            allBytes[3] == 0x04.toByte()
        ) {
            val rows = parseXlsx(ByteArrayInputStream(allBytes))
            val csv = rowsToCsv(rows)
            return ParsedReportResult(rows, csv, "xlsx")
        }

        // Check if OLE2 binary XLS (starts with \xD0\xCF\x11\xE0)
        if (allBytes.size >= 8 &&
            (allBytes[0].toInt() and 0xFF) == 0xD0 &&
            (allBytes[1].toInt() and 0xFF) == 0xCF &&
            (allBytes[2].toInt() and 0xFF) == 0x11 &&
            (allBytes[3].toInt() and 0xFF) == 0xE0
        ) {
            val rows = parseBinaryXls(allBytes)
            val csv = rowsToCsv(rows)
            return ParsedReportResult(rows, csv, "xls_binary")
        }

        // Try detecting text encoding (UTF-8 or fallback)
        val sampleText = try {
            String(allBytes, 0, minOf(allBytes.size, 4096), Charset.forName("UTF-8"))
        } catch (_: Exception) {
            String(allBytes, 0, minOf(allBytes.size, 4096), Charset.forName("ISO-8859-1"))
        }

        val trimmedSample = sampleText.trim()

        // Check if HTML Table or SpreadsheetML saved as .xls
        if (trimmedSample.startsWith("<", ignoreCase = true) &&
            (trimmedSample.contains("<table", ignoreCase = true) ||
             trimmedSample.contains("<tr", ignoreCase = true) ||
             trimmedSample.contains("<Workbook", ignoreCase = true) ||
             trimmedSample.contains("<ss:Workbook", ignoreCase = true))
        ) {
            val fullText = String(allBytes, Charset.forName("UTF-8"))
            val rows = parseHtmlOrXmlSpreadsheet(fullText)
            val csv = rowsToCsv(rows)
            return ParsedReportResult(rows, csv, "xls_html_xml")
        }

        // Fallback: Plain CSV / CSC / TSV text
        val fullText = try {
            String(allBytes, Charset.forName("UTF-8"))
        } catch (_: Exception) {
            String(allBytes, Charset.forName("ISO-8859-1"))
        }
        val rows = parseCsvOrDelimited(fullText)
        val csv = rowsToCsv(rows)
        return ParsedReportResult(rows, csv, "delimited_text")
    }

    /**
     * Parses an OpenXML XLSX zip stream into rows of cells.
     */
    private fun parseXlsx(inputStream: InputStream): List<List<String>> {
        val sharedStrings = mutableListOf<String>()
        var sheetXmlBytes: ByteArray? = null

        try {
            val zip = ZipInputStream(inputStream)
            var entry = zip.nextEntry
            while (entry != null) {
                val name = entry.name
                if (name == "xl/sharedStrings.xml") {
                    sharedStrings.addAll(parseSharedStrings(ByteArrayInputStream(zip.readBytes())))
                } else if (name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml")) {
                    if (sheetXmlBytes == null || name.endsWith("sheet1.xml")) {
                        sheetXmlBytes = zip.readBytes()
                    }
                }
                entry = zip.nextEntry
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        if (sheetXmlBytes != null) {
            try {
                return parseSheetXml(ByteArrayInputStream(sheetXmlBytes), sharedStrings)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        return emptyList()
    }

    private fun parseSharedStrings(inputStream: InputStream): List<String> {
        val list = mutableListOf<String>()
        val parser = Xml.newPullParser()
        parser.setInput(inputStream, "UTF-8")
        var eventType = parser.eventType
        var currentString = StringBuilder()
        var insideT = false

        while (eventType != XmlPullParser.END_DOCUMENT) {
            val name = parser.name
            when (eventType) {
                XmlPullParser.START_TAG -> {
                    if (name == "t") {
                        insideT = true
                        currentString = StringBuilder()
                    }
                }
                XmlPullParser.TEXT -> {
                    if (insideT) {
                        currentString.append(parser.text)
                    }
                }
                XmlPullParser.END_TAG -> {
                    if (name == "t") {
                        insideT = false
                        list.add(currentString.toString())
                    }
                }
            }
            eventType = parser.next()
        }
        return list
    }

    private fun parseSheetXml(inputStream: InputStream, sharedStrings: List<String>): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        val parser = Xml.newPullParser()
        parser.setInput(inputStream, "UTF-8")
        var eventType = parser.eventType

        var currentRowMap = mutableMapOf<Int, String>()
        var currentCellRef = ""
        var currentCellType = ""
        var insideV = false
        var insideIs = false
        var currentVal = StringBuilder()

        while (eventType != XmlPullParser.END_DOCUMENT) {
            val name = parser.name
            when (eventType) {
                XmlPullParser.START_TAG -> {
                    when (name) {
                        "row" -> {
                            currentRowMap = mutableMapOf()
                        }
                        "c" -> {
                            currentCellRef = parser.getAttributeValue(null, "r") ?: ""
                            currentCellType = parser.getAttributeValue(null, "t") ?: ""
                        }
                        "v" -> {
                            insideV = true
                            currentVal = StringBuilder()
                        }
                        "t" -> {
                            if (insideIs) {
                                insideV = true
                                currentVal = StringBuilder()
                            }
                        }
                        "is" -> {
                            insideIs = true
                        }
                    }
                }
                XmlPullParser.TEXT -> {
                    if (insideV) {
                        currentVal.append(parser.text)
                    }
                }
                XmlPullParser.END_TAG -> {
                    when (name) {
                        "v", "t" -> {
                            if (insideV) {
                                insideV = false
                                val rawVal = currentVal.toString()
                                val value = when (currentCellType) {
                                    "s" -> {
                                        val idx = rawVal.toIntOrNull()
                                        if (idx != null && idx >= 0 && idx < sharedStrings.size) {
                                            sharedStrings[idx]
                                        } else {
                                            rawVal
                                        }
                                    }
                                    "b" -> if (rawVal == "1") "TRUE" else "FALSE"
                                    else -> rawVal
                                }
                                val colIdx = excelColToIndex(currentCellRef)
                                if (colIdx >= 0) {
                                    currentRowMap[colIdx] = value
                                }
                            }
                        }
                        "is" -> {
                            insideIs = false
                        }
                        "row" -> {
                            if (currentRowMap.isNotEmpty()) {
                                val maxCol = (currentRowMap.keys.maxOrNull() ?: -1) + 1
                                if (maxCol > 0) {
                                    val rowList = (0 until maxCol).map { col ->
                                        currentRowMap[col]?.trim() ?: ""
                                    }
                                    if (rowList.any { it.isNotBlank() }) {
                                        rows.add(rowList)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            eventType = parser.next()
        }
        return rows
    }

    private fun excelColToIndex(ref: String): Int {
        val colLetters = ref.filter { it.isLetter() }.uppercase()
        if (colLetters.isEmpty()) return -1
        var index = 0
        for (c in colLetters) {
            index = index * 26 + (c - 'A' + 1)
        }
        return index - 1
    }

    /**
     * Parses HTML <table> or XML SpreadsheetML document saved as .xls.
     */
    private fun parseHtmlOrXmlSpreadsheet(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()

        // Match table rows <tr>...</tr> or <ss:Row>...</ss:Row> or <Row>...</Row>
        val rowRegex = Regex("<(?:tr|ss:Row|Row)[^>]*>(.*?)</(?:tr|ss:Row|Row)>", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
        val cellRegex = Regex("<(?:td|th|ss:Cell|Cell|ss:Data|Data)[^>]*>(.*?)</(?:td|th|ss:Cell|Cell|ss:Data|Data)>", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))

        val rowMatches = rowRegex.findAll(text).toList()
        for (rm in rowMatches) {
            val rowContent = rm.groupValues[1]
            val cellMatches = cellRegex.findAll(rowContent).toList()
            val cells = cellMatches.map { cm ->
                cleanHtmlCellText(cm.groupValues[1])
            }
            if (cells.any { it.isNotBlank() }) {
                rows.add(cells)
            }
        }

        return rows
    }

    private fun cleanHtmlCellText(raw: String): String {
        var clean = raw.replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), " ")
        clean = clean.replace(Regex("<[^>]+>"), "") // Strip HTML tags
        clean = clean.replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
        return clean.trim()
    }

    /**
     * Extracts strings and cell records from binary OLE2 BIFF8 (.xls) file.
     */
    private fun parseBinaryXls(bytes: ByteArray): List<List<String>> {
        val extractedStrings = mutableListOf<String>()
        var i = 0

        // Scan for readable UTF-16LE / ASCII text strings within BIFF records
        while (i < bytes.size - 4) {
            // Find ASCII string runs length >= 2
            if (bytes[i] in 32..126 && bytes[i + 1] in 32..126) {
                val start = i
                while (i < bytes.size && bytes[i] in 32..126) {
                    i++
                }
                val str = String(bytes, start, i - start, Charset.forName("ISO-8859-1")).trim()
                if (str.length >= 2 && !str.startsWith("Root Entry") && !str.startsWith("Workbook")) {
                    extractedStrings.add(str)
                }
            } else {
                i++
            }
        }

        // Group extracted strings into rows based on known header anchors or size
        val rows = mutableListOf<List<String>>()
        var currentRow = mutableListOf<String>()

        for (s in extractedStrings) {
            val upper = s.uppercase()
            if (upper.contains("PRODUCT") || upper.contains("BASE") || upper.contains("DATE") || upper.contains("DEALER")) {
                if (currentRow.isNotEmpty()) {
                    rows.add(currentRow)
                    currentRow = mutableListOf()
                }
            }
            currentRow.add(s)
            if (currentRow.size >= 12) {
                rows.add(currentRow)
                currentRow = mutableListOf()
            }
        }
        if (currentRow.isNotEmpty()) {
            rows.add(currentRow)
        }

        return rows
    }

    /**
     * Splits CSV, CSC, TSV text into rows and columns.
     */
    fun parseCsvOrDelimited(text: String): List<List<String>> {
        val lines = text.lines().filter { it.isNotBlank() }
        if (lines.isEmpty()) return emptyList()

        // Detect delimiter: comma, semicolon, tab
        val firstLine = lines.firstOrNull() ?: ""
        val commaCount = firstLine.count { it == ',' }
        val semiCount = firstLine.count { it == ';' }
        val tabCount = firstLine.count { it == '\t' }

        val delimiter = when {
            tabCount > commaCount && tabCount > semiCount -> '\t'
            semiCount > commaCount -> ';'
            else -> ','
        }

        return lines.map { line ->
            splitDelimitedLine(line, delimiter)
        }
    }

    private fun splitDelimitedLine(line: String, delimiter: Char): List<String> {
        val result = mutableListOf<String>()
        val current = StringBuilder()
        var inQuotes = false

        for (i in line.indices) {
            val c = line[i]
            when {
                c == '\"' -> inQuotes = !inQuotes
                c == delimiter && !inQuotes -> {
                    result.add(current.toString().trim().removeSurrounding("\""))
                    current.clear()
                }
                else -> current.append(c)
            }
        }
        result.add(current.toString().trim().removeSurrounding("\""))
        return result
    }

    /**
     * Converts a 2D table of rows to standard RFC CSV format.
     */
    fun rowsToCsv(rows: List<List<String>>): String {
        return rows.joinToString("\n") { row ->
            row.joinToString(",") { cell ->
                val escaped = cell.replace("\"", "\"\"")
                if (escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n") || escaped.contains(";")) {
                    "\"$escaped\""
                } else {
                    escaped
                }
            }
        }
    }

    /**
     * Resolves display file name from an Android content or file Uri.
     */
    fun getFileName(context: Context, uri: Uri): String {
        var fileName = "tint_report.xls"
        try {
            if (uri.scheme == "content") {
                val cursor = context.contentResolver.query(uri, null, null, null, null)
                cursor?.use {
                    if (it.moveToFirst()) {
                        val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                        if (nameIndex != -1) {
                            fileName = it.getString(nameIndex) ?: fileName
                        }
                    }
                }
            } else {
                uri.lastPathSegment?.let { fileName = it }
            }
        } catch (_: Exception) {}
        return fileName
    }
}
