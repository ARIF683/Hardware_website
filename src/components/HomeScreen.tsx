import React, { useState, useRef } from 'react';
import {
  Package,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Boxes,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Plus,
  Receipt,
  FileText,
  Wallet,
  Sparkles,
  Camera,
  Loader2,
  CheckCircle,
  Building2
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { NavigationTab, Item } from '../types';
import { formatRupees, formatDateTime } from '../utils/formatters';
import { supabaseService } from '../services/supabaseService';

interface HomeScreenProps {
  onNavigateTab: (tab: NavigationTab) => void;
  onOpenItemDetail: (itemId: string) => void;
  onOpenQuickBill: () => void;
  onOpenNewItem: () => void;
  onFilterLowStock: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateTab,
  onOpenItemDetail,
  onOpenQuickBill,
  onOpenNewItem,
  onFilterLowStock,
}) => {
  const { items, transactions, quotations, ledgerAccounts, uiConfig, showToast, bannerUrl, logoUrl, updateStoreBanner, updateStoreLogo } = useStock();
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoImgError, setLogoImgError] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const storeTitleText =
    !uiConfig.theme.storeTitle ||
    uiConfig.theme.storeTitle === 'Hardware Store' ||
    uiConfig.theme.storeTitle === 'Hardware & Tools Hub'
      ? 'S.A.HARDWARE'
      : uiConfig.theme.storeTitle;

  // 3-second long press or click handlers
  const handleBannerPressStart = () => {
    bannerTimerRef.current = setTimeout(() => {
      bannerInputRef.current?.click();
    }, 3000);
  };

  const handleBannerPressEnd = () => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  };

  const handleLogoPressStart = () => {
    logoTimerRef.current = setTimeout(() => {
      logoInputRef.current?.click();
    }, 3000);
  };

  const handleLogoPressEnd = () => {
    if (logoTimerRef.current) {
      clearTimeout(logoTimerRef.current);
      logoTimerRef.current = null;
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBanner(true);
    try {
      const url = await supabaseService.uploadImageToCloudinary(file);
      await updateStoreBanner(url);
    } catch (err) {
      console.error("Banner upload error", err);
      showToast("Failed to upload cover banner");
    } finally {
      setIsUploadingBanner(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const url = await supabaseService.uploadImageToCloudinary(file);
      setLogoImgError(false);
      await updateStoreLogo(url);
    } catch (err) {
      console.error("Logo upload error", err);
      showToast("Failed to upload store logo");
    } finally {
      setIsUploadingLogo(false);
      if (e.target) e.target.value = "";
    }
  };

  // Metrics calculations (matching Android StockViewModel logic)
  const totalItems = items.length;
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const costVal = items.reduce((sum, item) => sum + Math.max(0, item.qty) * item.cost, 0);
  const priceVal = items.reduce((sum, item) => sum + Math.max(0, item.qty) * item.price, 0);
  const potentialProfit = priceVal - costVal;

  const lowStockItems = items.filter(
    (item) => item.qty <= 0 || (item.low > 0 && item.qty <= item.low)
  );
  const lowStockCount = lowStockItems.length;

  const recentTransactions = transactions.slice(0, 6);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Facebook-style Cover Photo & Store Profile Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cover Photo */}
        <div 
          className="relative h-36 sm:h-52 w-full bg-slate-800 overflow-hidden group cursor-pointer select-none" 
          onClick={() => bannerInputRef.current?.click()} 
          onMouseDown={handleBannerPressStart}
          onMouseUp={handleBannerPressEnd}
          onTouchStart={handleBannerPressStart}
          onTouchEnd={handleBannerPressEnd}
          title="Click or hold 3s to change cover photo"
        >
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
          <img
            src={bannerUrl || "/store_cover_banner.jpg"}
            alt="Store Cover Banner"
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/logos/img_store_cover_banner_1791306669322.jpg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
          
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1 bg-emerald-500/90 backdrop-blur-xs text-white text-[10px] font-black tracking-wider uppercase rounded-full shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>LIVE SYNC</span>
          </div>

          <div className="absolute top-3 left-3 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            <span>Change Cover</span>
          </div>

          {isUploadingBanner && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-bold gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Uploading banner to Cloudinary...</span>
            </div>
          )}
        </div>

        {/* Profile Card & Avatar */}
        <div className="px-5 sm:px-6 pb-4 pt-0 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
            <div className="flex items-end gap-3.5 sm:gap-4">
              {/* Store Logo Box - ONLY the avatar gets negative top margin */}
              <div 
                onClick={() => logoInputRef.current?.click()} 
                onMouseDown={handleLogoPressStart}
                onMouseUp={handleLogoPressEnd}
                onTouchStart={handleLogoPressStart}
                onTouchEnd={handleLogoPressEnd}
                title="Click or hold 3s to change logo" 
                className="-mt-10 sm:-mt-12 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white border-4 border-white shadow-lg overflow-hidden shrink-0 relative group cursor-pointer flex items-center justify-center z-10"
              >
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                
                {!logoImgError && (logoUrl || true) ? (
                  <img
                    src={logoUrl || "/logos/ic_stock_logo.png"}
                    alt="Store Logo"
                    className="w-full h-full object-cover"
                    onError={() => setLogoImgError(true)}
                  />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex flex-col items-center justify-center text-white p-1">
                    <Building2 className="w-8 h-8 text-white mb-0.5" />
                    <span className="text-[9px] font-black tracking-tight uppercase leading-none text-center">S.A.</span>
                  </div>
                )}

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Camera className="w-5 h-5" />
                </div>
                {isUploadingLogo && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}
              </div>

              {/* Store Name & Tagline sits cleanly in the white profile area below cover photo */}
              <div className="pt-2 pb-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                    {storeTitleText}
                  </h1>
                  <CheckCircle className="w-5 h-5 text-blue-600 shrink-0 fill-blue-600 text-white" />
                </div>
                <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                  {uiConfig.theme.tagline || "Real-time Inventory & Smart Billing"}
                </p>
              </div>
            </div>

            {/* Facebook Action Buttons */}
            <div className="flex items-center gap-2 pt-1 sm:pt-0">
              <button
                onClick={onOpenQuickBill}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <Receipt className="w-4 h-4" />
                <span>+ Quick Bill</span>
              </button>
              <button
                onClick={onOpenNewItem}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                <Package className="w-4 h-4" />
                <span>+ Add Item</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts (Quotes, Khata, +Bill) */}
      {uiConfig.features.showQuickActions && (
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onNavigateTab('BILLING')}
            className="flex flex-col items-center justify-center p-3.5 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/60 rounded-2xl transition-all shadow-xs group text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-1.5 shadow-xs group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-blue-950">Quotes</span>
            <span className="text-[11px] text-blue-600 font-semibold">({quotations.length})</span>
          </button>

          <button
            onClick={() => onNavigateTab('BILLING')}
            className="flex flex-col items-center justify-center p-3.5 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/60 rounded-2xl transition-all shadow-xs group text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-1.5 shadow-xs group-hover:scale-105 transition-transform">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-emerald-950">Khata</span>
            <span className="text-[11px] text-emerald-600 font-semibold">({ledgerAccounts.length})</span>
          </button>

          <button
            onClick={onOpenQuickBill}
            className="flex flex-col items-center justify-center p-3.5 bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200/60 rounded-2xl transition-all shadow-xs group text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-1.5 shadow-xs group-hover:scale-105 transition-transform">
              <Receipt className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-amber-950">+ Purchase Bill</span>
            <span className="text-[11px] text-amber-700 font-semibold">Stock In</span>
          </button>
        </div>
      )}

      {/* Low Stock Warning Alert */}
      {uiConfig.features.showLowStockAlert && lowStockCount > 0 && (
        <div
          onClick={onFilterLowStock}
          className="cursor-pointer bg-linear-to-r from-red-50 to-amber-50 border border-red-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-950">
                {lowStockCount} {lowStockCount === 1 ? 'item' : 'items'} low or out of stock!
              </h4>
              <p className="text-xs text-red-700">Tap to review items needing reorder in inventory</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-red-500 shrink-0" />
        </div>
      )}

      {/* Primary Stats Grid (Matching 2-column Android StatCards) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Items */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Items</span>
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">{totalItems}</div>
          <p className="text-xs text-slate-500 mt-1">Unique catalog SKUs</p>
        </div>

        {/* Total Quantity */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Quantity</span>
            <Boxes className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">
            {totalQty % 1 === 0 ? totalQty.toLocaleString() : totalQty.toFixed(1)}
          </div>
          <p className="text-xs text-slate-500 mt-1">Units currently in stock</p>
        </div>

        {/* Stock Value (Cost) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Value (Cost)</span>
            <DollarSign className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">
            {formatRupees(costVal)}
          </div>
          <p className="text-xs text-slate-500 mt-1">Purchase inventory value</p>
        </div>

        {/* Stock Value (Price) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Value (Price)</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">
            {formatRupees(priceVal)}
          </div>
          <p className="text-xs text-slate-500 mt-1">Retail market value</p>
        </div>

        {/* Potential Profit */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Potential Profit</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div
            className={`text-2xl sm:text-3xl font-bold ${
              potentialProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {formatRupees(potentialProfit)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {costVal > 0 ? `${((potentialProfit / costVal) * 100).toFixed(1)}% expected margin` : '—'}
          </p>
        </div>

        {/* Low / Negative Stock */}
        <div
          onClick={onFilterLowStock}
          className="cursor-pointer bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-red-300 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Low / Negative Stock</span>
            <AlertTriangle className={`w-4 h-4 ${lowStockCount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
          </div>
          <div
            className={`text-2xl sm:text-3xl font-bold ${
              lowStockCount > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {lowStockCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Items at or below reorder level</p>
        </div>
      </div>

      {/* Recent Transactions Section */}
      {uiConfig.features.showRecentTransactions && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Recent Transactions</h3>
              <p className="text-xs text-slate-500">Live inventory movement logs</p>
            </div>
            <button
              onClick={() => onNavigateTab('TRANSACTIONS')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View all
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="text-center py-10">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No stock transactions yet</p>
              <p className="text-xs text-slate-400 mt-1">Tap an item to issue or receive stock</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentTransactions.map((tx) => {
                const isIn = tx.action === 'in';
                return (
                  <div
                    key={tx.clientId}
                    onClick={() => tx.itemId && onOpenItemDetail(tx.itemId)}
                    className="py-3 sm:py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 rounded-xl px-2 -mx-2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isIn ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {tx.itemName}
                        </h4>
                        <p className="text-xs text-slate-500 truncate">
                          {formatDateTime(tx.createdAt)} {tx.note ? `· ${tx.note}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`text-sm font-bold ${
                          isIn ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {isIn ? '+' : '−'}
                        {tx.qty % 1 === 0 ? tx.qty : tx.qty.toFixed(1)}{' '}
                        <span className="text-xs font-medium text-slate-500">{tx.unit}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        Bal {tx.balance % 1 === 0 ? tx.balance : tx.balance.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
