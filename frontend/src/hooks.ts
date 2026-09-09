import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
export function useData(path: string | null) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    version = useRef(0);
  const reload = useCallback(() => {
    const seq = ++version.current;
    if (path)
      api(path)
        .then((d) => {
          if (seq !== version.current) return;
          setData(d);
          setError('');
        })
        .catch((e) => {
          if (seq === version.current) setError(e.message);
        });
  }, [path]);
  useEffect(() => {
    setData(null);
    reload();
    window.addEventListener('codemate:refresh', reload);
    const timer = setInterval(reload, 30000);
    return () => {
      version.current++;
      clearInterval(timer);
      window.removeEventListener('codemate:refresh', reload);
    };
  }, [reload]);
  return { data, error, reload };
}
