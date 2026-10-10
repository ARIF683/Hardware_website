import { Item, ParsedTintRow } from '../types';

/**
 * Splits a CSV line respecting quoted commas and semicolons.
 */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' || c === ';') && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

/**
 * Converts machine CAN_FACTOR string (e.g. 1, 4, 10, 20 Ltr, "1 LIT", "4 LIT", "10 LIT", "20 LIT", "500 ML") to Liters.
 */
export function parseCanFactorToLiters(canFactor: string | number | undefined | null): number {
  if (typeof canFactor === 'number') return canFactor;
  const clean = (canFactor || '').toString().trim().toUpperCase();
  if (!clean) return 1.0;

  // Direct exact checks for standard paint packaging sizes: 1, 4, 10, 20 Ltr
  if (clean === '1' || clean === '1L' || clean === '1 LTR' || clean === '1 LIT' || clean === '1 LITER') return 1.0;
  if (clean === '4' || clean === '4L' || clean === '4 LTR' || clean === '4 LIT' || clean === '4 LITER') return 4.0;
  if (clean === '10' || clean === '10L' || clean === '10 LTR' || clean === '10 LIT' || clean === '10 LITER') return 10.0;
  if (clean === '20' || clean === '20L' || clean === '20 LTR' || clean === '20 LIT' || clean === '20 LITER') return 20.0;

  const numStr = clean.replace(/[^0-9.]/g, '');
  const num = parseFloat(numStr) || 1.0;
  if (clean.includes('ML')) {
    return num / 1000.0;
  }
  return num;
}

/**
 * Formats can factor to clean display string (e.g., "1 Ltr", "4 Ltr", "10 Ltr", "20 Ltr", "500 ml").
 */
export function formatCanFactorDisplay(canFactor: string | number | undefined | null): string {
  const liters = parseCanFactorToLiters(canFactor);
  if (liters < 1.0) {
    return String(Math.round(liters * 1000)) + ' ml';
  } else if (Number.isInteger(liters)) {
    return String(liters) + ' Ltr';
  } else {
    return String(liters) + ' Ltr';
  }
}

/**
 * Generates a deterministic, unique record ID fingerprint to guarantee idempotency.
 * Note: Only reads date, time, baseName, product, canFactor, noOfCan. Does NOT read shade code!
 */
export function generateTintRecordId(
  date: string,
  time: string,
  product: string,
  base: string,
  canFactor: string,
  noOfCan: number
): string {
  const raw = [
    (date || '').trim(),
    (time || '').trim(),
    (product || '').trim(),
    (base || '').trim(),
    (canFactor || '').trim(),
    String(noOfCan)
  ].join('|').toLowerCase();

  return raw.replace(/[^a-z0-9|_-]/g, '_');
}

/**
 * Robust parser for machine date & time (e.g. "08-Oct-26" and "10:15:30").
 */
export function parseTintDateTime(dateStr: string, timeStr: string): { iso: string; display: string } {
  const now = new Date();
  if (!dateStr || !dateStr.trim()) {
    return {
      iso: now.toISOString(),
      display: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 12:00 PM'
    };
  }

  const cleanDate = dateStr.trim();
  const cleanTime = (timeStr || '').trim() || '12:00:00';
  let parsed = new Date(cleanDate + ' ' + cleanTime);

  if (isNaN(parsed.getTime())) {
    const parts = cleanDate.split(/[-/.]/);
    if (parts.length === 3) {
      parsed = new Date(parts[1] + ' ' + parts[0] + ', 20' + parts[2].slice(-2) + ' ' + cleanTime);
    }
  }

  const finalDate = isNaN(parsed.getTime()) ? now : parsed;

  return {
    iso: finalDate.toISOString(),
    display: finalDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  };
}

