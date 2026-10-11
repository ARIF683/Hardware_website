import { Item, TransactionRecord, DailyCashflowRecord, QuotationRecord, LedgerAccount, LedgerEntry } from '../types';

export const SUPABASE_URL = "https://xkjvcufajsyqbzjjllma.supabase.co";
export const SUPABASE_KEY = "sb_publishable_sXokssWnrTPWROtmfHjoWA_LRqVPt8V";

// Helper to sanitize any user-provided or stored Supabase URL
export function cleanSupabaseUrl(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return SUPABASE_URL;
  let clean = raw.trim();
  if (!clean) return SUPABASE_URL;
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  try {
    const parsed = new URL(clean);
    // Origin strictly retains protocol and host (e.g. https://xyz.supabase.co), stripping any paths or trailing slashes
    return parsed.origin;
  } catch {
    clean = clean.replace(/\/+$/, '');
    clean = clean.replace(/\/rest\/v1.*$/i, '');
    clean = clean.replace(/\/rest.*$/i, '');
    clean = clean.replace(/\/+$/, '');
    return clean || SUPABASE_URL;
  }
}

// Helper to generate UUID for Supabase client_id
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper to compress image file using HTML5 canvas
function compressImageFile(file: File, maxWidth = 600, maxHeight = 600, quality = 0.7): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => {
      resolve({ blob: file, dataUrl: '' });
    };
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string || '';
      const img = new Image();
      img.onerror = () => {
        resolve({ blob: file, dataUrl });
      };
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
          return resolve({ blob: file, dataUrl });
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (blob) => {
            resolve({ blob: blob || file, dataUrl: compressedDataUrl });
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

class SupabaseService {
  private url: string;
  private key: string;
  private ws: WebSocket | null = null;
  private heartbeatInterval: any = null;
  private reconnectTimeout: any = null;
  private currentListener: any = null;
  private isExplicitlyClosed = false;

  constructor() {
    const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL;
    const envKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY;
    const defaultUrl = cleanSupabaseUrl(envUrl || SUPABASE_URL);
    const defaultKey = (envKey && envKey.trim()) ? envKey.trim() : SUPABASE_KEY;

    const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('hardware_supabase_url') : null;
    const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('hardware_supabase_key') : null;
    
    // Auto-repair any stored URL in localStorage
    this.url = cleanSupabaseUrl(storedUrl || defaultUrl);
    if (storedUrl && storedUrl !== this.url) {
      try { localStorage.setItem('hardware_supabase_url', this.url); } catch {}
    }
    this.key = (storedKey && storedKey.trim().length > 10) ? storedKey.trim() : defaultKey;
  }

  public updateCredentials(url: string, key: string) {
    this.url = cleanSupabaseUrl(url);
    const cleanK = (key || '').trim().replace(/^Bearer\s+/i, '').replace(/^["']+|["']+$/g, '').trim();
    this.key = (cleanK && cleanK.length > 10) ? cleanK : SUPABASE_KEY;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('hardware_supabase_url', this.url);
        localStorage.setItem('hardware_supabase_key', this.key);
      } catch {}
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

  public getHeaders(isMutation = false): HeadersInit {
    const cleanKey = this.getCleanKey();
    const headers: Record<string, string> = {
      'apikey': cleanKey,
      'Authorization': `Bearer ${cleanKey}`
    };
    if (isMutation) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  // Broadcast a real-time event across all open tabs/devices on the same Supabase project
  public broadcastChange(table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          topic: `realtime:public:${table}`,
          event: "broadcast",
          payload: {
            type: "broadcast",
            event: "db_change",
            table,
            data: {
              type,
              table,
              record,
              new: record
            }
          },
          ref: `bc_${Date.now()}`
        }));
      } catch (e) {
        console.warn('Realtime broadcast notice:', e);
      }
    }
  }

  // --- Realtime WebSocket Channel Listener ---
  public connectRealtime(listener: any) {
    this.currentListener = listener;
    this.isExplicitlyClosed = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    try {
      const cleanUrl = this.getCleanUrl();
      const cleanKey = this.getCleanKey();
      const wsUrl = `${cleanUrl.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${cleanKey}&vsn=1.0.0`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Join realtime broadcast channels for all tables
        const tables = ["items", "purchases", "daily_cashflow", "quotations", "ledger_accounts", "ledger_entries"];
        tables.forEach(table => {
          this.ws?.send(JSON.stringify({
            topic: `realtime:public:${table}`,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { self: false },
                presence: { key: "" },
                postgres_changes: [{ event: "*", schema: "public", table }]
              }
            },
            ref: `join_${table}_${Date.now()}`
          }));
        });

        // Also join general public topic
        this.ws?.send(JSON.stringify({
          topic: "realtime:public",
          event: "phx_join",
          payload: {},
          ref: "public_1"
        }));

        // Keepalive heartbeat
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              topic: "phoenix",
              event: "heartbeat",
              payload: {},
              ref: "hb"
            }));
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "phx_reply" || msg.event === "system") return;

          const payload = msg.payload;
          const topic = msg.topic || "";
          const data = payload?.data;

          // Support both postgres_changes and Phoenix broadcast
          const isBroadcast = msg.event === "broadcast" || payload?.type === "broadcast";
          const record = data?.record || payload?.record || payload?.new || msg.record || data?.new;
          const oldRecord = data?.old_record || payload?.old_record || payload?.old || msg.old_record;
          const rawType = data?.type || payload?.type || (isBroadcast ? (data?.type || "UPDATE") : (msg.event !== "postgres_changes" ? msg.event : "UPDATE"));
          const evtType = String(rawType || "UPDATE").toUpperCase();
          const table = String(data?.table || payload?.table || topic.split(":")[2] || "").toLowerCase();

          // Ensure DELETE record carries the id from oldRecord if record is empty
          const effectiveRecord = record || (oldRecord ? { id: oldRecord.id } : null);
          const effectiveId = effectiveRecord?.id || oldRecord?.id;

          if (topic.includes("purchases") || table === "purchases" || effectiveRecord?.supplier === "__STORE_PROFILE__" || effectiveRecord?.client_id === "00000000-0000-0000-0000-000000000001") {
            const clientId = effectiveRecord?.client_id;
            const supplier = effectiveRecord?.supplier;
            if (clientId === "00000000-0000-0000-0000-000000000001" || supplier === "__STORE_PROFILE__") {
              const lines = effectiveRecord?.lines;
              const first = Array.isArray(lines) ? lines[0] : (typeof lines === "string" ? JSON.parse(lines)[0] : null);
              const banner = first?.bannerUrl || null;
              const logo = first?.logoUrl || first?.avatarUrl || null;
              if (listener && typeof listener.onStoreProfileChanged === "function") {
                listener.onStoreProfileChanged(banner, logo);
              }
            }
          }

          if (typeof listener === "function") {
            listener(msg.payload || msg);
          } else if (listener && typeof listener === "object") {
            if (table === "items" || topic.includes("items") || (!table && effectiveRecord?.name !== undefined)) {
              if (typeof listener.onItemChanged === "function") {
                listener.onItemChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === "daily_cashflow" || topic.includes("daily_cashflow")) {
              if (typeof listener.onCashflowChanged === "function") {
                listener.onCashflowChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === "quotations" || topic.includes("quotations")) {
              if (typeof listener.onQuotationChanged === "function") {
                listener.onQuotationChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === "ledger_accounts" || topic.includes("ledger_accounts")) {
              if (typeof listener.onLedgerAccountChanged === "function") {
                listener.onLedgerAccountChanged(evtType, effectiveRecord, effectiveId);
              }
            } else if (table === "ledger_entries" || topic.includes("ledger_entries")) {
              if (typeof listener.onLedgerEntryChanged === "function") {
                listener.onLedgerEntryChanged(evtType, effectiveRecord, effectiveId);
              }
            }
          }
        } catch (e) {
          console.error("Realtime parsing error", e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn("Realtime WS notice", err);
      };

      this.ws.onclose = () => {
        clearInterval(this.heartbeatInterval);
        // Automatic reconnection if not explicitly closed
        if (!this.isExplicitlyClosed) {
          this.reconnectTimeout = setTimeout(() => {
            if (!this.isExplicitlyClosed && this.currentListener) {
              console.log("Reconnecting Supabase Realtime WebSocket...");
              this.connectRealtime(this.currentListener);
            }
          }, 3500);
        }
      };
    } catch (e) {
      console.warn("Notice: Realtime WebSocket unavailable", e);
    }
  }

  public disconnectRealtime() {
    this.isExplicitlyClosed = true;
    clearInterval(this.heartbeatInterval);
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  // --- Store Profile Sync (Banner & Avatar) ---
  public async fetchStoreProfile(): Promise<{ bannerUrl: string | null; logoUrl: string | null } | null> {
    try {
      const resp = await fetch(
        `${this.getCleanUrl()}/rest/v1/purchases?client_id=eq.00000000-0000-0000-0000-000000000001&limit=1`,
        {
          method: "GET",
          headers: this.getHeaders(false)
        }
      );
      if (!resp.ok) return null;
      const list = await resp.json();
      if (Array.isArray(list) && list.length > 0) {
        const row = list[0];
        const lines = row.lines;
        const first = Array.isArray(lines) ? lines[0] : (typeof lines === "string" ? JSON.parse(lines)[0] : null);
        if (first) {
          return {
            bannerUrl: (first.bannerUrl && typeof first.bannerUrl === "string" && first.bannerUrl.trim() !== "") ? first.bannerUrl.trim() : null,
            logoUrl: (first.logoUrl && typeof first.logoUrl === "string" && first.logoUrl.trim() !== "") ? first.logoUrl.trim() : ((first.avatarUrl && typeof first.avatarUrl === "string" && first.avatarUrl.trim() !== "") ? first.avatarUrl.trim() : null)
          };
        }
      }
      return null;
    } catch (e) {
      console.warn("Notice: Store profile fetch skipped (network/offline):", e);
      return null;
    }
  }

  public async saveStoreProfile(bannerUrl: string | null, logoUrl: string | null): Promise<void> {
    try {
      const payload = {
        client_id: "00000000-0000-0000-0000-000000000001",
        supplier: "__STORE_PROFILE__",
        bill_no: "CONFIG",
        bill_date: new Date().toISOString().slice(0, 10),
        total: 0,
        lines: [
          {
            bannerUrl: bannerUrl || "",
            logoUrl: logoUrl || "",
            avatarUrl: logoUrl || ""
          }
        ]
      };
      const resp = await fetch(`${this.getCleanUrl()}/rest/v1/purchases?on_conflict=client_id`, {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.error("Failed to save store profile to Supabase:", err);
      } else {
        console.log("Successfully saved store profile to Supabase");
        this.broadcastChange('purchases', 'UPDATE', payload);
      }
    } catch (e) {
      console.error("saveStoreProfile error:", e);
    }
  }

  // Upload image to Cloudinary using Supabase Edge Function signature with client-side canvas fallback
  public async uploadImageToCloudinary(file: File): Promise<string> {
    let compressedDataUrl = '';
    let uploadBlob: Blob = file;

    try {
      const compressed = await compressImageFile(file, 600, 600, 0.7);
      uploadBlob = compressed.blob;
      compressedDataUrl = compressed.dataUrl;
    } catch (e) {
      console.warn('Canvas compression error:', e);
    }

    try {
      // Direct CORS-safe call to edge function without 'Prefer' header
      const signResp = await fetch(`${this.getCleanUrl()}/functions/v1/sign-cloudinary-upload`, {
        method: 'POST',
        headers: {
          'apikey': this.getCleanKey(),
          'Authorization': `Bearer ${this.getCleanKey()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folder: 'items' })
      });

      if (!signResp.ok) {
        throw new Error(`Edge function signing error: ${await signResp.text()}`);
      }

      const { signature, timestamp, apiKey, cloudName, folder } = await signResp.json();
      if (!signature || !cloudName) {
        throw new Error('Incomplete response from signature edge function');
      }

      const formData = new FormData();
      formData.append('file', uploadBlob, 'image.jpg');
      formData.append('api_key', apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('signature', signature);
      formData.append('folder', folder || 'items');

      const uploadResp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!uploadResp.ok) {
        throw new Error(`Cloudinary upload failed: ${await uploadResp.text()}`);
      }

      const data = await uploadResp.json();
      return data.secure_url || data.url || compressedDataUrl;
    } catch (e) {
      console.warn('Cloudinary upload network error, falling back to local compressed image:', e);
      if (compressedDataUrl) {
        return compressedDataUrl;
      }
      const fallback = await compressImageFile(file, 600, 600, 0.7);
      return fallback.dataUrl;
    }
  }

  // --- Items REST API ---
  public async fetchAllItems(): Promise<Item[]> { return this.fetchItems(); }
  public async fetchItems(): Promise<Item[]> {
    try {
      const resp = await fetch(`${this.getCleanUrl()}/rest/v1/items?select=*&order=name.asc`, {
        method: 'GET',
        headers: this.getHeaders(false)
      });
      if (resp.ok) {
        const rows = await resp.json();
        return rows.map((r: any) => this.mapItemRow(r));
      }
      // If 401/403 with custom key, fall back to default credentials
      if ((resp.status === 401 || resp.status === 403) && this.getCleanKey() !== SUPABASE_KEY) {
        console.warn('Custom Supabase credentials rejected (401/403). Falling back to default project credentials.');
        const retry = await fetch(`${SUPABASE_URL}/rest/v1/items?select=*&order=name.asc`, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });
        if (retry.ok) {
          const rows = await retry.json();
          this.updateCredentials(SUPABASE_URL, SUPABASE_KEY);
          return rows.map((r: any) => this.mapItemRow(r));
        }
      }
      throw new Error(`Fetch items failed: ${resp.status} ${resp.statusText}`);
    } catch (err: any) {
      if (this.getCleanKey() !== SUPABASE_KEY || this.getCleanUrl() !== SUPABASE_URL) {
        try {
          const retry = await fetch(`${SUPABASE_URL}/rest/v1/items?select=*&order=name.asc`, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });
          if (retry.ok) {
            const rows = await retry.json();
            this.updateCredentials(SUPABASE_URL, SUPABASE_KEY);
            return rows.map((r: any) => this.mapItemRow(r));
          }
        } catch {}
      }
      throw err;
    }
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
      updatedAt: r.updated_at || new Date().toISOString()
    };
  }

  public async updateItemImage(id: string, imageUrl: string | null): Promise<void> {
    const cleanId = (id || '').trim();
    const resp = await fetch(`${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`, {
      method: 'PATCH',
      headers: {
        ...this.getHeaders(true),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.warn('Update item image notice:', err);
      throw new Error(`Failed to update item image: ${err}`);
    }
    const data = await resp.json();
    if (!data || data.length === 0) {
      throw new Error(`Item with id ${id} not found in database`);
    }
    this.broadcastChange('items', 'UPDATE', { id: cleanId, image_url: imageUrl, updated_at: new Date().toISOString() });
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
      updated_at: item.updatedAt || new Date().toISOString()
    };

    // 1. First try PATCH by ID
    const patchResp = await fetch(`${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`, {
      method: 'PATCH',
      headers: {
        ...this.getHeaders(true),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (patchResp.ok) {
      const data = await patchResp.json();
      if (data && data.length > 0) {
        this.broadcastChange('items', 'UPDATE', payload);
        return; // Successfully updated
      }
    }

    // 2. If row was not found, perform POST with on_conflict=id
    const postResp = await fetch(`${this.getCleanUrl()}/rest/v1/items?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!postResp.ok) {
      const err = await postResp.text();
      console.warn('Item upsert notice:', err);
      throw new Error(`Item save failed: ${err}`);
    }
    this.broadcastChange('items', 'UPDATE', payload);
  }

  public async deleteItem(id: string): Promise<void> {
    const cleanId = (id || '').trim();
    const resp = await fetch(`${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
      headers: this.getHeaders(true)
    });
    if (!resp.ok) console.warn('Item delete notice:', await resp.text());
    this.broadcastChange('items', 'DELETE', { id: cleanId });
  }

  public async updateItemQty(id: string, newQty: number): Promise<void> {
    if (!id || typeof id !== 'string') {
      console.warn('updateItemQty skipped: invalid item id', id);
      return;
    }
    const cleanId = id.trim();
    if (!cleanId) return;

    // Use clean sanitized base URL (never double-slash or nested path) and ensure Content-Type: application/json
    const endpoint = `${this.getCleanUrl()}/rest/v1/items?id=eq.${encodeURIComponent(cleanId)}`;
    const resp = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        ...this.getHeaders(true),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ qty: Number(newQty) || 0, updated_at: new Date().toISOString() })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Qty update failed:', errText, 'Endpoint:', endpoint);
      throw new Error(`Qty update failed: ${errText}`);
    }
    // Broadcast real-time stock change so other devices/windows update immediately
    this.broadcastChange('items', 'UPDATE', { id: cleanId, qty: Number(newQty) || 0, updated_at: new Date().toISOString() });
  }

  // --- Transactions REST API ---
  public async fetchTransactions(): Promise<TransactionRecord[]> {
    try {
      const resp = await fetch(`${this.getCleanUrl()}/rest/v1/stock_transactions?select=*&order=created_at.desc&limit=100`, {
        method: 'GET',
        headers: this.getHeaders(false)
      });
      if (!resp.ok) return [];
      const rows = await resp.json();
      return rows.map((r: any) => ({
        clientId: r.client_id || r.id,
        itemId: r.item_id,
        itemName: r.item_name,
        action: r.action,
        qty: Number(r.qty),
        balance: Number(r.balance),
        unit: r.unit || 'pcs',
        note: r.note || '',
        createdAt: r.created_at || new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Notice: Transaction fetch skipped:', e);
      return [];
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
      created_at: tx.createdAt
    };
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/stock_transactions`, {
        method: 'POST',
        headers: this.getHeaders(true),
        body: JSON.stringify(payload)
      });
      this.broadcastChange('stock_transactions', 'INSERT', payload);
    } catch (e) {
      console.warn('insertTransaction warning:', e);
    }
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
    if (r.type && (String(r.type).toUpperCase() === 'EXPENSE' || String(r.type).toUpperCase() === 'SALE')) {
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
      id: String(r.id || r.client_id || Math.random().toString()),
      date: rawDate,
      type: rawType,
      category: String(r.category || 'General'),
      amount: rawAmount,
      paymentMode: rawPaymentMode as any,
      note: String(r.note || ''),
      createdAt: String(r.created_at || r.updated_at || new Date().toISOString())
    };
  }

  public async fetchDailyCashflows(): Promise<DailyCashflowRecord[]> { return this.fetchCashflow(); }

  public async fetchCashflow(): Promise<DailyCashflowRecord[]> {
    try {
      let resp = await fetch(`${this.getCleanUrl()}/rest/v1/daily_cashflow?select=*&order=date.desc`, {
        method: 'GET',
        headers: this.getHeaders(false)
      });

      if (!resp.ok) {
        resp = await fetch(`${this.getCleanUrl()}/rest/v1/daily_cashflow?select=*&order=created_at.desc`, {
          method: 'GET',
          headers: this.getHeaders(false)
        });
      }

      if (!resp.ok) {
        resp = await fetch(`${this.getCleanUrl()}/rest/v1/daily_cashflow?select=*`, {
          method: 'GET',
          headers: this.getHeaders(false)
        });
      }

      if (!resp.ok) return [];

      const rows = await resp.json();
      if (!Array.isArray(rows)) return [];

      return rows.map((r: any) => this.formatCashflowRecord(r));
    } catch (e) {
      console.warn('Notice: Cashflow sync skipped (network/offline):', e);
      return [];
    }
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
      created_at: cf.createdAt || new Date().toISOString()
    };
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/daily_cashflow?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(true),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
      this.broadcastChange('daily_cashflow', 'UPDATE', payload);
    } catch (e) {
      console.warn('upsertCashflow warning:', e);
    }
  }

  // --- Quotations REST API ---
  public async fetchQuotations(): Promise<QuotationRecord[]> {
    try {
      const resp = await fetch(`${this.getCleanUrl()}/rest/v1/quotations?select=*&order=created_at.desc`, {
        method: 'GET',
        headers: this.getHeaders(false)
      });
      if (!resp.ok) return [];
      const rows = await resp.json();
      return rows.map((r: any) => ({
        id: r.id || r.client_id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone || '',
        items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
        subtotal: Number(r.subtotal || 0),
        discount: Number(r.discount || 0),
        finalAmount: Number(r.final_amount || 0),
        status: r.status || 'DRAFT',
        createdAt: r.created_at || new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Notice: Quotations sync skipped:', e);
      return [];
    }
  }

  public async upsertQuotation(quote: QuotationRecord): Promise<void> {
    const payload = {
      id: quote.id,
      customer_name: quote.customerName,
      customer_phone: quote.customerPhone,
      items: JSON.stringify(quote.items),
      subtotal: quote.subtotal,
      discount: quote.discount,
      final_amount: (quote as any).finalAmount || quote.grandTotal,
      status: quote.status,
      created_at: quote.createdAt
    };
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/quotations`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(true),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
      this.broadcastChange('quotations', 'UPDATE', payload);
    } catch (e) {
      console.warn('upsertQuotation warning:', e);
    }
  }

  // --- Ledger Accounts REST API ---
  public async fetchLedgerAccounts(): Promise<LedgerAccount[]> {
    try {
      const resp = await fetch(`${this.getCleanUrl()}/rest/v1/ledger_accounts?select=*&order=name.asc`, {
        method: 'GET',
        headers: this.getHeaders(false)
      });
      if (!resp.ok) return [];
      const rows = await resp.json();
      return rows.map((r: any) => ({
        id: r.id || r.client_id,
        name: r.name,
        phone: r.phone || '',
        type: r.type || 'CUSTOMER',
        netBalance: Number(r.net_balance || 0),
        updatedAt: r.updated_at || new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Notice: Ledger accounts fetch skipped:', e);
      return [];
    }
  }

  public async upsertLedgerAccount(account: LedgerAccount): Promise<void> {
    const payload = {
      id: account.id,
      name: account.name,
      phone: account.phone,
      type: account.type,
      net_balance: account.netBalance,
      updated_at: account.updatedAt
    };
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/ledger_accounts`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(true),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
      this.broadcastChange('ledger_accounts', 'UPDATE', payload);
    } catch (e) {
      console.warn('upsertLedgerAccount warning:', e);
    }
  }

  // --- Ledger Entries REST API ---
  public async fetchLedgerEntries(accountId?: string): Promise<LedgerEntry[]> {
    try {
      const endpoint = accountId
        ? `${this.getCleanUrl()}/rest/v1/ledger_entries?select=*&account_id=eq.${accountId}&order=created_at.desc`
        : `${this.getCleanUrl()}/rest/v1/ledger_entries?select=*&order=created_at.desc`;
      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: this.getHeaders(false)
      });
      if (!resp.ok) return [];
      const rows = await resp.json();
      return rows.map((r: any) => ({
        id: r.id || r.client_id,
        accountId: r.account_id,
        entryType: r.entry_type,
        amount: Number(r.amount),
        note: r.note || '',
        createdAt: r.created_at || new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Notice: Ledger entries fetch skipped:', e);
      return [];
    }
  }

  public async insertLedgerEntry(entry: LedgerEntry): Promise<void> {
    const payload = {
      id: entry.id,
      account_id: entry.accountId,
      entry_type: (entry as any).entryType || entry.type,
      amount: entry.amount,
      note: (entry as any).note || entry.description,
      created_at: entry.createdAt
    };
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/ledger_entries`, {
        method: 'POST',
        headers: this.getHeaders(true),
        body: JSON.stringify(payload)
      });
      this.broadcastChange('ledger_entries', 'INSERT', payload);
    } catch (e) {
      console.warn('insertLedgerEntry warning:', e);
    }
  }

  // Helper aliases
  public async deleteMultipleItems(ids: string[]) {
    for (const id of ids) {
      await this.deleteItem(id);
    }
  }

  public async upsertLedgerEntry(entry: any) {
    return this.insertLedgerEntry(entry);
  }

  public async insertPurchaseRecord(purchase: any) {
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/purchases`, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(purchase)
      });
      this.broadcastChange('purchases', 'INSERT', purchase);
    } catch (e) {
      console.warn("insertPurchaseRecord warning:", e);
    }
  }

  public async deleteQuotation(id: string) {
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/quotations?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders(true)
      });
      this.broadcastChange('quotations', 'DELETE', { id });
    } catch (e) {
      console.warn("deleteQuotation warning:", e);
    }
  }

  public async deleteLedgerAccount(id: string) {
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/ledger_accounts?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders(true)
      });
      this.broadcastChange('ledger_accounts', 'DELETE', { id });
    } catch (e) {
      console.warn("deleteLedgerAccount warning:", e);
    }
  }

  public async deleteLedgerEntry(id: string) {
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/ledger_entries?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders(true)
      });
      this.broadcastChange('ledger_entries', 'DELETE', { id });
    } catch (e) {
      console.warn("deleteLedgerEntry warning:", e);
    }
  }

  public async insertCashflowRecord(record: any) {
    return this.upsertCashflow(record);
  }

  public async deleteCashflowRecord(id: string) {
    try {
      await fetch(`${this.getCleanUrl()}/rest/v1/daily_cashflow?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders(true)
      });
      this.broadcastChange('daily_cashflow', 'DELETE', { id });
    } catch (e) {
      console.warn("deleteCashflowRecord warning:", e);
    }
  }

}


export const supabaseService = new SupabaseService();
