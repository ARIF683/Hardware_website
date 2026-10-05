import React, { useState, useEffect } from 'react';
import { X, PlusCircle, MinusCircle, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Item } from '../types';
import { getPairedUnit, convertQuantity } from '../utils/unitConversion';

interface StockTransactionModalProps {
  item: Item | null;
  initialAction?: 'in' | 'out';
  onClose: () => void;
}

export const StockTransactionModal: React.FC<StockTransactionModalProps> = ({
  item,
  initialAction = 'in',
  onClose,
}) => {
  const { addStockTransaction } = useStock();

  const [action, setAction] = useState<'in' | 'out'>(initialAction);
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [inputUnit, setInputUnit] = useState('pcs');
  const [conversionFactor, setConversionFactor] = useState(10);
  const [showUnitHelper, setShowUnitHelper] = useState(false);

  useEffect(() => {
    if (item) {
      setAction(initialAction);
      setQty('1');
      setNote('');
      setInputUnit(item.unit || 'pcs');

      const paired = getPairedUnit(item.unit || 'pcs');
      setConversionFactor(paired.factor);
    }
  }, [item, initialAction]);

  if (!item) return null;

  const numQty = parseFloat(qty) || 0;
  // If user entered quantity in paired unit, convert to base unit
  const effectiveQty =
    inputUnit.toLowerCase() !== item.unit.toLowerCase()
      ? convertQuantity(inputUnit, item.unit, numQty, conversionFactor)
      : numQty;

  const currentBal = item.qty;
  const newBal = action === 'in' ? currentBal + effectiveQty : currentBal - effectiveQty;

  const paired = getPairedUnit(item.unit);
  const hasUnitPair = paired.pairedUnit !== item.unit;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveQty <= 0) return;

    addStockTransaction(
      item.id,
      action,
      effectiveQty,
      note.trim() ||
        (action === 'in'
          ? `Stock In (${numQty} ${inputUnit})`
          : `Stock Out (${numQty} ${inputUnit})`)
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Stock Adjustment
            </span>
            <h2 className="text-base font-bold text-slate-900 truncate">{item.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* Action Switcher: Stock In (+) vs Stock Out (-) */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setAction('in')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all ${
                action === 'in'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Stock In (Receive)</span>
            </button>
            <button
              type="button"
              onClick={() => setAction('out')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all ${
                action === 'out'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MinusCircle className="w-4 h-4" />
              <span>Stock Out (Issue)</span>
            </button>
          </div>

          {/* Current vs New Balance Bar */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400">Current Balance:</span>
              <p className="font-bold text-slate-900 text-sm">
                {item.qty % 1 === 0 ? item.qty : item.qty.toFixed(1)} {item.unit}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-right">
              <span className="text-slate-400">New Balance:</span>
              <p
                className={`font-bold text-sm ${
                  newBal < 0
                    ? 'text-red-600'
                    : action === 'in'
                    ? 'text-emerald-600'
                    : 'text-slate-900'
                }`}
              >
                {newBal % 1 === 0 ? newBal : newBal.toFixed(1)} {item.unit}
              </p>
            </div>
          </div>

          {/* Quantity Input with Unit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Quantity
              </label>

              {hasUnitPair && (
                <button
                  type="button"
                  onClick={() => setShowUnitHelper(!showUnitHelper)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  Convert ({paired.pairedUnit})
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="1"
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                autoFocus
              />

              <select
                value={inputUnit}
                onChange={(e) => setInputUnit(e.target.value)}
                className="w-24 px-3 py-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value={item.unit}>{item.unit.toUpperCase()}</option>
                {hasUnitPair && (
                  <option value={paired.pairedUnit}>{paired.pairedUnit.toUpperCase()}</option>
                )}
              </select>
            </div>

            {/* Packaging Unit Conversion explanation if using paired unit */}
            {inputUnit.toLowerCase() !== item.unit.toLowerCase() && (
              <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded-lg mt-2 border border-blue-100 font-medium">
                ⚡ Converting {numQty} {inputUnit} = {effectiveQty} {item.unit} (Factor: {conversionFactor})
              </p>
            )}
          </div>

          {/* Reference / Reason / Supplier / Customer Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Note / Reference
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                action === 'in'
                  ? 'e.g. Received from Supplier / PO-102'
                  : 'e.g. Sold to Ramesh / Cash Counter'
              }
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-colors ${
                action === 'in'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {action === 'in' ? 'Confirm Stock In' : 'Confirm Stock Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
