import React, { useRef } from 'react';
import { Timer } from 'lucide-react';
import { formatOtpCountdown } from '../services/authService';

export const OTP_CODE_LENGTH = 6;

interface OtpCodeBoxesInputProps {
  value: string;
  onValueChange: (val: string) => void;
  label?: string;
  enabled?: boolean;
  onCompleteSubmit?: () => void;
  testId?: string;
}

export const OtpCodeBoxesInput: React.FC<OtpCodeBoxesInputProps> = ({
  value,
  onValueChange,
  label = 'Verification Code (6-digit)',
  enabled = true,
  onCompleteSubmit,
  testId,
}) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);

  const handleBoxChange = (idx: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.length > 1) {
      // Handle paste / multi-digit input
      const next = (digits.slice(0, idx) + cleaned).replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
      onValueChange(next);
      const focusIdx = Math.min(OTP_CODE_LENGTH - 1, next.length);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const chars = Array.from({ length: OTP_CODE_LENGTH }, (_, i) => digits[i] || '');
    chars[idx] = cleaned;
    const nextVal = chars.join('').replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
    onValueChange(nextVal);
    if (cleaned && idx < OTP_CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[idx] && idx > 0) {
        const chars = Array.from({ length: OTP_CODE_LENGTH }, (_, i) => digits[i] || '');
        chars[idx - 1] = '';
        onValueChange(chars.join(''));
        inputRefs.current[idx - 1]?.focus();
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < OTP_CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    } else if (e.key === 'Enter' && digits.length === OTP_CODE_LENGTH && onCompleteSubmit) {
      onCompleteSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
    if (pasted) {
      e.preventDefault();
      onValueChange(pasted);
      const focusIdx = Math.min(OTP_CODE_LENGTH - 1, Math.max(0, pasted.length - 1));
      inputRefs.current[focusIdx]?.focus();
    }
  };

  return (
    <div className="space-y-2 text-left" data-testid={testId}>
      {label && (
        <label className="block text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: OTP_CODE_LENGTH }).map((_, idx) => {
          const ch = digits[idx] || '';
          const isFilled = Boolean(ch);
          return (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              disabled={!enabled}
              value={ch}
              onChange={(e) => handleBoxChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              aria-label={`OTP digit ${idx + 1}`}
              className={`h-12 w-full rounded-xl border text-center text-lg font-extrabold font-mono tabular-nums transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isFilled
                  ? 'border-blue-500 bg-blue-50/70 text-slate-900'
                  : 'border-slate-300 bg-slate-50 text-slate-900 hover:border-slate-400'
              } disabled:opacity-60`}
            />
          );
        })}
      </div>
    </div>
  );
};

interface OtpCountdownBannerProps {
  secondsRemaining: number;
  className?: string;
}

export const OtpCountdownBanner: React.FC<OtpCountdownBannerProps> = ({
  secondsRemaining,
  className = '',
}) => {
  const isExpired = secondsRemaining <= 0;
  const isWarning = !isExpired && secondsRemaining <= 60;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
        isExpired
          ? 'bg-rose-50 border-rose-200 text-rose-700'
          : isWarning
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      } ${className}`}
    >
      <Timer className="w-4 h-4 shrink-0" />
      <span className="tabular-nums">
        {isExpired
          ? 'OTP code expired — request a new OTP code below.'
          : `OTP valid for ${formatOtpCountdown(secondsRemaining)}`}
      </span>
    </div>
  );
};
