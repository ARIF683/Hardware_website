import { UserAccount } from '../types';
import {
  cleanSupabaseUrl,
  isValidCustomSupabaseUrl,
  SUPABASE_KEY,
  SUPABASE_URL,
} from './supabaseService';

export const MAX_AUTH_TRIES = 5;
export const MIN_PASSWORD_LENGTH = 8;
export const OTP_EXPIRY_SECONDS = 300;
export const OTP_EXPIRY_MS = 300_000;
export const RESEND_COOLDOWN_SECONDS = 60;
export const RESEND_COOLDOWN_MS = 60_000;

const EMAIL_REGEX = /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Stored session token keys (kept in sessionStorage only — never isAuthed/isAdmin trust flags)
const KEY_ACCESS_TOKEN = 'hardware_auth_access_token';
const KEY_REFRESH_TOKEN = 'hardware_auth_refresh_token';
const KEY_FAILS = 'hardware_auth_login_fails';
const KEY_LOCK_UNTIL = 'hardware_auth_lock_until';
const KEY_LOCK_STRIKES = 'hardware_auth_lock_strikes';
const KEY_OTP_EXPIRES_AT = 'hardware_auth_otp_expires_at';
const KEY_RESEND_AVAILABLE_AT = 'hardware_auth_resend_available_at';
const KEY_ROLES_UPDATED_AT = 'hardware_auth_roles_updated_at';
const KEY_PENDING_SIGNUP_EMAIL = 'hardware_auth_pending_signup_email';
const KEY_LAST_EMAIL = 'hardware_auth_last_signed_in_email';

// Allow-listed non-sensitive key preserved across explicit logout (removed on account deletion)
const LOGOUT_KEY_ALLOWLIST = new Set<string>([KEY_LAST_EMAIL]);

export interface AuthStateSnapshot {
  isAuthed: boolean;
  isVerifyingSession: boolean;
  isAdmin: boolean;
  currentUserEmail: string | null;
  pendingVerificationEmail: string | null;
  registeredUsers: UserAccount[];
  lockRemainingSeconds: number;
  otpRemainingSeconds: number;
  resendCooldownSeconds: number;
  deepLinkMessage: string | null;
  deepLinkError: string | null;
}

export interface AuthActionResult {
  ok: boolean;
  message?: string;
}

function getStorageString(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch (e) {
    console.warn(`Storage read warning (${key}):`, e);
    return '';
  }
}

function setStorageString(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {
    console.warn(`Storage write warning (${key}):`, e);
  }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`Storage remove warning (${key}):`, e);
  }
}

function getSessionTokenString(key: string): string {
  try {
    return sessionStorage.getItem(key) || '';
  } catch (e) {
    console.warn(`SessionStorage read warning (${key}):`, e);
    return '';
  }
}

function setSessionTokenString(key: string, val: string) {
  try {
    sessionStorage.setItem(key, val);
  } catch (e) {
    console.warn(`SessionStorage write warning (${key}):`, e);
  }
}

function removeSessionToken(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch (e) {
    console.warn(`SessionStorage remove warning (${key}):`, e);
  }
}

function getStorageNum(key: string, fallback = 0): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch (e) {
    console.warn(`Storage number read warning (${key}):`, e);
    return fallback;
  }
}

function setStorageNum(key: string, val: number) {
  try {
    localStorage.setItem(key, String(val));
  } catch (e) {
    console.warn(`Storage number write warning (${key}):`, e);
  }
}

export function clearHardwareWebStorage(keepLastEmail = true) {
  const clearStore = (store: Storage | undefined) => {
    if (!store) return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k) continue;
        if (k.startsWith('hardware_')) {
          if (keepLastEmail && LOGOUT_KEY_ALLOWLIST.has(k)) continue;
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => store.removeItem(k));
    } catch (e) {
      console.warn('Could not clear hardware storage keys:', e);
    }
  };
  if (typeof localStorage !== 'undefined') clearStore(localStorage);
  if (typeof sessionStorage !== 'undefined') clearStore(sessionStorage);
}

