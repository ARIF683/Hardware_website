export interface ConversionPair {
  baseUnit: string;
  secondaryUnit: string;
  defaultFactor: number;
  label: string;
}

export const COMMON_UNITS = [
  "pcs",
  "box",
  "mtr",
  "roll",
  "pkt",
  "dozen",
  "kg",
  "carton",
  "bundle",
  "set",
  "feet",
  "sqft",
  "bag",
  "ltr"
];

export const PRESET_CONVERSIONS: ConversionPair[] = [
  { baseUnit: "box", secondaryUnit: "pcs", defaultFactor: 10.0, label: "1 Box = 10 Pcs" },
  { baseUnit: "roll", secondaryUnit: "mtr", defaultFactor: 50.0, label: "1 Roll = 50 Mtrs" },
  { baseUnit: "dozen", secondaryUnit: "pcs", defaultFactor: 12.0, label: "1 Dozen = 12 Pcs" },
  { baseUnit: "pkt", secondaryUnit: "pcs", defaultFactor: 100.0, label: "1 Packet = 100 Pcs" },
  { baseUnit: "carton", secondaryUnit: "box", defaultFactor: 20.0, label: "1 Carton = 20 Boxes" },
  { baseUnit: "bundle", secondaryUnit: "pcs", defaultFactor: 25.0, label: "1 Bundle = 25 Pcs" },
  { baseUnit: "kg", secondaryUnit: "gm", defaultFactor: 1000.0, label: "1 Kg = 1000 gm" }
];

export function getPairedUnit(unit: string): { pairedUnit: string; factor: number } {
  const u = unit.trim().toLowerCase();
  switch (u) {
    case "box":
    case "boxes":
      return { pairedUnit: "pcs", factor: 10.0 };
    case "pcs":
    case "pc":
    case "piece":
    case "pieces":
      return { pairedUnit: "box", factor: 10.0 };
    case "roll":
    case "rolls":
      return { pairedUnit: "mtr", factor: 50.0 };
    case "mtr":
    case "meter":
    case "meters":
    case "m":
      return { pairedUnit: "roll", factor: 50.0 };
    case "dozen":
    case "dz":
      return { pairedUnit: "pcs", factor: 12.0 };
    case "pkt":
    case "packet":
    case "packets":
      return { pairedUnit: "pcs", factor: 100.0 };
    case "carton":
    case "ctn":
      return { pairedUnit: "box", factor: 20.0 };
    case "bundle":
    case "bdl":
      return { pairedUnit: "pcs", factor: 25.0 };
    case "kg":
      return { pairedUnit: "gm", factor: 1000.0 };
    default:
      return { pairedUnit: "pcs", factor: 1.0 };
  }
}

function isMajorToMinor(major: string, minor: string): boolean {
  return (
    (["box", "boxes"].includes(major) && ["pcs", "pc", "piece", "pieces"].includes(minor)) ||
    (["roll", "rolls"].includes(major) && ["mtr", "meter", "meters", "m"].includes(minor)) ||
    (["dozen", "dz"].includes(major) && ["pcs", "pc", "piece", "pieces"].includes(minor)) ||
    (["pkt", "packet", "packets"].includes(major) && ["pcs", "pc", "piece", "pieces"].includes(minor)) ||
    (["carton", "ctn"].includes(major) && ["box", "boxes", "pcs", "pc"].includes(minor)) ||
    (["bundle", "bdl"].includes(major) && ["pcs", "pc", "piece", "pieces"].includes(minor)) ||
    (["kg"].includes(major) && ["gm", "grams"].includes(minor))
  );
}

export function convertQuantity(fromUnit: string, toUnit: string, qty: number, factor: number = 10.0): number {
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (from === to || factor <= 0) return qty;

  if (isMajorToMinor(from, to)) {
    return qty * factor;
  }
  if (isMajorToMinor(to, from)) {
    return qty / factor;
  }
  return qty;
}
