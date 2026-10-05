import { Item, TransactionRecord, DailyCashflowRecord } from '../types';

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

  // Fetch all items from Supabase (matching Android fetchAllItems)
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
      console.warn('Supabase fetchAllItems failed, falling back to local storage', e);
      throw e;
    }
  }

  // Fetch transactions from Supabase
  public async fetchTransactions(limit: number = 500): Promise<TransactionRecord[]> {
    try {
      const resp = await fetch(`${this.url}/rest/v1/transactions?select=*&order=created_at.desc&limit=${limit}`, {
        headers: this.getHeaders()
      });

      if (!resp.ok) {
        return [];
      }

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

  // Fetch Daily Cashflows (Sales & Expenses / Purchases) from Supabase
  public async fetchDailyCashflows(limit: number = 500): Promise<DailyCashflowRecord[]> {
    try {
      // First try daily_cashflow table, if 404 fallback to purchases table
      let resp = await fetch(`${this.url}/rest/v1/purchases?select=*&order=created_at.desc&limit=${limit}`, {
        headers: this.getHeaders()
      });

      if (!resp.ok) {
        resp = await fetch(`${this.url}/rest/v1/daily_cashflow?select=*&order=created_at.desc&limit=${limit}`, {
          headers: this.getHeaders()
        });
      }

      if (!resp.ok) {
        return [];
      }

      const data = await resp.json();
      return (data || []).map((row: any) => {
        const isSale =
          row.type === 'SALE' ||
          (row.supplier && String(row.supplier).toLowerCase().includes('sale'));

        const categoryName =
          row.category ||
          row.supplier ||
          (row.lines && row.lines[0] && (row.lines[0].name || row.lines[0].bill_name)) ||
          (isSale ? 'Counter Sale' : 'Purchase / Expense');

        const firstLineNote =
          row.lines && row.lines[0]
            ? row.lines[0].name || row.lines[0].bill_name
            : '';

        return {
          id: String(row.client_id || row.id || `cf_${Date.now()}_${Math.random()}`),
          date: String(
            row.bill_date ||
              row.date ||
              (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0])
          ),
          type: isSale ? 'SALE' : 'EXPENSE',
          category: String(categoryName),
          amount: Number(row.total || row.amount || 0),
          paymentMode: (row.payment_mode || row.paymentMode || 'Cash') as any,
          note: String(row.note || firstLineNote || row.bill_no ? `Bill #${row.bill_no}` : ''),
          createdAt: String(row.created_at || row.createdAt || new Date().toISOString())
        };
      });
    } catch (e) {
      console.warn('Supabase fetchDailyCashflows failed', e);
      return [];
    }
  }

  // Insert Cashflow / Purchase Record into Supabase
  public async insertCashflowRecord(cf: DailyCashflowRecord): Promise<void> {
    try {
      const clientId = generateUUID();
      const payload = {
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
        client_id: clientId,
        created_at: cf.createdAt || new Date().toISOString()
      };

      const res = await fetch(`${this.url}/rest/v1/purchases`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        // Fallback to daily_cashflow table
        const fallbackPayload = {
          id: cf.id,
          date: cf.date,
          type: cf.type,
          category: cf.category,
          amount: cf.amount,
          payment_mode: cf.paymentMode,
          note: cf.note,
          created_at: cf.createdAt
        };
        await fetch(`${this.url}/rest/v1/daily_cashflow?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(fallbackPayload)
        });
      }
    } catch (e) {
      console.error('Error inserting cashflow record in Supabase', e);
    }
  }

  // Delete Cashflow Record from Supabase
  public async deleteCashflowRecord(id: string): Promise<void> {
    try {
      // Delete from purchases table by client_id or numeric id
      let url = `${this.url}/rest/v1/purchases?client_id=eq.${encodeURIComponent(id)}`;
      if (!isNaN(Number(id))) {
        url = `${this.url}/rest/v1/purchases?id=eq.${encodeURIComponent(id)}`;
      }

      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        await fetch(`${this.url}/rest/v1/daily_cashflow?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: this.getHeaders()
        });
      }
    } catch (e) {
      console.error('Error deleting cashflow record in Supabase', e);
    }
  }

  // Upsert Item to Supabase
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

  // Update Item Quantity in Supabase
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

  // Delete Item in Supabase
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

  // Delete Multiple Items in Supabase
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

  // Insert Transaction into Supabase
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

  // Realtime subscription via Phoenix Channel Protocol
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
        // Join public:items topic
        const joinItemsMsg = {
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
        };
        this.ws?.send(JSON.stringify(joinItemsMsg));

        // Join public:purchases topic
        const joinPurchasesMsg = {
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
        };
        this.ws?.send(JSON.stringify(joinPurchasesMsg));

        // Start heartbeat loop every 20s
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
            const record = payload?.record || payload?.new;

            if (topic.includes('purchases') || topic.includes('cashflow')) {
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
