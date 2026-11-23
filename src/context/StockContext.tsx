import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ParsedTintRow,
  UserAccount,
  AnnouncementConfig,
  FestivalConfig,
  FestivalStudioConfig,
  RemoteStoreProfile
} from '../types';
import {
  initialShopProfile,
  initialUiConfig
} from '../data/mockData';
import { supabaseService, newId } from '../services/supabaseService';
import { authService, AuthStateSnapshot, AuthActionResult } from '../services/authService';
import {
  AutoFestivalCalendar,
  createDefaultFestivalStudioConfig,
  festivalPreferenceStore,
  getEffectiveCustomFestivals,
  isAnnouncementActiveAt
} from '../utils/festivalStudio';
import { addMoney, calcLineAmount, fromPaise, toPaise } from '../utils/formatters';

type RetryTask =
  | { id: string; kind: 'upsertItem'; payload: Item }
  | { id: string; kind: 'updateItemMeta'; payload: { id: string; patch: Record<string, any> } }
  | { id: string; kind: 'adjustStock'; payload: { itemId: string; delta: number } }
  | { id: string; kind: 'deleteItem'; payload: { id: string } }
  | { id: string; kind: 'insertTransaction'; payload: TransactionRecord }
  | { id: string; kind: 'upsertCashflow'; payload: DailyCashflowRecord }
  | { id: string; kind: 'deleteCashflow'; payload: { id: string } }
  | { id: string; kind: 'upsertQuotation'; payload: QuotationRecord }
  | { id: string; kind: 'deleteQuotation'; payload: { id: string } }
  | { id: string; kind: 'upsertLedgerAccount'; payload: LedgerAccount }
  | { id: string; kind: 'deleteLedgerAccount'; payload: { id: string } }
  | { id: string; kind: 'insertLedgerEntry'; payload: LedgerEntry }
  | { id: string; kind: 'deleteLedgerEntry'; payload: { id: string } }
  | { id: string; kind: 'insertPurchase'; payload: any }
  | { id: string; kind: 'saveStoreProfile'; payload: Partial<RemoteStoreProfile> };

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

  // Auth & Role Management (Synced with Supabase Auth & app_users)
  isAuthed: boolean;
  isVerifyingSession: boolean;
  isAdmin: boolean;
  currentUserEmail: string | null;
  pendingVerificationEmail: string | null;
  registeredUsers: UserAccount[];
  lockRemainingSeconds: number;
  otpRemainingSeconds: number;
  resendCooldownSeconds: number;
  deepLinkMessage: string | null;
  deepLinkError: string | null;
  signInEmailPassword: (email: string, password: string) => Promise<AuthActionResult>;
  signUpEmailPassword: (email: string, password: string) => Promise<AuthActionResult>;
  verifySignupOtp: (email: string, otp: string) => Promise<AuthActionResult>;
  resendConfirmationEmail: (email: string) => Promise<AuthActionResult>;
  requestPasswordResetOtp: (email: string) => Promise<AuthActionResult>;
  verifyPasswordResetAndUpdate: (email: string, otp: string, newPassword: string) => Promise<AuthActionResult>;
  requestChangeEmailOtp: (newEmail: string) => Promise<AuthActionResult>;
  confirmChangeEmailOtp: (newEmail: string, otp: string) => Promise<AuthActionResult>;
  requestDeleteAccountOtp: () => Promise<AuthActionResult>;
  confirmDeleteAccountWithOtp: (otp: string) => Promise<AuthActionResult>;
  clearPendingVerification: () => void;
  clearAuthStatusMessages: () => void;
  logout: () => void;
  refreshCurrentUserRole: (showFeedback?: boolean) => Promise<boolean>;
  syncUserRolesFromCloud: (showFeedback?: boolean) => Promise<boolean>;
  upsertUserRole: (email: string, isAdmin: boolean) => Promise<void>;
  removeUserRole: (email: string) => Promise<void>;
  setUserAdminRole: (email: string, isAdmin: boolean) => Promise<void>;

  // Announcement & Festival Studio
  festivalStudioConfig: FestivalStudioConfig;
  activeFestivals: FestivalConfig[];
  activeAnnouncement: AnnouncementConfig;
  isAnnouncementDismissed: boolean;
  dismissAnnouncement: () => void;
  effectiveThemeColor: string;
  saveAndSyncFestivalStudio: (
    config: FestivalStudioConfig,
    bannerFilesByIndex?: Record<number, File>
  ) => Promise<boolean>;

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

const DEFAULT_THEME_COLOR = '#3b82f6';
const DEFAULT_LOGO_PATH = '/logos/ic_stock_logo.png';

