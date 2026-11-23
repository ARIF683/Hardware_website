import {
  Item,
  TransactionRecord,
  DailyCashflowRecord,
  QuotationRecord,
  LedgerAccount,
  LedgerEntry,
  RemoteStoreProfile,
} from '../types';

const ENV_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
    ? String(import.meta.env.VITE_SUPABASE_URL)
    : '';
const ENV_KEY =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY
    ? String(import.meta.env.VITE_SUPABASE_ANON_KEY)
    : '';
const IS_DEV = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

export const SUPABASE_URL = 'https://xkjvcufajsyqbzjjllma.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_sXokssWnrTPWROtmfHjoWA_LRqVPt8V';

export function isValidCustomSupabaseUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

// Helper to sanitize any Supabase URL
export function cleanSupabaseUrl(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return SUPABASE_URL;
  let clean = raw.trim();
  if (!clean) return SUPABASE_URL;
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  try {
    const parsed = new URL(clean);
    return parsed.origin;
  } catch {
    clean = clean.replace(/\/+$/, '');
    clean = clean.replace(/\/rest\/v1.*$/i, '');
    clean = clean.replace(/\/rest.*$/i, '');
    clean = clean.replace(/\/+$/, '');
    return clean || SUPABASE_URL;
  }
}

// Helper to generate cryptographically strong UUIDs for all record IDs
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Secure random UUID generator is unavailable in this environment');
}

export const newId = (prefix: string): string => `${prefix}_${generateUUID()}`;

// Helper to compress image file using HTML5 canvas (returns Blob only — never base64 fallback for DB)
function compressImageFile(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.78
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const dataUrl = (e.target?.result as string) || '';
      if (!dataUrl) {
        reject(new Error('Image file is empty'));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve(blob || file);
          },
          'image/jpeg',
          quality
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const PROFILE_CLIENT_ID = '00000000-0000-0000-0000-000000000001';
export const PROFILE_SUPPLIER = '__STORE_PROFILE__';

function optPresentString(obj: any, key: string): string | null | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return undefined;
  const val = String(obj[key]);
  return val === 'null' ? undefined : val;
}

