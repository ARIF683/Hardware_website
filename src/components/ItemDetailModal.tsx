import React from 'react';
import {
  X,
  Edit2,
  Trash2,
  PlusCircle,
  MinusCircle,
  Tag,
  Barcode,
  Package,
  Boxes,
  TrendingUp,
  AlertTriangle,
  History,
  DollarSign
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Item } from '../types';
import { formatRupees, formatDateTime, formatQty } from '../utils/formatters';

interface ItemDetailModalProps {
  itemId: string | null;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onOpenTransaction: (item: Item, action: 'in' | 'out') => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  itemId,
  onClose,
  onEdit,
  onOpenTransaction,
}) => {
  const { items, transactions, deleteItem, isAdmin } = useStock();

  if (!itemId) return null;
  const item = items.find((i) => i.id === itemId);
  if (!item) return null;

  // Filter transactions for this specific item
  const itemTransactions = transactions.filter(
    (tx) => tx.itemId === item.id || tx.itemName.toLowerCase() === item.name.toLowerCase()
  );

  const stockValueCost = Math.max(0, item.qty) * item.cost;
  const stockValueRetail = Math.max(0, item.qty) * item.price;
  const unitProfit = item.price - item.cost;
  const profitMarginPercent = item.cost > 0 ? ((unitProfit / item.cost) * 100).toFixed(1) : '—';

  const isOutOfStock = item.qty <= 0;
  const isLowStock = !isOutOfStock && item.low > 0 && item.qty <= item.low;

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${item.name}" from inventory?`)) {
      deleteItem(item.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-200/80 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">
                {item.type || 'General Hardware'}
              </span>
              {item.brand && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                  {item.brand}
                </span>
              )}
              {item.code && (
                <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  #{item.code}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
              {item.name}
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(item)}
              className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
              title="Edit Item"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              title="Delete Item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Stock Status & Quick Transaction bar */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Current Inventory Balance
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-black text-slate-900">
                  {formatQty(item.qty, item.unit)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isOutOfStock
                      ? 'bg-red-100 text-red-700'
                      : isLowStock
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock Warning' : 'In Stock'}
                </span>
              </div>
              {item.low > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Reorder trigger threshold: {item.low} {item.unit}
                </p>
              )}
            </div>

            {/* Quick In / Out buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => onOpenTransaction(item, 'in')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Stock In</span>
              </button>
              <button
                onClick={() => onOpenTransaction(item, 'out')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <MinusCircle className="w-4 h-4" />
                <span>− Stock Out</span>
              </button>
            </div>
          </div>

          {/* Pricing & Valuation Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Cost Price
              </div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {formatRupees(item.cost)}
              </div>
              <span className="text-[10px] text-slate-400">per {item.unit}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Selling Price
              </div>
              <div className="text-base font-bold text-blue-600 mt-0.5">
                {formatRupees(item.price)}
              </div>
              <span className="text-[10px] text-slate-400">per {item.unit}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                MRP
              </div>
              <div className="text-base font-bold text-slate-700 mt-0.5">
                {item.mrp ? formatRupees(item.mrp) : '—'}
              </div>
              <span className="text-[10px] text-slate-400">Maximum Retail</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Profit Margin
              </div>
              <div className="text-base font-bold text-emerald-600 mt-0.5">
                {profitMarginPercent}%
              </div>
              <span className="text-[10px] text-emerald-700">+{formatRupees(unitProfit)}/unit</span>
            </div>
          </div>

          {/* Additional details */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Product Specifications
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 text-xs">
              <div>
                <span className="text-slate-400">Size / Dimension:</span>
                <p className="font-semibold text-slate-800">{item.size || 'Not specified'}</p>
              </div>
              <div>
                <span className="text-slate-400">Unit of Measurement:</span>
                <p className="font-semibold text-slate-800 uppercase">{item.unit}</p>
              </div>
              <div>
                <span className="text-slate-400">Barcode / SKU:</span>
                <p className="font-semibold font-mono text-slate-800">
                  {item.barcode || 'No barcode'}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Stock Valuation (Cost):</span>
                <p className="font-bold text-slate-800">{formatRupees(stockValueCost)}</p>
              </div>
              <div>
                <span className="text-slate-400">Stock Valuation (Retail):</span>
                <p className="font-bold text-blue-600">{formatRupees(stockValueRetail)}</p>
              </div>
              <div>
                <span className="text-slate-400">Search Keywords / Aliases:</span>
                <p className="font-medium text-slate-600 truncate">{item.aliases || 'None'}</p>
              </div>
            </div>
          </div>

          {/* Item Specific Transaction History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                Audit Trail & History ({itemTransactions.length})
              </h4>
            </div>

            {itemTransactions.length === 0 ? (
              <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-200/60">
                <p className="text-xs font-medium text-slate-500">
                  No stock transactions logged yet for this item.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {itemTransactions.map((tx) => {
                  const isIn = tx.action === 'in';
                  return (
                    <div
                      key={tx.clientId}
                      className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">
                          {tx.note || (isIn ? 'Stock In (+)' : 'Stock Out (-)')}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {formatDateTime(tx.createdAt)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`font-bold text-sm ${
                            isIn ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {isIn ? '+' : '−'}
                          {tx.qty % 1 === 0 ? tx.qty : tx.qty.toFixed(1)} {tx.unit}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Bal {tx.balance % 1 === 0 ? tx.balance : tx.balance.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/50 rounded-b-3xl flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
