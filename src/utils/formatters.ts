export function toPaise(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaise(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

export function addMoney(a: number, b: number): number {
  return fromPaise(toPaise(a) + toPaise(b));
}

export function calcLineAmount(qty: number, unitPrice: number, discountPercent = 0): number {
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const pricePaise = Math.max(0, toPaise(unitPrice));
  const safeDisc = Number.isFinite(discountPercent)
    ? Math.max(0, Math.min(100, discountPercent))
    : 0;
  const grossPaise = Math.round(safeQty * pricePaise);
  const discPaise = Math.round((grossPaise * safeDisc) / 100);
  return fromPaise(Math.max(0, grossPaise - discPaise));
}

export function calcQuotationTotals(
  lines: Array<{ total?: number }>,
  discountRupees: number,
  taxPercent: number
): {
  subtotal: number;
  discount: number;
  taxable: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
} {
  const subtotalPaise = (Array.isArray(lines) ? lines : []).reduce(
    (sum, item) => sum + Math.max(0, toPaise(Number(item?.total ?? 0))),
    0
  );
  const discountPaise = Math.max(0, toPaise(discountRupees));
  const taxablePaise = Math.max(0, subtotalPaise - discountPaise);
  const safeTaxPct = Number.isFinite(taxPercent) && taxPercent > 0 ? taxPercent : 0;
  const taxPaise = Math.round((taxablePaise * safeTaxPct) / 100);
  const grandTotalPaise = taxablePaise + taxPaise;

  return {
    subtotal: fromPaise(subtotalPaise),
    discount: fromPaise(discountPaise),
    taxable: fromPaise(taxablePaise),
    taxPercent: safeTaxPct,
    taxAmount: fromPaise(taxPaise),
    grandTotal: fromPaise(grandTotalPaise),
  };
}

export function formatRupees(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatQty(qty: number, unit?: string): string {
  const formatted = qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
  return unit && unit !== "pcs" ? `${formatted} ${unit}` : formatted;
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