export const StoreProfileSyncCodec = {
  parseFromObject(first: any): RemoteStoreProfile | null {
    if (!first || typeof first !== 'object') return null;
    const logo = optPresentString(first, 'logoUrl') ?? optPresentString(first, 'avatarUrl');
    return {
      bannerUrl: optPresentString(first, 'bannerUrl'),
      logoUrl: logo,
      storeName: optPresentString(first, 'storeName'),
      location: optPresentString(first, 'location'),
      roleTitle: optPresentString(first, 'roleTitle'),
      supervisorName: optPresentString(first, 'supervisorName'),
      bankName: optPresentString(first, 'bankName'),
      accountHolder: optPresentString(first, 'accountHolder'),
      accountNumber: optPresentString(first, 'accountNumber'),
      ifscCode: optPresentString(first, 'ifscCode'),
      branchName: optPresentString(first, 'branchName'),
      upiId: optPresentString(first, 'upiId'),
      signatureUrl: optPresentString(first, 'signatureUrl'),
      qrCodeUrl: optPresentString(first, 'qrCodeUrl'),
      festivalConfigJson: optPresentString(first, 'festivalConfigJson'),
      userRolesJson: optPresentString(first, 'userRolesJson'),
      updatedAt: Number(first.updatedAt || 0),
    };
  },

  parseFromLines(linesAny: any): RemoteStoreProfile | null {
    let first: any = null;
    if (Array.isArray(linesAny)) {
      first = linesAny[0] || null;
    } else if (linesAny && typeof linesAny === 'object') {
      first = linesAny;
    } else if (typeof linesAny === 'string') {
      const trimmed = linesAny.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          first = Array.isArray(parsed) ? parsed[0] || null : parsed;
        } catch (e) {
          console.warn('StoreProfileSync: Failed parsing store profile JSON string', e);
        }
      }
    }
    return this.parseFromObject(first);
  },

  toJsonObject(profile: RemoteStoreProfile): Record<string, any> {
    const out: Record<string, any> = {};
    if (profile.bannerUrl !== undefined && profile.bannerUrl !== null) out.bannerUrl = profile.bannerUrl;
    if (profile.logoUrl !== undefined && profile.logoUrl !== null) {
      out.logoUrl = profile.logoUrl;
      out.avatarUrl = profile.logoUrl;
    }
    if (profile.storeName !== undefined && profile.storeName !== null) out.storeName = profile.storeName;
    if (profile.location !== undefined && profile.location !== null) out.location = profile.location;
    if (profile.roleTitle !== undefined && profile.roleTitle !== null) out.roleTitle = profile.roleTitle;
    if (profile.supervisorName !== undefined && profile.supervisorName !== null) {
      out.supervisorName = profile.supervisorName;
    }
    if (profile.bankName !== undefined && profile.bankName !== null) out.bankName = profile.bankName;
    if (profile.accountHolder !== undefined && profile.accountHolder !== null) {
      out.accountHolder = profile.accountHolder;
    }
    if (profile.accountNumber !== undefined && profile.accountNumber !== null) {
      out.accountNumber = profile.accountNumber;
    }
    if (profile.ifscCode !== undefined && profile.ifscCode !== null) out.ifscCode = profile.ifscCode;
    if (profile.branchName !== undefined && profile.branchName !== null) out.branchName = profile.branchName;
    if (profile.upiId !== undefined && profile.upiId !== null) out.upiId = profile.upiId;
    if (profile.signatureUrl !== undefined && profile.signatureUrl !== null) {
      out.signatureUrl = profile.signatureUrl;
    }
    if (profile.qrCodeUrl !== undefined && profile.qrCodeUrl !== null) out.qrCodeUrl = profile.qrCodeUrl;
    if (profile.festivalConfigJson !== undefined && profile.festivalConfigJson !== null) {
      out.festivalConfigJson = profile.festivalConfigJson;
    }
    if (profile.userRolesJson !== undefined && profile.userRolesJson !== null) {
      out.userRolesJson = profile.userRolesJson;
    }
    out.updatedAt = profile.updatedAt > 0 ? profile.updatedAt : Date.now();
    return out;
  },

  toPurchasesPayload(profile: RemoteStoreProfile, billDate = new Date().toISOString().slice(0, 10)) {
    return {
      client_id: PROFILE_CLIENT_ID,
      supplier: PROFILE_SUPPLIER,
      bill_no: 'CONFIG',
      bill_date: billDate,
      total: 0,
      lines: [this.toJsonObject(profile)],
    };
  },

  merge(base: RemoteStoreProfile | null | undefined, override: RemoteStoreProfile): RemoteStoreProfile {
    if (!base) return override;
    return {
      bannerUrl: override.bannerUrl !== undefined ? override.bannerUrl : base.bannerUrl,
      logoUrl: override.logoUrl !== undefined ? override.logoUrl : base.logoUrl,
      storeName: override.storeName !== undefined ? override.storeName : base.storeName,
      location: override.location !== undefined ? override.location : base.location,
      roleTitle: override.roleTitle !== undefined ? override.roleTitle : base.roleTitle,
      supervisorName:
        override.supervisorName !== undefined ? override.supervisorName : base.supervisorName,
      bankName: override.bankName !== undefined ? override.bankName : base.bankName,
      accountHolder:
        override.accountHolder !== undefined ? override.accountHolder : base.accountHolder,
      accountNumber:
        override.accountNumber !== undefined ? override.accountNumber : base.accountNumber,
      ifscCode: override.ifscCode !== undefined ? override.ifscCode : base.ifscCode,
      branchName: override.branchName !== undefined ? override.branchName : base.branchName,
      upiId: override.upiId !== undefined ? override.upiId : base.upiId,
      signatureUrl: override.signatureUrl !== undefined ? override.signatureUrl : base.signatureUrl,
      qrCodeUrl: override.qrCodeUrl !== undefined ? override.qrCodeUrl : base.qrCodeUrl,
      festivalConfigJson:
        override.festivalConfigJson !== undefined
          ? override.festivalConfigJson
          : base.festivalConfigJson,
      userRolesJson:
        override.userRolesJson !== undefined ? override.userRolesJson : base.userRolesJson,
      updatedAt: Math.max(Number(base.updatedAt || 0), Number(override.updatedAt || 0)) || Date.now(),
    };
  },
};

export interface SupabaseAuthHandlers {
  getAccessToken: () => string;
  refreshSession: () => Promise<boolean>;
  onAuthExpired: (reason?: string) => void;
}

class SupabaseService {
  private url: string;
  private key: string;
  private ws: WebSocket | null = null;
  private wsAccessToken = '';
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentListener: any = null;
  private isExplicitlyClosed = false;
  private accessTokenProvider: (() => string) | null = null;
  private refreshSessionHandler: (() => Promise<boolean>) | null = null;
  private onAuthExpiredHandler: ((reason?: string) => void) | null = null;

  constructor() {
    const defaultUrl = cleanSupabaseUrl(ENV_URL || SUPABASE_URL);
    const defaultKey = ENV_KEY && ENV_KEY.trim() ? ENV_KEY.trim() : SUPABASE_KEY;

    // Only allow custom server settings in DEV mode and strictly over HTTPS *.supabase.co
    if (IS_DEV && typeof localStorage !== 'undefined') {
      try {
        const storedUrl = localStorage.getItem('hardware_supabase_url');
        const storedKey = localStorage.getItem('hardware_supabase_key');
        if (storedUrl && isValidCustomSupabaseUrl(storedUrl)) {
          this.url = cleanSupabaseUrl(storedUrl);
          this.key = storedKey && storedKey.trim().length > 10 ? storedKey.trim() : defaultKey;
          return;
        }
      } catch (e) {
        console.warn('Could not read dev Supabase URL:', e);
      }
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('hardware_supabase_url');
        localStorage.removeItem('hardware_supabase_key');
      } catch (e) {
        console.warn('Could not purge legacy Supabase credentials:', e);
      }
    }

