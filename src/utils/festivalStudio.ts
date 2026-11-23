import {
  AnnouncementConfig,
  AnnouncementSeverity,
  FestivalConfig,
  FestivalOverrideMode,
  FestivalStudioConfig,
} from '../types';

const STORAGE_KEY_STUDIO_JSON = 'hardware_festival_studio_json';

export const FESTIVAL_MODE_AUTO: FestivalOverrideMode = 'AUTO';
export const FESTIVAL_MODE_CUSTOM: FestivalOverrideMode = 'CUSTOM';
export const FESTIVAL_MODE_OFF: FestivalOverrideMode = 'OFF';

export function createDefaultFestivalConfig(stylePreset = 'default'): FestivalConfig {
  return {
    enabled: false,
    festivalName: '',
    greetingMessage: '',
    badgeText: '',
    accentColorHex: '',
    bannerImageUrl: '',
    startDate: '',
    endDate: '',
    stylePreset,
  };
}

export function createDefaultAnnouncementConfig(): AnnouncementConfig {
  return {
    enabled: false,
    message: '',
    severity: 'info',
    dismissible: true,
    startAtMillis: 0,
    endAtMillis: 0,
  };
}

export function createDefaultFestivalStudioConfig(): FestivalStudioConfig {
  return {
    autoCalendarEnabled: true,
    applyFestivalThemeToApp: true,
    overrideMode: FESTIVAL_MODE_AUTO,
    customFestival: createDefaultFestivalConfig('diwali'),
    customFestivals: [],
    hiddenAutoFestivalKeys: [],
    announcement: createDefaultAnnouncementConfig(),
    updatedAt: 0,
  };
}

export function getEffectiveCustomFestivals(config: FestivalStudioConfig): FestivalConfig[] {
  if (config.customFestivals && config.customFestivals.length > 0) {
    return config.customFestivals;
  }
  const c = config.customFestival;
  if (!c) return [];
  const hasLegacy =
    Boolean(c.enabled) ||
    (c.festivalName || '').trim().length > 0 ||
    (c.greetingMessage || '').trim().length > 0 ||
    (c.bannerImageUrl || '').trim().length > 0;
  return hasLegacy ? [c] : [];
}

