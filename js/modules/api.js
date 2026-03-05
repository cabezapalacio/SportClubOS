/**
 * SportClub Tucumán — API con Google Apps Script
 * ================================================
 * Toda comunicación con Google Sheets pasa por aquí.
 *
 * Arquitectura de seguridad:
 * - El frontend NUNCA tiene client_email ni private_key.
 * - El Apps Script actúa como proxy con su propia Service Account.
 * - El frontend se autentica con un token simple (hash) configurado
 *   por el administrador. El token se guarda en localStorage
 *   (no es secreto criptográfico — es control de acceso básico).
 *
 * Flujo:
 *   Frontend → POST https://script.google.com/macros/s/XXX/exec
 *            → { token, action, sheet, data, id? }
 *   Apps Script valida el token y ejecuta la operación en Sheets.
 *   Responde: { ok: true, data } | { ok: false, error }
 */

import { state } from './store.js';
import { SHEET_RANGES, TIMING } from './config.js';

// ── Estado interno ────────────────────────────────────────────────────
let _backoffMs      = 2_000;
let _pendingRequests = 0;

// ── Helpers ───────────────────────────────────────────────────────────

function getGasUrl() {
  return state.gasUrl || localStorage.getItem('sc_gas_url') || '';
}

function getToken() {
  return state.gasToken || localStorage.getItem('sc_gas_token') || '';
}

async function gasRequest(action, payload = {}) {
  const url   = getGasUrl();
  const token = getToken();
  if (!url)   throw new Error('GAS_URL no configurada');
  if (!token) throw new Error('Token de API no configurado');

  _pendingRequests++;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, ...payload }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const result = await resp.json();
    if (!result.ok) {
      throw new Error(result.error || 'Error desconocido en Apps Script');
    }

    // Reset backoff al tener éxito
    _backoffMs = 2_000;
    return result.data;

  } finally {
    _pendingRequests--;
  }
}

// ── API pública ───────────────────────────────────────────────────────

/** Leer todas las filas de una hoja */
export async function apiGet(sheet) {
  return gasRequest('get', { sheet });
}

/** Agregar una fila nueva (append) */
export async function apiAppend(sheet, row) {
  return gasRequest('append', { sheet, row });
}

/** Actualizar una fila por ID (columna 'id') */
export async function apiUpsert(sheet, id, row) {
  return gasRequest('upsert', { sheet, id, row });
}

/** Reescribir todas las filas de una hoja (bulk sync) */
export async function apiBulk(sheet, rows) {
  return gasRequest('bulk', { sheet, rows });
}

/** Verificar conectividad */
export async function apiPing() {
  return gasRequest('ping');
}

/** Obtener config remota (precios, sede, etc.) */
export async function apiGetConfig() {
  return gasRequest('getConfig');
}

// ── Serialización de filas ────────────────────────────────────────────
// Mappers bidireccionales: objeto JS ↔ array de Sheets

export function ventaToRow(v) {
  return [
    v.id, v.numero, v.fecha, v.hora, v.sede, v.cliente, v.concepto,
    v.efectivo||0, v.transferencia||0, v.debito||0, v.credito||0, v.qr||0,
    v.monto||0, v.metodo||'', v.obs||'',
    v.anulada ? 'SI' : 'NO',
    v.anulacion?.quien || '',
    v.anulacion?.motivo || '',
    v.timestamp || Date.now(),
    Date.now(), // updatedAt
  ];
}

export function rowToVenta(r) {
  return {
    id:            r[0],
    numero:        r[1],
    fecha:         r[2],
    hora:          r[3],
    sede:          r[4],
    cliente:       r[5],
    concepto:      r[6],
    efectivo:      parseFloat(r[7]) || 0,
    transferencia: parseFloat(r[8]) || 0,
    debito:        parseFloat(r[9]) || 0,
    credito:       parseFloat(r[10]) || 0,
    qr:            parseFloat(r[11]) || 0,
    monto:         parseFloat(r[12]) || 0,
    metodo:        r[13],
    obs:           r[14],
    anulada:       r[15] === 'SI',
    anulacion: r[16] ? {
      quien: r[16], motivo: r[17],
      timestamp: parseInt(r[18]) || 0,
    } : null,
    timestamp:     parseInt(r[18]) || 0,
    updatedAt:     parseInt(r[19]) || 0,
  };
}

export function socioToRow(s) {
  return [
    s.nombre, s.fecha_pago, s.concepto, s.vigencia_hasta,
    s.sede, s.estado, s.telefono||'', s.obs||'',
    s.timestamp||Date.now(), Date.now(),
  ];
}

