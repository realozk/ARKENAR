import { useState } from 'react';
import { Sparkles, Shield, Cpu, X, DownloadCloud, RefreshCw } from 'lucide-react';
import { installUpdateAndRestart } from '../lib/updateChecker';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableUpdate: any | null; 
}

export function ChangelogModal({ isOpen, onClose, availableUpdate }: ChangelogModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const handleUpdate = async () => {
    if (!availableUpdate) return;
    setIsUpdating(true);
    try {
      await installUpdateAndRestart(availableUpdate);
    } catch (e) {
      alert("Update failed. Please try downloading manually from GitHub.");
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-panel p-8 shadow-2xl animate-fade-slide-in">
        
        {!isUpdating && (
          <button onClick={onClose} className="absolute right-4 top-4 text-text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        )}

        {availableUpdate ? (
          <div className="text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-status-success/20 border border-status-success/30 mb-4">
              <DownloadCloud className="text-status-success" size={24} />
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">Update Available!</h2>
            <p className="text-text-muted text-sm mb-6">
              Arkenar version <span className="text-accent font-bold">{availableUpdate.version}</span> is ready to install.
            </p>
            
            <button 
              onClick={handleUpdate}
              disabled={isUpdating}
              className="w-full flex justify-center items-center gap-2 rounded-xl bg-status-success py-3 text-sm font-bold text-bg-root hover:opacity-90 transition-all btn-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdating ? <RefreshCw className="animate-spin" size={18} /> : <DownloadCloud size={18} />}
              {isUpdating ? 'Downloading & Installing...' : 'Update & Restart'}
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 border border-accent/30 mb-4">
                <Sparkles className="text-accent" size={24} />
              </div>
              <h2 className="text-2xl font-bold text-text-primary">What's New in v1.1</h2>
              <p className="text-text-muted text-sm mt-1">The most powerful Arkenar yet.</p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="flex gap-4">
                <Cpu className="text-accent mt-1 shrink-0" size={20} />
                <div>
                  <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Arkenar Studio</h4>
                  <p className="text-xs text-text-muted leading-relaxed">A full HTTP repeater environment with history, auto-login, and manual exploitation tools.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Shield className="text-accent mt-1 shrink-0" size={20} />
                <div>
                  <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Smart Login</h4>
                  <p className="text-xs text-text-muted leading-relaxed">Automated session capture with CSRF detection to bypass complex login forms.</p>
                </div>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-bg-root hover:opacity-90 transition-all btn-glow"
            >
              Got it, let's explore
            </button>
          </>
        )}
      </div>
    </div>
  );
}