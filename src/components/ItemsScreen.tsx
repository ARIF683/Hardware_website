import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Filter,
  ArrowUpDown,
  AlertTriangle,
  Package,
  Layers,
  CheckSquare,
  Square,
  Trash2,
  Image,
  SlidersHorizontal,
  X,
  PlusCircle,
  MinusCircle,
  Tag,
  Mic,
  QrCode,
  Paintbrush
} from 'lucide-react';
import { ColorMachineTintModal } from './ColorMachineTintModal';
import { useStock } from '../context/StockContext';
import { supabaseService } from '../services/supabaseService';
import { Item } from '../types';
import { formatRupees, formatQty } from '../utils/formatters';

interface ItemsScreenProps {
  onOpenItemDetail: (itemId: string) => void;
  onOpenNewItem: () => void;
  onOpenTransaction: (item: Item, action: 'in' | 'out') => void;
  initialLowStockFilter?: boolean;
}

export type GroupByOption =
  | 'none'
  | 'type'
  | 'brand'
  | 'size'
  | 'unit'
  | 'mrp'
  | 'cost'
  | 'price'
  | 'name';

export function getItemGroupKey(item: Item, gb: GroupByOption): string {
  switch (gb) {
    case 'type':
      return item.type && item.type.trim().length > 0 ? item.type.trim() : 'Uncategorized';
    case 'brand':
      return item.brand && item.brand.trim().length > 0 ? item.brand.trim() : 'No Brand';
    case 'size':
      return item.size && item.size.trim().length > 0 ? item.size.trim() : 'No Size';
    case 'unit':
      return item.unit && item.unit.trim().length > 0 ? item.unit.trim().toLowerCase() : 'pcs';
    case 'mrp':
      return item.mrp !== null && item.mrp !== undefined && item.mrp > 0
        ? formatRupees(item.mrp)
        : 'No MRP';
    case 'cost':
      return formatRupees(item.cost);
    case 'price':
      return formatRupees(item.price);
    case 'name':
      return item.name && item.name.trim().length > 0 ? item.name.trim() : '—';
    default:
      return '—';
  }
}