/**
 * Matches machine base name & can factor (1, 4, 10, 20 Ltr) to the best matching inventory item.
 * Explicitly prioritizes matching the EXACT CAN FACTOR / SIZE (e.g. 1 Ltr vs 4 Ltr vs 10 Ltr vs 20 Ltr).
 */
export function findBestMatchingItem(
  productName: string,
  baseName: string,
  canFactor: string,
  items: Item[]
): Item | null {
  if (!items || items.length === 0) return null;

  const pClean = (productName || '').trim().toUpperCase();
  const bClean = (baseName || '').trim().toUpperCase();
  const liters = parseCanFactorToLiters(canFactor);

  // Size search variants for this can factor (1, 4, 10, 20 Ltr)
  const sizeKeywords = [
    (canFactor || '').trim().toUpperCase(),
    String(liters) + 'L',
    String(liters) + ' L',
    String(liters) + 'LIT',
    String(liters) + ' LIT',
    String(liters) + 'LTR',
    String(liters) + ' LTR',
    String(liters) + ' LITER',
    String(liters) + ' LITERS',
    liters < 1.0 ? String(Math.round(liters * 1000)) + 'ML' : '',
    liters < 1.0 ? String(Math.round(liters * 1000)) + ' ML' : ''
  ].filter(Boolean);

  let bestScore = 0;
  let bestItem: Item | null = null;

  const productTokens = pClean.split(/[\s-_/]+/).filter((t) => t.length > 1);

  for (const item of items) {
    let score = 0;
    const itemNameUpper = (item.name || '').toUpperCase();
    const itemSizeUpper = (item.size || '').toUpperCase();
    const itemCodeUpper = (item.code || '').toUpperCase();
    const itemBarcodeUpper = (item.barcode || '').toUpperCase();
    const itemAliasesUpper = (item.aliases || '').toUpperCase();

    // Check if item size matches the dispensing can factor (1, 4, 10, 20 Ltr)
    let sizeMatches = false;
    for (const sk of sizeKeywords) {
      if (
        itemSizeUpper === sk ||
        itemSizeUpper.includes(sk) ||
        itemNameUpper.includes(sk)
      ) {
        sizeMatches = true;
        break;
      }
    }

    // Also compare parsed numeric liters from item.size
    const itemLiters = parseCanFactorToLiters(item.size);
    if (Math.abs(itemLiters - liters) < 0.05) {
      sizeMatches = true;
    }

    if (sizeMatches) {
      score += 70; // Big bonus for matching the correct can factor / liter size!
    } else if (itemSizeUpper && itemSizeUpper.length > 0) {
      // Penalize heavily if the item belongs to a DIFFERENT pack size (e.g. 20L item when dispensing 1L)
      score -= 50;
    }

    // Base name / code matching (e.g. TE15, BASE 01, WHITE)
    if (bClean) {
      if (itemCodeUpper === bClean || itemBarcodeUpper === bClean) {
        score += 80;
      } else if (itemNameUpper === bClean || itemNameUpper.includes(bClean)) {
        score += 60;
      } else if (itemAliasesUpper.includes(bClean)) {
        score += 50;
      }
    }

    // Product name matching
    if (pClean && itemNameUpper.includes(pClean)) {
      score += 40;
    } else if (productTokens.length > 0) {
      for (const token of productTokens) {
        if (itemNameUpper.includes(token)) {
          score += 15;
        }
      }
    }

    // Category / paint type bonus
    if (
      (item.type || '').toLowerCase().includes('paint') ||
      (item.type || '').toLowerCase().includes('emulsion')
    ) {
      score += 10;
    }

    // Threshold score to consider a valid match
    if (score > bestScore && score >= 50) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestItem;
}

/**
 * Parses machine tint log file (.CSC, .CSV, .TXT).
 * ONLY reads base name, date, time, can factor (1, 4, 10, 20 Ltr), and product.
 * Does NOT read shade code!
 */
export function parseColorMachineContent(
  content: string,
  items: Item[],
  processedRecordIds: Set<string>
): ParsedTintRow[] {
  const lines = content.split(String.fromCharCode(10)).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];

  // Find header line
  let headerIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((c) => c.trim().toUpperCase());
    if (
      cols.some(
        (c) =>
          c.includes('PRODUCT') ||
          c.includes('BASE') ||
          c.includes('TINT_DATE') ||
          c.includes('DATE') ||
          c.includes('CAN_FACTOR') ||
          c.includes('FACTOR')
      )
    ) {
      headerIndex = i;
      headers = cols;
      break;
    }
  }

  if (headerIndex === -1 || headers.length === 0) {
    return [];
  }

  // Find columns dynamically (flexible for various machine exports)
  const findCol = (...keywords: string[]) => {
    return headers.findIndex((h) =>
      keywords.some((kw) => h === kw || h.includes(kw))
    );
  };

  const colProduct = findCol('PRODUCT_NAME', 'PRODUCT NAME', 'PRODUCT', 'PROD_NAME', 'ITEM_NAME', 'DESCRIPTION');
  const colBaseName = findCol('BASE_CODE', 'BASE_NAME', 'BASE NAME', 'BASE', 'BASENAME', 'BASE_NO');
  const colCanFactor = findCol('CAN_FACTOR', 'CAN FACTOR', 'CAN_SIZE', 'PACK_SIZE', 'CANFACTOR', 'SIZE', 'VOLUME', 'LTR');
  // Strictly find CAN COUNT column - NEVER match generic QTY or QUANTITY which represents colorant ml in paint machines!
  const colNoOfCan = headers.findIndex((h) => {
    if (
      h.includes('COLORANT') ||
      h.includes('SHOT') ||
      h.includes('DISPENSE') ||
      h.includes('FORMULA') ||
      h.includes('ML') ||
      h.includes('TINT_QTY')
    ) {
      return false;
    }
    const canKeywords = [
      'NO_OF_CAN',
      'NO OF CAN',
      'NO_OF_CANS',
      'NO OF CANS',
      'NO_CAN',
      'NO_CANS',
      'CAN_COUNT',
      'NUM_CANS',
      'CAN_QTY',
      'CANS_COUNT',
      'CANS'
    ];
    return canKeywords.some((kw) => h === kw || h.includes(kw));
  });

  const colTintDate = findCol('TINT_DATE', 'TINT DATE', 'DISPENSE_DATE', 'DATE');
  const colTintTime = findCol('TINT_TIME', 'TINT TIME', 'DISPENSE_TIME', 'TIME');
  const colDealerCode = findCol('DEALER_CODE', 'DEALER CODE', 'DEALER');
  const colDealerName = findCol('DEALER_NAME', 'DEALER NAME');
  const colMachineType = findCol('MACHINE_TYPE', 'MACHINE TYPE', 'MACHINE');
  const colColorantUsed = findCol('COLORANT_USED', 'COLORANT');
  const colColorantQty = headers.findIndex((h) => {
    return (
      h.includes('COLORANT_QTY') ||
      h.includes('COLORANT_QUANTITY') ||
      h.includes('DISPENSED') ||
      h.includes('SHOT') ||
      h === 'QTY' ||
      h === 'QUANTITY'
    );
  });

  const result: ParsedTintRow[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const cols = splitCsvLine(line);
    if (cols.length <= 2) continue;

    const productName = (colProduct >= 0 ? cols[colProduct] : '')?.trim() || '';
    const baseCode = (colBaseName >= 0 ? cols[colBaseName] : '')?.trim() || '';
    const canFactorRaw = (colCanFactor >= 0 ? cols[colCanFactor] : '')?.trim() || '1 LIT';

    // Parse number of cans: default to 1 if not explicitly in can count column
    const noOfCansRaw = colNoOfCan >= 0 ? cols[colNoOfCan] : '';
    let noOfCans = 1;
    if (noOfCansRaw && !isNaN(parseInt(noOfCansRaw.trim(), 10))) {
      const parsed = parseInt(noOfCansRaw.trim(), 10);
      if (parsed > 0) {
        noOfCans = parsed;
      }
    }

    const tintDate = (colTintDate >= 0 ? cols[colTintDate] : '')?.trim() || '';
    const tintTime = (colTintTime >= 0 ? cols[colTintTime] : '')?.trim() || '';

    // If product and base are both empty, skip empty row
    if (!productName && !baseCode) continue;

    const dealerCode = (colDealerCode >= 0 ? cols[colDealerCode] : '')?.trim() || '';
    const dealerName = (colDealerName >= 0 ? cols[colDealerName] : '')?.trim() || '';
    const machineType = (colMachineType >= 0 ? cols[colMachineType] : '')?.trim() || '';
    const colorantUsed = (colColorantUsed >= 0 ? cols[colColorantUsed] : '')?.trim() || '';
    const colorantQty = (colColorantQty >= 0 ? cols[colColorantQty] : '')?.trim() || '';

    const litersPerCan = parseCanFactorToLiters(canFactorRaw);
    const totalLiters = litersPerCan * noOfCans;
    const canFactorDisplay = formatCanFactorDisplay(canFactorRaw);

    const { iso: isoTimestamp, display: displayDateTime } = parseTintDateTime(tintDate, tintTime);

    // Record ID fingerprint strictly uses date, time, product, base, canFactor, noOfCans (NO shade code!)
    const tintRecordId = generateTintRecordId(
      tintDate,
      tintTime,
      productName,
      baseCode,
      canFactorDisplay,
      noOfCans
    );

    const isProcessed = processedRecordIds.has(tintRecordId);
    // Matching strictly prioritizes the exact can factor (1, 4, 10, 20 Ltr)
    const matched = findBestMatchingItem(productName, baseCode, canFactorRaw, items);

    // Determine deduct quantity & unit:
    // In paint stores, stock items are packaged cans/buckets (e.g. "AB11 1ltr", "AB11 20Ltr") tracked in pcs / cans.
    // If 1 Ltr is used from AB11 1ltr item -> deduct 1 pcs.
    // If 20 Ltr is used from AB11 20Ltr item -> deduct 1 pcs (or how many cans are specified in data).
    let deductQty = noOfCans;
    let deductUnit = 'pcs';

    if (matched) {
      const unitClean = (matched.unit || '').trim().toLowerCase();
      // Only deduct pure liters if the stock item is bulk paint (unit is strictly Ltr AND no pack size in name/size)
      const isPureBulkLiters =
        ['ltr', 'l', 'liter', 'liters', 'litre', 'litres'].includes(unitClean) &&
        !matched.size &&
        !/\b(1|4|10|20)\s*(ltr|l|lit|liter|litres)\b/i.test(matched.name);

      if (isPureBulkLiters) {
        deductQty = totalLiters;
        deductUnit = 'Ltr';
      } else {
        // Packaged item (1ltr, 4ltr, 10ltr, 20ltr) in pcs, cans, buckets, tins
        deductQty = noOfCans;
        deductUnit = matched.unit || 'pcs';
      }
    }

    result.push({
      tintRecordId,
      dealerCode,
      dealerName,
      machineType,
      productName: productName || baseCode,
      baseCode: baseCode || productName,
      canFactor: canFactorDisplay,
      canFactorLiters: litersPerCan,
      litersPerCan,
      noOfCans,
      totalLiters,
      tintDateRaw: tintDate,
      tintTimeRaw: tintTime,
      tintTimestampIso: isoTimestamp,
      tintDisplayDateTime: displayDateTime,
      colorantUsed,
      colorantQuantity: colorantQty,
      matchedItem: matched,
      isAlreadyProcessed: isProcessed,
      deductQty,
      deductUnit
    });
  }

  return result;
}
