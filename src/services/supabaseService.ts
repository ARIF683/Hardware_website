import { Item, TransactionRecord, DailyCashflowRecord, QuotationRecord, LedgerAccount, LedgerEntry } from '../types';

export const SUPABASE_URL = "https://xkjvcufajsyqbzjjllma.supabase.co";
export const SUPABASE_KEY = "sb_publishable_sXokssWnrTPWROtmfHjoWA_LRqVPt8V";

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

  constructor() {
    const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('hardware_supabase_url') : null;
    const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('hardware_supabase_key') : null;
    this.url = (storedUrl && storedUrl.includes('supabase.co')) ? storedUrl : SUPABASE_URL;
    this.key = (storedKey && storedKey.startsWith('sb_publishable_')) ? storedKey : SUPABASE_KEY;
  }

  public updateCredentials(url: string, key: string) {
    this.url = url || SUPABASE_URL;
    this.key = key || SUPABASE_KEY;
  }

  public getHeaders(): HeadersInit {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
  }

  // --- Realtime WebSocket Channel Listener ---
  public connectRealtime(listener: any) {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }

    try {
      const wsUrl = `${this.url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${this.key}&vsn=1.0.0`;
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
          const payload = msg.payload;
          const topic = msg.topic || "";
          const record = payload?.record || payload?.new || msg.record || payload?.data?.record || payload?.data?.new;
          const oldRecord = payload?.old_record || payload?.old || msg.old_record;
          const evtType = payload?.type || msg.event || payload?.data?.type || "UPDATE";
          const table = payload?.table || payload?.data?.table || topic.split(":")[2] || "";

          if (topic.includes("purchases") || table === "purchases" || record?.supplier === "__STORE_PROFILE__" || record?.client_id === "00000000-0000-0000-0000-000000000001") {
            const clientId = record?.client_id;
            const supplier = record?.supplier;
            if (clientId === "00000000-0000-0000-0000-000000000001" || supplier === "__STORE_PROFILE__") {
              const lines = record?.lines;
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
          } else if (listener && typeof listener.onItemChanged === "function") {
            if (topic.includes("items") || table === "items" || (!table && record?.name !== undefined)) {
              listener.onItemChanged(evtType, record, oldRecord?.id || record?.id);
            }
          }
        } catch (e) {
          console.error("Realtime parsing error", e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn("Realtime WS error", err);
      };

      this.ws.onclose = () => {
        clearInterval(this.heartbeatInterval);
      };
    } catch (e) {
      console.warn("Failed to initialize WebSocket", e);
    }
  }

  public disconnectRealtime() {
    clearInterval(this.heartbeatInterval);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  // --- Store Profile Sync (Banner & Avatar) ---
  public async fetchStoreProfile(): Promise<{ bannerUrl: string | null; logoUrl: string | null } | null> {
    try {
      const resp = await fetch(
        `${this.url}/rest/v1/purchases?client_id=eq.00000000-0000-0000-0000-000000000001&limit=1`,
        {
          method: "GET",
          headers: this.getHeaders()
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
      console.error("Failed to fetch store profile from Supabase:", e);
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
      const resp = await fetch(`${this.url}/rest/v1/purchases?on_conflict=client_id`, {
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
      const signResp = await fetch(`${this.url}/functions/v1/sign-cloudinary-upload`, {
        method: 'POST',
        headers: {
          'apikey': this.key,
          'Authorization': `Bearer ${this.key}`,
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
    const resp = await fetch(`${this.url}/rest/v1/items?select=*&order=name.asc`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    if (!resp.ok) throw new Error(`Fetch items failed: ${resp.statusText}`);
    const rows = await resp.json();
    return rows.map((r: any) => ({
      id: r.id || r.client_id,
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
      mrp: r.mrp ? Number(r.mrp) : undefined,
      imageUrl: r.image_url || undefined,
      aliases: r.aliases || '',
      updatedAt: r.updated_at || new Date().toISOString()
    }));
  }

    public async updateItemImage(id: string, imageUrl: string | null): Promise<void> {
    const resp = await fetch(`${this.url}/rest/v1/items?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error('Update item image failed:', err);
      throw new Error(`Failed to update item image: ${err}`);
    }
    const data = await resp.json();
    if (!data || data.length === 0) {
      throw new Error(`Item with id ${id} not found in database`);
    }
  }

  public async upsertItem(item: Item): Promise<void> {
    const payload = {
      id: item.id,
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
    const patchResp = await fetch(`${this.url}/rest/v1/items?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (patchResp.ok) {
      const data = await patchResp.json();
      if (data && data.length > 0) {
        return; // Successfully updated
      }
    }

    // 2. If row was not found, perform POST with on_conflict=id
    const postResp = await fetch(`${this.url}/rest/v1/items?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!postResp.ok) {
      const err = await postResp.text();
      console.error('Item upsert failed:', err);
      throw new Error(`Item save failed: ${err}`);
    }
  }

  public async deleteItem(id: string): Promise<void> {
    const resp = await fetch(`${this.url}/rest/v1/items?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    if (!resp.ok) console.error('Item delete failed', await resp.text());
  }

  public async updateItemQty(id: string, newQty: number): Promise<void> {
    const resp = await fetch(`${this.url}/rest/v1/items?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ qty: newQty, updated_at: new Date().toISOString() })
    });
    if (!resp.ok) console.error('Qty update failed', await resp.text());
  }

  // --- Transactions REST API ---
  public async fetchTransactions(): Promise<TransactionRecord[]> {
    const resp = await fetch(`${this.url}/rest/v1/stock_transactions?select=*&order=created_at.desc&limit=100`, {
      method: 'GET',
      headers: this.getHeaders()
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
    await fetch(`${this.url}/rest/v1/stock_transactions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
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
      let resp = await fetch(`${this.url}/rest/v1/daily_cashflow?select=*&order=date.desc`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!resp.ok) {
        resp = await fetch(`${this.url}/rest/v1/daily_cashflow?select=*&order=created_at.desc`, {
          method: 'GET',
          headers: this.getHeaders()
        });
      }

      if (!resp.ok) {
        resp = await fetch(`${this.url}/rest/v1/daily_cashflow?select=*`, {
          method: 'GET',
          headers: this.getHeaders()
        });
      }

      if (!resp.ok) return [];

      const rows = await resp.json();
      if (!Array.isArray(rows)) return [];

      return rows.map((r: any) => this.formatCashflowRecord(r));
    } catch (e) {
      console.error('fetchCashflow error', e);
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
      await fetch(`${this.url}/rest/v1/daily_cashflow?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('upsertCashflow error', e);
    }
  }

  // --- Quotations REST API ---
  public async fetchQuotations(): Promise<QuotationRecord[]> {
    const resp = await fetch(`${this.url}/rest/v1/quotations?select=*&order=created_at.desc`, {
      method: 'GET',
      headers: this.getHeaders()
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
    await fetch(`${this.url}/rest/v1/quotations`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
  }

  // --- Ledger Accounts REST API ---
  public async fetchLedgerAccounts(): Promise<LedgerAccount[]> {
    const resp = await fetch(`${this.url}/rest/v1/ledger_accounts?select=*&order=name.asc`, {
      method: 'GET',
      headers: this.getHeaders()
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
    await fetch(`${this.url}/rest/v1/ledger_accounts`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
  }

  // --- Ledger Entries REST API ---
  public async fetchLedgerEntries(accountId?: string): Promise<LedgerEntry[]> {
    const endpoint = accountId ? `${this.url}/rest/v1/ledger_entries?account_id=eq.${accountId}&order=created_at.desc` : `${this.url}/rest/v1/ledger_entries?select=*&order=created_at.desc`;
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: this.getHeaders()
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
    await fetch(`${this.url}/rest/v1/ledger_entries`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
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
      await fetch(`${this.url}/rest/v1/purchases`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(purchase)
      });
    } catch (e) {
      console.error("insertPurchaseRecord error", e);
    }
  }

  public async deleteQuotation(id: string) {
    try {
      await fetch(`${this.url}/rest/v1/quotations?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders()
      });
    } catch (e) {
      console.error("deleteQuotation error", e);
    }
  }

  public async deleteLedgerAccount(id: string) {
    try {
      await fetch(`${this.url}/rest/v1/ledger_accounts?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders()
      });
    } catch (e) {
      console.error("deleteLedgerAccount error", e);
    }
  }

  public async deleteLedgerEntry(id: string) {
    try {
      await fetch(`${this.url}/rest/v1/ledger_entries?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders()
      });
    } catch (e) {
      console.error("deleteLedgerEntry error", e);
    }
  }

  public async insertCashflowRecord(record: any) {
    return this.upsertCashflow(record);
  }

  public async deleteCashflowRecord(id: string) {
    try {
      await fetch(`${this.url}/rest/v1/daily_cashflow?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.getHeaders()
      });
    } catch (e) {
      console.error("deleteCashflowRecord error", e);
    }
  }

}


export const supabaseService = new SupabaseService();