// --- Schedule & Timer Helpers (exact port of DynamicUiConfig.kt) ---

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export const FestivalScheduleHelper = {
  todayIsoDate(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  addDaysIsoDate(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  endOfMonthIsoDate(): string {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const y = last.getFullYear();
    const m = String(last.getMonth() + 1).padStart(2, '0');
    const day = String(last.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  parseIsoDateKey(isoDate: string): number | null {
    const trimmed = (isoDate || '').trim();
    const match = ISO_DATE_REGEX.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const check = new Date(year, month - 1, day);
    if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
      return null;
    }
    return year * 10000 + month * 100 + day;
  },

  formatShortDate(isoDate: string): string | null {
    const key = this.parseIsoDateKey(isoDate);
    if (key === null) return null;
    const year = Math.floor(key / 10000);
    const month = Math.floor((key / 100) % 100);
    const day = key % 100;
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
};

export function isFestivalActiveOn(
  cfg: FestivalConfig,
  isoDate: string = FestivalScheduleHelper.todayIsoDate()
): boolean {
  if (!cfg.enabled) return false;
  if (!cfg.greetingMessage.trim() && !cfg.festivalName.trim()) return false;

  const todayKey = FestivalScheduleHelper.parseIsoDateKey(isoDate);
  if (todayKey === null) return true;

  const startKey = cfg.startDate.trim() ? FestivalScheduleHelper.parseIsoDateKey(cfg.startDate) : null;
  const endKey = cfg.endDate.trim() ? FestivalScheduleHelper.parseIsoDateKey(cfg.endDate) : null;

  if (cfg.startDate.trim() && startKey === null) return false;
  if (cfg.endDate.trim() && endKey === null) return false;

  if (startKey !== null && todayKey < startKey) return false;
  if (endKey !== null && todayKey > endKey) return false;
  return true;
}

export function getFestivalScheduleSummaryLabel(cfg: FestivalConfig): string | null {
  const startFormatted = FestivalScheduleHelper.formatShortDate(cfg.startDate);
  const endFormatted = FestivalScheduleHelper.formatShortDate(cfg.endDate);
  if (startFormatted && endFormatted) return `${startFormatted} – ${endFormatted}`;
  if (endFormatted) return `Ends ${endFormatted}`;
  if (startFormatted) return `From ${startFormatted}`;
  return null;
}

export function isAnnouncementActiveAt(
  ann: AnnouncementConfig,
  nowMillis: number = Date.now()
): boolean {
  if (!ann.enabled || !ann.message.trim()) return false;
  if (ann.startAtMillis > 0 && nowMillis < ann.startAtMillis) return false;
  if (ann.endAtMillis > 0 && nowMillis > ann.endAtMillis) return false;
  return true;
}

export function hasValidAnnouncementTimerRange(ann: AnnouncementConfig): boolean {
  return ann.startAtMillis <= 0 || ann.endAtMillis <= 0 || ann.endAtMillis > ann.startAtMillis;
}

export function getAnnouncementTimerSummaryLabel(ann: AnnouncementConfig): string | null {
  if (ann.startAtMillis <= 0 && ann.endAtMillis <= 0) return null;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  if (ann.startAtMillis > 0 && ann.endAtMillis > 0) {
    return `${fmt(ann.startAtMillis)} – ${fmt(ann.endAtMillis)}`;
  }
  if (ann.endAtMillis > 0) return `Ends ${fmt(ann.endAtMillis)}`;
  if (ann.startAtMillis > 0) return `Starts ${fmt(ann.startAtMillis)}`;
  return null;
}

// --- Codec (exact JSON field parity with FestivalPreferenceManager.kt) ---

function festivalToPlain(cfg: FestivalConfig): Record<string, any> {
  return {
    enabled: Boolean(cfg.enabled),
    festivalName: cfg.festivalName || '',
    greetingMessage: cfg.greetingMessage || '',
    badgeText: cfg.badgeText || '',
    accentColorHex: cfg.accentColorHex || '',
    bannerImageUrl: cfg.bannerImageUrl || '',
    startDate: cfg.startDate || '',
    endDate: cfg.endDate || '',
    stylePreset: cfg.stylePreset || 'default',
  };
}

function plainToFestival(obj: any, defaultPreset = 'default'): FestivalConfig {
  if (!obj || typeof obj !== 'object') return createDefaultFestivalConfig(defaultPreset);
  return {
    enabled: Boolean(obj.enabled),
    festivalName: typeof obj.festivalName === 'string' ? obj.festivalName : '',
    greetingMessage: typeof obj.greetingMessage === 'string' ? obj.greetingMessage : '',
    badgeText: typeof obj.badgeText === 'string' ? obj.badgeText : '',
    accentColorHex: typeof obj.accentColorHex === 'string' ? obj.accentColorHex : '',
    bannerImageUrl: typeof obj.bannerImageUrl === 'string' ? obj.bannerImageUrl : '',
    startDate: typeof obj.startDate === 'string' ? obj.startDate : '',
    endDate: typeof obj.endDate === 'string' ? obj.endDate : '',
    stylePreset: typeof obj.stylePreset === 'string' && obj.stylePreset ? obj.stylePreset : defaultPreset,
  };
}

export const FestivalStudioCodec = {
  toJsonString(config: FestivalStudioConfig): string {
    const listToWrite = getEffectiveCustomFestivals(config);
    const primaryLegacy = listToWrite[0] || config.customFestival || createDefaultFestivalConfig('diwali');
    const uniqueHidden = Array.from(new Set((config.hiddenAutoFestivalKeys || []).filter(Boolean)));
    return JSON.stringify({
      autoCalendarEnabled: Boolean(config.autoCalendarEnabled),
      applyFestivalThemeToApp: Boolean(config.applyFestivalThemeToApp),
      overrideMode: config.overrideMode || FESTIVAL_MODE_AUTO,
      customFestival: festivalToPlain(primaryLegacy),
      customFestivals: listToWrite.map(festivalToPlain),
      hiddenAutoFestivalKeys: uniqueHidden,
      announcement: {
        enabled: Boolean(config.announcement?.enabled),
        message: config.announcement?.message || '',
        severity: config.announcement?.severity || 'info',
        dismissible: config.announcement?.dismissible !== undefined ? Boolean(config.announcement.dismissible) : true,
        startAtMillis: Math.max(0, Number(config.announcement?.startAtMillis || 0)),
        endAtMillis: Math.max(0, Number(config.announcement?.endAtMillis || 0)),
      },
      updatedAt: Number(config.updatedAt || 0),
    });
  },

  fromJsonString(raw?: string | null): FestivalStudioConfig | null {
    if (!raw || !raw.trim()) return null;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;

      const customObj = obj.customFestival;
      const custom = customObj ? plainToFestival(customObj, 'default') : createDefaultFestivalConfig('diwali');

      const hasCustomArray = Array.isArray(obj.customFestivals);
      let customList: FestivalConfig[];
      if (hasCustomArray) {
        customList = obj.customFestivals
          .filter((x: any) => x && typeof x === 'object')
          .map((x: any) => plainToFestival(x, 'default'));
      } else {
        const hasLegacy =
          custom.enabled ||
          custom.festivalName.trim().length > 0 ||
          custom.greetingMessage.trim().length > 0 ||
          custom.bannerImageUrl.trim().length > 0;
        customList = hasLegacy ? [custom] : [];
      }

      const hiddenKeys: string[] = Array.isArray(obj.hiddenAutoFestivalKeys)
        ? obj.hiddenAutoFestivalKeys
            .map((k: any) => String(k || '').trim())
            .filter((k: string) => k.length > 0)
        : [];

      const annObj = obj.announcement;
      let announcement: AnnouncementConfig;
      if (annObj && typeof annObj === 'object') {
        const rawSev = String(annObj.severity || 'info').toLowerCase();
        const validSev: AnnouncementSeverity =
          rawSev === 'warning' || rawSev === 'alert' || rawSev === 'success' ? rawSev : 'info';
        announcement = {
          enabled: Boolean(annObj.enabled),
          message: typeof annObj.message === 'string' ? annObj.message : '',
          severity: validSev,
          dismissible: annObj.dismissible !== undefined ? Boolean(annObj.dismissible) : true,
          startAtMillis: Math.max(0, Number(annObj.startAtMillis || 0)),
          endAtMillis: Math.max(0, Number(annObj.endAtMillis || 0)),
        };
      } else {
        announcement = createDefaultAnnouncementConfig();
      }

      const modeRaw = String(obj.overrideMode || FESTIVAL_MODE_AUTO).toUpperCase();
      const validMode: FestivalOverrideMode =
        modeRaw === FESTIVAL_MODE_CUSTOM || modeRaw === FESTIVAL_MODE_OFF
          ? (modeRaw as FestivalOverrideMode)
          : FESTIVAL_MODE_AUTO;

      return {
        autoCalendarEnabled: obj.autoCalendarEnabled !== undefined ? Boolean(obj.autoCalendarEnabled) : true,
        applyFestivalThemeToApp:
          obj.applyFestivalThemeToApp !== undefined ? Boolean(obj.applyFestivalThemeToApp) : true,
        overrideMode: validMode,
        customFestival: customList[0] || custom,
        customFestivals: customList,
        hiddenAutoFestivalKeys: hiddenKeys,
        announcement,
        updatedAt: Number(obj.updatedAt || 0),
      };
    } catch {
      return null;
    }
  },
};

export const festivalPreferenceStore = {
  load(): FestivalStudioConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_STUDIO_JSON);
      return FestivalStudioCodec.fromJsonString(raw) || createDefaultFestivalStudioConfig();
    } catch {
      return createDefaultFestivalStudioConfig();
    }
  },

  getRawJsonOrNull(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY_STUDIO_JSON);
    } catch {
      return null;
    }
  },

  save(config: FestivalStudioConfig): { normalized: FestivalStudioConfig; json: string } {
    const list = getEffectiveCustomFestivals(config);
    const normalized: FestivalStudioConfig = {
      ...config,
      customFestival: list[0] || createDefaultFestivalConfig('default'),
      customFestivals: list,
      updatedAt: config.updatedAt > 0 ? config.updatedAt : Date.now(),
    };
    const json = FestivalStudioCodec.toJsonString(normalized);
    try {
      localStorage.setItem(STORAGE_KEY_STUDIO_JSON, json);
    } catch {}
    return { normalized, json };
  },

  applyRemoteJson(
    rawJson: string | null | undefined,
    current: FestivalStudioConfig
  ): FestivalStudioConfig | null {
    if (!rawJson || !rawJson.trim()) return null;
    const parsed = FestivalStudioCodec.fromJsonString(rawJson);
    if (!parsed) return null;
    if (current.updatedAt > 0 && parsed.updatedAt > 0 && parsed.updatedAt < current.updatedAt) {
      return null;
    }
    const currentJson = FestivalStudioCodec.toJsonString(current);
    const parsedJson = FestivalStudioCodec.toJsonString(parsed);
    if (currentJson === parsedJson) return null;
    try {
      localStorage.setItem(STORAGE_KEY_STUDIO_JSON, rawJson);
    } catch {}
    return parsed;
  },
};

