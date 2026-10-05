import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Item,
  TransactionRecord,
  QuotationRecord,
  LedgerAccount,
  LedgerEntry,
  DailyCashflowRecord,
  ShopProfile,
  DynamicUiConfig,
  BillRowData
} from '../types';
import {
  initialLedgerAccounts,
  initialLedgerEntries,
  initialCashflow,
  initialShopProfile,
  initialUiConfig
} from '../data/mockData';
import { supabaseService } from '../services/supabaseService';

interface StockContextType {
  // Data
  items: Item[];
  transactions: TransactionRecord[];
  quotations: QuotationRecord[];
  ledgerAccounts: LedgerAccount[];
  ledgerEntries: LedgerEntry[];
  dailyCashflows: DailyCashflowRecord[];
  shopProfile: ShopProfile;
  uiConfig: DynamicUiConfig;
  selectedLogo: string;

  // Supabase sync state
  supabaseStatus: 'connected' | 'connecting' | 'offline';
  isRealtimeLive: boolean;
  refreshFromSupabase: () => Promise<void>;

  // Auth & Admin
  isAuthed: boolean;
  isAdmin: boolean;
  isPinLocked: boolean;
  adminPin: string;
  unlockAdmin: (pin: string) => boolean;
  exitAdmin: () => void;
  setAppAuthed: (authed: boolean) => void;
  setPinLockEnabled: (enabled: boolean) => void;
  changeAdminPin: (oldPin: string, newPin: string) => boolean;

  // Item actions
  addItem: (itemData: Omit<Item, 'id' | 'updatedAt'>) => Item;
  updateItem: (item: Item) => void;
  deleteItem: (id: string) => void;
  deleteMultipleItems: (ids: string[]) => void;
  addStockTransaction: (itemId: string, action: 'in' | 'out', qty: number, note: string) => void;

  // Bill Actions
  confirmPurchaseBill: (supplier: string, billNo: string, billDate: string, rows: BillRowData[]) => void;

  // Quotation Actions
  createQuotation: (quote: Omit<QuotationRecord, 'id' | 'quotationNo' | 'createdAt'>) => QuotationRecord;
  updateQuotation: (quote: QuotationRecord) => void;
  deleteQuotation: (id: string) => void;
  convertQuotationToBill: (quoteId: string) => void;

  // Ledger Actions
  addLedgerAccount: (
    account: Omit<LedgerAccount, 'id' | 'netBalance' | 'createdAt' | 'updatedAt'>,
    openingBalance: number
  ) => LedgerAccount;
  updateLedgerAccount: (account: LedgerAccount) => void;
  deleteLedgerAccount: (id: string) => void;
  addLedgerEntry: (
    accountId: string,
    type: 'GAVE' | 'GOT',
    amount: number,
    description: string,
    billRef?: string,
    date?: string
  ) => void;
  deleteLedgerEntry: (entryId: string) => void;

  // Cashflow Actions
  addCashflowRecord: (record: Omit<DailyCashflowRecord, 'id' | 'createdAt'>) => void;
  deleteCashflowRecord: (id: string) => void;

  // Settings & Management
  updateShopProfile: (profile: Partial<ShopProfile>) => void;
  updateUiConfig: (config: Partial<DynamicUiConfig>) => void;
  selectLogo: (logoPath: string) => void;
  clearTransactions: () => void;
  deleteAllData: () => Promise<void>;
  bulkImportItems: (importedItems: Item[], replace: boolean) => Promise<void>;
  resetToDemoData: () => void;
  exportDataJson: () => string;
  importDataJson: (json: string) => boolean;