export const ItemsScreen: React.FC<ItemsScreenProps> = ({
  onOpenItemDetail,
  onOpenNewItem,
  onOpenTransaction,
  initialLowStockFilter = false,
}) => {
  const { items, deleteMultipleItems, updateMultipleItemsImage, showToast, isAdmin } = useStock();

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(initialLowStockFilter);
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'o' | 'n' | 'nz' | 'q' | 'c'>('o');

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingBulkImage, setIsUploadingBulkImage] = useState(false);
  const [showColorMachineModal, setShowColorMachineModal] = useState(false);

  const handleBulkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedIds.size === 0) return;
    setIsUploadingBulkImage(true);
    try {
      const url = await supabaseService.uploadImageToCloudinary(file);
      await updateMultipleItemsImage(Array.from(selectedIds), url);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (err: any) {
      console.error('Bulk image upload error:', err);
      showToast(`Image upload failed: ${err?.message || 'Error'}`);
    } finally {
      setIsUploadingBulkImage(false);
      if (e.target) e.target.value = '';
    }
  };

  // Group summary list computed across ALL items in database
  const groupList = useMemo(() => {
    if (groupBy === 'none') return [];
    const counts: { [key: string]: { count: number; totalQty: number } } = {};
    items.forEach((item) => {
      const key = getItemGroupKey(item, groupBy);
      if (!counts[key]) counts[key] = { count: 0, totalQty: 0 };
      counts[key].count += 1;
      counts[key].totalQty += item.qty;
    });

    return Object.entries(counts)
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalQty: data.totalQty
      }))
      .sort((a, b) => b.count - a.count); // Show group with largest item count first
  }, [items, groupBy]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Search query (smart matcher: handles spaces like 'Ab 11' matching 'Ab11', multi-word tokens, brand, size, etc.)
    if (searchQuery.trim()) {
      const rawQ = searchQuery.toLowerCase().trim();
      const cleanQ = rawQ.replace(/[^a-z0-9]/g, '');
      const tokens = rawQ.split(/\s+/).filter(Boolean);

      result = result.filter((item) => {
        const fields = [
          item.name || '',
          item.code || '',
          item.barcode || '',
          item.type || '',
          item.brand || '',
          item.size || '',
          item.aliases || ''
        ].map((f) => f.toLowerCase());

        // 1. Direct field substring match
        if (fields.some((f) => f.includes(rawQ))) return true;

        // 2. Clean alphanumeric match (e.g. 'Ab 11' matches 'Ab11' or 'AB11', 'te 15' matches 'TE15')
        if (cleanQ) {
          const cleanFields = fields.map((f) => f.replace(/[^a-z0-9]/g, ''));
          if (cleanFields.some((f) => f.includes(cleanQ))) return true;
        }

        // 3. Multi-word tokens: every word in query must match
        if (tokens.length > 1) {
          const combined = fields.join(' ');
          const combinedClean = combined.replace(/[^a-z0-9]/g, '');
          const allTokensMatch = tokens.every((t) => {
            const ct = t.replace(/[^a-z0-9]/g, '');
            return combined.includes(t) || (ct && combinedClean.includes(ct));
          });
          if (allTokensMatch) return true;
        }

        return false;
      });
    }

    // In-stock only
    if (inStockOnly) {
      result = result.filter((item) => item.qty > 0);
    }

    // Low / Out of stock only
    if (lowStockOnly) {
      result = result.filter(
        (item) => item.qty <= 0 || (item.low > 0 && item.qty <= item.low)
      );
    }

    // Group filter if a group chip is chosen
    if (groupBy !== 'none' && selectedGroup) {
      result = result.filter((item) => getItemGroupKey(item, groupBy) === selectedGroup);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortOption === 'n') return a.name.localeCompare(b.name);
      if (sortOption === 'nz') return b.name.localeCompare(a.name);
      if (sortOption === 'q') return b.qty - a.qty;
      if (sortOption === 'c') return b.cost - a.cost;
      return a.o - b.o; // default order
    });

    return result;
  }, [items, searchQuery, inStockOnly, lowStockOnly, groupBy, selectedGroup, sortOption]);

  const toggleSelect = (id: string, e: React.MouseEvent | null) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Delete ${selectedIds.size} selected items?`)) {
      deleteMultipleItems(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    }
  };

  return (
    <div className="space-y-4 pb-24 md:pb-8">
      {/* Top Search & Actions Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, code, barcode, brand, category, size…"
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Color Machine Tint Import Button */}
          <button
            onClick={() => setShowColorMachineModal(true)}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
            title="Color Machine Tint Import (.CSC / .CSV)"
          >
            <Paintbrush className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Tint Machine</span>
          </button>

          {/* Multi-selection toggle */}
          <button
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedIds(new Set());
            }}
            className={`p-2.5 rounded-xl border transition-all ${
              isSelectionMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'text-slate-600 hover:bg-slate-100 border-slate-200'
            }`}
            title="Batch Select"
          >
            <CheckSquare className="w-4 h-4" />
          </button>
        </div>

        {/* Filters and Groupings row */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          {/* In stock toggle */}
          <button
            onClick={() => setInStockOnly(!inStockOnly)}
            className={`px-3 py-1.5 rounded-xl font-medium border transition-all ${
              inStockOnly
                ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            In Stock Only
          </button>

          {/* Low stock toggle */}
          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium border transition-all ${
              lowStockOnly
                ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Low Stock
          </button>

          {/* Group By selector with all DB attributes */}
          <div className="flex items-center gap-1 ml-auto flex-wrap sm:flex-nowrap">
            <span className="text-slate-400 text-[11px] uppercase tracking-wider hidden sm:inline">
              Group By:
            </span>
            <select
              value={groupBy}
              onChange={(e) => {
                setGroupBy(e.target.value as GroupByOption);
                setSelectedGroup(null);
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="none">No Grouping</option>
              <option value="type">By Category / Type</option>
              <option value="brand">By Brand</option>
              <option value="size">By Size / Dimension</option>
              <option value="unit">By Packaging Unit</option>
              <option value="mrp">By MRP</option>
              <option value="cost">By Cost Price</option>
              <option value="price">By Selling Price</option>
              <option value="name">By Item Name</option>
            </select>

            {/* Sort selector */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="o">Default Order</option>
              <option value="n">Name (A-Z)</option>
              <option value="nz">Name (Z-A)</option>
              <option value="q">Quantity (High to Low)</option>
              <option value="c">Cost (High to Low)</option>
            </select>
          </div>
        </div>

        {/* Group Filter Chips when Group By is active */}
        {groupBy !== 'none' && (
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">
                Found {groupList.length} unique groups for "{groupBy.toUpperCase()}":
              </span>
              {selectedGroup && (
                <button
                  onClick={() => setSelectedGroup(null)}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Clear Group Filter
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
              <button
                onClick={() => setSelectedGroup(null)}
                className={`px-3 py-1.5 rounded-xl text-xs shrink-0 font-bold transition-all ${
                  selectedGroup === null
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All ({items.length})
              </button>
              {groupList.map((g) => {
                const isSelected = selectedGroup === g.name;
                return (
                  <button
                    key={g.name}
                    onClick={() => setSelectedGroup(isSelected ? null : g.name)}
                    className={`px-3 py-1.5 rounded-xl text-xs shrink-0 font-bold transition-all border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {g.name} <span className={isSelected ? 'text-blue-100' : 'text-slate-400'}>({g.count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selection mode banner */}
        {isSelectionMode && (
          <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-900">
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="px-2 py-1 bg-white rounded-lg border border-blue-200 hover:bg-blue-100"
              >
                {selectedIds.size === filteredItems.length ? 'Deselect All' : 'Select All'}
              </button>
              <span>{selectedIds.size} selected</span>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleBulkImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingBulkImage}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-xs disabled:opacity-50"
                >
                  <Image className="w-3.5 h-3.5" />
                  {isUploadingBulkImage ? 'Uploading...' : 'Set Photo'}
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Items List Count Header */}
      <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
        <p>
          Showing {filteredItems.length} of {items.length} database items
          {selectedGroup ? ` in group "${selectedGroup}"` : ''}
        </p>
      </div>

      {/* Item Cards Grid / List */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-xs text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No items match your criteria</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search terms, clearing group filters, or adding a new item to your catalog.
          </p>
          <button
            onClick={onOpenNewItem}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add New Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const isOutOfStock = item.qty <= 0;
            const isLowStock = !isOutOfStock && item.low > 0 && item.qty <= item.low;
            const margin =
              item.cost > 0 ? (((item.price - item.cost) / item.cost) * 100).toFixed(1) : null;

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleSelect(item.id, null);
                  } else {
                    onOpenItemDetail(item.id);
                  }
                }}
                className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs hover:shadow-md relative ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Multi-select check */}
                {isSelectionMode && (
                  <button
                    onClick={(e) => toggleSelect(item.id, e)}
                    className="absolute top-4 right-4 text-blue-600"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 fill-blue-600 text-white" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                )}

                <div className="flex items-start justify-between gap-3 pr-2">
                  <div className="flex items-start gap-3 min-w-0">
                    {item.imageUrl ? (
                      <div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 mt-0.5">
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-center shrink-0 border border-blue-200 mt-0.5 text-[9px] leading-tight px-1 uppercase tracking-tight">
                        NO IMAGE
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug line-clamp-2">
                        {item.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {item.type && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                            {item.type}
                          </span>
                        )}
                        {item.brand && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700">
                            {item.brand}
                          </span>
                        )}
                        {item.size && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-700">
                            {item.size}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock Quantity Badge */}
                  <div className="text-right shrink-0">
                    <div
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold ${
                        isOutOfStock
                          ? 'bg-red-100 text-red-700'
                          : isLowStock
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isLowStock && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                      <span>{formatQty(item.qty, item.unit)}</span>
                    </div>
                    {item.low > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">Min: {item.low}</p>
                    )}
                  </div>
                </div>

                {/* Pricing & Margin info */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {formatRupees(item.price)}
                      </span>
                      {item.mrp && item.mrp > item.price && (
                        <span className="line-through text-slate-400 text-[11px]">
                          {formatRupees(item.mrp)}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Cost: {formatRupees(item.cost)}{' '}
                      {margin && (
                        <span className="text-emerald-600 font-semibold">({margin}% margin)</span>
                      )}
                    </div>
                  </div>

                  {/* Quick Stock In / Out Buttons */}
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenTransaction(item, 'out')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/80 rounded-lg transition-colors"
                      title="Stock Out / Sell"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>Out</span>
                    </button>
                    <button
                      onClick={() => onOpenTransaction(item, 'in')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg transition-colors"
                      title="Stock In / Receive"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>In</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button for Adding New Item */}
      <button
        onClick={onOpenNewItem}
        className="fixed bottom-20 md:bottom-8 right-6 z-30 flex items-center gap-2 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-2xl shadow-lg hover:shadow-xl transition-all group scale-100 hover:scale-105"
      >
        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
        <span>New Item</span>
      </button>
      {showColorMachineModal && (
        <ColorMachineTintModal
          isOpen={showColorMachineModal}
          onClose={() => setShowColorMachineModal(false)}
        />
      )}
    </div>
  );
};
