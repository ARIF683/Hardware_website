package com.example.util

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.content.ContentValues
import android.provider.MediaStore
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.core.content.FileProvider
import com.example.data.model.LedgerAccount
import com.example.data.model.LedgerEntry
import com.example.data.model.QuotationLineItem
import com.example.data.model.QuotationRecord
import com.example.data.pref.BankingInfo
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

object InvoicePrintManager {

    private val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
    private val lineItemListAdapter = moshi.adapter<List<QuotationLineItem>>(
        Types.newParameterizedType(List::class.java, QuotationLineItem::class.java)
    )

    fun parseLineItems(json: String): List<QuotationLineItem> {
        return try {
            lineItemListAdapter.fromJson(json) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun toJson(items: List<QuotationLineItem>): String {
        return lineItemListAdapter.toJson(items)
    }

    /**
     * Generates a clean A4 PDF document for Quotations / Estimates
     */
    fun createQuotationPdf(
        context: Context,
        quotation: QuotationRecord,
        storeName: String = "HARDWARE & TOOLS STORE",
        storePhone: String = "",
        storeAddress: String = "Main Market"
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 at 72dpi
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val titlePaint = Paint().apply {
            isAntiAlias = true
            textSize = 18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(20, 24, 33)
        }
        val subPaint = Paint().apply {
            isAntiAlias = true
            textSize = 10f
            color = Color.rgb(100, 116, 139)
        }
        val textPaint = Paint().apply {
            isAntiAlias = true
            textSize = 10f
            color = Color.rgb(30, 41, 59)
        }
        val boldPaint = Paint().apply {
            isAntiAlias = true
            textSize = 10f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(15, 23, 42)
        }
        val headerPaint = Paint().apply {
            isAntiAlias = true
            textSize = 9f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(255, 255, 255)
        }

        // Header Background Banner
        val bgPaint = Paint().apply {
            color = Color.rgb(30, 41, 59) // Deep Navy
        }
        canvas.drawRect(0f, 0f, 595f, 90f, bgPaint)

        // Store Title
        val storeTitlePaint = Paint().apply {
            isAntiAlias = true
            textSize = 20f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.WHITE
        }
        canvas.drawText(storeName.uppercase(), 36f, 42f, storeTitlePaint)
        val headerSubPaint = Paint().apply {
            isAntiAlias = true
            textSize = 9f
            color = Color.rgb(203, 213, 225)
        }
        canvas.drawText("Phone: ${storePhone.ifEmpty { "N/A" }} | $storeAddress", 36f, 62f, headerSubPaint)

        // Document Type Badge
        val docTypePaint = Paint().apply {
            isAntiAlias = true
            textSize = 16f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(245, 158, 11) // Amber
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText("ESTIMATE / QUOTE", 559f, 45f, docTypePaint)
        val docNumPaint = Paint().apply {
            isAntiAlias = true
            textSize = 10f
            color = Color.WHITE
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText("No: #${quotation.quotationNo}", 559f, 65f, docNumPaint)

        var y = 120f

        // Customer & Meta Info Card
        val cardPaint = Paint().apply {
            color = Color.rgb(248, 250, 252)
        }
        val strokePaint = Paint().apply {
            color = Color.rgb(226, 232, 240)
            style = Paint.Style.STROKE
            strokeWidth = 1f
        }
        canvas.drawRoundRect(36f, y, 559f, y + 70f, 8f, 8f, cardPaint)
        canvas.drawRoundRect(36f, y, 559f, y + 70f, 8f, 8f, strokePaint)

        canvas.drawText("CUSTOMER DETAILS", 50f, y + 20f, boldPaint)
        canvas.drawText("Name: ${quotation.customerName}", 50f, y + 38f, textPaint)
        if (quotation.customerPhone.isNotEmpty()) {
            canvas.drawText("Phone: ${quotation.customerPhone}", 50f, y + 54f, textPaint)
        }

        canvas.drawText("ESTIMATE DETAILS", 340f, y + 20f, boldPaint)
        canvas.drawText("Date: ${quotation.date}", 340f, y + 38f, textPaint)
        if (quotation.validUntil.isNotEmpty()) {
            canvas.drawText("Valid Until: ${quotation.validUntil}", 340f, y + 54f, textPaint)
        }

        y += 90f

        // Table Header
        val tableHeadBg = Paint().apply { color = Color.rgb(51, 65, 85) }
        canvas.drawRoundRect(36f, y, 559f, y + 24f, 4f, 4f, tableHeadBg)

        canvas.drawText("#", 46f, y + 16f, headerPaint)
        canvas.drawText("ITEM DESCRIPTION", 75f, y + 16f, headerPaint)
        canvas.drawText("QTY", 320f, y + 16f, headerPaint)
        canvas.drawText("RATE", 380f, y + 16f, headerPaint)
        canvas.drawText("DISC %", 450f, y + 16f, headerPaint)
        val rightHeaderPaint = Paint(headerPaint).apply { textAlign = Paint.Align.RIGHT }
        canvas.drawText("TOTAL", 545f, y + 16f, rightHeaderPaint)

        y += 32f

        val items = parseLineItems(quotation.itemsJson)
        val linePaint = Paint().apply {
            color = Color.rgb(241, 245, 249)
            strokeWidth = 1f
        }
        val rightTextPaint = Paint(textPaint).apply { textAlign = Paint.Align.RIGHT }
        val rightBoldPaint = Paint(boldPaint).apply { textAlign = Paint.Align.RIGHT }

        items.forEachIndexed { index, item ->
            if (index % 2 == 1) {
                canvas.drawRect(36f, y - 10f, 559f, y + 12f, Paint().apply { color = Color.rgb(248, 250, 252) })
            }
            canvas.drawText("${index + 1}", 46f, y + 2f, subPaint)
            val nameDisplay = if (item.name.length > 35) item.name.take(32) + "…" else item.name
            canvas.drawText(nameDisplay, 75f, y + 2f, boldPaint)
            canvas.drawText(String.format(Locale.US, "%.1f %s", item.qty, item.unit), 320f, y + 2f, textPaint)
            canvas.drawText(String.format(Locale.US, "₹%.2f", item.unitPrice), 380f, y + 2f, textPaint)
            canvas.drawText(if (item.discountPercent > 0) "${item.discountPercent}%" else "-", 450f, y + 2f, textPaint)
            canvas.drawText(String.format(Locale.US, "₹%.2f", item.total), 545f, y + 2f, rightBoldPaint)

            canvas.drawLine(36f, y + 14f, 559f, y + 14f, linePaint)
            y += 24f
        }

        y += 15f

        // Totals Card on right
        val totalBoxX = 320f
        canvas.drawRoundRect(totalBoxX, y, 559f, y + 95f, 6f, 6f, cardPaint)
        canvas.drawRoundRect(totalBoxX, y, 559f, y + 95f, 6f, 6f, strokePaint)

        var ty = y + 20f
        canvas.drawText("Subtotal:", totalBoxX + 16f, ty, textPaint)
        canvas.drawText(String.format(Locale.US, "₹%.2f", quotation.subtotal), 545f, ty, rightTextPaint)

        if (quotation.discount > 0) {
            ty += 18f
            canvas.drawText("Discount:", totalBoxX + 16f, ty, textPaint)
            canvas.drawText(String.format(Locale.US, "-₹%.2f", quotation.discount), 545f, ty, rightTextPaint)
        }

        if (quotation.taxAmount > 0) {
            ty += 18f
            canvas.drawText("GST/Tax (${quotation.taxPercent}%):", totalBoxX + 16f, ty, textPaint)
            canvas.drawText(String.format(Locale.US, "+₹%.2f", quotation.taxAmount), 545f, ty, rightTextPaint)
        }

        ty += 22f
        canvas.drawLine(totalBoxX + 10f, ty - 8f, 545f, ty - 8f, strokePaint)
        val grandTotalPaint = Paint().apply {
            isAntiAlias = true
            textSize = 13f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(15, 23, 42)
        }
        val grandTotalRight = Paint(grandTotalPaint).apply {
            textAlign = Paint.Align.RIGHT
            color = Color.rgb(2, 132, 199)
        }
        canvas.drawText("GRAND TOTAL:", totalBoxX + 16f, ty + 2f, grandTotalPaint)
        canvas.drawText(String.format(Locale.US, "₹%.2f", quotation.grandTotal), 545f, ty + 2f, grandTotalRight)

        // Notes & Terms on left
        if (quotation.notes.isNotEmpty()) {
            canvas.drawText("NOTES / TERMS:", 36f, y + 20f, boldPaint)
            canvas.drawText(quotation.notes.take(80), 36f, y + 38f, subPaint)
        }

        // Footer
        val footerPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8f
            color = Color.rgb(148, 163, 184)
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("Generated via Hardware Stock Manager • Thank you for your business!", 595f / 2f, 810f, footerPaint)

        pdfDoc.finishPage(page)

        val outputDir = File(context.cacheDir, "invoices").apply { mkdirs() }
        val outputFile = File(outputDir, "Quotation_${quotation.quotationNo}.pdf")
        FileOutputStream(outputFile).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
        return outputFile
    }

    /**
     * Generates a clean A4 PDF for Ledger Statement
     */
    fun createLedgerStatementPdf(
        context: Context,
        account: LedgerAccount,
        entries: List<LedgerEntry>,
        storeName: String = "HARDWARE & TOOLS STORE"
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val boldPaint = Paint().apply {
            isAntiAlias = true
            textSize = 10f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(15, 23, 42)
        }
        val textPaint = Paint().apply {
            isAntiAlias = true
            textSize = 10f
            color = Color.rgb(30, 41, 59)
        }
        val subPaint = Paint().apply {
            isAntiAlias = true
            textSize = 9f
            color = Color.rgb(100, 116, 139)
        }

        // Header Banner
        canvas.drawRect(0f, 0f, 595f, 85f, Paint().apply { color = Color.rgb(15, 23, 42) })
        canvas.drawText(storeName.uppercase(), 36f, 38f, Paint().apply {
            isAntiAlias = true
            textSize = 18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.WHITE
        })
        canvas.drawText("ACCOUNT STATEMENT / KHATA LEDGER", 36f, 58f, Paint().apply {
            isAntiAlias = true
            textSize = 10f
            color = Color.rgb(245, 158, 11)
        })

        var y = 110f

        // Account Details Box
        canvas.drawRoundRect(36f, y, 559f, y + 60f, 6f, 6f, Paint().apply { color = Color.rgb(248, 250, 252) })
        canvas.drawText("ACCOUNT: ${account.name} (${account.type})", 50f, y + 22f, boldPaint)
        canvas.drawText("Phone: ${account.phone.ifEmpty { "N/A" }} | Address: ${account.address.ifEmpty { "N/A" }}", 50f, y + 42f, subPaint)

        val balanceColor = if (account.netBalance >= 0) Color.rgb(22, 163, 74) else Color.rgb(220, 38, 38)
        val balText = String.format(Locale.US, "NET BALANCE: ₹%.2f", Math.abs(account.netBalance))
        canvas.drawText(balText, 545f, y + 32f, Paint().apply {
            isAntiAlias = true
            textSize = 12f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = balanceColor
            textAlign = Paint.Align.RIGHT
        })

        y += 80f

        // Table Header
        canvas.drawRoundRect(36f, y, 559f, y + 24f, 4f, 4f, Paint().apply { color = Color.rgb(51, 65, 85) })
        val headerPaint = Paint().apply {
            isAntiAlias = true
            textSize = 9f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.WHITE
        }
        canvas.drawText("DATE", 46f, y + 16f, headerPaint)
        canvas.drawText("DETAILS / BILL REF", 130f, y + 16f, headerPaint)
        canvas.drawText("GAVE (DEBIT)", 330f, y + 16f, headerPaint)
        canvas.drawText("GOT (CREDIT)", 420f, y + 16f, headerPaint)
        canvas.drawText("BALANCE", 545f, y + 16f, Paint(headerPaint).apply { textAlign = Paint.Align.RIGHT })

        y += 34f
        val linePaint = Paint().apply { color = Color.rgb(241, 245, 249); strokeWidth = 1f }
        val rightTextPaint = Paint(textPaint).apply { textAlign = Paint.Align.RIGHT }

        entries.forEachIndexed { index, entry ->
            canvas.drawText(entry.date, 46f, y + 2f, subPaint)
            val desc = entry.description.ifEmpty { if (entry.billRef.isNotEmpty()) "Bill #${entry.billRef}" else "Payment" }
            canvas.drawText(desc.take(28), 130f, y + 2f, textPaint)

            if (entry.type == "GAVE") {
                canvas.drawText(String.format(Locale.US, "₹%.2f", entry.amount), 380f, y + 2f, Paint(rightTextPaint).apply { color = Color.rgb(220, 38, 38) })
                canvas.drawText("-", 450f, y + 2f, textPaint)
            } else {
                canvas.drawText("-", 350f, y + 2f, textPaint)
                canvas.drawText(String.format(Locale.US, "₹%.2f", entry.amount), 470f, y + 2f, Paint(rightTextPaint).apply { color = Color.rgb(22, 163, 74) })
            }

            canvas.drawText(String.format(Locale.US, "₹%.2f", entry.balanceAfter), 545f, y + 2f, rightTextPaint)

            canvas.drawLine(36f, y + 12f, 559f, y + 12f, linePaint)
            y += 22f
        }

        pdfDoc.finishPage(page)
        val outputDir = File(context.cacheDir, "statements").apply { mkdirs() }
        val outputFile = File(outputDir, "Ledger_${account.name.replace(" ", "_")}.pdf")
        FileOutputStream(outputFile).use { out -> pdfDoc.writeTo(out) }
        pdfDoc.close()
        return outputFile
    }

    /**
     * Share PDF file via WhatsApp / System Share Sheet
     */
    fun sharePdf(context: Context, file: File, title: String) {
        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.provider",
            file
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "Share $title via").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    /**
     * Print PDF using Android System Print Manager
     */
    fun printPdf(context: Context, file: File, jobName: String) {
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val printAdapter = object : PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?,
                newAttributes: PrintAttributes?,
                cancellationSignal: CancellationSignal?,
                callback: LayoutResultCallback?,
                extras: Bundle?
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback?.onLayoutCancelled()
                    return
                }
                val info = PrintDocumentInfo.Builder(jobName)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(1)
                    .build()
                callback?.onLayoutFinished(info, true)
            }

            override fun onWrite(
                pages: Array<out PageRange>?,
                destination: ParcelFileDescriptor?,
                cancellationSignal: CancellationSignal?,
                callback: WriteResultCallback?
            ) {
                try {
                    FileInputStream(file).use { input ->
                        FileOutputStream(destination?.fileDescriptor).use { output ->
                            input.copyTo(output)
                        }
                    }
                    callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                } catch (e: Exception) {
                    callback?.onWriteFailed(e.message)
                }
            }
        }
        printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
    }

    /**
     * Open PDF using standard Android intent
     */
    fun openPdf(context: Context, file: File) {
        try {
            val uri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.provider",
                file
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/pdf")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(Intent.createChooser(intent, "Open PDF with").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            sharePdf(context, file, file.name)
        }
    }

    /**
     * Copies generated PDF to device public Downloads directory
     * Returns user-friendly file path where user can locate the PDF
     */
    fun savePdfToDownloads(context: Context, sourceFile: File, displayName: String): String {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { out ->
                        FileInputStream(sourceFile).use { input ->
                            input.copyTo(out)
                        }
                    }
                    return "Internal Storage > Download > $displayName"
                }
            } else {
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (downloadsDir.exists() || downloadsDir.mkdirs()) {
                    val destFile = File(downloadsDir, displayName)
                    sourceFile.copyTo(destFile, overwrite = true)
                    val mediaScanIntent = Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE)
                    mediaScanIntent.data = Uri.fromFile(destFile)
                    context.sendBroadcast(mediaScanIntent)
                    return "Internal Storage > Download > $displayName"
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return "App Storage > cache/invoices/$displayName"
    }