function getSupabaseCredentials(): { baseUrl: string; apiKey: string } {
  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
      ? String(import.meta.env.VITE_SUPABASE_URL)
      : '';
  const envKey =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY
      ? String(import.meta.env.VITE_SUPABASE_ANON_KEY)
      : '';

  let customUrl = '';
  let customKey = '';
  if (isDev) {
    const candidateCustom = getStorageString('hardware_supabase_url');
    if (candidateCustom && isValidCustomSupabaseUrl(candidateCustom)) {
      customUrl = candidateCustom;
      customKey = getStorageString('hardware_supabase_key');
    }
  }

  const baseUrl = cleanSupabaseUrl(customUrl || envUrl || SUPABASE_URL);
  const candidateKey = (customKey || envKey || SUPABASE_KEY)
    .trim()
    .replace(/[\r\n\t]/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
  const apiKey = candidateKey.length > 10 ? candidateKey : SUPABASE_KEY;
  return { baseUrl, apiKey };
}

export function isValidEmail(email: string): boolean {
  const clean = (email || '').trim();
  return (
    clean.length >= 5 &&
    clean.length <= 254 &&
    !/[\s\u0000-\u001F\u007F]/.test(clean) &&
    EMAIL_REGEX.test(clean)
  );
}

export function isValidPassword(password: string): boolean {
  return (password || '').length >= MIN_PASSWORD_LENGTH;
}

export function formatOtpCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function extractSupabaseError(rawBody: string, fallbackCode: number): string {
  try {
    const obj = JSON.parse(rawBody);
    const candidate = obj?.error_description || obj?.msg || obj?.message || obj?.error;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    return `HTTP ${fallbackCode}`;
  } catch (e) {
    console.warn('Error body parse fallback:', e);
    return rawBody.trim() || `HTTP ${fallbackCode}`;
  }
}

function friendlySupabaseError(rawBody: string, fallbackCode: number): string {
  const extracted = extractSupabaseError(rawBody, fallbackCode);
  if (extracted.toLowerCase().includes('email not confirmed')) {
    return 'Your email is not verified yet. Open your inbox and confirm your email first.';
  }
  return extracted;
}

function isEmailConfirmed(userObj: any): boolean {
  if (!userObj || typeof userObj !== 'object') return false;
  const emailConfirmed = String(userObj.email_confirmed_at || '').trim();
  const confirmedAt = String(userObj.confirmed_at || '').trim();
  return (
    (emailConfirmed.length > 0 && emailConfirmed !== 'null') ||
    (confirmedAt.length > 0 && confirmedAt !== 'null')
  );
}

// Role authority strictly checks app_metadata (never user_metadata)
function isMetadataAdmin(userObj: any): boolean {
  if (!userObj || typeof userObj !== 'object') return false;
  const appMeta = userObj.app_metadata;
  if (!appMeta || typeof appMeta !== 'object') return false;
  return (
    appMeta.is_admin === true ||
    String(appMeta.role || '').toLowerCase() === 'admin'
  );
}

export function parseUsersJson(rawJson: string): UserAccount[] {
  try {
    const arr = JSON.parse(rawJson);
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: UserAccount[] = [];
    for (const obj of arr) {
      if (!obj || typeof obj !== 'object') continue;
      const email = String(obj.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const isAdmin =
        obj.is_admin !== undefined ? Boolean(obj.is_admin) : Boolean(obj.isAdmin);
      out.push({ email, isAdmin });
    }
    return out;
  } catch (e) {
    console.warn('Failed parsing users JSON:', e);
    return [];
  }
}

export function serializeUsers(list: UserAccount[]): string {
  return JSON.stringify(
    list.map((u) => ({
      email: u.email.trim().toLowerCase(),
      isAdmin: Boolean(u.isAdmin),
    }))
  );
}

class AuthService {
  private state: AuthStateSnapshot;
  private listeners = new Set<(snapshot: AuthStateSnapshot) => void>();
  private inMemoryAccessToken = '';
  private inMemoryRefreshToken = '';
  private loginFails = 0;
  private lockUntil = 0;
  private otpExpiresAt = 0;
  private resendAvailableAt = 0;
  private lockInterval: ReturnType<typeof setInterval> | null = null;
  private otpInterval: ReturnType<typeof setInterval> | null = null;
  private resendInterval: ReturnType<typeof setInterval> | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  public onRolesChangedListener: ((rolesJson: string, updatedAt: number) => void) | null = null;
  public onTokenRefreshedListener: (() => void) | null = null;
  public onSignedOutListener: (() => void) | null = null;

  constructor() {
    // Purge legacy spoofable localStorage trust flags if present from older versions
    removeStorage('hardware_auth_is_authed');
    removeStorage('hardware_auth_is_admin');
    removeStorage('hardware_auth_current_user_email');
    removeStorage('hardware_auth_registered_users');
    removeStorage(KEY_ACCESS_TOKEN);
    removeStorage(KEY_REFRESH_TOKEN);

    const existingAccess = getSessionTokenString(KEY_ACCESS_TOKEN);
    const existingRefresh = getSessionTokenString(KEY_REFRESH_TOKEN);
    this.inMemoryAccessToken = existingAccess;
    this.inMemoryRefreshToken = existingRefresh;

    const pendingEmail = getStorageString(KEY_PENDING_SIGNUP_EMAIL).trim().toLowerCase() || null;

    this.loginFails = getStorageNum(KEY_FAILS, 0);
    this.lockUntil = getStorageNum(KEY_LOCK_UNTIL, 0);
    this.otpExpiresAt = getStorageNum(KEY_OTP_EXPIRES_AT, 0);
    this.resendAvailableAt = getStorageNum(KEY_RESEND_AVAILABLE_AT, 0);

    const now = Date.now();
    if (this.lockUntil <= now) {
      this.lockUntil = 0;
      this.loginFails = 0;
      removeStorage(KEY_LOCK_UNTIL);
      removeStorage(KEY_FAILS);
    }
    if (this.otpExpiresAt <= now) {
      this.otpExpiresAt = 0;
      removeStorage(KEY_OTP_EXPIRES_AT);
    }
    if (this.resendAvailableAt <= now) {
      this.resendAvailableAt = 0;
      removeStorage(KEY_RESEND_AVAILABLE_AT);
    }

    const hasCandidateSession = Boolean(existingAccess || existingRefresh);

    // SECURITY: Always start unauthenticated & non-admin until /auth/v1/user confirms the token
    this.state = {
      isAuthed: false,
      isVerifyingSession: hasCandidateSession,
      isAdmin: false,
      currentUserEmail: null,
      pendingVerificationEmail: pendingEmail,
      registeredUsers: [],
      lockRemainingSeconds: this.getRemainingLockSeconds(),
      otpRemainingSeconds: this.getRemainingOtpSeconds(),
      resendCooldownSeconds: this.getRemainingResendSeconds(),
      deepLinkMessage: null,
      deepLinkError: null,
    };

    if (this.lockUntil > now) this.startLockCountdown();
    if (this.otpExpiresAt > now) this.startOtpCountdown();
    if (this.resendAvailableAt > now) this.startResendCountdown();

    if (hasCandidateSession) {
      void this.bootstrapSession();
    }
  }

  public getSnapshot(): AuthStateSnapshot {
    return this.state;
  }

  public subscribe(listener: (snapshot: AuthStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(patch?: Partial<AuthStateSnapshot>) {
    if (patch) {
      this.state = { ...this.state, ...patch };
    } else {
      this.state = { ...this.state };
    }
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public activeAccessToken(): string {
    return this.inMemoryAccessToken || getSessionTokenString(KEY_ACCESS_TOKEN);
  }

  public activeRefreshToken(): string {
    return this.inMemoryRefreshToken || getSessionTokenString(KEY_REFRESH_TOKEN);
  }

  private saveSessionTokens(accessToken: string, refreshToken: string) {
    if (accessToken) {
      this.inMemoryAccessToken = accessToken;
      setSessionTokenString(KEY_ACCESS_TOKEN, accessToken);
    }
    if (refreshToken) {
      this.inMemoryRefreshToken = refreshToken;
      setSessionTokenString(KEY_REFRESH_TOKEN, refreshToken);
    }
    this.onTokenRefreshedListener?.();
  }

  private clearSessionTokens() {
    this.inMemoryAccessToken = '';
    this.inMemoryRefreshToken = '';
    removeSessionToken(KEY_ACCESS_TOKEN);
    removeSessionToken(KEY_REFRESH_TOKEN);
    removeStorage(KEY_ACCESS_TOKEN);
    removeStorage(KEY_REFRESH_TOKEN);
  }

  public isSupabaseConfigured(): boolean {
    const { baseUrl, apiKey } = getSupabaseCredentials();
    const isHttpsOrLocal =
      baseUrl.startsWith('https://') ||
      baseUrl.startsWith('http://localhost') ||
      baseUrl.startsWith('http://127.0.0.1');
    return (
      isHttpsOrLocal &&
      apiKey.length > 0 &&
      !baseUrl.includes('YOUR_SUPABASE') &&
      !apiKey.includes('YOUR_SUPABASE')
    );
  }

  // Strictly returns user bearer token — NEVER falls back to anon key
  private activeAuthHeader(): string | null {
    const token = this.activeAccessToken();
    return token ? `Bearer ${token}` : null;
  }

  // Validate session on page load strictly against /auth/v1/user and app_users
  public async bootstrapSession(): Promise<boolean> {
    this.emit({ isVerifyingSession: true });
    try {
      if (!this.isSupabaseConfigured()) {
        this.clearSessionTokens();
        this.emit({
          isAuthed: false,
          isAdmin: false,
          currentUserEmail: null,
          isVerifyingSession: false,
        });
        return false;
      }

      let token = this.activeAccessToken();
      if (!token && this.activeRefreshToken()) {
        await this.refreshSession();
        token = this.activeAccessToken();
      }
      if (!token) {
        this.clearSessionTokens();
        this.emit({
          isAuthed: false,
          isAdmin: false,
          currentUserEmail: null,
          isVerifyingSession: false,
        });
        return false;
      }

      const { baseUrl, apiKey } = getSupabaseCredentials();
      const fetchUser = async (bearer: string) =>
        fetch(`${baseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${bearer}`,
          },
        });

      let resp = await fetchUser(token);
      if (resp.status === 401 && (await this.refreshSession())) {
        token = this.activeAccessToken();
        if (token) resp = await fetchUser(token);
      }

      if (!resp.ok) {
        this.forceSessionExpiredSignOut('Your session has expired. Please sign in again.');
        return false;
      }

      const userObj = await resp.json().catch(() => null);
      const verifiedEmail = String(userObj?.email || '').trim().toLowerCase();
      if (!verifiedEmail) {
        this.forceSessionExpiredSignOut('Could not verify your account session.');
        return false;
      }

      const metadataAdmin = isMetadataAdmin(userObj);
      const remoteUsers = await this.fetchRemoteAppUsers(token);
      const usersList = remoteUsers || [{ email: verifiedEmail, isAdmin: metadataAdmin }];
      const matched = usersList.find((u) => u.email.toLowerCase() === verifiedEmail);
      const resolvedAdmin = Boolean(matched?.isAdmin) || metadataAdmin;

      this.setUsersInMemory(usersList, Date.now(), false);
      setStorageString(KEY_LAST_EMAIL, verifiedEmail);
      this.emit({
        isAuthed: true,
        isAdmin: resolvedAdmin,
        currentUserEmail: verifiedEmail,
        isVerifyingSession: false,
      });
      return true;
    } catch (e) {
      console.warn('Session verification check failed:', e);
      this.clearSessionTokens();
      this.emit({
        isAuthed: false,
        isAdmin: false,
        currentUserEmail: null,
        isVerifyingSession: false,
      });
      return false;
    }
  }

  // --- Timers ---

  public isLocked(): boolean {
    return Date.now() < this.lockUntil;
  }

  public getRemainingLockSeconds(): number {
    const diff = this.lockUntil - Date.now();
    return diff > 0 ? Math.ceil(diff / 1000) : 0;
  }

  private getRemainingOtpSeconds(): number {
    const diff = this.otpExpiresAt - Date.now();
    return diff > 0 ? Math.ceil(diff / 1000) : 0;
  }

  private getRemainingResendSeconds(): number {
    const diff = this.resendAvailableAt - Date.now();
    return diff > 0 ? Math.ceil(diff / 1000) : 0;
  }

  private isCurrentOtpExpired(): boolean {
    return this.otpExpiresAt > 0 && Date.now() > this.otpExpiresAt;
  }

  private startOtpExpiryTimer(durationMs = OTP_EXPIRY_MS) {
    this.otpExpiresAt = Date.now() + durationMs;
    setStorageNum(KEY_OTP_EXPIRES_AT, this.otpExpiresAt);
    this.startOtpCountdown();
  }

  private clearOtpTimer() {
    if (this.otpInterval) clearInterval(this.otpInterval);
    this.otpInterval = null;
    this.otpExpiresAt = 0;
    removeStorage(KEY_OTP_EXPIRES_AT);
    this.emit({ otpRemainingSeconds: 0 });
  }

  private startOtpCountdown() {
    if (this.otpInterval) clearInterval(this.otpInterval);
    this.emit({ otpRemainingSeconds: this.getRemainingOtpSeconds() });
    this.otpInterval = setInterval(() => {
      const rem = this.getRemainingOtpSeconds();
      this.emit({ otpRemainingSeconds: rem });
      if (rem <= 0 && this.otpInterval) {
        clearInterval(this.otpInterval);
        this.otpInterval = null;
      }
    }, 500);
  }

  private startResendCooldown(durationMs = RESEND_COOLDOWN_MS) {
    this.resendAvailableAt = Date.now() + durationMs;
    setStorageNum(KEY_RESEND_AVAILABLE_AT, this.resendAvailableAt);
    this.startResendCountdown();
  }

  private clearResendCooldown() {
    if (this.resendInterval) clearInterval(this.resendInterval);
    this.resendInterval = null;
    this.resendAvailableAt = 0;
    removeStorage(KEY_RESEND_AVAILABLE_AT);
    this.emit({ resendCooldownSeconds: 0 });
  }

  private startResendCountdown() {
    if (this.resendInterval) clearInterval(this.resendInterval);
    this.emit({ resendCooldownSeconds: this.getRemainingResendSeconds() });
    this.resendInterval = setInterval(() => {
      const rem = this.getRemainingResendSeconds();
      this.emit({ resendCooldownSeconds: rem });
      if (rem <= 0) {
        if (this.resendInterval) clearInterval(this.resendInterval);
        this.resendInterval = null;
        this.resendAvailableAt = 0;
        removeStorage(KEY_RESEND_AVAILABLE_AT);
      }
    }, 500);
  }

  private startLockCountdown() {
    if (this.lockInterval) clearInterval(this.lockInterval);
    this.emit({ lockRemainingSeconds: this.getRemainingLockSeconds() });
    this.lockInterval = setInterval(() => {
      const rem = this.getRemainingLockSeconds();
      this.emit({ lockRemainingSeconds: rem });
      if (rem <= 0) {
        if (this.lockInterval) clearInterval(this.lockInterval);
        this.lockInterval = null;
        this.lockUntil = 0;
        this.loginFails = 0;
        removeStorage(KEY_LOCK_UNTIL);
        removeStorage(KEY_FAILS);
      }
    }, 500);
  }

  private recordFailedAuthAttempt(): string {
    this.loginFails += 1;
    if (this.loginFails >= MAX_AUTH_TRIES) {
      const strikes = Math.min(5, getStorageNum(KEY_LOCK_STRIKES, 0) + 1);
      const lockDurationMs = strikes === 1 ? 60_000 : strikes === 2 ? 180_000 : 300_000;
      this.lockUntil = Date.now() + lockDurationMs;
      this.loginFails = 0;
      setStorageNum(KEY_FAILS, 0);
      setStorageNum(KEY_LOCK_STRIKES, strikes);
      setStorageNum(KEY_LOCK_UNTIL, this.lockUntil);
      this.startLockCountdown();
      const secs = Math.round(lockDurationMs / 1000);
      return `Too many failed attempts. Locked for ${secs}s.`;
    } else {
      setStorageNum(KEY_FAILS, this.loginFails);
      const left = MAX_AUTH_TRIES - this.loginFails;
      const word = left === 1 ? 'attempt' : 'attempts';
      return `${left} ${word} left before temporary lockout.`;
    }
  }

  private resetAuthFailures() {
    if (this.lockInterval) clearInterval(this.lockInterval);
    this.lockInterval = null;
    this.loginFails = 0;
    this.lockUntil = 0;
    removeStorage(KEY_FAILS);
    removeStorage(KEY_LOCK_UNTIL);
    removeStorage(KEY_LOCK_STRIKES);
    this.emit({ lockRemainingSeconds: 0 });
  }

  public getLastSignedInEmail(): string {
    return getStorageString(KEY_LAST_EMAIL);
  }

  public clearPendingVerification() {
    this.clearOtpTimer();
    removeStorage(KEY_PENDING_SIGNUP_EMAIL);
    this.emit({ pendingVerificationEmail: null });
  }

  public clearDeepLinkStatus() {
    this.emit({ deepLinkMessage: null, deepLinkError: null });
  }

  private setPendingVerificationEmail(email: string) {
    const clean = email.trim().toLowerCase();
    setStorageString(KEY_PENDING_SIGNUP_EMAIL, clean);
    this.emit({ pendingVerificationEmail: clean });
  }

  // Keeps role list in JS memory only (never trusted from localStorage)
  private setUsersInMemory(list: UserAccount[], updatedAt = Date.now(), syncAdminHint = true) {
    const seen = new Set<string>();
    const cleanList: UserAccount[] = [];
    for (const u of list) {
      const email = u.email.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      cleanList.push({ email, isAdmin: Boolean(u.isAdmin) });
    }
    setStorageNum(KEY_ROLES_UPDATED_AT, updatedAt);

    let nextAdmin = this.state.isAdmin;
    const activeEmail = this.state.currentUserEmail;
    if (syncAdminHint && this.state.isAuthed && activeEmail) {
      const matched = cleanList.find((u) => u.email.toLowerCase() === activeEmail.toLowerCase());
      if (matched) {
        nextAdmin = matched.isAdmin;
      }
    }
    this.emit({ registeredUsers: cleanList, isAdmin: nextAdmin });
  }

  public getUserRolesJsonOrNull(): string | null {
    if (this.state.registeredUsers.length === 0) return null;
    return serializeUsers(this.state.registeredUsers);
  }

  public applyRemoteUserRoles(remoteRolesJson: string | null | undefined, remoteUpdatedAt: number) {
    if (!this.state.isAuthed) return;
    if (!remoteRolesJson || !remoteRolesJson.trim()) return;
    const localUpdatedAt = getStorageNum(KEY_ROLES_UPDATED_AT, 0);
    if (
      this.state.registeredUsers.length > 0 &&
      localUpdatedAt > 0 &&
      remoteUpdatedAt > 0 &&
      remoteUpdatedAt < localUpdatedAt
    ) {
      return;
    }
    const parsed = parseUsersJson(remoteRolesJson);
    if (parsed.length > 0) {
      this.setUsersInMemory(parsed, remoteUpdatedAt > 0 ? remoteUpdatedAt : Date.now(), true);
    }
  }

  // --- Remote app_users REST helpers (strictly user-authenticated, zero anon fallback) ---

  private async fetchRemoteAppUsers(overrideToken?: string): Promise<UserAccount[] | null> {
    if (!this.isSupabaseConfigured()) return null;
    const authHeader = overrideToken ? `Bearer ${overrideToken}` : this.activeAuthHeader();
    if (!authHeader) return null;

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/rest/v1/app_users?select=email,is_admin&order=email.asc`, {
        method: 'GET',
        headers: {
          apikey: apiKey,
          Authorization: authHeader,
        },
      });
      if (!resp.ok) return null;
      const body = await resp.text();
      return parseUsersJson(body);
    } catch (e) {
      console.warn('Failed fetching remote app_users:', e);
      return null;
    }
  }

  private async pushRemoteUserUpsert(
    email: string,
    isAdmin: boolean,
    overrideToken?: string
  ): Promise<boolean> {
    if (!this.isSupabaseConfigured()) return false;
    const authHeader = overrideToken ? `Bearer ${overrideToken}` : this.activeAuthHeader();
    if (!authHeader) return false;

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/rest/v1/app_users?on_conflict=email`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          is_admin: isAdmin,
        }),
      });
      return resp.ok;
    } catch (e) {
      console.warn('Failed upserting remote app_user:', e);
      return false;
    }
  }

  private async pushRemoteUserDelete(email: string): Promise<boolean> {
    if (!this.isSupabaseConfigured()) return false;
    const authHeader = this.activeAuthHeader();
    if (!authHeader) return false;

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
      const resp = await fetch(`${baseUrl}/rest/v1/app_users?email=eq.${encodedEmail}`, {
        method: 'DELETE',
        headers: {
          apikey: apiKey,
          Authorization: authHeader,
        },
      });
      return resp.ok;
    } catch (e) {
      console.warn('Failed deleting remote app_user:', e);
      return false;
    }
  }

  public async upsertUser(email: string, isAdmin: boolean) {
    if (!this.state.isAuthed || !this.state.isAdmin) return;
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) return;
    const ok = await this.pushRemoteUserUpsert(clean, isAdmin);
    if (!ok) {
      throw new Error('Could not update user role on database (check admin permissions).');
    }
    const current = [...this.state.registeredUsers];
    const idx = current.findIndex((u) => u.email.toLowerCase() === clean);
    if (idx >= 0) {
      current[idx] = { email: clean, isAdmin };
    } else {
      current.push({ email: clean, isAdmin });
    }
    const now = Date.now();
    this.setUsersInMemory(current, now, true);
    this.onRolesChangedListener?.(serializeUsers(current), now);
  }

  public async removeUser(email: string) {
    if (!this.state.isAuthed || !this.state.isAdmin) return;
    const clean = email.trim().toLowerCase();
    const ok = await this.pushRemoteUserDelete(clean);
    if (!ok) {
      throw new Error('Could not remove user from database (check admin permissions).');
    }
    const current = this.state.registeredUsers.filter((u) => u.email.toLowerCase() !== clean);
    const now = Date.now();
    this.setUsersInMemory(current, now, true);
    this.onRolesChangedListener?.(serializeUsers(current), now);
  }

  public async setUserAdminRole(email: string, isAdmin: boolean) {
    if (!this.state.isAuthed || !this.state.isAdmin) return;
    await this.upsertUser(email, isAdmin);
  }

  public async syncUsersFromCloud(): Promise<boolean> {
    if (!this.state.isAuthed) return false;
    const remoteUsers = await this.fetchRemoteAppUsers();
    if (!remoteUsers) return false;
    this.setUsersInMemory(remoteUsers, Date.now(), true);
    return true;
  }

  public async refreshSession(): Promise<boolean> {
    if (!this.isSupabaseConfigured()) return false;
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const currentRefresh = this.activeRefreshToken();
      if (!currentRefresh) return false;
      try {
        const { baseUrl, apiKey } = getSupabaseCredentials();
        const resp = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: currentRefresh }),
        });
        const body = await resp.text();
        if (resp.ok) {
          let obj: any = null;
          try {
            obj = JSON.parse(body);
          } catch (e) {
            console.warn('Refresh response parse notice:', e);
          }
          const newAccess = String(obj?.access_token || '');
          const newRefresh = String(obj?.refresh_token || '') || currentRefresh;
          if (newAccess) {
            this.saveSessionTokens(newAccess, newRefresh);
            if (obj?.user && isMetadataAdmin(obj.user) && !this.state.isAdmin) {
              this.emit({ isAdmin: true });
            }
            return true;
          }
          return false;
        }
        if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
          this.forceSessionExpiredSignOut('Your session has expired. Please sign in again.');
          return false;
        }
        return false;
      } catch (e) {
        console.warn('Session refresh network notice:', e);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  public async refreshCurrentUserRole(): Promise<boolean> {
    if (!this.state.isAuthed) return false;
    const activeEmail = this.state.currentUserEmail?.trim().toLowerCase();
    if (!activeEmail) return false;

    let metadataAdmin = false;
    let token = this.activeAccessToken();
    let sessionRevoked = false;

    if (this.isSupabaseConfigured() && token) {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const fetchUserInfo = async (bearer: string): Promise<{ code: number; userObj: any }> => {
        try {
          const resp = await fetch(`${baseUrl}/auth/v1/user`, {
            method: 'GET',
            headers: {
              apikey: apiKey,
              Authorization: `Bearer ${bearer}`,
            },
          });
          let userObj: any = null;
          if (resp.ok) {
            try {
              userObj = await resp.json();
            } catch (e) {
              console.warn('User info JSON parse notice:', e);
            }
          }
          return { code: resp.status, userObj };
        } catch (e) {
          console.warn('User info fetch notice:', e);
          return { code: -1, userObj: null };
        }
      };

      let { code, userObj } = await fetchUserInfo(token);
      if (code === 401 && (await this.refreshSession())) {
        token = this.activeAccessToken();
        if (token) {
          const retried = await fetchUserInfo(token);
          code = retried.code;
          userObj = retried.userObj;
        }
      }

      if (code >= 200 && code <= 299) {
        metadataAdmin = isMetadataAdmin(userObj);
      } else if (code === 401 || code === 403 || code === 404) {
        sessionRevoked = true;
      }
    } else if (!token) {
      sessionRevoked = true;
    }

    if (sessionRevoked) {
      this.forceSessionExpiredSignOut(
        'Your session expired or this account is no longer active. Please sign in again.'
      );
      return false;
    }

    const remoteUsers = await this.fetchRemoteAppUsers(token);
    if (remoteUsers) {
      this.setUsersInMemory(remoteUsers, Date.now(), false);
      const matched = remoteUsers.find((u) => u.email.toLowerCase() === activeEmail);
      const resolvedAdmin = Boolean(matched?.isAdmin) || metadataAdmin;
      this.emit({ isAdmin: resolvedAdmin });
      return resolvedAdmin;
    } else {
      const resolvedAdmin = metadataAdmin;
      this.emit({ isAdmin: resolvedAdmin });
      return resolvedAdmin;
    }
  }

  private async resolveAndCompleteSession(
    email: string,
    accessToken: string,
    refreshToken = '',
    metadataIsAdmin = false
  ) {
    const clean = email.trim().toLowerCase();
    const remoteUsers = await this.fetchRemoteAppUsers(accessToken);

    let resolvedAdmin = false;
    let updatedUsers: UserAccount[];

    if (remoteUsers) {
      const remoteMatch = remoteUsers.find((u) => u.email.toLowerCase() === clean);
      resolvedAdmin = Boolean(remoteMatch?.isAdmin) || metadataIsAdmin;
      if (!remoteMatch) {
        await this.pushRemoteUserUpsert(clean, metadataIsAdmin, accessToken);
        updatedUsers = [...remoteUsers, { email: clean, isAdmin: resolvedAdmin }];
      } else if (metadataIsAdmin && !remoteMatch.isAdmin) {
        await this.pushRemoteUserUpsert(clean, true, accessToken);
        updatedUsers = remoteUsers.map((u) =>
          u.email.toLowerCase() === clean ? { email: clean, isAdmin: true } : u
        );
      } else {
        updatedUsers = remoteUsers;
      }
    } else {
      resolvedAdmin = metadataIsAdmin;
      updatedUsers = [{ email: clean, isAdmin: resolvedAdmin }];
    }

    this.saveSessionTokens(accessToken, refreshToken);
    setStorageString(KEY_LAST_EMAIL, clean);
    removeStorage(KEY_PENDING_SIGNUP_EMAIL);

    this.clearOtpTimer();
    this.clearResendCooldown();

    const now = Date.now();
    this.emit({
      pendingVerificationEmail: null,
      currentUserEmail: clean,
      isAdmin: resolvedAdmin,
      isAuthed: true,
      isVerifyingSession: false,
      registeredUsers: updatedUsers,
    });
    setStorageNum(KEY_ROLES_UPDATED_AT, now);
    if (resolvedAdmin) {
      this.onRolesChangedListener?.(serializeUsers(updatedUsers), now);
    }
  }

  // --- Sign In / Sign Up / Verification / Recovery ---

  public async signInEmailPassword(email: string, password: string): Promise<AuthActionResult> {
    if (this.isLocked()) {
      return {
        ok: false,
        message: `Too many failed attempts. Try again in ${this.getRemainingLockSeconds()}s.`,
      };
    }
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean) || !password) {
      return { ok: false, message: 'Enter a valid email and password.' };
    }
    this.clearDeepLinkStatus();

    try {
      if (!this.isSupabaseConfigured()) {
        return {
          ok: false,
          message: 'Cloud authentication is not configured. Check Supabase settings.',
        };
      }

      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: clean, password }),
      });

      const respBody = await resp.text();
      if (resp.ok) {
        let obj: any = null;
        try {
          obj = JSON.parse(respBody);
        } catch (e) {
          console.warn('Sign in JSON parse notice:', e);
        }
        const accessToken = String(obj?.access_token || '');
        const refreshToken = String(obj?.refresh_token || '');
        const userObj = obj?.user;
        const hasConfirmationMeta =
          userObj && ('email_confirmed_at' in userObj || 'confirmed_at' in userObj);
        if (hasConfirmationMeta && !isEmailConfirmed(userObj)) {
          this.setPendingVerificationEmail(clean);
          return {
            ok: false,
            message: 'Your email is not verified yet. Open your inbox and confirm your email first.',
          };
        }
        if (!accessToken) {
          return { ok: false, message: 'Sign in failed: missing session token.' };
        }
        this.resetAuthFailures();
        await this.resolveAndCompleteSession(
          clean,
          accessToken,
          refreshToken,
          isMetadataAdmin(userObj)
        );
        return { ok: true };
      } else {
        const msg = friendlySupabaseError(respBody, resp.status);
        const lockHint = this.recordFailedAuthAttempt();
        const fullMsg = lockHint.startsWith('Too many') ? lockHint : `${msg} ${lockHint}`.trim();
        return { ok: false, message: fullMsg };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Network error: ${e?.message || 'Check internet connection'}`,
      };
    }
  }

  public async signUpEmailPassword(email: string, password: string): Promise<AuthActionResult> {
    if (this.isLocked()) {
      return {
        ok: false,
        message: `Too many failed attempts. Try again in ${this.getRemainingLockSeconds()}s.`,
      };
    }
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      return { ok: false, message: 'Enter a valid email address.' };
    }
    if (!isValidPassword(password)) {
      return {
        ok: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }
    this.clearDeepLinkStatus();

    try {
      if (!this.isSupabaseConfigured()) {
        return {
          ok: false,
          message: 'Cloud authentication is not configured. Check Supabase settings.',
        };
      }

      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: clean, password }),
      });

      const respBody = await resp.text();
      if (resp.ok) {
        let obj: any = null;
        try {
          obj = JSON.parse(respBody);
        } catch (e) {
          console.warn('Sign up JSON parse notice:', e);
        }
        const userObj = obj?.user ?? obj;
        const accessToken = String(obj?.access_token || '');
        const refreshToken = String(obj?.refresh_token || '');
        const emailAlreadyConfirmed = isEmailConfirmed(userObj);
        const identities = userObj?.identities;
        const hasExistingAccount = Array.isArray(identities) && identities.length === 0;

        if (hasExistingAccount) {
          return {
            ok: false,
            message: 'An account with this email already exists. Use Sign In instead.',
          };
        }

        if (accessToken && emailAlreadyConfirmed) {
          await this.resolveAndCompleteSession(
            clean,
            accessToken,
            refreshToken,
            isMetadataAdmin(userObj)
          );
          return { ok: true, message: 'Account created & signed in!' };
        }

        setStorageString(KEY_LAST_EMAIL, clean);
        this.setPendingVerificationEmail(clean);
        this.startOtpExpiryTimer();
        this.startResendCooldown();
        return {
          ok: true,
          message: `OTP code sent to ${clean} (expires in 5 minutes). Enter the code below.`,
        };
      } else {
        return { ok: false, message: friendlySupabaseError(respBody, resp.status) };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Network error while creating account: ${e?.message || 'Check internet connection'}`,
      };
    }
  }

  public async verifySignupOtp(email: string, otp: string): Promise<AuthActionResult> {
    if (this.isLocked()) {
      return {
        ok: false,
        message: `Too many failed attempts. Try again in ${this.getRemainingLockSeconds()}s.`,
      };
    }
    const clean = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    if (!isValidEmail(clean)) {
      return { ok: false, message: 'Enter a valid email address.' };
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      return { ok: false, message: 'Enter the 6-digit OTP code sent to your email.' };
    }
    if (this.isCurrentOtpExpired()) {
      return {
        ok: false,
        message: 'OTP code has expired (5-minute limit). Tap Resend OTP Code for a new one.',
      };
    }
    this.clearDeepLinkStatus();

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'signup',
          email: clean,
          token: cleanOtp,
        }),
      });

      const body = await resp.text();
      if (resp.ok) {
        let obj: any = null;
        try {
          obj = JSON.parse(body);
        } catch (e) {
          console.warn('OTP verify JSON parse notice:', e);
        }
        const userObj = obj?.user;
        const accessToken = String(obj?.access_token || '');
        const refreshToken = String(obj?.refresh_token || '');
        const hasConfirmationMeta =
          userObj && ('email_confirmed_at' in userObj || 'confirmed_at' in userObj);
        if (!accessToken || (hasConfirmationMeta && !isEmailConfirmed(userObj))) {
          return {
            ok: false,
            message: 'OTP verification incomplete. Please check the code and try again.',
          };
        }
        this.resetAuthFailures();
        await this.resolveAndCompleteSession(
          clean,
          accessToken,
          refreshToken,
          isMetadataAdmin(userObj)
        );
        return { ok: true, message: 'Email verified! Welcome to Stock.' };
      } else {
        const msg = friendlySupabaseError(body, resp.status);
        const lockHint = this.recordFailedAuthAttempt();
        const fullMsg = lockHint.startsWith('Too many') ? lockHint : `${msg} ${lockHint}`.trim();
        return { ok: false, message: fullMsg };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Failed to verify OTP: ${e?.message || 'Network error'}`,
      };
    }
  }

  public async resendConfirmationEmail(email: string): Promise<AuthActionResult> {
    const cooldown = this.getRemainingResendSeconds();
    if (cooldown > 0) {
      return { ok: false, message: `Please wait ${cooldown}s before requesting another OTP.` };
    }
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      return { ok: false, message: 'Enter a valid email address.' };
    }
    this.clearDeepLinkStatus();

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/auth/v1/resend`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'signup',
          email: clean,
        }),
      });
      const respBody = await resp.text();
      if (resp.ok) {
        this.startOtpExpiryTimer();
        this.startResendCooldown();
        return {
          ok: true,
          message: `New OTP code sent to ${clean} (expires in 5 minutes).`,
        };
      } else {
        return { ok: false, message: friendlySupabaseError(respBody, resp.status) };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Failed to resend OTP: ${e?.message || 'Network error'}`,
      };
    }
  }

  public async requestPasswordResetOtp(email: string): Promise<AuthActionResult> {
    if (this.isLocked()) {
      return {
        ok: false,
        message: `Too many failed attempts. Try again in ${this.getRemainingLockSeconds()}s.`,
      };
    }
    const cooldown = this.getRemainingResendSeconds();
    if (cooldown > 0) {
      return { ok: false, message: `Please wait ${cooldown}s before requesting another OTP.` };
    }
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      return { ok: false, message: 'Enter a valid email address.' };
    }
    this.clearDeepLinkStatus();

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: clean }),
      });
      const body = await resp.text();
      if (resp.ok) {
        setStorageString(KEY_LAST_EMAIL, clean);
        this.startOtpExpiryTimer();
        this.startResendCooldown();
        return {
          ok: true,
          message: `Password reset OTP sent to ${clean} (expires in 5 minutes).`,
        };
      } else {
        return { ok: false, message: friendlySupabaseError(body, resp.status) };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Failed to send reset OTP: ${e?.message || 'Network error'}`,
      };
    }
  }

  public async verifyPasswordResetAndUpdate(
    email: string,
    otp: string,
    newPassword: string
  ): Promise<AuthActionResult> {
    if (this.isLocked()) {
      return {
        ok: false,
        message: `Too many failed attempts. Try again in ${this.getRemainingLockSeconds()}s.`,
      };
    }
    const clean = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    if (!isValidEmail(clean)) {
      return { ok: false, message: 'Enter a valid email address.' };
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      return { ok: false, message: 'Enter the 6-digit OTP code sent to your email.' };
    }
    if (!isValidPassword(newPassword)) {
      return {
        ok: false,
        message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }
    if (this.isCurrentOtpExpired()) {
      return {
        ok: false,
        message: 'OTP code has expired (5-minute limit). Tap Resend Reset OTP for a new code.',
      };
    }

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const verifyResp = await fetch(`${baseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'recovery',
          email: clean,
          token: cleanOtp,
        }),
      });
      const verifyBody = await verifyResp.text();
      if (!verifyResp.ok) {
        const msg = friendlySupabaseError(verifyBody, verifyResp.status);
        const lockHint = this.recordFailedAuthAttempt();
        return {
          ok: false,
          message: lockHint.startsWith('Too many') ? lockHint : `${msg} ${lockHint}`.trim(),
        };
      }

      let verifyJson: any = null;
      try {
        verifyJson = JSON.parse(verifyBody);
      } catch (e) {
        console.warn('Reset verify JSON parse notice:', e);
      }
      const recoveryToken = String(verifyJson?.access_token || '');
      const recoveryRefresh = String(verifyJson?.refresh_token || '');
      const userObj = verifyJson?.user;
      if (!recoveryToken) {
        return {
          ok: false,
          message: 'Reset verification succeeded without session token.',
        };
      }

      const updateResp = await fetch(`${baseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${recoveryToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });
      const updateBody = await updateResp.text();
      if (!updateResp.ok) {
        return { ok: false, message: friendlySupabaseError(updateBody, updateResp.status) };
      }

      this.resetAuthFailures();
      await this.resolveAndCompleteSession(
        clean,
        recoveryToken,
        recoveryRefresh,
        isMetadataAdmin(userObj)
      );
      return { ok: true, message: 'Password updated! Welcome back to Stock.' };
    } catch (e: any) {
      return {
        ok: false,
        message: `Password reset failed: ${e?.message || 'Network error'}`,
      };
    }
  }

  public async requestChangeEmailOtp(newEmail: string): Promise<AuthActionResult> {
    const cooldown = this.getRemainingResendSeconds();
    if (cooldown > 0) {
      return { ok: false, message: `Please wait ${cooldown}s before requesting another OTP.` };
    }
    const cleanNew = newEmail.trim().toLowerCase();
    const currentEmail = this.state.currentUserEmail?.trim().toLowerCase() || '';
    if (!isValidEmail(cleanNew)) {
      return { ok: false, message: 'Enter a valid new email address.' };
    }
    if (cleanNew === currentEmail) {
      return { ok: false, message: 'New email matches your current email.' };
    }

    let token = this.activeAccessToken();
    if (!token) {
      return { ok: false, message: 'Your session expired. Sign in again to change your email.' };
    }

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const sendPut = async (bearer: string) =>
        fetch(`${baseUrl}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: cleanNew }),
        });

      let resp = await sendPut(token);
      if (resp.status === 401 && (await this.refreshSession())) {
        token = this.activeAccessToken();
        if (token) resp = await sendPut(token);
      }

      const body = await resp.text();
      if (resp.ok) {
        this.startOtpExpiryTimer();
        this.startResendCooldown();
        return {
          ok: true,
          message: `Verification OTP sent to ${cleanNew} (expires in 5 minutes).`,
        };
      } else {
        if (resp.status === 401 || resp.status === 403) {
          this.forceSessionExpiredSignOut('Your session expired. Please sign in again.');
          return { ok: false, message: 'Session expired. Please sign in again.' };
        }
        return { ok: false, message: friendlySupabaseError(body, resp.status) };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Email change request failed: ${e?.message || 'Network error'}`,
      };
    }
  }

  public async confirmChangeEmailOtp(newEmail: string, otp: string): Promise<AuthActionResult> {
    if (this.isLocked()) {
      return {
        ok: false,
        message: `Too many failed attempts. Try again in ${this.getRemainingLockSeconds()}s.`,
      };
    }
    const cleanNew = newEmail.trim().toLowerCase();
    const cleanOtp = otp.trim();
    if (!isValidEmail(cleanNew)) {
      return { ok: false, message: 'Enter a valid new email address.' };
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      return { ok: false, message: 'Enter the 6-digit OTP code sent to your new email.' };
    }
    if (this.isCurrentOtpExpired()) {
      return {
        ok: false,
        message: 'OTP code has expired (5-minute limit). Request a new verification OTP.',
      };
    }

    const oldEmail = this.state.currentUserEmail;
    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'email_change',
          email: cleanNew,
          token: cleanOtp,
        }),
      });
      const body = await resp.text();
      if (resp.ok) {
        let obj: any = null;
        try {
          obj = JSON.parse(body);
        } catch (e) {
          console.warn('Email change JSON parse notice:', e);
        }
        const newToken = String(obj?.access_token || '');
        const newRefresh = String(obj?.refresh_token || '');
        this.resetAuthFailures();
        await this.completeEmailChangeLocally(oldEmail, cleanNew, newToken, newRefresh);
        return { ok: true, message: `Email address updated to ${cleanNew}!` };
      } else {
        const msg = friendlySupabaseError(body, resp.status);
        const lockHint = this.recordFailedAuthAttempt();
        return {
          ok: false,
          message: lockHint.startsWith('Too many') ? lockHint : `${msg} ${lockHint}`.trim(),
        };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Verification failed: ${e?.message || 'Network error'}`,
      };
    }
  }

  private async completeEmailChangeLocally(
    oldEmail: string | null,
    newEmail: string,
    newAccessToken: string,
    newRefreshToken = ''
  ) {
    const cleanNew = newEmail.trim().toLowerCase();
    const cleanOld = oldEmail?.trim().toLowerCase() || null;
    const existingRole =
      this.state.registeredUsers.find((u) => cleanOld && u.email.toLowerCase() === cleanOld)
        ?.isAdmin ?? this.state.isAdmin;

    const updatedList: UserAccount[] = [
      ...this.state.registeredUsers
        .filter((u) => !cleanOld || u.email.toLowerCase() !== cleanOld)
        .filter((u) => u.email.toLowerCase() !== cleanNew),
      { email: cleanNew, isAdmin: existingRole },
    ];
    const now = Date.now();
    this.setUsersInMemory(updatedList, now, false);

    if (newAccessToken) {
      this.saveSessionTokens(newAccessToken, newRefreshToken);
    }
    setStorageString(KEY_LAST_EMAIL, cleanNew);
    this.clearOtpTimer();
    this.clearResendCooldown();
    this.emit({ currentUserEmail: cleanNew, isAdmin: existingRole });
    this.onRolesChangedListener?.(serializeUsers(updatedList), now);

    if (this.isSupabaseConfigured()) {
      const tok = newAccessToken || this.activeAccessToken() || undefined;
      await this.pushRemoteUserUpsert(cleanNew, existingRole, tok);
      if (cleanOld && cleanOld !== cleanNew) {
        await this.pushRemoteUserDelete(cleanOld);
      }
    }
  }

  public async requestDeleteAccountOtp(): Promise<AuthActionResult> {
    const cooldown = this.getRemainingResendSeconds();
    if (cooldown > 0) {
      return { ok: false, message: `Please wait ${cooldown}s before requesting another OTP.` };
    }
    const clean = this.state.currentUserEmail?.trim().toLowerCase() || '';
    if (!isValidEmail(clean)) {
      return { ok: false, message: 'No signed-in email address found.' };
    }

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const resp = await fetch(`${baseUrl}/auth/v1/otp`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: clean,
          create_user: false,
        }),
      });
      const body = await resp.text();
      if (resp.ok) {
        this.startOtpExpiryTimer();
        this.startResendCooldown();
        return {
          ok: true,
          message: `Confirmation OTP sent to ${clean} (expires in 5 minutes).`,
        };
      } else {
        return { ok: false, message: friendlySupabaseError(body, resp.status) };
      }
    } catch (e: any) {
      return {
        ok: false,
        message: `Failed to send deletion OTP: ${e?.message || 'Network error'}`,
      };
    }
  }

  public async confirmDeleteAccountWithOtp(otp: string): Promise<AuthActionResult> {
    if (this.isLocked()) {
      return {
        ok: false,
        message: `Too many failed attempts. Try again in ${this.getRemainingLockSeconds()}s.`,
      };
    }
    const clean = this.state.currentUserEmail?.trim().toLowerCase() || '';
    const cleanOtp = otp.trim();
    if (!isValidEmail(clean)) {
      return { ok: false, message: 'No signed-in email address found.' };
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      return { ok: false, message: 'Enter the 6-digit OTP code sent to your email.' };
    }
    if (this.isCurrentOtpExpired()) {
      return {
        ok: false,
        message: 'OTP code has expired (5-minute limit). Request a new confirmation OTP.',
      };
    }

    try {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      const verifyResp = await fetch(`${baseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'email',
          email: clean,
          token: cleanOtp,
        }),
      });
      const verifyBody = await verifyResp.text();
      if (!verifyResp.ok) {
        const msg = friendlySupabaseError(verifyBody, verifyResp.status);
        const lockHint = this.recordFailedAuthAttempt();
        return {
          ok: false,
          message: lockHint.startsWith('Too many') ? lockHint : `${msg} ${lockHint}`.trim(),
        };
      }

      let verifyJson: any = null;
      try {
        verifyJson = JSON.parse(verifyBody);
      } catch (e) {
        console.warn('Delete account verify parse notice:', e);
      }
      const userAccessToken = String(verifyJson?.access_token || '') || this.activeAccessToken();
      if (!userAccessToken) {
        return {
          ok: false,
          message: 'Verification succeeded without active session token. Please sign in and retry.',
        };
      }

      // 1. Delete role row in app_users
      await fetch(`${baseUrl}/rest/v1/app_users?email=eq.${encodeURIComponent(clean)}`, {
        method: 'DELETE',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${userAccessToken}`,
        },
      }).catch((e) => console.warn('Cleanup app_users warning:', e));

      // 2. Execute RPC delete_user_account
      const rpcResp = await fetch(`${baseUrl}/rest/v1/rpc/delete_user_account`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const rpcBody = await rpcResp.text();
      if (!rpcResp.ok) {
        const err = extractSupabaseError(rpcBody, rpcResp.status);
        const hint =
          err.toLowerCase().includes('delete_user_account') || rpcResp.status === 404
            ? 'Account deletion requires the `delete_user_account` SQL function on Supabase.'
            : err;
        return { ok: false, message: hint };
      }

      this.resetAuthFailures();
      await this.completeAccountDeletionLocally(clean);
      return { ok: true, message: 'Your account has been permanently deleted.' };
    } catch (e: any) {
      return {
        ok: false,
        message: `Account deletion failed: ${e?.message || 'Network error'}`,
      };
    }
  }

  private async completeAccountDeletionLocally(deletedEmail: string) {
    const clean = deletedEmail.trim().toLowerCase();
    const remaining = this.state.registeredUsers.filter((u) => u.email.toLowerCase() !== clean);
    const now = Date.now();
    this.onRolesChangedListener?.(serializeUsers(remaining), now);
    this.logout(false, false);
    this.emit({
      pendingVerificationEmail: null,
      deepLinkError: null,
      deepLinkMessage: clean
        ? `Account (${clean}) has been permanently deleted.`
        : 'Your account has been permanently deleted.',
    });
  }

  public logout(revokeServer = true, keepLastEmail = true) {
    const tokenToRevoke = this.activeAccessToken();
    this.clearOtpTimer();
    this.clearResendCooldown();
    this.clearSessionTokens();

    // SECURITY (Task 9): Wipe all hardware_* cached data from storage on sign-out
    clearHardwareWebStorage(keepLastEmail);

    this.emit({
      currentUserEmail: null,
      isAdmin: false,
      isAuthed: false,
      isVerifyingSession: false,
      registeredUsers: [],
      pendingVerificationEmail: null,
    });

    this.onSignedOutListener?.();

    if (revokeServer && this.isSupabaseConfigured() && tokenToRevoke) {
      const { baseUrl, apiKey } = getSupabaseCredentials();
      fetch(`${baseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${tokenToRevoke}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }).catch((e) => console.warn('Server logout revoke notice:', e));
    }
  }

  public forceSessionExpiredSignOut(
    reason = 'Your session has expired. Please sign in again.'
  ) {
    this.logout(false, true);
    this.emit({
      deepLinkMessage: null,
      deepLinkError: reason,
    });
  }
}

export const authService = new AuthService();
