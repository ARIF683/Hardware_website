import React, { useState } from 'react';
import {
  Home,
  Package,
  Receipt,
  History,
  Settings,
  Plus,
  Calculator,
  ArrowLeftRight,
  ShieldCheck,
  ShieldAlert,
  Search,
  Cloud,
  RefreshCw
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { NavigationTab } from '../types';

interface NavbarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenNewItem: () => void;
  onOpenQuickBill: () => void;
  onOpenCalculator: () => void;
  onOpenConverter: () => void;
  onSearchClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenNewItem,
  onOpenQuickBill,
  onOpenCalculator,
  onOpenConverter,
}) => {
  const {
    shopProfile,
    isAdmin,
    unlockAdmin,
    exitAdmin,
    showToast,
    supabaseStatus,
    isRealtimeLive,
    items,
    refreshFromSupabase
  } = useStock();
  const [tapCount, setTapCount] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    await refreshFromSupabase();
    setIsRefreshing(false);
  };

  // 3-tap secret trigger on the gear icon (matching Android app behaviour)
  const handleGearTap = () => {
    const now = Date.now();
    if (now - lastTapTime < 700) {
      const newCount = tapCount + 1;
      if (newCount >= 3) {
        if (isAdmin) {
          exitAdmin();
        } else {
          setShowPinPrompt(true);
        }
        setTapCount(0);
      } else {
        setTapCount(newCount);
      }
    } else {
      setTapCount(1);
    }
    setLastTapTime(now);
    onSelectTab('SETTINGS');
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockAdmin(enteredPin)) {
      setShowPinPrompt(false);
      setEnteredPin('');
    }
  };

  const navItems: { tab: NavigationTab; label: string; icon: React.FC<any> }[] = [
    { tab: 'HOME', label: 'Home', icon: Home },
    { tab: 'ITEMS', label: 'Stock', icon: Package },
    { tab: 'BILLING', label: 'Billing & Khata', icon: Receipt },
    { tab: 'TRANSACTIONS', label: 'Cashflow & Logs', icon: History },
    { tab: 'SETTINGS', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectTab('HOME')}>
            <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-xs border border-slate-200 bg-blue-50 flex items-center justify-center shrink-0">
              <img
                src={shopProfile.logo || '/logos/ic_stock_logo.png'}
                alt="Logo"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <Package className="w-5 h-5 text-blue-600 absolute" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate tracking-tight">
                  {shopProfile.name}
                </h1>
                {isAdmin ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-blue-600 text-white rounded-md shadow-xs">
                    <ShieldCheck className="w-3 h-3" />
                    ADMIN
                  </span>
                ) : null}

                {/* Supabase Live Status Chip */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleManualSync();
                  }}
                  title="Click to sync with Supabase"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all ${
                    supabaseStatus === 'connected'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : supabaseStatus === 'connecting'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      supabaseStatus === 'connected'
                        ? 'bg-emerald-500 animate-pulse'
                        : supabaseStatus === 'connecting'
                        ? 'bg-amber-500 animate-ping'
                        : 'bg-slate-400'
                    }`}
                  />
                  <Cloud className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">
                    {supabaseStatus === 'connected' ? `Supabase (${items.length})` : 'Syncing…'}
                  </span>
                  <RefreshCw className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-xs text-slate-500 truncate hidden sm:block">
                {shopProfile.tagline}
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => (item.tab === 'SETTINGS' ? handleGearTap() : onSelectTab(item.tab))}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Quick Action Tools */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={onOpenCalculator}
              title="Quick Calculator"
              className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100"
            >
              <Calculator className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenConverter}
              title="Unit Converter (e.g., Box to Pcs)"
              className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenQuickBill}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100/90 hover:bg-amber-200/80 rounded-xl transition-all border border-amber-200 shadow-xs"
            >
              <Receipt className="w-3.5 h-3.5 text-amber-700" />
              <span>+ Bill</span>
            </button>

            <button
              onClick={onOpenNewItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Item</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Matching Android app) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 py-1.5 px-2 flex justify-around items-center shadow-lg safe-bottom">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => (item.tab === 'SETTINGS' ? handleGearTap() : onSelectTab(item.tab))}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? 'bg-blue-50 text-blue-600 scale-105' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label.split(' ')[0]}</span>

              {item.tab === 'SETTINGS' && isAdmin && (
                <span className="absolute top-1 right-2 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Admin PIN Dialog Modal */}
      {showPinPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Admin Authentication</h3>
            <p className="text-xs text-slate-500 mt-1">
              Enter your Admin PIN (Default: <strong className="font-mono text-slate-700">1234</strong>) to unlock restricted actions.
            </p>
            <form onSubmit={handlePinSubmit} className="mt-4">
              <input
                type="password"
                maxLength={8}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                placeholder="Enter PIN"
                className="w-full px-4 py-2.5 text-center text-xl font-mono tracking-widest border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowPinPrompt(false)}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
