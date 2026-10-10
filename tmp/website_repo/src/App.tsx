import React, { useState } from 'react';
import { StockProvider, useStock } from './context/StockContext';
import { Navbar } from './components/Navbar';
import { HomeScreen } from './components/HomeScreen';
import { ItemsScreen } from './components/ItemsScreen';
import { BillingHubScreen } from './components/BillingHubScreen';
import { BillScreen } from './components/BillScreen';
import { TransactionsScreen } from './components/TransactionsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { ItemDetailModal } from './components/ItemDetailModal';
import { ItemFormModal } from './components/ItemFormModal';
import { StockTransactionModal } from './components/StockTransactionModal';
import { PrintModal } from './components/PrintModal';
import { CalculatorModal } from './components/CalculatorModal';
import { UnitConversionModal } from './components/UnitConversionModal';
import { AuthGateScreen } from './components/AuthGateScreen';
import { NavigationTab, Item, QuotationRecord } from './types';

const MainAppContent: React.FC = () => {
  const { isPinLocked, isAuthed, toastMessage, shopProfile, themeColor } = useStock();

  const hexToRgba = (hex: string, alpha: number) => {
    if (!hex || hex[0] !== '#') return `rgba(59, 130, 246, ${alpha})`;
    try {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } catch {
      return `rgba(59, 130, 246, ${alpha})`;
    }
  };

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<NavigationTab>('HOME');

  // Item modals state
  const [selectedDetailItemId, setSelectedDetailItemId] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);

  // Quick transaction modal
  const [transactionItem, setTransactionItem] = useState<Item | null>(null);
  const [transactionAction, setTransactionAction] = useState<'in' | 'out'>('in');

  // Full-screen purchase bill flow
  const [showBillFlow, setShowBillFlow] = useState(false);

  // Print modal
  const [printDoc, setPrintDoc] = useState<{
    type: 'quotation' | 'bill';
    data: QuotationRecord;
  } | null>(null);

  // Utility modals
  const [showCalculator, setShowCalculator] = useState(false);
  const [showConverter, setShowConverter] = useState(false);

  // Low stock filter trigger from Home
  const [lowStockFilterActive, setLowStockFilterActive] = useState(false);

  if (isPinLocked && !isAuthed) {
    return <AuthGateScreen />;
  }

  const handleOpenNewItem = () => {
    setItemToEdit(null);
    setShowItemForm(true);
  };

  const handleEditItem = (item: Item) => {
    setSelectedDetailItemId(null);
    setItemToEdit(item);
    setShowItemForm(true);
  };

  const handleOpenTransaction = (item: Item, action: 'in' | 'out') => {
    setTransactionItem(item);
    setTransactionAction(action);
  };

  const handleOpenPrint = (type: 'quotation' | 'bill', data: QuotationRecord) => {
    setPrintDoc({ type, data });
  };

  const handleFilterLowStockFromHome = () => {
    setLowStockFilterActive(true);
    setCurrentTab('ITEMS');
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans w-full max-w-full overflow-x-hidden">
      <style>{`
        :root {
          --color-blue-50: ${hexToRgba(themeColor, 0.08)} !important;
          --color-blue-100: ${hexToRgba(themeColor, 0.15)} !important;
          --color-blue-200: ${hexToRgba(themeColor, 0.25)} !important;
          --color-blue-500: ${themeColor} !important;
          --color-blue-600: ${themeColor} !important;
          --color-blue-700: ${hexToRgba(themeColor, 0.85)} !important;
          --color-blue-900: ${hexToRgba(themeColor, 0.95)} !important;
          --color-brand-blue: ${themeColor} !important;
          --color-brand-blue-dark: ${hexToRgba(themeColor, 0.85)} !important;
          --color-indigo-600: ${themeColor} !important;
          --color-indigo-700: ${hexToRgba(themeColor, 0.85)} !important;
          --color-indigo-50: ${hexToRgba(themeColor, 0.08)} !important;
        }
      `}</style>
      {/* Top Navigation Bar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setShowBillFlow(false);
          setLowStockFilterActive(false);
          setCurrentTab(tab);
        }}
        onOpenNewItem={handleOpenNewItem}
        onOpenQuickBill={() => setShowBillFlow(true)}
        onOpenCalculator={() => setShowCalculator(true)}
        onOpenConverter={() => setShowConverter(true)}
      />

      {/* Main View Port */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 overflow-x-hidden">
        {showBillFlow ? (
          <BillScreen
            onBack={() => setShowBillFlow(false)}
            onOpenCalculator={() => setShowCalculator(true)}
          />
        ) : (
          <>
            {currentTab === 'HOME' && (
              <HomeScreen
                onNavigateTab={(tab) => setCurrentTab(tab)}
                onOpenItemDetail={(id) => setSelectedDetailItemId(id)}
                onOpenQuickBill={() => setShowBillFlow(true)}
                onOpenNewItem={handleOpenNewItem}
                onFilterLowStock={handleFilterLowStockFromHome}
              />
            )}

            {currentTab === 'ITEMS' && (
              <ItemsScreen
                onOpenItemDetail={(id) => setSelectedDetailItemId(id)}
                onOpenNewItem={handleOpenNewItem}
                onOpenTransaction={handleOpenTransaction}
                initialLowStockFilter={lowStockFilterActive}
              />
            )}

            {currentTab === 'BILLING' && (
              <BillingHubScreen
                onOpenQuickBill={() => setShowBillFlow(true)}
                onOpenPrint={handleOpenPrint}
              />
            )}

            {currentTab === 'TRANSACTIONS' && <TransactionsScreen />}

            {currentTab === 'SETTINGS' && <SettingsScreen />}
          </>
        )}
      </main>

      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white px-5 py-2.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200 flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      {selectedDetailItemId && (
        <ItemDetailModal
          itemId={selectedDetailItemId}
          onClose={() => setSelectedDetailItemId(null)}
          onEdit={handleEditItem}
          onOpenTransaction={handleOpenTransaction}
        />
      )}

      {showItemForm && (
        <ItemFormModal
          isOpen={showItemForm}
          itemToEdit={itemToEdit}
          onClose={() => {
            setShowItemForm(false);
            setItemToEdit(null);
          }}
        />
      )}

      {transactionItem && (
        <StockTransactionModal
          item={transactionItem}
          initialAction={transactionAction}
          onClose={() => setTransactionItem(null)}
        />
      )}

      {printDoc && (
        <PrintModal
          isOpen={true}
          type={printDoc.type}
          data={printDoc.data}
          shopProfile={shopProfile}
          onClose={() => setPrintDoc(null)}
        />
      )}

      <CalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
      />

      <UnitConversionModal
        isOpen={showConverter}
        onClose={() => setShowConverter(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <StockProvider>
      <MainAppContent />
    </StockProvider>
  );
}
