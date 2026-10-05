import { Item, LedgerAccount, LedgerEntry, QuotationRecord, DailyCashflowRecord, ShopProfile, DynamicUiConfig } from '../types';

export const initialShopProfile: ShopProfile = {
  name: "Hardware Store",
  tagline: "Inventory & Smart Billing Hub",
  phone: "",
  address: "",
  gstin: "",
  upiId: "",
  currency: "₹",
  logo: "/logos/ic_stock_logo.png"
};

export const initialUiConfig: DynamicUiConfig = {
  theme: {
    primaryColor: "#2563EB",
    accentColor: "#1D4ED8",
    storeTitle: "Hardware Store",
    tagline: "Inventory & Smart Billing Hub"
  },
  features: {
    showQuickActions: true,
    showLowStockAlert: true,
    showRecentTransactions: true,
    allowDirectBilling: true
  }
};

export const initialItems: Item[] = [];
export const initialLedgerAccounts: LedgerAccount[] = [];
export const initialLedgerEntries: LedgerEntry[] = [];
export const initialQuotations: QuotationRecord[] = [];
export const initialCashflow: DailyCashflowRecord[] = [];
export const initialTransactions: any[] = [];
