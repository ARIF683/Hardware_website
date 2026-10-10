import React, { useState } from 'react';
import { FileText, Wallet, Receipt, Plus } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { QuotationScreen } from './QuotationScreen';
import { LedgerScreen } from './LedgerScreen';
import { QuotationRecord, LedgerAccount, LedgerEntry } from '../types';

interface BillingHubScreenProps {
  onOpenQuickBill: () => void;
  onOpenPrint: (type: 'quotation' | 'bill', data: QuotationRecord) => void;
  initialSubTab?: number;
}

export const BillingHubScreen: React.FC<BillingHubScreenProps> = ({
  onOpenQuickBill,
  onOpenPrint,
  initialSubTab = 0,
}) => {
  const { quotations, ledgerAccounts } = useStock();
  const [selectedSubTab, setSelectedSubTab] = useState<number>(initialSubTab);

  return (
    <div className="space-y-4 pb-20 md:pb-8">
      {/* Top Segmented Sub-tab Bar (Matching BillingHubScreen.kt) */}
      <div className="bg-white rounded-2xl p-1.5 border border-slate-200/80 shadow-xs flex items-center justify-between gap-2">
        <div className="flex bg-slate-100 p-1 rounded-xl flex-1 max-w-md">
          {/* Tab 1: Estimates & Quotes */}
          <button
            onClick={() => setSelectedSubTab(0)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              selectedSubTab === 0
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            <span>Estimates ({quotations.length})</span>
          </button>

          {/* Tab 2: Khata Ledger */}
          <button
            onClick={() => setSelectedSubTab(1)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              selectedSubTab === 1
                ? 'bg-white text-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span>Khata Ledger ({ledgerAccounts.length})</span>
          </button>
        </div>

        {/* Quick action button to Purchase Bill */}
        <button
          onClick={onOpenQuickBill}
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-xl transition-colors shadow-xs"
        >
          <Receipt className="w-4 h-4 text-amber-700" />
          <span>+ Purchase Bill Entry</span>
        </button>
      </div>

      {/* Body Content */}
      {selectedSubTab === 0 ? (
        <QuotationScreen onOpenPrint={onOpenPrint} />
      ) : (
        <LedgerScreen />
      )}
    </div>
  );
};
