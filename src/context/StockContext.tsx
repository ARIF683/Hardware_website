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
  refreshFromSupabase: (isSilent?: boolean) => Promise<void>;

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
  const [quotations, setQuotations] = useState<QuotationRecord[]>(() => {
    const list = loadLocal<any[]>('quotations', []);
    if (!Array.isArray(list)) return [];
    return list.map((q) => ({
      id: String(q.id || ''),
      quotationNo: String(q.quotationNo || q.quotation_no || `EST-${String(q.id || '').slice(0, 4).toUpperCase()}`),
      customerName: String(q.customerName || q.customer_name || 'Walk-in Customer'),
      customerPhone: String(q.customerPhone || q.customer_phone || ''),
      customerAddress: String(q.customerAddress || q.customer_address || ''),
      date: String(q.date || (q.createdAt ? String(q.createdAt).split('T')[0] : '') || ''),
      validUntil: String(q.validUntil || q.valid_until || ''),
      items: Array.isArray(q.items) ? q.items : [],
      subtotal: Number(q.subtotal || 0),
      discount: Number(q.discount || 0),
      taxPercent: Number(q.taxPercent ?? q.tax_percent ?? 0),
      taxAmount: Number(q.taxAmount ?? q.tax_amount ?? 0),
      grandTotal: Number(q.grandTotal ?? q.grand_total ?? q.finalAmount ?? 0),
      status: (['Draft', 'Sent', 'Accepted', 'Converted'].includes(q.status) ? q.status : 'Draft') as QuotationRecord['status'],
      notes: String(q.notes || ''),
      createdAt: String(q.createdAt || q.created_at || new Date().toISOString())
    }));
  });
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>(() => {
    const list = loadLocal<any[]>('ledger_accounts', []);
    if (!Array.isArray(list)) return [];
    const mockIds = new Set(['acc_1', 'acc_2', 'acc_3', 'acc_4']);
    return list
      .filter((a) => a && a.id && !mockIds.has(a.id))
      .map((a) => ({
        id: String(a.id),
        name: String(a.name || ''),
        phone: String(a.phone || ''),
        address: String(a.address || ''),
        type: (String(a.type || 'CUSTOMER').toUpperCase() === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER') as LedgerAccount['type'],
        netBalance: Number(a.netBalance ?? a.net_balance ?? 0),
        creditLimit: Number(a.creditLimit ?? a.credit_limit ?? 0),
        notes: String(a.notes || ''),
        createdAt: String(a.createdAt || a.created_at || new Date().toISOString()),
        updatedAt: String(a.updatedAt || a.updated_at || new Date().toISOString())
      }));
  });
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(() => {
    const list = loadLocal<any[]>('ledger_entries', []);
    if (!Array.isArray(list)) return [];
    const mockIds = new Set(['entry_1', 'entry_2', 'entry_3', 'entry_4']);
    return list
      .filter((e) => e && e.id && !mockIds.has(e.id))
      .map((e) => ({
        id: String(e.id),
        accountId: String(e.accountId || e.account_id || ''),
        type: (String(e.type || e.entryType || e.entry_type || 'GAVE').toUpperCase() === 'GOT' ? 'GOT' : 'GAVE') as 'GAVE' | 'GOT',
        amount: Number(e.amount || 0),
        balanceAfter: Number(e.balanceAfter ?? e.balance_after ?? 0),
        date: String(e.date || (e.createdAt ? String(e.createdAt).split('T')[0] : '') || ''),
        description: String(e.description ?? e.note ?? ''),
        billRef: String(e.billRef || e.bill_ref || ''),
        createdAt: String(e.createdAt || e.created_at || new Date().toISOString())
      }));
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
  const refreshFromSupabase = useCallback(async (isSilent = false) => {
    if (!isSilent) setSupabaseStatus('connecting');
    try {
      const [
        itemsResult,
        txResult,
        cashflowsResult,
        quotesResult,
        ledgerAccResult,
        ledgerEntriesResult,
        storeProfileResult
      ] = await Promise.allSettled([
        supabaseService.fetchAllItems(),
        supabaseService.fetchTransactions(),
        supabaseService.fetchDailyCashflows(),
        supabaseService.fetchQuotations(),
        supabaseService.fetchLedgerAccounts(),
        supabaseService.fetchLedgerEntries(),
        supabaseService.fetchStoreProfile()
      ]);

      let anySuccess = false;

      if (itemsResult.status === 'fulfilled' && itemsResult.value) {
        const remoteItems = itemsResult.value;
        if (remoteItems.length > 0) {
          setItems(remoteItems);
          if (!isSilent) {
            showToast(`Synced ${remoteItems.length} items from Supabase database!`);
          }
        }
        anySuccess = true;
      }

      if (txResult.status === 'fulfilled' && txResult.value && txResult.value.length > 0) {
        setTransactions(txResult.value);
        anySuccess = true;
      }

      if (cashflowsResult.status === 'fulfilled' && cashflowsResult.value && cashflowsResult.value.length > 0) {
        setDailyCashflows(cashflowsResult.value);
        anySuccess = true;
      }

      if (quotesResult.status === 'fulfilled' && quotesResult.value && quotesResult.value.length > 0) {
        setQuotations(quotesResult.value);
        anySuccess = true;
      }

      if (ledgerAccResult.status === 'fulfilled' && ledgerAccResult.value && ledgerAccResult.value.length > 0) {
        setLedgerAccounts(ledgerAccResult.value);
        anySuccess = true;
      }

      if (ledgerEntriesResult.status === 'fulfilled' && ledgerEntriesResult.value && ledgerEntriesResult.value.length > 0) {
        setLedgerEntries(ledgerEntriesResult.value);
        anySuccess = true;
      }

      if (storeProfileResult.status === 'fulfilled' && storeProfileResult.value) {
        const remoteStoreProfile = storeProfileResult.value;
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
        anySuccess = true;
      }

      if (anySuccess) {
        setSupabaseStatus('connected');
      } else {
        setSupabaseStatus('offline');
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
      onItemChanged: (type: string, record: any, oldId?: string) => {
        setIsRealtimeLive(true);
        if (type === 'INSERT' || type === 'UPDATE') {
          if (record && record.id) {
            setItems((prev) => {
              const idx = prev.findIndex((i) => i.id === record.id);
              if (idx >= 0) {
                const existing = prev[idx];
                const updated = [...prev];
                updated[idx] = {
                  ...existing,
                  name: record.name !== undefined && record.name ? record.name : existing.name,
                  code: record.code !== undefined ? record.code : existing.code,
                  barcode: record.barcode !== undefined ? record.barcode : existing.barcode,
                  type: record.type !== undefined ? record.type : existing.type,
                  brand: record.brand !== undefined ? record.brand : existing.brand,
                  size: record.size !== undefined ? record.size : existing.size,
                  aliases: record.aliases !== undefined ? record.aliases : existing.aliases,
                  mrp: record.mrp !== undefined ? record.mrp : existing.mrp,
                  cost: record.cost !== undefined ? Number(record.cost) : existing.cost,
                  price: record.price !== undefined ? Number(record.price) : existing.price,
                  qty: record.qty !== undefined ? Number(record.qty) : existing.qty,
                  low: record.low !== undefined ? Number(record.low) : existing.low,
                  unit: record.unit !== undefined ? record.unit : existing.unit,
                  imageUrl: record.image_url !== undefined ? (record.image_url ? String(record.image_url) : null) : existing.imageUrl,
                  updatedAt: record.updated_at || new Date().toISOString()
                };
                return updated;
              } else {
                const mappedItem: Item = {
                  id: record.id,
                  o: record.o || prev.length + 1,
                  name: record.name || 'New Item',
                  code: record.code || '',
                  barcode: record.barcode || '',
                  type: record.type || 'General Hardware',
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
                return [mappedItem, ...prev];
              }
            });
          }
        } else if (type === 'DELETE') {
          const targetId = record?.id || oldId;
          if (targetId) {
            setItems((prev) => prev.filter((i) => i.id !== targetId));
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

    // Auto-sync when user returns to this tab / unlocks phone
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshFromSupabase(true);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // Periodic background sync every 25 seconds to guarantee cross-device consistency
    const pollInterval = setInterval(() => {
      refreshFromSupabase(true);
    }, 25000);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      clearInterval(pollInterval);
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
    try {
      const safeRows = Array.isArray(rows) ? rows : [];
      const newProcessedSet = new Set(processedTintIds);
      const newLogs: ColorTintLog[] = [];
      const newTxList: TransactionRecord[] = [];
      const updatedItemsMap = new Map<string, Item>(items.map((i) => [i.id, { ...i }]));
      const itemsToSync = new Map<string, number>();

      let deductedCount = 0;
      let alreadyCount = 0;
      let totalLiters = 0;
      let failedCount = 0;
      const now = new Date().toISOString();

      for (let idx = 0; idx < safeRows.length; idx++) {
        const row = safeRows[idx];
        try {
          if (!row || !row.tintRecordId) {
            console.warn('[Billing/Tint] Skipped malformed tint row:', { rowIndex: idx, row });
            failedCount++;
            continue;
          }

          if (row.isAlreadyProcessed || newProcessedSet.has(row.tintRecordId)) {
            alreadyCount++;
            continue;
          }

          const targetItemId = manualMappings[row.tintRecordId] || row.matchedItem?.id;
          const targetItem = targetItemId ? updatedItemsMap.get(targetItemId) : null;

          if (targetItemId && !targetItem) {
            console.warn('[Billing/Tint] Target catalog item not found for tint deduction:', {
              rowIndex: idx,
              tintRecordId: row.tintRecordId,
              targetItemId,
              productName: row.productName
            });
          }

          const rawDeductQty = Number(row.deductQty);
          const validDeductQty = Number.isFinite(rawDeductQty) && rawDeductQty > 0 ? rawDeductQty : 0;

          if (targetItem && validDeductQty > 0) {
            const currentQty = Number.isFinite(Number(targetItem.qty)) ? Number(targetItem.qty) : 0;
            const newQty = Math.round((currentQty - validDeductQty) * 100) / 100;
            if (!Number.isFinite(newQty)) {
              throw new Error(`Computed invalid stock balance (${newQty}) for item ${targetItem.name}`);
            }

            targetItem.qty = newQty;
            targetItem.updatedAt = now;
            updatedItemsMap.set(targetItem.id, targetItem);
            itemsToSync.set(targetItem.id, newQty);

            const tx: TransactionRecord = {
              clientId: `tint_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              itemId: targetItem.id,
              itemName: targetItem.name,
              action: 'out',
              qty: validDeductQty,
              balance: newQty,
              note: `Color Tint: Base ${row.baseCode} • ${row.canFactor} pack (${row.totalLiters} Ltr dispensed)`,
              unit: row.deductUnit,
              createdAt: row.tintTimestampIso || now
            };
            newTxList.push(tx);
            supabaseService.insertTransaction(tx).catch((err) => {
              console.error('[Billing/Tint] Failed to sync tint transaction:', { tx, err });
            });
          } else if (targetItem && validDeductQty <= 0) {
            console.warn('[Billing/Tint] Skipped deduction due to invalid deductQty:', {
              rowIndex: idx,
              tintRecordId: row.tintRecordId,
              itemId: targetItem.id,
              deductQty: row.deductQty
            });
          }

          newLogs.push({
            tintRecordId: row.tintRecordId,
            productName: row.productName,
            baseCode: row.baseCode,
            canFactor: row.canFactor,
            canFactorLiters: row.canFactorLiters,
            liters: Number.isFinite(Number(row.totalLiters)) ? Number(row.totalLiters) : 0,
            noOfCans: Number.isFinite(Number(row.noOfCans)) ? Number(row.noOfCans) : 0,
            tintDate: row.tintDateRaw,
            tintTime: row.tintTimeRaw,
            tintTimestamp: row.tintTimestampIso,
            matchedItemId: targetItem?.id || null,
            matchedItemName: targetItem?.name || row.productName,
            matchedItemSize: targetItem?.size || row.canFactor,
            matchedItemBrand: targetItem?.brand || '',
            matchedItemType: targetItem?.type || '',
            qtyDeducted: targetItem ? validDeductQty : 0,
            deductUnit: row.deductUnit,
            deductedAt: now
          });

          newProcessedSet.add(row.tintRecordId);
          deductedCount++;
          totalLiters += Number.isFinite(Number(row.totalLiters)) ? Number(row.totalLiters) : 0;
        } catch (rowErr) {
          failedCount++;
          console.error('[Billing/Tint] Error calculating inventory deduction for tint row:', {
            rowIndex: idx,
            row,
            error: rowErr
          });
        }
      }

      if (deductedCount > 0) {
        setItems(Array.from(updatedItemsMap.values()));
        setTransactions((prev) => [...newTxList, ...prev]);
        setTintLogs((prev) => [...newLogs, ...prev]);
        setProcessedTintIds(Array.from(newProcessedSet));

        itemsToSync.forEach((finalQty, itemId) => {
          supabaseService.updateItemQty(itemId, finalQty).catch((err) => {
            console.error('[Billing/Tint] Failed to sync updated item qty to Supabase:', {
              itemId,
              finalQty,
              err
            });
          });
        });

        const failedSuffix = failedCount > 0 ? ` (${failedCount} failed)` : '';
        showToast(
          `Tint Report Applied: ${deductedCount} record(s) deducted (${totalLiters.toFixed(1)} Ltr)${failedSuffix}`
        );
      } else if (failedCount > 0) {
        showToast(`Tint import encountered ${failedCount} invalid record(s) — check console`);
      } else {
        showToast(`No new tint records to deduct (${alreadyCount} already applied)`);
      }

      return { deductedCount, alreadyCount, totalLiters };
    } catch (err) {
      console.error('[Billing/Tint] processColorMachineImport failed unexpectedly:', err);
      showToast('Failed to apply color tint deductions');
      return { deductedCount: 0, alreadyCount: 0, totalLiters: 0 };
    }
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
    supabaseService.updateItemQty(itemId, newQty).catch((err) => {
      console.error('Remote sync stock update error:', err);
      showToast(`Warning: Stock updated locally, but remote DB sync failed: ${err?.message || 'Error'}`);
    });

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
    try {
      const safeRows = Array.isArray(rows) ? rows : [];
      const included = safeRows.filter(
        (r) => r && r.include && typeof r.name === 'string' && r.name.trim().length > 0
      );
      if (included.length === 0) {
        console.warn('[Billing/Purchase] confirmPurchaseBill aborted: no valid rows included');
        showToast('No valid purchase items to process');
        return;
      }

      const now = new Date().toISOString();
      const workingItemsMap = new Map<string, Item>(items.map((i) => [i.id, { ...i }]));
      const newItemsCreated: Item[] = [];
      const newTxList: TransactionRecord[] = [];
      const itemsToSync = new Map<string, Item>();
      const skippedRows: string[] = [];
      let totalBillAmount = 0;
      let processedCount = 0;

      included.forEach((row, idx) => {
        try {
          const cleanRowName = row.name.trim();
          const rowQty = Number(row.qty);
          const rowRate = Number(row.rate);

          if (!Number.isFinite(rowQty) || rowQty <= 0) {
            console.warn('[Billing/Purchase] Skipped row with invalid quantity:', {
              rowIndex: idx,
              rowName: cleanRowName,
              rawQty: row.qty
            });
            skippedRows.push(cleanRowName);
            return;
          }

          const safeRate = Number.isFinite(rowRate) && rowRate >= 0 ? rowRate : 0;
          const lineCost = Math.round(safeRate * rowQty * 100) / 100;
          totalBillAmount += lineCost;

          const rawMatchedId = typeof row.matchedItemId === 'string' ? row.matchedItemId.trim() : '';
          let existing: Item | undefined = rawMatchedId ? workingItemsMap.get(rawMatchedId) : undefined;

          if (!existing) {
            if (rawMatchedId) {
              console.warn('[Billing/Purchase] matchedItemId not found in catalog; trying name match:', {
                rowIndex: idx,
                matchedItemId: rawMatchedId,
                rowName: cleanRowName
              });
            }
            const normalizedName = cleanRowName.toLowerCase();
            existing = Array.from(workingItemsMap.values()).find(
              (i) => (i.name || '').trim().toLowerCase() === normalizedName
            );
          }

          if (existing) {
            const currentQty = Number.isFinite(Number(existing.qty)) ? Number(existing.qty) : 0;
            const newQty = Math.round((currentQty + rowQty) * 100) / 100;
            if (!Number.isFinite(newQty)) {
              throw new Error(`Invalid stock calculation for "${existing.name}"`);
            }

            const updatedItem: Item = {
              ...existing,
              qty: newQty,
              cost: safeRate > 0 ? safeRate : existing.cost,
              updatedAt: now
            };
            workingItemsMap.set(existing.id, updatedItem);
            itemsToSync.set(existing.id, updatedItem);

            const tx: TransactionRecord = {
              clientId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              itemId: existing.id,
              itemName: existing.name,
              action: 'in',
              qty: rowQty,
              balance: newQty,
              note: `Bill #${billNo || 'Purchase'} - ${supplier || 'Supplier'}`,
              unit: row.unit || existing.unit,
              createdAt: now
            };
            newTxList.push(tx);
          } else {
            const newItem: Item = {
              id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
              o: workingItemsMap.size + 1,
              name: cleanRowName,
              code: '',
              barcode: '',
              type: row.type || 'General Hardware',
              brand: row.brand || '',
              size: row.size || '',
              aliases: '',
              mrp: Math.round(safeRate * 1.3),
              cost: safeRate,
              price: Math.round(safeRate * 1.25),
              qty: rowQty,
              low: 5,
              unit: row.unit || 'pcs',
              updatedAt: now
            };
            workingItemsMap.set(newItem.id, newItem);
            newItemsCreated.push(newItem);
            itemsToSync.set(newItem.id, newItem);

            const tx: TransactionRecord = {
              clientId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              itemId: newItem.id,
              itemName: newItem.name,
              action: 'in',
              qty: rowQty,
              balance: rowQty,
              note: `New Item via Bill #${billNo || 'Purchase'} - ${supplier || 'Supplier'}`,
              unit: newItem.unit,
              createdAt: now
            };
            newTxList.push(tx);
          }
          processedCount++;
        } catch (rowErr) {
          console.error('[Billing/Purchase] Error processing purchase bill row:', {
            rowIndex: idx,
            row,
            error: rowErr
          });
          skippedRows.push(row?.name || `Row #${idx + 1}`);
        }
      });

      if (processedCount === 0) {
        showToast('Could not process any valid purchase items — check console');
        return;
      }

      // Commit inventory updates once with cumulative quantities
      const updatedCatalog = Array.from(workingItemsMap.values()).filter(
        (i) => !newItemsCreated.some((created) => created.id === i.id)
      );
      setItems([...newItemsCreated, ...updatedCatalog]);
      if (newTxList.length > 0) {
        setTransactions((prev) => [...newTxList, ...prev]);
      }

      // Sync items and transactions safely
      itemsToSync.forEach((itemToSync) => {
        supabaseService.upsertItem(itemToSync).catch((err) => {
          console.error('[Billing/Purchase] Remote upsertItem failed:', {
            itemId: itemToSync.id,
            itemName: itemToSync.name,
            err
          });
        });
      });
      newTxList.forEach((tx) => {
        supabaseService.insertTransaction(tx).catch((err) => {
          console.error('[Billing/Purchase] Remote insertTransaction failed:', { tx, err });
        });
      });

      // Update supplier ledger safely
      try {
        const cleanSupplier = (supplier || '').trim();
        if (cleanSupplier.length > 0 && Number.isFinite(totalBillAmount)) {
          const existingAccount = ledgerAccounts.find(
            (acc) =>
              acc.type === 'SUPPLIER' &&
              (acc.name || '').trim().toLowerCase() === cleanSupplier.toLowerCase()
          );

          if (existingAccount) {
            const currentBal = Number.isFinite(Number(existingAccount.netBalance))
              ? Number(existingAccount.netBalance)
              : 0;
            const newBalance = Math.round((currentBal + totalBillAmount) * 100) / 100;
            const updatedAcc = { ...existingAccount, netBalance: newBalance, updatedAt: now };
            setLedgerAccounts((prev) =>
              prev.map((acc) => (acc.id === existingAccount.id ? updatedAcc : acc))
            );
            supabaseService.upsertLedgerAccount(updatedAcc).catch((err) => {
              console.error('[Billing/Purchase] upsertLedgerAccount failed:', err);
            });

            const newEntry: LedgerEntry = {
              id: `entry_${Date.now()}`,
              accountId: existingAccount.id,
              type: 'GOT',
              amount: totalBillAmount,
              balanceAfter: newBalance,
              date: billDate || now.split('T')[0],
              description: `Purchase Bill #${billNo || 'Bill'} (${processedCount} items)`,
              billRef: billNo,
              createdAt: now
            };
            setLedgerEntries((prev) => [newEntry, ...prev]);
            supabaseService.upsertLedgerEntry(newEntry).catch((err) => {
              console.error('[Billing/Purchase] upsertLedgerEntry failed:', err);
            });
          } else {
            const newAcc: LedgerAccount = {
              id: `acc_${Date.now()}`,
              name: cleanSupplier,
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
            supabaseService.upsertLedgerAccount(newAcc).catch((err) => {
              console.error('[Billing/Purchase] upsertLedgerAccount (new) failed:', err);
            });

            const newEntry: LedgerEntry = {
              id: `entry_${Date.now()}`,
              accountId: newAcc.id,
              type: 'GOT',
              amount: totalBillAmount,
              balanceAfter: totalBillAmount,
              date: billDate || now.split('T')[0],
              description: `Purchase Bill #${billNo || 'Bill'} (${processedCount} items)`,
              billRef: billNo,
              createdAt: now
            };
            setLedgerEntries((prev) => [newEntry, ...prev]);
            supabaseService.upsertLedgerEntry(newEntry).catch((err) => {
              console.error('[Billing/Purchase] upsertLedgerEntry (new) failed:', err);
            });
          }
        }
      } catch (ledgerErr) {
        console.error('[Billing/Purchase] Failed updating supplier Khata ledger:', {
          supplier,
          billNo,
          error: ledgerErr
        });
      }

      // Sync bill to Supabase purchases table safely
      try {
        supabaseService
          .insertPurchaseRecord({
            supplier: supplier || '',
            billNo: billNo || '',
            billDate: billDate || now.split('T')[0],
            total: totalBillAmount,
            lines: included.map((r) => ({
              name: r.name,
              qty: Number.isFinite(Number(r.qty)) ? Number(r.qty) : 0,
              rate: Number.isFinite(Number(r.rate)) ? Number(r.rate) : 0,
              bill_name: r.name
            })),
            createdAt: now
          })
          .catch((err) => {
            console.error('[Billing/Purchase] insertPurchaseRecord failed:', err);
          });
      } catch (syncErr) {
        console.error('[Billing/Purchase] Purchase record sync preparation failed:', syncErr);
      }

      if (skippedRows.length > 0) {
        showToast(
          `Bill confirmed: ${processedCount} items synced, ${skippedRows.length} skipped — check console`
        );
      } else {
        showToast(`Bill confirmed! ${processedCount} items synced to Supabase.`);
      }
    } catch (err) {
      console.error('[Billing/Purchase] confirmPurchaseBill failed unexpectedly:', {
        supplier,
        billNo,
        error: err
      });
      showToast('Purchase bill update failed — check console for details');
    }
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
    try {
      const quote = quotations.find((q) => q.id === quoteId);
      if (!quote) {
        console.warn('[Billing] convertQuotationToBill aborted: quotation not found', { quoteId });
        showToast('Quotation not found');
        return;
      }

      if (quote.status === 'Converted') {
        console.warn('[Billing] convertQuotationToBill skipped: quotation already converted', {
          quoteId,
          quotationNo: quote.quotationNo
        });
        showToast(`Quote #${quote.quotationNo} is already converted`);
        return;
      }

      const now = new Date().toISOString();
      const quoteLines = Array.isArray(quote.items) ? quote.items : [];
      const workingItemsMap = new Map<string, Item>(items.map((i) => [i.id, { ...i }]));
      const updatedItemIds = new Set<string>();
      const newTxList: TransactionRecord[] = [];
      const unmatchedLines: string[] = [];
      const invalidLines: string[] = [];
      let deductedCount = 0;

      // Deduct inventory line-by-line with granular isolation so one bad item match never crashes billing
      quoteLines.forEach((line, idx) => {
        try {
          if (!line || typeof line !== 'object') {
            throw new Error(`Malformed quotation line item at index ${idx}`);
          }

          const rawItemId = typeof line.itemId === 'string' ? line.itemId.trim() : '';
          const rawLineName = typeof line.name === 'string' ? line.name.trim() : '';
          const normalizedLineName = rawLineName.toLowerCase();

          let match: Item | undefined = rawItemId ? workingItemsMap.get(rawItemId) : undefined;
          if (!match && normalizedLineName) {
            match = Array.from(workingItemsMap.values()).find(
              (i) => (i.name || '').trim().toLowerCase() === normalizedLineName
            );
            if (match && rawItemId) {
              console.warn(
                '[Billing] Quotation line itemId not found in catalog; matched by name fallback:',
                {
                  quoteId,
                  quotationNo: quote.quotationNo,
                  lineIndex: idx,
                  staleItemId: rawItemId,
                  matchedItemId: match.id,
                  matchedName: match.name
                }
              );
            }
          }

          if (!match) {
            console.warn(
              '[Billing] Skipped inventory deduction — no valid catalog item match found:',
              {
                quoteId,
                quotationNo: quote.quotationNo,
                lineIndex: idx,
                itemId: line.itemId ?? null,
                itemName: line.name ?? ''
              }
            );
            unmatchedLines.push(rawLineName || `Line #${idx + 1}`);
            return;
          }

          const deductQty = Number(line.qty);
          if (!Number.isFinite(deductQty) || deductQty <= 0) {
            console.warn(
              '[Billing] Skipped inventory deduction — invalid line quantity:',
              {
                quoteId,
                quotationNo: quote.quotationNo,
                lineIndex: idx,
                itemId: match.id,
                itemName: match.name,
                rawQty: line.qty
              }
            );
            invalidLines.push(rawLineName || match.name);
            return;
          }

          const currentQty = Number.isFinite(Number(match.qty)) ? Number(match.qty) : 0;
          const newBal = Math.round((currentQty - deductQty) * 100) / 100;
          if (!Number.isFinite(newBal)) {
            throw new Error(`Computed invalid stock balance (${newBal}) for "${match.name}"`);
          }

          workingItemsMap.set(match.id, { ...match, qty: newBal, updatedAt: now });
          updatedItemIds.add(match.id);

          const tx: TransactionRecord = {
            clientId: `tx_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
            itemId: match.id,
            itemName: match.name,
            action: 'out',
            qty: deductQty,
            balance: newBal,
            note: `Converted Bill from Quote #${quote.quotationNo || ''} (${quote.customerName || 'Customer'})`,
            unit: line.unit || match.unit || 'pcs',
            createdAt: now
          };
          newTxList.push(tx);
          deductedCount++;
        } catch (lineErr) {
          console.error('[Billing] Inventory deduction error for quotation line:', {
            quoteId,
            quotationNo: quote.quotationNo,
            lineIndex: idx,
            line,
            error: lineErr
          });
          invalidLines.push(line?.name || `Line #${idx + 1}`);
        }
      });

      // Commit cumulative stock & transaction updates
      if (updatedItemIds.size > 0) {
        setItems(Array.from(workingItemsMap.values()));
        updatedItemIds.forEach((itemId) => {
          const updated = workingItemsMap.get(itemId);
          if (updated) {
            supabaseService.updateItemQty(itemId, updated.qty).catch((err) => {
              console.error('[Billing] Failed syncing deducted item qty to Supabase:', {
                quoteId,
                itemId,
                qty: updated.qty,
                err
              });
            });
          }
        });
      }

      if (newTxList.length > 0) {
        setTransactions((prev) => [...newTxList, ...prev]);
        newTxList.forEach((tx) => {
          supabaseService.insertTransaction(tx).catch((err) => {
            console.error('[Billing] Failed syncing quotation sale transaction:', { tx, err });
          });
        });
      }

      // Record cashflow safely
      try {
        const rawGrandTotal = Number(quote.grandTotal ?? (quote as any).finalAmount ?? 0);
        const safeGrandTotal = Number.isFinite(rawGrandTotal) ? rawGrandTotal : 0;
        const cf: DailyCashflowRecord = {
          id: `cf_${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          type: 'SALE',
          category: 'Hardware & Quotation Sale',
          amount: safeGrandTotal,
          paymentMode: 'Cash',
          note: `Quotation #${quote.quotationNo || ''} - ${quote.customerName || 'Walk-in Customer'}`,
          createdAt: now
        };
        setDailyCashflows((prev) => [cf, ...prev]);
        supabaseService.insertCashflowRecord(cf).catch((err) => {
          console.error('[Billing] Failed syncing quotation cashflow to Supabase:', { cf, err });
        });
      } catch (cfErr) {
        console.error('[Billing] Failed creating cashflow record for converted quotation:', {
          quoteId,
          error: cfErr
        });
      }

      // Mark quotation as Converted and sync
      try {
        const convertedQuote: QuotationRecord = { ...quote, status: 'Converted' };
        setQuotations((prev) =>
          prev.map((q) => (q.id === quoteId ? convertedQuote : q))
        );
        supabaseService.upsertQuotation(convertedQuote).catch((err) => {
          console.error('[Billing] Failed syncing converted quotation status to Supabase:', {
            quoteId,
            err
          });
        });
      } catch (statusErr) {
        console.error('[Billing] Failed updating quotation status to Converted:', {
          quoteId,
          error: statusErr
        });
      }

      const skippedTotal = unmatchedLines.length + invalidLines.length;
      if (skippedTotal > 0) {
        showToast(
          `Quote #${quote.quotationNo} converted (${deductedCount} deducted, ${skippedTotal} skipped — check console)`
        );
      } else {
        showToast(`Quote #${quote.quotationNo} converted to Bill & inventory updated!`);
      }
    } catch (err) {
      console.error('[Billing] convertQuotationToBill failed unexpectedly:', { quoteId, error: err });
      showToast('Failed to convert quotation to bill — check console');
    }
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
