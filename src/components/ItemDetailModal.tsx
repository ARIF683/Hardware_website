import React, { useState, useRef } from 'react';
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
  DollarSign,
  Camera,
  Loader2,
  Image as ImageIcon,
  CheckCircle
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Item } from '../types';
import { formatRupees, formatDateTime, formatQty } from '../utils/formatters';
import { supabaseService } from '../services/supabaseService';

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
  const { items, transactions, updateItem, deleteItem, showToast } = useStock();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handlePressStart = () => {
    pressTimerRef.current = setTimeout(() => {
      fileInputRef.current?.click();
    }, 3000);
  };

  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const url = await supabaseService.uploadImageToCloudinary(file);
      await supabaseService.updateItemImage(item.id, url);
      updateItem({
        ...item,
        imageUrl: url
      });
      showToast('Item photo updated and synced successfully!');
    } catch (err: any) {
      console.error('Image upload failed', err);
      showToast(err?.message || 'Failed to upload image to Cloudinary');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Remove photo from this item?')) {
      try {
        supabaseService.updateItemImage(item.id, null).catch(console.error);
        updateItem({
          ...item,
          imageUrl: undefined
        });
        showToast('Item photo removed');
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">
                {item.type || 'General Hardware'}
              </span>
              {item.brand && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
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
          {/* Facebook-style Item Hero Cover Banner (without logo) */}
          <div className="relative w-full rounded-2xl overflow-hidden shadow-xs border border-slate-200 bg-slate-900 group">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {item.imageUrl ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onTouchStart={handlePressStart}
                onTouchEnd={handlePressEnd}
                className="relative h-64 sm:h-72 w-full cursor-pointer overflow-hidden bg-slate-950 flex items-center justify-center select-none"
                title="Click or hold 3s to change item image"
              >
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />

                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-2.5 py-1 bg-black/60 hover:bg-black/80 backdrop-blur-xs text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Change Photo</span>
                  </button>
                  <button
                    onClick={handleRemoveImage}
                    className="p-1.5 bg-black/60 hover:bg-red-600/90 backdrop-blur-xs text-white text-xs rounded-lg transition-colors shadow-xs"
                    title="Remove Photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase bg-blue-600/90 px-2 py-0.5 rounded shadow-xs">
                      Item Photo
                    </span>
                    <p className="text-xs text-slate-200 font-medium mt-1 truncate">
                      Click banner or hold 3s to replace photo
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onTouchStart={handlePressStart}
                onTouchEnd={handlePressEnd}
                className="h-56 sm:h-64 w-full bg-linear-to-br from-blue-50 via-slate-50 to-blue-100/80 border-2 border-dashed border-blue-300/80 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/80 transition-all select-none group"
                title="Click or hold 3s to upload item photo"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2 group-hover:scale-110 transition-transform">
                  <Camera className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm sm:text-base font-black uppercase tracking-widest text-blue-600">
                  NO IMAGE
                </span>
                <span className="text-xs text-blue-700/80 font-medium mt-1 flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" /> Tap or hold 3s to upload photo
                </span>
              </div>
            )}

            {isUploadingImage && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center text-white text-xs font-bold gap-2 z-10">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span>Uploading image to Cloudinary & Syncing...</span>
              </div>
            )}
          </div>

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
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