    this.url = defaultUrl;
    this.key = defaultKey;
  }

  public setAccessTokenProvider(provider: (() => string) | null) {
    this.accessTokenProvider = provider;
  }

  public setAuthHandlers(handlers: SupabaseAuthHandlers) {
    this.accessTokenProvider = handlers.getAccessToken;
    this.refreshSessionHandler = handlers.refreshSession;
    this.onAuthExpiredHandler = handlers.onAuthExpired;
  }

  // Dev-only custom override strictly constrained to HTTPS *.supabase.co
  public updateCredentials(url: string, key: string) {
    if (!IS_DEV) {
      throw new Error('Custom Supabase server overrides are disabled in production builds.');
    }
    const cleanUrl = cleanSupabaseUrl(url);
    if (!isValidCustomSupabaseUrl(cleanUrl)) {
      throw new Error('Only HTTPS *.supabase.co project URLs are allowed.');
    }
    this.url = cleanUrl;
    const cleanK = (key || '')
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^["']+|["']+$/g, '')
      .trim();
    this.key = cleanK && cleanK.length > 10 ? cleanK : SUPABASE_KEY;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('hardware_supabase_url', this.url);
        localStorage.setItem('hardware_supabase_key', this.key);
      } catch (e) {
        console.warn('Failed storing dev Supabase credentials:', e);
      }
    }
    if (this.currentListener) {
      this.connectRealtime(this.currentListener);
    }
  }

  public getCleanKey(): string {
    let key = (this.key || '').trim().replace(/[\r\n\t]/g, '');
    key = key.replace(/^Bearer\s+/i, '').trim();
    key = key.replace(/^["']+|["']+$/g, '').trim();
    if (!key || key.length < 15) {
      return SUPABASE_KEY;
    }
    return key;
  }

  public getCleanUrl(): string {
    return cleanSupabaseUrl(this.url);
  }

  private getUserToken(): string {
    return this.accessTokenProvider ? (this.accessTokenProvider() || '').trim() : '';
  }

  private getActiveBearer(): string {
    return this.getUserToken();
  }

  private buildHeaders(token: string, isMutation = false, extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set('apikey', this.getCleanKey());
    headers.set('Authorization', `Bearer ${token}`);
    if (isMutation && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  private async authorizedFetch(
    url: string,
    init: RequestInit = {},
    isMutation = false
  ): Promise<Response> {
    let token = this.getActiveBearer();
    if (!token) {
      this.onAuthExpiredHandler?.('Please sign in to access store data.');
      throw new Error('Authentication required. Please sign in.');
    }

    let resp = await fetch(url, {
      ...init,
      headers: this.buildHeaders(token, isMutation, init.headers),
    });

    if (resp.status === 401 && this.refreshSessionHandler) {
      const refreshed = await this.refreshSessionHandler();
      if (refreshed) {
        token = this.getActiveBearer();
        if (token) {
          resp = await fetch(url, {
            ...init,
            headers: this.buildHeaders(token, isMutation, init.headers),
          });
        }
      }
      if (resp.status === 401) {
        this.onAuthExpiredHandler?.('Your session has expired. Please sign in again.');
        throw new Error('Session expired. Please sign in again.');
      }
    }

    return resp;
  }

  private async assertOk(resp: Response, action: string): Promise<Response> {
    if (!resp.ok) {
      const detail = await resp.text().catch(() => resp.statusText);
      throw new Error(`${action} failed: ${resp.status} ${detail}`);
    }
    return resp;
  }

  // Reconnect active WebSocket with fresh access token when session refreshes
  public reconnectRealtimeIfNeeded() {
    if (!this.currentListener || this.isExplicitlyClosed) return;
    const latestToken = this.getActiveBearer();
    if (!latestToken) {
      this.disconnectRealtime();
      return;
    }
    if (latestToken !== this.wsAccessToken) {
      this.connectRealtime(this.currentListener);
    }
  }

  // --- Realtime WebSocket Channel Listener (postgres_changes only; broadcasts rejected) ---
  public connectRealtime(listener: any) {
    this.currentListener = listener;
    this.isExplicitlyClosed = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.warn('Realtime WS close notice:', e);
      }
      this.ws = null;
    }

    const token = this.getActiveBearer();
    if (!token) {
      this.wsAccessToken = '';
      return;
    }

    try {
      this.wsAccessToken = token;
      const cleanUrl = this.getCleanUrl();
      const cleanKey = this.getCleanKey();
      const wsUrl = `${cleanUrl.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${cleanKey}&vsn=1.0.0`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const joinToken = this.getActiveBearer() || token;
        const tables = [
          'items',
          'purchases',
          'daily_cashflow',
          'quotations',
          'ledger_accounts',
          'ledger_entries',
        ];
        tables.forEach((table) => {
          this.ws?.send(
            JSON.stringify({
              topic: `realtime:public:${table}`,
              event: 'phx_join',
              payload: {
                access_token: joinToken,
                config: {
                  broadcast: { self: false },
                  presence: { key: '' },
                  postgres_changes: [{ event: '*', schema: 'public', table }],
                },
              },
              ref: `join_${table}_${Date.now()}`,
            })
          );
        });

        this.ws?.send(
          JSON.stringify({
            topic: 'realtime:public',
            event: 'phx_join',
            payload: { access_token: joinToken },
            ref: 'public_1',
          })
        );

        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(
              JSON.stringify({
                topic: 'phoenix',
                event: 'heartbeat',
                payload: {},
                ref: 'hb',
              })
            );
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            msg.event === 'phx_reply' ||
            msg.event === 'system' ||
            msg.event === 'phx_error' ||
            msg.event === 'presence_state' ||
            msg.event === 'presence_diff'
          ) {
            return;
          }

          const payload = msg.payload;

          // SECURITY: Reject ALL unauthenticated/forged broadcast messages; accept postgres_changes only
          if (msg.event === 'broadcast' || payload?.type === 'broadcast') {
            return;
          }
          if (msg.event !== 'postgres_changes') {
            return;
          }

          const topic = msg.topic || '';
          const data = payload?.data;
          if (!data || typeof data !== 'object') return;

          const record = data.record || null;
          const oldRecord = data.old_record || null;
          const evtType = String(data.type || 'UPDATE').toUpperCase();
          const table = String(data.table || topic.split(':')[2] || '').toLowerCase();

          const effectiveRecord = record || (oldRecord ? { id: oldRecord.id } : null);
          const effectiveId = effectiveRecord?.id || oldRecord?.id;

          if (table === 'purchases' || topic.includes('purchases')) {
            const clientId = effectiveRecord?.client_id || oldRecord?.client_id;
            const supplier = effectiveRecord?.supplier || oldRecord?.supplier;
            if (clientId === PROFILE_CLIENT_ID || supplier === PROFILE_SUPPLIER) {
              // SECURITY: Never apply pushed WS payload for store profile — always re-fetch via authenticated REST
              if (listener && typeof listener.onStoreProfileChanged === 'function') {
                void this.fetchStoreProfile()
                  .then((freshProfile) => {
                    if (freshProfile && typeof listener.onStoreProfileChanged === 'function') {
                      listener.onStoreProfileChanged(freshProfile);
                    }
                  })
                  .catch((err) => {
                    console.warn('Failed re-fetching store profile after realtime trigger:', err);
                  });
              }
            }
          }

          if (listener && typeof listener === 'object') {
            if (table === 'items') {
              if (typeof listener.onItemChanged === 'function') {
                listener.onItemChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === 'daily_cashflow') {
              if (typeof listener.onCashflowChanged === 'function') {
                listener.onCashflowChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === 'quotations') {
              if (typeof listener.onQuotationChanged === 'function') {
                listener.onQuotationChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === 'ledger_accounts') {
              if (typeof listener.onLedgerAccountChanged === 'function') {
                listener.onLedgerAccountChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === 'ledger_entries') {
              if (typeof listener.onLedgerEntryChanged === 'function') {
                listener.onLedgerEntryChanged(evtType, effectiveRecord, effectiveId);
              }
            }
          }
        } catch (e) {
          console.error('Realtime parsing error', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('Realtime WS notice', err);
      };

      this.ws.onclose = () => {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (!this.isExplicitlyClosed && this.getActiveBearer()) {
          this.reconnectTimeout = setTimeout(() => {
            if (!this.isExplicitlyClosed && this.currentListener && this.getActiveBearer()) {
              this.connectRealtime(this.currentListener);
            }
          }, 3500);
        }
      };
    } catch (e) {
      console.warn('Notice: Realtime WebSocket unavailable', e);
    }
  }

  public disconnectRealtime() {
    this.isExplicitlyClosed = true;
    this.wsAccessToken = '';
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.warn('Realtime disconnect notice:', e);
      }
      this.ws = null;
    }
  }

  // --- Store Profile Sync (Banner, Avatar, Festival Studio & User Roles) ---
  public async fetchStoreProfile(): Promise<RemoteStoreProfile | null> {
    try {
      const resp = await this.authorizedFetch(
        `${this.getCleanUrl()}/rest/v1/purchases?client_id=eq.${PROFILE_CLIENT_ID}&limit=1`,
        { method: 'GET' },
        false
      );
      if (!resp.ok) return null;
      const list = await resp.json();
      if (Array.isArray(list) && list.length > 0) {
        return StoreProfileSyncCodec.parseFromLines(list[0]?.lines);
      }
      return null;
    } catch (e) {
      console.warn('Notice: Store profile fetch skipped:', e);
      return null;
    }
  }

  public async saveStoreProfile(
    patchOrBannerUrl: Partial<RemoteStoreProfile> | string | null,
    legacyLogoUrl?: string | null
  ): Promise<boolean> {
    const patch: RemoteStoreProfile =
      typeof patchOrBannerUrl === 'object' && patchOrBannerUrl !== null
        ? {
            ...patchOrBannerUrl,
            updatedAt: patchOrBannerUrl.updatedAt || Date.now(),
          }
        : {
            bannerUrl: patchOrBannerUrl ?? '',
            logoUrl: legacyLogoUrl ?? '',
            updatedAt: Date.now(),
          };

    const existing = await this.fetchStoreProfile();
    const merged = StoreProfileSyncCodec.merge(existing, patch);
    const payload = StoreProfileSyncCodec.toPurchasesPayload(merged);

    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/purchases?on_conflict=client_id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(resp, 'Save store profile');
    return true;
  }

  // Upload image to Cloudinary via authenticated Edge Function signature (strictly no anon key, no base64 fallback)
  public async uploadImageToCloudinary(file: File): Promise<string> {
    if (!this.getActiveBearer()) {
      throw new Error('Please sign in before uploading images.');
    }
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Please select a valid image file.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image file is too large (max 10 MB).');
    }

    let uploadBlob: Blob;
    try {
      uploadBlob = await compressImageFile(file, 800, 800, 0.78);
    } catch (e) {
      console.warn('Image compression warning, using original file:', e);
      uploadBlob = file;
    }

    try {
      const signResp = await this.authorizedFetch(
        `${this.getCleanUrl()}/functions/v1/sign-cloudinary-upload`,
        {
          method: 'POST',
          body: JSON.stringify({ folder: 'items' }),
        },
        true
      );
      await this.assertOk(signResp, 'Cloudinary signature request');

      const { signature, timestamp, apiKey, cloudName, folder } = await signResp.json();
      if (!signature || !cloudName || !apiKey) {
        throw new Error('Incomplete response from signature edge function');
      }

      const formData = new FormData();
      formData.append('file', uploadBlob, 'image.jpg');
      formData.append('api_key', apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('signature', signature);
      formData.append('folder', folder || 'items');

      const uploadResp = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );
      await this.assertOk(uploadResp, 'Cloudinary image upload');

      const data = await uploadResp.json();
      const secureUrl = data?.secure_url || data?.url;
      if (!secureUrl || typeof secureUrl !== 'string') {
        throw new Error('Cloudinary did not return an image URL');
      }
      return secureUrl;
    } catch (e: any) {
      console.error('Image upload failed:', e);
      if (
        typeof e?.message === 'string' &&
        (e.message.includes('Please sign in') || e.message.includes('Session expired'))
      ) {
        throw e;
      }
      throw new Error('Image upload failed, please retry');
    }
  }

  // --- Items REST API ---
  public async fetchAllItems(): Promise<Item[]> {
    return this.fetchItems();
  }

  public async fetchItems(): Promise<Item[]> {
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/items?select=*&order=name.asc`,
      { method: 'GET' },
      false
    );
    await this.assertOk(resp, 'Fetch items');
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => this.mapItemRow(r));
  }

  private mapItemRow(r: any): Item {
    return {
      id: r.id || r.client_id,
      o: Number(r.o || 0),
      name: r.name,
      code: r.code || '',
      barcode: r.barcode || '',
      type: r.type || 'General Hardware',
      brand: r.brand || '',
      size: r.size || '',
      unit: r.unit || 'pcs',
      qty: Number(r.qty || 0),
      low: Number(r.low || 0),
      cost: Number(r.cost || 0),
      price: Number(r.price || 0),
      mrp: r.mrp !== null && r.mrp !== undefined && r.mrp !== '' ? Number(r.mrp) : null,
      imageUrl: r.image_url || undefined,
      aliases: r.aliases || '',
      updatedAt: r.updated_at || new Date().toISOString(),
    };
  }

  public async updateItemImage(id: string, imageUrl: string | null): Promise<void> {
    const cleanId = (id || '').trim();
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        }),
      },
      true
    );
    await this.assertOk(resp, 'Update item image');
    const data = await resp.json();
    if (!data || data.length === 0) {
      throw new Error(`Item with id ${cleanId} not found in database`);
    }
  }

  public async updateItemMetadata(
    id: string,
    patch: Partial<{
      name: string;
      code: string;
      barcode: string;
      type: string;
      brand: string;
      size: string;
      unit: string;
      low: number;
      cost: number;
      price: number;
      mrp: number | null;
      image_url: string | null;
      aliases: string;
      updated_at: string;
    }>
  ): Promise<void> {
    const cleanId = (id || '').trim();
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          ...patch,
          updated_at: patch.updated_at || new Date().toISOString(),
        }),
      },
      true
    );
    await this.assertOk(resp, 'Update item details');
  }

  public async upsertItem(item: Item): Promise<void> {
    const cleanId = (item.id || '').trim();
    const payload = {
      id: cleanId,
      name: item.name,
      code: item.code || '',
      barcode: item.barcode || '',
      type: item.type || 'General Hardware',
      brand: item.brand || '',
      size: item.size || '',
      unit: item.unit || 'pcs',
      qty: item.qty,
      low: item.low,
      cost: item.cost,
      price: item.price,
      mrp: item.mrp || null,
      image_url: item.imageUrl || null,
      aliases: item.aliases || '',
      updated_at: item.updatedAt || new Date().toISOString(),
    };

    const patchResp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(patchResp, 'Update item');
    const patchedData = await patchResp.json();
    if (Array.isArray(patchedData) && patchedData.length > 0) {
      return;
    }

    const postResp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/items?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(postResp, 'Save item');
  }

  public async deleteItem(id: string): Promise<void> {
    const cleanId = (id || '').trim();
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`,
      { method: 'DELETE' },
      true
    );
    await this.assertOk(resp, 'Delete item');
  }

  // Atomic stock adjustment RPC (prevents concurrent overwrite drift across Web + Android)
  public async adjustItemQty(id: string, delta: number): Promise<number> {
    const cleanId = (id || '').trim();
    if (!cleanId) {
      throw new Error('Cannot adjust stock: missing item ID');
    }
    const numericDelta = Number(delta);
    if (!Number.isFinite(numericDelta)) {
      throw new Error('Cannot adjust stock: invalid quantity delta');
    }

    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/rpc/adjust_stock`,
      {
        method: 'POST',
        body: JSON.stringify({
          p_item_id: cleanId,
          p_delta: numericDelta,
        }),
      },
      true
    );
    await this.assertOk(resp, 'Adjust stock quantity');
    const result = await resp.json();
    const newQty = Number(result);
    if (!Number.isFinite(newQty)) {
      throw new Error('Invalid quantity returned from adjust_stock RPC');
    }
    return newQty;
  }

  // --- Transactions REST API ---
  public async fetchTransactions(): Promise<TransactionRecord[]> {
    try {
      const resp = await this.authorizedFetch(
        `${this.getCleanUrl()}/rest/v1/stock_transactions?select=*&order=created_at.desc&limit=100`,
        { method: 'GET' },
        false
      );
      await this.assertOk(resp, 'Fetch transactions');
      const rows = await resp.json();
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        clientId: r.client_id || r.id,
        itemId: r.item_id,
        itemName: r.item_name,
        action: r.action,
        qty: Number(r.qty),
        balance: Number(r.balance),
        unit: r.unit || 'pcs',
        note: r.note || '',
        createdAt: r.created_at || new Date().toISOString(),
      }));
    } catch (e) {
      console.warn('Notice: Transaction fetch skipped:', e);
      throw e;
    }
  }

  public async insertTransaction(tx: TransactionRecord): Promise<void> {
    const payload = {
      client_id: tx.clientId,
      item_id: tx.itemId,
      item_name: tx.itemName,
      action: tx.action,
      qty: tx.qty,
      balance: tx.balance,
      unit: tx.unit,
      note: tx.note,
      created_at: tx.createdAt,
    };
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/stock_transactions`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(resp, 'Save stock transaction');
  }

  // --- Cashflow REST API ---
  private formatCashflowRecord(r: any): DailyCashflowRecord {
    let rawDate = r.date || r.entry_date || '';
    if (!rawDate && r.created_at) {
      rawDate = String(r.created_at).split('T')[0];
    }
    if (!rawDate) {
      rawDate = new Date().toISOString().split('T')[0];
    }

    let rawType: 'SALE' | 'EXPENSE' = 'SALE';
    if (
      r.type &&
      (String(r.type).toUpperCase() === 'EXPENSE' || String(r.type).toUpperCase() === 'SALE')
    ) {
      rawType = String(r.type).toUpperCase() as 'SALE' | 'EXPENSE';
    } else if (Number(r.cash_out || r.out_amount || 0) > 0) {
      rawType = 'EXPENSE';
    } else {
      rawType = 'SALE';
    }

    let rawAmount = 0;
    if (r.amount !== undefined && r.amount !== null && r.amount !== '') {
      rawAmount = Number(r.amount);
    } else if (rawType === 'EXPENSE') {
      rawAmount = Number(r.cash_out || r.out_amount || 0);
    } else {
      rawAmount = Number(r.cash_in || r.in_amount || 0);
    }

    const rawPaymentMode = r.payment_mode || r.paymentMode || 'Cash';

    return {
      id: String(r.id || r.client_id || generateUUID()),
      date: rawDate,
      type: rawType,
      category: String(r.category || 'General'),
      amount: rawAmount,
      paymentMode: rawPaymentMode as any,
      note: String(r.note || ''),
      createdAt: String(r.created_at || r.updated_at || new Date().toISOString()),
    };
  }

  public async fetchDailyCashflows(): Promise<DailyCashflowRecord[]> {
    return this.fetchCashflow();
  }

  public async fetchCashflow(): Promise<DailyCashflowRecord[]> {
    let resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/daily_cashflow?select=*&order=date.desc`,
      { method: 'GET' },
      false
    );

    if (!resp.ok) {
      resp = await this.authorizedFetch(
        `${this.getCleanUrl()}/rest/v1/daily_cashflow?select=*&order=created_at.desc`,
        { method: 'GET' },
        false
      );
    }

    if (!resp.ok) {
      resp = await this.authorizedFetch(
        `${this.getCleanUrl()}/rest/v1/daily_cashflow?select=*`,
        { method: 'GET' },
        false
      );
    }

    await this.assertOk(resp, 'Fetch cashflow');
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => this.formatCashflowRecord(r));
  }

  public async upsertCashflow(cf: DailyCashflowRecord): Promise<void> {
    const payload = {
      id: cf.id,
      date: cf.date,
      type: cf.type,
      category: cf.category,
      amount: cf.amount,
      payment_mode: cf.paymentMode,
      note: cf.note,
      created_at: cf.createdAt || new Date().toISOString(),
    };
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/daily_cashflow?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(resp, 'Save cashflow');
  }

  private normalizeQuotationStatus(
    raw?: string | null
  ): 'Draft' | 'Sent' | 'Accepted' | 'Converted' {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'sent') return 'Sent';
    if (s === 'accepted') return 'Accepted';
    if (s === 'converted') return 'Converted';
    return 'Draft';
  }

  // --- Quotations REST API ---
  public async fetchQuotations(): Promise<QuotationRecord[]> {
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/quotations?select=*&order=created_at.desc`,
      { method: 'GET' },
      false
    );
    await this.assertOk(resp, 'Fetch quotations');
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => {
      let parsedItems: any[] = [];
      try {
        parsedItems =
          typeof r.items === 'string'
            ? JSON.parse(r.items)
            : Array.isArray(r.items)
            ? r.items
            : [];
      } catch (e) {
        console.warn('Quotation items parse notice:', e);
        parsedItems = [];
      }
      const normalizedItems = parsedItems.map((it: any) => ({
        itemId: it.itemId || it.item_id || null,
        name: String(it.name || ''),
        code: String(it.code || ''),
        type: String(it.type || ''),
        unit: String(it.unit || 'pcs'),
        qty: Number(it.qty || 0),
        unitPrice: Number(it.unitPrice ?? it.unit_price ?? 0),
        discountPercent: Number(it.discountPercent ?? it.discount_percent ?? 0),
        total: Number(it.total || 0),
      }));
      const createdIso = String(r.created_at || new Date().toISOString());
      return {
        id: String(r.id || r.client_id || ''),
        quotationNo: String(
          r.quotation_no || r.quotationNo || `EST-${String(r.id || '').slice(0, 4).toUpperCase()}`
        ),
        customerName: String(r.customer_name || r.customerName || 'Walk-in Customer'),
        customerPhone: String(r.customer_phone || r.customerPhone || ''),
        customerAddress: String(r.customer_address || r.customerAddress || ''),
        date: String(r.date || createdIso.split('T')[0] || ''),
        validUntil: String(r.valid_until || r.validUntil || ''),
        items: normalizedItems,
        subtotal: Number(r.subtotal || 0),
        discount: Number(r.discount || 0),
        taxPercent: Number(r.tax_percent ?? r.taxPercent ?? 0),
        taxAmount: Number(r.tax_amount ?? r.taxAmount ?? 0),
        grandTotal: Number(r.grand_total ?? r.final_amount ?? r.grandTotal ?? 0),
        status: this.normalizeQuotationStatus(r.status),
        notes: String(r.notes || ''),
        createdAt: createdIso,
      };
    });
  }

  public async upsertQuotation(quote: QuotationRecord): Promise<void> {
    const payload = {
      id: quote.id,
      quotation_no: quote.quotationNo || '',
      customer_name: quote.customerName || 'Walk-in Customer',
      customer_phone: quote.customerPhone || null,
      customer_address: quote.customerAddress || null,
      date: quote.date || new Date().toISOString().split('T')[0],
      valid_until: quote.validUntil || null,
      items: quote.items || [],
      subtotal: Number(quote.subtotal || 0),
      discount: Number(quote.discount || 0),
      tax_percent: Number(quote.taxPercent || 0),
      tax_amount: Number(quote.taxAmount || 0),
      grand_total: Number(quote.grandTotal ?? (quote as any).finalAmount ?? 0),
      status: quote.status || 'Draft',
      notes: quote.notes || '',
      created_at: quote.createdAt || new Date().toISOString(),
    };
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/quotations?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(resp, 'Save quotation');
  }

  // --- Ledger Accounts REST API ---
  public async fetchLedgerAccounts(): Promise<LedgerAccount[]> {
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/ledger_accounts?select=*&order=name.asc`,
      { method: 'GET' },
      false
    );
    await this.assertOk(resp, 'Fetch ledger accounts');
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => ({
      id: String(r.id || r.client_id || ''),
      name: String(r.name || ''),
      phone: String(r.phone || ''),
      address: String(r.address || ''),
      type: (String(r.type || 'CUSTOMER').toUpperCase() === 'SUPPLIER'
        ? 'SUPPLIER'
        : 'CUSTOMER') as 'CUSTOMER' | 'SUPPLIER',
      netBalance: Number(r.net_balance ?? r.netBalance ?? 0),
      creditLimit: Number(r.credit_limit ?? r.creditLimit ?? 0),
      notes: String(r.notes || ''),
      createdAt: String(r.created_at || new Date().toISOString()),
      updatedAt: String(r.updated_at || r.created_at || new Date().toISOString()),
    }));
  }

  public async upsertLedgerAccount(account: LedgerAccount): Promise<void> {
    const payload = {
      id: account.id,
      name: account.name,
      phone: account.phone || '',
      address: account.address || '',
      type: account.type,
      net_balance: Number(account.netBalance || 0),
      credit_limit: Number(account.creditLimit || 0),
      notes: account.notes || '',
      created_at: account.createdAt || new Date().toISOString(),
      updated_at: account.updatedAt || new Date().toISOString(),
    };
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/ledger_accounts?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(resp, 'Save ledger account');
  }

  // --- Ledger Entries REST API ---
  public async fetchLedgerEntries(accountId?: string): Promise<LedgerEntry[]> {
    const endpoint = accountId
      ? `${this.getCleanUrl()}/rest/v1/ledger_entries?select=*&account_id=eq.${encodeURIComponent(accountId)}&order=created_at.desc`
      : `${this.getCleanUrl()}/rest/v1/ledger_entries?select=*&order=created_at.desc`;
    const resp = await this.authorizedFetch(endpoint, { method: 'GET' }, false);
    await this.assertOk(resp, 'Fetch ledger entries');
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => {
      const createdIso = String(r.created_at || new Date().toISOString());
      const rawType = String(r.type || r.entry_type || 'GAVE').toUpperCase();
      return {
        id: String(r.id || r.client_id || ''),
        accountId: String(r.account_id || r.accountId || ''),
        type: (rawType === 'GOT' ? 'GOT' : 'GAVE') as 'GAVE' | 'GOT',
        amount: Number(r.amount || 0),
        balanceAfter: Number(r.balance_after ?? r.balanceAfter ?? 0),
        date: String(r.date || createdIso.split('T')[0] || ''),
        description: String(r.description ?? r.note ?? ''),
        billRef: String(r.bill_ref || r.billRef || ''),
        createdAt: createdIso,
      };
    });
  }

  public async insertLedgerEntry(entry: LedgerEntry): Promise<void> {
    const payload = {
      id: entry.id,
      account_id: entry.accountId,
      type: (entry as any).entryType || entry.type || 'GAVE',
      amount: Number(entry.amount || 0),
      balance_after: Number(entry.balanceAfter ?? 0),
      date: entry.date || new Date().toISOString().split('T')[0],
      description: entry.description ?? (entry as any).note ?? '',
      bill_ref: entry.billRef || '',
      created_at: entry.createdAt || new Date().toISOString(),
    };
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/ledger_entries?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(resp, 'Save ledger entry');
  }

  public async deleteMultipleItems(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteItem(id);
    }
  }

  public async upsertLedgerEntry(entry: any): Promise<void> {
    return this.insertLedgerEntry(entry);
  }

  public async insertPurchaseRecord(purchase: any): Promise<void> {
    const payload = {
      client_id: purchase.client_id || purchase.clientId || generateUUID(),
      supplier: purchase.supplier || '',
      bill_no: purchase.bill_no || purchase.billNo || '',
      bill_date: purchase.bill_date || purchase.billDate || new Date().toISOString().slice(0, 10),
      total: Number(purchase.total || 0),
      lines: purchase.lines || [],
      created_at: purchase.created_at || purchase.createdAt || new Date().toISOString(),
    };
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/purchases`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      true
    );
    await this.assertOk(resp, 'Save purchase record');
  }

  public async deleteQuotation(id: string): Promise<void> {
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/quotations?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      true
    );
    await this.assertOk(resp, 'Delete quotation');
  }

  public async deleteLedgerAccount(id: string): Promise<void> {
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/ledger_accounts?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      true
    );
    await this.assertOk(resp, 'Delete ledger account');
  }

  public async deleteLedgerEntry(id: string): Promise<void> {
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/ledger_entries?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      true
    );
    await this.assertOk(resp, 'Delete ledger entry');
  }

  public async insertCashflowRecord(record: any): Promise<void> {
    return this.upsertCashflow(record);
  }

  public async deleteCashflowRecord(id: string): Promise<void> {
    const resp = await this.authorizedFetch(
      `${this.getCleanUrl()}/rest/v1/daily_cashflow?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      true
    );
    await this.assertOk(resp, 'Delete cashflow');
  }
}

export const supabaseService = new SupabaseService();