// --- Built-in Indian Festival Calendar (2026-2035) exact port of AutoFestivalCalendar.kt ---

interface AutoFestivalEntry {
  festivalName: string;
  greetingMessage: string;
  badgeText: string;
  accentColorHex: string;
  stylePreset: string;
  windowsByYear?: Record<number, [string, string]>;
  fixedMonthDayWindow?: [string, string];
}

const AUTO_FESTIVAL_ENTRIES: AutoFestivalEntry[] = [
  // Fixed annual festivals
  {
    festivalName: 'New Year Celebration',
    greetingMessage:
      '🎆 Happy New Year! Wishing you prosperous projects, full stock & strong sales all year long!',
    badgeText: '🎆 HAPPY NEW YEAR',
    accentColorHex: '#4F46E5',
    stylePreset: 'new_year',
    fixedMonthDayWindow: ['01-01', '01-02'],
  },
  {
    festivalName: 'Makar Sankranti & Pongal',
    greetingMessage:
      '🪁 Happy Makar Sankranti & Pongal! Wishing harvest joy and bright beginnings to every customer!',
    badgeText: '🪁 SANKRANTI',
    accentColorHex: '#D97706',
    stylePreset: 'sale',
    fixedMonthDayWindow: ['01-14', '01-15'],
  },
  {
    festivalName: 'Republic Day Special',
    greetingMessage:
      '🇮🇳 Happy Republic Day! Celebrating craftsmanship, strength & building a stronger nation together.',
    badgeText: '🇮🇳 REPUBLIC DAY',
    accentColorHex: '#EA580C',
    stylePreset: 'independence_day',
    fixedMonthDayWindow: ['01-25', '01-26'],
  },
  {
    festivalName: 'Independence Day Special',
    greetingMessage:
      '🇮🇳 Happy Independence Day! Saluting the spirit of building & progress across every home and site.',
    badgeText: '🇮🇳 INDEPENDENCE DAY',
    accentColorHex: '#EA580C',
    stylePreset: 'independence_day',
    fixedMonthDayWindow: ['08-14', '08-15'],
  },
  {
    festivalName: 'Gandhi Jayanti',
    greetingMessage:
      '🇮🇳 Remembering Mahatma Gandhi on Gandhi Jayanti — wishing peace, honesty & goodwill.',
    badgeText: '🇮🇳 GANDHI JAYANTI',
    accentColorHex: '#16A34A',
    stylePreset: 'independence_day',
    fixedMonthDayWindow: ['10-02', '10-02'],
  },
  {
    festivalName: 'Christmas Celebration',
    greetingMessage:
      '🎄 Merry Christmas! Wishing warmth, joy, and bright celebrations to your family & customers.',
    badgeText: '🎄 MERRY CHRISTMAS',
    accentColorHex: '#15803D',
    stylePreset: 'christmas',
    fixedMonthDayWindow: ['12-23', '12-26'],
  },
  {
    festivalName: 'Year-End Celebration',
    greetingMessage: '🎆 Year-End Greetings! Thank you for building with us all year long.',
    badgeText: '🎆 YEAR END',
    accentColorHex: '#4F46E5',
    stylePreset: 'new_year',
    fixedMonthDayWindow: ['12-31', '12-31'],
  },

  // Major lunar / panchang Indian festivals (2026-2035)
  {
    festivalName: 'Holi Festival of Colors',
    greetingMessage:
      '🎨 Happy Holi! May your paints, projects, and life shine with vibrant colors of joy!',
    badgeText: '🎨 HAPPY HOLI',
    accentColorHex: '#DB2777',
    stylePreset: 'holi',
    windowsByYear: {
      2026: ['2026-03-02', '2026-03-05'],
      2027: ['2027-03-20', '2027-03-23'],
      2028: ['2028-03-09', '2028-03-12'],
      2029: ['2029-02-26', '2029-03-01'],
      2030: ['2030-03-18', '2030-03-21'],
      2031: ['2031-03-07', '2031-03-10'],
      2032: ['2032-03-25', '2032-03-28'],
      2033: ['2033-03-14', '2033-03-17'],
      2034: ['2034-03-04', '2034-03-07'],
      2035: ['2035-03-22', '2035-03-25'],
    },
  },
  {
    festivalName: 'Eid-ul-Fitr Celebration',
    greetingMessage:
      '🌙 Eid Mubarak! May this blessed Eid bring peace, prosperity & togetherness to every home.',
    badgeText: '🌙 EID MUBARAK',
    accentColorHex: '#059669',
    stylePreset: 'eid',
    windowsByYear: {
      2026: ['2026-03-19', '2026-03-22'],
      2027: ['2027-03-08', '2027-03-11'],
      2028: ['2028-02-25', '2028-02-28'],
      2029: ['2029-02-13', '2029-02-16'],
      2030: ['2030-02-03', '2030-02-06'],
      2031: ['2031-01-23', '2031-01-26'],
      2032: ['2032-01-12', '2032-01-15'],
      2033: ['2033-12-22', '2033-12-24'],
      2034: ['2034-12-11', '2034-12-14'],
      2035: ['2035-11-30', '2035-12-03'],
    },
  },
  {
    festivalName: 'Eid-ul-Adha Mubarak',
    greetingMessage:
      '🌙 Eid-ul-Adha Mubarak! Wishing harmony, generosity & blessings to all families.',
    badgeText: '🌙 EID MUBARAK',
    accentColorHex: '#059669',
    stylePreset: 'eid',
    windowsByYear: {
      2026: ['2026-05-26', '2026-05-29'],
      2027: ['2027-05-15', '2027-05-18'],
      2028: ['2028-05-04', '2028-05-07'],
      2029: ['2029-04-23', '2029-04-26'],
      2030: ['2030-04-12', '2030-04-15'],
      2031: ['2031-04-01', '2031-04-04'],
      2032: ['2032-03-21', '2032-03-24'],
      2033: ['2033-03-10', '2033-03-13'],
      2034: ['2034-02-28', '2034-03-03'],
      2035: ['2035-02-17', '2035-02-20'],
    },
  },
  {
    festivalName: 'Ganesh Chaturthi',
    greetingMessage:
      '✨ Ganpati Bappa Morya! Wishing auspicious beginnings and steady growth to every project.',
    badgeText: '✨ GANESH CHATURTHI',
    accentColorHex: '#D97706',
    stylePreset: 'diwali',
    windowsByYear: {
      2026: ['2026-09-13', '2026-09-15'],
      2027: ['2027-09-03', '2027-09-05'],
      2028: ['2028-08-22', '2028-08-24'],
      2029: ['2029-09-10', '2029-09-12'],
      2030: ['2030-08-31', '2030-09-02'],
      2031: ['2031-08-20', '2031-08-22'],
      2032: ['2032-09-07', '2032-09-09'],
      2033: ['2033-08-27', '2033-08-29'],
      2034: ['2034-09-15', '2034-09-17'],
      2035: ['2035-09-04', '2035-09-06'],
    },
  },
  {
    festivalName: 'Dussehra & Navratri',
    greetingMessage:
      '✨ Happy Dussehra! Wishing victory, prosperity & bright new milestones for your store.',
    badgeText: '✨ HAPPY DUSSEHRA',
    accentColorHex: '#EA580C',
    stylePreset: 'diwali',
    windowsByYear: {
      2026: ['2026-10-19', '2026-10-21'],
      2027: ['2027-10-08', '2027-10-10'],
      2028: ['2028-09-26', '2028-09-28'],
      2029: ['2029-10-15', '2029-10-17'],
      2030: ['2030-10-04', '2030-10-06'],
      2031: ['2031-09-24', '2031-09-26'],
      2032: ['2032-10-12', '2032-10-14'],
      2033: ['2033-10-01', '2033-10-03'],
      2034: ['2034-10-20', '2034-10-22'],
      2035: ['2035-10-09', '2035-10-11'],
    },
  },
  {
    festivalName: 'Diwali Festival of Lights',
    greetingMessage:
      '🪔 Happy Diwali! May your business, home & projects shine bright with prosperity and abundance!',
    badgeText: '🪔 DIWALI FEST',
    accentColorHex: '#D97706',
    stylePreset: 'diwali',
    windowsByYear: {
      2026: ['2026-11-05', '2026-11-11'],
      2027: ['2027-10-26', '2027-10-31'],
      2028: ['2028-10-14', '2028-10-19'],
      2029: ['2029-11-02', '2029-11-07'],
      2030: ['2030-10-23', '2030-10-28'],
      2031: ['2031-11-11', '2031-11-16'],
      2032: ['2032-10-30', '2032-11-04'],
      2033: ['2033-10-19', '2033-10-24'],
      2034: ['2034-11-07', '2034-11-12'],
      2035: ['2035-10-27', '2035-11-01'],
    },
  },
];

