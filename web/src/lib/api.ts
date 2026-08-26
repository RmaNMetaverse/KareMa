import { BASE } from './base';

const TOKEN_KEY = 'karema.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; raw?: boolean };

export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const { body, raw, headers, ...rest } = options;
  const token = getToken();

  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      ...(raw ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
  };
  if (body !== undefined) init.body = raw ? (body as BodyInit) : JSON.stringify(body);

  const url = path.startsWith('/') ? path : `/api/${path}`;
  const res = await fetch(`${BASE}${url}`, init);

  if (res.status === 401 && !path.includes('/auth/login')) {
    setToken(null);
    if (!location.pathname.startsWith(`${BASE}/login`)) location.href = `${BASE}/login`;
    throw new ApiError('Your session has expired', 401);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body });
export const patch = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'PATCH', body });
export const put = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'PUT', body });
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });

export async function uploadFile(
  cardId: string,
  file: File,
  onProgress?: (pct: number) => void,
  commentId?: string | null
) {
  return new Promise<any>((resolve, reject) => {
    const form = new FormData();
    form.append('cardId', cardId);
    if (commentId) form.append('commentId', commentId);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api/attachments`);
    xhr.withCredentials = true;
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const data = safeJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data?.error || 'Upload failed', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('Upload failed', 0));
    xhr.send(form);
  });
}

/** Upload a profile picture. Returns the refreshed user. */
export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('file', file);
  return api<{ user: any }>('/api/auth/avatar', { method: 'POST', body: form, raw: true });
}
