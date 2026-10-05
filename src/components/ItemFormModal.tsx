import React, { useState, useEffect, useMemo } from 'react';
import { X, Package, Save, AlertCircle } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Item } from '../types';
import { COMMON_UNITS } from '../utils/unitConversion';

interface ItemFormModalProps {
  isOpen: boolean;
  itemToEdit: Item | null;
  onClose: () => void;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  itemToEdit,
  onClose,
}) => {
  const { addItem, updateItem, items } = useStock();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [aliases, setAliases] = useState('');
  const [mrp, setMrp] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('0');
  const [low, setLow] = useState('5');
  const [unit, setUnit] = useState('pcs');
  const [error, setError] = useState('');

  // Extract distinct database values for Type, Brand, Size, Unit
  const dynamicTypes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.type && i.type.trim()) set.add(i.type.trim());
    });
    return Array.from(set).sort();
  }, [items]);

  const dynamicBrands = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.brand && i.brand.trim()) set.add(i.brand.trim());
    });
    return Array.from(set).sort();
  }, [items]);

  const dynamicSizes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.size && i.size.trim()) set.add(i.size.trim());
    });
    return Array.from(set).sort();
  }, [items]);

  const dynamicUnits = useMemo(() => {
    const set = new Set<string>();
    COMMON_UNITS.forEach((u) => set.add(u));
    items.forEach((i) => {
      if (i.unit && i.unit.trim()) set.add(i.unit.trim().toLowerCase());
    });
    return Array.from(set).sort();
  }, [items]);

  useEffect(() => {
    if (itemToEdit) {
      setName(itemToEdit.name);
      setCode(itemToEdit.code);
      setBarcode(itemToEdit.barcode);
      setType(itemToEdit.type || '');
      setBrand(itemToEdit.brand || '');
      setSize(itemToEdit.size || '');
      setAliases(itemToEdit.aliases || '');
      setMrp(itemToEdit.mrp !== null && itemToEdit.mrp !== undefined ? itemToEdit.mrp.toString() : '');
      setCost(itemToEdit.cost.toString());
      setPrice(itemToEdit.price.toString());
      setQty(itemToEdit.qty.toString());
      setLow(itemToEdit.low.toString());
      setUnit(itemToEdit.unit || 'pcs');
    } else {
      setName('');
      setCode('');
      setBarcode('');
      setType(dynamicTypes.length > 0 ? dynamicTypes[0] : 'General Hardware');
      setBrand('');
      setSize('');
      setAliases('');
      setMrp('');
      setCost('');
      setPrice('');
      setQty('1');
      setLow('5');
      setUnit('pcs');
    }
    setError('');
  }, [itemToEdit, isOpen, dynamicTypes]);

  if (!isOpen) return null;

  // Margin calculation preview
  const numCost = parseFloat(cost) || 0;
  const numPrice = parseFloat(price) || 0;
  const marginPercent =
    numCost > 0 ? (((numPrice - numCost) / numCost) * 100).toFixed(1) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Item Name is required');
      return;
    }

    const finalType = type.trim() || 'General';

    if (itemToEdit) {
      updateItem({
        ...itemToEdit,
        name: name.trim(),
        code: code.trim(),
        barcode: barcode.trim(),
        type: finalType,
        brand: brand.trim(),
        size: size.trim(),
        aliases: aliases.trim(),
        mrp: mrp ? parseFloat(mrp) || null : null,
        cost: numCost,
        price: numPrice,
        qty: parseFloat(qty) || 0,
        low: parseFloat(low) || 0,
        unit: unit.trim() || 'pcs'
      });
    } else {
      addItem({
        o: items.length + 1,
        name: name.trim(),
        code: code.trim(),
        barcode: barcode.trim(),
        type: finalType,
        brand: brand.trim(),
        size: size.trim(),
        aliases: aliases.trim(),
        mrp: mrp ? parseFloat(mrp) || null : null,
        cost: numCost,
        price: numPrice,
        qty: parseFloat(qty) || 0,
        low: parseFloat(low) || 0,
        unit: unit.trim() || 'pcs'
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {itemToEdit ? 'Edit Item' : 'Add New Hardware Item'}
              </h2>
              <p className="text-xs text-slate-500">
                {itemToEdit ? 'Modify item specifications and pricing' : 'Create a new SKU in your catalog'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Datalists for autocomplete */}
          <datalist id="db-types-list">
            {dynamicTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <datalist id="db-brands-list">
            {dynamicBrands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>

          <datalist id="db-sizes-list">
            {dynamicSizes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <datalist id="db-units-list">
            {dynamicUnits.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>

          {/* Item Name (Required) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. 1.0 miecon, WILD PURPLE, LED BOX"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Type & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Category / Type
              </label>
              <input
                type="text"
                list="db-types-list"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. WIRE, MOTOR, BULB"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Unit of Measure
              </label>
              <input
                type="text"
                list="db-units-list"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs, mtr, box, roll, kg"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Brand & Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Brand / Manufacturer
              </label>
              <input
                type="text"
                list="db-brands-list"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. ASIAN PAINTS, CROMPTON, MIECON"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Size / Dimension
              </label>
              <input
                type="text"
                list="db-sizes-list"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 1 HP, 200gm, 90mtr, 1LTR"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Code & Barcode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Internal Item Code / SKU
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. SKU-PQBNN1RD"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Barcode Number
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. 8901234567890"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Pricing: Cost, Selling Price, MRP */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Pricing & Valuation (₹)
              </span>
              {marginPercent && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {marginPercent}% profit margin
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Cost Price (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Selling Price (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  MRP (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Stock Quantities: Current Stock & Reorder Threshold */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Current Stock Qty
              </label>
              <input
                type="number"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Low Stock Threshold
              </label>
              <input
                type="number"
                step="any"
                value={low}
                onChange={(e) => setLow(e.target.value)}
                placeholder="5"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">Alerts when stock falls to this</p>
            </div>
          </div>

          {/* Aliases / Search Keywords */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Keywords / Local Hindi/Urdu Names (comma-separated)
            </label>
            <input
              type="text"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="e.g. paani pipe, band, tape, m-seal, socket"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Enables instant searching when cashiers type vernacular terms
            </p>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{itemToEdit ? 'Save Changes' : 'Create Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
