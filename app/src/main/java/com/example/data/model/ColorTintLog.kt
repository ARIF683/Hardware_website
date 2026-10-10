package com.example.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@Entity(tableName = "color_tint_logs")
@JsonClass(generateAdapter = true)
data class ColorTintLog(
    @PrimaryKey
    @ColumnInfo(name = "tint_record_id")
    @Json(name = "tint_record_id")
    val tintRecordId: String,

    @ColumnInfo(name = "product_name")
    @Json(name = "product_name")
    val productName: String,

    @ColumnInfo(name = "shade_name")
    @Json(name = "shade_name")
    val shadeName: String = "",

    @ColumnInfo(name = "shade_code")
    @Json(name = "shade_code")
    val shadeCode: String = "",

    @ColumnInfo(name = "base_code")
    @Json(name = "base_code")
    val baseCode: String = "",

    @ColumnInfo(name = "can_factor")
    @Json(name = "can_factor")
    val canFactor: String = "",

    @ColumnInfo(name = "liters")
    @Json(name = "liters")
    val liters: Double = 0.0,

    @ColumnInfo(name = "no_of_cans")
    @Json(name = "no_of_cans")
    val noOfCans: Int = 1,

    @ColumnInfo(name = "tint_date")
    @Json(name = "tint_date")
    val tintDate: String = "",

    @ColumnInfo(name = "tint_time")
    @Json(name = "tint_time")
    val tintTime: String = "",

    @ColumnInfo(name = "tint_timestamp")
    @Json(name = "tint_timestamp")
    val tintTimestamp: String = "",

    @ColumnInfo(name = "matched_item_id")
    @Json(name = "matched_item_id")
    val matchedItemId: String? = null,

    @ColumnInfo(name = "matched_item_name")
    @Json(name = "matched_item_name")
    val matchedItemName: String? = null,

    @ColumnInfo(name = "qty_deducted")
    @Json(name = "qty_deducted")
    val qtyDeducted: Double = 0.0,

    @ColumnInfo(name = "processed_at")
    @Json(name = "processed_at")
    val processedAt: String = "",

    @ColumnInfo(name = "colorant_used")
    @Json(name = "colorant_used")
    val colorantUsed: String = "",

    @ColumnInfo(name = "colorant_quantity")
    @Json(name = "colorant_quantity")
    val colorantQuantity: String = ""
)
