import { useState } from 'react';
import { CloseIcon, SparklesIcon, ShieldIcon, CpuIcon, DownloadIcon, RefreshIcon } from './icons';
import { installUpdateAndRestart } from '../lib/updateChecker';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableUpdate: any | null; 
}

export function ChangelogModal({ isOpen, onClose, availableUpdate }: ChangelogModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUpdate = async () => {
    if (!availableUpdate) return;
    setIsUpdating(true);
    try {
      await installUpdateAndRestart(availableUpdate);
    } catch (e) {
      setUpdateError("Update failed. Please try downloading manually from GitHub.");
      setTimeout(() => setUpdateError(null), 3000);
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-panel)] animate-fade-slide-in">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--color-border-subtle)]">
          <div className="flex items-center gap-2">
            <SparklesIcon size={13} className="text-[color:var(--color-accent)]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-accent)]">
              {availableUpdate ? "Update Available" : "What's New"}
            </span>
          </div>
          {!isUpdating && (
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          {availableUpdate ? (
            <div className="text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center border border-[color:var(--color-status-success)]/30 bg-[color:var(--color-status-success)]/10 mb-5">
                <DownloadIcon size={20} className="text-[color:var(--color-status-success)]" />
              </div>
              <h2 className="text-base font-bold text-[color:var(--color-text-primary)] mb-2">Update Available!</h2>
              <p className="text-[color:var(--color-text-muted)] text-sm mb-6">
                Arkenar version{" "}
                <span className="text-[color:var(--color-accent)] font-mono font-bold">{availableUpdate.version}</span>{" "}
                is ready to install.
              </p>
              
              {updateError && (
                <p className="mb-4 text-xs font-mono text-[color:var(--color-status-critical)] border border-[color:var(--color-status-critical)]/30 px-3 py-2 inline-block">
                  {updateError}
                </p>
              )}
              
              <button 
                onClick={handleUpdate}
                disabled={isUpdating}
                className={`w-full flex justify-center items-center gap-2 bg-[color:var(--color-status-success)] py-2.5 text-[10px] font-mono uppercase tracking-[0.18em] text-white border border-[color:var(--color-status-success)] transition-all duration-150 ${isUpdating ? "opacity-50 cursor-not-allowed" : "hover:brightness-110 active:scale-95"}`}
              >
                {isUpdating ? <RefreshIcon size={14} className="animate-spin" /> : <DownloadIcon size={14} />}
                {isUpdating ? 'Downloading & Installing...' : 'Update & Restart'}
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex h-12 w-12 items-center justify-center border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 mb-5">
                  <SparklesIcon size={20} className="text-[color:var(--color-accent)]" />
                </div>
                <h2 className="text-base font-bold text-[color:var(--color-text-primary)]">What's New in v1.1</h2>
                <p className="text-[color:var(--color-text-muted)] text-xs mt-1">The most powerful Arkenar yet.</p>
              </div>

              <div className="space-y-5 mb-8">
                <div className="flex gap-4 items-start">
                  <CpuIcon size={16} className="text-[color:var(--color-accent)] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-text-primary)] mb-1">Arkenar Studio</h4>
                    <p className="text-xs text-[color:var(--color-text-muted)] leading-relaxed">A full HTTP repeater environment with history, auto-login, and manual exploitation tools.</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <ShieldIcon size={16} className="text-[color:var(--color-accent)] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-text-primary)] mb-1">Smart Login</h4>
                    <p className="text-xs text-[color:var(--color-text-muted)] leading-relaxed">Automated session capture with CSRF detection to bypass complex login forms.</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={onClose}
                className="w-full py-2.5 text-[10px] font-mono uppercase tracking-[0.18em] bg-[color:var(--color-accent)] text-white border border-[color:var(--color-accent)] hover:brightness-110 transition-all duration-150 active:scale-95"
              >
                Got it, let's explore
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}