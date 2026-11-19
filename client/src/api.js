export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message || 'Request failed');
    this.status = status;
    this.code = error?.code;
    this.details = error?.details;
    this.fields = error?.details?.fields || {};
  }
}

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + url, opts);
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Network error — check your connection and try again.' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || { message: `Request failed (${res.status})` });
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, formData) => request('POST', u, formData),
};

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
