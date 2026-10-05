import { Item, TransactionRecord, DailyCashflowRecord } from '../types';

export const SUPABASE_URL = "https://xkjvcufajsyqbzjjllma.supabase.co";
export const SUPABASE_KEY = "sb_publishable_sXokssWnrTPWROtmfHjoWA_LRqVPt8V";

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

class SupabaseService {
  private url: string;
  private key: string;
  private ws: WebSocket | null = null;
  private heartbeatInterval: any = null;

  constructor() {
    this.url = localStorage.getItem('hardware_supabase_url') || SUPABASE_URL;
    this.key = localStorage.getItem('hardware_supabase_key') || SUPABASE_KEY;
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

  public async fetchAllItems(): Promise<Item[]> {
    try {
      const resp = await fetch(`${this.url}/rest/v1/items?select=*&order=o.asc&limit=1000`, {
        headers: this.getHeaders()
      });
      if (!resp.ok) {
        throw new Error(`Failed to fetch items: ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json();
      return (data || []).map((row: any) => ({
        id: String(row.id || ''),
        o: typeof row.o === 'number' ? row.o : 0,
        name: String(row.name || ''),
        code: String(row.code || ''),
        barcode: String(row.barcode || ''),
        type: String(row.type || 'General'),
        brand: String(row.brand || ''),
        size: String(row.size || ''),
        aliases: String(row.aliases || ''),
        mrp: row.mrp !== null && row.mrp !== undefined ? Number(row.mrp) : null,
        cost: Number(row.cost || 0),
        price: Number(row.price || 0),
        qty: Number(row.qty || 0),
        low: Number(row.low || 0),
        unit: String(row.unit || 'pcs').trim() || 'pcs',
        updatedAt: String(row.updated_at || new Date().toISOString())
      }));
    } catch (e) {
      console.warn('Supabase fetchAllItems failed', e);
      throw e;
    }
  }

  public async fetchTransactions(limit: number = 500): Promise<TransactionRecord[]> {
    try {
      const resp = await fetch(`${this.url}/rest/v1/transactions?select=*&order=created_at.desc&limit=${limit}`, {
        headers: this.getHeaders()
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data || []).map((row: any) => ({
        clientId: String(row.id || row.client_id || `tx_${Date.now()}`),
        itemId: row.item_id ? String(row.item_id) : null,
        itemName: String(row.item_name || 'Item'),
        action: row.action === 'out' ? 'out' : 'in',
        qty: Number(row.qty || 0),
        balance: Number(row.balance || 0),
        note: String(row.note || ''),
        unit: String(row.unit || 'pcs'),
        createdAt: String(row.created_at || new Date().toISOString())
      }));
    } catch (e) {
      console.warn('Supabase fetchTransactions failed', e);
      return [];
    }
  }

  public async fetchDailyCashflows(limit: number = 500): Promise<DailyCashflowRecord[]> {
    const resultList: DailyCashflowRecord[] = [];
    const seenIds = new Set<string>();

    // 1. Fetch from purchases
    try {
      const resp = await fetch(`${this.url}/rest/v1/purchases?select=*&order=created_at.desc&limit=${limit}`, {
        headers: this.getHeaders()
      });
      if (resp.ok) {
        const data = await resp.json();
        for (const row of (data || [])) {
          const isSale = row.type === 'SALE' || (row.supplier && String(row.supplier).toLowerCase().includes('sale'));
          const categoryName = row.category || row.supplier || (row.lines && row.lines[0] && (row.lines[0].name || row.lines[0].bill_name)) || (isSale ? 'Counter Sale' : 'Purchase / Expense');
          const firstLineNote = row.lines && row.lines[0] ? (row.lines[0].name || row.lines[0].bill_name) : '';
          const recId = String(row.client_id || row.id || `cf_${Date.now()}`);
          if (!seenIds.has(recId)) {
            seenIds.add(recId);
            resultList.push({
              id: recId,
              date: String(row.bill_date || row.date || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0])),
              type: isSale ? 'SALE' : 'EXPENSE',
              category: String(categoryName),
              amount: Number(row.total || row.amount || 0),
              paymentMode: (row.payment_mode || row.paymentMode || 'Cash') as any,
              note: String(row.note || firstLineNote || (row.bill_no ? `Bill #${row.bill_no}` : '')),
              createdAt: String(row.created_at || row.createdAt || new Date().toISOString())
            });
          }
        }
      }
    } catch (e) {
      console.warn('Fetch purchases in website warning', e);
    }

    // 2. Fetch from daily_cashflow
    try {
      const resp = await fetch(`${this.url}/rest/v1/daily_cashflow?select=*&order=created_at.desc&limit=${limit}`, {
        headers: this.getHeaders()
      });
      if (resp.ok) {
        const data = await resp.json();
        for (const row of (data || [])) {
          const recId = String(row.id || row.client_id || `cf_${Date.now()}`);
          if (!seenIds.has(recId)) {
            seenIds.add(recId);
            resultList.push({
              id: recId,
              date: String(row.date || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0])),
              type: row.type === 'SALE' ? 'SALE' : 'EXPENSE',
              category: String(row.category || 'General'),
              amount: Number(row.amount || 0),
              paymentMode: (row.payment_mode || row.paymentMode || 'Cash') as any,
              note: String(row.note || ''),
              createdAt: String(row.created_at || new Date().toISOString())
            });
          }
        }
      }
    } catch (e) {
      console.warn('Fetch daily_cashflow in website warning', e);
    }

    return resultList;
  }

  public async insertCashflowRecord(cf: DailyCashflowRecord): Promise<void> {
    const recordId = cf.id || generateUUID();
    
    // 1. Post to purchases table
    try {
      const payload = {
        client_id: recordId,
        supplier: cf.category || (cf.type === 'SALE' ? 'Counter Sale' : 'Purchase Expense'),
        bill_no: cf.note ? cf.note.slice(0, 30) : '',
        bill_date: cf.date,
        total: cf.amount,
        lines: [
          {
            qty: 1,
            name: cf.category || 'General',
            rate: cf.amount,
            bill_name: cf.note || cf.category || 'General'
          }
        ],
        created_at: cf.createdAt || new Date().toISOString()
      };
      await fetch(`${this.url}/rest/v1/purchases`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Error inserting purchase in website', e);
    }

    // 2. Post to daily_cashflow table
    try {
      const fallbackPayload = {
        id: recordId,
        date: cf.date,
        type: cf.type,
        category: cf.category,
        amount: cf.amount,
        payment_mode: cf.paymentMode,
        note: cf.note,
        created_at: cf.createdAt || new Date().toISOString()
      };
      await fetch(`${this.url}/rest/v1/daily_cashflow?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(fallbackPayload)
      });
    } catch (e) {
      console.error('Error inserting daily_cashflow in website', e);
    }
  }

  public async deleteCashflowRecord(id: string): Promise<void> {
    try {
      // Delete from purchases table by client_id and id
      await fetch(`${this.url}/rest/v1/purchases?client_id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      await fetch(`${this.url}/rest/v1/purchases?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      // Delete from daily_cashflow table
      await fetch(`${this.url}/rest/v1/daily_cashflow?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {
      console.error('Error deleting cashflow record in website', e);
    }
  }

  public async upsertItem(item: Item): Promise<void> {
    try {
      const payload = {
        id: item.id,
        o: item.o,
        name: item.name,
        code: item.code,
        barcode: item.barcode,
        type: item.type,
        brand: item.brand,
        size: item.size,
        aliases: item.aliases,
        mrp: item.mrp,
        cost: item.cost,
        price: item.price,
        qty: item.qty,
        low: item.low,
        unit: item.unit,
        updated_at: new Date().toISOString()
      };
      await fetch(`${this.url}/rest/v1/items?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Error upserting item to Supabase', e);
    }
  }

  public async bulkUpsertItems(items: Item[]): Promise<void> {
    try {
      const payload = items.map((item) => ({
        id: item.id,
        o: item.o,
        name: item.name,
        code: item.code,
        barcode: item.barcode,
        type: item.type,
        brand: item.brand,
        size: item.size,
        aliases: item.aliases,
        mrp: item.mrp,
        cost: item.cost,
        price: item.price,
        qty: item.qty,
        low: item.low,
        unit: item.unit,
        updated_at: new Date().toISOString()
      }));

      await fetch(`${this.url}/rest/v1/items?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Error bulk upserting items to Supabase', e);
    }
  }

  public async updateItemQty(id: string, newQty: number): Promise<void> {
    try {
      await fetch(`${this.url}/rest/v1/items?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({
          qty: newQty,
          updated_at: new Date().toISOString()
        })
      });
    } catch (e) {
      console.error('Error updating qty in Supabase', e);
    }
  }

  public async deleteItem(id: string): Promise<void> {
    try {
      await fetch(`${this.url}/rest/v1/items?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {
      console.error('Error deleting item in Supabase', e);
    }
  }

  public async deleteMultipleItems(ids: string[]): Promise<void> {
    try {
      const formattedIds = ids.map((id) => `"${id}"`).join(',');
      await fetch(`${this.url}/rest/v1/items?id=in.(${formattedIds})`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {
      console.error('Error deleting multiple items in Supabase', e);
    }
  }

  public async deleteAllItems(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.url}/rest/v1/items?id=not.is.null`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      return resp.ok;
    } catch (e) {
      console.error('Failed to deleteAllItems:', e);
      return false;
    }
  }

  public async clearTransactions(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.url}/rest/v1/transactions?id=not.is.null`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      return resp.ok;
    } catch (e) {
      console.error('Failed to clearTransactions:', e);
      return false;
    }
  }

  public async clearAllCashflow(): Promise<boolean> {
    try {
      await fetch(`${this.url}/rest/v1/purchases?id=not.is.null`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {
      console.warn('Clear purchases warning:', e);
    }
    try {
      await fetch(`${this.url}/rest/v1/daily_cashflow?id=not.is.null`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {
      console.warn('Clear daily_cashflow warning:', e);
    }
    return true;
  }

  public async clearAllQuotations(): Promise<boolean> {
    try {
      await fetch(`${this.url}/rest/v1/quotations?id=not.is.null`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {}
    return true;
  }

  public async clearAllLedger(): Promise<boolean> {
    try {
      await fetch(`${this.url}/rest/v1/ledger_entries?id=not.is.null`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      await fetch(`${this.url}/rest/v1/ledger_accounts?id=not.is.null`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {}
    return true;
  }

  public async deleteAllData(): Promise<boolean> {
    await this.deleteAllItems();
    await this.clearTransactions();
    await this.clearAllCashflow();
    await this.clearAllQuotations();
    await this.clearAllLedger();
    return true;
  }

  public async insertTransaction(tx: TransactionRecord): Promise<void> {
    try {
      const payload = {
        item_id: tx.itemId || null,
        item_name: tx.itemName,
        action: tx.action,
        qty: tx.qty,
        balance: tx.balance,
        note: tx.note,
        unit: tx.unit,
        created_at: tx.createdAt
      };
      await fetch(`${this.url}/rest/v1/transactions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Error inserting transaction in Supabase', e);
    }
  }

  public connectRealtime(
    onItemChanged: (type: string, item: any) => void,
    onCashflowChanged?: (type: string, record: any) => void
  ) {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    try {
      const wsUrl = `${this.url.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${this.key}&vsn=1.0.0`;
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        // Join items topic
        this.ws?.send(JSON.stringify({
          topic: 'realtime:public:items',
          event: 'phx_join',
          ref: `join_items_${Date.now()}`,
          payload: {
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [{ event: '*', schema: 'public', table: 'items' }]
            }
          }
        }));

        // Join purchases topic
        this.ws?.send(JSON.stringify({
          topic: 'realtime:public:purchases',
          event: 'phx_join',
          ref: `join_purch_${Date.now()}`,
          payload: {
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [{ event: '*', schema: 'public', table: 'purchases' }]
            }
          }
        }));

        // Join daily_cashflow topic
        this.ws?.send(JSON.stringify({
          topic: 'realtime:public:daily_cashflow',
          event: 'phx_join',
          ref: `join_cashflow_${Date.now()}`,
          payload: {
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [{ event: '*', schema: 'public', table: 'daily_cashflow' }]
            }
          }
        }));

        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: `hb_${Date.now()}`
            }));
          }
        }, 20000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'postgres_changes') {
            const topic = data.topic || '';
            const payload = data.payload?.data || data.payload;
            const eventType = payload?.type || '';
            const record = payload?.record || payload?.new || payload?.old || payload?.old_record;
            if (topic.includes('purchases') || topic.includes('daily_cashflow') || topic.includes('cashflow')) {
              if (onCashflowChanged) {
                onCashflowChanged(eventType, record);
              }
            } else {
              onItemChanged(eventType, record);
            }
          }
        } catch (err) {
          console.error('Error parsing realtime event', err);
        }
      };
      this.ws.onerror = (e) => {
        console.warn('Supabase realtime WS error', e);
      };
      this.ws.onclose = () => {
        clearInterval(this.heartbeatInterval);
      };
    } catch (e) {
      console.warn('Failed to initialize WebSocket', e);
    }
  }

  public disconnectRealtime() {
    clearInterval(this.heartbeatInterval);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}

export const supabaseService = new SupabaseService();
