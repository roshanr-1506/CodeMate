import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Maximize } from 'lucide-react';
import { api } from '../api';

export function AntiCheat({ role }: { role: string }) {
  const [tabWarning, setTabWarning] = useState(false);
  const [fsWarning, setFsWarning] = useState(false);
  const [violations, setViolations] = useState(0);
  const reported = useRef(new Set<string>());

  // Only enforce for CHESS/DEBUGGING
  const enforce = role === 'CHESS' || role === 'DEBUGGING';

  useEffect(() => {
    if (!enforce) return;

    // Request fullscreen on mount
    const enterFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        el.requestFullscreen?.().catch(() => {});
      }
    };
    // Give a small delay for React to settle
    const timer = setTimeout(enterFullscreen, 500);

    const handleVisibility = () => {
      if (document.hidden) {
        setTabWarning(true);
        setViolations((v) => v + 1);
        const key = 'tab:' + Date.now();
        if (!reported.current.has(key)) {
          reported.current.add(key);
          api('/anticheat/violation', { type: 'TAB_SWITCH', metadata: { timestamp: new Date().toISOString() } }).catch(() => {});
        }
      }
    };

    const handleBlur = () => {
      setTabWarning(true);
      setViolations((v) => v + 1);
      const key = 'blur:' + Date.now();
      if (!reported.current.has(key)) {
        reported.current.add(key);
        api('/anticheat/violation', { type: 'TAB_SWITCH', metadata: { trigger: 'blur', timestamp: new Date().toISOString() } }).catch(() => {});
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFsWarning(true);
        const key = 'fs:' + Date.now();
        if (!reported.current.has(key)) {
          reported.current.add(key);
          api('/anticheat/violation', { type: 'FULLSCREEN_EXIT', metadata: { timestamp: new Date().toISOString() } }).catch(() => {});
        }
      } else {
        setFsWarning(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [enforce]);

  if (!enforce) return null;

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().then(() => {
      setFsWarning(false);
    }).catch(() => {});
  };

  return (
    <>
      {/* Tab switch warning overlay */}
      {tabWarning && (
        <div className="anticheat-overlay" onClick={() => setTabWarning(false)}>
          <div className="anticheat-modal">
            <AlertTriangle size={48} />
            <h2>Tab Switch Detected!</h2>
            <p>Switching tabs or windows during the competition is not allowed.</p>
            <p className="violation-count">Violations recorded: <strong>{violations}</strong></p>
            <p className="muted small">This has been logged and reported to the administrators.</p>
            <button onClick={() => setTabWarning(false)}>Return to Competition</button>
          </div>
        </div>
      )}

      {/* Fullscreen exit warning overlay */}
      {fsWarning && !tabWarning && (
        <div className="anticheat-overlay">
          <div className="anticheat-modal">
            <Maximize size={48} />
            <h2>Fullscreen Required</h2>
            <p>The competition must be played in fullscreen mode.</p>
            <p className="muted small">This violation has been recorded.</p>
            <button onClick={enterFullscreen}>Return to Fullscreen</button>
          </div>
        </div>
      )}
    </>
  );
}
