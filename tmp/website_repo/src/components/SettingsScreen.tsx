import React, { useState } from 'react';
import {
  Store,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Database,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Check,
  Palette,
  Sliders,
  Sparkles,
  Cloud,
  QrCode,
  Save,
  Lock,
  Unlock,
  KeyRound,
  Paintbrush
} from 'lucide-react';
import { ColorMachineTintModal } from './ColorMachineTintModal';
import { useStock } from '../context/StockContext';
import { ShopProfile } from '../types';
import { SUPABASE_URL, SUPABASE_KEY, supabaseService } from '../services/supabaseService';

export const SettingsScreen: React.FC = () => {
  const {
    shopProfile,
    updateShopProfile,
    uiConfig,
    updateUiConfig,
    selectedLogo,
    selectLogo,
    isAdmin,
    themeColor,
    setThemeColor,
    unlockAdmin,
    exitAdmin,
    isPinLocked,
    setPinLockEnabled,
    changeAdminPin,
    clearTransactions,
    resetToDemoData,
    exportDataJson,
    importDataJson,
    showToast,
    supabaseStatus,
    isRealtimeLive,
    items,
    refreshFromSupabase
  } = useStock();

  // Profile local form
  const [profileForm, setProfileForm] = useState<ShopProfile>(shopProfile);

  // Admin PIN modal
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showColorMachineModal, setShowColorMachineModal] = useState(false);

  // Supabase live config
  const [supabaseUrl, setSupabaseUrl] = useState(
    () => localStorage.getItem('hardware_supabase_url') || SUPABASE_URL
  );
  const [supabaseKey, setSupabaseKey] = useState(
    () => localStorage.getItem('hardware_supabase_key') || SUPABASE_KEY
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const availableLogos = [
    { id: 'stock_default', title: 'Classic Stock', path: '/logos/ic_stock_logo.png' },
    { id: 'nano_banana', title: 'Nano Banana', path: '/logos/nano_banana_logo_1791185750609.jpg' },
    { id: 'banana_tech', title: 'Banana Tech', path: '/logos/banana_tech_logo_1791185765354.jpg' },
    { id: 'cyber_banana', title: 'Cyber Banana', path: '/logos/cyber_banana_logo_1791185780500.jpg' },
    { id: 'option_a', title: 'Logo Style A', path: '/logos/img_logo_option_a_1791181143165.jpg' },
    { id: 'option_b', title: 'Logo Style B', path: '/logos/img_logo_option_b_1791181156769.jpg' },
    { id: 'option_c', title: 'Logo Style C', path: '/logos/img_logo_option_c_1791181173362.jpg' }
  ];

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateShopProfile(profileForm);
  };

  const handleExport = () => {
    const jsonStr = exportDataJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardware_stock_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON downloaded');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          importDataJson(text);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('hardware_supabase_url', supabaseUrl.trim());
    localStorage.setItem('hardware_supabase_key', supabaseKey.trim());
    showToast('Supabase settings saved');
  };

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-4xl mx-auto">
      {/* Admin Mode Status Banner */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isAdmin
            ? 'bg-blue-50/80 border-blue-200 text-blue-900'
            : 'bg-slate-50 border-slate-200 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isAdmin ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">
                {isAdmin ? 'Admin Mode is Active' : 'Standard Cashier Mode'}
              </h3>
              {isAdmin && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-md uppercase">
                  UNLOCKED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAdmin
                ? 'Restricted settings and database actions are available.'
                : 'Enter your PIN or triple-tap the gear icon to unlock.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              <button
                onClick={() => setShowChangePinModal(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors"
              >
                Change PIN
              </button>
              <button
                onClick={exitAdmin}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
              >
                Exit Admin
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowPinModal(true)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
            >
              Unlock Admin
            </button>
          )}
        </div>
      </div>

      {/* Store Profile Settings */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Shop Profile & Invoice Header</h3>
            <p className="text-xs text-slate-500">
              Details displayed on customer estimates, tax invoices, and receipts
            </p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Shop / Company Name
              </label>
              <input
                type="text"
                required
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tagline / Subtitle
              </label>
              <input
                type="text"
                value={profileForm.tagline}
                onChange={(e) => setProfileForm({ ...profileForm, tagline: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Phone Number / WhatsApp
              </label>
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                GSTIN / Tax ID
              </label>
              <input
                type="text"
                value={profileForm.gstin}
                onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value })}
                placeholder="07AAAAA0000A1Z5"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Shop Address
              </label>
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                UPI ID (For Customer QR Code Payments)
              </label>
              <input
                type="text"
                value={profileForm.upiId}
                onChange={(e) => setProfileForm({ ...profileForm, upiId: e.target.value })}
                placeholder="yourshop@upi"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save Store Details</span>
            </button>
          </div>
        </form>
      </div>

      {/* Logo Selector */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">App Branding & Logo</h3>
            <p className="text-xs text-slate-500">
              Select or change the icon displayed across the header and invoices
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {availableLogos.map((lg) => {
            const isSelected = selectedLogo === lg.path;
            return (
              <div
                key={lg.id}
                onClick={() => selectLogo(lg.path)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col items-center gap-2 text-center relative ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-xs">
                    <Check className="w-3 h-3" />
                  </div>
                )}
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                  <img
                    src={lg.path}
                    alt={lg.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800">{lg.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature & UI Toggles */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Dashboard & Display Preferences</h3>
            <p className="text-xs text-slate-500">
              Configure widgets, alerts, and quick action bars
            </p>
          </div>
        </div>

        <div className="space-y-3 divide-y divide-slate-100 text-xs">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-bold text-slate-900">Show Quick Actions Bar</p>
              <p className="text-slate-500">Quotes, Khata, and +Bill buttons on Home</p>
            </div>
            <input
              type="checkbox"
              checked={uiConfig.features.showQuickActions}
              onChange={(e) =>
                updateUiConfig({
                  features: { ...uiConfig.features, showQuickActions: e.target.checked }
                })
              }
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-bold text-slate-900">Show Low Stock Alert Banner</p>
              <p className="text-slate-500">Displays warning when items fall below threshold</p>
            </div>
            <input
              type="checkbox"
              checked={uiConfig.features.showLowStockAlert}
              onChange={(e) =>
                updateUiConfig({
                  features: { ...uiConfig.features, showLowStockAlert: e.target.checked }
                })
              }
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-bold text-slate-900">Show Recent Transactions Widget</p>
              <p className="text-slate-500">Shows recent stock movements on the home dashboard</p>
            </div>
            <input
              type="checkbox"
              checked={uiConfig.features.showRecentTransactions}
              onChange={(e) =>
                updateUiConfig({
                  features: { ...uiConfig.features, showRecentTransactions: e.target.checked }
                })
              }
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Theme Settings Selection */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Custom Color Theme</h3>
              <p className="text-xs text-slate-500">
                Choose any custom color for your app and website theme
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <p className="font-bold text-slate-900 mb-2">Preset Colors</p>
            <div className="flex flex-wrap gap-2.5">
              {[
                { name: 'Blue', hex: '#3b82f6' },
                { name: 'Indigo', hex: '#4f46e5' },
                { name: 'Emerald', hex: '#10b981' },
                { name: 'Rose', hex: '#f43f5e' },
                { name: 'Amber', hex: '#f59e0b' },
                { name: 'Violet', hex: '#8b5cf6' },
                { name: 'Teal', hex: '#0ea5e9' },
                { name: 'Slate', hex: '#475569' }
              ].map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setThemeColor(c.hex)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold border transition-all ${
                    themeColor === c.hex
                      ? 'border-slate-800 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="font-bold text-slate-900 mb-2">Custom Color Picker</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="w-10 h-10 p-0 rounded-xl cursor-pointer border border-slate-200"
              />
              <input
                type="text"
                value={themeColor}
                onChange={(e) => {
                  if (e.target.value.startsWith('#') && e.target.value.length <= 7) {
                    setThemeColor(e.target.value);
                  }
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-800 font-mono text-sm uppercase text-slate-700 w-28 text-center"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Sync / Supabase Configuration */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Supabase Database Connection</h3>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                    supabaseStatus === 'connected'
                      ? 'bg-emerald-100 text-emerald-800'
                      : supabaseStatus === 'connecting'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {supabaseStatus === 'connected' ? `● Connected (${items.length} SKUs)` : 'Connecting…'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Connected to your real hardware inventory database with Realtime WebSocket sync
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSyncing}
            onClick={async () => {
              setIsSyncing(true);
              await refreshFromSupabase();
              setIsSyncing(false);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing…' : 'Sync From Supabase'}</span>
          </button>
        </div>

        <form onSubmit={handleSaveSupabase} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xyz.supabase.co"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
              Supabase Publishable / Anon Key
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-colors"
            >
              Save Credentials & Reconnect
            </button>
          </div>
        </form>
      </div>

      {/* Color Machine Tint Integration */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Paintbrush className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Color Machine Tint Import (.CSC / .CSV)</h3>
            <p className="text-xs text-slate-500">
              Import Corob / Smart Tint dispensing logs & auto-deduct tinted stock by date & liter
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 text-xs">
          <p className="text-slate-600 max-w-xl">
            Automatically parses product names, base codes, can factors (1L, 4L, 10L, 20L), and timestamps from your color dispenser machine export. Includes <strong>smart duplicate protection</strong> so previously applied records will not be deducted again.
          </p>
          <button
            onClick={() => setShowColorMachineModal(true)}
            className="shrink-0 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Open Tint Machine Importer</span>
          </button>
        </div>
      </div>

      {/* Data Backup & Restore */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Data Backup & Restore</h3>
            <p className="text-xs text-slate-500">
              Export full database snapshot to JSON or restore existing records
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 p-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl border border-blue-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Full Backup (JSON)</span>
          </button>

          <label className="flex items-center justify-center gap-2 p-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Restore Backup (JSON)</span>
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>

        {/* Admin Danger Zone */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <span className="text-xs font-bold text-red-600 uppercase tracking-wider block">
            Danger Zone
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (confirm('Reset catalog, transactions, and khata to default demo items?')) {
                  resetToDemoData();
                }
              }}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset to Sample Data</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => {
                  if (confirm('Clear all historical transactions? Inventory balances will remain unchanged.')) {
                    clearTransactions();
                  }
                }}
                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Transaction History</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Unlock Admin PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900">Enter Admin PIN</h3>
            <p className="text-xs text-slate-500 mt-1">
              Default PIN is <strong className="font-mono text-slate-800">1234</strong>
            </p>
            <input
              type="password"
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN"
              className="mt-4 w-full px-4 py-2.5 text-center text-xl font-mono tracking-widest border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowPinModal(false);
                  setPinInput('');
                }}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (unlockAdmin(pinInput)) {
                    setShowPinModal(false);
                    setPinInput('');
                  }
                }}
                className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl shadow-xs"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {showChangePinModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900">Change Admin PIN</h3>
            <div className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Current PIN</label>
                <input
                  type="password"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  placeholder="Enter current PIN"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">New PIN</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Enter new 4-digit PIN"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowChangePinModal(false)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (changeAdminPin(oldPin, newPin)) {
                    setShowChangePinModal(false);
                    setOldPin('');
                    setNewPin('');
                  }
                }}
                className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl shadow-xs"
              >
                Update PIN
              </button>
            </div>
          </div>
        </div>
      )}
      {showColorMachineModal && (
        <ColorMachineTintModal
          isOpen={showColorMachineModal}
          onClose={() => setShowColorMachineModal(false)}
        />
      )}
    </div>
  );
};
