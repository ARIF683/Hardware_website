import React, { useState } from 'react';
import { X, Delete, Equal } from 'lucide-react';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');

  if (!isOpen) return null;

  const handleDigit = (d: string) => {
    setDisplay((prev) => (prev === '0' ? d : prev + d));
  };

  const handleDecimal = () => {
    if (!display.includes('.')) {
      setDisplay((prev) => prev + '.');
    }
  };

  const handleOp = (op: string) => {
    setEquation(`${display} ${op} `);
    setDisplay('0');
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
  };

  const handleBackspace = () => {
    setDisplay((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  const handleEquals = () => {
    if (!equation) return;
    try {
      const full = `${equation}${display}`.replace(/×/g, '*').replace(/÷/g, '/');
      // eslint-disable-next-line no-eval
      const result = Function(`'use strict'; return (${full})`)();
      setDisplay(String(Math.round(result * 100) / 100));
      setEquation('');
    } catch {
      setDisplay('Error');
    }
  };

  const btnStyle =
    'h-12 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Quick Calculator
          </span>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Display Screen */}
        <div className="bg-slate-100 p-4 rounded-2xl text-right mb-4 border border-slate-200/80">
          <div className="text-xs text-slate-400 font-mono h-4 truncate">{equation}</div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1 truncate">
            {display}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2 text-slate-800">
          <button onClick={handleClear} className={`${btnStyle} bg-red-100 text-red-700 col-span-2`}>
            Clear
          </button>
          <button onClick={handleBackspace} className={`${btnStyle} bg-slate-100 text-slate-600`}>
            <Delete className="w-4 h-4" />
          </button>
          <button onClick={() => handleOp('÷')} className={`${btnStyle} bg-blue-100 text-blue-700`}>
            ÷
          </button>

          <button onClick={() => handleDigit('7')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            7
          </button>
          <button onClick={() => handleDigit('8')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            8
          </button>
          <button onClick={() => handleDigit('9')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            9
          </button>
          <button onClick={() => handleOp('×')} className={`${btnStyle} bg-blue-100 text-blue-700`}>
            ×
          </button>

          <button onClick={() => handleDigit('4')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            4
          </button>
          <button onClick={() => handleDigit('5')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            5
          </button>
          <button onClick={() => handleDigit('6')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            6
          </button>
          <button onClick={() => handleOp('-')} className={`${btnStyle} bg-blue-100 text-blue-700`}>
            −
          </button>

          <button onClick={() => handleDigit('1')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            1
          </button>
          <button onClick={() => handleDigit('2')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            2
          </button>
          <button onClick={() => handleDigit('3')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200`}>
            3
          </button>
          <button onClick={() => handleOp('+')} className={`${btnStyle} bg-blue-100 text-blue-700`}>
            +
          </button>

          <button onClick={() => handleDigit('0')} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200 col-span-2`}>
            0
          </button>
          <button onClick={handleDecimal} className={`${btnStyle} bg-slate-50 hover:bg-slate-100 border border-slate-200 font-bold`}>
            .
          </button>
          <button onClick={handleEquals} className={`${btnStyle} bg-blue-600 text-white shadow-xs`}>
            <Equal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