    data class GstTaxPdfItem(
        val name: String,
        val hsn: String,
        val qty: Double,
        val rate: Double,
        val taxRatePercent: Double,
        val taxableAmount: Double,
        val taxAmount: Double,
        val totalAmount: Double,
        val unit: String = "pcs",
        val subtitle: String = "",
        val imageBitmap: Bitmap? = null
    )

    fun convertNumberToIndianWords(amount: Double): String {
        val wholePart = amount.toLong()
        val paise = Math.round((amount - wholePart) * 100).toInt()

        val units = arrayOf(
            "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
            "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
        )
        val tens = arrayOf(
            "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
        )

        fun numToWords(n: Long): String {
            if (n == 0L) return ""
            if (n < 20) return units[n.toInt()] + " "
            if (n < 100) return tens[(n / 10).toInt()] + " " + numToWords(n % 10)
            if (n < 1000) return units[(n / 100).toInt()] + " Hundred " + numToWords(n % 100)
            if (n < 100000) return numToWords(n / 1000) + "Thousand " + numToWords(n % 1000)
            if (n < 10000000) return numToWords(n / 100000) + "Lakh " + numToWords(n % 100000)
            return numToWords(n / 10000000) + "Crore " + numToWords(n % 10000000)
        }

        val rupeesWords = if (wholePart == 0L) "Zero" else numToWords(wholePart).trim()
        val paiseWords = if (paise > 0) " and " + numToWords(paise.toLong()).trim() + " Paise" else ""
        return "INR $rupeesWords$paiseWords Only"
    }

