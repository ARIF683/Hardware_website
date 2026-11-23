import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  Loader2,
  Building2
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { authService, isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../services/authService';
import { OtpCodeBoxesInput, OtpCountdownBanner } from './OtpCodeBoxesInput';

type AuthMode = 'SIGN_IN' | 'CREATE_ACCOUNT';

export const AuthGateScreen: React.FC = () => {
  const {
    shopProfile,
    logoUrl,
    lockRemainingSeconds,
    otpRemainingSeconds,
    resendCooldownSeconds,
    pendingVerificationEmail,
    deepLinkMessage,
    deepLinkError,
    signInEmailPassword,
    signUpEmailPassword,
    verifySignupOtp,
    resendConfirmationEmail,
    requestPasswordResetOtp,
    verifyPasswordResetAndUpdate,
    clearPendingVerification,
    clearAuthStatusMessages,
  } = useStock();

  const isLocked = lockRemainingSeconds > 0;

  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    pendingVerificationEmail ? 'CREATE_ACCOUNT' : 'SIGN_IN'
  );
  const [email, setEmail] = useState<string>(() => authService.getLastSignedInEmail());
  const [password, setPassword] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [passwordVisible, setPasswordVisible] = useState<boolean>(false);

  // Forgot Password 2-step state
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [resetOtpSent, setResetOtpSent] = useState<boolean>(false);
  const [resetOtp, setResetOtp] = useState<string>('');
  const [resetNewPassword, setResetNewPassword] = useState<string>('');
  const [resetPasswordVisible, setResetPasswordVisible] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [logoImgError, setLogoImgError] = useState<boolean>(false);

  useEffect(() => {
    if (deepLinkMessage && deepLinkMessage.trim()) {
      setSuccessMessage(deepLinkMessage);
      setErrorMessage('');
      setAuthMode('SIGN_IN');
    }
    if (deepLinkError && deepLinkError.trim()) {
      setErrorMessage(deepLinkError);
      setSuccessMessage('');
    }
  }, [deepLinkMessage, deepLinkError]);

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      setErrorMessage(`Too many wrong attempts. Try again in ${lockRemainingSeconds}s.`);
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');
    clearAuthStatusMessages();

    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }

    if (authMode === 'SIGN_IN') {
      if (!password) {
        setErrorMessage('Enter your password.');
        return;
      }
      setIsChecking(true);
      const res = await signInEmailPassword(cleanEmail, password);
      setIsChecking(false);
      if (!res.ok) {
        setErrorMessage(res.message || 'Invalid credentials.');
        setPassword('');
      }
    } else {
      if (!isValidPassword(password)) {
        setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      setIsChecking(true);
      const res = await signUpEmailPassword(cleanEmail, password);
      setIsChecking(false);
      if (res.ok) {
        setOtpCode('');
        setSuccessMessage(
          res.message || 'OTP code sent to your email. Enter the 6-digit code below.'
        );
      } else {
        setErrorMessage(res.message || 'Could not create account.');
      }
    }
  };

  const handleVerifySignupOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLocked || isChecking) return;
    const targetEmail = (pendingVerificationEmail || email).trim();
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setErrorMessage('Enter the 6-digit OTP code sent to your email.');
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');
    setIsChecking(true);
    const res = await verifySignupOtp(targetEmail, otpCode);
    setIsChecking(false);
    if (!res.ok) {
      setErrorMessage(res.message || 'Invalid or expired OTP code.');
    } else if (res.message) {
      setSuccessMessage(res.message);
    }
  };

  const handleResendSignupOtp = async () => {
    if (isChecking || resendCooldownSeconds > 0) return;
    const targetEmail = (pendingVerificationEmail || email).trim();
    setErrorMessage('');
    setSuccessMessage('');
    setIsChecking(true);
    const res = await resendConfirmationEmail(targetEmail);
    setIsChecking(false);
    if (res.ok) {
      setSuccessMessage(res.message || 'New OTP code sent.');
    } else {
      setErrorMessage(res.message || 'Could not resend OTP code.');
    }
  };

  const handleSendResetOtp = async () => {
    if (isChecking || isLocked || resendCooldownSeconds > 0) return;
    setErrorMessage('');
    setSuccessMessage('');
    setIsChecking(true);
    const res = await requestPasswordResetOtp(email);
    setIsChecking(false);
    if (res.ok) {
      setResetOtpSent(true);
      setSuccessMessage(res.message || 'Password reset OTP sent to your email.');
    } else {
      setErrorMessage(res.message || 'Could not send reset OTP.');
    }
  };

  const handleVerifyResetPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isChecking || isLocked) return;
    setErrorMessage('');
    setSuccessMessage('');
    setIsChecking(true);
    const res = await verifyPasswordResetAndUpdate(email, resetOtp, resetNewPassword);
    setIsChecking(false);
    if (res.ok) {
      setShowForgotPassword(false);
      setResetOtpSent(false);
      setResetOtp('');
      setResetNewPassword('');
      setSuccessMessage(res.message || 'Password updated!');
    } else {
      setErrorMessage(res.message || 'Could not verify reset OTP.');
    }
  };

  const showOtpStep = authMode === 'CREATE_ACCOUNT' && Boolean(pendingVerificationEmail);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/90 space-y-5">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl mx-auto overflow-hidden border border-slate-200 bg-blue-50 flex items-center justify-center shadow-xs">
            {!logoImgError ? (
              <img
                src={logoUrl || shopProfile.logo || '/logos/ic_stock_logo.png'}
                alt={shopProfile.name}
                className="w-full h-full object-cover"
                onError={() => setLogoImgError(true)}
              />
            ) : (
              <Building2 className="w-8 h-8 text-blue-600" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {shopProfile.name || 'S.A.HARDWARE'}
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Sign in with your verified store account
            </p>
          </div>
        </div>

        {/* Auth Mode Tabs (hidden when completing forgot password) */}
        {!showForgotPassword && (
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200/70">
            <button
              type="button"
              disabled={isChecking}
              onClick={() => {
                setAuthMode('SIGN_IN');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                authMode === 'SIGN_IN'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              disabled={isChecking}
              onClick={() => {
                setAuthMode('CREATE_ACCOUNT');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                authMode === 'CREATE_ACCOUNT'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Lockout Alert Banner */}
        {isLocked && (
          <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">
              Account temporarily locked due to failed attempts. Retry in {lockRemainingSeconds}s.
            </span>
          </div>
        )}

        {/* Status / Success Banner */}
        {successMessage && (
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Branch 1: Forgot Password Flow */}
        {showForgotPassword ? (
          <form onSubmit={handleVerifyResetPassword} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <span>Reset Password via Email OTP</span>
              </div>
              <p className="text-xs text-slate-500">
                {resetOtpSent
                  ? 'Enter the 6-digit reset OTP sent to your email and set a new password.'
                  : 'Enter your registered email address to receive a 6-digit password reset code.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  disabled={isChecking || resetOtpSent}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="user@store.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            {!resetOtpSent ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isChecking || isLocked || resendCooldownSeconds > 0}
                  onClick={handleSendResetOtp}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  {isChecking && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {resendCooldownSeconds > 0
                      ? `Send Reset OTP (${resendCooldownSeconds}s)`
                      : 'Send Reset OTP'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                <OtpCountdownBanner secondsRemaining={otpRemainingSeconds} />

                <OtpCodeBoxesInput
                  value={resetOtp}
                  onValueChange={(v) => {
                    setResetOtp(v);
                    setErrorMessage('');
                  }}
                  label="Reset OTP Code (6-digit)"
                  enabled={!isChecking && !isLocked}
                />

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password (min {MIN_PASSWORD_LENGTH} chars)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={resetPasswordVisible ? 'text' : 'password'}
                      required
                      disabled={isChecking || isLocked}
                      value={resetNewPassword}
                      onChange={(e) => {
                        setResetNewPassword(e.target.value);
                        setErrorMessage('');
                      }}
                      placeholder="Enter new password"
                      className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setResetPasswordVisible(!resetPasswordVisible)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {resetPasswordVisible ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isChecking || isLocked}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  {isChecking && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {isLocked
                      ? `Locked (${lockRemainingSeconds}s)`
                      : 'Update Password & Sign In'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isChecking || resendCooldownSeconds > 0}
                  onClick={handleSendResetOtp}
                  className="w-full py-2.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {resendCooldownSeconds > 0
                      ? `Resend Reset OTP in ${resendCooldownSeconds}s`
                      : 'Resend Reset OTP'}
                  </span>
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={isChecking}
              onClick={() => {
                setShowForgotPassword(false);
                setResetOtpSent(false);
                setResetOtp('');
                setResetNewPassword('');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className="w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Back to Sign In
            </button>
          </form>
        ) : showOtpStep ? (
          /* Branch 2: Sign-up Pending Email Verification OTP */
          <form onSubmit={handleVerifySignupOtp} className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-3 text-xs text-blue-900">
              <MailCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Verify {pendingVerificationEmail}</p>
                <p className="text-blue-700 mt-0.5">
                  Enter the 6-digit OTP code from your email inbox to activate your account.
                </p>
              </div>
            </div>

            <OtpCountdownBanner secondsRemaining={otpRemainingSeconds} />

            <OtpCodeBoxesInput
              value={otpCode}
              onValueChange={(v) => {
                setOtpCode(v);
                setErrorMessage('');
              }}
              enabled={!isChecking && !isLocked}
              onCompleteSubmit={() => handleVerifySignupOtp()}
            />

            <button
              type="submit"
              disabled={isChecking || isLocked}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              {isChecking && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isLocked ? `Locked (${lockRemainingSeconds}s)` : 'Verify OTP & Enter'}
              </span>
            </button>

            <button
              type="button"
              disabled={isChecking || resendCooldownSeconds > 0}
              onClick={handleResendSignupOtp}
              className="w-full py-2.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {resendCooldownSeconds > 0
                  ? `Resend OTP in ${resendCooldownSeconds}s`
                  : 'Resend OTP Code'}
              </span>
            </button>

            <button
              type="button"
              disabled={isChecking}
              onClick={() => {
                setOtpCode('');
                clearPendingVerification();
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Use a different email
            </button>
          </form>
        ) : (
          /* Branch 3: Standard Sign In / Create Account Form */
          <form onSubmit={handleSubmitAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  disabled={isLocked || isChecking}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="user@store.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none disabled:opacity-60"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  {authMode === 'SIGN_IN'
                    ? 'Password'
                    : `Create Password (min ${MIN_PASSWORD_LENGTH} chars)`}
                </label>
                {authMode === 'SIGN_IN' && (
                  <button
                    type="button"
                    disabled={isChecking}
                    onClick={() => {
                      setShowForgotPassword(true);
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  required
                  disabled={isLocked || isChecking}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLocked || isChecking}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              {isChecking && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isLocked
                  ? `Locked (${lockRemainingSeconds}s)`
                  : authMode === 'SIGN_IN'
                  ? 'Sign In'
                  : 'Create Account'}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