export const StockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Auth state synchronized with authService
  const [authSnapshot, setAuthSnapshot] = useState<AuthStateSnapshot>(() => authService.getSnapshot());
  const isAuthedRef = useRef<boolean>(authSnapshot.isAuthed);
  isAuthedRef.current = authSnapshot.isAuthed;

  const loadLocal = <T,>(key: string, fallback: T): T => {
    try {
      const stored = localStorage.getItem(`hardware_${key}`);
      return stored ? JSON.parse(stored) : fallback;
    } catch (e) {
      console.warn(`Failed to read ${key} from localStorage`, e);
      return fallback;
    }
  };

  const saveLocal = useCallback((key: string, data: any) => {
    if (!isAuthedRef.current) return;
    try {
      localStorage.setItem(`hardware_${key}`, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to save ${key} to localStorage`, e);
    }
  }, []);

  // State (unpopulated until authenticated session is verified)
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [dailyCashflows, setDailyCashflows] = useState<DailyCashflowRecord[]>([]);
  const [shopProfile, setShopProfile] = useState<ShopProfile>(initialShopProfile);
  const [uiConfig, setUiConfig] = useState<DynamicUiConfig>(initialUiConfig);
  const [selectedLogo, setSelectedLogo] = useState<string>(DEFAULT_LOGO_PATH);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const itemsRef = useRef<Item[]>(items);
  itemsRef.current = items;
  const ledgerAccountsRef = useRef<LedgerAccount[]>(ledgerAccounts);
  ledgerAccountsRef.current = ledgerAccounts;
  const ledgerEntriesRef = useRef<LedgerEntry[]>(ledgerEntries);
  ledgerEntriesRef.current = ledgerEntries;
  const quotationsRef = useRef<QuotationRecord[]>(quotations);
  quotationsRef.current = quotations;

  // Persistent failed-sync retry queue
  const retryQueueRef = useRef<RetryTask[]>([]);
  const isFlushingQueueRef = useRef<boolean>(false);

  const persistRetryQueue = useCallback(
    (nextQueue: RetryTask[]) => {
      retryQueueRef.current = nextQueue;
      if (isAuthedRef.current) {
        saveLocal('sync_retry_queue', nextQueue);
      }
    },
    [saveLocal]
  );

  const enqueueRetry = useCallback(
    (kind: RetryTask['kind'], payload: any) => {
      const task = { id: newId('retry'), kind, payload } as RetryTask;
      persistRetryQueue([...retryQueueRef.current, task]);
    },
    [persistRetryQueue]
  );

  // Supabase sync status
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'connecting' | 'offline'>('offline');
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);

  const [themeColor, setThemeColorState] = useState<string>(DEFAULT_THEME_COLOR);
  const [festivalStudioConfig, setFestivalStudioConfig] = useState<FestivalStudioConfig>(() =>
    createDefaultFestivalStudioConfig()
  );
  const festivalStudioRef = useRef<FestivalStudioConfig>(festivalStudioConfig);
  festivalStudioRef.current = festivalStudioConfig;
  const [isAnnouncementDismissed, setIsAnnouncementDismissed] = useState<boolean>(false);
  const [announcementTick, setAnnouncementTick] = useState<number>(() => Date.now());

  const [tintLogs, setTintLogs] = useState<ColorTintLog[]>([]);
  const [processedTintIds, setProcessedTintIds] = useState<string[]>([]);

  const hydrateLocalCacheForSession = useCallback(() => {
    const cachedItems = loadLocal<Item[]>('items', []);
    if (Array.isArray(cachedItems) && cachedItems.length > 0) setItems(cachedItems);

    const cachedTx = loadLocal<TransactionRecord[]>('transactions', []);
    if (Array.isArray(cachedTx) && cachedTx.length > 0) setTransactions(cachedTx);

    const cachedQuotes = loadLocal<QuotationRecord[]>('quotations', []);
    if (Array.isArray(cachedQuotes) && cachedQuotes.length > 0) setQuotations(cachedQuotes);

    const cachedAcc = loadLocal<LedgerAccount[]>('ledger_accounts', []);
    if (Array.isArray(cachedAcc) && cachedAcc.length > 0) setLedgerAccounts(cachedAcc);

    const cachedEnt = loadLocal<LedgerEntry[]>('ledger_entries', []);
    if (Array.isArray(cachedEnt) && cachedEnt.length > 0) setLedgerEntries(cachedEnt);

    const cachedCf = loadLocal<DailyCashflowRecord[]>('daily_cashflows', []);
    if (Array.isArray(cachedCf) && cachedCf.length > 0) setDailyCashflows(cachedCf);

    setShopProfile(loadLocal('shop_profile', initialShopProfile));
    setUiConfig(loadLocal('ui_config', initialUiConfig));
    setSelectedLogo(loadLocal('selected_logo', DEFAULT_LOGO_PATH));
    setBannerUrl(loadLocal('store_custom_banner', null));
    setLogoUrl(loadLocal('store_custom_logo', null));
    setThemeColorState(loadLocal('theme_color', DEFAULT_THEME_COLOR));
    setFestivalStudioConfig(festivalPreferenceStore.load());
    setTintLogs(loadLocal<ColorTintLog[]>('tint_logs', []));
    setProcessedTintIds(loadLocal<string[]>('processed_tint_ids', []));

    const cachedQueue = loadLocal<RetryTask[]>('sync_retry_queue', []);
    retryQueueRef.current = Array.isArray(cachedQueue) ? cachedQueue : [];
  }, []);

  const resetAllInMemoryState = useCallback(() => {
    supabaseService.disconnectRealtime();
    setItems([]);
    setTransactions([]);
    setQuotations([]);
    setLedgerAccounts([]);
    setLedgerEntries([]);
    setDailyCashflows([]);
    setShopProfile(initialShopProfile);
    setUiConfig(initialUiConfig);
    setSelectedLogo(DEFAULT_LOGO_PATH);
    setBannerUrl(null);
    setLogoUrl(null);
    setThemeColorState(DEFAULT_THEME_COLOR);
    setFestivalStudioConfig(createDefaultFestivalStudioConfig());
    setIsAnnouncementDismissed(false);
    setTintLogs([]);
    setProcessedTintIds([]);
    retryQueueRef.current = [];
    setIsRealtimeLive(false);
    setSupabaseStatus('offline');
  }, []);

  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('tint_logs', tintLogs);
  }, [tintLogs, authSnapshot.isAuthed, saveLocal]);

  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('processed_tint_ids', processedTintIds);
  }, [processedTintIds, authSnapshot.isAuthed, saveLocal]);

  const setThemeColor = (color: string) => {
    setThemeColorState(color);
    saveLocal('theme_color', color);
  };

  // Wire authService handlers, session refresh WS reconnect, and logout memory reset
  useEffect(() => {
    supabaseService.setAuthHandlers({
      getAccessToken: () => authService.activeAccessToken(),
      refreshSession: () => authService.refreshSession(),
      onAuthExpired: (reason?: string) => authService.forceSessionExpiredSignOut(reason)
    });

    const unsub = authService.subscribe((snap) => {
      setAuthSnapshot(snap);
    });

    authService.onRolesChangedListener = (rolesJson: string, updatedAt: number) => {
      if (!authService.getSnapshot().isAuthed) return;
      supabaseService.saveStoreProfile({ userRolesJson: rolesJson, updatedAt }).catch((err) => {
        console.warn('Role sync to store profile skipped:', err);
        enqueueRetry('saveStoreProfile', { userRolesJson: rolesJson, updatedAt });
      });
    };

    authService.onTokenRefreshedListener = () => {
      supabaseService.reconnectRealtimeIfNeeded();
    };

    authService.onSignedOutListener = () => {
      resetAllInMemoryState();
    };

    return () => {
      unsub();
      authService.onRolesChangedListener = null;
      authService.onTokenRefreshedListener = null;
      authService.onSignedOutListener = null;
    };
  }, [enqueueRetry, resetAllInMemoryState]);

  // Derive active festivals, live announcement (with auto start/end wakeup), and effective theme color
  const activeFestivals = useMemo(
    () => AutoFestivalCalendar.resolveEffectiveFestivals(festivalStudioConfig),
    [festivalStudioConfig, announcementTick]
  );

  useEffect(() => {
    const raw = festivalStudioConfig.announcement;
    const now = Date.now();
    let nextWake: number | null = null;
    if (raw.enabled && raw.message.trim()) {
      if (raw.startAtMillis > 0 && now < raw.startAtMillis) {
        nextWake = raw.startAtMillis;
      } else if (raw.endAtMillis > 0 && now < raw.endAtMillis) {
        nextWake = raw.endAtMillis;
      }
    }
    if (!nextWake) return;
    const waitMs = Math.min(3_600_000, Math.max(1000, nextWake - now + 100));
    const t = setTimeout(() => setAnnouncementTick(Date.now()), waitMs);
    return () => clearTimeout(t);
  }, [festivalStudioConfig, announcementTick]);

  const activeAnnouncement: AnnouncementConfig = useMemo(() => {
    const raw = festivalStudioConfig.announcement;
    return isAnnouncementActiveAt(raw, announcementTick)
      ? raw
      : { ...raw, enabled: false };
  }, [festivalStudioConfig.announcement, announcementTick]);

  const lastAnnouncementKeyRef = useRef<string>('');
  useEffect(() => {
    const sig = `${activeAnnouncement.enabled}|${activeAnnouncement.message}|${activeAnnouncement.severity}|${activeAnnouncement.startAtMillis}|${activeAnnouncement.endAtMillis}`;
    if (sig !== lastAnnouncementKeyRef.current) {
      lastAnnouncementKeyRef.current = sig;
      setIsAnnouncementDismissed(false);
    }
  }, [
    activeAnnouncement.enabled,
    activeAnnouncement.message,
    activeAnnouncement.severity,
    activeAnnouncement.startAtMillis,
    activeAnnouncement.endAtMillis
  ]);

  const dismissAnnouncement = useCallback(() => {
    setIsAnnouncementDismissed(true);
  }, []);

  const effectiveThemeColor = useMemo(
    () =>
      AutoFestivalCalendar.resolveEffectiveThemeHex(
        festivalStudioConfig,
        activeFestivals,
        themeColor
      ),
    [festivalStudioConfig, activeFestivals, themeColor]
  );

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  }, []);

  const flushRetryQueue = useCallback(async () => {
    if (!isAuthedRef.current || isFlushingQueueRef.current) return;
    if (retryQueueRef.current.length === 0) return;

    isFlushingQueueRef.current = true;
    try {
      const queue = [...retryQueueRef.current];
      const remaining: RetryTask[] = [];
      let succeededCount = 0;

      for (let i = 0; i < queue.length; i++) {
        if (!isAuthedRef.current) break;
        const task = queue[i];
        try {
          switch (task.kind) {
            case 'upsertItem':
              await supabaseService.upsertItem(task.payload);
              break;
            case 'updateItemMeta':
              await supabaseService.updateItemMetadata(task.payload.id, task.payload.patch);
              break;
            case 'adjustStock': {
              const serverQty = await supabaseService.adjustItemQty(
                task.payload.itemId,
                task.payload.delta
              );
              setItems((prev) =>
                prev.map((it) =>
                  it.id === task.payload.itemId
                    ? { ...it, qty: serverQty, updatedAt: new Date().toISOString() }
                    : it
                )
              );
              break;
            }
            case 'deleteItem':
              await supabaseService.deleteItem(task.payload.id);
              break;
            case 'insertTransaction':
              await supabaseService.insertTransaction(task.payload);
              break;
            case 'upsertCashflow':
              await supabaseService.upsertCashflow(task.payload);
              break;
            case 'deleteCashflow':
              await supabaseService.deleteCashflowRecord(task.payload.id);
              break;
            case 'upsertQuotation':
              await supabaseService.upsertQuotation(task.payload);
              break;
            case 'deleteQuotation':
              await supabaseService.deleteQuotation(task.payload.id);
              break;
            case 'upsertLedgerAccount':
              await supabaseService.upsertLedgerAccount(task.payload);
              break;
            case 'deleteLedgerAccount':
              await supabaseService.deleteLedgerAccount(task.payload.id);
              break;
            case 'insertLedgerEntry':
              await supabaseService.insertLedgerEntry(task.payload);
              break;
            case 'deleteLedgerEntry':
              await supabaseService.deleteLedgerEntry(task.payload.id);
              break;
            case 'insertPurchase':
              await supabaseService.insertPurchaseRecord(task.payload);
              break;
            case 'saveStoreProfile':
              await supabaseService.saveStoreProfile(task.payload);
              break;
          }
          succeededCount++;
        } catch (err) {
          console.warn('Queued sync task failed, retaining for next retry:', task.kind, err);
          remaining.push(task, ...queue.slice(i + 1));
          break;
        }
      }

      if (isAuthedRef.current) {
        persistRetryQueue(remaining);
        if (succeededCount > 0 && remaining.length === 0) {
          showToast(`Synced ${succeededCount} pending cloud update(s)`);
        }
      }
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [persistRetryQueue, showToast]);

  const applyRemoteStoreProfile = useCallback(
    (remoteStoreProfile: RemoteStoreProfile) => {
      if (!isAuthedRef.current) return;
      if (remoteStoreProfile.bannerUrl !== undefined) {
        const cleanBanner =
          remoteStoreProfile.bannerUrl && remoteStoreProfile.bannerUrl.trim() !== ''
            ? remoteStoreProfile.bannerUrl.trim()
            : null;
        setBannerUrl(cleanBanner);
        saveLocal('store_custom_banner', cleanBanner);
      }
      if (remoteStoreProfile.logoUrl !== undefined) {
        const cleanLogo =
          remoteStoreProfile.logoUrl && remoteStoreProfile.logoUrl.trim() !== ''
            ? remoteStoreProfile.logoUrl.trim()
            : null;
        setLogoUrl(cleanLogo);
        saveLocal('store_custom_logo', cleanLogo);
        if (cleanLogo) {
          setShopProfile((prev) => ({ ...prev, logo: cleanLogo }));
        }
      }
      if (remoteStoreProfile.storeName && remoteStoreProfile.storeName.trim()) {
        const nextName = remoteStoreProfile.storeName.trim();
        setShopProfile((prev) => ({ ...prev, name: nextName }));
        setUiConfig((prev) => ({
          ...prev,
          theme: { ...prev.theme, storeTitle: nextName }
        }));
      }
      if (remoteStoreProfile.location && remoteStoreProfile.location.trim()) {
        const nextLoc = remoteStoreProfile.location.trim();
        setShopProfile((prev) => ({ ...prev, address: nextLoc }));
      }
      if (remoteStoreProfile.upiId && remoteStoreProfile.upiId.trim()) {
        const nextUpi = remoteStoreProfile.upiId.trim();
        setShopProfile((prev) => ({ ...prev, upiId: nextUpi }));
      }
      if (remoteStoreProfile.festivalConfigJson) {
        const updatedStudio = festivalPreferenceStore.applyRemoteJson(
          remoteStoreProfile.festivalConfigJson,
          festivalStudioRef.current
        );
        if (updatedStudio) {
          setFestivalStudioConfig(updatedStudio);
          setAnnouncementTick(Date.now());
        }
      }
      if (remoteStoreProfile.userRolesJson) {
        authService.applyRemoteUserRoles(
          remoteStoreProfile.userRolesJson,
          remoteStoreProfile.updatedAt
        );
      }
    },
    [saveLocal]
  );

  // Sync to local storage ONLY while authenticated
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('items', items);
  }, [items, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('transactions', transactions);
  }, [transactions, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('quotations', quotations);
  }, [quotations, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('ledger_accounts', ledgerAccounts);
  }, [ledgerAccounts, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('ledger_entries', ledgerEntries);
  }, [ledgerEntries, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('daily_cashflows', dailyCashflows);
  }, [dailyCashflows, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('shop_profile', shopProfile);
  }, [shopProfile, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('ui_config', uiConfig);
  }, [uiConfig, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('selected_logo', selectedLogo);
  }, [selectedLogo, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('store_custom_banner', bannerUrl);
  }, [bannerUrl, authSnapshot.isAuthed, saveLocal]);
  useEffect(() => {
    if (authSnapshot.isAuthed) saveLocal('store_custom_logo', logoUrl);
  }, [logoUrl, authSnapshot.isAuthed, saveLocal]);

  // Fetch from live Supabase DB (strictly requires verified user session)
  const refreshFromSupabase = useCallback(
    async (isSilent = false) => {
      if (!authService.getSnapshot().isAuthed) {
        setSupabaseStatus('offline');
        return;
      }

      if (!isSilent) setSupabaseStatus('connecting');
      await flushRetryQueue();

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

        if (!isAuthedRef.current) return;

        let anySuccess = false;

        if (itemsResult.status === 'fulfilled' && itemsResult.value) {
          const remoteItems = itemsResult.value;
          setItems(remoteItems);
          if (!isSilent) {
            showToast(`Synced ${remoteItems.length} items from Supabase database!`);
          }
          anySuccess = true;
        }

        if (txResult.status === 'fulfilled' && txResult.value) {
          setTransactions(txResult.value);
          anySuccess = true;
        }

        if (cashflowsResult.status === 'fulfilled' && cashflowsResult.value) {
          setDailyCashflows(cashflowsResult.value);
          anySuccess = true;
        }

        if (quotesResult.status === 'fulfilled' && quotesResult.value) {
          setQuotations(quotesResult.value);
          anySuccess = true;
        }

        if (ledgerAccResult.status === 'fulfilled' && ledgerAccResult.value) {
          setLedgerAccounts(ledgerAccResult.value);
          anySuccess = true;
        }

        if (ledgerEntriesResult.status === 'fulfilled' && ledgerEntriesResult.value) {
          setLedgerEntries(ledgerEntriesResult.value);
          anySuccess = true;
        }

        if (storeProfileResult.status === 'fulfilled' && storeProfileResult.value) {
          applyRemoteStoreProfile(storeProfileResult.value);
          anySuccess = true;
        }

        setSupabaseStatus(anySuccess ? 'connected' : 'offline');
      } catch (e) {
        console.warn('Could not sync with Supabase, using local cache', e);
        setSupabaseStatus('offline');
      }
    },
    [showToast, applyRemoteStoreProfile, flushRetryQueue]
  );

  // Connect & sync ONLY when authenticated
  useEffect(() => {
    if (!authSnapshot.isAuthed) {
      supabaseService.disconnectRealtime();
      return;
    }

    hydrateLocalCacheForSession();
    void refreshFromSupabase(true);
    authService.refreshCurrentUserRole().catch((e) => {
      console.warn('Background role check notice:', e);
    });

    supabaseService.connectRealtime({
      onStoreProfileChanged: (profile: RemoteStoreProfile) => {
        setIsRealtimeLive(true);
        applyRemoteStoreProfile(profile);
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
                  imageUrl:
                    record.image_url !== undefined
                      ? record.image_url
                        ? String(record.image_url)
                        : null
                      : existing.imageUrl,
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

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void refreshFromSupabase(true);
      }
    };
    const handleOnline = () => {
      void flushRetryQueue();
    };
    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleOnline);

    const pollInterval = setInterval(() => {
      void refreshFromSupabase(true);
    }, 25000);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleOnline);
      clearInterval(pollInterval);
      supabaseService.disconnectRealtime();
    };
  }, [
    authSnapshot.isAuthed,
    hydrateLocalCacheForSession,
    refreshFromSupabase,
    applyRemoteStoreProfile,
    flushRetryQueue
  ]);

  // Auth & Role actions
  const signInEmailPassword = useCallback(
    (email: string, password: string) => authService.signInEmailPassword(email, password),
    []
  );
  const signUpEmailPassword = useCallback(
    (email: string, password: string) => authService.signUpEmailPassword(email, password),
    []
  );
  const verifySignupOtp = useCallback(
    (email: string, otp: string) => authService.verifySignupOtp(email, otp),
    []
  );
  const resendConfirmationEmail = useCallback(
    (email: string) => authService.resendConfirmationEmail(email),
    []
  );
  const requestPasswordResetOtp = useCallback(
    (email: string) => authService.requestPasswordResetOtp(email),
    []
  );
  const verifyPasswordResetAndUpdate = useCallback(
    (email: string, otp: string, newPassword: string) =>
      authService.verifyPasswordResetAndUpdate(email, otp, newPassword),
    []
  );
  const requestChangeEmailOtp = useCallback(
    (newEmail: string) => authService.requestChangeEmailOtp(newEmail),
    []
  );
  const confirmChangeEmailOtp = useCallback(
    (newEmail: string, otp: string) => authService.confirmChangeEmailOtp(newEmail, otp),
    []
  );
  const requestDeleteAccountOtp = useCallback(() => authService.requestDeleteAccountOtp(), []);
  const confirmDeleteAccountWithOtp = useCallback(
    (otp: string) => authService.confirmDeleteAccountWithOtp(otp),
    []
  );
  const clearPendingVerification = useCallback(() => authService.clearPendingVerification(), []);
  const clearAuthStatusMessages = useCallback(() => authService.clearDeepLinkStatus(), []);

  const logout = useCallback(() => {
    authService.logout(true);
    showToast('Signed out');
  }, [showToast]);

  const refreshCurrentUserRole = useCallback(
    async (showFeedback = false): Promise<boolean> => {
      const resolvedAdmin = await authService.refreshCurrentUserRole();
      if (showFeedback) {
        showToast(resolvedAdmin ? 'Admin role verified & active' : 'Role synced: Staff Operator');
      }
      return resolvedAdmin;
    },
    [showToast]
  );

  const syncUserRolesFromCloud = useCallback(
    async (showFeedback = false): Promise<boolean> => {
      const ok = await authService.syncUsersFromCloud();
      if (ok && showFeedback) {
        showToast('User roles synced from database');
      }
      return ok;
    },
    [showToast]
  );

  const upsertUserRole = useCallback(async (email: string, isAdminVal: boolean) => {
    await authService.upsertUser(email, isAdminVal);
  }, []);

  const removeUserRole = useCallback(async (email: string) => {
    await authService.removeUser(email);
  }, []);

  const setUserAdminRole = useCallback(async (email: string, isAdminVal: boolean) => {
    await authService.setUserAdminRole(email, isAdminVal);
  }, []);

  // Save & Sync Announcement Studio (supports multiple custom cards & Cloudinary banner uploads)
  const saveAndSyncFestivalStudio = useCallback(
    async (
      config: FestivalStudioConfig,
      bannerFilesByIndex: Record<number, File> = {}
    ): Promise<boolean> => {
      let uploadSucceeded = true;
      const cards = [...getEffectiveCustomFestivals(config)];
      for (const [idxStr, file] of Object.entries(bannerFilesByIndex)) {
        const idx = Number(idxStr);
        if (!Number.isInteger(idx) || idx < 0 || idx >= cards.length || !file) continue;
        try {
          const uploadedUrl = await supabaseService.uploadImageToCloudinary(file);
          if (uploadedUrl) {
            cards[idx] = { ...cards[idx], bannerImageUrl: uploadedUrl };
          } else {
            uploadSucceeded = false;
          }
        } catch (e) {
          console.warn('Festival banner upload failed:', e);
          uploadSucceeded = false;
        }
      }

      const finalConfig: FestivalStudioConfig = {
        ...config,
        customFestival: cards[0] || config.customFestival,
        customFestivals: cards,
        updatedAt: Date.now()
      };

      const { normalized, json } = festivalPreferenceStore.save(finalConfig);
      setFestivalStudioConfig(normalized);
      setAnnouncementTick(Date.now());
      setIsAnnouncementDismissed(false);

      let syncOk = false;
      try {
        syncOk = await supabaseService.saveStoreProfile({
          festivalConfigJson: json,
          updatedAt: normalized.updatedAt
        });
      } catch (err) {
        console.error('Failed syncing Announcement Studio:', err);
        enqueueRetry('saveStoreProfile', {
          festivalConfigJson: json,
          updatedAt: normalized.updatedAt
        });
      }

      if (uploadSucceeded && syncOk) {
        showToast('Announcement Studio saved & synced across devices!');
      } else if (syncOk) {
        showToast('Saved Announcement Studio settings. Image upload failed, please retry.');
      } else {
        showToast('Cloud sync failed — saved locally and queued for retry.');
      }
      return uploadSucceeded && syncOk;
    },
    [showToast, enqueueRetry]
  );

  // Item management with strict HTTP error checking + atomic stock RPC
  const addItem = async (itemData: Omit<Item, 'id' | 'updatedAt'>): Promise<Item> => {
    const now = new Date().toISOString();
    const newItem: Item = {
      ...itemData,
      id: newId('item'),
      updatedAt: now
    };
    setItems((prev) => [newItem, ...prev]);

    let itemSyncOk = true;
    try {
      await supabaseService.upsertItem(newItem);
    } catch (err: any) {
      itemSyncOk = false;
      console.error('Supabase addItem error:', err);
      enqueueRetry('upsertItem', newItem);
      showToast(`Could not sync "${newItem.name}" to cloud — queued for retry`);
    }

    if (newItem.qty > 0) {
      const tx: TransactionRecord = {
        clientId: newId('tx'),
        itemId: newItem.id,
        itemName: newItem.name,
        action: 'in',
        qty: newItem.qty,
        balance: newItem.qty,
        note: 'Opening stock added',
        unit: newItem.unit,
        createdAt: now
      };
      setTransactions((prev) => [tx, ...prev]);
      try {
        await supabaseService.insertTransaction(tx);
      } catch (err) {
        itemSyncOk = false;
        console.error('Failed syncing opening stock transaction:', err);
        enqueueRetry('insertTransaction', tx);
      }
    }

    if (itemSyncOk) {
      showToast(`Added: ${newItem.name}`);
    }
    return newItem;
  };

  const updateItem = async (updated: Item): Promise<void> => {
    const prevItem = itemsRef.current.find((i) => i.id === updated.id);
    const now = new Date().toISOString();
    const withTimestamp = { ...updated, updatedAt: now };

    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? withTimestamp : item))
    );

    const qtyDelta = prevItem
      ? Math.round((Number(updated.qty) - Number(prevItem.qty)) * 100) / 100
      : 0;

    try {
      if (prevItem) {
        await supabaseService.updateItemMetadata(updated.id, {
          name: withTimestamp.name,
          code: withTimestamp.code || '',
          barcode: withTimestamp.barcode || '',
          type: withTimestamp.type || 'General Hardware',
          brand: withTimestamp.brand || '',
          size: withTimestamp.size || '',
          unit: withTimestamp.unit || 'pcs',
          low: withTimestamp.low,
          cost: withTimestamp.cost,
          price: withTimestamp.price,
          mrp: withTimestamp.mrp || null,
          image_url: withTimestamp.imageUrl || null,
          aliases: withTimestamp.aliases || '',
          updated_at: now
        });

        if (qtyDelta !== 0) {
          const serverQty = await supabaseService.adjustItemQty(updated.id, qtyDelta);
          setItems((prev) =>
            prev.map((item) =>
              item.id === updated.id ? { ...item, qty: serverQty, updatedAt: now } : item
            )
          );
        }
      } else {
        await supabaseService.upsertItem(withTimestamp);
      }

      showToast(`Updated: ${updated.name}`);
    } catch (err: any) {
      console.error('Supabase updateItem error:', err);
      if (prevItem) {
        enqueueRetry('updateItemMeta', {
          id: updated.id,
          patch: {
            name: withTimestamp.name,
            code: withTimestamp.code || '',
            barcode: withTimestamp.barcode || '',
            type: withTimestamp.type || 'General Hardware',
            brand: withTimestamp.brand || '',
            size: withTimestamp.size || '',
            unit: withTimestamp.unit || 'pcs',
            low: withTimestamp.low,
            cost: withTimestamp.cost,
            price: withTimestamp.price,
            mrp: withTimestamp.mrp || null,
            image_url: withTimestamp.imageUrl || null,
            aliases: withTimestamp.aliases || '',
            updated_at: now
          }
        });
        if (qtyDelta !== 0) {
          enqueueRetry('adjustStock', { itemId: updated.id, delta: qtyDelta });
        }
      } else {
        enqueueRetry('upsertItem', withTimestamp);
      }
      showToast(`Sync error updating "${updated.name}": ${err?.message || 'Queued for retry'}`);
      throw err;
    }
  };

  const deleteItem = (id: string) => {
    const target = itemsRef.current.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    void (async () => {
      try {
        await supabaseService.deleteItem(id);
        showToast(`Deleted: ${target?.name || 'Item'}`);
      } catch (err: any) {
        console.error('Supabase deleteItem error:', err);
        enqueueRetry('deleteItem', { id });
        showToast(`Failed to delete "${target?.name || 'item'}" remotely — queued for retry`);
      }
    })();
  };

  const deleteMultipleItems = (ids: string[]) => {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    void (async () => {
      let failed = 0;
      for (const id of ids) {
        try {
          await supabaseService.deleteItem(id);
        } catch (err) {
          console.error('Supabase deleteMultipleItems error:', id, err);
          enqueueRetry('deleteItem', { id });
          failed++;
        }
      }
      if (failed > 0) {
        showToast(`Deleted locally; ${failed} item(s) queued for remote delete retry`);
      } else {
        showToast(`Deleted ${ids.length} items`);
      }
    })();
  };

  const updateMultipleItemsImage = async (ids: string[], imageUrl: string): Promise<void> => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((i) => (ids.includes(i.id) ? { ...i, imageUrl, updatedAt: now } : i))
    );
    let failed = 0;
    for (const id of ids) {
      try {
        await supabaseService.updateItemImage(id, imageUrl);
      } catch (err) {
        console.error('Failed to sync image update for item:', id, err);
        enqueueRetry('updateItemMeta', {
          id,
          patch: { image_url: imageUrl, updated_at: now }
        });
        failed++;
      }
    }
    if (failed > 0) {
      showToast(`Picture update failed on ${failed} item(s) — queued for retry`);
    } else {
      showToast(`Updated picture for ${ids.length} items`);
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
      const updatedItemsMap = new Map<string, Item>(itemsRef.current.map((i) => [i.id, { ...i }]));
      const itemDeltas = new Map<string, number>();

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
            itemDeltas.set(
              targetItem.id,
              Math.round(((itemDeltas.get(targetItem.id) || 0) - validDeductQty) * 100) / 100
            );

            const tx: TransactionRecord = {
              clientId: newId('tint_tx'),
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

        void (async () => {
          let syncErrors = 0;

          for (const [itemId, delta] of itemDeltas.entries()) {
            try {
              const serverQty = await supabaseService.adjustItemQty(itemId, delta);
              setItems((prev) =>
                prev.map((it) => (it.id === itemId ? { ...it, qty: serverQty, updatedAt: now } : it))
              );
            } catch (err) {
              syncErrors++;
              console.error('[Billing/Tint] Failed atomic adjustItemQty:', { itemId, delta, err });
              enqueueRetry('adjustStock', { itemId, delta });
            }
          }

          for (const tx of newTxList) {
            try {
              await supabaseService.insertTransaction(tx);
            } catch (err) {
              syncErrors++;
              console.error('[Billing/Tint] Failed syncing tint transaction:', { tx, err });
              enqueueRetry('insertTransaction', tx);
            }
          }

          if (syncErrors > 0) {
            showToast(`Tint applied locally; ${syncErrors} cloud sync(s) failed & queued`);
          } else {
            const failedSuffix = failedCount > 0 ? ` (${failedCount} skipped)` : '';
            showToast(
              `Tint Report Applied: ${deductedCount} record(s) deducted (${totalLiters.toFixed(1)} Ltr)${failedSuffix}`
            );
          }
        })();
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
    const target = itemsRef.current.find((i) => i.id === itemId);
    if (!target) return;

    const delta = action === 'in' ? qty : -qty;
    const optimisticQty = Math.round((target.qty + delta) * 100) / 100;
    const now = new Date().toISOString();

    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, qty: optimisticQty, updatedAt: now } : i))
    );

    const newTx: TransactionRecord = {
      clientId: newId('tx'),
      itemId: target.id,
      itemName: target.name,
      action,
      qty,
      balance: optimisticQty,
      note: note || (action === 'in' ? 'Stock Received' : 'Stock Issued'),
      unit: target.unit,
      createdAt: now
    };
    setTransactions((prev) => [newTx, ...prev]);

    void (async () => {
      let stockOk = true;
      let txOk = true;
      let finalBalance = optimisticQty;

      try {
        finalBalance = await supabaseService.adjustItemQty(itemId, delta);
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, qty: finalBalance, updatedAt: now } : i))
        );
        setTransactions((prev) =>
          prev.map((t) => (t.clientId === newTx.clientId ? { ...t, balance: finalBalance } : t))
        );
      } catch (err) {
        stockOk = false;
        console.error('Remote sync atomic stock adjust error:', err);
        enqueueRetry('adjustStock', { itemId, delta });
      }

      const txToSave = { ...newTx, balance: finalBalance };
      try {
        await supabaseService.insertTransaction(txToSave);
      } catch (err) {
        txOk = false;
        console.error('Remote insertTransaction error:', err);
        enqueueRetry('insertTransaction', txToSave);
      }

      if (stockOk && txOk) {
        showToast(
          `${action === 'in' ? 'Stock Added (+)' : 'Stock Deducted (-)'}: ${qty} ${target.unit}`
        );
      } else {
        showToast('Saved locally — cloud sync failed & queued for retry');
      }
    })();
  };

  // Purchase Bill Confirmation (paise integer math + atomic adjust_stock for existing SKUs)
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
      const workingItemsMap = new Map<string, Item>(itemsRef.current.map((i) => [i.id, { ...i }]));
      const existingItemDeltas = new Map<string, { delta: number; cost?: number }>();
      const newItemsCreated: Item[] = [];
      const newTxList: TransactionRecord[] = [];
      const skippedRows: string[] = [];
      let totalBillPaise = 0;
      let processedCount = 0;

      included.forEach((row, idx) => {
        try {
          const cleanRowName = row.name.trim();
          const rowQty = Number(row.qty);
          const rowRate = Number(row.rate);

          if (!Number.isFinite(rowQty) || rowQty <= 0) {
            skippedRows.push(cleanRowName);
            return;
          }

          const safeRate = Number.isFinite(rowRate) && rowRate >= 0 ? rowRate : 0;
          const lineCost = calcLineAmount(rowQty, safeRate);
          totalBillPaise += toPaise(lineCost);

          const rawMatchedId = typeof row.matchedItemId === 'string' ? row.matchedItemId.trim() : '';
          let existing: Item | undefined = rawMatchedId ? workingItemsMap.get(rawMatchedId) : undefined;

          if (!existing) {
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

            const updatedCost = safeRate > 0 ? safeRate : existing.cost;
            const updatedItem: Item = {
              ...existing,
              qty: newQty,
              cost: updatedCost,
              updatedAt: now
            };
            workingItemsMap.set(existing.id, updatedItem);

            if (!newItemsCreated.some((c) => c.id === existing!.id)) {
              const prevEntry = existingItemDeltas.get(existing.id);
              existingItemDeltas.set(existing.id, {
                delta: Math.round(((prevEntry?.delta || 0) + rowQty) * 100) / 100,
                cost: safeRate > 0 ? safeRate : prevEntry?.cost
              });
            }

            const tx: TransactionRecord = {
              clientId: newId('tx'),
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
              id: newId('item'),
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

            const tx: TransactionRecord = {
              clientId: newId('tx'),
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

      const totalBillAmount = fromPaise(totalBillPaise);
      const updatedCatalog = Array.from(workingItemsMap.values()).filter(
        (i) => !newItemsCreated.some((created) => created.id === i.id)
      );
      setItems([...newItemsCreated, ...updatedCatalog]);
      if (newTxList.length > 0) {
        setTransactions((prev) => [...newTxList, ...prev]);
      }

      // Prepare optional supplier ledger account + entry
      let accountToSync: LedgerAccount | null = null;
      let entryToSync: LedgerEntry | null = null;
      const cleanSupplier = (supplier || '').trim();
      if (cleanSupplier.length > 0 && Number.isFinite(totalBillAmount)) {
        const existingAccount = ledgerAccountsRef.current.find(
          (acc) =>
            acc.type === 'SUPPLIER' &&
            (acc.name || '').trim().toLowerCase() === cleanSupplier.toLowerCase()
        );

        if (existingAccount) {
          const newBalance = addMoney(existingAccount.netBalance, totalBillAmount);
          const updatedAcc = { ...existingAccount, netBalance: newBalance, updatedAt: now };
          setLedgerAccounts((prev) =>
            prev.map((acc) => (acc.id === existingAccount.id ? updatedAcc : acc))
          );
          accountToSync = updatedAcc;

          const newEntry: LedgerEntry = {
            id: newId('entry'),
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
          entryToSync = newEntry;
        } else {
          const newAcc: LedgerAccount = {
            id: newId('acc'),
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
          accountToSync = newAcc;

          const newEntry: LedgerEntry = {
            id: newId('entry'),
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
          entryToSync = newEntry;
        }
      }

      const purchasePayload = {
        client_id: newId('purchase'),
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
      };

      void (async () => {
        let syncErrors = 0;

        for (const createdItem of newItemsCreated) {
          const latestVersion = workingItemsMap.get(createdItem.id) || createdItem;
          try {
            await supabaseService.upsertItem(latestVersion);
          } catch (err) {
            syncErrors++;
            console.error('[Billing/Purchase] upsert new item failed:', err);
            enqueueRetry('upsertItem', latestVersion);
          }
        }

        for (const [itemId, info] of existingItemDeltas.entries()) {
          if (info.cost !== undefined) {
            try {
              await supabaseService.updateItemMetadata(itemId, { cost: info.cost, updated_at: now });
            } catch (err) {
              syncErrors++;
              console.error('[Billing/Purchase] updateItemMetadata failed:', err);
              enqueueRetry('updateItemMeta', {
                id: itemId,
                patch: { cost: info.cost, updated_at: now }
              });
            }
          }
          try {
            const serverQty = await supabaseService.adjustItemQty(itemId, info.delta);
            setItems((prev) =>
              prev.map((it) => (it.id === itemId ? { ...it, qty: serverQty, updatedAt: now } : it))
            );
          } catch (err) {
            syncErrors++;
            console.error('[Billing/Purchase] adjustItemQty failed:', err);
            enqueueRetry('adjustStock', { itemId, delta: info.delta });
          }
        }

        for (const tx of newTxList) {
          try {
            await supabaseService.insertTransaction(tx);
          } catch (err) {
            syncErrors++;
            console.error('[Billing/Purchase] insertTransaction failed:', err);
            enqueueRetry('insertTransaction', tx);
          }
        }

        if (accountToSync) {
          try {
            await supabaseService.upsertLedgerAccount(accountToSync);
          } catch (err) {
            syncErrors++;
            console.error('[Billing/Purchase] upsertLedgerAccount failed:', err);
            enqueueRetry('upsertLedgerAccount', accountToSync);
          }
        }

        if (entryToSync) {
          try {
            await supabaseService.upsertLedgerEntry(entryToSync);
          } catch (err) {
            syncErrors++;
            console.error('[Billing/Purchase] upsertLedgerEntry failed:', err);
            enqueueRetry('insertLedgerEntry', entryToSync);
          }
        }

        try {
          await supabaseService.insertPurchaseRecord(purchasePayload);
        } catch (err) {
          syncErrors++;
          console.error('[Billing/Purchase] insertPurchaseRecord failed:', err);
          enqueueRetry('insertPurchase', purchasePayload);
        }

        if (syncErrors > 0) {
          showToast(`Purchase bill saved locally; ${syncErrors} sync op(s) failed & queued`);
        } else if (skippedRows.length > 0) {
          showToast(`Bill confirmed: ${processedCount} items synced, ${skippedRows.length} skipped`);
        } else {
          showToast(`Bill confirmed! ${processedCount} items synced to Supabase.`);
        }
      })();
    } catch (err) {
      console.error('[Billing/Purchase] confirmPurchaseBill failed unexpectedly:', err);
      showToast('Purchase bill update failed — check console for details');
    }
  };

  // Quotation Management
  const createQuotation = (
    quoteData: Omit<QuotationRecord, 'id' | 'quotationNo' | 'createdAt'>
  ): QuotationRecord => {
    const qCount = quotationsRef.current.length + 1;
    const quotationNo = `QT-${new Date().getFullYear()}-${qCount.toString().padStart(3, '0')}`;
    const newQuote: QuotationRecord = {
      ...quoteData,
      id: newId('quote'),
      quotationNo,
      createdAt: new Date().toISOString()
    };
    setQuotations((prev) => [newQuote, ...prev]);

    void (async () => {
      try {
        await supabaseService.upsertQuotation(newQuote);
        showToast(`Quotation ${quotationNo} generated`);
      } catch (err) {
        console.error('Failed saving quotation remotely:', err);
        enqueueRetry('upsertQuotation', newQuote);
        showToast(`Quotation ${quotationNo} saved locally — cloud sync failed & queued`);
      }
    })();

    return newQuote;
  };

  const updateQuotation = (quote: QuotationRecord) => {
    setQuotations((prev) => prev.map((q) => (q.id === quote.id ? quote : q)));
    void (async () => {
      try {
        await supabaseService.upsertQuotation(quote);
        showToast(`Quotation ${quote.quotationNo} updated`);
      } catch (err) {
        console.error('Failed updating quotation remotely:', err);
        enqueueRetry('upsertQuotation', quote);
        showToast(`Quotation ${quote.quotationNo} updated locally — cloud sync failed & queued`);
      }
    })();
  };

  const deleteQuotation = (id: string) => {
    setQuotations((prev) => prev.filter((q) => q.id !== id));
    void (async () => {
      try {
        await supabaseService.deleteQuotation(id);
        showToast('Quotation deleted');
      } catch (err) {
        console.error('Failed deleting quotation remotely:', err);
        enqueueRetry('deleteQuotation', { id });
        showToast('Deleted locally — cloud delete failed & queued for retry');
      }
    })();
  };

  const convertQuotationToBill = (quoteId: string) => {
    try {
      const quote = quotationsRef.current.find((q) => q.id === quoteId);
      if (!quote) {
        showToast('Quotation not found');
        return;
      }
      if (quote.status === 'Converted') {
        showToast(`Quote #${quote.quotationNo} is already converted`);
        return;
      }

      const now = new Date().toISOString();
      const quoteLines = Array.isArray(quote.items) ? quote.items : [];
      const workingItemsMap = new Map<string, Item>(itemsRef.current.map((i) => [i.id, { ...i }]));
      const deductionDeltas = new Map<string, number>();
      const newTxList: TransactionRecord[] = [];
      const unmatchedLines: string[] = [];
      const invalidLines: string[] = [];
      let deductedCount = 0;

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
          }

          if (!match) {
            unmatchedLines.push(rawLineName || `Line #${idx + 1}`);
            return;
          }

          const deductQty = Number(line.qty);
          if (!Number.isFinite(deductQty) || deductQty <= 0) {
            invalidLines.push(rawLineName || match.name);
            return;
          }

          const currentQty = Number.isFinite(Number(match.qty)) ? Number(match.qty) : 0;
          const newBal = Math.round((currentQty - deductQty) * 100) / 100;
          if (!Number.isFinite(newBal)) {
            throw new Error(`Computed invalid stock balance (${newBal}) for "${match.name}"`);
          }

          workingItemsMap.set(match.id, { ...match, qty: newBal, updatedAt: now });
          deductionDeltas.set(
            match.id,
            Math.round(((deductionDeltas.get(match.id) || 0) - deductQty) * 100) / 100
          );

          const tx: TransactionRecord = {
            clientId: newId('tx'),
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
          console.error('[Billing] Inventory deduction error for quotation line:', lineErr);
          invalidLines.push(line?.name || `Line #${idx + 1}`);
        }
      });

      if (deductionDeltas.size > 0) {
        setItems(Array.from(workingItemsMap.values()));
      }
      if (newTxList.length > 0) {
        setTransactions((prev) => [...newTxList, ...prev]);
      }

      const safeGrandTotal = fromPaise(
        toPaise(Number(quote.grandTotal ?? (quote as any).finalAmount ?? 0))
      );
      const cf: DailyCashflowRecord = {
        id: newId('cf'),
        date: new Date().toISOString().split('T')[0],
        type: 'SALE',
        category: 'Hardware & Quotation Sale',
        amount: safeGrandTotal,
        paymentMode: 'Cash',
        note: `Quotation #${quote.quotationNo || ''} - ${quote.customerName || 'Walk-in Customer'}`,
        createdAt: now
      };
      setDailyCashflows((prev) => [cf, ...prev]);

      const convertedQuote: QuotationRecord = { ...quote, status: 'Converted' };
      setQuotations((prev) => prev.map((q) => (q.id === quoteId ? convertedQuote : q)));

      void (async () => {
        let syncErrors = 0;

        for (const [itemId, delta] of deductionDeltas.entries()) {
          try {
            const serverQty = await supabaseService.adjustItemQty(itemId, delta);
            setItems((prev) =>
              prev.map((it) => (it.id === itemId ? { ...it, qty: serverQty, updatedAt: now } : it))
            );
          } catch (err) {
            syncErrors++;
            console.error('[Billing] Failed atomic adjustItemQty on quote convert:', err);
            enqueueRetry('adjustStock', { itemId, delta });
          }
        }

        for (const tx of newTxList) {
          try {
            await supabaseService.insertTransaction(tx);
          } catch (err) {
            syncErrors++;
            console.error('[Billing] Failed syncing quote sale tx:', err);
            enqueueRetry('insertTransaction', tx);
          }
        }

        try {
          await supabaseService.insertCashflowRecord(cf);
        } catch (err) {
          syncErrors++;
          console.error('[Billing] Failed syncing quote cashflow:', err);
          enqueueRetry('upsertCashflow', cf);
        }

        try {
          await supabaseService.upsertQuotation(convertedQuote);
        } catch (err) {
          syncErrors++;
          console.error('[Billing] Failed syncing converted quote status:', err);
          enqueueRetry('upsertQuotation', convertedQuote);
        }

        const skippedTotal = unmatchedLines.length + invalidLines.length;
        if (syncErrors > 0) {
          showToast(
            `Quote #${quote.quotationNo} converted locally; ${syncErrors} sync op(s) queued`
          );
        } else if (skippedTotal > 0) {
          showToast(
            `Quote #${quote.quotationNo} converted (${deductedCount} deducted, ${skippedTotal} skipped)`
          );
        } else {
          showToast(`Quote #${quote.quotationNo} converted to Bill & inventory updated!`);
        }
      })();
    } catch (err) {
      console.error('[Billing] convertQuotationToBill failed unexpectedly:', err);
      showToast('Failed to convert quotation to bill — check console');
    }
  };

  // Ledger Management
  const addLedgerAccount = (
    accData: Omit<LedgerAccount, 'id' | 'netBalance' | 'createdAt' | 'updatedAt'>,
    openingBalance: number = 0
  ): LedgerAccount => {
    const now = new Date().toISOString();
    const safeOpening = fromPaise(toPaise(openingBalance));
    const newAcc: LedgerAccount = {
      ...accData,
      id: newId('acc'),
      netBalance: safeOpening,
      createdAt: now,
      updatedAt: now
    };

    setLedgerAccounts((prev) => [newAcc, ...prev]);

    let openingEntry: LedgerEntry | null = null;
    if (safeOpening !== 0) {
      const isCustomer = newAcc.type === 'CUSTOMER';
      const entryType = isCustomer
        ? safeOpening > 0
          ? 'GAVE'
          : 'GOT'
        : safeOpening > 0
        ? 'GOT'
        : 'GAVE';
      openingEntry = {
        id: newId('entry'),
        accountId: newAcc.id,
        type: entryType,
        amount: Math.abs(safeOpening),
        balanceAfter: safeOpening,
        date: now.split('T')[0],
        description: 'Opening Balance',
        billRef: '',
        createdAt: now
      };
      setLedgerEntries((prev) => [openingEntry!, ...prev]);
    }

    void (async () => {
      let syncErrors = 0;
      try {
        await supabaseService.upsertLedgerAccount(newAcc);
      } catch (err) {
        syncErrors++;
        console.error('Failed saving ledger account remotely:', err);
        enqueueRetry('upsertLedgerAccount', newAcc);
      }
      if (openingEntry) {
        try {
          await supabaseService.upsertLedgerEntry(openingEntry);
        } catch (err) {
          syncErrors++;
          console.error('Failed saving opening ledger entry remotely:', err);
          enqueueRetry('insertLedgerEntry', openingEntry);
        }
      }
      if (syncErrors > 0) {
        showToast('Account saved locally — cloud sync failed & queued for retry');
      } else {
        showToast(`Added ${newAcc.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}: ${newAcc.name}`);
      }
    })();

    return newAcc;
  };

  const updateLedgerAccount = (updated: LedgerAccount) => {
    const withTs = { ...updated, updatedAt: new Date().toISOString() };
    setLedgerAccounts((prev) =>
      prev.map((acc) => (acc.id === updated.id ? withTs : acc))
    );
    void (async () => {
      try {
        await supabaseService.upsertLedgerAccount(withTs);
        showToast(`Account updated: ${updated.name}`);
      } catch (err) {
        console.error('Failed updating ledger account remotely:', err);
        enqueueRetry('upsertLedgerAccount', withTs);
        showToast('Account updated locally — cloud sync failed & queued');
      }
    })();
  };

  const deleteLedgerAccount = (id: string) => {
    const acc = ledgerAccountsRef.current.find((a) => a.id === id);
    setLedgerAccounts((prev) => prev.filter((a) => a.id !== id));
    setLedgerEntries((prev) => prev.filter((e) => e.accountId !== id));
    void (async () => {
      try {
        await supabaseService.deleteLedgerAccount(id);
        showToast(`Deleted account: ${acc?.name || ''}`);
      } catch (err) {
        console.error('Failed deleting ledger account remotely:', err);
        enqueueRetry('deleteLedgerAccount', { id });
        showToast('Deleted locally — cloud delete failed & queued for retry');
      }
    })();
  };

  const addLedgerEntry = (
    accountId: string,
    type: 'GAVE' | 'GOT',
    amount: number,
    description: string,
    billRef: string = '',
    date?: string
  ) => {
    const acc = ledgerAccountsRef.current.find((a) => a.id === accountId);
    if (!acc) return;

    const cleanAmount = fromPaise(toPaise(amount));
    let balanceDelta = 0;
    if (acc.type === 'CUSTOMER') {
      balanceDelta = type === 'GAVE' ? cleanAmount : -cleanAmount;
    } else {
      balanceDelta = type === 'GOT' ? cleanAmount : -cleanAmount;
    }

    const newBalance = addMoney(acc.netBalance, balanceDelta);
    const now = new Date().toISOString();

    const updatedAccount = { ...acc, netBalance: newBalance, updatedAt: now };
    setLedgerAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? updatedAccount : a))
    );

    const newEntry: LedgerEntry = {
      id: newId('entry'),
      accountId,
      type,
      amount: cleanAmount,
      balanceAfter: newBalance,
      date: date || now.split('T')[0],
      description,
      billRef,
      createdAt: now
    };
    setLedgerEntries((prev) => [newEntry, ...prev]);

    let cf: DailyCashflowRecord | null = null;
    if (acc.type === 'CUSTOMER' && type === 'GOT') {
      cf = {
        id: newId('cf'),
        date: date || now.split('T')[0],
        type: 'SALE',
        category: 'Customer Khata Collection',
        amount: cleanAmount,
        paymentMode: 'Cash',
        note: `Payment from ${acc.name}${description ? ` (${description})` : ''}`,
        createdAt: now
      };
      setDailyCashflows((prev) => [cf!, ...prev]);
    }

    void (async () => {
      let syncErrors = 0;
      try {
        await supabaseService.upsertLedgerAccount(updatedAccount);
      } catch (err) {
        syncErrors++;
        console.error('Failed syncing ledger account balance:', err);
        enqueueRetry('upsertLedgerAccount', updatedAccount);
      }
      try {
        await supabaseService.upsertLedgerEntry(newEntry);
      } catch (err) {
        syncErrors++;
        console.error('Failed syncing ledger entry:', err);
        enqueueRetry('insertLedgerEntry', newEntry);
      }
      if (cf) {
        try {
          await supabaseService.insertCashflowRecord(cf);
        } catch (err) {
          syncErrors++;
          console.error('Failed syncing cashflow for customer collection:', err);
          enqueueRetry('upsertCashflow', cf);
        }
      }
      if (syncErrors > 0) {
        showToast('Entry saved locally — cloud sync failed & queued for retry');
      } else {
        showToast(`Entry added: ₹${cleanAmount.toFixed(2)} (${type})`);
      }
    })();
  };

  const deleteLedgerEntry = (entryId: string) => {
    const entry = ledgerEntriesRef.current.find((e) => e.id === entryId);
    if (!entry) return;

    const acc = ledgerAccountsRef.current.find((a) => a.id === entry.accountId);
    let updatedAcc: LedgerAccount | null = null;
    if (acc) {
      let reverseDelta = 0;
      if (acc.type === 'CUSTOMER') {
        reverseDelta = entry.type === 'GAVE' ? -entry.amount : entry.amount;
      } else {
        reverseDelta = entry.type === 'GOT' ? -entry.amount : entry.amount;
      }
      const newBal = addMoney(acc.netBalance, reverseDelta);
      updatedAcc = { ...acc, netBalance: newBal, updatedAt: new Date().toISOString() };
      setLedgerAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? updatedAcc! : a))
      );
    }

    setLedgerEntries((prev) => prev.filter((e) => e.id !== entryId));

    void (async () => {
      let syncErrors = 0;
      if (updatedAcc) {
        try {
          await supabaseService.upsertLedgerAccount(updatedAcc);
        } catch (err) {
          syncErrors++;
          console.error('Failed updating ledger account on entry delete:', err);
          enqueueRetry('upsertLedgerAccount', updatedAcc);
        }
      }
      try {
        await supabaseService.deleteLedgerEntry(entryId);
      } catch (err) {
        syncErrors++;
        console.error('Failed deleting ledger entry remotely:', err);
        enqueueRetry('deleteLedgerEntry', { id: entryId });
      }
      if (syncErrors > 0) {
        showToast('Entry deleted locally — cloud sync failed & queued');
      } else {
        showToast('Ledger entry deleted');
      }
    })();
  };

  // Cashflow management
  const addCashflowRecord = (recordData: Omit<DailyCashflowRecord, 'id' | 'createdAt'>) => {
    const cleanAmount = fromPaise(toPaise(recordData.amount));
    const newRecord: DailyCashflowRecord = {
      ...recordData,
      amount: cleanAmount,
      id: newId('cf'),
      createdAt: new Date().toISOString()
    };
    setDailyCashflows((prev) => [newRecord, ...prev]);

    void (async () => {
      try {
        await supabaseService.insertCashflowRecord(newRecord);
        showToast(`Recorded ${newRecord.type}: ₹${newRecord.amount.toFixed(2)}`);
      } catch (err) {
        console.error('Failed syncing cashflow record:', err);
        enqueueRetry('upsertCashflow', newRecord);
        showToast('Recorded locally — cloud sync failed & queued for retry');
      }
    })();
  };

  const deleteCashflowRecord = (id: string) => {
    setDailyCashflows((prev) => prev.filter((cf) => cf.id !== id));
    void (async () => {
      try {
        await supabaseService.deleteCashflowRecord(id);
        showToast('Cashflow record deleted');
      } catch (err) {
        console.error('Failed deleting cashflow record remotely:', err);
        enqueueRetry('deleteCashflow', { id });
        showToast('Deleted locally — cloud delete failed & queued for retry');
      }
    })();
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
    saveLocal('store_custom_banner', url);
    const patch = { bannerUrl: url || '', updatedAt: Date.now() };
    try {
      await supabaseService.saveStoreProfile(patch);
      showToast('Store cover banner updated & synced!');
    } catch (err) {
      console.error('Failed syncing store banner:', err);
      enqueueRetry('saveStoreProfile', patch);
      showToast('Banner updated locally — cloud sync failed & queued');
      throw err;
    }
  };

  const updateStoreLogo = async (url: string | null) => {
    setLogoUrl(url);
    saveLocal('store_custom_logo', url);
    if (url) {
      setShopProfile((prev) => ({ ...prev, logo: url }));
    }
    const patch = { logoUrl: url || '', updatedAt: Date.now() };
    try {
      await supabaseService.saveStoreProfile(patch);
      showToast('Store logo updated & synced!');
    } catch (err) {
      console.error('Failed syncing store logo:', err);
      enqueueRetry('saveStoreProfile', patch);
      showToast('Logo updated locally — cloud sync failed & queued');
      throw err;
    }
  };

  const selectLogo = (logoPath: string) => {
    setSelectedLogo(logoPath);
    setLogoUrl(logoPath);
    saveLocal('store_custom_logo', logoPath);
    setShopProfile((prev) => ({ ...prev, logo: logoPath }));
    const patch = { logoUrl: logoPath, updatedAt: Date.now() };
    void (async () => {
      try {
        await supabaseService.saveStoreProfile(patch);
        showToast('Store logo updated & synced');
      } catch (err) {
        console.error('Failed syncing selected logo:', err);
        enqueueRetry('saveStoreProfile', patch);
        showToast('Logo updated locally — cloud sync failed & queued');
      }
    })();
  };

  const clearTransactions = () => {
    setTransactions([]);
    showToast('Transaction history cleared');
  };

  const resetToDemoData = () => {
    void refreshFromSupabase();
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
      console.warn('Backup JSON parse error:', e);
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
        isAuthed: authSnapshot.isAuthed,
        isVerifyingSession: authSnapshot.isVerifyingSession,
        isAdmin: authSnapshot.isAdmin,
        currentUserEmail: authSnapshot.currentUserEmail,
        pendingVerificationEmail: authSnapshot.pendingVerificationEmail,
        registeredUsers: authSnapshot.registeredUsers,
        lockRemainingSeconds: authSnapshot.lockRemainingSeconds,
        otpRemainingSeconds: authSnapshot.otpRemainingSeconds,
        resendCooldownSeconds: authSnapshot.resendCooldownSeconds,
        deepLinkMessage: authSnapshot.deepLinkMessage,
        deepLinkError: authSnapshot.deepLinkError,
        signInEmailPassword,
        signUpEmailPassword,
        verifySignupOtp,
        resendConfirmationEmail,
        requestPasswordResetOtp,
        verifyPasswordResetAndUpdate,
        requestChangeEmailOtp,
        confirmChangeEmailOtp,
        requestDeleteAccountOtp,
        confirmDeleteAccountWithOtp,
        clearPendingVerification,
        clearAuthStatusMessages,
        logout,
        refreshCurrentUserRole,
        syncUserRolesFromCloud,
        upsertUserRole,
        removeUserRole,
        setUserAdminRole,
        festivalStudioConfig,
        activeFestivals,
        activeAnnouncement,
        isAnnouncementDismissed,
        dismissAnnouncement,
        effectiveThemeColor,
        saveAndSyncFestivalStudio,
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