    suspend fun loadBitmap(context: Context, source: String?): Bitmap? {
        if (source.isNullOrBlank()) return null
        return withContext(Dispatchers.IO) {
            try {
                when {
                    source.startsWith("http://") || source.startsWith("https://") -> {
                        val loader = coil.Coil.imageLoader(context)
                        val req = coil.request.ImageRequest.Builder(context)
                            .data(source)
                            .allowHardware(false)
                            .build()
                        val result = (loader.execute(req) as? coil.request.SuccessResult)?.drawable
                        (result as? android.graphics.drawable.BitmapDrawable)?.bitmap
                    }
                    source.startsWith("content://") -> {
                        context.contentResolver.openInputStream(Uri.parse(source))?.use { input ->
                            BitmapFactory.decodeStream(input, null, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 })
                        }
                    }
                    source.startsWith("data:image") -> {
                        val base64 = source.substringAfter("base64,")
                        val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 })
                    }
                    else -> {
                        val file = File(source)
                        if (file.exists()) {
                            BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 })
                        } else null
                    }
                }
            } catch (e: Exception) {
                null
            }
        }
    }

    /**
     * Generates a compliant A4 GST Tax Invoice PDF.
     * Includes Item Image column (blank if no image), Bank Details, Payment QR code, and Authorized Signature.
     * Note: Per GST invoice standards, internal item Cost Price is STRICTLY excluded.
     */
    fun createGstTaxInvoicePdf(
        context: Context,
        invoiceNo: String,
        invoiceDate: String,
        storeName: String = "HARDWARE & TOOLS STORE",
        storeAddress: String = "Main Market",
        storePhone: String = "",
        storeEmail: String = "",
        storeGstin: String,
        customerName: String,
        customerGstin: String,
        customerAddress: String = "",
        customerPhone: String = "",
        isInterState: Boolean,
        items: List<GstTaxPdfItem>,
        taxableTotal: Double,
        totalTaxAmount: Double,
        grandTotal: Double,
        transporterId: String = "",
        vehicleNo: String = "",
        bankingInfo: BankingInfo? = null,
        signatureBitmap: Bitmap? = null,
        qrCodeBitmap: Bitmap? = null
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // Standard A4 at 72dpi
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val titlePaint = Paint().apply {
            isAntiAlias = true
            textSize = 16f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.WHITE
        }
        val headerSubPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8.5f
            color = Color.rgb(226, 232, 240)
        }
        val textPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8.5f
            color = Color.rgb(30, 41, 59)
        }
        val boldPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8.5f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(15, 23, 42)
        }
        val smallSubPaint = Paint().apply {
            isAntiAlias = true
            textSize = 7f
            color = Color.rgb(100, 116, 139)
        }
        val headerColPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.WHITE
        }

        // 1. Header Background Banner (Navy Blue)
        val bgPaint = Paint().apply { color = Color.rgb(30, 58, 138) }
        canvas.drawRect(24f, 24f, 571f, 96f, bgPaint)

        // Store Title, Details & GSTIN
        canvas.drawText(storeName.uppercase(), 36f, 48f, titlePaint)
        val subLine1 = listOf(
            storeAddress.ifBlank { null },
            if (storePhone.isNotBlank()) "Ph: $storePhone" else null,
            if (storeEmail.isNotBlank()) "Email: $storeEmail" else null
        ).filterNotNull().joinToString("  •  ")
        if (subLine1.isNotBlank()) {
            canvas.drawText(subLine1, 36f, 64f, headerSubPaint)
        }
        canvas.drawText("GSTIN: ${storeGstin.ifEmpty { "Unregistered" }}  •  TAX INVOICE (Rule 46 CGST Rules)", 36f, 78f, headerSubPaint)

        // Invoice Meta Right-aligned in Banner
        val docTypePaint = Paint().apply {
            isAntiAlias = true
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(251, 191, 36) // Amber/Gold
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText("TAX INVOICE", 559f, 48f, docTypePaint)
        val metaPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8.5f
            color = Color.WHITE
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText("Invoice #: $invoiceNo", 559f, 64f, metaPaint)
        canvas.drawText("Date: $invoiceDate", 559f, 78f, metaPaint)

        var y = 104f

        // 2. Customer & Dispatch Details Box
        val cardPaint = Paint().apply { color = Color.rgb(248, 250, 252) }
        val strokePaint = Paint().apply {
            color = Color.rgb(226, 232, 240)
            style = Paint.Style.STROKE
            strokeWidth = 1f
        }
        canvas.drawRoundRect(24f, y, 571f, y + 54f, 4f, 4f, cardPaint)
        canvas.drawRoundRect(24f, y, 571f, y + 54f, 4f, 4f, strokePaint)

        // Left Column: Billed To
        canvas.drawText("BILLED TO / RECIPIENT:", 36f, y + 16f, boldPaint)
        val buyerName = customerName.ifEmpty { "Cash / Retail Customer" }
        canvas.drawText("Name: $buyerName", 36f, y + 29f, textPaint)
        val buyerGstin = customerGstin.ifEmpty { "Unregistered" }
        val buyerExtra = if (customerPhone.isNotBlank()) " | Ph: $customerPhone" else ""
        canvas.drawText("GSTIN: $buyerGstin$buyerExtra", 36f, y + 42f, textPaint)

        // Right Column: Supply & Dispatch
        val placeOfSupply = if (isInterState) "Inter-State (IGST 100%)" else "Intra-State (CGST 50% + SGST 50%)"
        canvas.drawText("Place of Supply: $placeOfSupply", 310f, y + 16f, textPaint)
        if (transporterId.isNotEmpty() || vehicleNo.isNotEmpty()) {
            val transText = "Transport: ${transporterId.ifEmpty { "-" }} | Vehicle: ${vehicleNo.ifEmpty { "-" }}"
            canvas.drawText(transText, 310f, y + 29f, textPaint)
        } else {
            canvas.drawText("Reverse Charge: No | Terms: Due on Receipt", 310f, y + 29f, textPaint)
        }
        canvas.drawText("Original for Recipient", 310f, y + 42f, smallSubPaint)

        y += 62f

        // 3. Table Header Banner with ITEM IMAGE column
        // Columns:
        // # (24..44, w=20)
        // IMAGE (44..80, w=36)
        // ITEM DESCRIPTION (80..235, w=155)
        // HSN (235..280, w=45)
        // QTY (280..325, w=45)
        // RATE (325..375, w=50)
        // TAXABLE (375..440, w=65)
        // GST% (440..490, w=50)
        // TOTAL (490..571, w=81)
        val tableHeaderBg = Paint().apply { color = Color.rgb(51, 65, 85) }
        canvas.drawRect(24f, y, 571f, y + 22f, tableHeaderBg)

        canvas.drawText("#", 30f, y + 14f, headerColPaint)
        canvas.drawText("IMAGE", 48f, y + 14f, headerColPaint)
        canvas.drawText("ITEM DESCRIPTION", 84f, y + 14f, headerColPaint)
        canvas.drawText("HSN", 240f, y + 14f, headerColPaint)
        canvas.drawText("QTY", 286f, y + 14f, headerColPaint)
        canvas.drawText("RATE", 332f, y + 14f, headerColPaint)
        canvas.drawText("TAXABLE", 382f, y + 14f, headerColPaint)
        canvas.drawText("GST%", 446f, y + 14f, headerColPaint)
        val rightHeaderPaint = Paint(headerColPaint).apply { textAlign = Paint.Align.RIGHT }
        canvas.drawText("TOTAL", 562f, y + 14f, rightHeaderPaint)

        y += 22f

        val linePaint = Paint().apply {
            color = Color.rgb(226, 232, 240)
            strokeWidth = 0.8f
        }
        val rightTextPaint = Paint(textPaint).apply { textAlign = Paint.Align.RIGHT }
        val rightBoldPaint = Paint(boldPaint).apply { textAlign = Paint.Align.RIGHT }

        val rowHeight = 30f // Plenty of space for 24x24 thumbnail image + text

        // Render Table Rows (Item Image displayed; if no image, cell is left BLANK)
        items.forEachIndexed { idx, item ->
            if (y > 660f) return@forEachIndexed // safety page limit

            val rowBg = if (idx % 2 == 0) Color.WHITE else Color.rgb(248, 250, 252)
            canvas.drawRect(24f, y, 571f, y + rowHeight, Paint().apply { color = rowBg })

            // Index
            canvas.drawText("${idx + 1}", 30f, y + 17f, textPaint)

            // ITEM IMAGE: Show if exists, LEAVE BLANK if no image!
            if (item.imageBitmap != null) {
                try {
                    val bmp = item.imageBitmap
                    val targetSize = 24f
                    val scale = targetSize / maxOf(bmp.width, bmp.height).coerceAtLeast(1)
                    val w = (bmp.width * scale).coerceAtMost(targetSize)
                    val h = (bmp.height * scale).coerceAtMost(targetSize)
                    val imgX = 46f + (34f - w) / 2f
                    val imgY = y + 3f + (24f - h) / 2f
                    val destRect = RectF(imgX, imgY, imgX + w, imgY + h)
                    
                    // Draw thumbnail border and bitmap
                    val thumbBorderPaint = Paint().apply {
                        color = Color.rgb(226, 232, 240)
                        style = Paint.Style.STROKE
                        strokeWidth = 0.6f
                    }
                    canvas.drawRoundRect(destRect, 2f, 2f, thumbBorderPaint)
                    canvas.drawBitmap(bmp, null, destRect, Paint().apply { isFilterBitmap = true })
                } catch (_: Exception) {
                    // Blank on failure
                }
            } // else: completely blank cell, per user specification!

            // Item Name & Subtitle
            val truncName = if (item.name.length > 25) item.name.take(23) + ".." else item.name
            canvas.drawText(truncName, 84f, y + 13f, boldPaint)
            if (item.subtitle.isNotBlank()) {
                val truncSub = if (item.subtitle.length > 28) item.subtitle.take(26) + ".." else item.subtitle
                canvas.drawText(truncSub, 84f, y + 24f, smallSubPaint)
            }

            // HSN, Qty, Rate, Taxable, GST%, Total
            canvas.drawText(item.hsn.ifEmpty { "-" }, 240f, y + 17f, textPaint)
            canvas.drawText("%.1f %s".format(item.qty, item.unit), 286f, y + 17f, textPaint)
            canvas.drawText("₹%.2f".format(item.rate), 332f, y + 17f, textPaint)
            canvas.drawText("₹%.2f".format(item.taxableAmount), 382f, y + 17f, textPaint)
            canvas.drawText("${item.taxRatePercent.toInt()}%", 446f, y + 17f, textPaint)
            canvas.drawText("₹%.2f".format(item.totalAmount), 562f, y + 17f, rightBoldPaint)

            canvas.drawLine(24f, y + rowHeight, 571f, y + rowHeight, linePaint)
            y += rowHeight
        }

        y += 8f

        // 4. Totals Card on Right Side (x = 320 to 571)
        val totalsCardPaint = Paint().apply { color = Color.rgb(241, 245, 249) }
        canvas.drawRoundRect(320f, y, 571f, y + 84f, 4f, 4f, totalsCardPaint)
        canvas.drawRoundRect(320f, y, 571f, y + 84f, 4f, 4f, strokePaint)

        canvas.drawText("Taxable Value Total:", 332f, y + 16f, textPaint)
        canvas.drawText("₹%.2f".format(taxableTotal), 558f, y + 16f, rightBoldPaint)

        if (isInterState) {
            canvas.drawText("Integrated Tax (IGST):", 332f, y + 31f, textPaint)
            canvas.drawText("₹%.2f".format(totalTaxAmount), 558f, y + 31f, rightBoldPaint)
        } else {
            canvas.drawText("Central Tax (CGST):", 332f, y + 30f, textPaint)
            canvas.drawText("₹%.2f".format(totalTaxAmount / 2), 558f, y + 30f, rightBoldPaint)
            canvas.drawText("State Tax (SGST):", 332f, y + 43f, textPaint)
            canvas.drawText("₹%.2f".format(totalTaxAmount / 2), 558f, y + 43f, rightBoldPaint)
        }

        canvas.drawLine(328f, y + 54f, 563f, y + 54f, strokePaint)
        val grandTotalLabelPaint = Paint().apply {
            isAntiAlias = true
            textSize = 10f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(30, 58, 138)
        }
        val grandTotalValPaint = Paint(grandTotalLabelPaint).apply { textAlign = Paint.Align.RIGHT }
        canvas.drawText("TOTAL INVOICE VALUE:", 332f, y + 70f, grandTotalLabelPaint)
        canvas.drawText("₹%.2f".format(grandTotal), 558f, y + 70f, grandTotalValPaint)

        // 5. Left Side: Bank Details & UPI QR Code Box (x = 24 to 310)
        val bankBoxPaint = Paint().apply { color = Color.rgb(248, 250, 252) }
        canvas.drawRoundRect(24f, y, 310f, y + 84f, 4f, 4f, bankBoxPaint)
        canvas.drawRoundRect(24f, y, 310f, y + 84f, 4f, 4f, strokePaint)

        val bankHeaderPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8.5f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(30, 58, 138)
        }
        canvas.drawText("🏦 BANK DETAILS FOR PAYMENT:", 34f, y + 14f, bankHeaderPaint)

        val bankName = bankingInfo?.bankName?.ifBlank { "Store Bank" } ?: "Store Bank"
        val acNo = bankingInfo?.accountNumber?.ifBlank { "-" } ?: "-"
        val ifsc = bankingInfo?.ifscCode?.ifBlank { "-" } ?: "-"
        val upi = bankingInfo?.upiId?.ifBlank { "" } ?: ""

        val bankTextPaint = Paint().apply {
            isAntiAlias = true
            textSize = 7.5f
            color = Color.rgb(51, 65, 85)
        }

        // Has QR Code? If yes, draw QR Code on right inside bank box
        val hasQr = qrCodeBitmap != null
        val textMaxRight = if (hasQr) 235f else 300f

        canvas.drawText("Bank: $bankName", 34f, y + 27f, bankTextPaint)
        canvas.drawText("A/C No: $acNo", 34f, y + 39f, bankTextPaint)
        canvas.drawText("IFSC Code: $ifsc", 34f, y + 51f, bankTextPaint)
        if (upi.isNotBlank()) {
            canvas.drawText("UPI ID: $upi", 34f, y + 63f, bankTextPaint)
        }
        if (!bankingInfo?.branchName.isNullOrBlank()) {
            canvas.drawText("Branch: ${bankingInfo?.branchName}", 34f, y + 75f, smallSubPaint)
        }

        if (hasQr && qrCodeBitmap != null) {
            try {
                val qrSize = 54f
                val qrX = 244f
                val qrY = y + 10f
                val destQr = RectF(qrX, qrY, qrX + qrSize, qrY + qrSize)
                canvas.drawRoundRect(destQr, 3f, 3f, Paint().apply { color = Color.WHITE })
                canvas.drawRoundRect(destQr, 3f, 3f, strokePaint)
                canvas.drawBitmap(qrCodeBitmap, null, destQr, Paint().apply { isFilterBitmap = true })
                val qrLabelPaint = Paint().apply {
                    isAntiAlias = true
                    textSize = 6.5f
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    color = Color.rgb(30, 58, 138)
                    textAlign = Paint.Align.CENTER
                }
                canvas.drawText("SCAN TO PAY", qrX + (qrSize / 2f), qrY + qrSize + 9f, qrLabelPaint)
            } catch (_: Exception) {}
        }

        y += 92f

        // 6. Amount in Words
        val wordsText = convertNumberToIndianWords(grandTotal)
        canvas.drawText("Amount in Words: $wordsText", 28f, y + 10f, boldPaint)

        // E-Way Bill Notice if > 50k
        if (grandTotal > 50000.0) {
            val ewayPaint = Paint().apply {
                isAntiAlias = true
                textSize = 8f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                color = Color.rgb(180, 83, 9)
            }
            canvas.drawText("⚠️ E-Way Bill Required (> ₹50,000 threshold) • Status: Compliant", 28f, y + 22f, ewayPaint)
        }

        y += 30f

        // 7. Terms & Conditions (Left) and Authorized Signature (Right)
        canvas.drawText("Terms & Conditions:", 28f, y + 12f, boldPaint)
        canvas.drawText("1. Goods once sold will not be accepted back or exchanged.", 28f, y + 24f, smallSubPaint)
        canvas.drawText("2. Certified that all particulars are true and correct.", 28f, y + 34f, smallSubPaint)
        canvas.drawText("3. Subject to local state jurisdiction.", 28f, y + 44f, smallSubPaint)

        // Authorized Signature Block (Right side)
        val sigRight = 559f
        val forStorePaint = Paint().apply {
            isAntiAlias = true
            textSize = 8.5f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(30, 41, 59)
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText("For $storeName", sigRight, y + 12f, forStorePaint)

        // If digital signature uploaded, render signature bitmap above signatory line!
        if (signatureBitmap != null) {
            try {
                val sigTargetW = 85f
                val sigTargetH = 32f
                val scale = minOf(sigTargetW / signatureBitmap.width.coerceAtLeast(1), sigTargetH / signatureBitmap.height.coerceAtLeast(1))
                val w = signatureBitmap.width * scale
                val h = signatureBitmap.height * scale
                val sigX = sigRight - w
                val sigY = y + 16f + (sigTargetH - h) / 2f
                val destSig = RectF(sigX, sigY, sigX + w, sigY + h)
                canvas.drawBitmap(signatureBitmap, null, destSig, Paint().apply { isFilterBitmap = true })
            } catch (_: Exception) {}
        }

        val sigLinePaint = Paint().apply {
            color = Color.rgb(100, 116, 139)
            strokeWidth = 0.8f
        }
        canvas.drawLine(sigRight - 130f, y + 54f, sigRight, y + 54f, sigLinePaint)
        val authLabelPaint = Paint().apply {
            isAntiAlias = true
            textSize = 8f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(71, 85, 105)
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText("Authorized Signatory", sigRight, y + 66f, authLabelPaint)

        // 8. Outer Page Border & Footer
        val outerBorderPaint = Paint().apply {
            color = Color.rgb(203, 213, 225)
            style = Paint.Style.STROKE
            strokeWidth = 1f
        }
        canvas.drawRect(24f, 24f, 571f, 816f, outerBorderPaint)

        canvas.drawText("GST Tax Invoice • Standard Rule 46 Compliant • Hardware Stock Manager", 595f / 2f, 810f, Paint().apply {
            isAntiAlias = true
            textSize = 7.5f
            color = Color.rgb(148, 163, 184)
            textAlign = Paint.Align.CENTER
        })

        pdfDoc.finishPage(page)

        val cleanInvNo = invoiceNo.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val outputDir = File(context.cacheDir, "invoices").apply { mkdirs() }
        val outputFile = File(outputDir, "GST_Invoice_$cleanInvNo.pdf")
        FileOutputStream(outputFile).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
        return outputFile
    }

    /**
     * Generates ESC/POS thermal receipt raw bytes for 58mm (32 chars) or 80mm (48 chars) thermal printers
     */
    fun generateEscPosReceipt(
        storeName: String,
        storePhone: String,
        title: String,
        refNo: String,
        date: String,
        customerName: String,
        items: List<QuotationLineItem>,
        subtotal: Double,
        discount: Double,
        grandTotal: Double,
        is80mm: Boolean = false
    ): ByteArray {
        val maxChars = if (is80mm) 48 else 32
        val out = mutableListOf<Byte>()

        fun addBytes(vararg b: Int) {
            b.forEach { out.add(it.toByte()) }
        }

        fun addText(text: String) {
            text.toByteArray(charset("ISO-8859-1")).forEach { out.add(it) }
        }

        fun addLine(text: String = "") {
            addText(text + "\n")
        }

        fun alignCenter() = addBytes(0x1B, 0x61, 0x01)
        fun alignLeft() = addBytes(0x1B, 0x61, 0x00)
        fun alignRight() = addBytes(0x1B, 0x61, 0x02)
        fun boldOn() = addBytes(0x1B, 0x45, 0x01)
        fun boldOff() = addBytes(0x1B, 0x45, 0x00)
        fun doubleSize() = addBytes(0x1D, 0x21, 0x11)
        fun normalSize() = addBytes(0x1D, 0x21, 0x00)

        // Initialize printer
        addBytes(0x1B, 0x40)

        // Header
        alignCenter()
        boldOn()
        doubleSize()
        addLine(storeName)
        normalSize()
        if (storePhone.isNotEmpty()) addLine("Tel: $storePhone")
        addLine("--------------------------------".take(maxChars))
        boldOn()
        addLine(title.uppercase())
        boldOff()
        addLine("Ref: #$refNo  Date: $date")
        if (customerName.isNotEmpty()) addLine("Customer: $customerName")
        addLine("--------------------------------".take(maxChars))

        // Items Table
        alignLeft()
        val headerCol = if (is80mm) {
            String.format(Locale.US, "%-20s %6s %9s %9s", "Item", "Qty", "Rate", "Total")
        } else {
            String.format(Locale.US, "%-14s %4s %6s %6s", "Item", "Qty", "Rate", "Total")
        }
        addLine(headerCol)
        addLine("-".repeat(maxChars))

        items.forEach { item ->
            val nameTrunc = if (is80mm) item.name.take(20) else item.name.take(14)
            val line = if (is80mm) {
                String.format(Locale.US, "%-20s %6.1f %9.2f %9.2f", nameTrunc, item.qty, item.unitPrice, item.total)
            } else {
                String.format(Locale.US, "%-14s %4.1f %6.1f %6.1f", nameTrunc, item.qty, item.unitPrice, item.total)
            }
            addLine(line)
        }
        addLine("-".repeat(maxChars))

        // Totals
        alignRight()
        addLine(String.format(Locale.US, "Subtotal: Rs. %.2f", subtotal))
        if (discount > 0) {
            addLine(String.format(Locale.US, "Discount: -Rs. %.2f", discount))
        }
        boldOn()
        addLine(String.format(Locale.US, "GRAND TOTAL: Rs. %.2f", grandTotal))
        boldOff()
        addLine("--------------------------------".take(maxChars))

        // Footer
        alignCenter()
        addLine("Thank you! Visit Again.")
        addLine("\n\n\n")

        // Cut paper command
        addBytes(0x1D, 0x56, 0x41, 0x10)

        return out.toByteArray()
    }

    /**
     * Get paired Bluetooth devices list
     */
    @SuppressLint("MissingPermission")
    fun getPairedBluetoothPrinters(context: Context? = null): List<BluetoothDevice> {
        val bluetoothManager = context?.getSystemService(android.content.Context.BLUETOOTH_SERVICE) as? android.bluetooth.BluetoothManager
        @Suppress("DEPRECATION")
        val adapter = bluetoothManager?.adapter ?: BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        if (!adapter.isEnabled) return emptyList()
        return adapter.bondedDevices?.toList() ?: emptyList()
    }

    /**
     * Sends raw bytes to Bluetooth Thermal Printer over RFCOMM socket (SPP UUID)
     */
    @SuppressLint("MissingPermission")
    suspend fun printViaBluetooth(device: BluetoothDevice, data: ByteArray): Result<Unit> = withContext(Dispatchers.IO) {
        var socket: BluetoothSocket? = null
        try {
            val sppUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB") // Standard Serial Port Profile UUID
            socket = device.createRfcommSocketToServiceRecord(sppUuid)
            socket.connect()
            val outputStream: OutputStream = socket.outputStream
            outputStream.write(data)
            outputStream.flush()
            socket.close()
            Result.success(Unit)
        } catch (e: Exception) {
            try { socket?.close() } catch (_: Exception) {}
            Result.failure(e)
        }
    }
}
