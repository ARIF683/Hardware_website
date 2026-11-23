export interface Item {
  id: string;
  o: number; // sort order
  name: string;
  code: string;
  barcode: string;
  type: string; // Category, e.g., "Pipes & Fittings", "Sanitary", "Paints", "Tools", etc.
  brand: string;
  size: string;
  aliases: string;
  mrp: number | null;
  cost: number;
  price: number;
  qty: number;
  low: number; // Low stock threshold
  unit: string;
  imageUrl?: string | null;
  updatedAt: string;
}

export interface TransactionRecord {
  clientId: string;
  itemId?: string | null;
  itemName: string;
  action: 'in' | 'out';
  qty: number;
  balance: number;
  note: string;
  unit: string;
  createdAt: string;
}

export interface QuotationLineItem {
  itemId?: string | null;
  name: string;
  code: string;
  type: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  total: number;
}

export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Converted';

export interface QuotationRecord {
  id: string;
  quotationNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  date: string;
  validUntil: string;
  items: QuotationLineItem[];
  subtotal: number;
  discount: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  status: QuotationStatus;
  notes: string;
  createdAt: string;
}

export type LedgerAccountType = 'CUSTOMER' | 'SUPPLIER';

export interface LedgerAccount {
  id: string;
  name: string;
  phone: string;
  address: string;
  type: LedgerAccountType;
  netBalance: number; // Customer: >0 You Will Get (Receivable), <0 You Will Give. Supplier: >0 You Will Pay
  creditLimit: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  type: 'GAVE' | 'GOT'; // GAVE = Debit (Sold / Paid out), GOT = Credit (Payment received / Goods received)
  amount: number;
  balanceAfter: number;
  date: string;
  description: string;
  billRef: string;
  createdAt: string;
}

export interface DailyCashflowRecord {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'SALE' | 'EXPENSE';
  category: string;
  amount: number;
  paymentMode: 'Cash' | 'UPI' | 'Card' | 'Bank' | 'Credit';
  note: string;
  createdAt: string;
}

export interface BillRowData {
  id: string;
  name: string;
  rate: number;
  qty: number;
  type?: string;
  brand?: string;
  size?: string;
  unit: string;
  matchedItemId?: string | null;
  include: boolean;
}

export interface ShopProfile {
  name: string;
  tagline: string;
  phone: string;
  address: string;
  gstin: string;
  upiId: string;
  currency: string;
  logo: string;
}

export interface DynamicUiConfig {
  theme: {
    primaryColor: string;
    accentColor: string;
    storeTitle: string;
    tagline: string;
  };
  features: {
    showQuickActions: boolean;
    showLowStockAlert: boolean;
    showRecentTransactions: boolean;
    allowDirectBilling: boolean;
  };
}

export type NavigationTab = 'HOME' | 'ITEMS' | 'BILLING' | 'TRANSACTIONS' | 'SETTINGS';

export interface ColorTintLog {
  tintRecordId: string;
  productName: string;
  baseCode: string; // Base name (e.g. TE15, BASE 01, WHITE)
  canFactor: string; // Can factor: 1, 4, 10, 20 Ltr
  canFactorLiters: number; // 1, 4, 10, 20
  liters: number;
  noOfCans: number;
  tintDate: string;
  tintTime: string;
  tintTimestamp: string;
  matchedItemId: string | null;
  matchedItemName: string;
  matchedItemSize?: string;
  matchedItemBrand?: string;
  matchedItemType?: string;
  qtyDeducted: number;
  deductUnit: string;
  deductedAt: string;
  shadeName?: string;
  shadeCode?: string;
}

export interface ParsedTintRow {
  tintRecordId: string;
  dealerCode?: string;
  dealerName?: string;
  machineType?: string;
  productName: string;
  baseCode: string; // Base name (e.g. TE15, BASE 01, WHITE)
  canFactor: string; // Can factor: 1, 4, 10, 20 Ltr
  canFactorLiters: number; // 1, 4, 10, 20
  litersPerCan: number;
  noOfCans: number;
  totalLiters: number;
  tintDateRaw: string;
  tintTimeRaw: string;
  tintTimestampIso: string;
  tintDisplayDateTime: string;
  colorantUsed?: string;
  colorantQuantity?: string;
  matchedItem: Item | null;
  isAlreadyProcessed: boolean;
  deductQty: number;
  deductUnit: string;
  shadeName?: string;
  shadeCode?: string;
}

export interface UserAccount {
  email: string;
  isAdmin: boolean;
}

export type AnnouncementSeverity = 'info' | 'success' | 'warning' | 'alert';

export interface AnnouncementConfig {
  enabled: boolean;
  message: string;
  severity: AnnouncementSeverity;
  dismissible: boolean;
  startAtMillis: number;
  endAtMillis: number;
}

export interface FestivalConfig {
  enabled: boolean;
  festivalName: string;
  greetingMessage: string;
  badgeText: string;
  accentColorHex: string;
  bannerImageUrl: string;
  startDate: string; // YYYY-MM-DD or ""
  endDate: string;   // YYYY-MM-DD or ""
  stylePreset: string; // diwali | eid | holi | christmas | new_year | independence_day | sale | default
}

export type FestivalOverrideMode = 'AUTO' | 'CUSTOM' | 'OFF';

export interface FestivalStudioConfig {
  autoCalendarEnabled: boolean;
  applyFestivalThemeToApp: boolean;
  overrideMode: FestivalOverrideMode;
  customFestival: FestivalConfig;
  customFestivals: FestivalConfig[];
  hiddenAutoFestivalKeys: string[];
  announcement: AnnouncementConfig;
  updatedAt: number;
}

export interface RemoteStoreProfile {
  bannerUrl?: string | null;
  logoUrl?: string | null;
  storeName?: string | null;
  location?: string | null;
  roleTitle?: string | null;
  supervisorName?: string | null;
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  branchName?: string | null;
  upiId?: string | null;
  signatureUrl?: string | null;
  qrCodeUrl?: string | null;
  festivalConfigJson?: string | null;
  userRolesJson?: string | null;
  updatedAt: number;
}