function entryWindowForYear(entry: AutoFestivalEntry, year: number): [string, string] | null {
  if (entry.fixedMonthDayWindow) {
    return [`${year}-${entry.fixedMonthDayWindow[0]}`, `${year}-${entry.fixedMonthDayWindow[1]}`];
  }
  return entry.windowsByYear?.[year] || null;
}

function entryToFestivalConfig(entry: AutoFestivalEntry, window: [string, string]): FestivalConfig {
  return {
    enabled: true,
    festivalName: entry.festivalName,
    greetingMessage: entry.greetingMessage,
    badgeText: entry.badgeText,
    accentColorHex: entry.accentColorHex,
    bannerImageUrl: '',
    startDate: window[0],
    endDate: window[1],
    stylePreset: entry.stylePreset,
  };
}

function isValidHexColor(hex: string): boolean {
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
}

export const AutoFestivalCalendar = {
  autoFestivalKey(festivalName: string): string {
    return (festivalName || '').trim().toLowerCase();
  },

  activeFestivalsOn(isoDate: string = FestivalScheduleHelper.todayIsoDate()): FestivalConfig[] {
    const dateKey = FestivalScheduleHelper.parseIsoDateKey(isoDate);
    if (dateKey === null) return [];
    const year = Math.floor(dateKey / 10000);
    const out: FestivalConfig[] = [];
    for (const entry of AUTO_FESTIVAL_ENTRIES) {
      const win = entryWindowForYear(entry, year);
      if (!win) continue;
      const cfg = entryToFestivalConfig(entry, win);
      if (isFestivalActiveOn(cfg, isoDate)) {
        out.push(cfg);
      }
    }
    return out;
  },

  nextUpcomingFestival(isoDate: string = FestivalScheduleHelper.todayIsoDate()): FestivalConfig | null {
    const todayKey = FestivalScheduleHelper.parseIsoDateKey(isoDate);
    if (todayKey === null) return null;
    const year = Math.floor(todayKey / 10000);
    const candidates: Array<{ startKey: number; cfg: FestivalConfig }> = [];
    for (let y = year; y <= year + 1; y++) {
      for (const entry of AUTO_FESTIVAL_ENTRIES) {
        const win = entryWindowForYear(entry, y);
        if (!win) continue;
        const startKey = FestivalScheduleHelper.parseIsoDateKey(win[0]);
        const endKey = FestivalScheduleHelper.parseIsoDateKey(win[1]);
        if (startKey !== null && endKey !== null && endKey >= todayKey) {
          candidates.push({ startKey, cfg: entryToFestivalConfig(entry, win) });
        }
      }
    }
    candidates.sort((a, b) => a.startKey - b.startKey);
    return candidates[0]?.cfg || null;
  },

  upcomingAndActiveCalendarEntries(
    isoDate: string = FestivalScheduleHelper.todayIsoDate()
  ): FestivalConfig[] {
    const todayKey = FestivalScheduleHelper.parseIsoDateKey(isoDate);
    if (todayKey === null) return [];
    const year = Math.floor(todayKey / 10000);
    const out: Array<{ startKey: number; cfg: FestivalConfig }> = [];
    for (const entry of AUTO_FESTIVAL_ENTRIES) {
      const thisYearWin = entryWindowForYear(entry, year);
      const thisYearEnd = thisYearWin ? FestivalScheduleHelper.parseIsoDateKey(thisYearWin[1]) : null;
      const chosenWin =
        thisYearWin && thisYearEnd !== null && thisYearEnd >= todayKey
          ? thisYearWin
          : entryWindowForYear(entry, year + 1) || thisYearWin;
      if (!chosenWin) continue;
      const startKey = FestivalScheduleHelper.parseIsoDateKey(chosenWin[0]) ?? Number.MAX_SAFE_INTEGER;
      out.push({ startKey, cfg: entryToFestivalConfig(entry, chosenWin) });
    }
    out.sort((a, b) => a.startKey - b.startKey);
    return out.map((x) => x.cfg);
  },

  resolveEffectiveFestivals(
    studioConfig: FestivalStudioConfig,
    isoDate: string = FestivalScheduleHelper.todayIsoDate()
  ): FestivalConfig[] {
    if (studioConfig.overrideMode === FESTIVAL_MODE_OFF) return [];

    const combined: FestivalConfig[] = [];
    const seenKeys = new Set<string>();

    const addUnique = (cfg: FestivalConfig) => {
      const presetKey = cfg.stylePreset.trim().toLowerCase();
      const nameKey = cfg.festivalName.trim().toLowerCase();
      const greetKey = cfg.greetingMessage.trim().toLowerCase();
      const key =
        presetKey && presetKey !== 'default'
          ? `preset:${presetKey}:${nameKey}:${greetKey}`
          : `name:${nameKey}:${greetKey}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        combined.push(cfg);
      }
    };

    for (const customCard of getEffectiveCustomFestivals(studioConfig)) {
      if (isFestivalActiveOn(customCard, isoDate)) {
        addUnique(customCard);
      }
    }

    const hiddenSet = new Set(
      (studioConfig.hiddenAutoFestivalKeys || []).map((k) => this.autoFestivalKey(k))
    );

    if (studioConfig.overrideMode !== FESTIVAL_MODE_CUSTOM && studioConfig.autoCalendarEnabled) {
      for (const autoCfg of this.activeFestivalsOn(isoDate)) {
        if (hiddenSet.has(this.autoFestivalKey(autoCfg.festivalName))) continue;
        const autoPreset = autoCfg.stylePreset.trim().toLowerCase();
        const alreadyCoveredByPreset = combined.some(
          (c) => c.stylePreset.trim().toLowerCase() === autoPreset && autoPreset !== 'default'
        );
        if (!alreadyCoveredByPreset) {
          addUnique(autoCfg);
        }
      }
    }

    return combined;
  },

  resolveEffectiveThemeHex(
    studioConfig: FestivalStudioConfig,
    activeFestivals: FestivalConfig[],
    manualThemeHex: string
  ): string {
    if (
      !studioConfig.applyFestivalThemeToApp ||
      studioConfig.overrideMode === FESTIVAL_MODE_OFF ||
      activeFestivals.length === 0
    ) {
      return manualThemeHex;
    }

    const primary = activeFestivals[0];
    const explicitHex = primary.accentColorHex.trim();
    if (isValidHexColor(explicitHex)) return explicitHex;

    switch (primary.stylePreset.trim().toLowerCase()) {
      case 'diwali':
      case 'deepavali':
        return '#D97706';
      case 'eid':
      case 'eid_mubarak':
      case 'ramadan':
        return '#059669';
      case 'holi':
        return '#DB2777';
      case 'christmas':
      case 'xmas':
        return '#15803D';
      case 'new_year':
      case 'newyear':
        return '#4F46E5';
      case 'independence_day':
      case 'republic_day':
      case 'patriot':
        return '#EA580C';
      case 'sale':
      case 'offer':
      case 'clearance':
        return '#D97757';
      default:
        return '#D97757';
    }
  },
};

// --- Presets & Visual Style Helpers (exact port of FestivalPresetsAndCarousel.kt) ---

export type FestivalPresetKey =
  | 'DIWALI'
  | 'EID'
  | 'HOLI'
  | 'CHRISTMAS'
  | 'NEW_YEAR'
  | 'INDEPENDENCE'
  | 'SALE'
  | 'DEFAULT';

export interface FestivalPresetStyle {
  preset: FestivalPresetKey;
  key: string;
  label: string;
  chipLabel: string;
  defaultBadge: string;
  defaultFestivalName: string;
  defaultGreeting: string;
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  defaultBannerAsset?: string;
}

export const STUDIO_PRESETS: Array<{
  key: string;
  label: string;
  chipLabel: string;
  defaultBadge: string;
  defaultFestivalName: string;
  defaultGreeting: string;
  defaultHex: string;
}> = [
  {
    key: 'diwali',
    label: '🪔 Diwali',
    chipLabel: '🪔 Diwali',
    defaultBadge: '🪔 DIWALI FEST',
    defaultFestivalName: 'Diwali Festival of Lights',
    defaultGreeting:
      'Happy Diwali! May your projects and life shine bright with prosperity.',
    defaultHex: '#D97706',
  },
  {
    key: 'eid',
    label: '🌙 Eid Mubarak',
    chipLabel: '🌙 Eid',
    defaultBadge: '🌙 EID MUBARAK',
    defaultFestivalName: 'Eid Celebration',
    defaultGreeting:
      'Eid Mubarak! Wishing peace, joy & abundance to you and your family.',
    defaultHex: '#059669',
  },
  {
    key: 'holi',
    label: '🎨 Holi',
    chipLabel: '🎨 Holi',
    defaultBadge: '🎨 HAPPY HOLI',
    defaultFestivalName: 'Holi Festival of Colors',
    defaultGreeting:
      'Happy Holi! Celebrating bright colors, fresh coats & joyful moments.',
    defaultHex: '#DB2777',
  },
  {
    key: 'christmas',
    label: '🎄 Christmas',
    chipLabel: '🎄 Christmas',
    defaultBadge: '🎄 MERRY CHRISTMAS',
    defaultFestivalName: 'Christmas Celebration',
    defaultGreeting:
      'Merry Christmas! Season greetings and warm wishes from our store.',
    defaultHex: '#15803D',
  },
  {
    key: 'new_year',
    label: '🎆 New Year',
    chipLabel: '🎆 New Year',
    defaultBadge: '🎆 HAPPY NEW YEAR',
    defaultFestivalName: 'New Year Celebration',
    defaultGreeting:
      'Happy New Year! Here is to stronger builds and great partnerships ahead.',
    defaultHex: '#4F46E5',
  },
  {
    key: 'independence_day',
    label: '🇮🇳 Patriot / National',
    chipLabel: '🇮🇳 National',
    defaultBadge: '🇮🇳 PROUDLY INDIAN',
    defaultFestivalName: 'National Day Special',
    defaultGreeting:
      'Saluting craftsmanship and progress! Warm festive greetings from our team.',
    defaultHex: '#EA580C',
  },
  {
    key: 'sale',
    label: '🏷️ Mega Offer / Sale',
    chipLabel: '🏷️ Offer/Sale',
    defaultBadge: '🏷️ MEGA OFFER',
    defaultFestivalName: 'Festive Mega Offer',
    defaultGreeting:
      'Special hardware & paints season prices active now — visit the counter!',
    defaultHex: '#D97757',
  },
];

export function resolveFestivalStyle(
  presetKey: string,
  customAccentHex = ''
): FestivalPresetStyle {
  const cleanKey = (presetKey || '').trim().toLowerCase();
  let preset: FestivalPresetKey = 'DEFAULT';
  let defaultBadge = '✨ SPECIAL EVENT';
  let gradientStart = '#9A3412';
  let gradientMid = '#C2410C';
  let gradientEnd = '#D97757';
  let defaultBannerAsset: string | undefined;

  switch (cleanKey) {
    case 'diwali':
    case 'deepavali':
      preset = 'DIWALI';
      defaultBadge = '🪔 DIWALI FEST';
      gradientStart = '#B45309';
      gradientMid = '#D97706';
      gradientEnd = '#EA580C';
      defaultBannerAsset = '/festivals/img_festival_diwali.jpg';
      break;
    case 'eid':
    case 'eid_mubarak':
    case 'ramadan':
      preset = 'EID';
      defaultBadge = '🌙 EID MUBARAK';
      gradientStart = '#064E3B';
      gradientMid = '#047857';
      gradientEnd = '#059669';
      break;
    case 'holi':
      preset = 'HOLI';
      defaultBadge = '🎨 HAPPY HOLI';
      gradientStart = '#9D174D';
      gradientMid = '#DB2777';
      gradientEnd = '#EA580C';
      break;
    case 'christmas':
    case 'xmas':
      preset = 'CHRISTMAS';
      defaultBadge = '🎄 MERRY CHRISTMAS';
      gradientStart = '#14532D';
      gradientMid = '#166534';
      gradientEnd = '#B91C1C';
      break;
    case 'new_year':
    case 'newyear':
      preset = 'NEW_YEAR';
      defaultBadge = '🎆 HAPPY NEW YEAR';
      gradientStart = '#312E81';
      gradientMid = '#4338CA';
      gradientEnd = '#6D28D9';
      break;
    case 'independence_day':
    case 'republic_day':
    case 'patriot':
      preset = 'INDEPENDENCE';
      defaultBadge = '🇮🇳 JAI HIND';
      gradientStart = '#C2410C';
      gradientMid = '#0F766E';
      gradientEnd = '#15803D';
      break;
    case 'sale':
    case 'offer':
    case 'clearance':
      preset = 'SALE';
      defaultBadge = '🏷️ MEGA OFFER';
      gradientStart = '#7C2D12';
      gradientMid = '#B45309';
      gradientEnd = '#D97706';
      break;
    default:
      break;
  }

  const cleanHex = customAccentHex.trim();
  if (isValidHexColor(cleanHex)) {
    gradientStart = darkenHex(cleanHex, 0.72);
    gradientMid = cleanHex;
    gradientEnd = darkenHex(cleanHex, 0.85);
  }

  const meta = STUDIO_PRESETS.find((p) => p.key === cleanKey);

  return {
    preset,
    key: cleanKey || 'default',
    label: meta?.label || '✨ Event',
    chipLabel: meta?.chipLabel || '✨ Event',
    defaultBadge,
    defaultFestivalName: meta?.defaultFestivalName || 'Festive Greeting',
    defaultGreeting: meta?.defaultGreeting || '',
    gradientStart,
    gradientMid,
    gradientEnd,
    defaultBannerAsset,
  };
}

function darkenHex(hex: string, factor: number): string {
  try {
    const clean = hex.replace('#', '');
    const full = clean.length === 8 ? clean.slice(2) : clean;
    const r = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(0, 2), 16) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(2, 4), 16) * factor)));
    const b = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(4, 6), 16) * factor)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
      .toString(16)
      .padStart(2, '0')}`;
  } catch {
    return hex;
  }
}
