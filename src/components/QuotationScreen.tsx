import React, { useState } from 'react';
import {
  Plus,
  Search,
  FileText,
  Printer,
  Share2,
  Trash2,
  Edit3,
  CheckCircle,
  ArrowRight,
  Send,
  Download,
  Calendar,
  Phone,
  MapPin,
  X,
  PlusCircle,
  Receipt
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { QuotationRecord, QuotationLineItem, QuotationStatus } from '../types';
import { formatRupees, formatDate } from '../utils/formatters';

interface QuotationScreenProps {
  onOpenPrint: (type: 'quotation' | 'bill', data: QuotationRecord) => void;
}

export const QuotationScreen: React.FC<QuotationScreenProps> = ({ onOpenPrint }) => {
  const {
    quotations,
    items,
    createQuotation,
    updateQuotation,
    deleteQuotation,
    convertQuotationToBill,
    shopProfile
  } = useStock();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuotationStatus>('ALL');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState<QuotationRecord | null>(null);

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([
    {
      itemId: '',
      name: '',
      code: '',
      type: '',
      unit: 'pcs',
      qty: 1,
      unitPrice: 0,
      discountPercent: 0,
      total: 0
    }
  ]);
  const [overallDiscount, setOverallDiscount] = useState('0');
  const [taxPercent, setTaxPercent] = useState('18');
  const [notes, setNotes] = useState('Prices valid for 15 days. GST extra as applicable.');
  const [status, setStatus] = useState<QuotationStatus>('Draft');

  const openNewForm = () => {
    setEditingQuote(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setDate(new Date().toISOString().split('T')[0]);
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setValidUntil(d.toISOString().split('T')[0]);
    setLineItems([
      {
        itemId: '',
        name: '',
        code: '',
        type: '',
        unit: 'pcs',
        qty: 1,
        unitPrice: 0,
        discountPercent: 0,
        total: 0
      }
    ]);
    setOverallDiscount('0');
    setTaxPercent('18');
    setNotes('Prices valid for 15 days. GST extra as applicable.');
    setStatus('Draft');
    setShowFormModal(true);
  };

  const openEditForm = (quote: QuotationRecord) => {
    setEditingQuote(quote);
    setCustomerName(quote.customerName);
    setCustomerPhone(quote.customerPhone);
    setCustomerAddress(quote.customerAddress);
    setDate(quote.date);
    setValidUntil(quote.validUntil);
    setLineItems(quote.items);
    setOverallDiscount(quote.discount.toString());
    setTaxPercent(quote.taxPercent.toString());
    setNotes(quote.notes);
    setStatus(quote.status);
    setShowFormModal(true);
  };

  // Calculations for form
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const discountVal = parseFloat(overallDiscount) || 0;
  const taxable = Math.max(0, subtotal - discountVal);
  const taxPct = parseFloat(taxPercent) || 0;
  const taxAmount = (taxable * taxPct) / 100;
  const grandTotal = taxable + taxAmount;

  // Update line item
  const updateLine = (index: number, updates: Partial<QuotationLineItem>) => {
    setLineItems((prev) => {
      const next = [...prev];
      const cur = { ...next[index], ...updates };
      const lineSub = cur.qty * cur.unitPrice;
      const disc = (lineSub * (cur.discountPercent || 0)) / 100;
      cur.total = Math.max(0, lineSub - disc);
      next[index] = cur;
      return next;
    });
  };

  const selectInventoryItemForLine = (index: number, itemId: string) => {
    const selected = items.find((i) => i.id === itemId);
    if (!selected) return;

    updateLine(index, {
      itemId: selected.id,
      name: selected.name,
      code: selected.code,
      type: selected.type,
      unit: selected.unit,
      unitPrice: selected.price
    });
  };

  const addLine = () => {
    setLineItems((prev) => [
      ...prev,
      {
        itemId: '',
        name: '',
        code: '',
        type: '',
        unit: 'pcs',
        qty: 1,
        unitPrice: 0,
        discountPercent: 0,
        total: 0
      }
    ]);
  };

  const removeLine = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSaveQuote = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lineItems.filter((i) => i.name.trim().length > 0);
    if (validLines.length === 0) {
      alert('Add at least one item with a valid name');
      return;
    }

    if (editingQuote) {
      updateQuotation({
        ...editingQuote,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        date,
        validUntil,
        items: validLines,
        subtotal,
        discount: discountVal,
        taxPercent: taxPct,
        taxAmount,
        grandTotal,
        status,
        notes: notes.trim()
      });
    } else {
      createQuotation({
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        date,
        validUntil,
        items: validLines,
        subtotal,
        discount: discountVal,
        taxPercent: taxPct,
        taxAmount,
        grandTotal,
        status,
        notes: notes.trim()
      });
    }

    setShowFormModal(false);
  };

  // WhatsApp Share Generator
  const shareWhatsApp = (quote: QuotationRecord) => {
    const text = encodeURIComponent(
      `*ESTIMATE / QUOTATION #${quote.quotationNo}*\n` +
      `From: *${shopProfile.name}*\n` +
      `Customer: ${quote.customerName}\n` +
      `Date: ${formatDate(quote.date)}\n` +
      `-----------------------------\n` +
      quote.items
        .map((it, idx) => `${idx + 1}. ${it.name} - ${it.qty} ${it.unit} @ ₹${it.unitPrice} = ₹${it.total.toFixed(2)}`)
        .join('\n') +
      `\n-----------------------------\n` +
      `*Grand Total: ₹${quote.grandTotal.toFixed(2)}*\n` +
      `\nThank you for your business! Call ${shopProfile.phone} for any queries.`
    );
    const url = quote.customerPhone
      ? `https://wa.me/${quote.customerPhone.replace(/[^0-9]/g, '')}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  // Filtered quotes
  const filteredQuotations = quotations.filter((q) => {
    const matchesSearch =
      q.quotationNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.customerPhone.includes(searchQuery);
    const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search quotation no, customer name or phone…"
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          <button
            onClick={openNewForm}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Estimate</span>
          </button>
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs pt-1 no-scrollbar">
          {(['ALL', 'Draft', 'Sent', 'Accepted', 'Converted'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st} {st === 'ALL' ? `(${quotations.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Quotations List */}
      {filteredQuotations.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-xs text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No quotations found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create formal quotations & estimates for customers with itemized pricing, discounts, and GST.
          </p>
          <button
            onClick={openNewForm}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Estimate
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuotations.map((quote) => {
            const isConverted = quote.status === 'Converted';
            const statusColors = {
              Draft: 'bg-slate-100 text-slate-700 border-slate-200',
              Sent: 'bg-blue-50 text-blue-700 border-blue-200',
              Accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              Converted: 'bg-purple-50 text-purple-700 border-purple-200'
            };

            return (
              <div
                key={quote.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                        {quote.quotationNo}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          statusColors[quote.status]
                        }`}
                      >
                        {quote.status}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1.5">
                      {quote.customerName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      {quote.customerPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {quote.customerPhone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(quote.date)}
                      </span>
                    </div>
                  </div>

                  {/* Grand total */}
                  <div className="text-left sm:text-right">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Grand Total
                    </span>
                    <div className="text-xl sm:text-2xl font-black text-blue-600">
                      {formatRupees(quote.grandTotal)}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {quote.items.length} {quote.items.length === 1 ? 'line item' : 'line items'}
                    </span>
                  </div>
                </div>

                {/* Items summary */}
                <div className="py-3 text-xs text-slate-600 divide-y divide-slate-50">
                  {quote.items.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="py-1 flex justify-between">
                      <span className="truncate pr-4">
                        {item.name} × {item.qty} {item.unit}
                      </span>
                      <span className="font-semibold shrink-0">{formatRupees(item.total)}</span>
                    </div>
                  ))}
                  {quote.items.length > 3 && (
                    <div className="pt-1 text-[11px] text-slate-400">
                      + {quote.items.length - 3} more items…
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Convert to bill button */}
                    {!isConverted && (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Convert Quote #${quote.quotationNo} to final sale bill? This will deduct ${quote.items.length} items from inventory and log revenue.`
                            )
                          ) {
                            convertQuotationToBill(quote.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Convert to Bill</span>
                      </button>
                    )}

                    {/* WhatsApp share */}
                    <button
                      onClick={() => shareWhatsApp(quote)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
                      title="Share Quote on WhatsApp"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>

                    {/* Print Estimate */}
                    <button
                      onClick={() => onOpenPrint('quotation', quote)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print / PDF</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => openEditForm(quote)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete quote #${quote.quotationNo}?`)) {
                          deleteQuotation(quote.id);
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New / Edit Quotation Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {editingQuote ? `Edit Estimate #${editingQuote.quotationNo}` : 'New Quotation / Estimate'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Itemized customer estimate with discounts & tax
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFormModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveQuote} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Customer Info Card */}
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Customer & Quotation Info
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Customer / Client Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Ramesh Contractor"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Phone Number (WhatsApp)
                    </label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Site / Delivery Address
                    </label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Plot 14, Main Road"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Estimate Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Valid Until
                    </label>
                    <input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Converted">Converted</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Line Items ({lineItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {lineItems.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-500">#{idx + 1}</span>

                        {/* Autocomplete from existing inventory */}
                        <select
                          value={line.itemId || ''}
                          onChange={(e) => selectInventoryItemForLine(idx, e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none"
                        >
                          <option value="">-- Choose from Inventory or type custom --</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} (Stock: {i.qty} {i.unit}, ₹{i.price})
                            </option>
                          ))}
                        </select>

                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="p-1 text-slate-400 hover:text-red-600"
                            title="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 sm:col-span-5">
                          <input
                            type="text"
                            required
                            placeholder="Item description *"
                            value={line.name}
                            onChange={(e) => updateLine(idx, { name: e.target.value })}
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>

                        <div className="col-span-4 sm:col-span-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              min="0.1"
                              placeholder="Qty"
                              value={line.qty}
                              onChange={(e) =>
                                updateLine(idx, { qty: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400 uppercase">
                              {line.unit}
                            </span>
                          </div>
                        </div>

                        <div className="col-span-4 sm:col-span-2">
                          <input
                            type="number"
                            step="any"
                            placeholder="Rate (₹)"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(idx, { unitPrice: parseFloat(e.target.value) || 0 })
                            }
                            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-right font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>

                        <div className="col-span-4 sm:col-span-3 text-right flex items-center justify-end">
                          <span className="font-bold text-slate-900 text-sm">
                            {formatRupees(line.total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals & Tax Calculation Breakdown */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{formatRupees(subtotal)}</span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1">Discount (₹):</span>
                  <input
                    type="number"
                    step="any"
                    value={overallDiscount}
                    onChange={(e) => setOverallDiscount(e.target.value)}
                    className="w-28 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-medium"
                  />
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1">Tax / GST (%):</span>
                  <input
                    type="number"
                    step="any"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                    className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-medium"
                  />
                </div>

                <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                  <span>GST Amount:</span>
                  <span className="font-medium text-slate-700">{formatRupees(taxAmount)}</span>
                </div>

                <div className="flex justify-between items-baseline text-slate-900 font-bold text-sm pt-1 border-t border-slate-300">
                  <span className="text-base">Grand Total:</span>
                  <span className="text-xl font-black text-blue-600">
                    {formatRupees(grandTotal)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Terms & Conditions / Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
                >
                  {editingQuote ? 'Update Estimate' : 'Save & Generate Estimate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
