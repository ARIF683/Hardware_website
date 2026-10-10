import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  Clock,
  Sparkles,
  Droplets,
  X,
  History,
  Trash2,
  Paintbrush,
  AlertCircle
} from 'lucide-react';
import { Item, ParsedTintRow } from '../types';
import { useStock } from '../context/StockContext';
import {
  parseColorMachineContent,
  formatCanFactorDisplay,
  parseCanFactorToLiters
} from '../utils/colorMachineParser';

interface ColorMachineTintModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ColorMachineTintModal: React.FC<ColorMachineTintModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    items,
    showToast,
    tintLogs,
    processedTintIds,
    processColorMachineImport,
    clearTintLogs
  } = useStock();

  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedTintRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'new' | 'already' | 'unmatched'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processedSet = useMemo(() => new Set(processedTintIds), [processedTintIds]);

  if (!isOpen) return null;

  const handleProcessFileText = (content: string, name: string) => {
    try {
      const rows = parseColorMachineContent(content, items, processedSet);
      if (rows.length === 0) {
        showToast('No valid machine tint records found in file. Check header format.');
        return;
      }
      setParsedRows(rows);
      setFileName(name);
      setFilterType('all');
      showToast(`Parsed ${rows.length} tinting records from ${name}`);
    } catch (err) {
      console.error(err);
      showToast('Error reading machine report file');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleProcessFileText(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleProcessFileText(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleLoadSampleData = () => {
    const sample = `DEALER_CODE,DEALER_NAME,MACHINE_TYPE,TINT_DATE,TINT_TIME,PRODUCT_NAME,BASE_CODE,CAN_FACTOR,NO_OF_CAN,COLORANT_USED,COLORANT_QUANTITY
D1001,ROYAL HARDWARE & PAINTS,COROB D200,08-Oct-26,10:15:30,TRACTOR EMULSION,TE15,1 LIT,1,RAW UMBER,12.50
D1001,ROYAL HARDWARE & PAINTS,COROB D200,08-Oct-26,11:45:10,TRACTOR EMULSION,TE15,4 LIT,1,FAST GREEN,8.20
D1001,ROYAL HARDWARE & PAINTS,COROB D200,08-Oct-26,13:10:00,APEX ULTIMA,BASE 01,10 LIT,1,RAW UMBER,18.00
D1001,ROYAL HARDWARE & PAINTS,COROB D200,08-Oct-26,14:20:00,ROYALE LUXURY,BASE 01,20 LIT,1,YELLOW OXIDE,24.00
D1001,ROYAL HARDWARE & PAINTS,COROB D200,08-Oct-26,16:05:40,DAMP PROOF,WHITE,4 LIT,2,WHITE BASE,0.00`;
    handleProcessFileText(sample, 'sample_tint_machine_report.csc');
  };

  // Stats
  const totalRowsCount = parsedRows.length;
  const newRowsCount = parsedRows.filter(
    (r) => !r.isAlreadyProcessed && !processedSet.has(r.tintRecordId)
  ).length;
  const alreadyRowsCount = parsedRows.filter(
    (r) => r.isAlreadyProcessed || processedSet.has(r.tintRecordId)
  ).length;
  const totalLitersSum = parsedRows.reduce((acc, r) => acc + r.totalLiters, 0);

  // Filtered rows
  const filteredRows = parsedRows.filter((row) => {
    const isDone = row.isAlreadyProcessed || processedSet.has(row.tintRecordId);
    const hasItem = Boolean(manualMappings[row.tintRecordId] || row.matchedItem);

    if (filterType === 'new' && isDone) return false;
    if (filterType === 'already' && !isDone) return false;
    if (filterType === 'unmatched' && hasItem) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = `${row.productName} ${row.baseCode} ${row.canFactor}`.toLowerCase();
      if (matchText.includes(q)) return true;
      const cleanQ = q.replace(/[^a-z0-9]/g, '');
      const cleanMatch = matchText.replace(/[^a-z0-9]/g, '');
      if (cleanQ && cleanMatch.includes(cleanQ)) return true;
      const tokens = q.split(/\s+/).filter(Boolean);
      return tokens.every((t) => {
        const ct = t.replace(/[^a-z0-9]/g, '');
        return matchText.includes(t) || (ct && cleanMatch.includes(ct));
      });
    }
    return true;
  });

  const handleApplyDeduction = () => {
    if (newRowsCount === 0) {
      showToast('No new tint records to deduct.');
      return;
    }
    processColorMachineImport(parsedRows, manualMappings);
    // Refresh parsedRows status
    setParsedRows((prev) =>
      prev.map((r) => ({
        ...r,
        isAlreadyProcessed: true
      }))
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header: Clean mobile-friendly responsive layout */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Paintbrush className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    Color Machine Tint Import
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    .CSC / .CSV
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  Reads Base Name, Date, Time & Can Factor (1, 4, 10, 20 Ltr)
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors shrink-0"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex items-center bg-slate-200/70 p-1 rounded-xl text-xs font-semibold w-full sm:w-auto self-start">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all text-center ${
                activeTab === 'upload'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Import & Deduct
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History ({tintLogs.length})
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'upload' ? (
            <>
              {/* Uploader Box */}
              {parsedRows.length === 0 ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all flex flex-col items-center justify-center ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                      : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csc,.csv,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3 shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
                    Drop your Tint Machine file here or click to browse
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed">
                    Upload Corob or Smart Tint logs with <strong>BASE NAME</strong>, <strong>TINT DATE</strong>, <strong>TINT TIME</strong>, and <strong>CAN FACTOR</strong> (1, 4, 10, 20 Ltr). Shade code is ignored.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      Select Machine Log File
                    </button>
                    <button
                      onClick={handleLoadSampleData}
                      className="px-3.5 py-2 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Load Demo Report
                    </button>
                    <button
                      onClick={() => setShowPasteBox(!showPasteBox)}
                      className="px-3.5 py-2 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Paste CSV/CSC Text
                    </button>
                  </div>

                  {showPasteBox && (
                    <div className="mt-4 w-full max-w-xl text-left">
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Paste machine CSV / CSC export lines:
                      </label>
                      <textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Paste columns here (PRODUCT_NAME, BASE_CODE, TINT_DATE, TINT_TIME, CAN_FACTOR...)"
                        rows={4}
                        className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => {
                            if (pastedText.trim()) {
                              handleProcessFileText(pastedText, 'pasted_report.csc');
                            }
                          }}
                          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
                        >
                          Parse Pasted Content
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="text-[11px] font-medium text-slate-500 mb-0.5">Total Records</div>
                      <div className="text-lg sm:text-xl font-bold text-slate-900">{totalRowsCount}</div>
                      <div className="text-[10px] text-slate-400 truncate">{fileName || 'Report'}</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                      <div className="text-[11px] font-medium text-emerald-700 mb-0.5 flex items-center justify-between">
                        <span>New to Deduct</span>
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-emerald-800">{newRowsCount}</div>
                      <div className="text-[10px] text-emerald-600 font-medium">Will update stock</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200">
                      <div className="text-[11px] font-medium text-slate-600 mb-0.5 flex items-center justify-between">
                        <span>Already Applied</span>
                        <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-slate-700">{alreadyRowsCount}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Skipped (No duplicate)</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200">
                      <div className="text-[11px] font-medium text-blue-700 mb-0.5 flex items-center justify-between">
                        <span>Total Liters</span>
                        <Droplets className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-blue-800">{totalLitersSum.toFixed(1)} L</div>
                      <div className="text-[10px] text-blue-600">Dispensed volume</div>
                    </div>
                  </div>

                  {/* Anti-Duplicate Banner Notice */}
                  {alreadyRowsCount > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-800">
                      <CheckCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <strong>Smart Duplicate Protection Active:</strong> {alreadyRowsCount} row(s) in this file were previously deducted for their respective Base, Date & Time and <strong>will not be deducted again</strong>.
                      </div>
                    </div>
                  )}

                  {/* Filter and Search Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          filterType === 'all'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        All ({totalRowsCount})
                      </button>
                      <button
                        onClick={() => setFilterType('new')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          filterType === 'new'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        New to Deduct ({newRowsCount})
                      </button>
                      <button
                        onClick={() => setFilterType('already')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          filterType === 'already'
                            ? 'bg-slate-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Already Applied ({alreadyRowsCount})
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative w-full sm:w-56">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search product, base..."
                          className="w-full text-xs pl-3 pr-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setParsedRows([]);
                          setFileName(null);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-100 rounded-xl hover:bg-slate-200 cursor-pointer shrink-0"
                        title="Upload another file"
                      >
                        Change File
                      </button>
                    </div>
                  </div>

                  {/* Records Table / List: Clean Card Layout resolving padding issue */}
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {filteredRows.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 border border-slate-200 rounded-2xl bg-slate-50">
                        No records match your filter criteria.
                      </div>
                    ) : (
                      filteredRows.map((row) => {
                        const isDone = row.isAlreadyProcessed || processedSet.has(row.tintRecordId);
                        const targetItem =
                          items.find((i) => i.id === manualMappings[row.tintRecordId]) ||
                          row.matchedItem;

                        const rowLiters = parseCanFactorToLiters(row.canFactor);

                        return (
                          <div
                            key={row.tintRecordId}
                            className={`p-4 rounded-2xl border transition-all ${
                              isDone
                                ? 'bg-slate-50/70 border-slate-200 opacity-80'
                                : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                            }`}
                          >
                            {/* Card Top: Title, Base badge, Can Factor & Status */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {row.productName}
                                </span>
                                {row.baseCode && (
                                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                                    BASE: {row.baseCode}
                                  </span>
                                )}
                                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  Can Factor: {row.canFactor} ({row.noOfCans} {row.noOfCans === 1 ? 'can' : 'cans'})
                                </span>
                              </div>

                              {/* Status Tag */}
                              <div className="shrink-0">
                                {isDone ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                                    Already Deducted ✓
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs">
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                    NEW (Will Deduct)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Card Middle: Size, Brand, Type Pills & Dispense Time */}
                            <div className="pt-2.5 pb-2 flex flex-wrap items-center justify-between gap-2">
                              {/* Prominent Size, Brand, Type Pills (User Requirement) */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  <span className="text-indigo-400 font-normal">Size:</span>
                                  <span>{targetItem?.size || row.canFactor}</span>
                                </div>

                                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  <span className="text-blue-400 font-normal">Brand:</span>
                                  <span>{targetItem?.brand || 'Asian Paints'}</span>
                                </div>

                                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                  <span className="text-purple-400 font-normal">Type:</span>
                                  <span>{targetItem?.type || 'Paint'}</span>
                                </div>
                              </div>

                              {/* Date & Time (Cleanly displayed, NO shade code!) */}
                              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>{row.tintDisplayDateTime}</span>
                              </div>
                            </div>

                            {/* Card Bottom: Stock Inventory Matching & Deduction (Spacious, Clean Padding, NO squeeze!) */}
                            <div className="mt-2 p-3.5 sm:p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-3">
                              {/* Deduction Summary Info */}
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                  <span>Deducting from Stock:</span>
                                  <span className="text-indigo-700 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200">
                                    {row.canFactor} Pack
                                  </span>
                                  <span className="text-slate-500 font-normal">
                                    ({row.totalLiters.toFixed(1)} Ltr dispensed)
                                  </span>
                                </div>
                                {targetItem && (
                                  <span className="text-rose-600 font-bold bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 text-xs">
                                    Deduct: -{row.deductQty} {row.deductUnit}
                                  </span>
                                )}
                              </div>

                              {/* Target Item Details Preview: Explicit Liter Pack and non-negative stock */}
                              {targetItem ? (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5">
                                    <span className="text-slate-500 font-medium">Item:</span>
                                    <strong className="text-slate-900">{targetItem.name}</strong>
                                  </div>
                                  <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5">
                                    <span className="text-slate-500 font-medium">Pack / Liter:</span>
                                    <strong className="text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 font-bold">
                                      {targetItem.size || row.canFactor} Pack
                                    </strong>
                                  </div>
                                  <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5">
                                    <span className="text-slate-500 font-medium">Current Stock:</span>
                                    <strong className="text-slate-900">{Math.max(0, targetItem.qty)} {targetItem.unit}</strong>
                                  </div>
                                  <div className="bg-emerald-50 text-emerald-800 px-2.5 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                                    <span className="font-medium">After Deduct:</span>
                                    <strong className="font-bold text-emerald-900">
                                      {Math.max(0, Math.round((targetItem.qty - row.deductQty) * 100) / 100)} {targetItem.unit}
                                    </strong>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-amber-800 text-xs bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                  <span>No exact stock item matched for {row.canFactor}. Please select product to deduct from below:</span>
                                </div>
                              )}

                              {/* Item Selector Dropdown: Full Width with clean padding */}
                              <div className="pt-1">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                                  Change or select product to deduct (showing Liter pack):
                                </label>
                                <select
                                  value={targetItem?.id || ''}
                                  onChange={(e) => {
                                    setManualMappings((prev) => ({
                                      ...prev,
                                      [row.tintRecordId]: e.target.value
                                    }));
                                  }}
                                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                                >
                                  <option value="">Select inventory product to deduct...</option>
                                  {items.map((it) => {
                                    const itLiters = parseCanFactorToLiters(it.size || it.name);
                                    const isMatchingSize = Math.abs(itLiters - rowLiters) < 0.05;
                                    const packLabel = it.size || (itLiters > 0 ? itLiters + ' Ltr' : 'Pack');
                                    return (
                                      <option key={it.id} value={it.id}>
                                        {isMatchingSize ? '★ [MATCHES ' + row.canFactor + '] ' : ''}
                                        {it.name} • Pack: {packLabel} • Brand: {it.brand || '-'} • Type: {it.type || '-'} (Stock: {Math.max(0, it.qty)} {it.unit})
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
                    <div className="text-xs text-slate-500 text-center sm:text-left">
                      {newRowsCount > 0 ? (
                        <span>
                          Ready to deduct <strong>{newRowsCount} item(s)</strong> from your stock.
                        </span>
                      ) : (
                        <span>All records in this report are already up-to-date.</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={onClose}
                        className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center"
                      >
                        Close
                      </button>
                      <button
                        onClick={handleApplyDeduction}
                        disabled={newRowsCount === 0}
                        className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          newRowsCount > 0
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 active:scale-95'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Deduct Stock & Apply Tint Report ({newRowsCount} New)
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* History Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Color Machine Tint History</h3>
                  <p className="text-xs text-slate-500">
                    Audit trail of all previous tint deductions applied to stock
                  </p>
                </div>
                {tintLogs.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('Clear all tint history logs and processed record IDs?')) {
                        clearTintLogs();
                      }
                    }}
                    className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-xl font-medium border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear History
                  </button>
                )}
              </div>

              {tintLogs.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                  <Paintbrush className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-500">No machine tint logs recorded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Upload a .CSC or .CSV report from the 'Import & Deduct' tab.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {tintLogs.map((log) => (
                    <div key={log.tintRecordId} className="p-4 hover:bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{log.productName}</span>
                          {log.baseCode && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                              BASE: {log.baseCode}
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                            Can Factor: {log.canFactor} x {log.noOfCans}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                            Total: {log.liters.toFixed(1)} Ltr
                          </span>
                        </div>

                        {/* Size, Brand, Type Details */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium text-[11px] border border-indigo-200">
                            Size: {log.matchedItemSize || log.canFactor}
                          </span>
                          {log.matchedItemBrand && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[11px] border border-blue-200">
                              Brand: {log.matchedItemBrand}
                            </span>
                          )}
                          {log.matchedItemType && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium text-[11px] border border-purple-200">
                              Type: {log.matchedItemType}
                            </span>
                          )}
                          <span className="text-slate-400 text-[11px]">•</span>
                          <span className="text-[11px] text-slate-500">
                            Tinted: {log.tintDate} {log.tintTime}
                          </span>
                        </div>

                        {/* Deducted From with full details (No truncation!) */}
                        <div className="text-xs text-slate-700 pt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-500 font-medium">Deducted from:</span>
                          <strong className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            {log.matchedItemName}
                          </strong>
                          <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px]">
                            -{log.qtyDeducted} {log.deductUnit} ({log.canFactor} pack)
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 mt-2 sm:mt-0">
                        <span className="text-xs font-bold text-rose-600 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 block">
                          -{log.qtyDeducted} {log.deductUnit}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Applied: {new Date(log.deductedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
