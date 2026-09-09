let csrf = '';
export const setCsrf = (v: string) => (csrf = v);
export const refresh = () => window.dispatchEvent(new Event('codemate:refresh'));
export async function api(path: string, body?: any, method?: string) {
  const options: RequestInit = {
    method: method ?? (body ? 'POST' : 'GET'),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    ...(body ? { body: JSON.stringify({ operationId: crypto.randomUUID(), ...body }) } : {}),
  };
  let response: Response;
  try {
    response = await fetch((import.meta.env.VITE_BACKEND_URL ?? '') + '/api' + path, options);
  } catch {
    response = await fetch((import.meta.env.VITE_BACKEND_URL ?? '') + '/api' + path, options);
  }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('codemate:expired'));
    throw new Error(
      (result.error ?? 'Request failed.') +
        (result.details
          ? ' ' +
            result.details
              .slice(0, 2)
              .map((d: any) => d.path.join('.') + ': ' + d.message)
              .join(' · ')
          : ''),
    );
  }
  if (options.method !== 'GET') refresh();
  return result;
}
