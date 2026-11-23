import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Delete,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { isValidEmail } from '../services/authService';
import { OtpCodeBoxesInput, OtpCountdownBanner } from './OtpCodeBoxesInput';

export const AdminUserManagementModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const {
    registeredUsers,
    currentUserEmail,
    isAdmin,
    syncUserRolesFromCloud,
    upsertUserRole,
    removeUserRole,
    setUserAdminRole,
    showToast,
  } = useStock();

  const [newEmail, setNewEmail] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (isOpen && !isAdmin) {
      onClose();
    }
  }, [isOpen, isAdmin, onClose]);

  if (!isOpen || !isAdmin) return null;

  const adminCount = registeredUsers.filter((u) => u.isAdmin).length;
  const staffCount = registeredUsers.length - adminCount;

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    await syncUserRolesFromCloud(true);
    setIsSyncing(false);
  };

  const handleAddOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newEmail.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setErrorText('Enter a valid email address.');
      return;
    }
    await upsertUserRole(clean, newUserIsAdmin);
    setNewEmail('');
    setNewUserIsAdmin(false);
    setErrorText('');
    showToast(`Saved ${clean} as ${newUserIsAdmin ? 'Admin' : 'Staff'}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">
                Staff & Admin Accounts
              </h3>
              <p className="text-xs text-slate-500">
                Add emails, promote/demote roles, or remove access
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Role Count Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 border border-blue-200/70 p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900">Admins</span>
              <span className="text-base font-black text-blue-700 tabular-nums">{adminCount}</span>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Staff Operators</span>
              <span className="text-base font-black text-slate-900 tabular-nums">{staffCount}</span>
            </div>
          </div>

          {/* Add / Pre-register User Card */}
          <form
            onSubmit={handleAddOrUpdateUser}
            className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <UserPlus className="w-4 h-4 text-blue-600" />
              <span>Add / Pre-Register Account</span>
            </div>

            <div>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setErrorText('');
                }}
                placeholder="staff@hardware.com"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errorText && <p className="text-xs font-semibold text-rose-600 mt-1">{errorText}</p>}
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Grant Admin Access</span>
              </label>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors whitespace-nowrap"
              >
                Save Account
              </button>
            </div>
          </form>

          {/* Users List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Registered Accounts ({registeredUsers.length})
            </h4>

            {registeredUsers.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-500">
                  No accounts found yet. Click Sync or add one above.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white">
                {registeredUsers.map((user) => {
                  const isCurrentUser =
                    Boolean(currentUserEmail) &&
                    user.email.toLowerCase() === currentUserEmail!.toLowerCase();

                  return (
                    <div
                      key={user.email}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {user.email}
                          </span>
                          {isCurrentUser && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-200 text-slate-700 shrink-0">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                              user.isAdmin
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {user.isAdmin ? (
                              <ShieldCheck className="w-3 h-3" />
                            ) : (
                              <Shield className="w-3 h-3" />
                            )}
                            {user.isAdmin ? 'Admin' : 'Staff'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isCurrentUser}
                          onClick={async () => {
                            await setUserAdminRole(user.email, !user.isAdmin);
                            showToast(
                              `${user.email} set to ${!user.isAdmin ? 'Admin' : 'Staff'}`
                            );
                          }}
                          title={
                            isCurrentUser
                              ? 'Cannot change your own role'
                              : user.isAdmin
                              ? 'Demote to Staff'
                              : 'Promote to Admin'
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                            user.isAdmin
                              ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                              : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          {user.isAdmin ? 'Make Staff' : 'Make Admin'}
                        </button>

                        <button
                          type="button"
                          disabled={isCurrentUser}
                          onClick={async () => {
                            await removeUserRole(user.email);
                            showToast(`Removed ${user.email}`);
                          }}
                          title={
                            isCurrentUser
                              ? 'Use Delete Account to remove your own account'
                              : 'Remove User'
                          }
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChangeEmailOtpModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const {
    currentUserEmail,
    otpRemainingSeconds,
    resendCooldownSeconds,
    lockRemainingSeconds,
    requestChangeEmailOtp,
    confirmChangeEmailOtp,
    showToast,
  } = useStock();

  const isLocked = lockRemainingSeconds > 0;
  const [newEmail, setNewEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setNewEmail('');
      setOtpCode('');
      setOtpSent(false);
      setIsBusy(false);
      setErrorMsg('');
      setStatusMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendOtp = async () => {
    if (isBusy || resendCooldownSeconds > 0) return;
    setIsBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    const res = await requestChangeEmailOtp(newEmail);
    setIsBusy(false);
    if (res.ok) {
      setOtpSent(true);
      setStatusMsg(res.message || `OTP sent to ${newEmail.trim()}.`);
    } else {
      setErrorMsg(res.message || 'Could not request email change.');
    }
  };

  const handleConfirmOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isBusy || isLocked) return;
    setIsBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    const res = await confirmChangeEmailOtp(newEmail, otpCode);
    setIsBusy(false);
    if (res.ok) {
      showToast(res.message || 'Email address updated!');
      onClose();
    } else {
      setErrorMsg(res.message || 'Invalid or expired OTP code.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleConfirmOtp}
        className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Change Email Address</h3>
              <p className="text-xs text-slate-500">
                Current: {currentUserEmail || 'Not signed in'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            New Email Address
          </label>
          <input
            type="email"
            required
            disabled={isBusy || otpSent}
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setErrorMsg('');
            }}
            placeholder="newname@store.com"
            className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none disabled:opacity-60"
          />
        </div>

        {otpSent && (
          <div className="space-y-3">
            <OtpCountdownBanner secondsRemaining={otpRemainingSeconds} />
            <OtpCodeBoxesInput
              value={otpCode}
              onValueChange={(v) => {
                setOtpCode(v);
                setErrorMsg('');
              }}
              enabled={!isBusy}
              onCompleteSubmit={() => handleConfirmOtp()}
            />
            <button
              type="button"
              disabled={isBusy || resendCooldownSeconds > 0}
              onClick={handleSendOtp}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {resendCooldownSeconds > 0
                  ? `Resend in ${resendCooldownSeconds}s`
                  : 'Resend OTP Code'}
              </span>
            </button>
          </div>
        )}

        {statusMsg && (
          <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {statusMsg}
          </p>
        )}
        {errorMsg && (
          <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {errorMsg}
          </p>
        )}

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
          >
            Cancel
          </button>
          {!otpSent ? (
            <button
              type="button"
              disabled={isBusy || resendCooldownSeconds > 0}
              onClick={handleSendOtp}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-xl flex items-center justify-center gap-1.5"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {resendCooldownSeconds > 0
                  ? `Send OTP (${resendCooldownSeconds}s)`
                  : 'Send OTP'}
              </span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isBusy || isLocked}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-xl flex items-center justify-center gap-1.5"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isLocked ? `Locked (${lockRemainingSeconds}s)` : 'Verify & Update'}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export const DeleteAccountOtpModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const {
    currentUserEmail,
    otpRemainingSeconds,
    resendCooldownSeconds,
    lockRemainingSeconds,
    requestDeleteAccountOtp,
    confirmDeleteAccountWithOtp,
    showToast,
  } = useStock();

  const isLocked = lockRemainingSeconds > 0;
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setOtpCode('');
      setOtpSent(false);
      setIsBusy(false);
      setErrorMsg('');
      setStatusMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendDeleteOtp = async () => {
    if (isBusy || resendCooldownSeconds > 0) return;
    setIsBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    const res = await requestDeleteAccountOtp();
    setIsBusy(false);
    if (res.ok) {
      setOtpSent(true);
      setStatusMsg(res.message || 'Deletion confirmation OTP sent.');
    } else {
      setErrorMsg(res.message || 'Could not send deletion OTP.');
    }
  };

  const handleConfirmDelete = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isBusy || isLocked) return;
    setIsBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    const res = await confirmDeleteAccountWithOtp(otpCode);
    setIsBusy(false);
    if (res.ok) {
      showToast(res.message || 'Account permanently deleted.');
      onClose();
    } else {
      setErrorMsg(res.message || 'Invalid or expired OTP code.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleConfirmDelete}
        className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-rose-200 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-rose-700">Delete Account</h3>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 space-y-1">
          <p className="text-xs font-bold text-rose-800">
            {currentUserEmail || 'Signed-in account'}
          </p>
          <p className="text-xs text-rose-700 leading-relaxed">
            This permanently deletes your login credentials and role access. To confirm, verify with
            an OTP code sent to your email (expires in 5 minutes).
          </p>
        </div>

        {otpSent && (
          <div className="space-y-3">
            <OtpCountdownBanner secondsRemaining={otpRemainingSeconds} />
            <OtpCodeBoxesInput
              value={otpCode}
              onValueChange={(v) => {
                setOtpCode(v);
                setErrorMsg('');
              }}
              enabled={!isBusy}
              onCompleteSubmit={() => handleConfirmDelete()}
            />
            <button
              type="button"
              disabled={isBusy || resendCooldownSeconds > 0}
              onClick={handleSendDeleteOtp}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {resendCooldownSeconds > 0
                  ? `Resend in ${resendCooldownSeconds}s`
                  : 'Resend Deletion OTP'}
              </span>
            </button>
          </div>
        )}

        {statusMsg && (
          <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {statusMsg}
          </p>
        )}
        {errorMsg && (
          <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {errorMsg}
          </p>
        )}

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
          >
            Cancel
          </button>
          {!otpSent ? (
            <button
              type="button"
              disabled={isBusy || resendCooldownSeconds > 0}
              onClick={handleSendDeleteOtp}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 rounded-xl flex items-center justify-center gap-1.5"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {resendCooldownSeconds > 0
                  ? `Send OTP (${resendCooldownSeconds}s)`
                  : 'Send Confirmation OTP'}
              </span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isBusy || isLocked}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 rounded-xl flex items-center justify-center gap-1.5"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {isLocked ? `Locked (${lockRemainingSeconds}s)` : 'Confirm Permanent Delete'}
              </span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
