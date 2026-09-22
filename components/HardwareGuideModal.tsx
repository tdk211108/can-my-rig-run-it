'use client';

import React, { useEffect, useState } from 'react';

interface HardwareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LOCK_SECONDS = 10;
const GUIDE_SEEN_KEY = 'can-it-run-it:hardware-guide-seen';

export default function HardwareGuideModal({ isOpen, onClose }: HardwareGuideModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(LOCK_SECONDS);
  const [earlyNote, setEarlyNote] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const hasSeenGuide = window.localStorage.getItem(GUIDE_SEEN_KEY) === 'true';
    setSecondsLeft(hasSeenGuide ? 0 : LOCK_SECONDS);
    setEarlyNote(false);
    if (hasSeenGuide) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const left = Math.max(0, LOCK_SECONDS - Math.floor((Date.now() - started) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        window.clearInterval(timer);
        window.localStorage.setItem(GUIDE_SEEN_KEY, 'true');
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const canClose = secondsLeft <= 0;

  const tryClose = () => {
    if (canClose) {
      window.localStorage.setItem(GUIDE_SEEN_KEY, 'true');
      onClose();
    }
    else setEarlyNote(true);
  };

  return (
    <div
      className="hardware-guide-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={tryClose}
      role="presentation"
    >
      <div
        className="hardware-guide-panel w-full max-w-2xl rounded-3xl p-6 md:p-8 space-y-6 text-slate-100 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hardware-guide-title"
      >
        <div className="flex items-center justify-between border-b border-indigo-400/20 pb-4">
          <div className="flex items-center gap-2">
            <span className="hardware-guide-icon" aria-hidden="true">◈</span>
            <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-indigo-300">Hardware orientation</p>
            <h3 id="hardware-guide-title" className="text-lg md:text-xl font-bold text-white">
              How to Identify Your CPU and GPU
            </h3>
            </div>
          </div>
          <button
            onClick={tryClose}
            className="text-indigo-200 hover:text-white p-2 rounded-xl hover:bg-white/10 transition"
            aria-label="Close guide"
          >
            ✕
          </button>
        </div>

        <div className="hardware-guide-callout p-4 rounded-2xl space-y-2 text-xs md:text-sm">
          <p className="font-bold flex items-center gap-1.5 text-fuchsia-200">
          <span aria-hidden="true">!</span> Why does the app show “Microsoft Basic Render”?
          </p>
          <p className="text-indigo-100/75">
            This is Windows&apos; fallback driver when <b>hardware acceleration is disabled</b> or the graphics driver is missing.
          </p>
        </div>

        <div className="space-y-4 text-sm text-slate-300">
          <div className="hardware-guide-card p-4 rounded-2xl space-y-2">
            <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <span>Step 1:</span> Open Task Manager
            </h4>
            <p className="text-xs md:text-sm">
              Press <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-emerald-300">Shift + Ctrl + Esc</kbd>.
            </p>
          </div>

          <div className="hardware-guide-card p-4 rounded-2xl space-y-3">
            <h4 className="font-semibold text-cyan-400 flex items-center gap-1.5">
              <span>Step 2–3:</span> Find Performance, CPU and GPU
            </h4>
            <p className="text-xs md:text-sm">
              Head to the <b>Performance</b> tab, then click the <b>CPU</b> and <b>GPU</b> tabs to see the model you have.
            </p>
            <video
              src="/hardware-guide-task-manager.mp4"
              autoPlay
              muted
              loop
              playsInline
              aria-label="Task Manager showing the Performance, CPU and GPU tabs"
              className="hardware-guide-gif w-full rounded-xl border border-indigo-300/20"
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 pt-2 border-t border-indigo-400/20">
          {earlyNote && !canClose && (
            <p className="text-[11px] text-amber-300 w-full text-right">
              Please finish reading the guide. Closing is available in {secondsLeft}s.
            </p>
          )}
          <button
            onClick={tryClose}
            className="hardware-guide-close px-5 py-2.5 rounded-xl font-semibold transition cursor-pointer"
          >
            {canClose ? 'Got it, close' : `Read guide (${secondsLeft}s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
