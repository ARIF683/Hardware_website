import React, { useState } from 'react';
import {
  Wallet,
  Users,
  Search,
  Plus,
  Phone,
  MessageCircle,
  Printer,
  Trash2,
  Edit2,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  CreditCard,
  Building,
  UserCheck,
  ChevronRight,
  Calendar,
  DollarSign
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { LedgerAccount, LedgerEntry, LedgerAccountType } from '../types';
import { formatRupees, formatDate } from '../utils/formatters';

interface LedgerScreenProps {
  onOpenPrintStatement?: (account: LedgerAccount, entries: LedgerEntry[]) => void;
}

export const LedgerScreen: React.FC<LedgerScreenProps> = ({ onOpenPrintStatement }) => {
  const {
    ledgerAccounts,
    ledgerEntries,
    addLedgerAccount,
    updateLedgerAccount,
    deleteLedgerAccount,
    addLedgerEntry,
    deleteLedgerEntry,
    shopProfile
  } = useStock();

  const [activeTypeTab, setActiveTypeTab] = useState<LedgerAccountType>('CUSTOMER');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Modals state
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showQuickEntryModal, setShowQuickEntryModal] = useState(false);
  const [quickEntryType, setQuickEntryType] = useState<'GAVE' | 'GOT'>('GOT');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickBillRef, setQuickBillRef] = useState('');
  const [quickDate, setQuickDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Add Account form state
  const [accName, setAccName] = useState('');
  const [accPhone, setAccPhone] = useState('');
  const [accAddress, setAccAddress] = useState('');
  const [accType, setAccType] = useState<LedgerAccountType>('CUSTOMER');
  const [accOpeningBal, setAccOpeningBal] = useState('0');
  const [accCreditLimit, setAccCreditLimit] = useState('50000');
  const [accNotes, setAccNotes] = useState('');

  // Calculations
  const customerAccounts = ledgerAccounts.filter((a) => a.type === 'CUSTOMER');
  const supplierAccounts = ledgerAccounts.filter((a) => a.type === 'SUPPLIER');

  // Customer: >0 is Receivable (You will get), <0 is Payable (You owe them)
  const totalReceivable = customerAccounts
    .filter((a) => a.netBalance > 0)
    .reduce((sum, a) => sum + a.netBalance, 0);

  // Supplier: >0 is Payable (You will pay)
  const totalPayable = supplierAccounts
    .filter((a) => a.netBalance > 0)
    .reduce((sum, a) => sum + a.netBalance, 0);

  const displayedAccounts = (activeTypeTab === 'CUSTOMER' ? customerAccounts : supplierAccounts).filter(
    (acc) =>
      acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.phone.includes(searchQuery) ||
      acc.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAccount = ledgerAccounts.find((a) => a.id === selectedAccountId);
  const selectedEntries = selectedAccount
    ? ledgerEntries
        .filter((e) => e.accountId === selectedAccount.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;

    addLedgerAccount(
      {
        name: accName.trim(),
        phone: accPhone.trim(),
        address: accAddress.trim(),
        type: accType,
        creditLimit: parseFloat(accCreditLimit) || 0,
        notes: accNotes.trim()
      },
      parseFloat(accOpeningBal) || 0
    );

    setShowAddAccountModal(false);
    setAccName('');
    setAccPhone('');
    setAccAddress('');
    setAccOpeningBal('0');
    setAccNotes('');
  };

  const handleQuickEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    const amt = parseFloat(quickAmount);
    if (!amt || amt <= 0) return;

    addLedgerEntry(
      selectedAccount.id,
      quickEntryType,
      amt,
      quickDesc.trim(),
      quickBillRef.trim(),
      quickDate
    );

    setShowQuickEntryModal(false);
    setQuickAmount('');
    setQuickDesc('');
    setQuickBillRef('');
  };

  const sendWhatsAppReminder = (account: LedgerAccount) => {
    if (!account.phone) {
      alert('No phone number saved for this account');
      return;
    }
    const cleanPhone = account.phone.replace(/[^0-9]/g, '');
    const isCustomer = account.type === 'CUSTOMER';
    const text = encodeURIComponent(
      `Dear ${account.name},\n` +
      `This is a polite reminder from *${shopProfile.name}* regarding your outstanding balance of *${formatRupees(
        Math.abs(account.netBalance)
      )}*.\n\n` +
      `Kindly arrange the payment at your earliest convenience via UPI to: *${shopProfile.upiId}* or visit our shop.\n\n` +
      `Thank you!\n` +
      `${shopProfile.name} (${shopProfile.phone})`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Top Overview Cards (Receivable vs Payable) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Receivable (You will get)
            </span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-600">
            {formatRupees(totalReceivable)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            From {customerAccounts.length} customer accounts
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Payable (You will pay)
            </span>
            <ArrowUpRight className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-red-600">
            {formatRupees(totalPayable)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            To {supplierAccounts.length} supplier accounts
          </p>
        </div>
      </div>

      {/* Main Content Layout */}
      {!selectedAccountId ? (
        // Accounts List View
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Type Switcher: Customers vs Suppliers */}
              <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  onClick={() => setActiveTypeTab('CUSTOMER')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeTypeTab === 'CUSTOMER'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Customers & Contractors ({customerAccounts.length})
                </button>
                <button
                  onClick={() => setActiveTypeTab('SUPPLIER')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeTypeTab === 'SUPPLIER'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Suppliers & Vendors ({supplierAccounts.length})
                </button>
              </div>

              {/* Add Account Button */}
              <button
                onClick={() => {
                  setAccType(activeTypeTab);
                  setShowAddAccountModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add {activeTypeTab === 'CUSTOMER' ? 'Customer' : 'Supplier'}</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeTypeTab.toLowerCase()} by name, phone or address…`}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Accounts Cards List */}
          {displayedAccounts.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-xs text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">
                No {activeTypeTab === 'CUSTOMER' ? 'customers' : 'suppliers'} found
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Maintain credit books (Khata), payment logs, and send automated WhatsApp reminders.
              </p>
              <button
                onClick={() => {
                  setAccType(activeTypeTab);
                  setShowAddAccountModal(true);
                }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Add Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayedAccounts.map((account) => {
                const isCustomer = account.type === 'CUSTOMER';
                // For customer: >0 is receivable (green), <0 is payable
                // For supplier: >0 is payable (red)
                const isPositive = account.netBalance > 0;

                return (
                  <div
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className="bg-white rounded-2xl p-4 border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-slate-900 leading-snug truncate">
                            {account.name}
                          </h3>
                          {account.phone && (
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {account.phone}
                            </p>
                          )}
                          {account.address && (
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                              {account.address}
                            </p>
                          )}
                        </div>

                        {/* Net Balance Badge */}
                        <div className="text-right shrink-0">
                          <div
                            className={`text-base font-bold ${
                              isCustomer
                                ? isPositive
                                  ? 'text-emerald-600'
                                  : 'text-slate-700'
                                : isPositive
                                ? 'text-red-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {formatRupees(Math.abs(account.netBalance))}
                          </div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400">
                            {isCustomer
                              ? isPositive
                                ? 'You Will Get'
                                : 'You Will Give'
                              : isPositive
                              ? 'You Will Pay'
                              : 'Advance Paid'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span className="text-[11px]">
                        Credit limit: {formatRupees(account.creditLimit)}
                      </span>
                      <span className="text-blue-600 font-bold flex items-center gap-1 hover:underline">
                        View Statement
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Account Detail View & Statement
        selectedAccount && (
          <div className="space-y-4">
            {/* Top Bar with Back and Actions */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedAccountId(null)}
                    className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{selectedAccount.name}</h2>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-slate-100 text-slate-700">
                        {selectedAccount.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {selectedAccount.phone} {selectedAccount.address ? `· ${selectedAccount.address}` : ''}
                    </p>
                  </div>
                </div>

                {/* Balance display & WhatsApp shortcut */}
                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      {selectedAccount.type === 'CUSTOMER' ? 'Net Receivable' : 'Net Payable'}
                    </span>
                    <div
                      className={`text-lg sm:text-xl font-black ${
                        selectedAccount.type === 'CUSTOMER'
                          ? selectedAccount.netBalance > 0
                            ? 'text-emerald-600'
                            : 'text-slate-700'
                          : selectedAccount.netBalance > 0
                          ? 'text-red-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {formatRupees(Math.abs(selectedAccount.netBalance))}
                    </div>
                  </div>

                  {selectedAccount.phone && (
                    <button
                      onClick={() => sendWhatsAppReminder(selectedAccount)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition-colors"
                      title="Send WhatsApp payment reminder"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (confirm(`Delete account for ${selectedAccount.name}?`)) {
                        deleteLedgerAccount(selectedAccount.id);
                        setSelectedAccountId(null);
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                    title="Delete Account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick Entry Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setQuickEntryType('GAVE');
                    setShowQuickEntryModal(true);
                  }}
                  className="flex-1 py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>
                    - You Gave (₹){' '}
                    <span className="text-[10px] font-normal hidden sm:inline">
                      {selectedAccount.type === 'CUSTOMER' ? '(Goods / Credit)' : '(Payment)'}
                    </span>
                  </span>
                </button>

                <button
                  onClick={() => {
                    setQuickEntryType('GOT');
                    setShowQuickEntryModal(true);
                  }}
                  className="flex-1 py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>
                    + You Got (₹){' '}
                    <span className="text-[10px] font-normal hidden sm:inline">
                      {selectedAccount.type === 'CUSTOMER' ? '(Payment Received)' : '(Goods Received)'}
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {/* Entries Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Transaction Statement ({selectedEntries.length})
                </h3>
              </div>

              {selectedEntries.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  No entries recorded yet. Tap + You Got or - You Gave to log a transaction.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {selectedEntries.map((entry) => {
                    const isGave = entry.type === 'GAVE';
                    return (
                      <div
                        key={entry.id}
                        className="p-3.5 sm:p-4 flex items-center justify-between gap-3 text-xs hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {entry.description || (isGave ? 'You Gave' : 'You Got')}
                            </span>
                            {entry.billRef && (
                              <span className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 rounded text-slate-600">
                                #{entry.billRef}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 mt-0.5 block">
                            {formatDate(entry.date)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div
                              className={`font-bold text-sm ${
                                isGave ? 'text-red-600' : 'text-emerald-600'
                              }`}
                            >
                              {isGave ? '-' : '+'}
                              {formatRupees(entry.amount)}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              Bal {formatRupees(entry.balanceAfter)}
                            </span>
                          </div>

                          <button
                            onClick={() => {
                              if (confirm('Delete this entry?')) {
                                deleteLedgerEntry(entry.id);
                              }
                            }}
                            className="p-1 text-slate-300 hover:text-red-500"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Add Ledger Account Modal */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Add New {accType === 'CUSTOMER' ? 'Customer' : 'Supplier'} Account
              </h3>
              <button
                onClick={() => setShowAddAccountModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-4 sm:p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  required
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="e.g. Ramesh Contractor or Asian Paints Agency"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number (for WhatsApp reminders)
                </label>
                <input
                  type="text"
                  value={accPhone}
                  onChange={(e) => setAccPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={accAddress}
                  onChange={(e) => setAccAddress(e.target.value)}
                  placeholder="Shop / Site address"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={accOpeningBal}
                    onChange={(e) => setAccOpeningBal(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {accType === 'CUSTOMER' ? '>0 is what they owe you' : '>0 is what you owe them'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Credit Limit (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={accCreditLimit}
                    onChange={(e) => setAccCreditLimit(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={accNotes}
                  onChange={(e) => setAccNotes(e.target.value)}
                  placeholder="e.g. Regular site contractor"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Entry Modal (Got / Gave) */}
      {showQuickEntryModal && selectedAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {quickEntryType === 'GOT' ? '+ You Got (Payment/Goods)' : '- You Gave (Goods/Payment)'}
              </h3>
              <button
                onClick={() => setShowQuickEntryModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickEntry} className="p-4 sm:p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  required
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Remarks
                </label>
                <input
                  type="text"
                  value={quickDesc}
                  onChange={(e) => setQuickDesc(e.target.value)}
                  placeholder="e.g. UPI payment, CPVC Pipes bill, etc."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Bill / Ref No
                  </label>
                  <input
                    type="text"
                    value={quickBillRef}
                    onChange={(e) => setQuickBillRef(e.target.value)}
                    placeholder="INV-102"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickEntryModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs ${
                    quickEntryType === 'GOT'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Confirm Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
