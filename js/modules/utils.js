/**
 * SportClub Tucumán — Utilidades Puras
 * =====================================
 * Funciones sin efectos secundarios: formato, generación de IDs,
 * cálculos, validaciones, fechas. Sin dependencias externas.
 */

import { SEDE_PREFIX, SEDE_SEQ_KEY, KEYS, DUPLICATE_WINDOW_MS } from './config.js';

// ── IDs únicos ───────────────────────────────────────────────────────

let _deviceId = null;

export function getDeviceId() {
  if (_deviceId) return _deviceId;
  _deviceId = localStorage.getItem(KEYS.deviceId);
  if (!_deviceId) {
    _deviceId = Math.random().toString(36).slice(2, 8).toUpperCase();
    localStorage.setItem(KEYS.deviceId, _deviceId);
  }
  return _deviceId;
}

/** UUID v4 simplificado + deviceId para anticollisión entre PCs */
export function genUID() {
  const ts  = Date.now().toString(36);
  const dev = getDeviceId();
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${ts}_${dev}_${rnd}`;
}

/** Número de comprobante secuencial por sede */
export function getNextNumero(sede) {
  const prefix = SEDE_PREFIX[sede] || 'SC-';
  const key    = SEDE_SEQ_KEY[sede] || 'sc_seq_v24';
  const next   = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, next);
  return prefix + String(next).padStart(6, '0');
}

// ── Fechas ───────────────────────────────────────────────────────────

export function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function nowTimeStr() {
  return new Date().toTimeString().slice(0, 5); // HH:MM
}

export function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : parseInt(ts));
  return d.toLocaleString('es-AR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit',
  });
}

export function diasDesde(str) {
  if (!str) return null;
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const date = new Date(str + 'T00:00:00');
  return Math.floor((hoy - date) / 86_400_000);
}

export function addDays(str, n) {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function strToDate(str) {
  return str ? new Date(str + 'T00:00:00') : null;
}

// ── Formato monetario ─────────────────────────────────────────────────

export function fmt$(n) {
  const num = parseFloat(n) || 0;
  return '$\u202F' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function parseMonto(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[$.]/g, '').replace(',', '.')) || 0;
}

// ── Cálculo de monto de venta ────────────────────────────────────────

export function ventaMonto(v) {
  return parseMonto(v.monto) ||
    ['efectivo','transferencia','debito','credito','qr']
      .reduce((s, k) => s + parseMonto(v[k]), 0);
}

// ── Validaciones ─────────────────────────────────────────────────────

export const Validators = {
  required(val, label) {
    if (!val || !String(val).trim()) return `${label} es obligatorio`;
    return null;
  },
  monto(val) {
    const n = parseMonto(val);
    if (isNaN(n) || n < 0)  return 'Monto inválido';
    if (n > 10_000_000)     return 'Monto excesivo (> $10.000.000)';
    return null;
  },
  fecha(val) {
    if (!val) return 'Fecha obligatoria';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'Fecha inválida (YYYY-MM-DD)';
    return null;
  },
  telefono(val) {
    if (!val) return null; // opcional
    if (!/^[\d\s+\-().]{7,20}$/.test(val)) return 'Teléfono inválido';
    return null;
  },
  sede(val, sedes) {
    if (!sedes.includes(val)) return 'Sede inválida';
    return null;
  },
};

/** Detectar posible duplicado en array de ventas */
export function detectarDuplicado(ventas, nueva) {
  const ventana = Date.now() - DUPLICATE_WINDOW_MS;
  return ventas.find(v =>
    !v.anulada &&
    v.timestamp > ventana &&
    v.cliente === nueva.cliente &&
    v.concepto === nueva.concepto &&
    Math.abs(ventaMonto(v) - ventaMonto(nueva)) < 1
  );
}

// ── Cálculos de negocio ───────────────────────────────────────────────

export function calcRecaudacion(ventas) {
  const activas = ventas.filter(v => !v.anulada);
  return {
    total:        activas.reduce((s,v) => s + ventaMonto(v), 0),
    efectivo:     activas.reduce((s,v) => s + parseMonto(v.efectivo), 0),
    transferencia:activas.reduce((s,v) => s + parseMonto(v.transferencia), 0),
    debito:       activas.reduce((s,v) => s + parseMonto(v.debito), 0),
    credito:      activas.reduce((s,v) => s + parseMonto(v.credito), 0),
    qr:           activas.reduce((s,v) => s + parseMonto(v.qr), 0),
  };
}

export function calcEfectivoDisponible(ventas, retiros) {
  const ingresos = ventas.filter(v => !v.anulada)
    .reduce((s,v) => s + parseMonto(v.efectivo), 0);
  const egresos = (retiros || [])
    .reduce((s,r) => s + parseMonto(r.monto), 0);
  return ingresos - egresos;
}

export function calcDeuda(socio) {
  if (!socio || socio.estado !== 'DEBE') return 0;
  return parseMonto(socio.deuda) || 0;
}

// ── Utilidades de array ───────────────────────────────────────────────

export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

export function sortByTimestamp(arr, desc = true) {
  return [...arr].sort((a, b) =>
    desc ? (b.timestamp || 0) - (a.timestamp || 0)
         : (a.timestamp || 0) - (b.timestamp || 0)
  );
}

// ── Hash para detección de cambios ───────────────────────────────────

export function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

// ── Seguridad / ofuscación de storage ────────────────────────────────

export function encodeForStorage(str) {
  try { return btoa(unescape(encodeURIComponent(str))); }
  catch { return str; }
}

export function decodeFromStorage(str) {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return str; // fallback: sin encodear (versión anterior)
  }
}
