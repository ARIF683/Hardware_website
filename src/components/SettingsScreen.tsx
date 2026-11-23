import React, { useState, useEffect } from 'react';
import {
  Store,
  ShieldCheck,
  Database,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Check,
  Sliders,
  Sparkles,
  Cloud,
  Save,
  Lock,
  Paintbrush,
  Users,
  Mail,
  LogOut,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Megaphone
} from 'lucide-react';
import { ColorMachineTintModal } from './ColorMachineTintModal';
import { AnnouncementStudioModal } from './AnnouncementStudioModal';
import {
  AdminUserManagementModal,
  ChangeEmailOtpModal,
  DeleteAccountOtpModal
} from './AccountDialogs';
import { useStock } from '../context/StockContext';
import { ShopProfile } from '../types';
import { SUPABASE_URL, SUPABASE_KEY, supabaseService, cleanSupabaseUrl } from '../services/supabaseService';
import { FESTIVAL_MODE_CUSTOM, FESTIVAL_MODE_OFF, getEffectiveCustomFestivals } from '../utils/festivalStudio';

export const SettingsScreen: React.FC = () => {
  const {
    shopProfile,
    updateShopProfile,
    uiConfig,
    updateUiConfig,
    selectedLogo,
    selectLogo,
    isAdmin,
    currentUserEmail,
    registeredUsers,
    festivalStudioConfig,
    activeFestivals,
    activeAnnouncement,
    themeColor,
    setThemeColor,
    refreshCurrentUserRole,
    logout,
    clearTransactions,
    resetToDemoData,
    exportDataJson,
    importDataJson,
    showToast,
    supabaseStatus,
    items,
    refreshFromSupabase
  } = useStock();

  // Profile local form
  const [profileForm, setProfileForm] = useState<ShopProfile>(shopProfile);

  // Account & Studio modals
  const [showAnnouncementStudio, setShowAnnouncementStudio] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [confirmClearTx, setConfirmClearTx] = useState(false);
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);
  const [isRefreshingRole, setIsRefreshingRole] = useState(false);
  const [showColorMachineModal, setShowColorMachineModal] = useState(false);

  // Automatically close admin-only modals if role is revoked remotely
  useEffect(() => {
    if (!isAdmin) {
      setShowAnnouncementStudio(false);
      setShowUserManagement(false);
    }
  }, [isAdmin]);

  // Supabase live config
  const [supabaseUrl, setSupabaseUrl] = useState(
    () => cleanSupabaseUrl(localStorage.getItem('hardware_supabase_url') || SUPABASE_URL)
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

  const handleSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedUrl = cleanSupabaseUrl(supabaseUrl);
    const sanitizedKey = (supabaseKey || '').trim().replace(/^Bearer\s+/i, '').replace(/^["']+|["']+$/g, '').trim();
    setSupabaseUrl(sanitizedUrl);
    setSupabaseKey(sanitizedKey);
    localStorage.setItem('hardware_supabase_url', sanitizedUrl);
    localStorage.setItem('hardware_supabase_key', sanitizedKey);
    supabaseService.updateCredentials(sanitizedUrl, sanitizedKey);
    await refreshFromSupabase();
    showToast('Supabase settings saved and reconnected');
  };

  const handleResetDefaultSupabase = async () => {
    try {
      localStorage.removeItem('hardware_supabase_url');
      localStorage.removeItem('hardware_supabase_key');
    } catch {}
    setSupabaseUrl(SUPABASE_URL);
    setSupabaseKey(SUPABASE_KEY);
    supabaseService.updateCredentials(SUPABASE_URL, SUPABASE_KEY);
    await refreshFromSupabase();
    showToast('Restored default Supabase connection');
  };

  // Compute Announcement Studio live status summary (matching Android SettingsScreen)
  const noticeActive = activeAnnouncement.enabled && activeAnnouncement.message.trim().length > 0;
  const noticeScheduled =
    !noticeActive &&
    festivalStudioConfig.announcement.enabled &&
    festivalStudioConfig.announcement.message.trim().length > 0;
  const customActiveCount = getEffectiveCustomFestivals(festivalStudioConfig).filter((f) => f.enabled).length;
  const festSummary =
    festivalStudioConfig.overrideMode === FESTIVAL_MODE_OFF
      ? 'Festivals Off'
      : festivalStudioConfig.overrideMode === FESTIVAL_MODE_CUSTOM
      ? customActiveCount > 0
        ? `${customActiveCount} Custom Card${customActiveCount > 1 ? 's' : ''}`
        : 'Custom Inactive'
      : (() => {
          const calLabel = festivalStudioConfig.autoCalendarEnabled
            ? 'Calendar + Custom'
            : 'Custom Only';
          return activeFestivals.length > 0 ? `${calLabel} (${activeFestivals.length} live)` : calLabel;
        })();
  const studioSummary = noticeActive
    ? `Notice Live • ${festSummary}`
    : noticeScheduled
    ? `Notice Scheduled • ${festSummary}`
    : `${festSummary} • Notices & Festivals`;

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-4xl mx-auto">
      {/* Account, Role & Admin Studio Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Role Access Row (Tap to refresh role from database) */}
        <div
          onClick={async () => {
            if (isRefreshingRole) return;
            setIsRefreshingRole(true);
            await refreshCurrentUserRole(true);
            setIsRefreshingRole(false);
          }}
          className={`p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
            isAdmin ? 'bg-blue-50/70 hover:bg-blue-50' : 'bg-slate-50/80 hover:bg-slate-100/70'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isAdmin ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  {isAdmin ? 'Admin Role Active' : 'Staff Operator Access'}
                </h3>
                <span
                  className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md uppercase tracking-wide ${
                    isAdmin ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {isAdmin ? 'ADMIN' : 'STAFF'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {currentUserEmail || 'Signed in account'} •{' '}
                {isAdmin
                  ? 'Manage Announcement Studio & staff roles below'
                  : 'Tap to refresh role from database'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isRefreshingRole}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs shrink-0 whitespace-nowrap"
          >
            {isRefreshingRole ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            )}
            <span>Sync Role</span>
          </button>
        </div>

        {/* Admin-only Quick Rows: Announcement Studio + Staff & Admin Accounts */}
        {isAdmin && (
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAnnouncementStudio(true)}
              className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Announcement Studio</div>
                  <div className="text-xs text-slate-500 truncate">{studioSummary}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold uppercase whitespace-nowrap">
                  Admin
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowUserManagement(true)}
              className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Staff & Admin Accounts</div>
                  <div className="text-xs text-slate-500 truncate">
                    Add, remove, or promote staff and admin accounts
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold whitespace-nowrap tabular-nums">
                  {registeredUsers.length} Users
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </button>
          </div>
        )}

        {/* Account Management Actions */}
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowChangeEmailModal(true)}
            className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">Change Email Address</div>
                <div className="text-xs text-slate-500 truncate">
                  {currentUserEmail || 'Update login email via OTP verification'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <div className="p-4 sm:px-5 flex flex-col sm:flex-row gap-2.5 bg-slate-50/40">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out from Terminal</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteAccountModal(true)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Account (OTP Verified)</span>
            </button>
          </div>
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
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {supabaseStatus === 'connected'
                    ? `● Connected (${items.length} SKUs)`
                    : supabaseStatus === 'connecting'
                    ? 'Connecting…'
                    : 'Offline (Click Sync)'}
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

          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleResetDefaultSupabase}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-xs text-center"
            >
              Reset to Default Connection
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-colors text-center"
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
            {!confirmResetDemo ? (
              <button
                type="button"
                onClick={() => setConfirmResetDemo(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh All From Cloud</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl">
                <span className="text-xs font-semibold text-slate-700">Reload from cloud?</span>
                <button
                  type="button"
                  onClick={() => {
                    resetToDemoData();
                    setConfirmResetDemo(false);
                  }}
                  className="px-2.5 py-1 bg-blue-600 text-white text-[11px] font-bold rounded-lg"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetDemo(false)}
                  className="px-2 py-1 text-slate-600 text-[11px] font-semibold"
                >
                  Cancel
                </button>
              </div>
            )}

            {isAdmin &&
              (!confirmClearTx ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearTx(true)}
                  className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Transaction History</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1.5 rounded-xl border border-red-200">
                  <span className="text-xs font-semibold text-red-700">Clear local logs?</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearTransactions();
                      setConfirmClearTx(false);
                    }}
                    className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-bold rounded-lg"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearTx(false)}
                    className="px-2 py-1 text-red-700 text-[11px] font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Sign Out?</h3>
                <p className="text-xs text-slate-500">
                  You will return to the account sign-in screen.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  logout();
                }}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announcement Studio Modal (Admin) */}
      <AnnouncementStudioModal
        isOpen={showAnnouncementStudio}
        onClose={() => setShowAnnouncementStudio(false)}
      />

      {/* Staff & Admin Accounts Modal (Admin) */}
      <AdminUserManagementModal
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />

      {/* Change Email OTP Modal */}
      <ChangeEmailOtpModal
        isOpen={showChangeEmailModal}
        onClose={() => setShowChangeEmailModal(false)}
      />

      {/* Delete Account OTP Modal */}
      <DeleteAccountOtpModal
        isOpen={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
      />

      {showColorMachineModal && (
        <ColorMachineTintModal
          isOpen={showColorMachineModal}
          onClose={() => setShowColorMachineModal(false)}
        />
      )}
    </div>
  );
};