export function rowToSocio(r) {
  return {
    nombre:        r[0], fecha_pago:     r[1],
    concepto:      r[2], vigencia_hasta: r[3],
    sede:          r[4], estado:         r[5],
    telefono:      r[6], obs:            r[7],
    timestamp:     parseInt(r[8]) || 0,
    updatedAt:     parseInt(r[9]) || 0,
  };
}

export function lockerToRow(l, sexo) {
  return [
    l.numero, sexo||l.sexo||'', l.socio||'', l.telefono||'', l.email||'',
    l.vencimiento||'', l.tamano||'', l.precio||0,
    l.renovacion_auto ? 'SI' : 'NO',
    l.fecha_asignado||'', l.ultima_renovacion||'',
    l.sede||'', Date.now(),
  ];
}

export function rowToLocker(r) {
  return {
    numero:           parseInt(r[0]) || 0,
    sexo:             r[1],
    socio:            r[2], telefono:         r[3],
    email:            r[4], vencimiento:      r[5],
    tamano:           r[6], precio:           parseFloat(r[7]) || 0,
    renovacion_auto:  r[8] === 'SI',
    fecha_asignado:   r[9], ultima_renovacion:r[10],
    sede:             r[11], updatedAt:        parseInt(r[12]) || 0,
  };
}

export function packToRow(p) {
  return [
    p.id, p.cliente, p.fecha, p.sede,
    p.fichas, p.fichas_disp, p.fichas_tragadas||0,
    p.precio||0, p.metodo||'', p.obs||'', p.estado||'activo',
  ];
}

export function rowToPack(r) {
  return {
    id:              r[0], cliente:        r[1],
    fecha:           r[2], sede:           r[3],
    fichas:          parseInt(r[4])||0,
    fichas_disp:     parseInt(r[5])||0,
    fichas_tragadas: parseInt(r[6])||0,
    precio:          parseFloat(r[7])||0,
    metodo:          r[8], obs: r[9],
    estado:          r[10]||'activo',
  };
}

export function turnoToRow(t) {
  return [
    t.id, t.fecha, t.hora_inicio, t.hora_fin,
    t.persona_entra||'', t.persona_sale||'',
    t.recaudacion||0, t.cant_ventas||0,
    t.sede||'', t.obs||'', t.cierre ? 'SI' : 'NO',
  ];
}

export function rowToTurno(r) {
  return {
    id:            r[0], fecha:         r[1],
    hora_inicio:   r[2], hora_fin:      r[3],
    persona_entra: r[4], persona_sale:  r[5],
    recaudacion:   parseFloat(r[6])||0,
    cant_ventas:   parseInt(r[7])||0,
    sede:          r[8], obs:           r[9],
    cierre:        r[10] === 'SI',
  };
}

export function egresoToRow(e) {
  return [
    e.id, e.fecha, e.descripcion, e.monto||0,
    e.categoria||'otro', e.sede||'', e.quien||'', e.obs||'',
    Date.now(),
  ];
}

export function rowToEgreso(r) {
  return {
    id:          r[0], fecha:       r[1],
    descripcion: r[2], monto:       parseFloat(r[3])||0,
    categoria:   r[4], sede:        r[5],
    quien:       r[6], obs:         r[7],
    updatedAt:   parseInt(r[8])||0,
  };
}

export function contactoToRow(c) {
  return [c.nombre, c.telefono||'', c.email||'', c.sede||'', c.obs||'', Date.now()];
}

export function rowToContacto(r) {
  return {
    nombre:r[0], telefono:r[1], email:r[2],
    sede:r[3],   obs:r[4],       updatedAt:parseInt(r[5])||0,
  };
}

export function crmToRows(crmNotas) {
  const rows = [];
  for (const [nombre, notas] of Object.entries(crmNotas)) {
    for (const n of (notas || [])) {
      rows.push([nombre, n.fecha||'', n.texto||'', n.tipo||'', n.quien||'', n.id||'', Date.now()]);
    }
  }
  return rows;
}

export function rowsToCrm(rows) {
  const crm = {};
  for (const r of rows) {
    const nombre = r[0];
    if (!nombre) continue;
    crm[nombre] = crm[nombre] || [];
    crm[nombre].push({
      fecha: r[1], texto: r[2], tipo: r[3],
      quien: r[4], id:    r[5], updatedAt: parseInt(r[6])||0,
    });
  }
  return crm;
}
