package com.example.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.data.model.ColorTintLog
import com.example.data.model.DailyCashflowRecord
import com.example.data.model.Item
import com.example.data.model.LedgerAccount
import com.example.data.model.LedgerEntry
import com.example.data.model.QuotationRecord
import com.example.data.model.SyncQueueItem
import com.example.data.model.TransactionRecord

@Database(
    entities = [
        Item::class,
        TransactionRecord::class,
        SyncQueueItem::class,
        QuotationRecord::class,
        LedgerAccount::class,
        LedgerEntry::class,
        DailyCashflowRecord::class,
        ColorTintLog::class
    ],
    version = 5,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun itemDao(): ItemDao
    abstract fun transactionDao(): TransactionDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun quotationDao(): QuotationDao
    abstract fun ledgerDao(): LedgerDao
    abstract fun dailyCashflowDao(): DailyCashflowDao
    abstract fun colorTintDao(): ColorTintDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE items ADD COLUMN image_url TEXT")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS color_tint_logs (
                        tint_record_id TEXT PRIMARY KEY NOT NULL,
                        product_name TEXT NOT NULL,
                        shade_name TEXT NOT NULL,
                        shade_code TEXT NOT NULL,
                        base_code TEXT NOT NULL,
                        can_factor TEXT NOT NULL,
                        liters REAL NOT NULL,
                        no_of_cans INTEGER NOT NULL,
                        tint_date TEXT NOT NULL,
                        tint_time TEXT NOT NULL,
                        tint_timestamp TEXT NOT NULL,
                        matched_item_id TEXT,
                        matched_item_name TEXT,
                        qty_deducted REAL NOT NULL,
                        processed_at TEXT NOT NULL,
                        colorant_used TEXT NOT NULL,
                        colorant_quantity TEXT NOT NULL
                    )
                    """.trimIndent()
                )
            }
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "stock_manager.db"
                )
                    .addMigrations(MIGRATION_3_4, MIGRATION_4_5)
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
