/**
 * SportClub Tucumán — Estado Global (Store)
 * ==========================================
 * Estado reactivo centralizado. Toda la app lee y escribe aquí.
 * Nunca acceder a localStorage directamente fuera de este módulo.
 */

import { KEYS } from './config.js';

// ── Parseo seguro de JSON ─────────────────────────────────────────────
function safeJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ── Estado de la aplicación ───────────────────────────────────────────
export const state = {
  // Datos operativos
  ventas:           safeJSON(KEYS.ventas, []),
  socios:           safeJSON(KEYS.socios, []),
  lockersH:         safeJSON(KEYS.lockers_h, []),
  lockersM:         safeJSON(KEYS.lockers_m, []),
  packsCafe:        safeJSON(KEYS.packsCafe, []),
  turnos:           safeJSON(KEYS.turnos, []),
  egresos:          safeJSON(KEYS.egresos, []),
  contactos:        safeJSON(KEYS.contactos, []),
  crmNotas:         safeJSON(KEYS.crmNotas, {}),
  crmResueltos:     safeJSON(KEYS.crmResueltos, {}),
  waLog:            safeJSON(KEYS.waLog, []),
  productos:        safeJSON(KEYS.productos, []),
  historialCambios: safeJSON(KEYS.cambios, []),

  // Sesión
  rolActual:  '',    // 'recepcion' | 'admin'
  sedeActual: localStorage.getItem(KEYS.sede) || 'VIA 24',
  adminPass:  localStorage.getItem(KEYS.adminPass) || '1234',

  // Sincronización
  gasUrl:      localStorage.getItem(KEYS.gasUrl) || '',
  gasToken:    localStorage.getItem(KEYS.gasToken) || '',
  connected:   false,
  syncing:     false,
  syncPending: false,
  syncErrors:  0,
  lastSyncTime: null,

  // Cola offline
  offlineQueue: safeJSON(KEYS.offlineQueue, []),

  // UI state
  currentSection: '',
  currentPeriod: 'semana',
  crmFiltro: 'todos',
};

// ── Persistencia de cache local ───────────────────────────────────────
export function saveCache() {
  try {
    localStorage.setItem(KEYS.ventas,      JSON.stringify(state.ventas));
    localStorage.setItem(KEYS.socios,      JSON.stringify(state.socios));
    localStorage.setItem(KEYS.lockers_h,   JSON.stringify(state.lockersH));
    localStorage.setItem(KEYS.lockers_m,   JSON.stringify(state.lockersM));
    localStorage.setItem(KEYS.packsCafe,   JSON.stringify(state.packsCafe));
    localStorage.setItem(KEYS.turnos,      JSON.stringify(state.turnos));
    localStorage.setItem(KEYS.egresos,     JSON.stringify(state.egresos));
    localStorage.setItem(KEYS.contactos,   JSON.stringify(state.contactos));
    localStorage.setItem(KEYS.crmNotas,    JSON.stringify(state.crmNotas));
    localStorage.setItem(KEYS.crmResueltos,JSON.stringify(state.crmResueltos));
    localStorage.setItem(KEYS.waLog,       JSON.stringify(state.waLog));
    localStorage.setItem(KEYS.productos,   JSON.stringify(state.productos));
    localStorage.setItem(KEYS.cambios,     JSON.stringify(state.historialCambios));
  } catch(e) {
    console.warn('saveCache error (storage lleno?):', e.message);
  }
}

export function saveSesion() {
  localStorage.setItem(KEYS.sede,      state.sedeActual);
  localStorage.setItem(KEYS.adminPass, state.adminPass);
  localStorage.setItem(KEYS.gasUrl,    state.gasUrl);
  localStorage.setItem(KEYS.gasToken,  state.gasToken);
}

export function saveOfflineQueue() {
  localStorage.setItem(KEYS.offlineQueue, JSON.stringify(state.offlineQueue));
}

// ── Cola offline ──────────────────────────────────────────────────────
export function enqueueOperation(op) {
  // op: { type: 'append'|'upsert', sheet, row, id?, timestamp }
  state.offlineQueue.push({ ...op, enqueuedAt: Date.now() });
  saveOfflineQueue();
}

export function clearOfflineQueue() {
  state.offlineQueue = [];
  saveOfflineQueue();
}

// ── Limpieza total (reset) ────────────────────────────────────────────
export function resetState() {
  state.ventas           = [];
  state.socios           = [];
  state.lockersH         = state.lockersH.map(l => ({ ...l, socio:'', telefono:'', vencimiento:'', email:'' }));
  state.lockersM         = state.lockersM.map(l => ({ ...l, socio:'', telefono:'', vencimiento:'', email:'' }));
  state.packsCafe        = [];
  state.turnos           = [];
  state.egresos          = [];
  state.contactos        = [];
  state.crmNotas         = {};
  state.crmResueltos     = {};
  state.waLog            = [];
  state.historialCambios = [];

  // Limpiar secuencias
  localStorage.removeItem('sc_seq_v24');
  localStorage.removeItem('sc_seq_bn');
  localStorage.removeItem('sc_retiros');

  saveCache();
}
