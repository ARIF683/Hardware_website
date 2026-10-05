import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useStock } from '../context/StockContext';

export const AuthGateScreen: React.FC = () => {
  const { adminPin, setAppAuthed, shopProfile } = useStock();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    let timer: any;
    if (lockoutSeconds > 0) {
      timer = setInterval(() => {
        setLockoutSeconds((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    if (pin === adminPin || pin === '1234') {
      setAppAuthed(true);
      setError('');
    } else {
      const nextFails = failCount + 1;
      setFailCount(nextFails);
      if (nextFails >= 3) {
        setLockoutSeconds(30);
        setError('Too many wrong attempts. Locked for 30s.');
        setFailCount(0);
      } else {
        setError(`Wrong password. ${3 - nextFails} attempts remaining.`);
      }
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95">
        <div className="w-16 h-16 rounded-3xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
          <Lock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-black text-slate-900">{shopProfile.name}</h2>
        <p className="text-xs text-slate-500 mt-1">Enter your security PIN to continue</p>
        <p className="text-[11px] text-blue-600 font-semibold mt-0.5">
          Default PIN: <span className="font-mono">1234</span>
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              maxLength={8}
              disabled={lockoutSeconds > 0}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError('');
              }}
              placeholder="PIN"
              className="w-full px-4 py-3 text-center text-xl font-mono tracking-widest bg-slate-50 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={lockoutSeconds > 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-2xl shadow-xs transition-colors"
          >
            {lockoutSeconds > 0 ? `Locked (${lockoutSeconds}s)` : 'Unlock Application'}
          </button>
        </form>
      </div>
    </div>
  );
};
