import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Wallet,
  Receipt,
  Package,
  TrendingUp,
  DollarSign,
  ChevronRight,
  Boxes
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { formatRupees, formatDateTime } from '../utils/formatters';
import { NavigationTab } from '../types';

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
  const { items, transactions, quotations, ledgerAccounts, uiConfig } = useStock();

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

      {/* Low Stock Warning Banner */}
      {lowStockCount > 0 && uiConfig.features.showLowStockAlert && (
        <div
          onClick={onFilterLowStock}
          className="cursor-pointer bg-red-50 hover:bg-red-100/80 border border-red-200 rounded-2xl p-4 transition-all flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-900">
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
