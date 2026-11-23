import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Megaphone,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import {
  AnnouncementConfig,
  AnnouncementSeverity,
  FestivalConfig,
  FestivalOverrideMode,
  FestivalStudioConfig,
} from '../types';
import {
  AutoFestivalCalendar,
  FESTIVAL_MODE_AUTO,
  FESTIVAL_MODE_CUSTOM,
  FESTIVAL_MODE_OFF,
  FestivalScheduleHelper,
  STUDIO_PRESETS,
  getEffectiveCustomFestivals,
  getFestivalScheduleSummaryLabel,
  hasValidAnnouncementTimerRange,
} from '../utils/festivalStudio';
import { AnnouncementBanner, FestivalBannerCard } from './FestivalComponents';

function toLocalDateTimeInputValue(millis: number): string {
  if (!millis || millis <= 0) return '';
  const d = new Date(millis);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInputValue(val: string): number {
  if (!val) return 0;
  const ms = new Date(val).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export const AnnouncementStudioModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { festivalStudioConfig, saveAndSyncFestivalStudio, showToast } = useStock();

  // Announcement draft state
  const [noticeEnabled, setNoticeEnabled] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeSeverity, setNoticeSeverity] = useState<AnnouncementSeverity>('info');
  const [noticeDismissible, setNoticeDismissible] = useState(true);
  const [noticeStartMs, setNoticeStartMs] = useState(0);
  const [noticeEndMs, setNoticeEndMs] = useState(0);

  // Studio calendar & display mode draft
  const [autoCalendarEnabled, setAutoCalendarEnabled] = useState(true);
  const [applyFestivalTheme, setApplyFestivalTheme] = useState(true);
  const [overrideMode, setOverrideMode] = useState<FestivalOverrideMode>(FESTIVAL_MODE_AUTO);
  const [hiddenAutoKeys, setHiddenAutoKeys] = useState<string[]>([]);
  const [showCalendarManager, setShowCalendarManager] = useState(false);

  // Custom festival cards draft
  const [customCards, setCustomCards] = useState<FestivalConfig[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number>(-1);
  const [pendingFiles, setPendingFiles] = useState<Record<number, File>>({});
  const [previewObjectUrls, setPreviewObjectUrls] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const cfg = festivalStudioConfig;
    setNoticeEnabled(cfg.announcement.enabled);
    setNoticeMessage(cfg.announcement.message);
    setNoticeSeverity(cfg.announcement.severity);
    setNoticeDismissible(cfg.announcement.dismissible);
    setNoticeStartMs(cfg.announcement.startAtMillis);
    setNoticeEndMs(cfg.announcement.endAtMillis);

    setAutoCalendarEnabled(cfg.autoCalendarEnabled);
    setApplyFestivalTheme(cfg.applyFestivalThemeToApp);
    setOverrideMode(cfg.overrideMode);
    setHiddenAutoKeys(cfg.hiddenAutoFestivalKeys || []);
    setShowCalendarManager(false);

    const existingCards = getEffectiveCustomFestivals(cfg);
    setCustomCards(existingCards);
    setExpandedIndex(existingCards.length === 1 ? 0 : -1);
    setPendingFiles({});
    setPreviewObjectUrls({});
    setIsSaving(false);
  }, [isOpen, festivalStudioConfig]);

  useEffect(() => {
    return () => {
      Object.values(previewObjectUrls).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
    };
  }, [previewObjectUrls]);

  if (!isOpen) return null;

  const calendarEntries = AutoFestivalCalendar.upcomingAndActiveCalendarEntries();
  const nextUpcoming = AutoFestivalCalendar.nextUpcomingFestival();

  const draftAnnouncement: AnnouncementConfig = {
    enabled: noticeEnabled,
    message: noticeMessage,
    severity: noticeSeverity,
    dismissible: noticeDismissible,
    startAtMillis: noticeStartMs,
    endAtMillis: noticeEndMs,
  };

  const applyTimerPreset = (hoursFromNow: number | 'today' | 'clear') => {
    if (hoursFromNow === 'clear') {
      setNoticeStartMs(0);
      setNoticeEndMs(0);
      return;
    }
    const now = Date.now();
    setNoticeStartMs(now);
    if (hoursFromNow === 'today') {
      const end = new Date();
      end.setHours(23, 59, 0, 0);
      setNoticeEndMs(end.getTime());
    } else {
      setNoticeEndMs(now + hoursFromNow * 3600 * 1000);
    }
  };

  const handleAddCard = () => {
    const newCard: FestivalConfig = {
      enabled: true,
      festivalName: 'Festive Mega Offer',
      greetingMessage:
        'Special hardware & paints season prices active now — visit the counter!',
      badgeText: '🏷️ MEGA OFFER',
      accentColorHex: '#D97757',
      bannerImageUrl: '',
      startDate: FestivalScheduleHelper.todayIsoDate(),
      endDate: '',
      stylePreset: 'sale',
    };
    const nextIdx = customCards.length;
    setCustomCards((prev) => [...prev, newCard]);
    setExpandedIndex(nextIdx);
  };

  const handleUpdateCard = (idx: number, updated: FestivalConfig) => {
    setCustomCards((prev) => prev.map((c, i) => (i === idx ? updated : c)));
  };

  const handleDeleteCard = (idx: number) => {
    setCustomCards((prev) => prev.filter((_, i) => i !== idx));
    setPendingFiles((prev) => {
      const next: Record<number, File> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
    setPreviewObjectUrls((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki === idx) {
          try {
            URL.revokeObjectURL(v);
          } catch {}
        } else if (ki < idx) {
          next[ki] = v;
        } else if (ki > idx) {
          next[ki - 1] = v;
        }
      });
      return next;
    });
    if (expandedIndex === idx) setExpandedIndex(-1);
    else if (expandedIndex > idx) setExpandedIndex((p) => p - 1);
  };

  const handleSave = async () => {
    if (!hasValidAnnouncementTimerRange(draftAnnouncement)) {
      showToast('Announcement end time must be after start time.');
      return;
    }
    setIsSaving(true);
    const updatedConfig: FestivalStudioConfig = {
      autoCalendarEnabled,
      applyFestivalThemeToApp: applyFestivalTheme,
      overrideMode,
      customFestival: customCards[0] || festivalStudioConfig.customFestival,
      customFestivals: customCards,
      hiddenAutoFestivalKeys: hiddenAutoKeys,
      announcement: draftAnnouncement,
      updatedAt: Date.now(),
    };
    await saveAndSyncFestivalStudio(updatedConfig, pendingFiles);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                Announcement Studio
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Admin Only • Syncs Across All Devices
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 bg-slate-50/50">
          {/* SECTION 1: Store Announcement Notice */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Store Announcement Notice</h3>
                  <p className="text-[11px] text-slate-500">
                    Show an instant notice banner above the dashboard
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={noticeEnabled}
                onChange={(e) => setNoticeEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Announcement Message
              </label>
              <textarea
                rows={2}
                value={noticeMessage}
                onChange={(e) => setNoticeMessage(e.target.value)}
                placeholder="e.g., Holiday hours today: Counter closes at 7 PM"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Severity Selector */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">Severity</span>
              <div className="grid grid-cols-4 gap-2">
                {(['info', 'success', 'warning', 'alert'] as AnnouncementSeverity[]).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setNoticeSeverity(sev)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border capitalize transition-all whitespace-nowrap ${
                      noticeSeverity === sev
                        ? sev === 'alert'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : sev === 'warning'
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : sev === 'success'
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule Timer */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <CalendarClock className="w-4 h-4 text-blue-600" />
                  <span>Announcement Timer</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">
                  {noticeStartMs === 0 && noticeEndMs === 0 ? 'Always until turned off' : 'Timed'}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => applyTimerPreset('clear')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                    noticeStartMs === 0 && noticeEndMs === 0
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  No Timer
                </button>
                <button
                  type="button"
                  onClick={() => applyTimerPreset(1)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                >
                  1 Hour
                </button>
                <button
                  type="button"
                  onClick={() => applyTimerPreset(6)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                >
                  6 Hours
                </button>
                <button
                  type="button"
                  onClick={() => applyTimerPreset('today')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                >
                  Today
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Start Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={toLocalDateTimeInputValue(noticeStartMs)}
                    onChange={(e) => setNoticeStartMs(fromLocalDateTimeInputValue(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    End Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={toLocalDateTimeInputValue(noticeEndMs)}
                    onChange={(e) => setNoticeEndMs(fromLocalDateTimeInputValue(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer pt-1">
              <span>Allow staff/users to dismiss notice</span>
              <input
                type="checkbox"
                checked={noticeDismissible}
                onChange={(e) => setNoticeDismissible(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
            </label>

            {noticeEnabled && noticeMessage.trim() && (
              <div className="space-y-1.5 pt-1">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Live Notice Preview
                </span>
                <AnnouncementBanner announcement={draftAnnouncement} />
              </div>
            )}
          </section>

          {/* SECTION 2: Automatic Indian Festival Calendar */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Built-in Indian Festival Calendar
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Auto-displays Diwali, Eid, Holi, Republic Day & 10+ holidays
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoCalendarEnabled}
                onChange={(e) => setAutoCalendarEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
            </div>

            {nextUpcoming && (
              <div className="rounded-xl bg-indigo-50/70 border border-indigo-200/70 px-3 py-2 text-xs text-indigo-900 flex items-center justify-between gap-2">
                <span className="font-semibold truncate">
                  Next upcoming: <strong>{nextUpcoming.festivalName}</strong> (
                  {getFestivalScheduleSummaryLabel(nextUpcoming) || nextUpcoming.startDate})
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowCalendarManager((p) => !p)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700 transition-colors"
            >
              <span>
                Manage Calendar Festivals ({calendarEntries.length - hiddenAutoKeys.length}/
                {calendarEntries.length} visible)
              </span>
              {showCalendarManager ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showCalendarManager && (
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/60">
                {calendarEntries.map((entry) => {
                  const key = AutoFestivalCalendar.autoFestivalKey(entry.festivalName);
                  const isHidden = hiddenAutoKeys.includes(key);
                  return (
                    <div
                      key={key}
                      className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p
                          className={`font-bold truncate ${
                            isHidden ? 'text-slate-400 line-through' : 'text-slate-800'
                          }`}
                        >
                          {entry.festivalName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {getFestivalScheduleSummaryLabel(entry) || entry.startDate}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setHiddenAutoKeys((prev) =>
                            isHidden ? prev.filter((k) => k !== key) : [...prev, key]
                          );
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${
                          isHidden
                            ? 'bg-white border-slate-300 text-slate-600'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}
                      >
                        {isHidden ? (
                          <>
                            <EyeOff className="w-3 h-3" /> Hidden
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" /> Visible
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <label className="flex items-center justify-between pt-2 border-t border-slate-100 cursor-pointer">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Palette className="w-4 h-4 text-blue-600" />
                <span>Apply Festive Accent to App UI</span>
              </div>
              <input
                type="checkbox"
                checked={applyFestivalTheme}
                onChange={(e) => setApplyFestivalTheme(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
            </label>
          </section>

          {/* SECTION 3: Festival Display Mode */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900">Festival Display Mode</h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { mode: FESTIVAL_MODE_AUTO, title: 'AUTO', desc: 'Calendar + Custom' },
                  { mode: FESTIVAL_MODE_CUSTOM, title: 'CUSTOM', desc: 'Custom Only' },
                  { mode: FESTIVAL_MODE_OFF, title: 'OFF', desc: 'Off / Pause' },
                ] as const
              ).map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => setOverrideMode(item.mode)}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    overrideMode === item.mode
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-extrabold">{item.title}</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      overrideMode === item.mode ? 'text-blue-100' : 'text-slate-500'
                    }`}
                  >
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* SECTION 4: Custom Festival & Offer Cards */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Custom Festival & Offer Cards</h3>
                <p className="text-[11px] text-slate-500">
                  Run custom banners or offers in the Home carousel ({customCards.length})
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddCard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Card</span>
              </button>
            </div>

            {customCards.length === 0 ? (
              <div className="text-center py-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500">
                No custom cards yet. Click <strong>+ Add Card</strong> to create an offer or event
                banner.
              </div>
            ) : (
              <div className="space-y-3">
                {customCards.map((card, idx) => {
                  const isExpanded = expandedIndex === idx;
                  const previewUrl = previewObjectUrls[idx] || card.bannerImageUrl;
                  const cardWithPreview: FestivalConfig = {
                    ...card,
                    bannerImageUrl: previewUrl,
                  };

                  return (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/40"
                    >
                      {/* Card Summary Row */}
                      <div className="px-3.5 py-2.5 bg-white flex items-center justify-between gap-2 border-b border-slate-100">
                        <button
                          type="button"
                          onClick={() => setExpandedIndex(isExpanded ? -1 : idx)}
                          className="flex items-center gap-2 min-w-0 text-left flex-1"
                        >
                          <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {card.festivalName || 'Untitled Card'}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {getFestivalScheduleSummaryLabel(card) || 'No date limits'}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="checkbox"
                            checked={card.enabled}
                            onChange={(e) =>
                              handleUpdateCard(idx, { ...card, enabled: e.target.checked })
                            }
                            title="Enable/disable card"
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setExpandedIndex(isExpanded ? -1 : idx)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCard(idx)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                            title="Delete card"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Card Editor */}
                      {isExpanded && (
                        <div className="p-3.5 space-y-3 text-xs">
                          {/* Preset Chips */}
                          <div>
                            <span className="block text-[11px] font-bold text-slate-600 mb-1.5">
                              Style Preset
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {STUDIO_PRESETS.map((preset) => (
                                <button
                                  key={preset.key}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateCard(idx, {
                                      ...card,
                                      stylePreset: preset.key,
                                      badgeText: card.badgeText || preset.defaultBadge,
                                      festivalName:
                                        card.festivalName || preset.defaultFestivalName,
                                      greetingMessage:
                                        card.greetingMessage || preset.defaultGreeting,
                                      accentColorHex: card.accentColorHex || preset.defaultHex,
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                                    card.stylePreset === preset.key
                                      ? 'bg-slate-900 text-white border-slate-900'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {preset.chipLabel}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                Festival / Event Title
                              </label>
                              <input
                                type="text"
                                value={card.festivalName}
                                onChange={(e) =>
                                  handleUpdateCard(idx, { ...card, festivalName: e.target.value })
                                }
                                placeholder="e.g., Diwali Sale"
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                Top Pill Badge
                              </label>
                              <input
                                type="text"
                                value={card.badgeText}
                                onChange={(e) =>
                                  handleUpdateCard(idx, { ...card, badgeText: e.target.value })
                                }
                                placeholder="🏷️ MEGA OFFER"
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="sm:col-span-2">
                              <label className="block font-semibold text-slate-700 mb-1">
                                Banner Message
                              </label>
                              <input
                                type="text"
                                value={card.greetingMessage}
                                onChange={(e) =>
                                  handleUpdateCard(idx, {
                                    ...card,
                                    greetingMessage: e.target.value,
                                  })
                                }
                                placeholder="Festive greeting or discount details..."
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                Accent Hex
                              </label>
                              <input
                                type="text"
                                value={card.accentColorHex}
                                onChange={(e) =>
                                  handleUpdateCard(idx, {
                                    ...card,
                                    accentColorHex: e.target.value,
                                  })
                                }
                                placeholder="#D97706"
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          {/* Dates & Quick Date Chips */}
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-700">
                                Schedule Window
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateCard(idx, {
                                      ...card,
                                      startDate: FestivalScheduleHelper.todayIsoDate(),
                                      endDate: FestivalScheduleHelper.addDaysIsoDate(7),
                                    })
                                  }
                                  className="px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-bold text-slate-700"
                                >
                                  Today – +7d
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateCard(idx, {
                                      ...card,
                                      startDate: FestivalScheduleHelper.todayIsoDate(),
                                      endDate: FestivalScheduleHelper.endOfMonthIsoDate(),
                                    })
                                  }
                                  className="px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-bold text-slate-700"
                                >
                                  Full Month
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateCard(idx, { ...card, startDate: '', endDate: '' })
                                  }
                                  className="px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-bold text-slate-700"
                                >
                                  No Dates
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[11px] text-slate-500 mb-0.5">
                                  Start Date
                                </label>
                                <input
                                  type="date"
                                  value={card.startDate}
                                  onChange={(e) =>
                                    handleUpdateCard(idx, { ...card, startDate: e.target.value })
                                  }
                                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-500 mb-0.5">
                                  End Date
                                </label>
                                <input
                                  type="date"
                                  value={card.endDate}
                                  onChange={(e) =>
                                    handleUpdateCard(idx, { ...card, endDate: e.target.value })
                                  }
                                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Banner Image Upload */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl font-bold text-slate-700 cursor-pointer transition-colors">
                              <ImagePlus className="w-4 h-4 text-blue-600" />
                              <span>{previewUrl ? 'Change Banner Photo' : 'Upload Banner Photo'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setPendingFiles((prev) => ({ ...prev, [idx]: file }));
                                  const objUrl = URL.createObjectURL(file);
                                  setPreviewObjectUrls((prev) => {
                                    if (prev[idx]) {
                                      try {
                                        URL.revokeObjectURL(prev[idx]);
                                      } catch {}
                                    }
                                    return { ...prev, [idx]: objUrl };
                                  });
                                }}
                              />
                            </label>
                            {previewUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateCard(idx, { ...card, bannerImageUrl: '' });
                                  setPendingFiles((prev) => {
                                    const copy = { ...prev };
                                    delete copy[idx];
                                    return copy;
                                  });
                                  setPreviewObjectUrls((prev) => {
                                    if (prev[idx]) {
                                      try {
                                        URL.revokeObjectURL(prev[idx]);
                                      } catch {}
                                    }
                                    const copy = { ...prev };
                                    delete copy[idx];
                                    return copy;
                                  });
                                }}
                                className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-semibold border border-rose-200"
                              >
                                Clear Photo
                              </button>
                            )}
                          </div>

                          {/* Live Banner Preview */}
                          <div className="space-y-1.5 pt-1">
                            <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Live Banner Preview
                            </span>
                            <FestivalBannerCard festival={cardWithPreview} compact />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Save & Sync Devices</span>
          </button>
        </div>
      </div>
    </div>
  );
};
