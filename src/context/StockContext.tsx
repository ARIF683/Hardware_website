import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Item,
  TransactionRecord,
  QuotationRecord,
  LedgerAccount,
  LedgerEntry,
  DailyCashflowRecord,
  ShopProfile,
  DynamicUiConfig,
  BillRowData,
  ColorTintLog,
  ParsedTintRow
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
  bannerUrl: string | null;
  logoUrl: string | null;
  updateStoreBanner: (url: string | null) => Promise<void>;
  updateStoreLogo: (url: string | null) => Promise<void>;

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
  addItem: (itemData: Omit<Item, 'id' | 'updatedAt'>) => Promise<Item>;
  updateItem: (item: Item) => Promise<void>;
  deleteItem: (id: string) => void;
  deleteMultipleItems: (ids: string[]) => void;
  updateMultipleItemsImage: (ids: string[], imageUrl: string) => Promise<void>;
  themeColor: string;
  setThemeColor: (color: string) => void;
  tintLogs: ColorTintLog[];
  processedTintIds: string[];
  processColorMachineImport: (
    rows: ParsedTintRow[],
    manualMappings?: Record<string, string>
  ) => { deductedCount: number; alreadyCount: number; totalLiters: number };
  clearTintLogs: () => void;
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
    const list = loadLocal<LedgerAccount[]>('ledger_accounts', []);
    // Purge sample mock accounts if present
    return list.filter((a) => !a.id.startsWith('acc_1') && !a.id.startsWith('acc_2') && !a.id.startsWith('acc_3') && !a.id.startsWith('acc_4'));
  });
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(() => {
    const list = loadLocal<LedgerEntry[]>('ledger_entries', []);
    return list.filter((e) => !e.id.startsWith('entry_1') && !e.id.startsWith('entry_2') && !e.id.startsWith('entry_3') && !e.id.startsWith('entry_4'));
  });
  const [dailyCashflows, setDailyCashflows] = useState<DailyCashflowRecord[]>(() => {
    const list = loadLocal<DailyCashflowRecord[]>('daily_cashflows', []);

    // Strip old mock records if any exist in local storage
    return list.filter(
      (c) =>
        !c.id.startsWith('cf_1') &&
        !c.id.startsWith('cf_2') &&
        !c.id.startsWith('cf_3') &&
        !c.id.startsWith('cf_4') &&
        !c.id.startsWith('cf_5') &&
        !c.id.startsWith('cf_6') &&
        !c.id.startsWith('cf_7')
    );
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
  const [bannerUrl, setBannerUrl] = useState<string | null>(() =>
    loadLocal('store_custom_banner', null)
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    loadLocal('store_custom_logo', null)
  );
  const bannerUrlRef = useRef<string | null>(bannerUrl);
  bannerUrlRef.current = bannerUrl;
  const logoUrlRef = useRef<string | null>(logoUrl);
  logoUrlRef.current = logoUrl;

  // Supabase sync status
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);

  // Auth
  const [isAuthed, setIsAuthed] = useState<boolean>(() => loadLocal('is_authed', true));
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isPinLocked, setIsPinLocked] = useState<boolean>(() => loadLocal('is_pin_locked', false));
  const [adminPin, setAdminPin] = useState<string>(() => loadLocal('admin_pin', '1234'));
  const [themeColor, setThemeColorState] = useState<string>(() => loadLocal('theme_color', '#3b82f6'));
  const [tintLogs, setTintLogs] = useState<ColorTintLog[]>(() =>
    loadLocal<ColorTintLog[]>('tint_logs', [])
  );
  const [processedTintIds, setProcessedTintIds] = useState<string[]>(() =>
    loadLocal<string[]>('processed_tint_ids', [])
  );

  useEffect(() => {
    saveLocal('tint_logs', tintLogs);
  }, [tintLogs]);

  useEffect(() => {
    saveLocal('processed_tint_ids', processedTintIds);
  }, [processedTintIds]);

  const setThemeColor = (color: string) => {
    setThemeColorState(color);
    localStorage.setItem('hardware_theme_color', JSON.stringify(color));
  };

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
  useEffect(() => saveLocal('store_custom_banner', bannerUrl), [bannerUrl]);
  useEffect(() => saveLocal('store_custom_logo', logoUrl), [logoUrl]);
  useEffect(() => saveLocal('is_authed', isAuthed), [isAuthed]);
  useEffect(() => saveLocal('is_pin_locked', isPinLocked), [isPinLocked]);
  useEffect(() => saveLocal('admin_pin', adminPin), [adminPin]);

  // Initial fetch from live Supabase DB
  const refreshFromSupabase = useCallback(async () => {
    setSupabaseStatus('connecting');
    try {
      const [remoteItems, remoteTx, remoteCashflows, remoteQuotes, remoteLedgerAcc, remoteLedgerEntries, remoteStoreProfile] = await Promise.all([
        supabaseService.fetchAllItems(),
        supabaseService.fetchTransactions(),
        supabaseService.fetchDailyCashflows(),
        supabaseService.fetchQuotations(),
        supabaseService.fetchLedgerAccounts(),
        supabaseService.fetchLedgerEntries(),
        supabaseService.fetchStoreProfile()
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
        setDailyCashflows(remoteCashflows);
      }

      if (remoteQuotes && remoteQuotes.length > 0) {
        setQuotations(remoteQuotes);
      }

      if (remoteLedgerAcc && remoteLedgerAcc.length > 0) {
        setLedgerAccounts(remoteLedgerAcc);
      }

      if (remoteLedgerEntries && remoteLedgerEntries.length > 0) {
        setLedgerEntries(remoteLedgerEntries);
      }
      if (remoteStoreProfile) {
        if (remoteStoreProfile.bannerUrl !== undefined) {
          setBannerUrl(remoteStoreProfile.bannerUrl);
          saveLocal("store_custom_banner", remoteStoreProfile.bannerUrl);
        }
        if (remoteStoreProfile.logoUrl !== undefined) {
          setLogoUrl(remoteStoreProfile.logoUrl);
          saveLocal("store_custom_logo", remoteStoreProfile.logoUrl);
          if (remoteStoreProfile.logoUrl) {
            setShopProfile((prev) => ({ ...prev, logo: remoteStoreProfile.logoUrl! }));
          }
        }
      }
    } catch (e) {
      console.warn('Could not sync with Supabase, using local cache', e);
      setSupabaseStatus('offline');
    }
  }, [showToast]);

  useEffect(() => {
    refreshFromSupabase();

    // Connect realtime WebSocket
    supabaseService.connectRealtime({
      onStoreProfileChanged: (banner: string | null, logo: string | null) => {
        setIsRealtimeLive(true);
        if (banner !== undefined) {
          setBannerUrl(banner);
          saveLocal("store_custom_banner", banner);
        }
        if (logo !== undefined) {
          setLogoUrl(logo);
          saveLocal("store_custom_logo", logo);
          if (logo) {
            setShopProfile((prev) => ({ ...prev, logo }));
          }
        }
      },
      onItemChanged: (type: string, record: any) => {
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
                imageUrl: record.image_url ? String(record.image_url) : null,
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
      onCashflowChanged: (type: string, record: any) => {
        setIsRealtimeLive(true);
        if (type === 'INSERT' || type === 'UPDATE') {
          if (record && (record.id || record.client_id)) {
            const isExpense =
              String(record.type).toUpperCase() === 'EXPENSE' ||
              (String(record.type).toUpperCase() !== 'SALE' && Number(record.cash_out || 0) > 0);
            const isSale = !isExpense;

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
      },
      onQuotationChanged: (type: string, record: any) => {
        setIsRealtimeLive(true);
        if (type === 'INSERT' || type === 'UPDATE') {
          if (record && record.id) {
            const mapped: QuotationRecord = {
              id: String(record.id),
              quotationNo: String(record.quotation_no || record.quotationNo || ''),
              customerName: String(record.customer_name || record.customerName || ''),
              customerPhone: String(record.customer_phone || record.customerPhone || ''),
              customerAddress: String(record.customer_address || record.customerAddress || ''),
              date: String(record.date || ''),
              validUntil: String(record.valid_until || record.validUntil || ''),
              items: (record.items || []).map((item: any) => ({
                itemId: item.itemId || item.item_id || null,
                name: String(item.name || ''),
                code: String(item.code || ''),
                type: String(item.type || ''),
                unit: String(item.unit || 'pcs'),
                qty: Number(item.qty || 0),
                unitPrice: Number(item.unitPrice || item.unit_price || 0),
                discountPercent: Number(item.discountPercent || item.discount_percent || 0),
                total: Number(item.total || 0)
              })),
              subtotal: Number(record.subtotal || 0),
              discount: Number(record.discount || 0),
              taxPercent: Number(record.tax_percent || record.taxPercent || 0),
              taxAmount: Number(record.tax_amount || record.taxAmount || 0),
              grandTotal: Number(record.grand_total || record.grandTotal || 0),
              status: (record.status || 'Draft') as any,
              notes: String(record.notes || ''),
              createdAt: String(record.created_at || new Date().toISOString())
            };
            setQuotations((prev) => {
              const idx = prev.findIndex((q) => q.id === mapped.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = mapped;
                return updated;
              }
              return [mapped, ...prev];
            });
          }
        } else if (type === 'DELETE') {
          if (record && record.id) {
            setQuotations((prev) => prev.filter((q) => q.id !== String(record.id)));
          }
        }
      },
      onLedgerAccountChanged: (type: string, record: any) => {
        setIsRealtimeLive(true);
        if (type === 'INSERT' || type === 'UPDATE') {
          if (record && record.id) {
            const mapped: LedgerAccount = {
              id: String(record.id),
              name: String(record.name || ''),
              phone: String(record.phone || ''),
              address: String(record.address || ''),
              type: (record.type || 'CUSTOMER') as any,
              netBalance: Number(record.net_balance || record.netBalance || 0),
              creditLimit: Number(record.credit_limit || record.creditLimit || 0),
              notes: String(record.notes || ''),
              createdAt: String(record.created_at || new Date().toISOString()),
              updatedAt: String(record.updated_at || new Date().toISOString())
            };
            setLedgerAccounts((prev) => {
              const idx = prev.findIndex((acc) => acc.id === mapped.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = mapped;
                return updated;
              }
              return [mapped, ...prev];
            });
          }
        } else if (type === 'DELETE') {
          if (record && record.id) {
            setLedgerAccounts((prev) => prev.filter((acc) => acc.id !== String(record.id)));
          }
        }
      },
      onLedgerEntryChanged: (type: string, record: any) => {
        setIsRealtimeLive(true);
        if (type === 'INSERT' || type === 'UPDATE') {
          if (record && record.id) {
            const mapped: LedgerEntry = {
              id: String(record.id),
              accountId: String(record.account_id || record.accountId || ''),
              type: (record.type || 'GAVE') as any,
              amount: Number(record.amount || 0),
              balanceAfter: Number(record.balance_after || record.balanceAfter || 0),
              date: String(record.date || ''),
              description: String(record.description || ''),
              billRef: String(record.bill_ref || record.billRef || ''),
              createdAt: String(record.created_at || new Date().toISOString())
            };
            setLedgerEntries((prev) => {
              const idx = prev.findIndex((e) => e.id === mapped.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = mapped;
                return updated;
              }
              return [mapped, ...prev];
            });
          }
        } else if (type === 'DELETE') {
          if (record && record.id) {
            setLedgerEntries((prev) => prev.filter((e) => e.id !== String(record.id)));
          }
        }
      }
    });

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
  const addItem = async (itemData: Omit<Item, 'id' | 'updatedAt'>): Promise<Item> => {
    const newItem: Item = {
      ...itemData,
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      updatedAt: new Date().toISOString()
    };
    setItems((prev) => [newItem, ...prev]);

    try {
      await supabaseService.upsertItem(newItem);
    } catch (err: any) {
      console.error('Supabase addItem error:', err);
      showToast(`Warning: Remote sync error: ${err?.message || 'DB error'}`);
    }

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

  const updateItem = async (updated: Item): Promise<void> => {
    const withTimestamp = { ...updated, updatedAt: new Date().toISOString() };
    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? withTimestamp : item))
    );
    try {
      await supabaseService.upsertItem(withTimestamp);
      showToast(`Updated: ${updated.name}`);
    } catch (err: any) {
      console.error('Supabase updateItem error:', err);
      showToast(`Warning: Remote sync error: ${err?.message || 'DB error'}`);
      throw err;
    }
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

  const updateMultipleItemsImage = async (ids: string[], imageUrl: string): Promise<void> => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((i) => (ids.includes(i.id) ? { ...i, imageUrl, updatedAt: now } : i))
    );
    try {
      await Promise.all(
        ids.map(async (id) => {
          const item = items.find((i) => i.id === id);
          if (item) {
            await supabaseService.upsertItem({ ...item, imageUrl, updatedAt: now });
          }
        })
      );
      showToast(`Updated picture for ${ids.length} items`);
    } catch (err: any) {
      console.error('Failed to sync image updates:', err);
      showToast(`Warning: Remote sync error: ${err?.message || 'DB error'}`);
    }
  };

  const processColorMachineImport = (
    rows: ParsedTintRow[],
    manualMappings: Record<string, string> = {}
  ): { deductedCount: number; alreadyCount: number; totalLiters: number } => {
    const newProcessedSet = new Set(processedTintIds);
    const newLogs: ColorTintLog[] = [];
    const newTxList: TransactionRecord[] = [];
    const updatedItemsMap = new Map<string, Item>(items.map((i) => [i.id, { ...i }]));

    let deductedCount = 0;
    let alreadyCount = 0;
    let totalLiters = 0;
    const now = new Date().toISOString();

    for (const row of rows) {
      if (row.isAlreadyProcessed || newProcessedSet.has(row.tintRecordId)) {
        alreadyCount++;
        continue;
      }

      // Target item (matched or mapped)
      const targetItemId = manualMappings[row.tintRecordId] || row.matchedItem?.id;
      const targetItem = targetItemId ? updatedItemsMap.get(targetItemId) : null;

      if (targetItem) {
        const newQty = Math.round((targetItem.qty - row.deductQty) * 100) / 100;
        targetItem.qty = newQty;
        targetItem.updatedAt = now;
        updatedItemsMap.set(targetItem.id, targetItem);

        // Add transaction record with clear Base & Liter information (no shade code)
        const tx: TransactionRecord = {
          clientId: `tint_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          itemId: targetItem.id,
          itemName: targetItem.name,
          action: 'out',
          qty: row.deductQty,
          balance: newQty,
          note: `Color Tint: Base ${row.baseCode} • ${row.canFactor} pack (${row.totalLiters} Ltr dispensed)`,
          unit: row.deductUnit,
          createdAt: row.tintTimestampIso || now
        };
        newTxList.push(tx);
        supabaseService.insertTransaction(tx).catch(console.error);
        supabaseService.updateItemQty(targetItem.id, newQty).catch(console.error);
      }

      newLogs.push({
        tintRecordId: row.tintRecordId,
        productName: row.productName,
        baseCode: row.baseCode,
        canFactor: row.canFactor,
        canFactorLiters: row.canFactorLiters,
        liters: row.totalLiters,
        noOfCans: row.noOfCans,
        tintDate: row.tintDateRaw,
        tintTime: row.tintTimeRaw,
        tintTimestamp: row.tintTimestampIso,
        matchedItemId: targetItem?.id || null,
        matchedItemName: targetItem?.name || row.productName,
        matchedItemSize: targetItem?.size || row.canFactor,
        matchedItemBrand: targetItem?.brand || '',
        matchedItemType: targetItem?.type || '',
        qtyDeducted: targetItem ? row.deductQty : 0,
        deductUnit: row.deductUnit,
        deductedAt: now
      });

      newProcessedSet.add(row.tintRecordId);
      deductedCount++;
      totalLiters += row.totalLiters;
    }

    if (deductedCount > 0) {
      setItems(Array.from(updatedItemsMap.values()));
      setTransactions((prev) => [...newTxList, ...prev]);
      setTintLogs((prev) => [...newLogs, ...prev]);
      setProcessedTintIds(Array.from(newProcessedSet));
      showToast(`Tint Report Applied: ${deductedCount} record(s) deducted (${totalLiters.toFixed(1)} Ltr)`);
    } else {
      showToast(`No new tint records to deduct (${alreadyCount} already applied)`);
    }

    return { deductedCount, alreadyCount, totalLiters };
  };

  const clearTintLogs = () => {
    setTintLogs([]);
    setProcessedTintIds([]);
    showToast('Color tint history and processed IDs cleared');
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
        const updatedAcc = { ...existingAccount, netBalance: newBalance, updatedAt: now };
        setLedgerAccounts((prev) =>
          prev.map((acc) =>
            acc.id === existingAccount.id ? updatedAcc : acc
          )
        );
        supabaseService.upsertLedgerAccount(updatedAcc).catch(err => console.error(err));

        const newEntry: LedgerEntry = {
          id: `entry_${Date.now()}`,
          accountId: existingAccount.id,
          type: 'GOT',
          amount: totalBillAmount,
          balanceAfter: newBalance,
          date: billDate || now.split('T')[0],
          description: `Purchase Bill #${billNo || 'Bill'} (${included.length} items)`,
          billRef: billNo,
          createdAt: now
        };
        setLedgerEntries((prev) => [newEntry, ...prev]);
        supabaseService.upsertLedgerEntry(newEntry).catch(err => console.error(err));
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
        supabaseService.upsertLedgerAccount(newAcc).catch(err => console.error(err));

        const newEntry: LedgerEntry = {
          id: `entry_${Date.now()}`,
          accountId: newAcc.id,
          type: 'GOT',
          amount: totalBillAmount,
          balanceAfter: totalBillAmount,
          date: billDate || now.split('T')[0],
          description: `Purchase Bill #${billNo || 'Bill'} (${included.length} items)`,
          billRef: billNo,
          createdAt: now
        };
        setLedgerEntries((prev) => [newEntry, ...prev]);
        supabaseService.upsertLedgerEntry(newEntry).catch(err => console.error(err));
      }
    }

    // Sync bill to Supabase purchases table
    supabaseService.insertPurchaseRecord({
      supplier,
      billNo,
      billDate,
      total: totalBillAmount,
      lines: included.map(r => ({
        name: r.name,
        qty: r.qty,
        rate: r.rate,
        bill_name: r.name
      })),
      createdAt: now
    }).catch(err => console.error(err));

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
    supabaseService.upsertQuotation(newQuote).catch(err => console.error(err));
    showToast(`Quotation ${quotationNo} generated`);
    return newQuote;
  };

  const updateQuotation = (quote: QuotationRecord) => {
    setQuotations((prev) => prev.map((q) => (q.id === quote.id ? quote : q)));
    supabaseService.upsertQuotation(quote).catch(err => console.error(err));
    showToast(`Quotation ${quote.quotationNo} updated`);
  };

  const deleteQuotation = (id: string) => {
    setQuotations((prev) => prev.filter((q) => q.id !== id));
    supabaseService.deleteQuotation(id).catch(err => console.error(err));
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

    setQuotations((prev) =>
      prev.map((q) => (q.id === quoteId ? { ...q, status: 'Converted' } : q))
    );

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
    supabaseService.upsertLedgerAccount(newAcc).catch(err => console.error(err));

    if (openingBalance !== 0) {
      const isCustomer = newAcc.type === 'CUSTOMER';
      const entryType = isCustomer ? (openingBalance > 0 ? 'GAVE' : 'GOT') : (openingBalance > 0 ? 'GOT' : 'GAVE');
      const openingEntry: LedgerEntry = {
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
      setLedgerEntries((prev) => [openingEntry, ...prev]);
      supabaseService.upsertLedgerEntry(openingEntry).catch(err => console.error(err));
    }

    showToast(`Added ${newAcc.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}: ${newAcc.name}`);
    return newAcc;
  };

  const updateLedgerAccount = (updated: LedgerAccount) => {
    setLedgerAccounts((prev) =>
      prev.map((acc) => (acc.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : acc))
    );
    supabaseService.upsertLedgerAccount(updated).catch(err => console.error(err));
    showToast(`Account updated: ${updated.name}`);
  };

  const deleteLedgerAccount = (id: string) => {
    const acc = ledgerAccounts.find((a) => a.id === id);
    setLedgerAccounts((prev) => prev.filter((a) => a.id !== id));
    setLedgerEntries((prev) => prev.filter((e) => e.accountId !== id));
    supabaseService.deleteLedgerAccount(id).catch(err => console.error(err));
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

    const updatedAccount = { ...acc, netBalance: newBalance, updatedAt: now };
    setLedgerAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? updatedAccount : a))
    );
    supabaseService.upsertLedgerAccount(updatedAccount).catch(err => console.error(err));

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
    supabaseService.upsertLedgerEntry(newEntry).catch(err => console.error(err));

    if (acc.type === 'CUSTOMER' && type === 'GOT') {
      const cf: DailyCashflowRecord = {
        id: `cf_${Date.now()}`,
        date: date || now.split('T')[0],
        type: 'SALE',
        category: 'Customer Khata Collection',
        amount,
        paymentMode: 'Cash',
        note: `Payment from ${acc.name}${description ? ` (${description})` : ''}`,
        createdAt: now
      };
      setDailyCashflows((prev) => [cf, ...prev]);
      supabaseService.insertCashflowRecord(cf).catch(err => console.error(err));
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
      const updatedAcc = { ...acc, netBalance: newBal, updatedAt: new Date().toISOString() };
      setLedgerAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? updatedAcc : a))
      );
      supabaseService.upsertLedgerAccount(updatedAcc).catch(err => console.error(err));
    }

    setLedgerEntries((prev) => prev.filter((e) => e.id !== entryId));
    supabaseService.deleteLedgerEntry(entryId).catch(err => console.error(err));
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

  const updateStoreBanner = async (url: string | null) => {
    setBannerUrl(url);
    saveLocal("store_custom_banner", url);
    await supabaseService.saveStoreProfile(url, logoUrlRef.current);
    showToast("Store cover banner updated & synced!");
  };

  const updateStoreLogo = async (url: string | null) => {
    setLogoUrl(url);
    saveLocal("store_custom_logo", url);
    if (url) {
      setShopProfile((prev) => ({ ...prev, logo: url }));
    }
    await supabaseService.saveStoreProfile(bannerUrlRef.current, url);
    showToast("Store logo updated & synced!");
  };

  const selectLogo = (logoPath: string) => {
    setSelectedLogo(logoPath);
    setLogoUrl(logoPath);
    saveLocal("store_custom_logo", logoPath);
    setShopProfile((prev) => ({ ...prev, logo: logoPath }));
    supabaseService.saveStoreProfile(bannerUrlRef.current, logoPath);
    showToast("Store logo updated");
  };

  const clearTransactions = () => {
    setTransactions([]);
    showToast('Transaction history cleared');
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
        bannerUrl,
        logoUrl,
        updateStoreBanner,
        updateStoreLogo,
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
        updateMultipleItemsImage,
        themeColor,
        setThemeColor,
        tintLogs,
        processedTintIds,
        processColorMachineImport,
        clearTintLogs,
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
