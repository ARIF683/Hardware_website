import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Trash2,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { DailyCashflowRecord, TransactionRecord } from '../types';
import { formatRupees, formatDateTime, formatDate } from '../utils/formatters';

const EXPENSE_CATEGORIES = [
  'Transport/Freight',
  'Shop Rent',
  'Electricity & Utility',
  'Staff Salary & Wages',
  'Tea, Snacks & Refreshment',
  'Packaging & Printing',
  'Maintenance & Repairs',
  'Supplier Advance Payment',
  'Taxes & Govt Fees',
  'Other Expense'
];

const SALE_CATEGORIES = [
  'Counter Sale',
  'Hardware Retail',
  'Electrical',
  'Plumbing',
  'Sanitary & Fittings',
  'Paints & Tools',
  'Building Materials',
  'Customer Khata Collection',
  'Quotation / Project Sale',
  'Other Revenue'
];

export const TransactionsScreen: React.FC = () => {
  const {
    dailyCashflows,
    transactions,
    addCashflowRecord,
    deleteCashflowRecord,
    isAdmin
  } = useStock();

  const [activeTab, setActiveTab] = useState<0 | 1>(0); // 0 = Cashflow P&L, 1 = Stock Logs

  // Cashflow states
  const [filterType, setFilterType] = useState<'ALL' | 'SALE' | 'EXPENSE'>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [cashflowSearch, setCashflowSearch] = useState('');
  const [showAddCashflowModal, setShowAddCashflowModal] = useState(false);
  const [cashflowAddType, setCashflowAddType] = useState<'SALE' | 'EXPENSE'>('SALE');
  const [cfCategory, setCfCategory] = useState(SALE_CATEGORIES[0]);
  const [cfAmount, setCfAmount] = useState('');
  const [cfPaymentMode, setCfPaymentMode] = useState<'Cash' | 'UPI' | 'Card' | 'Bank' | 'Credit'>('Cash');
  const [cfNote, setCfNote] = useState('');
  const [cfDate, setCfDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Month selector
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const selectedYear = currentDate.getFullYear();
  const selectedMonth = currentDate.getMonth(); // 0-based
  const selectedMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    setCurrentDate(new Date(selectedYear, selectedMonth - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(selectedYear, selectedMonth + 1, 1));
  };

  // Stock logs states
  const [stockActionFilter, setStockActionFilter] = useState<'ALL' | 'in' | 'out'>('ALL');
  const [stockSearch, setStockSearch] = useState('');

  // Cashflow calculations
  const monthlyRecords = useMemo(() => {
    return dailyCashflows.filter((cf) => cf.date.startsWith(selectedMonthKey));
  }, [dailyCashflows, selectedMonthKey]);

  const monthlySales = useMemo(() => {
    return monthlyRecords
      .filter((cf) => cf.type === 'SALE')
      .reduce((sum, cf) => sum + cf.amount, 0);
  }, [monthlyRecords]);

  const monthlyExpenses = useMemo(() => {
    return monthlyRecords
      .filter((cf) => cf.type === 'EXPENSE')
      .reduce((sum, cf) => sum + cf.amount, 0);
  }, [monthlyRecords]);

  const salesCount = useMemo(
    () => monthlyRecords.filter((cf) => cf.type === 'SALE').length,
    [monthlyRecords]
  );
  const expensesCount = useMemo(
    () => monthlyRecords.filter((cf) => cf.type === 'EXPENSE').length,
    [monthlyRecords]
  );

  const monthlyNetProfit = monthlySales - monthlyExpenses;
  const isProfit = monthlyNetProfit >= 0;
  const marginPct =
    monthlySales > 0 ? ((monthlyNetProfit / monthlySales) * 100).toFixed(1) : '0';

  // Today calculations
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecords = useMemo(() => {
    return dailyCashflows.filter((cf) => cf.date === todayStr);
  }, [dailyCashflows, todayStr]);

  const todaySales = todayRecords
    .filter((cf) => cf.type === 'SALE')
    .reduce((sum, cf) => sum + cf.amount, 0);
  const todayExpenses = todayRecords
    .filter((cf) => cf.type === 'EXPENSE')
    .reduce((sum, cf) => sum + cf.amount, 0);
  const todayNet = todaySales - todayExpenses;

  // Available categories for sub-filter chips
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    monthlyRecords.forEach((cf) => {
      if (cf.category) set.add(cf.category);
    });
    return Array.from(set);
  }, [monthlyRecords]);

  // Filtered Cashflows
  const filteredCashflows = useMemo(() => {
    return monthlyRecords.filter((cf) => {
      const matchesType = filterType === 'ALL' || cf.type === filterType;
      const matchesCategory =
        selectedCategoryFilter === null || cf.category === selectedCategoryFilter;
      const matchesSearch =
        cf.category.toLowerCase().includes(cashflowSearch.toLowerCase()) ||
        cf.note.toLowerCase().includes(cashflowSearch.toLowerCase()) ||
        cf.paymentMode.toLowerCase().includes(cashflowSearch.toLowerCase());
      return matchesType && matchesCategory && matchesSearch;
    });
  }, [monthlyRecords, filterType, selectedCategoryFilter, cashflowSearch]);

  // Grouped Cashflows by Date
  const groupedCashflows = useMemo(() => {
    const groups: { [date: string]: DailyCashflowRecord[] } = {};
    filteredCashflows.forEach((cf) => {
      if (!groups[cf.date]) groups[cf.date] = [];
      groups[cf.date].push(cf);
    });
    // Sort dates descending
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredCashflows]);

  // Filtered Stock Logs
  const filteredStockLogs = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesAction = stockActionFilter === 'ALL' || tx.action === stockActionFilter;
      const matchesSearch =
        tx.itemName.toLowerCase().includes(stockSearch.toLowerCase()) ||
        tx.note.toLowerCase().includes(stockSearch.toLowerCase());
      return matchesAction && matchesSearch;
    });
  }, [transactions, stockActionFilter, stockSearch]);

  const handleAddCashflow = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(cfAmount);
    if (!amt || amt <= 0) return;

    addCashflowRecord({
      date: cfDate,
      type: cashflowAddType,
      category: cfCategory,
      amount: amt,
      paymentMode: cfPaymentMode,
      note: cfNote.trim()
    });

    setCfAmount('');
    setCfNote('');
    setShowAddCashflowModal(false);
  };

  return (
    <div className="space-y-4 pb-20 md:pb-8">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Transactions & Cashflow</h1>
          <p className="text-xs text-slate-500">
            Daily Sales, Expenses & Monthly Operating P&L Summary
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab(0)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 0
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>Sales & Expenses (P&L)</span>
          </button>
          <button
            onClick={() => setActiveTab(1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 1
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Stock Logs ({transactions.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 0 ? (
        // Tab 1: Daily P&L Cashflow
        <div className="space-y-4">
          {/* Month Selector Bar */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>{monthName}</span>
            </div>
            <button
              onClick={nextMonth}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Android App Style Monthly P&L Summary Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-lg border border-slate-800 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold border-b border-slate-800 pb-3">
              <span>Net Profit for this month</span>
              <span className="bg-slate-800 text-emerald-400 px-2.5 py-0.5 rounded-full font-bold">
                Margin: {marginPct}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Total Sales
                </span>
                <div className="text-2xl font-black text-emerald-400 mt-1">
                  {formatRupees(monthlySales)}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{salesCount} sales recorded</p>
              </div>

              <div>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  Total Expenses
                </span>
                <div className="text-2xl font-black text-red-400 mt-1">
                  {formatRupees(monthlyExpenses)}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{expensesCount} expenses recorded</p>
              </div>
            </div>

            {/* Today's Live Banner */}
            <div className="bg-slate-800/80 rounded-2xl p-3 flex flex-wrap items-center justify-between text-xs gap-2 border border-slate-700/50">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Today's Live:
              </span>
              <div className="flex items-center gap-3 font-bold">
                <span className="text-emerald-400">Sales: +₹{todaySales}</span>
                <span className="text-red-400">Expenses: -₹{todayExpenses}</span>
                <span className={todayNet >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  Net: {todayNet >= 0 ? '+' : '-'}₹{Math.abs(todayNet)}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons: Big Green + Add Sale and Big Red - Add Expense */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setCashflowAddType('SALE');
                setCfCategory(SALE_CATEGORIES[0]);
                setShowAddCashflowModal(true);
              }}
              className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>+ Add Sale</span>
            </button>

            <button
              onClick={() => {
                setCashflowAddType('EXPENSE');
                setCfCategory(EXPENSE_CATEGORIES[0]);
                setShowAddCashflowModal(true);
              }}
              className="py-3.5 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-sm rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>- Add Expense</span>
            </button>
          </div>

          {/* Cashflow Filter & Search Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setFilterType('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === 'ALL'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({monthlyRecords.length})
                </button>
                <button
                  onClick={() => setFilterType('SALE')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === 'SALE'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🟢 Sales ({salesCount})
                </button>
                <button
                  onClick={() => setFilterType('EXPENSE')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === 'EXPENSE'
                      ? 'bg-red-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🔴 Expenses ({expensesCount})
                </button>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={cashflowSearch}
                  onChange={(e) => setCashflowSearch(e.target.value)}
                  placeholder="Search title, category, note…"
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Category Filter Chips */}
            {availableCategories.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 no-scrollbar border-t border-slate-100">
                <button
                  onClick={() => setSelectedCategoryFilter(null)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                    selectedCategoryFilter === null
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setSelectedCategoryFilter(selectedCategoryFilter === cat ? null : cat)
                    }
                    className={`px-3 py-1 rounded-xl text-xs font-semibold shrink-0 border transition-all ${
                      selectedCategoryFilter === cat
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grouped Records List by Date */}
          <div className="space-y-3">
            {groupedCashflows.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                No entries recorded for {monthName}. Use + Add Sale or - Add Expense to track money in/out.
              </div>
            ) : (
              groupedCashflows.map(([dateStr, entries]) => {
                const daySales = entries
                  .filter((e) => e.type === 'SALE')
                  .reduce((sum, e) => sum + e.amount, 0);
                const dayExpenses = entries
                  .filter((e) => e.type === 'EXPENSE')
                  .reduce((sum, e) => sum + e.amount, 0);
                const dayNet = daySales - dayExpenses;
                const isToday = dateStr === todayStr;

                return (
                  <div
                    key={dateStr}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
                  >
                    {/* Day Group Header */}
                    <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold">
                      <span>{isToday ? `Today (${dateStr})` : dateStr}</span>
                      <div className="flex items-center gap-2">
                        {daySales > 0 && <span className="text-emerald-400">+{daySales}</span>}
                        {dayExpenses > 0 && <span className="text-red-400">-{dayExpenses}</span>}
                        <span className={dayNet >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                          Net: {dayNet >= 0 ? '+' : '-'}₹{Math.abs(dayNet)}
                        </span>
                      </div>
                    </div>

                    {/* Day Entries */}
                    <div className="divide-y divide-slate-100">
                      {entries.map((cf) => {
                        const isSale = cf.type === 'SALE';
                        return (
                          <div
                            key={cf.id}
                            className="p-3.5 sm:p-4 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  isSale
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {isSale ? (
                                  <ArrowDownLeft className="w-4 h-4" />
                                ) : (
                                  <ArrowUpRight className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{cf.category}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                    {cf.paymentMode}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {cf.note ? cf.note : cf.category}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div
                                className={`font-black text-sm ${
                                  isSale ? 'text-emerald-600' : 'text-red-600'
                                }`}
                              >
                                {isSale ? '+' : '-'}
                                {formatRupees(cf.amount)}
                              </div>

                              <button
                                onClick={() => {
                                  if (confirm('Delete this cashflow entry?')) {
                                    deleteCashflowRecord(cf.id);
                                  }
                                }}
                                className="p-1 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        // Tab 2: Stock Logs (Inventory Movements)
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
              <button
                onClick={() => setStockActionFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  stockActionFilter === 'ALL'
                    ? 'bg-white text-blue-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Actions
              </button>
              <button
                onClick={() => setStockActionFilter('in')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  stockActionFilter === 'in'
                    ? 'bg-white text-emerald-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stock In
              </button>
              <button
                onClick={() => setStockActionFilter('out')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  stockActionFilter === 'out'
                    ? 'bg-white text-red-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stock Out
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search inventory logs…"
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden divide-y divide-slate-100">
            {filteredStockLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No inventory logs recorded yet. Stock movement entries automatically record here when items are added or issued.
              </div>
            ) : (
              filteredStockLogs.map((tx, idx) => {
                const isIn = tx.action === 'in';
                return (
                  <div
                    key={tx.clientId || `tx_${tx.createdAt}_${idx}`}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isIn ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{tx.itemName}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatDateTime(tx.createdAt)} {tx.note ? `· ${tx.note}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-black text-sm ${
                          isIn ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {isIn ? '+' : '-'}{tx.qty} {tx.unit}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Balance: {tx.balance} {tx.unit}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Add Cashflow Modal (Sale / Expense) */}
      {showAddCashflowModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {cashflowAddType === 'SALE' ? '🟢 Add Sale Record' : '🔴 Add Expense Record'}
              </h2>
              <button
                onClick={() => setShowAddCashflowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCashflow} className="p-5 space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setCashflowAddType('SALE');
                    setCfCategory(SALE_CATEGORIES[0]);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    cashflowAddType === 'SALE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🟢 Sale (Revenue)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCashflowAddType('EXPENSE');
                    setCfCategory(EXPENSE_CATEGORIES[0]);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    cashflowAddType === 'EXPENSE'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🔴 Expense (Cost)
                </button>
              </div>

              {/* Date & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={cfDate}
                    onChange={(e) => setCfDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={cfCategory}
                    onChange={(e) => setCfCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {(cashflowAddType === 'SALE' ? SALE_CATEGORIES : EXPENSE_CATEGORIES).map(
                      (cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={cfAmount}
                  onChange={(e) => setCfAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-black focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Mode
                </label>
                <div className="grid grid-cols-5 gap-1 text-[11px]">
                  {(['Cash', 'UPI', 'Card', 'Bank', 'Credit'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCfPaymentMode(m)}
                      className={`py-1.5 rounded-lg font-bold border transition-all ${
                        cfPaymentMode === m
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Note / Description
                </label>
                <input
                  type="text"
                  value={cfNote}
                  onChange={(e) => setCfNote(e.target.value)}
                  placeholder="e.g. Freight for pipe delivery"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCashflowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-colors ${
                    cashflowAddType === 'SALE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Save {cashflowAddType === 'SALE' ? 'Sale' : 'Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
