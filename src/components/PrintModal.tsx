import React, { useState } from 'react';
import { X, Printer, Download, Eye, FileText, Smartphone } from 'lucide-react';
import { QuotationRecord, ShopProfile } from '../types';
import { formatRupees, formatDate } from '../utils/formatters';

interface PrintModalProps {
  isOpen: boolean;
  type: 'quotation' | 'bill';
  data: QuotationRecord | null;
  shopProfile: ShopProfile;
  onClose: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  type,
  data,
  shopProfile,
  onClose,
}) => {
  const [printFormat, setPrintFormat] = useState<'standard' | 'thermal58' | 'thermal80'>('standard');

  if (!isOpen || !data) return null;

  const handlePrint = () => {
    window.print();
  };

  const isQuotation = type === 'quotation';
  const docTitle = isQuotation ? 'ESTIMATE / QUOTATION' : 'TAX INVOICE';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
        {/* Top Controls Bar (hidden during browser print) */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50 rounded-t-3xl print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Print Mode:
            </span>
            <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setPrintFormat('standard')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  printFormat === 'standard'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Standard A4 / A5
              </button>
              <button
                onClick={() => setPrintFormat('thermal80')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  printFormat === 'thermal80'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80mm Thermal
              </button>
              <button
                onClick={() => setPrintFormat('thermal58')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  printFormat === 'thermal58'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                58mm Thermal
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print Now</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 flex justify-center">
          {printFormat === 'standard' ? (
            // Standard A4 Layout
            <div className="bg-white w-full max-w-2xl p-6 sm:p-8 rounded-xl shadow-xs border border-slate-200 text-slate-900 space-y-6 print:m-0 print:p-0 print:border-none print:shadow-none">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src={shopProfile.logo || '/logos/ic_stock_logo.png'}
                      alt="Logo"
                      className="w-full h-full object-cover"
                      onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                    />
                  </div>
                  <div>
                    <h1 className="text-xl font-black text-slate-900 leading-tight">
                      {shopProfile.name}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">{shopProfile.tagline}</p>
                    <p className="text-xs text-slate-600 mt-1 max-w-xs">{shopProfile.address}</p>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Tel: <strong>{shopProfile.phone}</strong>
                      {shopProfile.gstin && (
                        <span> · GSTIN: <strong>{shopProfile.gstin}</strong></span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black tracking-widest text-blue-600 uppercase block">
                    {docTitle}
                  </span>
                  <div className="font-mono text-sm font-bold text-slate-900 mt-1">
                    #{data.quotationNo}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Date: <strong>{formatDate(data.date)}</strong>
                  </div>
                  {data.validUntil && (
                    <div className="text-xs text-slate-500">
                      Valid Until: <strong>{formatDate(data.validUntil)}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Bill To Info */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between gap-4 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Estimate For / Customer
                  </span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{data.customerName}</p>
                  {data.customerPhone && (
                    <p className="text-slate-600 mt-0.5">Phone: {data.customerPhone}</p>
                  )}
                  {data.customerAddress && (
                    <p className="text-slate-600 mt-0.5">{data.customerAddress}</p>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Status
                  </span>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase mt-1 bg-blue-100 text-blue-800">
                    {data.status}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-2">#</th>
                      <th className="py-2.5 px-2">Item Description</th>
                      <th className="py-2.5 px-2 text-center">Qty</th>
                      <th className="py-2.5 px-2 text-right">Unit Rate</th>
                      {data.items.some((i) => i.discountPercent > 0) && (
                        <th className="py-2.5 px-2 text-right">Disc %</th>
                      )}
                      <th className="py-2.5 px-2 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-2 text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-2 font-medium text-slate-900">
                          {item.name}
                          {item.code && (
                            <span className="text-[10px] text-slate-400 font-mono ml-1.5">
                              ({item.code})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold">
                          {item.qty} {item.unit}
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-600">
                          ₹{item.unitPrice.toFixed(2)}
                        </td>
                        {data.items.some((i) => i.discountPercent > 0) && (
                          <td className="py-2.5 px-2 text-right text-emerald-600 font-medium">
                            {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                          </td>
                        )}
                        <td className="py-2.5 px-2 text-right font-bold text-slate-900">
                          ₹{item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & GST breakdown */}
              <div className="flex justify-end pt-2">
                <div className="w-full sm:w-64 space-y-1.5 text-xs text-slate-600 border-t border-slate-200 pt-3">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-slate-900">
                      {formatRupees(data.subtotal)}
                    </span>
                  </div>

                  {data.discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount:</span>
                      <span className="font-semibold">- {formatRupees(data.discount)}</span>
                    </div>
                  )}

                  {data.taxPercent > 0 && (
                    <div className="flex justify-between">
                      <span>GST ({data.taxPercent}%):</span>
                      <span className="font-semibold text-slate-900">
                        {formatRupees(data.taxAmount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-300 font-bold text-slate-900">
                    <span className="text-sm">Grand Total:</span>
                    <span className="text-lg font-black text-blue-600">
                      {formatRupees(data.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes & Bank / Signatory Footer */}
              <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-end justify-between gap-6 text-xs text-slate-500">
                <div className="max-w-xs space-y-1">
                  <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block">
                    Terms & Payment Info
                  </span>
                  <p className="text-[11px] leading-relaxed">{data.notes || 'Goods once sold will not be taken back.'}</p>
                  {shopProfile.upiId && (
                    <p className="text-[11px] font-semibold text-blue-600">
                      Pay via UPI: {shopProfile.upiId}
                    </p>
                  )}
                </div>

                <div className="text-center sm:text-right space-y-12">
                  <span className="text-[10px] text-slate-400 block">
                    For {shopProfile.name}
                  </span>
                  <div className="border-t border-slate-400 pt-1 text-[10px] font-bold text-slate-700 uppercase">
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Thermal Receipt Monospace View (58mm or 80mm)
            <div
              className={`bg-white p-4 rounded-xl shadow-xs border border-slate-200 font-mono text-slate-900 text-xs leading-tight ${
                printFormat === 'thermal80' ? 'w-[320px]' : 'w-[240px]'
              }`}
            >
              <div className="text-center space-y-0.5">
                <h2 className="text-sm font-black uppercase">{shopProfile.name}</h2>
                <p className="text-[10px] text-slate-600">{shopProfile.phone}</p>
                {shopProfile.gstin && (
                  <p className="text-[9px] text-slate-500">GST: {shopProfile.gstin}</p>
                )}
                <div className="border-b border-dashed border-slate-400 my-2" />
                <p className="font-bold uppercase text-[11px]">{docTitle}</p>
                <p className="text-[10px]">
                  Ref: #{data.quotationNo} · {data.date}
                </p>
                {data.customerName && (
                  <p className="text-[10px] text-slate-700">Cust: {data.customerName}</p>
                )}
                <div className="border-b border-dashed border-slate-400 my-2" />
              </div>

              {/* Item Lines */}
              <div className="space-y-1 py-1 text-[11px]">
                {data.items.map((it, idx) => (
                  <div key={idx}>
                    <div className="font-semibold truncate">{it.name}</div>
                    <div className="flex justify-between text-slate-600 text-[10px]">
                      <span>
                        {it.qty} {it.unit} @ {it.unitPrice}
                      </span>
                      <span className="font-bold text-slate-900">₹{it.total.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-b border-dashed border-slate-400 my-2" />

              {/* Totals */}
              <div className="space-y-0.5 text-right text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{data.subtotal.toFixed(2)}</span>
                </div>
                {data.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount:</span>
                    <span>-₹{data.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200">
                  <span>TOTAL:</span>
                  <span>₹{data.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-400 my-2" />

              <div className="text-center text-[10px] text-slate-500 pt-1 space-y-0.5">
                <p>Thank you! Visit again.</p>
                {shopProfile.upiId && <p>UPI: {shopProfile.upiId}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
