// Convert user / clipboard / CSV input into typed field values.
import { toNum, toISODate } from './util.js';

export function coerce(field, raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const s = typeof raw === 'string' ? raw.trim() : raw;
  if (s === '') return null;
  switch (field.type) {
    case 'num':
    case 'pct':
      return toNum(s);
    case 'int': {
      const n = toNum(s);
      return n === null ? null : Math.round(n);
    }
    case 'date':
      return toISODate(s);
    case 'bool':
      if (typeof s === 'boolean') return s;
      return /^(1|true|yes|y|x|✓|тийм|т)$/i.test(String(s));
    case 'code':
      return String(s).trim().toUpperCase();
    case 'calc':
      return undefined;
    default:
      return String(s);
  }
}

/** Is this raw value acceptable for the field type? (for paste previews) */
export function isValidRaw(field, raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return true;
  const v = coerce(field, raw);
  if (['num', 'pct', 'int'].includes(field.type)) return v !== null;
  if (field.type === 'date') return v !== null;
  return true;
}
