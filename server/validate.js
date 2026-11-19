import { badRequest } from './errors.js';

/**
 * Tiny validator. Collects all field errors so the UI can show a message
 * next to each field: details = { field: message }.
 */
export class V {
  constructor(body) {
    this.body = body && typeof body === 'object' ? body : {};
    this.out = {};
    this.errors = {};
  }
  fail(field, msg) { if (!this.errors[field]) this.errors[field] = msg; return this; }

  str(field, { label = field, min = 1, max = 200, optional = false, pattern, patternMsg } = {}) {
    let v = this.body[field];
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') return this.fail(field, `${label} must be text.`);
    v = v.trim();
    if (!v && optional) { this.out[field] = ''; return this; }
    if (v.length < min) return this.fail(field, min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`);
    if (v.length > max) return this.fail(field, `${label} must be at most ${max} characters.`);
    if (pattern && !pattern.test(v)) return this.fail(field, patternMsg || `${label} is not valid.`);
    this.out[field] = v;
    return this;
  }

  int(field, { label = field, min = -Infinity, max = Number.MAX_SAFE_INTEGER, optional = false } = {}) {
    let v = this.body[field];
    if (v === undefined || v === null || v === '') {
      if (optional) return this;
      return this.fail(field, label === 'Category' ? 'Choose a category.' : `${label} is required.`);
    }
    if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number(v.trim());
    if (!Number.isInteger(v)) return this.fail(field, `${label} must be a whole number.`);
    if (v < min) return this.fail(field, `${label} must be at least ${min}.`);
    if (v > max) return this.fail(field, `${label} must be at most ${max}.`);
    this.out[field] = v;
    return this;
  }

  bool(field, { optional = true } = {}) {
    const v = this.body[field];
    if (v === undefined && optional) return this;
    if (typeof v !== 'boolean') return this.fail(field, `${field} must be true or false.`);
    this.out[field] = v;
    return this;
  }

  oneOf(field, values, { label = field } = {}) {
    const v = this.body[field];
    if (!values.includes(v)) return this.fail(field, `Choose a valid ${label.toLowerCase()}.`);
    this.out[field] = v;
    return this;
  }

  /** Throws 400 with per-field details if anything failed. */
  done() {
    if (Object.keys(this.errors).length) {
      const first = Object.values(this.errors)[0];
      throw badRequest(first, { fields: this.errors });
    }
    return this.out;
  }
}

export const PHONE = /^\+?[0-9][0-9 ()-]{6,18}[0-9]$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function positiveIntParam(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}.`);
  return n;
}
