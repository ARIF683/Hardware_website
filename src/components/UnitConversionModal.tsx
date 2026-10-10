import React, { useState } from 'react';
import { X, ArrowLeftRight, Check, Zap } from 'lucide-react';
import { PRESET_CONVERSIONS, COMMON_UNITS, convertQuantity } from '../utils/unitConversion';

interface UnitConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UnitConversionModal: React.FC<UnitConversionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [fromUnit, setFromUnit] = useState('box');
  const [toUnit, setToUnit] = useState('pcs');
  const [factor, setFactor] = useState('10');
  const [qty, setQty] = useState('5');

  if (!isOpen) return null;

  const numQty = parseFloat(qty) || 0;
  const numFactor = parseFloat(factor) || 1;
  const converted = convertQuantity(fromUnit, toUnit, numQty, numFactor);

  const applyPreset = (preset: typeof PRESET_CONVERSIONS[0]) => {
    setFromUnit(preset.baseUnit);
    setToUnit(preset.secondaryUnit);
    setFactor(preset.defaultFactor.toString());
  };

  const swapUnits = () => {
    const temp = fromUnit;
    setFromUnit(toUnit);
    setToUnit(temp);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Hardware Unit Converter</h3>
              <p className="text-xs text-slate-500">Packaging ratio & bulk unit calculator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Common Hardware Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_CONVERSIONS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPreset(preset)}
                  className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-slate-700 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unit Selectors & Swap */}
          <div className="flex items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                From
              </label>
              <select
                value={fromUnit}
                onChange={(e) => setFromUnit(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold uppercase focus:ring-1 focus:ring-blue-500"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={swapUnits}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-blue-600 shadow-xs self-end mb-0.5"
              title="Swap units"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To</label>
              <select
                value={toUnit}
                onChange={(e) => setToUnit(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold uppercase focus:ring-1 focus:ring-blue-500"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity & Factor Inputs */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Quantity ({fromUnit.toUpperCase()})
              </label>
              <input
                type="number"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-base text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Packaging Ratio Factor
              </label>
              <input
                type="number"
                step="any"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                placeholder="10"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-base text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">1 {fromUnit} = {factor} {toUnit}</p>
            </div>
          </div>

          {/* Result Card */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-center space-y-1">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Converted Result
            </span>
            <div className="text-2xl font-black text-blue-950">
              {converted % 1 === 0 ? converted : converted.toFixed(2)}{' '}
              <span className="text-sm font-bold uppercase">{toUnit}</span>
            </div>
            <p className="text-[11px] text-blue-700">
              {numQty} {fromUnit} × {numFactor} = {converted.toFixed(1)} {toUnit}
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