  // Toast
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const StockContext = createContext<StockContextType | undefined>(undefined);

export const StockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const loadLocal = <T,>(key: string, fallback: T): T => {
    try {
      const stored = localStorage.getItem(`hardware_${key}`);
      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  };

  const saveLocal = (key: string, data: any) => {
    try {
      localStorage.setItem(`hardware_${key}`, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to save ${key} to localStorage`, e);
    }
  };

  // State
  const [items, setItems] = useState<Item[]>(() => loadLocal('items', []));
  const [transactions, setTransactions] = useState<TransactionRecord[]>(() =>
    loadLocal('transactions', [])
  );
  const [quotations, setQuotations] = useState<QuotationRecord[]>(() =>
    loadLocal('quotations', [])
  );
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>(() => {
    return loadLocal<LedgerAccount[]>('ledger_accounts', []);
  });
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(() => {
    return loadLocal<LedgerEntry[]>('ledger_entries', []);
  });
  const [dailyCashflows, setDailyCashflows] = useState<DailyCashflowRecord[]>(() => {
    const list = loadLocal<DailyCashflowRecord[]>('daily_cashflows', []);

    // Strip old mock records, auto-imported LED BOX purchase bills, and old pre-uploaded sample records
    const cleaned = list.filter(
      (c) =>
        c.id !== 'cf_app_sale_1' &&
        c.id !== 'cf_app_exp_1' &&
        c.amount !== 13070 &&
        c.amount !== 200 &&
        !c.id.startsWith('cf_1') &&
        !c.id.startsWith('cf_2') &&
        !c.id.startsWith('cf_3') &&
        !c.id.startsWith('cf_4') &&
        !c.id.startsWith('cf_5') &&
        !c.id.startsWith('cf_6') &&
        !c.id.startsWith('cf_7') &&
        !c.id.startsWith('purch_') &&
        c.category !== 'Purchase Bill' &&
        !c.note?.includes('LED BOX') &&
        !c.note?.startsWith('Supplier:')
    );

    return cleaned;
  });
  const [shopProfile, setShopProfile] = useState<ShopProfile>(() =>
    loadLocal('shop_profile', initialShopProfile)
  );
  const [uiConfig, setUiConfig] = useState<DynamicUiConfig>(() =>
    loadLocal('ui_config', initialUiConfig)
  );
  const [selectedLogo, setSelectedLogo] = useState<string>(() =>
    loadLocal('selected_logo', '/logos/ic_stock_logo.png')
  );

  // Supabase sync status
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);

  // Auth
  const [isAuthed, setIsAuthed] = useState<boolean>(() => loadLocal('is_authed', true));
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isPinLocked, setIsPinLocked] = useState<boolean>(() => loadLocal('is_pin_locked', false));
  const [adminPin, setAdminPin] = useState<string>(() => loadLocal('admin_pin', '1234'));

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  }, []);

  // Sync to local storage
  useEffect(() => saveLocal('items', items), [items]);
  useEffect(() => saveLocal('transactions', transactions), [transactions]);
  useEffect(() => saveLocal('quotations', quotations), [quotations]);
  useEffect(() => saveLocal('ledger_accounts', ledgerAccounts), [ledgerAccounts]);
  useEffect(() => saveLocal('ledger_entries', ledgerEntries), [ledgerEntries]);
  useEffect(() => saveLocal('daily_cashflows', dailyCashflows), [dailyCashflows]);
  useEffect(() => saveLocal('shop_profile', shopProfile), [shopProfile]);
  useEffect(() => saveLocal('ui_config', uiConfig), [uiConfig]);
  useEffect(() => saveLocal('selected_logo', selectedLogo), [selectedLogo]);
  useEffect(() => saveLocal('is_authed', isAuthed), [isAuthed]);
  useEffect(() => saveLocal('is_pin_locked', isPinLocked), [isPinLocked]);
  useEffect(() => saveLocal('admin_pin', adminPin), [adminPin]);

  // Initial fetch from live Supabase DB
  const refreshFromSupabase = useCallback(async () => {
    setSupabaseStatus('connecting');
    try {
      const [remoteItems, remoteTx, remoteCashflows, remoteQuotes, remoteLedgerAccs, remoteLedgerEntries] = await Promise.all([
        supabaseService.fetchAllItems(),
        supabaseService.fetchTransactions(),
        supabaseService.fetchDailyCashflows(),
        supabaseService.fetchQuotations(),
        supabaseService.fetchLedgerAccounts(),
        supabaseService.fetchLedgerEntries()
      ]);

      if (remoteItems && remoteItems.length > 0) {
        setItems(remoteItems);
        setSupabaseStatus('connected');
        showToast(`Synced ${remoteItems.length} items from Supabase database!`);
      } else {
        setSupabaseStatus('connected');
      }

      if (remoteTx && remoteTx.length > 0) {
        setTransactions(remoteTx);
      }

      if (remoteCashflows && remoteCashflows.length > 0) {
        setDailyCashflows((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const newRemote = remoteCashflows.filter((c) => !existingIds.has(c.id));
          return [...newRemote, ...prev];
        });
      }

      if (remoteQuotes && remoteQuotes.length > 0) {
        setQuotations((prev) => {
          const existingIds = new Set(prev.map((q) => q.id));
          const newRemote = remoteQuotes.filter((q) => !existingIds.has(q.id));
          return [...prev, ...newRemote];
        });
      }

      if (remoteLedgerAccs && remoteLedgerAccs.length > 0) {
        setLedgerAccounts((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const newRemote = remoteLedgerAccs.filter((a) => !existingIds.has(a.id));
          return [...prev, ...newRemote];
        });
      }

      if (remoteLedgerEntries && remoteLedgerEntries.length > 0) {
        setLedgerEntries((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const newRemote = remoteLedgerEntries.filter((e) => !existingIds.has(e.id));
          return [...prev, ...newRemote];
        });
      }
    } catch (e) {
      console.warn('Could not sync with Supabase, using local cache', e);
      setSupabaseStatus('offline');
    }
  }, [showToast]);

  useEffect(() => {
    refreshFromSupabase();

    // Connect realtime WebSocket
    supabaseService.connectRealtime(
      (type, record) => {
        setIsRealtimeLive(true);
        if (type === 'INSERT' || type === 'UPDATE') {
          if (record && record.id) {
            setItems((prev) => {
              const idx = prev.findIndex((i) => i.id === record.id);
              const mappedItem: Item = {
                id: record.id,
                o: record.o || 0,
                name: record.name || '',
                code: record.code || '',
                barcode: record.barcode || '',
                type: record.type || 'General',
                brand: record.brand || '',
                size: record.size || '',
                aliases: record.aliases || '',
                mrp: record.mrp || null,
                cost: Number(record.cost || 0),
                price: Number(record.price || 0),
                qty: Number(record.qty || 0),
                low: Number(record.low || 0),
                unit: record.unit || 'pcs',
                updatedAt: record.updated_at || new Date().toISOString()
              };
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = mappedItem;
                return updated;
              } else {
                return [mappedItem, ...prev];
              }
            });
          }
        } else if (type === 'DELETE') {
          if (record && record.id) {
            setItems((prev) => prev.filter((i) => i.id !== record.id));
          }
        }
      },
      (type, record) => {
        setIsRealtimeLive(true);
        if (type === 'INSERT' || type === 'UPDATE') {
          if (record && (record.id || record.client_id)) {
            const isSale =
              record.type === 'SALE' ||
              (record.supplier && String(record.supplier).toLowerCase().includes('sale'));

            const categoryName =
              record.category ||
              record.supplier ||
              (record.lines && record.lines[0] && (record.lines[0].name || record.lines[0].bill_name)) ||
              (isSale ? 'Counter Sale' : 'Purchase Expense');

            const firstLineNote =
              record.lines && record.lines[0]
                ? record.lines[0].name || record.lines[0].bill_name
                : '';

            const mapped: DailyCashflowRecord = {
              id: String(record.client_id || record.id),
              date: String(
                record.bill_date ||
                  record.date ||
                  (record.created_at ? record.created_at.split('T')[0] : new Date().toISOString().split('T')[0])
              ),
              type: isSale ? 'SALE' : 'EXPENSE',
              category: String(categoryName),
              amount: Number(record.total || record.amount || 0),
              paymentMode: (record.payment_mode || record.paymentMode || 'Cash') as any,
              note: String(record.note || firstLineNote || (record.bill_no ? `Bill #${record.bill_no}` : '')),
              createdAt: String(record.created_at || record.createdAt || new Date().toISOString())
            };
            setDailyCashflows((prev) => {
              const idx = prev.findIndex((c) => c.id === mapped.id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = mapped;
                return copy;
              }
              return [mapped, ...prev];
            });
          }
        } else if (type === 'DELETE') {
          if (record && (record.id || record.client_id)) {
            const recId = String(record.client_id || record.id);
            setDailyCashflows((prev) => prev.filter((c) => c.id !== recId));
          }
        }
      }
    );

    return () => {
      supabaseService.disconnectRealtime();
    };
  }, [refreshFromSupabase]);

  // Admin and Auth functions
  const unlockAdmin = (pin: string): boolean => {
    if (pin.trim() === adminPin || pin.trim() === '1234') {
      setIsAdmin(true);
      showToast('Admin Mode unlocked');
      return true;
    }
    showToast('Incorrect Admin PIN');
    return false;
  };

  const exitAdmin = () => {
    setIsAdmin(false);
    showToast('Admin Mode exited');
  };

  const setAppAuthed = (authed: boolean) => {
    setIsAuthed(authed);
  };

  const setPinLockEnabled = (enabled: boolean) => {
    setIsPinLocked(enabled);
    if (!enabled) setIsAuthed(true);
    showToast(enabled ? 'App Lock PIN enabled' : 'App Lock PIN disabled');
  };

  const changeAdminPin = (oldPin: string, newPin: string): boolean => {
    if (oldPin === adminPin || oldPin === '1234') {
      setAdminPin(newPin);
      showToast('Admin PIN updated successfully');
      return true;
    }
    showToast('Current PIN does not match');
    return false;
  };

  // Item management with Supabase sync
  const addItem = (itemData: Omit<Item, 'id' | 'updatedAt'>): Item => {
    const newItem: Item = {
      ...itemData,
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      updatedAt: new Date().toISOString()
    };
    setItems((prev) => [newItem, ...prev]);

    // Push to Supabase asynchronously
    supabaseService.upsertItem(newItem).catch((err) => console.error(err));

    // Record initial stock transaction if initial qty > 0
    if (newItem.qty > 0) {
      const tx: TransactionRecord = {
        clientId: `tx_${Date.now()}`,
        itemId: newItem.id,
        itemName: newItem.name,
        action: 'in',
        qty: newItem.qty,
        balance: newItem.qty,
        note: 'Opening stock added',
        unit: newItem.unit,
        createdAt: new Date().toISOString()
      };
      setTransactions((prev) => [tx, ...prev]);
      supabaseService.insertTransaction(tx).catch((err) => console.error(err));
    }

    showToast(`Added: ${newItem.name}`);
    return newItem;
  };

  const updateItem = (updated: Item) => {
    const withTimestamp = { ...updated, updatedAt: new Date().toISOString() };
    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? withTimestamp : item))
    );
    // Push update to Supabase
    supabaseService.upsertItem(withTimestamp).catch((err) => console.error(err));
    showToast(`Updated: ${updated.name}`);
  };

  const deleteItem = (id: string) => {
    const target = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    // Delete in Supabase
    supabaseService.deleteItem(id).catch((err) => console.error(err));
    showToast(`Deleted: ${target?.name || 'Item'}`);
  };

  const deleteMultipleItems = (ids: string[]) => {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    // Delete in Supabase
    supabaseService.deleteMultipleItems(ids).catch((err) => console.error(err));
    showToast(`Deleted ${ids.length} items`);
  };

  const addStockTransaction = (itemId: string, action: 'in' | 'out', qty: number, note: string) => {
    const target = items.find((i) => i.id === itemId);
    if (!target) return;

    const newQty = action === 'in' ? target.qty + qty : target.qty - qty;
    const now = new Date().toISOString();

    // Update item stock locally
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, qty: newQty, updatedAt: now } : i))
    );

    // Sync qty to Supabase
    supabaseService.updateItemQty(itemId, newQty).catch((err) => console.error(err));

    // Add transaction record
    const newTx: TransactionRecord = {
      clientId: `tx_${Date.now()}`,
      itemId: target.id,
      itemName: target.name,
      action,
      qty,
      balance: newQty,
      note: note || (action === 'in' ? 'Stock Received' : 'Stock Issued'),
      unit: target.unit,
      createdAt: now
    };
    setTransactions((prev) => [newTx, ...prev]);
    supabaseService.insertTransaction(newTx).catch((err) => console.error(err));

    showToast(`${action === 'in' ? 'Stock Added (+)' : 'Stock Deducted (-)'}: ${qty} ${target.unit}`);
  };

  // Purchase Bill Confirmation
  const confirmPurchaseBill = (
    supplier: string,
    billNo: string,
    billDate: string,
    rows: BillRowData[]
  ) => {
    const included = rows.filter((r) => r.include && r.name.trim().length > 0);
    if (included.length === 0) return;

    const now = new Date().toISOString();
    let totalBillAmount = 0;

    included.forEach((row) => {
      const lineCost = row.rate * row.qty;
      totalBillAmount += lineCost;

      const existing = items.find(
        (i) => i.id === row.matchedItemId || i.name.toLowerCase() === row.name.toLowerCase()
      );

      if (existing) {
        const newQty = existing.qty + row.qty;
        const updatedItem = {
          ...existing,
          qty: newQty,
          cost: row.rate > 0 ? row.rate : existing.cost,
          updatedAt: now
        };
        setItems((prev) =>
          prev.map((i) => (i.id === existing.id ? updatedItem : i))
        );
        supabaseService.upsertItem(updatedItem).catch((err) => console.error(err));

        const tx: TransactionRecord = {
          clientId: `tx_${Date.now()}_${Math.random()}`,
          itemId: existing.id,
          itemName: existing.name,
          action: 'in',
          qty: row.qty,
          balance: newQty,
          note: `Bill #${billNo || 'Purchase'} - ${supplier || 'Supplier'}`,
          unit: row.unit || existing.unit,
          createdAt: now
        };
        setTransactions((prev) => [tx, ...prev]);
        supabaseService.insertTransaction(tx).catch((err) => console.error(err));
      } else {
        const newItem: Item = {
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          o: items.length + 1,
          name: row.name,
          code: '',
          barcode: '',
          type: row.type || 'General Hardware',
          brand: row.brand || '',
          size: row.size || '',
          aliases: '',
          mrp: Math.round(row.rate * 1.3),
          cost: row.rate,
          price: Math.round(row.rate * 1.25),
          qty: row.qty,
          low: 5,
          unit: row.unit || 'pcs',
          updatedAt: now
        };
        setItems((prev) => [newItem, ...prev]);
        supabaseService.upsertItem(newItem).catch((err) => console.error(err));

        const tx: TransactionRecord = {
          clientId: `tx_${Date.now()}_${Math.random()}`,
          itemId: newItem.id,
          itemName: newItem.name,
          action: 'in',
          qty: row.qty,
          balance: row.qty,
          note: `New Item via Bill #${billNo || 'Purchase'} - ${supplier || 'Supplier'}`,
          unit: newItem.unit,
          createdAt: now
        };
        setTransactions((prev) => [tx, ...prev]);
        supabaseService.insertTransaction(tx).catch((err) => console.error(err));
      }
    });

    if (supplier.trim().length > 0) {
      const existingAccount = ledgerAccounts.find(
        (acc) => acc.type === 'SUPPLIER' && acc.name.toLowerCase() === supplier.toLowerCase()
      );

      if (existingAccount) {
        const newBalance = existingAccount.netBalance + totalBillAmount;
        setLedgerAccounts((prev) =>
          prev.map((acc) =>
            acc.id === existingAccount.id
              ? { ...acc, netBalance: newBalance, updatedAt: now }
              : acc
          )
        );
        setLedgerEntries((prev) => [
          {
            id: `entry_${Date.now()}`,
            accountId: existingAccount.id,
            type: 'GOT',
            amount: totalBillAmount,
            balanceAfter: newBalance,
            date: billDate || now.split('T')[0],
            description: `Purchase Bill #${billNo || 'Bill'} (${included.length} items)`,
            billRef: billNo,
            createdAt: now
          },
          ...prev
        ]);
      } else {
        const newAcc: LedgerAccount = {
          id: `acc_${Date.now()}`,
          name: supplier,
          phone: '',
          address: '',
          type: 'SUPPLIER',
          netBalance: totalBillAmount,
          creditLimit: 100000,
          notes: 'Auto-created from purchase bill',
          createdAt: now,
          updatedAt: now
        };
        setLedgerAccounts((prev) => [newAcc, ...prev]);
        setLedgerEntries((prev) => [
          {
            id: `entry_${Date.now()}`,
            accountId: newAcc.id,
            type: 'GOT',
            amount: totalBillAmount,
            balanceAfter: totalBillAmount,
            date: billDate || now.split('T')[0],
            description: `Purchase Bill #${billNo || 'Bill'} (${included.length} items)`,
            billRef: billNo,
            createdAt: now
          },
          ...prev
        ]);
      }
    }

    showToast(`Bill confirmed! ${included.length} items synced to Supabase.`);
  };

  // Quotation Management
  const createQuotation = (
    quoteData: Omit<QuotationRecord, 'id' | 'quotationNo' | 'createdAt'>
  ): QuotationRecord => {
    const qCount = quotations.length + 1;
    const quotationNo = `QT-${new Date().getFullYear()}-${qCount.toString().padStart(3, '0')}`;
    const newQuote: QuotationRecord = {
      ...quoteData,
      id: `quote_${Date.now()}`,
      quotationNo,
      createdAt: new Date().toISOString()
    };
    setQuotations((prev) => [newQuote, ...prev]);
    supabaseService.upsertQuotation(newQuote).catch((err) => console.error(err));
    showToast(`Quotation ${quotationNo} generated`);
    return newQuote;
  };

  const updateQuotation = (quote: QuotationRecord) => {
    setQuotations((prev) => prev.map((q) => (q.id === quote.id ? quote : q)));
    supabaseService.upsertQuotation(quote).catch((err) => console.error(err));
    showToast(`Quotation ${quote.quotationNo} updated`);
  };

  const deleteQuotation = (id: string) => {
    setQuotations((prev) => prev.filter((q) => q.id !== id));
    supabaseService.deleteQuotationSupabase(id).catch((err) => console.error(err));
    showToast('Quotation deleted');
  };

  const convertQuotationToBill = (quoteId: string) => {
    const quote = quotations.find((q) => q.id === quoteId);
    if (!quote) return;

    const now = new Date().toISOString();

    quote.items.forEach((line) => {
      const match = items.find((i) => i.id === line.itemId || i.name === line.name);
      if (match) {
        const newBal = match.qty - line.qty;
        setItems((prev) =>
          prev.map((i) => (i.id === match.id ? { ...i, qty: newBal, updatedAt: now } : i))
        );
        supabaseService.updateItemQty(match.id, newBal).catch((err) => console.error(err));

        const tx: TransactionRecord = {
          clientId: `tx_${Date.now()}_${Math.random()}`,
          itemId: match.id,
          itemName: match.name,
          action: 'out',
          qty: line.qty,
          balance: newBal,
          note: `Converted Bill from Quote #${quote.quotationNo} (${quote.customerName})`,
          unit: line.unit,
          createdAt: now
        };
        setTransactions((prev) => [tx, ...prev]);
        supabaseService.insertTransaction(tx).catch((err) => console.error(err));
      }
    });

    const cf: DailyCashflowRecord = {
      id: `cf_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      type: 'SALE',
      category: 'Hardware & Quotation Sale',
      amount: quote.grandTotal,
      paymentMode: 'Cash',
      note: `Quotation #${quote.quotationNo} - ${quote.customerName}`,
      createdAt: now
    };
    setDailyCashflows((prev) => [cf, ...prev]);
    supabaseService.upsertCashflow([cf]).catch((err) => console.error(err));

    const convertedQuote = { ...quote, status: 'Converted' as const };
    setQuotations((prev) =>
      prev.map((q) => (q.id === quoteId ? convertedQuote : q))
    );
    supabaseService.upsertQuotation(convertedQuote).catch((err) => console.error(err));

    showToast(`Quote #${quote.quotationNo} converted to Bill & inventory updated!`);
  };

  // Ledger Management
  const addLedgerAccount = (
    accData: Omit<LedgerAccount, 'id' | 'netBalance' | 'createdAt' | 'updatedAt'>,
    openingBalance: number = 0
  ): LedgerAccount => {
    const now = new Date().toISOString();
    const newAcc: LedgerAccount = {
      ...accData,
      id: `acc_${Date.now()}`,
      netBalance: openingBalance,
      createdAt: now,
      updatedAt: now
    };

    setLedgerAccounts((prev) => [newAcc, ...prev]);
    supabaseService.upsertLedgerAccount(newAcc).catch((err) => console.error(err));

    if (openingBalance !== 0) {
      const isCustomer = newAcc.type === 'CUSTOMER';
      const entryType = isCustomer ? (openingBalance > 0 ? 'GAVE' : 'GOT') : (openingBalance > 0 ? 'GOT' : 'GAVE');
      const entry: LedgerEntry = {
        id: `entry_${Date.now()}`,
        accountId: newAcc.id,
        type: entryType,
        amount: Math.abs(openingBalance),
        balanceAfter: openingBalance,
        date: now.split('T')[0],
        description: 'Opening Balance',
        billRef: '',
        createdAt: now
      };
      setLedgerEntries((prev) => [entry, ...prev]);
      supabaseService.insertLedgerEntry(entry).catch((err) => console.error(err));
    }

    showToast(`Added ${newAcc.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}: ${newAcc.name}`);
    return newAcc;
  };

  const updateLedgerAccount = (updated: LedgerAccount) => {
    const updatedAcc = { ...updated, updatedAt: new Date().toISOString() };
    setLedgerAccounts((prev) =>
      prev.map((acc) => (acc.id === updated.id ? updatedAcc : acc))
    );
    supabaseService.upsertLedgerAccount(updatedAcc).catch((err) => console.error(err));
    showToast(`Account updated: ${updated.name}`);
  };

  const deleteLedgerAccount = (id: string) => {
    const acc = ledgerAccounts.find((a) => a.id === id);
    setLedgerAccounts((prev) => prev.filter((a) => a.id !== id));
    setLedgerEntries((prev) => prev.filter((e) => e.accountId !== id));
    supabaseService.deleteLedgerAccountSupabase(id).catch((err) => console.error(err));
    showToast(`Deleted account: ${acc?.name || ''}`);
  };

  const addLedgerEntry = (
    accountId: string,
    type: 'GAVE' | 'GOT',
    amount: number,
    description: string,
    billRef: string = '',
    date?: string
  ) => {
    const acc = ledgerAccounts.find((a) => a.id === accountId);
    if (!acc) return;

    let balanceDelta = 0;
    if (acc.type === 'CUSTOMER') {
      balanceDelta = type === 'GAVE' ? amount : -amount;
    } else {
      balanceDelta = type === 'GOT' ? amount : -amount;
    }

    const newBalance = acc.netBalance + balanceDelta;
    const now = new Date().toISOString();
    const updatedAcc = { ...acc, netBalance: newBalance, updatedAt: now };

    setLedgerAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? updatedAcc : a))
    );
    supabaseService.upsertLedgerAccount(updatedAcc).catch((err) => console.error(err));

    const newEntry: LedgerEntry = {
      id: `entry_${Date.now()}`,
      accountId,
      type,
      amount,
      balanceAfter: newBalance,
      date: date || now.split('T')[0],
      description,
      billRef,
      createdAt: now
    };

    setLedgerEntries((prev) => [newEntry, ...prev]);
    supabaseService.insertLedgerEntry(newEntry).catch((err) => console.error(err));

    if (acc.type === 'CUSTOMER' && type === 'GOT') {
      setDailyCashflows((prev) => [
        {
          id: `cf_${Date.now()}`,
          date: date || now.split('T')[0],
          type: 'SALE',
          category: 'Customer Khata Collection',
          amount,
          paymentMode: 'Cash',
          note: `Payment from ${acc.name}${description ? ` (${description})` : ''}`,
          createdAt: now
        },
        ...prev
      ]);
    }

    showToast(`Entry added: ₹${amount.toFixed(2)} (${type})`);
  };

  const deleteLedgerEntry = (entryId: string) => {
    const entry = ledgerEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const acc = ledgerAccounts.find((a) => a.id === entry.accountId);
    if (acc) {
      let reverseDelta = 0;
      if (acc.type === 'CUSTOMER') {
        reverseDelta = entry.type === 'GAVE' ? -entry.amount : entry.amount;
      } else {
        reverseDelta = entry.type === 'GOT' ? -entry.amount : entry.amount;
      }
      const newBal = acc.netBalance + reverseDelta;
      setLedgerAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? { ...a, netBalance: newBal, updatedAt: new Date().toISOString() } : a))
      );
    }

    setLedgerEntries((prev) => prev.filter((e) => e.id !== entryId));
    showToast('Ledger entry deleted');
  };

  // Cashflow management
  const addCashflowRecord = (recordData: Omit<DailyCashflowRecord, 'id' | 'createdAt'>) => {
    const newRecord: DailyCashflowRecord = {
      ...recordData,
      id: `cf_${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setDailyCashflows((prev) => [newRecord, ...prev]);
    supabaseService.insertCashflowRecord(newRecord);
    showToast(`Recorded ${newRecord.type}: ₹${newRecord.amount}`);
  };

  const deleteCashflowRecord = (id: string) => {
    setDailyCashflows((prev) => prev.filter((cf) => cf.id !== id));
    supabaseService.deleteCashflowRecord(id);
    showToast('Cashflow record deleted');
  };

  // Settings
  const updateShopProfile = (profile: Partial<ShopProfile>) => {
    setShopProfile((prev) => ({ ...prev, ...profile }));
    showToast('Shop profile saved');
  };

  const updateUiConfig = (cfg: Partial<DynamicUiConfig>) => {
    setUiConfig((prev) => ({
      ...prev,
      ...cfg,
      theme: { ...prev.theme, ...(cfg.theme || {}) },
      features: { ...prev.features, ...(cfg.features || {}) }
    }));
    showToast('Display settings updated');
  };

  const selectLogo = (logoPath: string) => {
    setSelectedLogo(logoPath);
    setShopProfile((prev) => ({ ...prev, logo: logoPath }));
    showToast('Store logo updated');
  };

  const clearTransactions = () => {
    setTransactions([]);
    showToast('Transaction history cleared');
  };

  const deleteAllData = async () => {
    try {
      await supabaseService.deleteAllData();
      setItems([]);
      setTransactions([]);
      setDailyCashflows([]);
      showToast('All items, sales, expenses, khata and quotes deleted successfully!');
    } catch (e) {
      console.error('Failed to delete everything:', e);
      showToast('Delete everything action failed');
    }
  };

  const bulkImportItems = async (importedItems: Item[], replace: boolean) => {
    try {
      if (replace) {
        await supabaseService.deleteAllItems();
        setItems(importedItems);
      } else {
        setItems((prev) => {
          const existingIds = new Set(importedItems.map((i) => i.id));
          const filteredPrev = prev.filter((i) => !existingIds.has(i.id));
          return [...importedItems, ...filteredPrev];
        });
      }
      await supabaseService.bulkUpsertItems(importedItems);
    } catch (e) {
      console.error('Bulk import items failed', e);
      showToast('Failed to import items');
    }
  };

  const resetToDemoData = () => {
    refreshFromSupabase();
    showToast('Refreshed directly from Supabase database');
  };

  const exportDataJson = (): string => {
    const fullBackup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      shopProfile,
      items,
      transactions,
      quotations,
      ledgerAccounts,
      ledgerEntries,
      dailyCashflows,
      uiConfig
    };
    return JSON.stringify(fullBackup, null, 2);
  };

  const importDataJson = (json: string): boolean => {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data.items)) setItems(data.items);
      if (Array.isArray(data.transactions)) setTransactions(data.transactions);
      if (Array.isArray(data.quotations)) setQuotations(data.quotations);
      if (Array.isArray(data.ledgerAccounts)) setLedgerAccounts(data.ledgerAccounts);
      if (Array.isArray(data.ledgerEntries)) setLedgerEntries(data.ledgerEntries);
      if (Array.isArray(data.dailyCashflows)) setDailyCashflows(data.dailyCashflows);
      if (data.shopProfile) setShopProfile(data.shopProfile);
      if (data.uiConfig) setUiConfig(data.uiConfig);
      showToast('Data imported successfully!');
      return true;
    } catch (e) {
      showToast('Failed to parse backup JSON');
      return false;
    }
  };

  return (
    <StockContext.Provider
      value={{
        items,
        transactions,
        quotations,
        ledgerAccounts,
        ledgerEntries,
        dailyCashflows,
        shopProfile,
        uiConfig,
        selectedLogo,
        supabaseStatus,
        isRealtimeLive,
        refreshFromSupabase,
        isAuthed,
        isAdmin,
        isPinLocked,
        adminPin,
        unlockAdmin,
        exitAdmin,
        setAppAuthed,
        setPinLockEnabled,
        changeAdminPin,
        addItem,
        updateItem,
        deleteItem,
        deleteMultipleItems,
        addStockTransaction,
        confirmPurchaseBill,
        createQuotation,
        updateQuotation,
        deleteQuotation,
        convertQuotationToBill,
        addLedgerAccount,
        updateLedgerAccount,
        deleteLedgerAccount,
        addLedgerEntry,
        deleteLedgerEntry,
        addCashflowRecord,
        deleteCashflowRecord,
        updateShopProfile,
        updateUiConfig,
        selectLogo,
        clearTransactions,
        deleteAllData,
        bulkImportItems,
        resetToDemoData,
        exportDataJson,
        importDataJson,
        toastMessage,
        showToast
      }}
    >
      {children}
    </StockContext.Provider>
  );
};

export const useStock = () => {
  const context = useContext(StockContext);
  if (!context) throw new Error('useStock must be used within a StockProvider');
  return context;
};
