import React, { useState } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Plus,
  Trash2,
  CheckCircle,
  Calculator,
  ArrowLeft,
  X,
  Zap,
  Upload,
  Receipt,
  AlertCircle
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { BillRowData } from '../types';
import { formatRupees } from '../utils/formatters';
import { COMMON_UNITS, getPairedUnit, convertQuantity } from '../utils/unitConversion';

interface BillScreenProps {
  onBack: () => void;
  onOpenCalculator: () => void;
}

export const BillScreen: React.FC<BillScreenProps> = ({ onBack, onOpenCalculator }) => {
  const { items, confirmPurchaseBill } = useStock();

  const [stage, setStage] = useState<'idle' | 'review'>('idle');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showFullImage, setShowFullImage] = useState(false);

  const [supplier, setSupplier] = useState('');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [rows, setRows] = useState<BillRowData[]>([
    {
      id: 'row_1',
      name: '',
      rate: 0,
      qty: 1,
      unit: 'pcs',
      matchedItemId: null,
      include: true
    }
  ]);

  // Image upload handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
        setStage('review');
      };
      reader.readAsDataURL(file);
    }
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `row_${Date.now()}`,
        name: '',
        rate: 0,
        qty: 1,
        unit: 'pcs',
        matchedItemId: null,
        include: true
      }
    ]);
  };

  const updateRow = (id: string, updates: Partial<BillRowData>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...r, ...updates };
      })
    );
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleSelectMatchedItem = (rowId: string, itemId: string) => {
    const matched = items.find((i) => i.id === itemId);
    if (matched) {
      updateRow(rowId, {
        matchedItemId: matched.id,
        name: matched.name,
        rate: matched.cost || matched.price,
        unit: matched.unit,
        type: matched.type,
        brand: matched.brand,
        size: matched.size
      });
    }
  };

  const includedRows = rows.filter((r) => r.include && r.name.trim().length > 0);
  const billTotal = includedRows.reduce((sum, r) => sum + r.rate * r.qty, 0);

  const handleConfirm = () => {
    if (includedRows.length === 0) {
      alert('Please fill at least one valid item name with quantity & rate');
      return;
    }
    confirmPurchaseBill(supplier, billNo, billDate, rows);
    onBack();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (stage === 'review') setStage('idle');
              else onBack();
            }}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {stage === 'review' ? 'Review & Receive Items' : 'Purchase Bill Entry'}
            </h2>
            <p className="text-xs text-slate-500">
              {stage === 'review'
                ? 'Check items, quantities, and rates before inventory update'
                : 'Upload supplier bill image or enter items manually'}
            </p>
          </div>
        </div>

        {stage === 'review' && (
          <button
            onClick={onOpenCalculator}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl border border-blue-200"
            title="Calculator"
          >
            <Calculator className="w-4 h-4" />
          </button>
        )}
      </div>

      {stage === 'idle' ? (
        // Stage 1: Idle - Photo upload or Direct Entry
        <div className="space-y-4">
          {/* Quick Sequential Scan Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Zap className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-blue-950">
                  Quick Bill Entry & Stock Receiving
                </h3>
                <p className="text-xs text-blue-800">
                  Scan or add items row-by-row to auto-populate your purchase invoice and update stock levels simultaneously.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setStage('review')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Start Direct Entry Now →</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Upload Bill Image Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs text-center space-y-4">
            <div className="w-14 h-14 bg-slate-100 text-slate-600 rounded-3xl flex items-center justify-center mx-auto">
              <Receipt className="w-7 h-7 text-blue-600" />
            </div>

            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-900">Upload Purchase Bill Photo</h3>
              <p className="text-xs text-slate-500">
                Take a photo or upload an image of the physical supplier invoice. You will be able to enter rows side-by-side with the bill.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                <span>Upload Bill Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>

              <button
                onClick={() => setStage('review')}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Skip Image & Enter Directly →
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Stage 2: Review & Entry
        <div className="space-y-4">
          {/* Image Preview strip if image uploaded */}
          {imagePreview && (
            <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setShowFullImage(true)}
              >
                <img
                  src={imagePreview}
                  alt="Bill"
                  className="w-16 h-16 object-cover rounded-xl border border-slate-200"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900">Bill Photo Attached</span>
                  <p className="text-[11px] text-blue-600 font-semibold">Tap to view full image</p>
                </div>
              </div>
              <button
                onClick={() => setImagePreview(null)}
                className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded"
              >
                Remove
              </button>
            </div>
          )}

          {/* Supplier & Invoice Header Fields */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Supplier & Invoice Metadata
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Supplier / Vendor Name
                </label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. Metro Pipes & Sanitary"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Bill / Invoice No
                </label>
                <input
                  type="text"
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  placeholder="e.g. INV-9902"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Bill Date
                </label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Row Items Editor */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Consignment Items ({rows.length})
              </span>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Row</span>
              </button>
            </div>

            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div
                  key={row.id}
                  className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                    row.include
                      ? 'bg-slate-50/80 border-slate-200'
                      : 'bg-slate-100/50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateRow(row.id, { include: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-bold text-slate-500 text-xs">Item #{idx + 1}</span>
                    </div>

                    {/* Autocomplete from existing inventory */}
                    <select
                      value={row.matchedItemId || ''}
                      onChange={(e) => handleSelectMatchedItem(row.id, e.target.value)}
                      className="flex-1 max-w-sm px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none"
                    >
                      <option value="">-- Match existing catalog item --</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} (Stock: {i.qty} {i.unit})
                        </option>
                      ))}
                    </select>

                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-1 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-12 gap-2 text-xs">
                    <div className="col-span-12 sm:col-span-5">
                      <input
                        type="text"
                        placeholder="Item name / description *"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        step="any"
                        min="0.1"
                        placeholder="Qty"
                        value={row.qty}
                        onChange={(e) =>
                          updateRow(row.id, { qty: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-3 sm:col-span-2">
                      <select
                        value={row.unit}
                        onChange={(e) => updateRow(row.id, { unit: e.target.value })}
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl uppercase font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      >
                        {COMMON_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-5 sm:col-span-3">
                      <input
                        type="number"
                        step="any"
                        placeholder="Purchase Rate (₹)"
                        value={row.rate}
                        onChange={(e) =>
                          updateRow(row.id, { rate: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-right font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                    <span>
                      {row.matchedItemId ? '✓ Linked to existing SKU' : '• Will create new SKU'}
                    </span>
                    <span className="font-bold text-slate-900 text-xs">
                      Line Total: {formatRupees(row.rate * row.qty)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Total & Confirmation Bar */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Bill Amount
              </span>
              <div className="text-2xl font-black text-blue-600">
                {formatRupees(billTotal)}
              </div>
              <span className="text-xs text-slate-500">
                {includedRows.length} items will be received into inventory
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={addRow}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                + Add Row
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Confirm & Update Stock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Image Modal */}
      {showFullImage && imagePreview && (
        <div
          onClick={() => setShowFullImage(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img
              src={imagePreview}
              alt="Full Bill"
              className="max-w-full max-h-[85vh] object-contain mx-auto rounded-xl"
            />
            <p className="text-center text-xs text-white/80 mt-2">Click anywhere to close</p>
          </div>
        </div>
      )}
    </div>
  );
};
