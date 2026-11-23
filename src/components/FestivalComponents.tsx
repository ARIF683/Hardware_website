import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Sparkles,
  X,
} from 'lucide-react';
import { AnnouncementConfig, FestivalConfig } from '../types';
import {
  getAnnouncementTimerSummaryLabel,
  getFestivalScheduleSummaryLabel,
  resolveFestivalStyle,
} from '../utils/festivalStudio';

export const FestivalHeaderPill: React.FC<{
  festivals: FestivalConfig[];
  className?: string;
}> = ({ festivals, className = '' }) => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
    if (festivals.length <= 1) return;
    const t = setInterval(() => {
      setIdx((prev) => (prev + 1) % festivals.length);
    }, 3500);
    return () => clearInterval(t);
  }, [festivals.length]);

  if (!festivals || festivals.length === 0) return null;

  const active = festivals[idx % festivals.length];
  const style = resolveFestivalStyle(active.stylePreset, active.accentColorHex);
  const label =
    active.badgeText.trim() ||
    active.festivalName.trim() ||
    style.defaultBadge;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-tight text-white shadow-xs whitespace-nowrap shrink-0 ${className}`}
      style={{
        background: `linear-gradient(135deg, ${style.gradientStart}, ${style.gradientMid})`,
      }}
      title={active.greetingMessage || active.festivalName}
    >
      <Sparkles className="w-3 h-3 shrink-0" />
      <span className="truncate max-w-[140px]">{label}</span>
      {festivals.length > 1 && (
        <span className="opacity-85 text-[10px] font-semibold tabular-nums">
          {(idx % festivals.length) + 1}/{festivals.length}
        </span>
      )}
    </span>
  );
};

const FestivalSvgMotif: React.FC<{ presetKey: string }> = ({ presetKey }) => {
  switch (presetKey) {
    case 'DIWALI':
      return (
        <svg viewBox="0 0 120 120" className="w-28 h-28 opacity-20 text-amber-100" fill="currentColor">
          <path d="M60 12 C67 28 71 38 60 52 C49 38 53 28 60 12 Z" />
          <path d="M22 64 C22 86 42 100 60 100 C78 100 98 86 98 64 C84 72 36 72 22 64 Z" />
          <circle cx="24" cy="28" r="3" />
          <circle cx="96" cy="24" r="2.5" />
          <circle cx="104" cy="48" r="2" />
        </svg>
      );
    case 'EID':
      return (
        <svg viewBox="0 0 120 120" className="w-28 h-28 opacity-20 text-emerald-100" fill="currentColor">
          <path d="M68 18 A36 36 0 1 0 98 80 A28 28 0 1 1 68 18 Z" />
          <polygon points="88,28 91,35 98,35 92,39 94,46 88,42 82,46 84,39 78,35 85,35" />
        </svg>
      );
    case 'HOLI':
      return (
        <svg viewBox="0 0 120 120" className="w-28 h-28 opacity-25 text-white" fill="currentColor">
          <circle cx="38" cy="44" r="22" opacity="0.7" />
          <circle cx="76" cy="38" r="18" opacity="0.55" />
          <circle cx="68" cy="76" r="24" opacity="0.65" />
        </svg>
      );
    case 'CHRISTMAS':
      return (
        <svg viewBox="0 0 120 120" className="w-28 h-28 opacity-20 text-white" fill="currentColor">
          <polygon points="60,14 34,54 46,54 26,86 94,86 74,54 86,54" />
          <rect x="54" y="86" width="12" height="18" rx="2" />
        </svg>
      );
    case 'NEW_YEAR':
      return (
        <svg viewBox="0 0 120 120" className="w-28 h-28 opacity-20 text-white" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="60" cy="52" r="28" strokeDasharray="6 6" />
          <circle cx="60" cy="52" r="14" strokeDasharray="3 5" />
          <circle cx="24" cy="24" r="4" fill="currentColor" />
          <circle cx="98" cy="30" r="3" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 120" className="w-28 h-28 opacity-15 text-white" fill="currentColor">
          <polygon points="60,12 69,42 100,42 75,60 84,92 60,72 36,92 45,60 20,42 51,42" />
        </svg>
      );
  }
};

export const FestivalBannerCard: React.FC<{
  festival: FestivalConfig;
  compact?: boolean;
  className?: string;
}> = ({ festival, compact = false, className = '' }) => {
  const [imgError, setImgError] = useState(false);
  const style = resolveFestivalStyle(festival.stylePreset, festival.accentColorHex);
  const customImg = (festival.bannerImageUrl || '').trim();
  const displayImg = !imgError ? customImg || style.defaultBannerAsset || '' : '';
  const badgeLabel = festival.badgeText.trim() || style.defaultBadge;
  const titleText = festival.festivalName.trim() || style.defaultFestivalName;
  const messageText = festival.greetingMessage.trim() || style.defaultGreeting;
  const scheduleLabel = getFestivalScheduleSummaryLabel(festival);

  useEffect(() => {
    setImgError(false);
  }, [festival.bannerImageUrl, festival.stylePreset]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden shadow-sm border border-white/20 text-white select-none ${
        compact ? 'min-h-[120px]' : 'min-h-[144px]'
      } ${className}`}
      style={{
        background: `linear-gradient(135deg, ${style.gradientStart} 0%, ${style.gradientMid} 55%, ${style.gradientEnd} 100%)`,
      }}
    >
      {displayImg ? (
        <>
          <img
            src={displayImg}
            alt={titleText}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/55 to-slate-950/25" />
        </>
      ) : (
        <div className="absolute right-2 bottom-1 pointer-events-none">
          <FestivalSvgMotif presetKey={style.preset} />
        </div>
      )}

      <div className={`relative z-10 flex flex-col justify-between h-full ${compact ? 'p-4' : 'p-5'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs border border-white/25 text-[10px] font-black tracking-wider uppercase whitespace-nowrap">
            {badgeLabel}
          </span>
          {scheduleLabel && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/30 text-[10px] font-semibold text-white/95 whitespace-nowrap">
              <Calendar className="w-3 h-3" />
              {scheduleLabel}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1 max-w-2xl">
          <h3 className="text-base sm:text-lg font-black tracking-tight leading-snug text-white drop-shadow-xs">
            {titleText}
          </h3>
          {messageText && (
            <p className="text-xs sm:text-sm font-medium text-white/90 leading-relaxed line-clamp-2">
              {messageText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export const FestivalCarouselSection: React.FC<{
  festivals: FestivalConfig[];
  className?: string;
}> = ({ festivals, className = '' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
    if (festivals.length <= 1) return;
    const t = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % festivals.length);
    }, 5000);
    return () => clearInterval(t);
  }, [festivals.length]);

  if (!festivals || festivals.length === 0) return null;

  const safeIdx = currentIndex % festivals.length;
  const active = festivals[safeIdx];

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="relative group">
        <FestivalBannerCard festival={active} />
        {festivals.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex((prev) => (prev - 1 + festivals.length) % festivals.length)
              }
              aria-label="Previous festival banner"
              className="hidden sm:flex absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/65 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % festivals.length)}
              aria-label="Next festival banner"
              className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/65 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {festivals.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {festivals.map((f, i) => (
            <button
              key={`${f.festivalName}-${i}`}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Show banner ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === safeIdx ? 'w-5 bg-slate-700' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const AnnouncementBanner: React.FC<{
  announcement: AnnouncementConfig;
  dismissed?: boolean;
  onDismiss?: () => void;
  className?: string;
}> = ({ announcement, dismissed = false, onDismiss, className = '' }) => {
  if (!announcement.enabled || !announcement.message.trim() || dismissed) return null;

  const timerLabel = getAnnouncementTimerSummaryLabel(announcement);

  const palette = (() => {
    switch (announcement.severity) {
      case 'success':
        return {
          box: 'bg-emerald-50 border-emerald-200 text-emerald-950',
          iconWrap: 'bg-emerald-100 text-emerald-700',
          subText: 'text-emerald-700',
          Icon: CheckCircle2,
        };
      case 'warning':
        return {
          box: 'bg-amber-50 border-amber-200 text-amber-950',
          iconWrap: 'bg-amber-100 text-amber-700',
          subText: 'text-amber-700',
          Icon: AlertTriangle,
        };
      case 'alert':
        return {
          box: 'bg-rose-50 border-rose-200 text-rose-950',
          iconWrap: 'bg-rose-100 text-rose-700',
          subText: 'text-rose-700',
          Icon: AlertTriangle,
        };
      default:
        return {
          box: 'bg-blue-50 border-blue-200 text-blue-950',
          iconWrap: 'bg-blue-100 text-blue-700',
          subText: 'text-blue-700',
          Icon: Info,
        };
    }
  })();

  const Icon = palette.Icon;

  return (
    <div
      className={`rounded-2xl border p-3.5 sm:p-4 flex items-start justify-between gap-3 shadow-xs ${palette.box} ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${palette.iconWrap}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs sm:text-sm font-bold leading-snug break-words">
            {announcement.message}
          </p>
          {timerLabel && (
            <p className={`inline-flex items-center gap-1 text-[11px] font-semibold ${palette.subText}`}>
              <Clock className="w-3 h-3" />
              <span>{timerLabel}</span>
            </p>
          )}
        </div>
      </div>

      {announcement.dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss announcement"
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors shrink-0"
        >
          <X className="w-4 h-4 opacity-70" />
        </button>
      )}
    </div>
  );
};
