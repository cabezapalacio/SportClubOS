/**
 * SportClub Tucumán — app.js
 * ===========================
 * Lógica de negocio y UI.
 * Los módulos (config, utils, store, api, sync) se cargan primero
 * y exponen sus funciones via window.SC.
 *
 * Este archivo usa variables globales por compatibilidad con el HTML
 * existente. Las variables de estado son aliases de window.SC.state.
 */

// ── Aliases de módulos (disponibles después de que los módulos carguen) ──
const SC_CONFIG = () => window.SC?.config || {};
const SC_SYNC   = () => window.SC?.sync   || {};

// ── Re-exportar funciones de módulos como globales ────────────────────
// (para que el HTML pueda llamarlas directamente: onclick="genUID()")
function genUID()        { return window.SC?.utils?.genUID()       || Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }
function todayStr()      { return window.SC?.utils?.todayStr()     || new Date().toISOString().slice(0,10); }
function nowTimeStr()    { return window.SC?.utils?.nowTimeStr()   || new Date().toTimeString().slice(0,5); }
function fmt$(n)         { return window.SC?.utils?.fmt$(n)        || '$ ' + (parseFloat(n)||0).toLocaleString('es-AR'); }
function fmtDate(s)      { return window.SC?.utils?.fmtDate(s)     || s; }
function fmtDateTime(ts) { return window.SC?.utils?.fmtDateTime(ts)|| String(ts); }
function parseMonto(v)   { return window.SC?.utils?.parseMonto(v)  || parseFloat(String(v).replace(/[$.]/g,'').replace(',','.'))||0; }
function ventaMonto(v)   { return window.SC?.utils?.ventaMonto(v)  || 0; }
function hashStr(s)      { return window.SC?.utils?.hashStr(s)     || '0'; }

// ── Estado global (aliases de window.SC.state) ────────────────────────
// Estas variables SON window.SC.state.* — se sincronizan automáticamente
// porque son referencias al mismo objeto en memoria.
let ventas, socios, lockersH, lockersM, packsCafe, turnos, egresos;
let contactos, crmNotas, crmResueltos, waLog, productos, historialCambios;
let rolActual = '';
let sedeActual = localStorage.getItem('sc_sede') || 'VIA 24';
let adminPass  = localStorage.getItem('sc_admin_pass') || '1234';

function _initStateAliases() {
  const s = window.SC.state;
  ventas          = s.ventas;
  socios          = s.socios;
  lockersH        = s.lockersH;
  lockersM        = s.lockersM;
  packsCafe       = s.packsCafe;
  turnos          = s.turnos;
  egresos         = s.egresos;
  contactos       = s.contactos;
  crmNotas        = s.crmNotas;
  crmResueltos    = s.crmResueltos;
  waLog           = s.waLog;
  productos       = s.productos;
  historialCambios= s.historialCambios;
  rolActual       = s.rolActual;
  sedeActual      = s.sedeActual;
  adminPass       = s.adminPass;
}

// ── save() centralizado ───────────────────────────────────────────────
// localStorage = cache temporal. La fuente de verdad es el GAS/Sheets.
function _saveLocalCache() {
  if (window.SC?.store) {
    window.SC.store.saveCache();
  } else {
    // fallback mientras cargan los módulos
    try {
      localStorage.setItem('sc_ventas',       JSON.stringify(ventas||[]));
      localStorage.setItem('sc_socios',       JSON.stringify(socios||[]));
      localStorage.setItem('sc_lockers_h',    JSON.stringify(lockersH||[]));
      localStorage.setItem('sc_lockers_m',    JSON.stringify(lockersM||[]));
      localStorage.setItem('sc_packs_cafe',   JSON.stringify(packsCafe||[]));
      localStorage.setItem('sc_turnos',       JSON.stringify(turnos||[]));
      localStorage.setItem('sc_egresos',      JSON.stringify(egresos||[]));
      localStorage.setItem('sc_contactos',    JSON.stringify(contactos||[]));
      localStorage.setItem('sc_crm_notas',    JSON.stringify(crmNotas||{}));
      localStorage.setItem('sc_crm_resueltos',JSON.stringify(crmResueltos||{}));
      localStorage.setItem('sc_wa_log',       JSON.stringify(waLog||[]));
      localStorage.setItem('sc_productos',    JSON.stringify(productos||[]));
      localStorage.setItem('sc_cambios',      JSON.stringify(historialCambios||[]));
    } catch(e) { console.warn('saveLocalCache error:', e.message); }
  }
}

function save() {
  _saveLocalCache();
  if (window.SC?.sync) {
    window.SC.sync.scheduleSave();
  }
}

var saveData = save; // alias

// ── Helpers de UI de sync ─────────────────────────────────────────────
function setSyncStatus(status, msg) {
  if (window.SC?.sync) { window.SC.sync.setSyncStatus(status, msg); return; }
  const el = document.getElementById('sync-status-badge');
  if (!el) return;
  const icons = { online:'🟢', saving:'🟡', loading:'🟡', offline:'🔴', error:'🔴' };
  el.textContent = (icons[status]||'⚪') + ' ' + msg;
}

function updateOnlineStatus() {
  setSyncStatus(navigator.onLine ? 'online' : 'offline',
    navigator.onLine ? 'En línea' : 'Sin conexión');
}

// ── Getters para configuración de DB (ahora usa GAS) ─────────────────
function getGasConfig() {
  return {
    url:   localStorage.getItem('sc_gas_url')   || '',
    token: localStorage.getItem('sc_gas_token') || '',
  };
}

const dbConectado = { get value() { return window.SC?.state?.connected || false; }};
// Para compatibilidad con código que lee dbConectado directamente:
let _dbConectadoGlobal = false;
Object.defineProperty(window, 'dbConectado', {
  get() { return window.SC?.state?.connected || _dbConectadoGlobal; },
  set(v) { _dbConectadoGlobal = v; if (window.SC?.state) window.SC.state.connected = v; },
  configurable: true,
});






// ══════════════════════════════════════════
//  NUMERACIÓN DE COMPROBANTES
// ══════════════════════════════════════════
function getNextNumero(sede) {
  const prefix = sede === 'BARRIO NORTE' ? 'SC-BN-' : 'SC-V24-';
  const key = sede === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24';
  const current = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, current);
  return prefix + String(current).padStart(6, '0');
}

function getNumeroExistente(sede, seq) {
  const prefix = sede === 'BARRIO NORTE' ? 'SC-BN-' : 'SC-V24-';
  return prefix + String(seq).padStart(6, '0');
}

// ══════════════════════════════════════════
//  BLOQUEO DE EDICIÓN DESPUÉS DE 24HS
// ══════════════════════════════════════════
const PASS_ADMIN = '1234'; // misma pass por ahora, se puede cambiar

function ventaBloqueada(v) {
  if (!v.timestamp) return false;
  return (Date.now() - v.timestamp) > 24 * 60 * 60 * 1000;
}

function editarConBloqueo(id) {
  const v = ventas.find(x => x.id === id);
  if (!v) return;
  if (v.anulada) { toast('⚠️ Esta venta está anulada', 'var(--sc-yellow)'); return; }
  if (ventaBloqueada(v)) {
    pedirPass(
      '🔒 Edición bloqueada',
      'Han pasado más de 24hs. Solo administrador puede editar.',
      () => abrirEditar(id)
    );
  } else {
    abrirEditar(id);
  }
}

// ══════════════════════════════════════════
//  ANULACIÓN DE VENTAS
// ══════════════════════════════════════════
// [moved to store.js] let _anularId = null;...

function anularVenta(id) {
  const v = ventas.find(x => x.id === id);
  if (!v) return;
  if (v.anulada) { toast('Ya está anulada', 'var(--muted)'); return; }
  _anularId = id;
  const det = document.getElementById('anular-detalle');
  det.innerHTML = `
    <div style="margin-bottom:8px">
      <span class="comprobante"><strong>${v.numero || '—'}</strong></span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div><div style="font-size:10px;color:var(--muted)">CLIENTE</div><strong>${v.cliente||v.detalle||'—'}</strong></div>
      <div><div style="font-size:10px;color:var(--muted)">MONTO</div><strong style="color:var(--sc-red)">${fmt$(ventaMonto(v))}</strong></div>
      <div><div style="font-size:10px;color:var(--muted)">FECHA</div>${fmtDate(v.fecha)}</div>
    </div>`;
  document.getElementById('anular-quien').value = '';
  document.getElementById('anular-motivo-sel').value = '';
  document.getElementById('anular-motivo-txt').style.display = 'none';
  document.getElementById('anular-motivo-txt').value = '';
  openModal('modal-anular');
}

function toggleMotivoCustom() {
  const sel = document.getElementById('anular-motivo-sel').value;
  document.getElementById('anular-motivo-txt').style.display = sel === 'otro' ? 'block' : 'none';
}

function confirmarAnular() {
  const quien = document.getElementById('anular-quien').value.trim();
  const sel = document.getElementById('anular-motivo-sel').value;
  const motivo = sel === 'otro'
    ? document.getElementById('anular-motivo-txt').value.trim()
    : sel;

  if (!quien) { toast('⚠️ Ingresá quién anula', 'var(--sc-yellow)'); return; }
  if (!motivo) { toast('⚠️ Seleccioná un motivo', 'var(--sc-yellow)'); return; }

  const idx = ventas.findIndex(x => x.id === _anularId);
  if (idx < 0) return;

  ventas[idx].anulada = true;
  ventas[idx]._dirty = true; // marcar para upsert selectivo en Sheets
  ventas[idx].anulacion = {
    quien,
    motivo,
    fecha: todayStr(),
    hora: new Date().toTimeString().slice(0, 5),
    timestamp: Date.now()
  };

  registrarCambio('anular', _anularId,
    `Anulada por ${quien} — Motivo: ${motivo}`,
    'ACTIVA', 'ANULADA'
  );

  save();
  closeModal('modal-anular');
  renderDashboard();
  renderHistorial();
  toast('🟡 Venta anulada y registrada en historial', '#b45309');
  _anularId = null;
}

// ══════════════════════════════════════════
//  CONTRASEÑA IMPORTAR / EXPORTAR
// ══════════════════════════════════════════
const PASS_CORRECTA = '1234';
// [moved to store.js] let _passCallback = null;...

function pedirPass(titulo, desc, callback) {
  _passCallback = callback;
  document.getElementById('pass-titulo').textContent = titulo;
  document.getElementById('pass-desc').textContent = desc;
  document.getElementById('pass-input').value = '';
  document.getElementById('pass-error').style.display = 'none';
  openModal('modal-pass');
  setTimeout(() => document.getElementById('pass-input').focus(), 150);
}

function verificarPass() {
  const val = document.getElementById('pass-input').value;
  if (val === PASS_CORRECTA) {
    closeModal('modal-pass');
    document.getElementById('pass-input').value = '';
    if (_passCallback) { _passCallback(); _passCallback = null; }
  } else {
    const input = document.getElementById('pass-input');
    const err = document.getElementById('pass-error');
    err.style.display = 'block';
    input.classList.remove('shake');
    void input.offsetWidth; // reflow para reiniciar animación
    input.classList.add('shake');
    input.value = '';
    input.focus();
  }
}



// ══════════════════════════════════════════
//  SISTEMA DE ROLES
// ══════════════════════════════════════════
const PASS_ADMIN_ROL = '1234'; // fallback — se usa adminPass si existe
// [moved to store.js] let rolActual = ''; // 'recepcion' | 'admin'...
// [moved to store.js] let _sedePendiente = null;...

function loginComo(rol) {
  if (rol === 'recepcion') {
    document.getElementById('login-pass-wrap').style.display = 'none';
    aplicarRol('recepcion');
  } else {
    document.getElementById('login-pass-wrap').style.display = 'block';
    setTimeout(() => document.getElementById('login-pass').focus(), 100);
  }
}

function confirmarLoginAdmin() {
  const pass = document.getElementById('login-pass').value;
  const passActual = localStorage.getItem('sc_admin_pass') || PASS_ADMIN_ROL;
  if (pass === passActual) {
    aplicarRol('admin');
  } else {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('login-pass').value = '';
  }
}

function aplicarRol(rol) {
  rolActual = rol;
  document.getElementById('login-screen').style.display = 'none';

  const badge = document.getElementById('rol-badge');
  const label = document.getElementById('rol-label');

  if (rol === 'admin') {
    badge.classList.remove('recepcion'); badge.classList.add('admin');
    badge.style.background = 'rgba(204,0,21,.08)';
    badge.style.border = '1px solid rgba(204,0,21,.25)';
    badge.style.color = '#FF1A2E';
    label.textContent = '🔑 ADMINISTRADOR';
    // Mostrar todos los nav items
    document.querySelectorAll('.nav-item-admin').forEach(el => el.style.display = 'flex');
    // Ir al dashboard admin
    goTo('dashboard', document.getElementById('nav-dashboard'));
  } else {
    badge.style.background = 'rgba(245,193,0,.08)';
    badge.style.border = '1px solid rgba(245,193,0,.2)';
    badge.style.color = '#F5C100';
    label.textContent = '👤 RECEPCIÓN';
    // Ocultar items solo admin
    document.querySelectorAll('.nav-item-admin').forEach(el => el.style.display = 'none');
    // Ir al dashboard recepción
    goTo('dash-recepcion', document.getElementById('nav-dash-recepcion'));
  }

  try { setSede(sedeActual); } catch(e) { console.warn('setSede error', e); }
  try { renderDashboard(); }    catch(e) { console.warn('renderDashboard error', e); }
  try { renderDashRecepcion(); } catch(e) { console.warn('renderDashRecepcion error', e); }
  // Inicializar picker de concepto
  setTimeout(function(){
    try { seleccionarConcepto('membresia'); } catch(e) {}
    const uniI = document.getElementById('f-unidades');
    if (uniI) uniI.value = 1;
    const uniW = document.getElementById('f-unidades-wrap');
    if (uniW) uniW.style.display = 'none';
  }, 100);
}

function cerrarSesion() {
  rolActual = '';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-pass-wrap').style.display = 'none';
}

function esAdmin() { return rolActual === 'admin'; }

// ══════════════════════════════════════════
//  CAMBIO DE SEDE CON CONFIRMACIÓN
// ══════════════════════════════════════════
function pedirConfirmSede(sede) {
  _sedePendiente = sede;
  document.getElementById('sede-confirm-nombre').textContent = sede;
  openModal('modal-sede-confirm');
}

function confirmarCambioSede() {
  closeModal('modal-sede-confirm');
  if (_sedePendiente) {
    setSede(_sedePendiente);
    _sedePendiente = null;
  }
}

// ══════════════════════════════════════════
//  RETIROS DE CAJA
// ══════════════════════════════════════════
function calcEfectivoDisponible() {
  const hoy = todayStr();
  const ef = ventas.filter(v => v.fecha === hoy && (!v.sede || v.sede === sedeActual) && !v.anulada)
    .reduce((a, v) => a + (v.efectivo || 0), 0);
  const retirado = ventas.filter(v => v.fecha === hoy && (!v.sede || v.sede === sedeActual)
    && v.concepto === 'retiro' && !v.anulada)
    .reduce((a, v) => a + ventaMonto(v), 0);
  return Math.max(0, ef - retirado);
}

function abrirRetiro() {
  const disp = calcEfectivoDisponible();
  document.getElementById('retiro-disponible').textContent = fmt$(disp);
  document.getElementById('retiro-monto').value = '';
  document.getElementById('retiro-quien').value = '';
  document.getElementById('retiro-obs').value = '';
  openModal('modal-retiro');
}

function confirmarRetiro() {
  const monto = parseFloat(document.getElementById('retiro-monto').value) || 0;
  const quien = document.getElementById('retiro-quien').value.trim();
  const obs   = document.getElementById('retiro-obs').value.trim();

  if (monto <= 0) { toast('⚠️ Ingresá un monto válido', 'var(--sc-yellow)'); return; }
  if (!quien)     { toast('⚠️ Ingresá quién retira', 'var(--sc-yellow)'); return; }

  const disp = calcEfectivoDisponible();
  if (monto > disp) {
    toast(`⚠️ No hay suficiente efectivo (disponible: ${fmt$(disp)})`, 'var(--sc-red)'); return;
  }

  // Crear como venta tipo retiro
  const seq    = parseInt(localStorage.getItem(sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24') || '0') + 1;
  const seqKey = sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24';
  localStorage.setItem(seqKey, seq);
  const prefix = sedeActual === 'BARRIO NORTE' ? 'SC-BN-' : 'SC-V24-';
  const numero = prefix + String(seq).padStart(6, '0');
  const hora   = new Date().toTimeString().slice(0, 5);

  const retiro = {
    id: genUID(), timestamp: Date.now(), numero,
    fecha: todayStr(), hora, sede: sedeActual,
    cliente: quien, detalle: `Retiro — ${quien}${obs?' ('+obs+')':''}`,
    concepto: 'retiro',
    efectivo: 0, transferencia: 0, debito: 0, credito: 0, qr: 0,
    retiros: monto, egresos: 0,
    metodo: 'efectivo', obs,
    anulada: false
  };
  // Para que ventaMonto lo tome como negativo en la caja
  retiro.monto = monto;
  retiro._esRetiro = true;

  ventas.push(retiro);
  registrarCambio('retiro', retiro.id, `Retiro de caja por ${quien}: ${fmt$(monto)}`);
  guardarVentaSheets(retiro).catch(() => {});
  save();
  closeModal('modal-retiro');
  renderDashRecepcion();
  renderDashboard();
  renderRetiros();
  renderVentasRapidasDash();
  toast(`💸 Retiro registrado: ${fmt$(monto)} — ${numero}`);
}

function renderRetiros() {
  const desde = document.getElementById('ret-desde')?.value || '';
  const hasta = document.getElementById('ret-hasta')?.value || todayStr();
  const sede  = document.getElementById('ret-sede')?.value || '';
  const hoy   = todayStr();
  const mes   = hoy.slice(0, 7);

  const retiros = ventas.filter(v =>
    (v.concepto === 'retiro' || v._esRetiro) && !v.anulada &&
    (!desde || v.fecha >= desde) &&
    (v.fecha <= hasta) &&
    (!sede || v.sede === sede)
  ).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

  const hoyRet  = retiros.filter(v => v.fecha === hoy);
  const mesRet  = retiros.filter(v => v.fecha?.startsWith(mes));

  const el_hoy = document.getElementById('ret-hoy');
  const el_mes = document.getElementById('ret-mes');
  const el_cant = document.getElementById('ret-cant');
  if (el_hoy)  el_hoy.textContent  = fmt$(hoyRet.reduce((a, v) => a + ventaMonto(v), 0));
  if (el_mes)  el_mes.textContent  = fmt$(mesRet.reduce((a, v) => a + ventaMonto(v), 0));
  if (el_cant) el_cant.textContent = mesRet.length;

  const tbody = document.getElementById('ret-tbody');
  if (!tbody) return;
  tbody.innerHTML = retiros.map(v => `
    <tr>
      <td>${fmtDate(v.fecha)}</td>
      <td>${v.hora || '—'}</td>
      <td><span class="badge badge-teal" style="font-size:10px">${v.sede || '—'}</span></td>
      <td class="comprobante">${v.numero || '—'}</td>
      <td>${v.cliente || v.detalle || '—'}</td>
      <td><strong style="color:var(--sc-yellow)">${fmt$(ventaMonto(v))}</strong></td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Sin retiros en el período</td></tr>';
}

// ══════════════════════════════════════════
//  DASHBOARD RECEPCIÓN
// ══════════════════════════════════════════
function renderDashRecepcion() {
  const hoy = todayStr();
  const vHoy = ventas.filter(v => v.fecha === hoy && (!v.sede || v.sede === sedeActual) && !v.anulada && v.concepto !== 'egreso' && !v._esGasto && v.concepto !== 'retiro');
  const rHoy = ventas.filter(v => v.fecha === hoy && (!v.sede || v.sede === sedeActual) && !v.anulada && v.concepto === 'retiro');

  const totalHoy  = vHoy.reduce((a, v) => a + ventaMonto(v), 0);
  const efectHoy  = vHoy.reduce((a, v) => a + (v.efectivo || 0), 0);
  const retirado  = rHoy.reduce((a, v) => a + ventaMonto(v), 0);
  const aRendir   = Math.max(0, efectHoy - retirado);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('rec-hoy-total',    fmt$(totalHoy));
  setEl('rec-hoy-trans',    `${vHoy.length} transacción${vHoy.length !== 1 ? 'es' : ''}`);
  setEl('rec-hoy-efectivo', fmt$(efectHoy));
  setEl('rec-a-rendir',     fmt$(aRendir));
  setEl('rec-a-rendir-sub', `Cobrado: ${fmt$(efectHoy)} · Retirado: ${fmt$(retirado)}`);

  // Alertas badge
  const alerts = getAlertas();
  setEl('rec-alertas', alerts.length);

  // Tabla ventas del día
  const conLabel = c => ({ membresia:'Membresía', semestral:'Semestral', anual:'Anual',
    pase_diario:'Pase diario', locker:'Locker', agua:'Agua', cafe:'Café',
    barrita:'Barrita', power:'Power', otro:'Otro' }[c] || c || '—');

  const tbody = document.getElementById('rec-ventas-hoy');
  if (tbody) {
    tbody.innerHTML = [...vHoy].sort((a,b) => (b.hora||'').localeCompare(a.hora||'')).map(v => `
      <tr>
        <td>${v.hora || '—'}</td>
        <td>${v.cliente || v.detalle || '—'}</td>
        <td><span class="badge badge-teal" style="font-size:10px">${conLabel(v.concepto)}</span></td>
        <td><strong>${fmt$(ventaMonto(v))}</strong></td>
        <td style="font-size:11px;color:var(--muted)">${metodoLabel(v.metodo)}</td>
        <td><button class="btn-edit" onclick="imprimirTicketById(${v.id})" title="Imprimir ticket">🖨️</button></td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">Sin ventas hoy</td></tr>';
  }

  // Alerta stock
  try { renderDashStockAlerta(); } catch(e) {}

  // Retiros del día
  const divRet = document.getElementById('rec-retiros-hoy');
  if (divRet) {
    divRet.innerHTML = rHoy.length === 0
      ? '<div style="color:var(--muted);font-size:13px;padding:10px 0">Sin retiros hoy</div>'
      : rHoy.map(v => `
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">
            <div><strong>${v.hora}</strong> · ${v.cliente || 'Retiro'} <span class="comprobante">${v.numero||''}</span></div>
            <strong style="color:var(--sc-yellow)">${fmt$(ventaMonto(v))}</strong>
          </div>`).join('');
  }

  // Ventas rápidas del dashboard
  renderVentasRapidasDash();

  // Alertas en recepción — con WhatsApp
  const alertsEl = document.getElementById('rec-alertas-list');
  if (alertsEl) {
    const top = getAlertasConWA().slice(0, 8);
    alertsEl.innerHTML = top.length === 0
      ? '<div style="color:var(--muted);font-size:12px;padding:10px">Sin alertas 🎉</div>'
      : top.map(a => `
          <div class="alert-item-full ${a.tipo}" style="margin-bottom:8px">
            <div style="flex:1">
              <div style="font-size:12px;font-weight:600">${a.titulo}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${a.desc}</div>
            </div>
            ${a.telefono ? `<a class="btn-wa" href="https://wa.me/549${a.telefono.replace(/\D/g,'')}?text=${encodeURIComponent(a.msgWA)}" target="_blank"
               data-nombre="${(a.titulo||'').replace(/"/g,'')}" data-tel="${a.telefono||''}" data-msg="${encodeURIComponent(a.msgWA||'')}"
               onclick="crmWA(this.dataset.nombre,this.dataset.tel,this.dataset.msg)">💬 WA</a>` : ''}
          </div>`).join('');
  }
}

// ══════════════════════════════════════════
//  ALERTAS POR DÍA DE PAGO — con WhatsApp
// ══════════════════════════════════════════
function getAlertasConWA() {
  const hoy   = new Date(todayStr());
  const alerts = [];

  socios.forEach(s => {
    if (!s.vigencia_hasta) return;
    const venc = new Date(s.vigencia_hasta);
    const dias = Math.round((venc - hoy) / 86400000);

    // Buscar teléfono en el array de contactos
    const contacto = contactos.find(c => c.nombre?.toLowerCase().trim() === s.nombre?.toLowerCase().trim());
    const tel = contacto?.telefono || s.telefono || '';

    const msgWA = dias <= 0
      ? `Hola ${s.nombre.split(' ')[0]}! 👋 Te recordamos que tu membresía en SportClub Tucumán venció el ${fmtDate(s.vigencia_hasta)}. ¡Podés renovarla en recepción! 💪`
      : `Hola ${s.nombre.split(' ')[0]}! 👋 Te avisamos que tu membresía en SportClub Tucumán vence en ${dias} día${dias!==1?'s':''} (${fmtDate(s.vigencia_hasta)}). ¡No te quedes sin entrenar! 💪`;

    if (dias < 0) {
      alerts.push({ tipo: 'critical', titulo: `⚠️ ${s.nombre}`, desc: `Venció hace ${Math.abs(dias)} día${Math.abs(dias)!==1?'s':''}`, telefono: tel, msgWA });
    } else if (dias <= 5) {
      alerts.push({ tipo: 'warning', titulo: `🕐 ${s.nombre}`, desc: `Vence en ${dias} día${dias!==1?'s':''}`, telefono: tel, msgWA });
    }
  });

  return alerts.sort((a, b) => a.tipo === 'critical' ? -1 : 1);
}



// ══════════════════════════════════════════
//  CATÁLOGO DE PRODUCTOS / PRECIOS
// ══════════════════════════════════════════
const PRODUCTOS_DEFAULT = [
  // ─── SERVICIOS ───────────────────────────────────────────
  { key:'membresia',    icon:'🏋️', label:'Membresía',        precio:0,     rapido:true,  esFisico:false, precioManual:true },
  { key:'semestral',    icon:'📅', label:'Semestral',        precio:0,     rapido:true,  esFisico:false, precioManual:true },
  { key:'anual',        icon:'🗓️', label:'Anual',            precio:0,     rapido:false, esFisico:false, precioManual:true },
  { key:'pase_diario',  icon:'🎫', label:'Día de Gym',       precio:20000, rapido:true,  rapidoDash:true,  esFisico:false },
  { key:'sauna',        icon:'🧖', label:'Sauna',            precio:15000, rapido:true,  rapidoDash:true,  esFisico:false },
  { key:'locker',       icon:'🔐', label:'Locker',           precio:0,     rapido:false, esFisico:false, precioManual:true, soloLockers:true },
  // ─── BEBIDAS ────────────────────────────────────────────
  { key:'cafe',         icon:'☕', label:'Café',             precio:2000,  rapido:true,  rapidoDash:true,  esFisico:true, stock:null },
  { key:'pack_cafe',    icon:'☕', label:'Pack 10 Cafés',    precio:15000, rapido:false, esFisico:true, stock:null },
  { key:'monster',      icon:'🟢', label:'Monster',          precio:3000,  rapido:true,  rapidoDash:true,  esFisico:true, stock:null },
  { key:'powerade_gde', icon:'🔵', label:'Powerade Grande',  precio:3500,  rapido:true,  rapidoDash:true,  esFisico:true, stock:null },
  { key:'powerade_chi', icon:'🔵', label:'Powerade Chico',   precio:2500,  rapido:true,  esFisico:true, stock:null },
  { key:'agua',         icon:'💧', label:'Agua',             precio:1000,  rapido:true,  rapidoDash:true,  esFisico:true, stock:null },
  // ─── KIOSCO ─────────────────────────────────────────────
  { key:'turron',       icon:'🍬', label:'Turrón',           precio:500,   rapido:true,  esFisico:true, stock:null },
  { key:'muecas',       icon:'🍭', label:'Muecas',           precio:2000,  rapido:true,  esFisico:true, stock:null },
  { key:'chicle',       icon:'🫧', label:'Chicle',           precio:1000,  rapido:true,  esFisico:true, stock:null },
  { key:'alfajor_tita', icon:'🍫', label:'Alfajor Tita',     precio:1000,  rapido:true,  esFisico:true, stock:null },
  { key:'quelopaleo',   icon:'🌿', label:'Quelopaleo',       precio:1500,  rapido:true,  esFisico:true, stock:null },
  { key:'pack_banio',   icon:'🚿', label:'Pack Baño',        precio:1000,  rapido:true,  rapidoDash:true,  esFisico:true, stock:null },
  // ─── SISTEMA (no modificar) ──────────────────────────────
  { key:'cortesia',     icon:'🎁', label:'Cortesía',         precio:0,     rapido:false, rapidoDash:true,  esFisico:false },
  { key:'ficha_tragada',icon:'🪙', label:'Ficha Tragada',    precio:0,     rapido:false, rapidoDash:true,  esFisico:false },
  { key:'egreso',       icon:'💸', label:'Egreso',           precio:0,     rapido:false, esFisico:false },
  { key:'retiro',       icon:'🏧', label:'Retiro',           precio:0,     rapido:false, esFisico:false },
  { key:'otro',         icon:'➕', label:'Otro',             precio:0,     rapido:false, esFisico:false },
];

// [moved to store.js] let productos = [];...
function loadProductos() {
  const saved = localStorage.getItem('sc_productos');
  if (saved) {
    const p = JSON.parse(saved);
    // Merge defaults + custom guardados
    const merged = PRODUCTOS_DEFAULT.map(def => {
      const s = p.find(x => x.key === def.key);
      return s ? { ...def, ...s } : { ...def };
    });
    // Agregar custom que no son defaults
    const customs = p.filter(x => x.custom && !PRODUCTOS_DEFAULT.some(d => d.key === x.key));
    productos = [...merged, ...customs];
  } else {
    productos = PRODUCTOS_DEFAULT.map(p => ({ ...p }));
  }
}
function saveProductos() {
  localStorage.setItem('sc_productos', JSON.stringify(productos));
  clearTimeout(window._prodSaveTimer);
  window._prodSaveTimer = setTimeout(function(){ if (typeof save==='function') save(); }, 600);
}
// [moved to store.js] var saveData = save; // alias - algunos módulos lo...
function saveSocios() {
  localStorage.setItem(KEYS.socios, JSON.stringify(socios));
}
function addDaysStr(dateStr, dias) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
loadProductos();

function getProducto(key) {
  return productos.find(p => p.key === key) || { label: key, precio: 0, icon: '•' };
}
function getPrecio(key) {
  return getProducto(key).precio || 0;
}

// ══════════════════════════════════════════
//  ACCESOS RÁPIDOS — render
// ══════════════════════════════════════════
function renderQuickButtons() {
  const grid = document.getElementById('quick-grid');
  if (!grid) return;
  const rapidos = productos.filter(p => p.rapido && !p._oculto);
  grid.innerHTML = rapidos.map(p => `
    <div class="quickbtn" id="qb-${p.key}" onclick="seleccionarQuick('${p.key}')">
      <span class="quickbtn-icon">${p.icon}</span>
      <span class="quickbtn-label">${p.label}</span>
      <span class="quickbtn-precio">${p.precio > 0 ? fmt$(p.precio) : '—'}</span>
    </div>`).join('');
}

// ── Fecha: siempre hoy, solo lectura ──
function setFechaHoy() {
  const hoy = todayStr();
  const hidden = document.getElementById('f-fecha');
  const disp   = document.getElementById('f-fecha-display');
  if (hidden) hidden.value = hoy;
  if (disp) {
    const d = new Date(hoy + 'T12:00:00');
    disp.textContent = d.toLocaleDateString('es-AR',
      { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
}

// ── Monto: fijo para productos fisicos, editable para membresias/servicios ──
function aplicarComportamientoMonto(key) {
  const p        = getProducto(key);
  const monto    = document.getElementById('f-monto');
  const hint     = document.getElementById('f-monto-hint');
  const uniWrap  = document.getElementById('f-unidades-wrap');
  const uniInput = document.getElementById('f-unidades');
  if (!monto || !p) return;

  if (p.esFisico) {
    // Producto físico: precio fijo por unidad, mostrar campo unidades
    if (uniInput) { uniInput.value = 1; uniInput.min = 1; }
    if (uniWrap)  uniWrap.style.display = 'block';
    monto.value    = p.precio;
    monto.readOnly = true;
    monto.style.cssText = 'opacity:.65;cursor:not-allowed;background:var(--s3);width:100%';
    if (hint) hint.textContent = `— $${fmt$(p.precio)} × unidades`;
  } else {
    // Servicio/membresía: precio sugerido editable, sin unidades
    if (uniInput) uniInput.value = 1;
    if (uniWrap)  uniWrap.style.display = 'none';
    monto.readOnly = false;
    monto.style.cssText = 'width:100%';
    if (p.precio > 0) {
      monto.value = p.precio;
    } else if (p.precioManual) {
      monto.value = ''; // limpiar para que recepción ingrese el precio
      monto.focus();
    }
    if (hint) hint.textContent = p.precio > 0 ? '— podés modificarlo' : (p.precioManual ? '✏️ Ingresá el precio manualmente' : '');
  }
}

// Cuando el usuario cambia las unidades (solo productos físicos)
function onUnidadesChange() {
  const key      = document.getElementById('f-concepto').value;
  const p        = getProducto(key);
  const uniInput = document.getElementById('f-unidades');
  const monto    = document.getElementById('f-monto');
  if (!p || !p.esFisico || !uniInput || !monto) return;
  const unidades = Math.max(1, parseInt(uniInput.value) || 1);
  uniInput.value = unidades;
  monto.value    = p.precio * unidades;
}

// Cuando el admin edita el monto manualmente (no bloquear la edición en no-físicos)
function onMontoManualChange() {
  // Solo para no-físicos (en físicos el monto está readOnly)
  // No hace nada extra, el valor se lee en registrarVenta
}

// ══════════════════════════════════════════════════════════════
//  SISTEMA DE VENTA RÁPIDA — DASHBOARD
// ══════════════════════════════════════════════════════════════

// Estado interno del popup
// [moved to store.js] let _vrProductoActivo = null;...
// [moved to store.js] let _vrUnidades       = 1;...

// Renderizar los iconos del grid en el dashboard
function renderVentasRapidasDash() {
  const lista = productos.filter(p => p.rapidoDash && p.key !== 'retiro' && p.key !== 'egreso');

  const btnHtml = lista.map(p => `
    <div class="vr-btn" onclick="abrirVentaRapida('${p.key}')" title="${p.label} — ${fmt$(p.precio)}">
      <span class="vr-btn-icon">${p.icon}</span>
      <span class="vr-btn-label">${p.label}</span>
      <span class="vr-btn-precio">${p.precio > 0 ? fmt$(p.precio) : '—'}</span>
    </div>`).join('');

  // Grid admin (section-dashboard)
  const gridA = document.getElementById('vr-dash-grid');
  const wrapA = document.getElementById('vr-dash-wrap');
  if (gridA) {
    gridA.innerHTML = btnHtml;
    if (wrapA) wrapA.style.display = lista.length ? 'block' : 'none';
  }

  // Grid recepción (section-dash-recepcion)
  const gridR = document.getElementById('vr-dash-grid-rec');
  const wrapR = document.getElementById('vr-dash-wrap-rec');
  if (gridR) {
    gridR.innerHTML = btnHtml;
    if (wrapR) wrapR.style.display = lista.length ? 'block' : 'none';
  }
}

// Abrir el popup de métodos de pago para un producto
function abrirVentaRapida(key) {
  const p = productos.find(x => x.key === key);
  if (!p) return;
  _vrProductoActivo = p;
  _vrUnidades       = 1;

  // Quitar overlay anterior si existe
  const prev = document.getElementById('vr-overlay');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.className = 'vr-overlay';
  overlay.id = 'vr-overlay';
  // Click fuera = cerrar
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrarVentaRapida(); });

  overlay.innerHTML = `
    <div class="vr-popup" id="vr-popup">
      <div class="vr-popup-header">
        <span class="vr-popup-icon">${p.icon}</span>
        <div>
          <div class="vr-popup-nombre">${p.label}</div>
          <div class="vr-popup-precio" id="vr-popup-precio">${fmt$(p.precio)}</div>
        </div>
        <button onclick="cerrarVentaRapida()" style="margin-left:auto;background:none;border:none;
          cursor:pointer;font-size:20px;color:var(--muted);padding:4px;border-radius:8px;line-height:1">✕</button>
      </div>

      ${p.esFisico ? `
      <div class="vr-unidades-row">
        <span class="vr-uni-label">Unidades</span>
        <div class="vr-uni-controls">
          <div class="vr-uni-btn" onclick="vrCambiarUnidades(-1)">−</div>
          <div class="vr-uni-val" id="vr-uni-val">1</div>
          <div class="vr-uni-btn" onclick="vrCambiarUnidades(1)">+</div>
        </div>
      </div>` : ''}

      ${p.precio === 0
        ? `<div style="text-align:center;padding:8px 0">
            <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Producto sin costo — se registra como cortesía</div>
            <button onclick="ejecutarVentaRapida('cortesia')" style="width:100%;padding:16px;background:var(--sc-yellow);color:#000;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">🎁 REGISTRAR CORTESÍA</button>
          </div>`
        : `<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px">¿Cómo paga?</div>
          <div class="vr-metodos-grid">
            <div class="vr-metodo-btn efectivo" onclick="ejecutarVentaRapida('efectivo')">
              <span class="vr-metodo-icn">💵</span><span class="vr-metodo-label">Efectivo</span><span class="vr-metodo-sub">En mano</span>
            </div>
            <div class="vr-metodo-btn transf" onclick="ejecutarVentaRapida('transferencia')">
              <span class="vr-metodo-icn">🏦</span><span class="vr-metodo-label">Transferencia</span><span class="vr-metodo-sub">Banco / alias</span>
            </div>
            <div class="vr-metodo-btn credito" onclick="ejecutarVentaRapida('credito')">
              <span class="vr-metodo-icn">💳</span><span class="vr-metodo-label">Tarjeta</span><span class="vr-metodo-sub">Débito / crédito</span>
            </div>
            <div class="vr-metodo-btn qr" onclick="ejecutarVentaRapida('qr')">
              <span class="vr-metodo-icn">📱</span><span class="vr-metodo-label">QR / MP</span><span class="vr-metodo-sub">Mercado Pago</span>
            </div>
          </div>`}
    </div>`;

  document.body.appendChild(overlay);
}

// Cambiar unidades desde el popup
function vrCambiarUnidades(delta) {
  const p = _vrProductoActivo;
  if (!p) return;
  _vrUnidades = Math.max(1, _vrUnidades + delta);
  const valEl    = document.getElementById('vr-uni-val');
  const precioEl = document.getElementById('vr-popup-precio');
  if (valEl)    valEl.textContent    = _vrUnidades;
  if (precioEl) precioEl.textContent = fmt$(p.precio * _vrUnidades);
}

// Cerrar el popup
function cerrarVentaRapida() {
  const ov = document.getElementById('vr-overlay');
  if (ov) {
    ov.style.opacity = '0';
    ov.style.transition = 'opacity .15s';
    setTimeout(() => ov.remove(), 150);
  }
  _vrProductoActivo = null;
  _vrUnidades       = 1;
}

// Ejecutar la venta con el método seleccionado
function nuevaVentaSocio(nombre) {
  const historial = socios.filter(s => s.nombre === nombre)
    .sort((a,b) => b.fecha_pago.localeCompare(a.fecha_pago));
  const ultimo   = historial[0];
  const concepto = (ultimo?.concepto && ['membresia','semestral','anual'].includes(ultimo.concepto))
    ? ultimo.concepto : 'membresia';
  goTo('registrar', document.getElementById('nav-registrar'));
  setTimeout(() => {
    const fCliente = document.getElementById('f-cliente');
    if (fCliente) { fCliente.value = nombre; }
    seleccionarConcepto(concepto);
    aplicarComportamientoMonto(concepto);
    // Dejar monto en blanco para que el operador escriba el nuevo precio
    const fMonto = document.getElementById('f-monto');
    if (fMonto) {
      fMonto.value = '';
      fMonto.placeholder = ultimo?.monto ? 'Último: ' + fmt$(ultimo.monto) : 'Ingresá el monto';
      fMonto.style.borderColor = 'var(--sc-yellow)';
      setTimeout(() => { fMonto.style.borderColor = ''; }, 3000);
    }
    fMonto?.focus();
    toast('🔄 Renovar ' + nombre + ' — ingresá el monto', 'var(--sc-yellow)');
  }, 150);
}


function ejecutarVentaRapida(metodo) {
  const p = _vrProductoActivo;
  if (!p) return;

  const monto    = p.precio * _vrUnidades;
  const unidades = _vrUnidades;

  // Cortesía precio 0 es válido
  if (monto < 0) { toast('⚠️ Monto inválido', 'var(--sc-yellow)'); cerrarVentaRapida(); return; }

  // Construir objeto venta
  const seq    = parseInt(localStorage.getItem(sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24') || '0') + 1;
  const seqKey = sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24';
  localStorage.setItem(seqKey, seq);
  const prefix = sedeActual === 'BARRIO NORTE' ? 'SC-BN-' : 'SC-V24-';
  const numero = prefix + String(seq).padStart(6, '0');
  const hora   = new Date().toTimeString().slice(0, 5);

  const v = {
    id: genUID(), timestamp: Date.now(),
    numero, fecha: todayStr(), hora,
    sede: sedeActual, cliente: '',
    detalle: unidades > 1 ? `${p.label} ×${unidades}` : p.label,
    concepto: p.key,
    efectivo:      metodo === 'efectivo'      ? monto : 0,
    transferencia: metodo === 'transferencia' ? monto : 0,
    debito:        metodo === 'debito'        ? monto : 0,
    credito:       metodo === 'credito'       ? monto : 0,
    qr:            metodo === 'qr'            ? monto : 0,
    monto, unidades, metodo,
    estado: 'cobrado', obs: '',
    anulada: false, _vrFast: true,
  };

  ventas.push(v);
  save();
  guardarVentaSheets(v).catch(() => {});
  descontarStock(p.key, unidades);
  cerrarVentaRapida();
  renderDashRecepcion();
  if (document.getElementById('section-dashboard')?.classList.contains('active')) renderDashboard();

  // Toast con resumen
  const metodosIconos = { efectivo:'💵', transferencia:'🏦', debito:'💳', credito:'💳', qr:'📱' };
  toast(`${p.icon} ${p.label}${unidades>1?` ×${unidades}`:''} — ${fmt$(monto)} ${metodosIconos[metodo]||''}`,'var(--green)');
}

function seleccionarQuick(key) {
  seleccionarConcepto(key);
  aplicarComportamientoMonto(key);
  document.querySelectorAll('.quickbtn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('qb-' + key);
  if (btn) btn.classList.add('active');
  document.getElementById('f-cliente').focus();
}


// ══════════════════════════════════════════
//  PICKER DE CONCEPTO
// ══════════════════════════════════════════
// [moved to store.js] var _pickerOpen = false;...

function abrirPickerConcepto() {
  var dd = document.getElementById('concepto-picker-dropdown');
  if (!dd) return;
  _pickerOpen = !dd.style.display || dd.style.display === 'none';
  dd.style.display = _pickerOpen ? 'block' : 'none';
  if (_pickerOpen) {
    renderPickerConcepto('');
    var srch = document.getElementById('concepto-search');
    if (srch) { srch.value = ''; setTimeout(function(){ srch.focus(); }, 50); }
  }
}

function cerrarPickerConcepto() {
  var dd = document.getElementById('concepto-picker-dropdown');
  if (dd) dd.style.display = 'none';
  _pickerOpen = false;
}

function filtrarPickerConcepto(q) {
  renderPickerConcepto(q);
}

function renderPickerConcepto(q) {
  var lista = document.getElementById('concepto-picker-list');
  if (!lista) return;
  var selActual = (document.getElementById('f-concepto')||{}).value || '';
  var filtrados = productos.filter(function(p) {
    if (p.key === 'retiro') return false;
    if (!q) return true;
    return (p.label+' '+p.key+' '+(p.desc||'')).toLowerCase().includes(q.toLowerCase());
  });
  if (!filtrados.length) {
    lista.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:12px;text-align:center">Sin resultados</div>';
    return;
  }
  lista.innerHTML = '';
  filtrados.forEach(function(p) {
    var activo = selActual === p.key;
    var precio = p.precio > 0 ? (' — $' + p.precio.toLocaleString('es-AR')) : '';
    var div = document.createElement('div');
    div.setAttribute('data-key', p.key);
    div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .1s;' + (activo ? 'background:var(--s3)' : '');
    div.innerHTML = '<span style="font-size:18px;flex-shrink:0">' + p.icon + '</span>'
      + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">' + p.label + '</div>'
      + (p.desc ? '<div style="font-size:11px;color:var(--muted)">' + p.desc + '</div>' : '')
      + '</div>'
      + '<span style="font-size:11px;color:var(--muted);flex-shrink:0">' + precio + '</span>';
    div.addEventListener('mouseenter', function(){ this.style.background='var(--s3)'; });
    div.addEventListener('mouseleave', function(){ this.style.background = activo ? 'var(--s3)' : ''; });
    div.addEventListener('click', function(){ seleccionarConcepto(this.getAttribute('data-key')); });
    lista.appendChild(div);
  });
}
function seleccionarConcepto(key) {
  var p = getProducto(key);
  if (!p) return;
  // Actualizar hidden input
  document.getElementById('f-concepto').value = key;
  // Actualizar label visible
  var lbl = document.getElementById('f-concepto-label');
  if (lbl) lbl.innerHTML = p.icon + ' ' + p.label;
  // Cerrar dropdown
  cerrarPickerConcepto();
  // Trigger comportamiento
  aplicarComportamientoMonto(key);
  document.querySelectorAll('.quickbtn').forEach(function(b){ b.classList.remove('active'); });
  var btn = document.getElementById('qb-' + key);
  if (btn) btn.classList.add('active');
}

// Cerrar picker al hacer click fuera
document.addEventListener('click', function(e) {
  var picker = document.getElementById('concepto-picker-dropdown');
  var display = document.getElementById('f-concepto-display');
  if (!picker || !display) return;
  if (!picker.contains(e.target) && !display.contains(e.target)) {
    cerrarPickerConcepto();
  }
});

function onConceptoChange() {
  const key = document.getElementById('f-concepto').value;
  aplicarComportamientoMonto(key);
  document.querySelectorAll('.quickbtn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('qb-' + key);
  if (btn) btn.classList.add('active');
}


// ══════════════════════════════════════════
//  RESUMEN DE TURNO
// ══════════════════════════════════════════
function abrirResumenTurno() {
  const hoy    = todayStr();
  const sede   = sedeActual;
  const vHoy   = ventas.filter(v => v.fecha === hoy && (!v.sede || v.sede === sede) && !v.anulada && v.concepto !== 'retiro');
  const rHoy   = ventas.filter(v => v.fecha === hoy && (!v.sede || v.sede === sede) && !v.anulada && (v.concepto === 'retiro' || v._esRetiro));

  const totalEf  = vHoy.reduce((a, v) => a + (v.efectivo    || 0), 0);
  const totalTr  = vHoy.reduce((a, v) => a + (v.transferencia||0), 0);
  const totalDeb = vHoy.reduce((a, v) => a + (v.debito      || 0), 0);
  const totalCred= vHoy.reduce((a, v) => a + (v.credito     || 0), 0);
  const totalQR  = vHoy.reduce((a, v) => a + (v.qr          || 0), 0);
  const totalRet = rHoy.reduce((a, v) => a + ventaMonto(v), 0);
  const totalBruto = vHoy.reduce((a, v) => a + ventaMonto(v), 0);
  const aRendir  = Math.max(0, totalEf - totalRet);

  // Por concepto
  const porConcepto = {};
  vHoy.forEach(v => {
    const k = v.concepto || 'otro';
    porConcepto[k] = (porConcepto[k] || 0) + ventaMonto(v);
  });

  document.getElementById('turno-subtitulo').textContent =
    `${sede} · ${new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })}`;

  document.getElementById('turno-body').innerHTML = `
    <!-- Totales por método -->
    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Por método de pago</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${totalEf   ? `<span class="turno-metodo-chip">💵 Efectivo <strong style="margin-left:4px">${fmt$(totalEf)}</strong></span>` : ''}
        ${totalTr   ? `<span class="turno-metodo-chip">🏦 Transf. <strong style="margin-left:4px">${fmt$(totalTr)}</strong></span>` : ''}
        ${totalDeb  ? `<span class="turno-metodo-chip">💳 Débito <strong style="margin-left:4px">${fmt$(totalDeb)}</strong></span>` : ''}
        ${totalCred ? `<span class="turno-metodo-chip">💳 Crédito <strong style="margin-left:4px">${fmt$(totalCred)}</strong></span>` : ''}
        ${totalQR   ? `<span class="turno-metodo-chip">📱 QR <strong style="margin-left:4px">${fmt$(totalQR)}</strong></span>` : ''}
        ${!totalBruto ? '<span style="color:var(--muted);font-size:12px">Sin ventas registradas</span>' : ''}
      </div>
    </div>

    <!-- Filas de resumen -->
    <div class="turno-fila"><span>Ventas registradas</span><strong>${vHoy.length}</strong></div>
    <div class="turno-fila"><span>Total bruto recaudado</span><strong style="color:var(--green)">${fmt$(totalBruto)}</strong></div>
    <div class="turno-fila"><span>Retiros realizados (${rHoy.length})</span><strong style="color:var(--sc-yellow)">- ${fmt$(totalRet)}</strong></div>

    <!-- Por concepto top 5 -->
    ${Object.entries(porConcepto).length ? `
    <div style="margin:12px 0 8px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Por producto</div>
    ${Object.entries(porConcepto).sort(([,a],[,b])=>b-a).slice(0,5).map(([k,v])=>`
      <div class="turno-fila" style="padding:7px 0">
        <span>${getProducto(k).icon || ''} ${getProducto(k).label || k}</span>
        <span>${fmt$(v)}</span>
      </div>`).join('')}` : ''}

    <!-- Total a rendir -->
    <div class="turno-total">
      <span>💵 EFECTIVO A RENDIR</span>
      <span>${fmt$(aRendir)}</span>
    </div>

    <!-- Retiros detalle -->
    ${rHoy.length ? `
    <div style="margin-top:12px;font-size:11px;color:var(--muted)">
      <div style="margin-bottom:6px;font-size:10px;text-transform:uppercase;letter-spacing:1px">Retiros del turno</div>
      ${rHoy.map(r=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
        <span>${r.hora} · ${r.cliente || 'Retiro'}</span>
        <strong style="color:var(--sc-yellow)">${fmt$(ventaMonto(r))}</strong>
      </div>`).join('')}
    </div>` : ''}
  `;

  // Guardar para imprimir
  window._turnoData = { sede, totalBruto, totalEf, totalTr, totalDeb, totalCred, totalQR, totalRet, aRendir, vHoy, rHoy, porConcepto };
  openModal('modal-turno');
}

function imprimirTurno() {
  const d = window._turnoData;
  if (!d) return;
  const now = new Date().toLocaleString('es-AR');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page{size:A4;margin:20mm}
    body{font-family:Arial,sans-serif;font-size:13px;color:#000}
    h1{font-size:22px;margin-bottom:4px}
    .sub{color:#555;font-size:12px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    td,th{padding:8px 10px;border-bottom:1px solid #ddd;text-align:left}
    th{background:#f5f5f5;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
    .total-row td{font-size:18px;font-weight:900;border-top:2px solid #000;padding-top:12px}
    .right{text-align:right}
  </style></head><body>
  <h1>📋 Resumen del turno — ${d.sede}</h1>
  <div class="sub">Generado el ${now}</div>
  <table>
    <tr><th>Concepto</th><th class="right">Monto</th></tr>
    <tr><td>Ventas registradas</td><td class="right">${d.vHoy.length}</td></tr>
    <tr><td>💵 Efectivo cobrado</td><td class="right">${fmt$(d.totalEf)}</td></tr>
    <tr><td>🏦 Transferencias</td><td class="right">${fmt$(d.totalTr)}</td></tr>
    <tr><td>💳 Débito</td><td class="right">${fmt$(d.totalDeb)}</td></tr>
    <tr><td>💳 Crédito</td><td class="right">${fmt$(d.totalCred)}</td></tr>
    <tr><td>📱 QR / MercadoPago</td><td class="right">${fmt$(d.totalQR)}</td></tr>
    <tr><td><strong>Total bruto</strong></td><td class="right"><strong>${fmt$(d.totalBruto)}</strong></td></tr>
    <tr><td>Retiros de caja (${d.rHoy.length})</td><td class="right">- ${fmt$(d.totalRet)}</td></tr>
    <tr class="total-row"><td>💵 EFECTIVO A RENDIR</td><td class="right">${fmt$(d.aRendir)}</td></tr>
  </table>
  ${d.rHoy.length ? `<h3>Detalle de retiros</h3><table>
    <tr><th>Hora</th><th>Responsable</th><th>Comprobante</th><th class="right">Monto</th></tr>
    ${d.rHoy.map(r=>`<tr><td>${r.hora}</td><td>${r.cliente||'—'}</td><td>${r.numero||'—'}</td><td class="right">${fmt$(ventaMonto(r))}</td></tr>`).join('')}
  </table>` : ''}
  </body></html>`;
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) { toast('⚠️ Activá los popups para imprimir', 'var(--sc-yellow)'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ══════════════════════════════════════════
//  CALENDARIO DE VENCIMIENTOS
// ══════════════════════════════════════════
// [moved to store.js] let calAño  = new Date().getFullYear();...
// [moved to store.js] let calMesN = new Date().getMonth(); // 0-11...
// [moved to store.js] let vencPorDia = {}; // cache global del mes actua...

function calMes(delta) {
  calMesN += delta;
  if (calMesN > 11) { calMesN = 0;  calAño++; }
  if (calMesN < 0)  { calMesN = 11; calAño--; }
  renderCalendario();
}

function renderCalendario() {
  const tit = document.getElementById('cal-titulo');
  if (!tit) return;

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  tit.textContent = `${MESES[calMesN]} ${calAño}`;

  // Calcular vencimientos por día del mes (membresías + lockers)
  const mesStr = `${calAño}-${String(calMesN+1).padStart(2,'0')}`;
  vencPorDia = {};
  // Membresías
  socios.forEach(s => {
    if (!s.vigencia_hasta || s.vigencia_hasta.slice(0,7) !== mesStr) return;
    if (!vencPorDia[s.vigencia_hasta]) vencPorDia[s.vigencia_hasta] = [];
    vencPorDia[s.vigencia_hasta].push({ nombre: s.nombre, tipo: 'membresia', tel: s.telefono || '' });
  });
  // Lockers
  [...(lockersH||[]), ...(lockersM||[])].forEach(l => {
    if (!l.vencimiento || !l.socio || l.vencimiento.slice(0,7) !== mesStr) return;
    if (!vencPorDia[l.vencimiento]) vencPorDia[l.vencimiento] = [];
    vencPorDia[l.vencimiento].push({ nombre: l.socio + ' (locker #' + l.numero + ')', tipo: 'locker', tel: l.telefono || '' });
  });

  const totalMes = Object.values(vencPorDia).reduce((a, v) => a + v.length, 0);
  document.getElementById('cal-total-mes').textContent =
    totalMes ? `${totalMes} vencimiento${totalMes !== 1 ? 's' : ''} este mes` : 'Sin vencimientos este mes';

  // Construir grilla
  const primerDia = new Date(calAño, calMesN, 1).getDay(); // 0=Dom
  const diasEnMes = new Date(calAño, calMesN + 1, 0).getDate();
  const hoyStr    = todayStr();

  let celdas = '';
  // Celdas vacías al inicio
  for (let i = 0; i < primerDia; i++) {
    celdas += '<div class="cal-day vacio"></div>';
  }

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const dStr   = `${calAño}-${String(calMesN+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const socsDay= vencPorDia[dStr] || [];
    const n      = socsDay.length;
    const esHoy  = dStr === hoyStr;

    let nivel = '';
    if      (n >= 10) nivel = 'nivel-4 tiene-venc';
    else if (n >= 6)  nivel = 'nivel-3 tiene-venc';
    else if (n >= 3)  nivel = 'nivel-2 tiene-venc';
    else if (n >= 1)  nivel = 'nivel-1 tiene-venc';

    const tooltip = n ? `<div class="cal-tooltip">${n} vencimiento${n!==1?'s':''}<br>${socsDay.slice(0,4).map(s=>(s.nombre||s)+(s.tipo==='locker'?' 🔐':'')).join('<br>')}${n>4?'<br>...':''}</div>` : '';

    const dotColor = n >= 6 ? 'crit' : 'warn';

    celdas += `
      <div class="cal-day ${nivel} ${esHoy?'hoy':''}" ${n?`onclick="verDiaCalendario('${dStr}')" title="${n} vencimiento${n!==1?'s':''}"`:''}>
        ${tooltip}
        <span>${dia}</span>
        ${n ? `<span class="cal-dot ${dotColor}">${n}</span>` : ''}
      </div>`;
  }

  document.getElementById('cal-grid').innerHTML = celdas;
  // Ocultar detalle al cambiar mes
  document.getElementById('cal-detalle').style.display = 'none';
}

function verDiaCalendario(dStr) {
  // vencPorDia es global - se llena en renderCalendario
  const socsDay = (vencPorDia[dStr] && vencPorDia[dStr].length)
    ? vencPorDia[dStr]
    : socios.filter(s => s.vigencia_hasta === dStr).map(s => ({ nombre: s.nombre, tipo: 'membresia', tel: s.telefono||'' }));
  if (!socsDay.length) return;

  const det    = document.getElementById('cal-detalle');
  const titulo = document.getElementById('cal-detalle-titulo');
  const lista  = document.getElementById('cal-detalle-lista');

  titulo.textContent = `Vencimientos del ${fmtDate(dStr)} (${socsDay.length})`;
  lista.innerHTML = socsDay.map(s => {
    const sNombre = s.nombre || s;
    const sTipo   = s.tipo || 'membresia';
    const contacto = contactos.find(c => c.nombre?.toLowerCase().trim() === (sNombre).toLowerCase().trim());
    const tel = s.tel || contacto?.telefono || '';
    const msg = encodeURIComponent(`Hola ${s.nombre.split(' ')[0]}! 👋 Tu membresía en SportClub Tucumán vence el ${fmtDate(dStr)}. ¡Pasate por recepción para renovar! 💪`);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 0;border-bottom:1px solid var(--border);gap:10px">
        <div>
          <div style="font-weight:600;font-size:13px">${s.nombre}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            Último pago: ${fmtDate(s.fecha_pago)} · ${fmt$(s.monto)}
          </div>
        </div>
        ${tel
          ? `<a class="btn-wa" href="https://wa.me/549${tel.replace(/\D/g,'')}?text=${msg}"
               target="_blank"
               data-nombre="${s.nombre.replace(/"/g,'&quot;')}" data-tel="${tel}" data-msg="${encodeURIComponent(s.vigencia_hasta)}" onclick="crmWA(this.dataset.nombre,this.dataset.tel,'${encodeURIComponent(msg)}')">
               💬 WA
             </a>`
          : '<span style="font-size:11px;color:var(--muted)">Sin tel.</span>'
        }
      </div>`;
  }).join('');

  det.style.display = 'block';
  det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ══════════════════════════════════════════
//  CRM — SEGUIMIENTO DE SOCIOS
// ══════════════════════════════════════════
// [moved to store.js] let crmNotas = JSON.parse(localStorage.getItem('sc...
// { 'nombre_socio': [ { fecha, hora, texto, tipo } ] }

function saveCrmNotas() {
  localStorage.setItem('sc_crm_notas', JSON.stringify(crmNotas));
  clearTimeout(window._crmSaveTimer);
  window._crmSaveTimer = setTimeout(function(){ if (typeof save==='function') save(); }, 800);
}

function setCrmFiltro(filtro, btn) {
  crmFiltro = filtro;
  document.querySelectorAll('.crm-filtro-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAlertas();
}

function agregarNotaCRM(nombre) {
  const inputId  = 'crm-nota-' + btoa(nombre).replace(/=/g,'');
  const input    = document.getElementById(inputId);
  const selectId = 'crm-cat-' + btoa(nombre).replace(/=/g,'');
  const select   = document.getElementById(selectId);
  const texto    = input?.value?.trim();
  const categoria= select?.value || 'nota';

  if (!texto) { toast('⚠️ Escribí una nota primero', 'var(--sc-yellow)'); return; }

  if (!crmNotas[nombre]) crmNotas[nombre] = [];
  crmNotas[nombre].unshift({
    fecha: todayStr(),
    hora:  new Date().toTimeString().slice(0,5),
    texto,
    tipo:  categoria,
    autor: rolActual === 'admin' ? 'Admin' : 'Recepción'
  });
  saveCrmNotas();
  if (input)  input.value  = '';
  if (select) select.value = 'nota';
  renderAlertas();
  toast('✅ Nota guardada');
}

function agregarNotaCRMLocker(lkKey, selectId, inputId) {
  const input    = document.getElementById(inputId);
  const select   = document.getElementById(selectId);
  const texto    = input?.value?.trim();
  const categoria= select?.value || 'nota';
  if (!texto) { toast('⚠️ Escribí una nota primero', 'var(--sc-yellow)'); return; }
  if (!crmNotas[lkKey]) crmNotas[lkKey] = [];
  crmNotas[lkKey].unshift({
    fecha: todayStr(), hora: new Date().toTimeString().slice(0,5),
    texto, tipo: categoria,
    autor: rolActual === 'admin' ? 'Admin' : 'Recepción'
  });
  saveCrmNotas();
  if (input)  input.value  = '';
  if (select) select.value = 'nota';
  renderAlertas();
  toast('✅ Nota guardada');
}


// Helper: llamado desde botones WA del CRM con data-attributes
function crmWA(nombre, tel, msg) {
  const decoded = decodeURIComponent(msg);
  const wn = normalizarTelWA(tel);
  if (wn) {
    window.open('https://wa.me/' + wn + '?text=' + encodeURIComponent(decoded), '_blank');
  } else {
    toast('⚠️ Número inválido para WhatsApp', 'var(--sc-yellow)');
  }
  registrarWACRM(nombre, tel, decoded);
}
function registrarWACRM(nombre, telefono, mensaje) {
  if (!crmNotas[nombre]) crmNotas[nombre] = [];
  crmNotas[nombre].unshift({
    fecha:  todayStr(),
    hora:   new Date().toTimeString().slice(0,5),
    texto:  `WA enviado: "${mensaje.slice(0,60)}${mensaje.length>60?'…':''}"`,
    tipo:   'wa',
    autor:  rolActual === 'admin' ? 'Admin' : 'Recepción'
  });
  saveCrmNotas();
  registrarContactoWA(nombre, telefono, mensaje);
  renderAlertas();
}

function getUltimoContacto(nombre) {
  const notas = crmNotas[nombre] || [];
  return notas.find(n => n.tipo === 'wa') || null;
}

// Resueltos — ocultar de alertas por 7 días
// [moved to store.js] let crmResueltos = JSON.parse(localStorage.getItem...
function saveCrmResueltos() {
  localStorage.setItem('sc_crm_resueltos', JSON.stringify(crmResueltos));
}
function marcarResuelto(nombre) {
  const hasta = new Date();
  hasta.setDate(hasta.getDate() + 7);
  const hastaStr = hasta.getFullYear()+'-'+String(hasta.getMonth()+1).padStart(2,'0')+'-'+String(hasta.getDate()).padStart(2,'0');
  crmResueltos[nombre] = { hasta: hastaStr, fecha: todayStr(), hora: new Date().toTimeString().slice(0,5) };
  if (!crmNotas[nombre]) crmNotas[nombre] = [];
  crmNotas[nombre].unshift({
    fecha: todayStr(), hora: new Date().toTimeString().slice(0,5),
    texto: `Marcado como RESUELTO — oculto hasta el ${fmtDate(hastaStr)}`,
    tipo: 'resuelto', autor: rolActual === 'admin' ? 'Admin' : 'Recepción'
  });
  saveCrmResueltos(); saveCrmNotas();
  renderAlertas();
  toast(`✔ ${nombre} — resuelto por 7 días`);
}
function desmarcarResuelto(nombre) {
  delete crmResueltos[nombre]; saveCrmResueltos(); renderAlertas();
  toast(`↩️ ${nombre} vuelve a las alertas`);
}
function estaResuelto(nombre) {
  const r = crmResueltos[nombre];
  if (!r) return false;
  if (r.hasta < todayStr()) { delete crmResueltos[nombre]; saveCrmResueltos(); return false; }
  return true;
}

const CRM_CATS = [
  { value:'nota',        label:'📝 Nota general',   color:'var(--sc-yellow)' },
  { value:'llamo',       label:'📞 Llamó',          color:'#60A5FA' },
  { value:'no_contesta', label:'📵 No contesta',    color:'var(--muted)' },
  { value:'va_renovar',  label:'✅ Va a renovar',   color:'var(--green)' },
  { value:'no_renueva',  label:'❌ No renueva',     color:'var(--sc-red)' },
  { value:'wa',          label:'💬 WA enviado',     color:'#25D366' },
  { value:'no_insistir',  label:'🚫 No insistir',   color:'var(--sc-red)' },
  { value:'renovado',     label:'✅ Renovado',       color:'var(--green)' },
  { value:'volvio',       label:'🎉 Volvió!',        color:'#F59E0B' },
  { value:'resuelto',    label:'🔒 Resuelto',       color:'#A855F7' },
];
function catConfig(tipo) { return CRM_CATS.find(c => c.value === tipo) || CRM_CATS[0]; }

// [moved to store.js] let crmFiltro = 'todos';...

function renderAlertas() {
  const hoy = todayStr();
  const q   = (document.getElementById('crm-search')?.value || '').toLowerCase();
  const sedeFiltro = (document.getElementById('crm-sede')?.value || sedeActual || '');
  const items = [];

  socios.forEach(s => {
    if (sedeFiltro && s.sede && s.sede !== sedeFiltro) return; // filtrar por sede
    if (!s.vigencia_hasta) return;
    if (q && !s.nombre?.toLowerCase().includes(q)) return;
    if (estaResuelto(s.nombre) && crmFiltro !== 'resuelto') return;
    const dias = Math.round((new Date(s.vigencia_hasta+'T00:00:00') - new Date(hoy+'T00:00:00')) / 86400000);
    let tipo = null;
    if (dias < 0) tipo = 'vencido';
    else if (dias <= 2) tipo = 'urgente';
    else if (dias <= 5) tipo = 'proximo';
    if (!tipo) return;
    const contacto = contactos.find(c => c.nombre?.toLowerCase().trim() === s.nombre?.toLowerCase().trim());
    const tel = contacto?.telefono || s.telefono || '';
    const notas = crmNotas[s.nombre] || [];
    const ultWA = notas.find(n => n.tipo === 'wa');
    const contactadoHoy = ultWA?.fecha === hoy;
    const ultimaNota = notas[0] || null;
    if (crmFiltro === 'vencido'      && tipo !== 'vencido')  return;
    if (crmFiltro === 'urgente'      && tipo !== 'urgente')  return;
    if (crmFiltro === 'proximo'      && tipo !== 'proximo')  return;
    if (crmFiltro === 'sin_contacto' && contactadoHoy)       return;
    if (crmFiltro === 'resuelto'     && !estaResuelto(s.nombre)) return;
    items.push({ s, dias, tipo, tel, notas, contactadoHoy, ultimaNota });
  });

  const lockAlerts = [];
  [...lockersH, ...lockersM].forEach(l => {
    if (!l.socio || !l.vencimiento) return;
    const dias = Math.round((new Date(l.vencimiento+'T00:00:00') - new Date(hoy+'T00:00:00')) / 86400000);
    if (dias < 0 || dias <= 7) lockAlerts.push({ l, dias });
  });

  // KPIs globales sin filtro
  let kpiVenc = 0, kpiProx = 0;
  socios.forEach(s => {
    if (!s.vigencia_hasta || estaResuelto(s.nombre)) return;
    const dias = Math.round((new Date(s.vigencia_hasta+'T00:00:00') - new Date(hoy+'T00:00:00')) / 86400000);
    if (dias < 0) kpiVenc++;
    else if (dias <= 5) kpiProx++;
  });
  const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setEl('crm-kpi-vencidos', kpiVenc);
  setEl('crm-kpi-proximos', kpiProx);
  setEl('crm-kpi-contactados', new Set(waLog.filter(w => w.fecha === hoy).map(w => w.nombre)).size);
  const totalAlerts = kpiVenc + kpiProx + lockAlerts.length;
  const badge = document.getElementById('alerts-badge');
  if (badge) { badge.textContent = totalAlerts; badge.style.display = totalAlerts ? 'inline' : 'none'; }
  const dAlerts = document.getElementById('d-alertas');
  if (dAlerts) dAlerts.textContent = totalAlerts;
  // Ranking CRM
  try { renderCRMRanking(); } catch(e) {}

  const cont = document.getElementById('alertas-container');
  if (!cont) return;

  if (!items.length && !lockAlerts.length) {
    cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:12px">🎉</div>
      <div style="font-size:18px;font-weight:600;color:var(--text)">Sin alertas pendientes</div>
      <div style="margin-top:6px">${crmFiltro !== 'todos' ? 'Probá cambiando el filtro' : 'Todos los socios están al día'}</div>
    </div>`;
    return;
  }

  items.sort((a, b) => a.dias - b.dias);
  let out = '';

  if (items.length) {
    out += `<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">👥 Membresías (${items.length})</div>`;

    items.forEach(({ s, dias, tipo, tel, notas, contactadoHoy, ultimaNota }) => {
      const inputId  = 'crm-nota-' + btoa(s.nombre).replace(/=/g,'');
      const selectId = 'crm-cat-'  + btoa(s.nombre).replace(/=/g,'');
      const resuelto = estaResuelto(s.nombre);
      const badgeClass = tipo === 'vencido' ? 'vencido' : tipo === 'urgente' ? 'urgente' : 'proximo';
      const badgeTxt = dias < 0 ? `Venció hace ${Math.abs(dias)}d` : dias === 0 ? 'Vence HOY' : `Vence en ${dias}d`;
      const msg = dias < 0
        ? `Hola ${s.nombre.split(' ')[0]}! 👋 Tu membresía en SportClub Tucumán venció el ${fmtDate(s.vigencia_hasta)}. ¡Podés renovar en recepción! 💪`
        : `Hola ${s.nombre.split(' ')[0]}! 👋 Tu membresía vence el ${fmtDate(s.vigencia_hasta)} (en ${dias}d). ¡No te quedes sin entrenar en SportClub Tucumán! 💪`;
      const waUrl = tel ? `https://wa.me/549${tel.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}` : '';

      // Notas historial completo
      const notasHTML = notas.map(n => {
        const cat = catConfig(n.tipo);
        return `<div class="crm-log-item">
          <div class="crm-log-dot" style="background:${cat.color}"></div>
          <div style="flex:1">
            <span style="font-size:10px;color:var(--muted)">${n.fecha} ${n.hora}</span>
            ${n.autor ? `<span style="font-size:10px;color:var(--muted)"> · ${n.autor}</span>` : ''}
            <span style="margin-left:6px;font-size:10px;background:var(--s2);border-radius:4px;
              padding:1px 6px;color:${cat.color}">${cat.label}</span>
            <div style="margin-top:2px;font-size:12px">${n.texto}</div>
          </div>
        </div>`;
      }).join('');

      out += `<div class="crm-card ${tipo}" style="${resuelto?'opacity:.65':''} ">

        <div class="crm-header">
          <div style="font-size:22px">${tipo==='vencido'?'🔴':tipo==='urgente'?'🟡':'🟢'}</div>
          <div class="crm-nombre">${s.nombre}</div>
          <span class="crm-badge-dias ${badgeClass}">${badgeTxt}</span>
          ${contactadoHoy ? '<span style="font-size:10px;color:#25D366;white-space:nowrap">✓ WA hoy</span>' : ''}
          ${resuelto ? '<span style="font-size:10px;color:#A855F7;white-space:nowrap">🔒 Resuelto</span>' : ''}
        </div>

        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap">
          <span>📅 <strong style="color:var(--text)">${fmtDate(s.vigencia_hasta)}</strong></span>
          <span>💰 <strong style="color:var(--text)">${fmt$(s.monto)}</strong></span>
          <span>💳 ${s.metodo||'—'}</span>
          ${tel ? `<span>📱 ${tel}</span>` : '<span style="color:var(--sc-red)">⚠ Sin teléfono</span>'}
        </div>

        ${ultimaNota ? `<div style="background:var(--s2);border-radius:8px;padding:8px 12px;margin-bottom:10px;
          border-left:3px solid ${catConfig(ultimaNota.tipo).color}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="font-size:11px;color:${catConfig(ultimaNota.tipo).color};font-weight:600">${catConfig(ultimaNota.tipo).label}</span>
            <span style="font-size:10px;color:var(--muted)">${ultimaNota.fecha} ${ultimaNota.hora}</span>
            ${ultimaNota.autor ? `<span style="font-size:10px;color:var(--muted)"> · ${ultimaNota.autor}</span>` : ''}
          </div>
          <div style="font-size:12px">${ultimaNota.texto}</div>
        </div>` : ''}

        <div class="crm-acciones">
          ${waUrl
            ? `<a class="btn-wa" href="${waUrl}" target="_blank" style="font-size:12px;padding:7px 14px"
                 onclick="crmWA(this.dataset.nombre, this.dataset.tel, this.dataset.msg)">
                 💬 WhatsApp</a>`
            : '<span style="font-size:11px;color:var(--muted)">Sin teléfono</span>'}
          <button class="btn btn-xs" style="background:var(--sc-yellow);color:#000;border:none;font-weight:700;padding:6px 12px;border-radius:7px;cursor:pointer" onclick="nuevaVentaSocio('${s.nombre.replace(/'/g,'')}')">🔄 Nueva venta</button>
          <button class="btn btn-outline btn-sm" onclick="toggleCrmNota('${inputId}')">✏️ Anotar</button>
          ${resuelto
            ? `<button class="btn btn-outline btn-sm" onclick="desmarcarResuelto('${s.nombre.replace(/'/g,'&apos;')}')">↩️ Reabrir</button>`
            : `<button class="btn btn-outline btn-sm" style="border-color:#A855F7;color:#A855F7"
                 onclick="marcarResuelto('${s.nombre.replace(/'/g,'&apos;')}')">✔ Resuelto</button>`}
        </div>
        <!-- ACCIONES RÁPIDAS OBLIGATORIAS -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
          <span style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;align-self:center;white-space:nowrap">¿Qué pasó?</span>
          <button class="btn-accion-crm no-insistir" onclick="accionCRM('${s.nombre.replace(/'/g,'')}','no_insistir')">🚫 No insistir</button>
          <button class="btn-accion-crm renovado"    onclick="accionCRM('${s.nombre.replace(/'/g,'')}','renovado')">✅ Renovado</button>
          <button class="btn-accion-crm volvio"      onclick="accionCRM('${s.nombre.replace(/'/g,'')}','volvio')">🎉 Volvió!</button>
        </div>

        <div id="${inputId}-wrap" style="display:none;margin-top:12px;background:var(--s2);border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Nueva anotación</div>
          <select id="${selectId}" style="width:100%;margin-bottom:8px;background:var(--s1);border:1px solid var(--border);
            border-radius:7px;padding:8px 10px;color:var(--text);font-family:'DM Sans';font-size:12px;outline:none">
            ${CRM_CATS.filter(c => c.value !== 'wa' && c.value !== 'resuelto').map(c =>
              `<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
          <textarea class="crm-nota-input" id="${inputId}" rows="2"
            placeholder="Escribí los detalles del contacto..."></textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-accent btn-sm" onclick="agregarNotaCRM('${s.nombre.replace(/'/g,'&apos;')}')">💾 Guardar</button>
            <button class="btn btn-outline btn-sm" onclick="toggleCrmNota('${inputId}')">Cancelar</button>
          </div>
        </div>

        ${notas.length ? `<div class="crm-seguimiento">
          <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;
            font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px"
            onclick="toggleHistorialCRM('hist-${inputId}','arr-${inputId}')">
            <span>📋 Historial (${notas.length})</span>
            <span id="arr-${inputId}">▼</span>
          </div>
          <div id="hist-${inputId}" style="display:none;margin-top:8px">${notasHTML}</div>
        </div>` : ''}

      </div>`;
    });
  }

  if (lockAlerts.length && crmFiltro === 'todos') {
    out += `<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:18px 0 12px">🔐 Lockers (${lockAlerts.length})</div>`;
    lockAlerts.forEach(({ l, dias }) => {
      const tipo      = dias < 0 ? 'vencido' : dias <= 2 ? 'urgente' : 'proximo';
      const txt       = dias < 0 ? `Venció hace ${Math.abs(dias)}d` : dias === 0 ? 'Vence HOY' : `Vence en ${dias}d`;
      const lkKey     = ('locker_' + l.numero + '_' + (l.socio||'')).replace(/\s/g,'_');
      const inputId   = 'crm-nota-lk-' + btoa(lkKey).replace(/[=+/]/g,'');
      const selectId  = 'crm-cat-lk-'  + btoa(lkKey).replace(/[=+/]/g,'');
      const resuelto  = estaResuelto(lkKey);
      const notas     = crmNotas[lkKey] || [];
      const ultimaNota= notas[0] || null;
      const contacto  = contactos.find(c => c.nombre?.toLowerCase().trim() === l.socio?.toLowerCase().trim());
      const tel       = contacto?.telefono || l.telefono || '';
      const msgWA     = dias < 0
        ? `Hola! Tu locker #${l.numero} en SportClub venció el ${fmtDate(l.vencimiento)}. Pasá por recepción para renovarlo 🔐`
        : `Hola! Tu locker #${l.numero} en SportClub vence el ${fmtDate(l.vencimiento)} (en ${dias}d). Renovalo antes de que se libere 🔐`;
      const waUrl     = tel ? `https://wa.me/549${tel.replace(/\D/g,'')}?text=${encodeURIComponent(msgWA)}` : '';
      const notasHTML = notas.map(n => {
        const cat = catConfig(n.tipo);
        return `<div class="crm-log-item">
          <div class="crm-log-dot" style="background:${cat.color}"></div>
          <div style="flex:1">
            <span style="font-size:10px;color:var(--muted)">${n.fecha} ${n.hora}</span>
            <span style="margin-left:6px;font-size:10px;background:var(--s2);border-radius:4px;padding:1px 6px;color:${cat.color}">${cat.label}</span>
            <div style="margin-top:2px;font-size:12px">${n.texto}</div>
          </div>
        </div>`;
      }).join('');

      out += `<div class="crm-card ${tipo}" style="${resuelto?'opacity:.65':''}">
        <div class="crm-header">
          <div style="font-size:22px">${tipo==='vencido'?'🔴':tipo==='urgente'?'🟡':'🟢'}</div>
          <div class="crm-nombre">🔐 Locker #${l.numero} — ${l.socio||'—'}</div>
          <span class="crm-badge-dias ${tipo}">${txt}</span>
          ${resuelto ? '<span style="font-size:10px;color:#A855F7;white-space:nowrap">🔒 Resuelto</span>' : ''}
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap">
          <span>📅 Vence: <strong style="color:var(--text)">${fmtDate(l.vencimiento)}</strong></span>
          <span>📐 ${l.tamano||'—'}</span>
          ${tel ? `<span>📱 ${tel}</span>` : '<span style="color:var(--sc-red)">⚠ Sin teléfono</span>'}
        </div>
        ${ultimaNota ? `<div style="background:var(--s2);border-radius:8px;padding:8px 12px;margin-bottom:10px;border-left:3px solid ${catConfig(ultimaNota.tipo).color}">
          <div style="font-size:11px;color:${catConfig(ultimaNota.tipo).color};font-weight:600;margin-bottom:2px">${catConfig(ultimaNota.tipo).label} · ${ultimaNota.fecha}</div>
          <div style="font-size:12px">${ultimaNota.texto}</div>
        </div>` : ''}
        <div class="crm-acciones">
          ${waUrl ? `<a class="btn-wa" href="${waUrl}" target="_blank" style="font-size:12px;padding:7px 14px"
               onclick="crmWA('${(l.socio||'').replace(/'/g,'').replace(/"/g,'')}','${tel}','${encodeURIComponent(msgWA)}')">💬 WhatsApp</a>`
            : '<span style="font-size:11px;color:var(--muted)">Sin teléfono</span>'}
          <button class="btn btn-outline btn-sm" onclick="toggleCrmNota('${inputId}')">✏️ Anotar</button>
          ${resuelto
            ? `<button class="btn btn-outline btn-sm" onclick="desmarcarResuelto('${lkKey}')">↩️ Reabrir</button>`
            : `<button class="btn btn-outline btn-sm" style="border-color:#A855F7;color:#A855F7" onclick="marcarResuelto('${lkKey}')">✔ Resuelto</button>`}
        </div>
        <div id="${inputId}-wrap" style="display:none;margin-top:12px;background:var(--s2);border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Nueva anotación</div>
          <select id="${selectId}" style="width:100%;margin-bottom:8px;background:var(--s1);border:1px solid var(--border);border-radius:7px;padding:8px 10px;color:var(--text);font-family:'DM Sans';font-size:12px;outline:none">
            ${CRM_CATS.filter(c => c.value !== 'wa' && c.value !== 'resuelto').map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
          <textarea class="crm-nota-input" id="${inputId}" rows="2" placeholder="Detalle..."></textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-accent btn-sm" onclick="agregarNotaCRMLocker('${lkKey}','${selectId}','${inputId}')">💾 Guardar</button>
            <button class="btn btn-outline btn-sm" onclick="toggleCrmNota('${inputId}')">Cancelar</button>
          </div>
        </div>
        ${notas.length ? `<div class="crm-seguimiento">
          <div style="cursor:pointer;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;justify-content:space-between"
            onclick="toggleHistorialCRM('hist-${inputId}','arr-${inputId}')">
            <span>📋 Historial (${notas.length})</span><span id="arr-${inputId}">▼</span>
          </div>
          <div id="hist-${inputId}" style="display:none;margin-top:8px">${notasHTML}</div>
        </div>` : ''}
      </div>`;
    });
  }

  cont.innerHTML = out;
}

function toggleCrmNota(inputId) {
  const wrap = document.getElementById(inputId + '-wrap');
  if (!wrap) return;
  const visible = wrap.style.display !== 'none';
  wrap.style.display = visible ? 'none' : 'block';
  if (!visible) document.getElementById(inputId)?.focus();
}

function toggleHistorialCRM(histId, arrId) {
  const el  = document.getElementById(histId);
  const arr = document.getElementById(arrId);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '▼' : '▲';
}



// ══════════════════════════════════════════
//  RANKING DE PRODUCTOS FÍSICOS
// ══════════════════════════════════════════
function getProductosFisicos() {
  return productos.filter(p => p.esFisico === true);
}

function getRankingData() {
  const hoy     = todayStr();
  const periodo = document.getElementById('rank-periodo')?.value || 'mes';
  const sedeF   = document.getElementById('rank-sede')?.value   || '';

  // Calcular fecha de corte
  let desde = '';
  if (periodo === 'hoy') {
    desde = hoy;
  } else if (periodo === 'semana') {
    const d = new Date(hoy + 'T00:00:00');
    d.setDate(d.getDate() - 6);
    desde = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  } else if (periodo === 'mes') {
    desde = hoy.slice(0,7) + '-01';
  }

  // Filtrar ventas
  const vFiltradas = ventas.filter(v => {
    if (v.anulada) return false;
    if (sedeF && v.sede !== sedeF) return false;
    if (desde && v.fecha < desde) return false;
    return true;
  });

  // Contar por producto físico
  const fisicos = getProductosFisicos();
  const mapa = {};
  fisicos.forEach(p => { mapa[p.key] = { producto: p, unidades: 0, total: 0 }; });
  // También contar productos custom físicos
  productos.filter(p => p.esFisico && p.custom).forEach(p => {
    mapa[p.key] = { producto: p, unidades: 0, total: 0 };
  });

  vFiltradas.forEach(v => {
    if (mapa[v.concepto]) {
      mapa[v.concepto].unidades += 1;
      mapa[v.concepto].total    += ventaMonto(v);
    }
  });

  return Object.values(mapa)
    .filter(r => r.unidades > 0)
    .sort((a, b) => b.unidades - a.unidades);
}

function renderRanking() {
  const el = document.getElementById('ranking-lista');
  if (!el) return;

  const data = getRankingData();
  if (!data.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:16px 0;text-align:center">Sin ventas de productos en este período</div>';
    return;
  }

  const maxU = data[0].unidades;
  el.innerHTML = data.map((r, i) => {
    const numClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
    const pct = Math.round(r.unidades / maxU * 100);
    // Badge de stock
    const stockBadge = getStockBadge(r.producto);
    return `<div class="rank-item">
      <div class="rank-num ${numClass}">${i+1}</div>
      <div>
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:16px">${r.producto.icon}</span>
          <span style="font-size:13px;font-weight:600">${r.producto.label}</span>
          ${stockBadge}
        </div>
        <div class="rank-bar-wrap">
          <div class="rank-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="rank-unidades">${r.unidades} ud.</div>
      <div class="rank-monto">${fmt$(r.total)}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
//  SISTEMA DE STOCK
// ══════════════════════════════════════════
// stock almacenado en el campo p.stock de cada producto (null = sin control)
// stockMin = nivel mínimo para alerta de reposición

function getStockActual(key) {
  // El stock actual = stock inicial configurado - unidades vendidas hoy
  // (Simple: el admin actualiza el stock al cargar mercadería)
  const p = getProducto(key);
  return p.stock != null ? p.stock : null;
}

function getStockBadge(p) {
  if (p.stock == null) return '';
  if (p.stock <= 0) return `<span class="stock-badge sin-stock">⚠ ${p.stock < 0 ? p.stock + ' (negativo)' : 'SIN STOCK'}</span>`;
  const min = p.stockMin || 5;
  if (p.stock <= Math.floor(min * 0.5)) return `<span class="stock-badge critico">🔴 ${p.stock} ud.</span>`;
  if (p.stock <= min)  return `<span class="stock-badge bajo">🟡 ${p.stock} ud.</span>`;
  return `<span class="stock-badge ok">✅ ${p.stock} ud.</span>`;
}

function renderStockAlertas() {
  const el = document.getElementById('stock-alertas');
  if (!el) return;

  const criticos = productos.filter(p => p.esFisico && p.stock != null && p.stock <= (p.stockMin || 5));
  if (!criticos.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="card" style="border-color:rgba(204,0,21,.3)">
      <div style="font-size:11px;color:var(--sc-red);text-transform:uppercase;
        letter-spacing:1px;margin-bottom:10px;font-weight:700">
        ⚠️ Alertas de reposición (${criticos.length})
      </div>
      ${criticos.map(p => `
        <div class="alerta-stock">
          <span style="font-size:22px">${p.icon}</span>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${p.label}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              Stock actual: <strong style="color:${p.stock===0?'var(--sc-red)':'var(--sc-yellow)'}">${p.stock} unidades</strong>
              · Mínimo configurado: ${p.stockMin || 5} ud.
            </div>
          </div>
          ${p.stock === 0
            ? '<span class="stock-badge sin-stock">SIN STOCK</span>'
            : '<span class="stock-badge critico">REPONER</span>'}
        </div>`).join('')}
    </div>`;
}

// Descontar stock cuando se registra una venta de producto físico
function descontarStock(concepto, cantidad) {
  const p = productos.find(x => x.key === concepto);
  if (!p || !p.esFisico || p.stock == null) return;
  p.stock = (p.stock || 0) - (parseInt(cantidad) || 1);  // puede ser negativo
  saveProductos();
}

// registrarVenta con descuento de stock integrado


// ══════════════════════════════════════════
//  GASTO RÁPIDO
// ══════════════════════════════════════════
const GASTO_CATS = {
  limpieza:     { label:'Limpieza',      icon:'🧹' },
  insumos:      { label:'Insumos',       icon:'📦' },
  mantenimiento:{ label:'Mantenimiento', icon:'🔧' },
  servicios:    { label:'Servicios',     icon:'💡' },
  traslado:     { label:'Traslado',      icon:'🚗' },
  otro_gasto:   { label:'Gasto',         icon:'📝' },
};
// [moved to store.js] let _gastoCatSel = 'otro_gasto';...

function abrirGasto() {
  _gastoCatSel = 'otro_gasto';
  document.getElementById('gasto-monto').value   = '';
  document.getElementById('gasto-detalle').value = '';
  document.getElementById('gasto-metodo').value  = 'efectivo';
  document.querySelectorAll('.gasto-cat').forEach(b => b.classList.remove('sel'));
  openModal('modal-gasto');
  setTimeout(() => document.getElementById('gasto-monto').focus(), 200);
}

function selGastoCat(cat, btn) {
  _gastoCatSel = cat;
  document.querySelectorAll('.gasto-cat').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
}

function confirmarGasto() {
  const monto   = parseFloat(document.getElementById('gasto-monto').value) || 0;
  const detalle = document.getElementById('gasto-detalle').value.trim();
  const metodo  = document.getElementById('gasto-metodo').value;
  const cat     = GASTO_CATS[_gastoCatSel] || GASTO_CATS.otro_gasto;

  if (!monto) { toast('⚠️ Ingresá el monto del gasto', 'var(--sc-yellow)'); return; }

  const hoy  = todayStr();
  const hora = new Date().toTimeString().slice(0,5);
  const desc = detalle || cat.label;

  // Crear venta tipo egreso
  const venta = {
    id: genUID(),
    numero:   getNextNumero(sedeActual),
    fecha:    hoy,
    hora,
    sede:     sedeActual,
    cliente:  desc,
    detalle:  `${cat.icon} ${desc}`,
    concepto: 'egreso',
    _esGasto: true,
    metodo,
    efectivo:      metodo === 'efectivo'      ? monto : 0,
    transferencia: metodo === 'transferencia' ? monto : 0,
    debito:        metodo === 'debito'        ? monto : 0,
    credito:  0,
    qr:       0,
    monto,
    estado:   'cobrado',
    _esGasto: true,
    _catGasto: _gastoCatSel,
  };

  ventas.push(venta);
  save();
  guardarVentaSheets(venta).catch(()=>{});
  closeModal('modal-gasto');
  renderDashRecepcion();
  if (document.getElementById('section-dashboard').classList.contains('active')) renderDashboard();
  toast(`💸 Gasto registrado: ${fmt$(monto)} — ${desc}`, 'var(--sc-yellow)');
}


// ══════════════════════════════════════════════════════════════════════
//  LIBRO DE EGRESOS
// ══════════════════════════════════════════════════════════════════════
// [moved to store.js] let egresos = JSON.parse(localStorage.getItem('sc_...

function saveEgresos() {
  localStorage.setItem('sc_egresos', JSON.stringify(egresos));
  if (typeof save === 'function') save();
}

const EG_CATS = {
  sueldo:       { label:'Sueldos',         icon:'👷', color:'#60A5FA' },
  alquiler:     { label:'Alquiler',        icon:'🏢', color:'#A78BFA' },
  servicios:    { label:'Servicios',       icon:'💡', color:'#34D399' },
  proveedores:  { label:'Proveedores',     icon:'📦', color:'#FBBF24' },
  impuestos:    { label:'Impuestos',       icon:'🧾', color:'#F87171' },
  mantenimiento:{ label:'Mantenimiento',   icon:'🔧', color:'#FB923C' },
  otro:         { label:'Otro',            icon:'📝', color:'#9CA3AF' },
};

// [moved to store.js] let _egCatSel  = 'otro';...
// [moved to store.js] let _egEditId  = null;...

// ── Alertas de egresos en el badge de nav ──
function getEgresosVenciendo() {
  const hoy   = todayStr();
  const limite = (() => {
    const d = new Date(hoy + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  })();
  return egresos.filter(e =>
    e.estado === 'pendiente' && e.vencimiento && e.vencimiento <= limite
  );
}

function selEgresoCat(cat, btn) {
  _egCatSel = cat;
  document.querySelectorAll('.egreso-form-cat').forEach(b => b.classList.remove('sel'));
  if (btn) btn.classList.add('sel');
}

function toggleEgFechaPago() {
  const est = document.getElementById('eg-estado').value;
  const wrap = document.getElementById('eg-fecha-pago-wrap');
  if (wrap) wrap.style.display = est === 'pagado' ? 'grid' : 'none';
}

function abrirNuevoEgreso() {
  _egEditId    = null;
  _egCatSel    = 'otro';
  document.getElementById('eg-modal-title').textContent = '➕ Nuevo egreso';
  document.getElementById('eg-desc').value       = '';
  document.getElementById('eg-monto').value      = '';
  document.getElementById('eg-vencimiento').value= '';
  document.getElementById('eg-estado').value     = 'pendiente';
  document.getElementById('eg-fecha-pago-wrap').style.display = 'none';
  document.getElementById('eg-fecha-pago').value = todayStr();
  document.getElementById('eg-metodo-pago').value= 'transferencia';
  document.getElementById('eg-recurrencia').value= '';
  document.getElementById('eg-notas').value      = '';
  document.querySelectorAll('.egreso-form-cat').forEach(b => b.classList.remove('sel'));
  openModal('modal-egreso');
  setTimeout(() => document.getElementById('eg-desc').focus(), 200);
}

function abrirEditarEgreso(id) {
  const eg = egresos.find(e => e.id === id);
  if (!eg) return;
  _egEditId = id;
  _egCatSel = eg.cat || 'otro';
  document.getElementById('eg-modal-title').textContent = '✏️ Editar egreso';
  document.getElementById('eg-desc').value        = eg.desc || '';
  document.getElementById('eg-monto').value       = eg.monto || '';
  document.getElementById('eg-vencimiento').value = eg.vencimiento || '';
  document.getElementById('eg-estado').value      = eg.estado || 'pendiente';
  document.getElementById('eg-fecha-pago').value  = eg.fechaPago || todayStr();
  document.getElementById('eg-metodo-pago').value = eg.metodoPago || 'transferencia';
  document.getElementById('eg-recurrencia').value = eg.recurrencia || '';
  document.getElementById('eg-notas').value       = eg.notas || '';
  toggleEgFechaPago();
  document.querySelectorAll('.egreso-form-cat').forEach(b => b.classList.remove('sel'));
  const catBtn = [...document.querySelectorAll('.egreso-form-cat')]
    .find(b => b.getAttribute('onclick')?.includes("'" + _egCatSel + "'"));
  if (catBtn) catBtn.classList.add('sel');
  openModal('modal-egreso');
}

function marcarEgresoPagado(id) {
  const eg = egresos.find(e => e.id === id);
  if (!eg) return;
  eg.estado     = 'pagado';
  eg.fechaPago  = todayStr();
  saveEgresos();
  renderEgresos();
  toast('✅ Marcado como pagado');
  // Si es recurrente, crear el próximo
  if (eg.recurrencia && eg.vencimiento) {
    const next = proximoVencimiento(eg.vencimiento, eg.recurrencia);
    if (next) {
      egresos.push({
        id: genUID(),
        cat:         eg.cat,
        desc:        eg.desc,
        monto:       eg.monto,
        vencimiento: next,
        estado:      'pendiente',
        recurrencia: eg.recurrencia,
        notas:       eg.notas,
        creadoEn:    todayStr(),
      });
      saveEgresos();
      renderEgresos();
      toast(`🔁 Próximo vencimiento creado: ${fmtDate(next)}`);
    }
  }
}

function proximoVencimiento(fechaBase, recurrencia) {
  const d = new Date(fechaBase + 'T00:00:00');
  if      (recurrencia === 'mensual')    d.setMonth(d.getMonth() + 1);
  else if (recurrencia === 'bimestral')  d.setMonth(d.getMonth() + 2);
  else if (recurrencia === 'trimestral') d.setMonth(d.getMonth() + 3);
  else if (recurrencia === 'anual')      d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function eliminarEgreso(id) {
  if (!confirm('¿Eliminar este egreso?')) return;
  egresos = egresos.filter(e => e.id !== id);
  saveEgresos();
  renderEgresos();
  toast('🗑️ Egreso eliminado');
}

function guardarEgreso() {
  const desc       = document.getElementById('eg-desc').value.trim();
  const monto      = parseFloat(document.getElementById('eg-monto').value) || 0;
  const venc       = document.getElementById('eg-vencimiento').value;
  const estado     = document.getElementById('eg-estado').value;
  const fechaPago  = document.getElementById('eg-fecha-pago').value;
  const metodoPago = document.getElementById('eg-metodo-pago').value;
  const recurrencia= document.getElementById('eg-recurrencia').value;
  const notas      = document.getElementById('eg-notas').value.trim();

  if (!desc)  { toast('⚠️ Ingresá una descripción', 'var(--sc-yellow)'); return; }
  if (!monto) { toast('⚠️ Ingresá el monto',        'var(--sc-yellow)'); return; }

  if (_egEditId) {
    const i = egresos.findIndex(e => e.id === _egEditId);
    if (i >= 0) {
      egresos[i] = { ...egresos[i], cat:_egCatSel, desc, monto, vencimiento:venc,
        estado, fechaPago: estado==='pagado'?fechaPago:'',
        metodoPago: estado==='pagado'?metodoPago:'', recurrencia, notas };
    }
    toast('✅ Egreso actualizado');
  } else {
    egresos.push({
        id: genUID(), cat:_egCatSel, desc, monto,
      vencimiento: venc, estado,
      fechaPago:   estado==='pagado' ? fechaPago : '',
      metodoPago:  estado==='pagado' ? metodoPago : '',
      recurrencia, notas, creadoEn: todayStr(),
    });
    toast('✅ Egreso registrado');
  }
  saveEgresos();
  closeModal('modal-egreso');
  renderEgresos();
}

function renderEgresos() {
  const hoy    = todayStr();
  const mes    = hoy.slice(0,7);
  const anio   = hoy.slice(0,4);

  // Poblar select de meses
  const mesesSel = document.getElementById('eg-filtro-mes');
  if (mesesSel && mesesSel.options.length <= 1) {
    const mesesSet = new Set(egresos.map(e => (e.vencimiento||e.creadoEn||'').slice(0,7)).filter(Boolean));
    const sorted   = [...mesesSet].sort().reverse();
    sorted.forEach(m => {
      if ([...mesesSel.options].some(o => o.value === m)) return;
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = new Date(m+'-01').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
      mesesSel.appendChild(opt);
    });
  }

  // Filtros
  const filtroEstado = document.getElementById('eg-filtro-estado')?.value || '';
  const filtroCat    = document.getElementById('eg-filtro-cat')?.value    || '';
  const filtroMes    = document.getElementById('eg-filtro-mes')?.value    || '';
  const q            = (document.getElementById('eg-search')?.value || '').toLowerCase();

  let lista = [...egresos].sort((a,b) => {
    // Pendientes primero, luego por vencimiento
    if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1;
    return (a.vencimiento||'9999') < (b.vencimiento||'9999') ? -1 : 1;
  });

  if (filtroEstado) lista = lista.filter(e => e.estado === filtroEstado);
  if (filtroCat)    lista = lista.filter(e => e.cat    === filtroCat);
  if (filtroMes)    lista = lista.filter(e => (e.vencimiento||e.creadoEn||'').startsWith(filtroMes));
  if (q)            lista = lista.filter(e => e.desc?.toLowerCase().includes(q) || e.notas?.toLowerCase().includes(q));

  // KPIs
  const egresosMes   = egresos.filter(e => (e.vencimiento||e.creadoEn||'').startsWith(mes));
  const pendientes   = egresos.filter(e => e.estado === 'pendiente');
  const venciendo    = getEgresosVenciendo();
  const pagadosAnio  = egresos.filter(e => e.estado==='pagado' && (e.fechaPago||'').startsWith(anio));
  const sum          = arr => arr.reduce((a,e) => a + (e.monto||0), 0);

  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('eg-kpi-mes',       fmt$(sum(egresosMes)));
  setEl('eg-kpi-mes-sub',   `${egresosMes.length} egreso${egresosMes.length!==1?'s':''}`);
  setEl('eg-kpi-pend',      fmt$(sum(pendientes)));
  setEl('eg-kpi-pend-sub',  `${pendientes.length} sin pagar`);
  setEl('eg-kpi-venc',      venciendo.length);
  setEl('eg-kpi-anual',     fmt$(sum(pagadosAnio)));
  setEl('eg-kpi-anual-sub', `${pagadosAnio.length} pagados`);

  // Badge alertas en nav (actualiza d-alertas también)
  const alertasBadge = document.getElementById('alerts-badge');
  if (alertasBadge) {
    const totalAlerts = getEgresosVenciendo().length;
    // Lo combinamos con las alertas de socios en renderDashboard
  }

  // Alertas de vencimiento
  const alertasWrap = document.getElementById('eg-alertas-wrap');
  if (alertasWrap) {
    if (venciendo.length) {
      alertasWrap.innerHTML = `<div class="card" style="border-color:rgba(245,193,0,.3)">
        <div style="font-size:11px;color:var(--sc-yellow);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;font-weight:700">
          ⚠️ Vencimientos próximos — próximos 7 días (${venciendo.length})
        </div>
        ${venciendo.map(e => {
          const cat  = EG_CATS[e.cat] || EG_CATS.otro;
          const dias = Math.round((new Date(e.vencimiento+'T00:00:00') - new Date(hoy+'T00:00:00')) / 86400000);
          const txt  = dias < 0 ? `Venció hace ${Math.abs(dias)}d` : dias===0 ? 'Vence HOY' : `Vence en ${dias}d`;
          return `<div class="egreso-alerta-row">
            <span style="font-size:20px">${cat.icon}</span>
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">${e.desc}</div>
              <div style="font-size:11px;color:var(--muted)">${cat.label} · ${fmt$(e.monto)}</div>
            </div>
            <span style="font-size:12px;font-weight:700;color:${dias<=0?'var(--sc-red)':'var(--sc-yellow)'};white-space:nowrap">${txt}</span>
            <button class="btn btn-accent btn-sm" onclick="marcarEgresoPagado(${e.id})" style="white-space:nowrap">✅ Pagar</button>
          </div>`;
        }).join('')}
      </div>`;
    } else {
      alertasWrap.innerHTML = '';
    }
  }

  // Lista
  const el = document.getElementById('eg-lista');
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--muted)">
      <div style="font-size:40px;margin-bottom:10px">📋</div>
      <div style="font-weight:600;color:var(--text)">Sin egresos registrados</div>
      <div style="margin-top:6px;font-size:12px">Usá el botón ➕ Nuevo egreso para cargar el primero</div>
    </div>`;
    return;
  }

  el.innerHTML = lista.map(e => {
    const cat   = EG_CATS[e.cat] || EG_CATS.otro;
    const pagado= e.estado === 'pagado';
    let estadoBadge, cardClass = '';
    if (pagado) {
      estadoBadge = `<span class="egreso-badge pagado">✅ Pagado ${e.fechaPago?fmtDate(e.fechaPago):''}</span>`;
      cardClass   = 'pagado';
    } else if (e.vencimiento) {
      const dias = Math.round((new Date(e.vencimiento+'T00:00:00') - new Date(hoy+'T00:00:00')) / 86400000);
      if (dias < 0)   { estadoBadge=`<span class="egreso-badge vencido">🔴 Vencido hace ${Math.abs(dias)}d</span>`; cardClass='vencido-hoy'; }
      else if (dias===0){ estadoBadge=`<span class="egreso-badge vencido">🔴 Vence HOY</span>`; cardClass='vencido-hoy'; }
      else if (dias<=7) { estadoBadge=`<span class="egreso-badge proximo">🟡 Vence en ${dias}d</span>`; cardClass='proximo'; }
      else              { estadoBadge=`<span class="egreso-badge pendiente">⏳ Vence ${fmtDate(e.vencimiento)}</span>`; }
    } else {
      estadoBadge = `<span class="egreso-badge pendiente">⏳ Pendiente</span>`;
    }

    return `<div class="egreso-card ${cardClass}">
      <div class="egreso-icon" style="color:${cat.color}">${cat.icon}</div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-weight:700;font-size:13px">${e.desc}</span>
          <span style="font-size:10px;color:${cat.color};background:var(--s2);
            border-radius:4px;padding:1px 6px">${cat.label}</span>
          ${e.recurrencia?`<span style="font-size:10px;color:var(--muted)">🔁 ${e.recurrencia}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          ${estadoBadge}
          ${e.notas?`<span style="font-size:11px;color:var(--muted);font-style:italic">${e.notas.slice(0,60)}${e.notas.length>60?'…':''}</span>`:''}
        </div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:7px">
        <div class="egreso-monto">${fmt$(e.monto)}</div>
        <div style="display:flex;gap:6px">
          ${!pagado?`<button class="btn btn-accent btn-sm" onclick="marcarEgresoPagado(${e.id})">✅ Pagar</button>`:''}
          <button class="btn btn-outline btn-sm" onclick="abrirEditarEgreso(${e.id})">✏️</button>
          <button class="btn btn-outline btn-sm" style="border-color:var(--sc-red);color:var(--sc-red)"
            onclick="eliminarEgreso(${e.id})">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════

//  TEMA: CLARO / OSCURO
// ══════════════════════════════════════════
function initTema() {
  const saved = localStorage.getItem('sc_tema') || 'dark';
  aplicarTema(saved);
}
function aplicarTema(tema) {
  localStorage.setItem('sc_tema', tema);
  const root = document.documentElement;
  const body = document.body;

  if (tema === 'light') {
    root.style.setProperty('--bg',    '#EDEAE3');
    root.style.setProperty('--s1',    '#FAFAF8');
    root.style.setProperty('--s2',    '#F2EFE8');
    root.style.setProperty('--s3',    '#E5E0D8');
    root.style.setProperty('--text',  '#111111');
    root.style.setProperty('--muted', '#666666');
    root.style.setProperty('--border','#D4CFC6');
    root.style.setProperty('--green', '#15803D');
    root.style.setProperty('--red',   '#DC2626');
    root.style.setProperty('--orange','#C2410C');
  } else {
    root.style.setProperty('--bg',    '#0D0D0D');
    root.style.setProperty('--s1',    '#151515');
    root.style.setProperty('--s2',    '#1E1E1E');
    root.style.setProperty('--s3',    '#272727');
    root.style.setProperty('--text',  '#F0EDE8');
    root.style.setProperty('--muted', '#686868');
    root.style.setProperty('--border','#2E2E2E');
    root.style.setProperty('--green', '#22C55E');
    root.style.setProperty('--red',   '#FF1A2E');
    root.style.setProperty('--orange','#F97316');
  }
  document.body.classList.toggle('tema-light', tema === 'light');
  const btn = document.getElementById('tema-btn');
  if (btn) btn.textContent = tema === 'light' ? '🌙' : '☀️';
}
function toggleTema() {
  const actual = localStorage.getItem('sc_tema') || 'dark';
  aplicarTema(actual === 'dark' ? 'light' : 'dark');
}

// ══════════════════════════════════════════
//  CAMBIAR CONTRASEÑA
// ══════════════════════════════════════════
// [moved to store.js] let adminPass = localStorage.getItem('sc_admin_pas...

function cambiarContrasena() {
  const actual  = document.getElementById('pass-actual')?.value;
  const nueva   = document.getElementById('pass-nueva')?.value;
  const nueva2  = document.getElementById('pass-nueva2')?.value;

  if (actual !== adminPass) { toast('⚠️ Contraseña actual incorrecta', 'var(--sc-yellow)'); return; }
  if (!nueva || nueva.length < 4) { toast('⚠️ La nueva contraseña debe tener al menos 4 caracteres', 'var(--sc-yellow)'); return; }
  if (nueva !== nueva2) { toast('⚠️ Las contraseñas no coinciden', 'var(--sc-yellow)'); return; }

  adminPass = nueva;
  localStorage.setItem('sc_admin_pass', nueva);
  ['pass-actual','pass-nueva','pass-nueva2'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
  toast('✅ Contraseña actualizada');
}

// ══════════════════════════════════════════
//  PAGO PARCIAL — helpers en el form
// ══════════════════════════════════════════
function togglePagoMixto(activo) {
  const wrap = document.getElementById('f-pago-mixto-wrap');
  if (!wrap) return;
  wrap.style.display = activo ? 'block' : 'none';
  if (activo) {
    const metodo = document.getElementById('f-metodo')?.value || 'efectivo';
    const m1 = document.getElementById('f-metodo1');
    if (m1) m1.value = metodo;
    document.getElementById('f-monto1')?.focus();
    onPagoMixtoChange();
  }
}

function onPagoMixtoChange() {
  const activo = document.getElementById('f-pago-mixto')?.checked;
  if (!activo) return;
  const montoTotal = parseFloat(document.getElementById('f-monto')?.value) || 0;
  const monto1     = parseFloat(document.getElementById('f-monto1')?.value) || 0;
  const monto2El   = document.getElementById('f-monto2');
  const preview    = document.getElementById('f-mixto-preview');
  const m1label    = document.getElementById('f-metodo1')?.options[document.getElementById('f-metodo1')?.selectedIndex]?.text || '';
  const m2label    = document.getElementById('f-metodo2')?.options[document.getElementById('f-metodo2')?.selectedIndex]?.text || '';
  const monto2 = Math.max(0, montoTotal - monto1);
  if (monto2El) monto2El.value = monto2 > 0 ? monto2 : '';
  const fMetodo = document.getElementById('f-metodo');
  const m1val = document.getElementById('f-metodo1')?.value;
  if (fMetodo && m1val) fMetodo.value = m1val;
  if (preview) {
    if (montoTotal > 0 && monto1 > 0) {
      if (monto1 > montoTotal) {
        preview.innerHTML = '<span style="color:var(--sc-red)">⚠️ El monto 1 supera el total</span>';
      } else {
        preview.innerHTML = '✅ <strong style="color:var(--green)">' + fmt$(monto1) + '</strong> ' + m1label + ' + <strong style="color:var(--accent)">' + fmt$(monto2) + '</strong> ' + m2label;
      }
    } else { preview.innerHTML = ''; }
  }
}


function onEstadoChange() {
  const estado  = document.getElementById('f-estado')?.value;
  const wrap    = document.getElementById('f-parcial-wrap');
  const telWrap = document.getElementById('f-tel-deuda-wrap');
  if (wrap)    wrap.style.display    = estado === 'parcial' ? 'block' : 'none';
  if (telWrap) telWrap.style.display = estado === 'parcial' ? 'block' : 'none';
  if (estado === 'parcial') {
    document.getElementById('f-monto-parcial').focus();
    calcularDeuda();
  }
}

function calcularDeuda() {
  const total   = parseFloat(document.getElementById('f-monto')?.value) || 0;
  const pagado  = parseFloat(document.getElementById('f-monto-parcial')?.value) || 0;
  const preview = document.getElementById('f-deuda-preview');
  if (!preview) return;
  if (total > 0 && pagado >= 0) {
    const resta = total - pagado;
    preview.style.display = 'block';
    if (resta > 0) {
      preview.innerHTML = `Cobra hoy: <strong>$${pagado.toLocaleString('es-AR')}</strong> · Queda pendiente: <strong style="color:var(--sc-red)">$${resta.toLocaleString('es-AR')}</strong>`;
    } else if (resta === 0) {
      preview.innerHTML = `<span style="color:var(--green)">✅ Monto completo</span>`;
    } else {
      preview.innerHTML = `<span style="color:var(--sc-red)">⚠️ El monto cobrado supera el total</span>`;
    }
  } else {
    preview.style.display = 'none';
  }
}

// ══════════════════════════════════════════
//  RENDERDEUDAS
// ══════════════════════════════════════════
function renderDeudas() {
  const filtro = document.getElementById('deu-filtro')?.value || '';
  
  // Deudas = ventas con estado parcial o pendiente con monto
  const deudas = ventas.filter(v => {
    if (v.anulada) return false;
    if (v.estado === 'parcial' && v.deuda > 0) return !filtro || filtro === 'parcial';
    if (v.estado === 'pendiente' && ventaMonto(v) > 0) return !filtro || filtro === 'pendiente';
    return false;
  });

  const totalAdeudado = deudas.reduce((a, v) => a + (v.deuda || ventaMonto(v)), 0);
  const parciales = deudas.filter(v => v.estado === 'parcial');
  const pendientes = deudas.filter(v => v.estado === 'pendiente');

  const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  set('deu-total',   fmt$(totalAdeudado));
  set('deu-count',   deudas.length + ' deuda' + (deudas.length!==1?'s':''));
  set('deu-parcial', fmt$(parciales.reduce((a,v)=>a+(v.deuda||0),0)));
  set('deu-parcial-count', parciales.length + ' socio' + (parciales.length!==1?'s':''));
  set('deu-pendiente', fmt$(pendientes.reduce((a,v)=>a+ventaMonto(v),0)));
  set('deu-pendiente-count', pendientes.length + ' socio' + (pendientes.length!==1?'s':''));

  // Badge nav
  const badge = document.getElementById('deudas-badge');
  if (badge) {
    badge.style.display = deudas.length > 0 ? 'inline-flex' : 'none';
    badge.textContent = deudas.length;
  }

  const el = document.getElementById('deudas-lista');
  if (!el) return;

  if (!deudas.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:30px;text-align:center">✅ Sin deudas pendientes</div>';
    return;
  }

  el.innerHTML = deudas.sort((a,b) => b.timestamp - a.timestamp).map(v => {
    const esParcial = v.estado === 'parcial';
    const montoTotal = ventaMonto(v);
    const montoPagado = v.montoPagado || 0;
    const montoDeuda  = v.deuda || montoTotal;
    const pct = esParcial && montoTotal > 0 ? Math.round(montoPagado/montoTotal*100) : 0;

    return `<div class="card" style="margin-bottom:10px;padding:14px 16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:15px;font-weight:700">${v.cliente || '(sin nombre)'}</span>
            <span class="badge ${esParcial ? 'badge-yellow' : 'badge-red'}">
              ${esParcial ? '💰 Parcial' : '⏳ Pendiente'}
            </span>
          </div>
          <div style="font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap">
            <span>📅 ${fmtDate(v.fecha)}</span>
            <span>🏷️ ${getConceptoLabel(v.concepto)}</span>
            <span>🏢 ${v.sede || sedeActual}</span>
            <span>🔖 ${v.numero || '—'}</span>
          </div>
          ${esParcial ? `
          <div style="margin-top:10px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px">
              <span>Pagado: <strong style="color:var(--green)">${fmt$(montoPagado)}</strong></span>
              <span>Total: <strong>${fmt$(montoTotal)}</strong></span>
            </div>
            <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:var(--green);border-radius:3px;transition:width .4s"></div>
            </div>
          </div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:'Bebas Neue';font-size:26px;color:var(--sc-red);line-height:1">${fmt$(montoDeuda)}</div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px">adeudado</div>
          <button class="btn btn-accent btn-sm" onclick="registrarPagoDeuda('${v.id}')" style="width:100%;justify-content:center;margin-bottom:6px">
            💵 Registrar pago
          </button>
          ${v.telefono
            ? `<a href="https://wa.me/549${v.telefono.replace(/\D/g,'')}?text=${encodeURIComponent('Hola ' + (v.cliente||'') + '! 👋 Te contactamos desde SportClub Tucumán para avisarte que tenés una deuda pendiente de $' + (v.deuda||montoDeuda).toLocaleString('es-AR') + ' por ' + getConceptoLabel(v.concepto) + '. Podés acercarte a regularizarla cuando quieras. \u00a1Gracias! 💪')}"
               target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;justify-content:center;gap:6px;
                 width:100%;padding:7px 10px;border-radius:8px;
                 background:#25D366;color:#fff;font-size:12px;font-weight:700;
                 text-decoration:none;font-family:'DM Sans';transition:opacity .15s"
               onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
               <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> WhatsApp
             </a>`
            : `<div style="font-size:10px;color:var(--muted);opacity:.5;text-align:center">sin teléfono</div>`
          }
        </div>
      </div>
    </div>`;
  }).join('');
}

function registrarPagoDeuda(ventaId) {
  const v = ventas.find(x => x.id == ventaId);
  if (!v) return;
  const montoDeuda = v.deuda || ventaMonto(v);
  const pago = prompt(`¿Cuánto paga ahora ${v.cliente || 'el socio'}?\nDeuda pendiente: $${montoDeuda.toLocaleString('es-AR')}`);
  if (pago === null) return;
  const montoPago = parseFloat(pago) || 0;
  if (montoPago <= 0) { toast('⚠️ Monto inválido', 'var(--sc-yellow)'); return; }
  if (montoPago >= montoDeuda) {
    v.estado = 'cobrado'; v.deuda = 0; v.montoPagado = (v.montoPagado||0) + montoDeuda;
    // Actualizar vigencia_hasta del socio si corresponde a membresía
    if (v.vigencia_hasta && v.cliente) {
      const idx_s = socios.findIndex(s => s.nombre === v.cliente && s.fecha_pago === v.fecha);
      if (idx_s >= 0) socios[idx_s].estado = 'cobrado';
    }
    toast(`✅ Deuda de ${v.cliente} saldada`);
  } else {
    v.deuda = Math.max(0, montoDeuda - montoPago);
    v.montoPagado = (v.montoPagado||0) + montoPago;
    toast(`💰 Pago parcial registrado. Resta: $${v.deuda.toLocaleString('es-AR')}`);
  }
  save();
  renderDeudas();
  try { renderSocios(); } catch(e) {}
}


// ── Funciones de configuración de Base de Datos (v2.0 — Apps Script) ──

function guardarConexionDB() {
  const urlEl = document.getElementById('db-gas-url');
  const tokEl = document.getElementById('db-gas-token');
  const url   = (urlEl?.value || '').trim();
  const token = (tokEl?.value || '').trim();

  if (!url || !url.startsWith('https://script.google.com')) {
    toast('⚠️ Pegá la URL del Web App de Apps Script');
    return;
  }
  if (!token) {
    toast('⚠️ Ingresá el token de API');
    return;
  }

  localStorage.setItem('sc_gas_url',   url);
  localStorage.setItem('sc_gas_token', token);
  if (window.SC?.state) {
    window.SC.state.gasUrl   = url;
    window.SC.state.gasToken = token;
  }
  toast('💾 Configuración guardada — conectando...');
  testConexionDB();
}

async function testConexionDB() {
  const cfg = getGasConfig();
  if (!cfg.url || !cfg.token) {
    toast('⚠️ Completá la URL y el token primero');
    return;
  }
  setSyncStatus('loading', 'Probando conexión...');
  try {
    if (window.SC?.state) {
      window.SC.state.gasUrl   = cfg.url;
      window.SC.state.gasToken = cfg.token;
    }
    const ok = await window.SC?.sync?.testConexion?.();
    if (ok !== false) {
      setSyncStatus('online', 'Conectado ✅');
      toast('✅ Conexión exitosa');
      await window.SC?.sync?.loadFromRemote?.();
      renderDBStatus();
    } else {
      setSyncStatus('error', 'Error de conexión');
      toast('❌ No se pudo conectar — verificá la URL y el token');
    }
  } catch(e) {
    setSyncStatus('error', 'Error de conexión');
    toast('❌ Error: ' + e.message);
    console.error('testConexionDB error:', e);
  }
}

function desconectarDB() {
  if (!confirm('¿Desconectar la base de datos? Los datos locales se conservan.')) return;
  localStorage.removeItem('sc_gas_url');
  localStorage.removeItem('sc_gas_token');
  if (window.SC?.state) {
    window.SC.state.gasUrl   = '';
    window.SC.state.gasToken = '';
    window.SC.state.connected = false;
  }
  if (window.SC?.sync?.stopPolling) window.SC.sync.stopPolling();
  setSyncStatus('offline', 'Sin base de datos');
  toast('🔌 Desconectado');
  renderDBStatus();
}

function renderDBStatus() {
  const cfg = getGasConfig();
  const elUrl = document.getElementById('db-gas-url');
  const elTok = document.getElementById('db-gas-token');
  if (elUrl && cfg.url) elUrl.value = cfg.url;
  if (elTok && cfg.token) elTok.value = cfg.token;
  const dlast = document.getElementById('db-last-sync');
  if (dlast) dlast.textContent = window.SC?.state?.lastSyncTime
    ? new Date(window.SC.state.lastSyncTime).toLocaleTimeString('es-AR') : 'Nunca';
  const dclocal = document.getElementById('db-count-local');
  if (dclocal) dclocal.textContent = (ventas||[]).length;
  if (dbConectado) setDBStatus(true, 'Conectado a Google Sheets ✅');
  else if (cfg.url) setDBStatus(false, 'URL configurada — probar conexión');
  else setDBStatus(false, 'Sin conectar');
}

// ── Al arrancar — reconectar automáticamente si hay config GAS guardada ──
// (la reconexión real se hace en DOMContentLoaded → setTimeout → getGasConfig)

// ── Parchar registrarVenta para guardar en Sheets también ──
const _registrarVentaOrig = registrarVenta;
// (se parchea abajo en INIT para asegurar orden de carga)

// ══════════════════════════════════════════
//  SEDE ACTIVA
// ══════════════════════════════════════════

function setSede(sede) {
  sedeActual = sede;
  localStorage.setItem('sc_sede', sede);
  // Actualizar botones sidebar
  document.getElementById('sede-via24').classList.toggle('active', sede === 'VIA 24');
  document.getElementById('sede-barrio').classList.toggle('active', sede === 'BARRIO NORTE');
  // Actualizar badge topbar
  document.getElementById('topbar-sede').textContent = sede;
  // Actualizar label en formulario
  const lbl = document.getElementById('f-sede-label');
  if (lbl) lbl.textContent = sede;
  // Re-render dashboards
  try { renderDashboard(); } catch(e) {}
  try { renderDashRecepcion(); } catch(e) {}
  toast(`📍 Sede: ${sede}`);
}

// Aplicar sede guardada al cargar
const KEYS = { 
  ventas:'gc_ventas2', socios:'gc_socios', lockers_h:'gc_lockers_h', 
  lockers_m:'gc_lockers_m', cambios:'gc_cambios',
  productos:'sc_productos', egresos:'sc_egresos', wa_log:'sc_wa_log',
  crm_notas:'sc_crm_notas', crm_resueltos:'sc_crm_resueltos',
  contactos:'sc_contactos', tema:'sc_tema', sede:'sc_sede',
  admin_pass:'sc_admin_pass',
  precio_locker_grande:'sc_precio_locker_grande',
  precio_locker_mediano:'sc_precio_locker_mediano',
  precio_locker_chico:'sc_precio_locker_chico',
  packs_cafe:'sc_packs_cafe',
  turnos:'sc_turnos'
};
// [moved to store.js] let historialCambios = JSON.parse(localStorage.get...
// [moved to store.js] let contactos = JSON.parse(localStorage.getItem('s...

// ══════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════
// [alias en header] //const fmt$=n=>{ try{ return '$'+Math.round(n||0).t }catch(e){ return '$'+Math.round(n||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'); } };
// [alias en header] //const todayStr=()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
// [alias en header] //const fmtDate=s=>{ if(!s)return '-'; const[y,m,d]=s.split('-'); return `${d}/${m}/${y}`; };
// [alias en header] //const addDays=(s,n)=>{ const d=new Date(s+'T12:00: d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; };
// [alias en header] //const daysDiff=(a,b)=>Math.round((new Date(a)-new 

// Carga inicial desde cache local — Sheets sobreescribe esto al conectar
// [moved to store.js] let ventas   = JSON.parse(localStorage.getItem(KEY...
// [moved to store.js] let packsCafe = JSON.parse(localStorage.getItem('s...
// [moved to store.js] let turnos    = JSON.parse(localStorage.getItem('s...

// [moved to store.js] let socios   = JSON.parse(localStorage.getItem(KEY...
// [moved to store.js] let lockersH = JSON.parse(localStorage.getItem(KEY...
// [moved to store.js] let lockersM = JSON.parse(localStorage.getItem(KEY...

function saveData(){ save(); } // alias para compatibilidad


// ── ID único a prueba de colisiones entre PCs ──────────────────────
// [genUID movida a utils.js y re-exportada en header]


function save(){
  // localStorage = cache temporal ÚNICAMENTE — la fuente de verdad es Google Sheets
  // Sheets se actualiza en background; localStorage permite operar offline
  // 1. Cache local inmediato
  _saveLocalCache();
  // 2. Push a Sheets en background con debounce (evita N syncs por operación batch)
  if (dbConectado) {
    _syncPending = true;
    clearTimeout(window._saveDebounce);
    window._saveDebounce = setTimeout(() => { saveToSheets(); }, 1200);
  }
}

function registrarCambio(tipo, ventaId, descripcion, valorAnterior='', valorNuevo=''){
  historialCambios.unshift({
    id: genUID(), tipo, ventaId, descripcion,
    valorAnterior, valorNuevo,
    fecha: todayStr(),
    hora: new Date().toTimeString().slice(0,5),
    sede: sedeActual
  });
  if(historialCambios.length > 200) historialCambios = historialCambios.slice(0,200);
}

// Demo si vacío
if(ventas.length===0 && socios.length===0){
  loadDemo();
} else if(lockersH.length===0 && lockersM.length===0){
  // Cargar solo lockers demo si no hay ninguno configurado
  // (no sobreescribe ventas/socios reales)
}

function loadDemo(){
  const hoy=todayStr();
  const d=o=>{ const x=new Date(); x.setDate(x.getDate()-o); return x.toISOString().split('T')[0]; };
  ventas=[];
  for(let i=0;i<7;i++){
    const base=i===0?72000:60000;
    ['García Juan','López Ana','Martínez Pedro','Rodríguez María','Sánchez Luis'].forEach((c,j)=>{
      const conceptos=['membresia','membresia','semestral','pase_diario','locker','agua','cafe','barrita'];
      const met=['efectivo','transferencia','qr','debito','efectivo','transferencia','qr','efectivo'];
      const montos={'membresia':72000,'semestral':350000,'pase_diario':3000,'locker':18000,'agua':1000,'cafe':800,'barrita':1500};
      const con=conceptos[j%conceptos.length];
      ventas.push({id:Date.now()+Math.random(),fecha:d(i),hora:`${9+j}:${String(j*7%60).padStart(2,'0')}`,
        cliente:c,concepto:con,monto:montos[con]||2000,
        efectivo:met[j]=='efectivo'?montos[con]||2000:0,
        transferencia:met[j]=='transferencia'?montos[con]||2000:0,
        debito:met[j]=='debito'?montos[con]||2000:0,
        credito:0,qr:met[j]=='qr'?montos[con]||2000:0,
        obs:''});
    });
  }
  socios=[
    {nombre:'García Juan',    fecha_pago:hoy,    metodo:'Efectivo',     monto:72000, vigencia_desde:hoy,    vigencia_hasta:addDays(hoy,30),  telefono:'3814501234'},
    {nombre:'López Ana',      fecha_pago:d(5),   metodo:'Transferencia',monto:72000, vigencia_desde:d(5),   vigencia_hasta:addDays(d(5),30),  telefono:'3815602345'},
    {nombre:'Martínez Pedro', fecha_pago:d(25),  metodo:'QR',           monto:72000, vigencia_desde:d(25),  vigencia_hasta:addDays(d(25),30), telefono:'3816703456'},
    {nombre:'Rodríguez María',fecha_pago:d(29),  metodo:'Efectivo',     monto:72000, vigencia_desde:d(29),  vigencia_hasta:addDays(d(29),30), telefono:'3817804567'},
    {nombre:'Sánchez Luis',   fecha_pago:d(35),  metodo:'Transferencia',monto:72000, vigencia_desde:d(35),  vigencia_hasta:addDays(d(35),30), telefono:'3818905678'},
    // ── Socios con vencimiento próximo (para ver en Alertas) ──
    {nombre:'Fernández Carla',fecha_pago:d(27),  metodo:'Débito',       monto:72000, vigencia_desde:d(27),  vigencia_hasta:addDays(hoy,1),   telefono:'3814111001'},
    {nombre:'Juárez Tomás',   fecha_pago:d(26),  metodo:'Efectivo',     monto:72000, vigencia_desde:d(26),  vigencia_hasta:addDays(hoy,3),   telefono:'3815222002'},
    {nombre:'Romero Lucía',   fecha_pago:d(28),  metodo:'Transferencia',monto:72000, vigencia_desde:d(28),  vigencia_hasta:addDays(hoy,-2),  telefono:'3816333003'},
  ];
  lockersH=[
    {numero:1,tamaño:'GRANDE',precio:18000,socio:'Romano Ricardo',telefono:'3816163194',vencimiento:addDays(hoy,5)},
    {numero:2,tamaño:'GRANDE',precio:18000,socio:'Albornoz Daniel',telefono:'3816092478',vencimiento:addDays(hoy,32)},
    {numero:3,tamaño:'GRANDE',precio:18000,socio:'Medina Lautaro',telefono:'3812852222',vencimiento:addDays(hoy,32)},
    {numero:4,tamaño:'CHICO',precio:12000,socio:'',telefono:'',vencimiento:''},
    {numero:5,tamaño:'CHICO',precio:12000,socio:'Pérez Carlos',telefono:'3814111222',vencimiento:addDays(hoy,-3)},
  ];
  lockersM=[
    {numero:101,tamaño:'GRANDE',precio:18000,socio:'García Ana',telefono:'3815001111',vencimiento:addDays(hoy,15)},
    {numero:102,tamaño:'CHICO',precio:12000,socio:'',telefono:'',vencimiento:''},
    {numero:103,tamaño:'GRANDE',precio:18000,socio:'López Valentina',telefono:'3815002222',vencimiento:addDays(hoy,-1)},
  ];
  save();
}

function ventaMonto(v){ const n=x=>parseFloat(x)||0; return n(v.monto)||(n(v.efectivo)+n(v.transferencia)+n(v.debito)+n(v.credito)+n(v.qr)); }

function socioEstado(s){
  const hoy=todayStr();
  if(!s.vigencia_hasta) return 'vencido';
  const dias=daysDiff(s.vigencia_hasta, hoy);
  if(dias<0) return 'vencido';
  if(dias<=7) return 'por_vencer';
  return 'aldia';
}

function lockerEstado(l){
  if(!l.socio) return 'libre';
  if(!l.vencimiento) return 'ocupado';
  const dias=daysDiff(l.vencimiento, todayStr());
  if(dias<0) return 'ocupado_vencido';
  if(dias<=7) return 'vence-pronto';
  return 'ocupado';
}

function toast(msg, color='var(--green)'){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.style.background=color;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

function closeModal(id){ const m=document.getElementById(id); if(m) m.classList.remove('open'); }
function openModal(id){ const m=document.getElementById(id); if(m) m.classList.add('open'); }

// ══════════════════════════════════════════
//  NAVEGACIÓN
// ══════════════════════════════════════════
const TITLES={'dash-recepcion':'PANEL RECEPCIÓN',dashboard:'DASHBOARD · ADMINISTRADOR',registrar:'REGISTRAR VENTA',caja:'CIERRE DE CAJA',
  recaudacion:'RECAUDACIÓN',historial:'HISTORIAL',socios:'MEMBRESÍAS',
  lockers:'GESTIÓN DE LOCKERS',alertas:'ALERTAS Y VENCIMIENTOS',deudas:'DEUDAS Y PAGOS PARCIALES',
  calendario:'CALENDARIO DE VENCIMIENTOS',productos:'PRODUCTOS Y PRECIOS',retiros:'RETIROS DE CAJA',wa:'HISTORIAL WHATSAPP',exportar:'EXPORTAR PARA EL CONTADOR',importar:'IMPORTAR DESDE EXCEL',db:'CONFIGURACIÓN BASE DE DATOS',
  'pack-cafe':'PACK DE CAFÉ ☕',
  turnos:'CAMBIO DE TURNO 🔄'};


function toggleNavGroup(group) {
  const items = document.getElementById('nav-items-' + group);
  const arrow = document.getElementById('nav-arrow-' + group);
  if (!items) return;
  const isCollapsed = items.classList.contains('collapsed');
  items.classList.toggle('collapsed', !isCollapsed);
  if (arrow) arrow.classList.toggle('collapsed', !isCollapsed);
}

function goTo(sec, el){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('section-'+sec).classList.add('active');
  if(el) el.classList.add('active');
  document.getElementById('page-title').textContent=TITLES[sec]||sec.toUpperCase();
  const renders={
  'dash-recepcion': renderDashRecepcion,
  dashboard:   renderDashboard,
  caja:        ()=>{ const cf=document.getElementById('caja-fecha'); if(cf) cf.value=todayStr(); renderCaja(); },
  recaudacion: renderRecaudacion,
  historial:   ()=>{ const hs=document.getElementById('h-sede'); if(hs) hs.value=sedeActual; renderHistorial(); },
  socios:      renderSocios,
  lockers:     renderLockers,
  retiros:     renderRetiros,
  calendario:  renderCalendario,
  productos:   renderProductos,
  deudas:      renderDeudas,
  egresos:     renderEgresos,
  wa:          renderWAlog,
  alertas:     ()=>{ renderAlertas(); try{ renderCRMRanking(); }catch(e){} },
  exportar:    initExportarSelect,
  importar:    renderImportStatus,
  db:          renderDBStatus,
  registrar:   ()=>{ setFechaHoy(); actualizarSelectConceptos(); renderProductos(); renderQuickButtons(); setTimeout(function(){ if(!document.getElementById('f-concepto').value) seleccionarConcepto('membresia'); },50); },
  'pack-cafe': ()=>{ renderPackCafe(); },
  turnos:      ()=>{ renderTurnos(); }
};
  if(renders[sec]) renders[sec]();
}

// topbar-date se inicializa en DOMContentLoaded

// ══════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════
function renderDashboard(){
  const hoy = todayStr();
  const mes  = hoy.slice(0,7);
  const mesAnt = (() => {
    const d = new Date(hoy); d.setDate(1); d.setMonth(d.getMonth()-1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  })();

  const filtrarSede = (sede, arr) => arr.filter(v =>
    !v.anulada && (v.concepto !== 'retiro') && (v.concepto !== 'egreso') && !v._esGasto && (v.sede === sede));

  const sumV = arr => arr.reduce((a,v) => a + ventaMonto(v), 0);
  const ef   = arr => arr.reduce((a,v) => a + (v.efectivo||0), 0);

  // ── Por sede / hoy ──
  const v24Hoy = filtrarSede('VIA 24',      ventas.filter(v => v.fecha === hoy));
  const bnHoy  = filtrarSede('BARRIO NORTE', ventas.filter(v => v.fecha === hoy));

  // ── Por sede / mes ──
  const v24Mes    = filtrarSede('VIA 24',      ventas.filter(v => v.fecha?.startsWith(mes)));
  const bnMes     = filtrarSede('BARRIO NORTE', ventas.filter(v => v.fecha?.startsWith(mes)));
  const v24MesAnt = filtrarSede('VIA 24',      ventas.filter(v => v.fecha?.startsWith(mesAnt)));
  const bnMesAnt  = filtrarSede('BARRIO NORTE', ventas.filter(v => v.fecha?.startsWith(mesAnt)));

  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

  // Hoy por sede
  set('d-hoy-v24',     fmt$(sumV(v24Hoy)));
  set('d-hoy-v24-sub', `${v24Hoy.length} transacción${v24Hoy.length!==1?'es':''}`);
  set('d-hoy-v24-ef',  fmt$(ef(v24Hoy)));
  set('d-hoy-bn',      fmt$(sumV(bnHoy)));
  set('d-hoy-bn-sub',  `${bnHoy.length} transacción${bnHoy.length!==1?'es':''}`);
  set('d-hoy-bn-ef',   fmt$(ef(bnHoy)));

  // Mes por sede + comparativa
  const setMes = (idVal, idSub, idVs, idBar, arrMes, arrAnt) => {
    const tot    = sumV(arrMes);
    const totAnt = sumV(arrAnt);
    set(idVal, fmt$(tot));
    set(idSub, `${arrMes.length} ventas este mes`);
    if (totAnt > 0) {
      const pct  = Math.round((tot - totAnt) / totAnt * 100);
      const sube = pct >= 0;
      const vsEl = document.getElementById(idVs);
      if (vsEl) {
        vsEl.textContent = `${sube?'▲':'▼'} ${Math.abs(pct)}% vs mes ant.`;
        vsEl.style.color = sube ? 'var(--green)' : 'var(--sc-red)';
      }
      const barEl = document.getElementById(idBar);
      if (barEl) barEl.style.width = Math.min(Math.round(tot / Math.max(tot,totAnt) * 100), 100) + '%';
    } else {
      set(idVs, 'Sin datos anteriores');
    }
  };
  setMes('d-mes-v24','d-mes-v24-sub','d-mes-v24-vs','d-mes-v24-bar', v24Mes, v24MesAnt);
  setMes('d-mes-bn', 'd-mes-bn-sub', 'd-mes-bn-vs', 'd-mes-bn-bar',  bnMes,  bnMesAnt);

  // Clientes únicos del mes (ambas sedes)
  const clientesMes = new Set(
    [...v24Mes, ...bnMes].map(v => v.cliente || v.detalle).filter(Boolean)
  ).size;
  set('d-socios', clientesMes);
  const alerts = getAlertas();
  set('d-alertas', alerts.length);
  const badge = document.getElementById('alerts-badge');
  if (badge) { badge.textContent = alerts.length; badge.style.display = alerts.length ? 'inline' : 'none'; }

  // Chart semana — ambas sedes combinadas
  const chart = document.getElementById('chart-week');
  if (chart) {
    const days = [];
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      days.push({label:d.toLocaleDateString('es-AR',{weekday:'short'}), total:sumV(ventas.filter(v=>v.fecha===ds&&!v.anulada))});
    }
    const max=Math.max(...days.map(d=>d.total),1);
    chart.innerHTML=days.map(({label,total})=>`
      <div class="bar-wrap">
        <div class="bar" style="height:${Math.max(Math.round(total/max*100),2)}%" data-val="${fmt$(total)}"></div>
        <div class="bar-label">${label}</div>
      </div>`).join('');
  }

  // Métodos de pago — mes ambas sedes
  const ventasMes = [...v24Mes, ...bnMes];
  const metEl = document.getElementById('dash-metodos');
  if (metEl) {
    const metMap={efectivo:'💵 Efectivo',transferencia:'🏦 Transf.',debito:'💳 Débito',credito:'💳 Crédito',qr:'📱 QR'};
    const metTotals={efectivo:0,transferencia:0,debito:0,credito:0,qr:0};
    ventasMes.forEach(v=>{
      metTotals.efectivo+=v.efectivo||0; metTotals.transferencia+=v.transferencia||0;
      metTotals.debito+=v.debito||0; metTotals.credito+=v.credito||0; metTotals.qr+=v.qr||0;
      if(v.monto&&!v.efectivo&&!v.transferencia){
        const m=v.metodo||'efectivo';
        if(metTotals[m]!==undefined) metTotals[m]+=v.monto; else metTotals.efectivo+=v.monto;
      }
    });
    const totalMet=Object.values(metTotals).reduce((a,b)=>a+b,1);
    metEl.innerHTML=Object.entries(metTotals).filter(([,v])=>v>0).map(([k,v])=>{
      const pct=Math.round(v/totalMet*100);
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span>${metMap[k]}</span><span style="color:var(--teal)">${fmt$(v)}</span>
        </div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--teal)"></div></div>
      </div>`;
    }).join('')||'<div style="color:var(--muted);font-size:12px">Sin datos este mes</div>';
  }

  // Últimas 5 ventas — ambas sedes
  const ultimas=[...ventas].filter(v=>!v.anulada).sort((a,b)=>b.id-a.id).slice(0,5);
  const conceptoLabel=c=>({membresia:'Membresía',semestral:'Semestral',anual:'Anual',pase_diario:'Pase diario',
    locker:'Locker',agua:'Agua',cafe:'Café',pack_cafe:'Pack café',barrita:'Barrita',
    power:'Power/Monster',soda:'Soda',sauna:'Sauna',rutina:'Rutina',egreso:'Egreso',
    retiro:'Retiro',otro:'Otro'}[c]||c||'Otro');
  const dashTable = document.getElementById('dash-table');
  if (dashTable) {
    dashTable.innerHTML=ultimas.map(v=>{
      const cambios=historialCambios.filter(c=>c.ventaId===v.id).length;
      return `<tr>
        <td><div><strong>${v.cliente||v.detalle||'-'}</strong></div>
          <div class="comprobante">${v.numero||'—'}</div></td>
        <td><span class="badge badge-teal">${conceptoLabel(v.concepto)}</span></td>
        <td><span style="font-size:10px;color:var(--muted)">${v.sede||'-'}</span></td>
        <td><strong>${fmt$(ventaMonto(v))}</strong></td>
        <td style="color:var(--muted)">${v.hora||'-'}${cambios>0?` <span class="hist-chip" title="${cambios} cambio(s)">✏️ ${cambios}</span>`:''}</td>
        <td><button class="btn-edit" onclick="editarConBloqueo(${v.id})">✏️</button></td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:20px">Sin ventas registradas</td></tr>';
  }

  // Alertas rápidas en dash
  const dashAlerts=getAlertas().slice(0,5);
  const dashAlertsEl = document.getElementById('dash-alerts');
  if (dashAlertsEl) {
    dashAlertsEl.innerHTML=dashAlerts.map(a=>`
      <div class="alert-item ${a.tipo}">
        <div class="alert-dot ${a.tipo}"></div>
        <div><div style="font-size:12px;font-weight:500">${a.titulo}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${a.desc}</div></div>
      </div>`).join('')||'<div style="color:var(--muted);font-size:12px;padding:10px">Sin alertas 🎉</div>';
  }

  // KPIs de turno en dashboard
  const hoyDash = todayStr();
  const turnosHoyDash = (typeof turnos !== 'undefined' ? turnos : []).filter(t => t.fecha === hoyDash).sort((a,b)=>a.inicio.localeCompare(b.inicio));
  const calcT = (t) => {
    if (!t) return {total:0,cant:0};
    const fin = t.cierre || '23:59';
    const vts = ventas.filter(v=>!v.anulada&&v.fecha===hoyDash&&v.hora>=t.inicio&&v.hora<=fin&&v.concepto!=='retiro'&&v.concepto!=='egreso'&&!v._esGasto);
    return {total:vts.reduce((a,v)=>a+ventaMonto(v),0),cant:vts.length,personal:t.personal};
  };
  const dm = calcT(turnosHoyDash[0]);
  const dt = calcT(turnosHoyDash[1]);
  const dtot = dm.total + dt.total;
  const dtotCant = dm.cant + dt.cant;
  const setD = (id,val) => {const e=document.getElementById(id); if(e) e.textContent=val;};
  setD('dash-t-manana',     fmt$(dm.total));
  setD('dash-t-manana-sub', (dm.personal||'Sin turno')+' · '+dm.cant+' venta'+(dm.cant!==1?'s':''));
  setD('dash-t-tarde',      fmt$(dt.total));
  setD('dash-t-tarde-sub',  (dt.personal||'Sin turno')+' · '+dt.cant+' venta'+(dt.cant!==1?'s':''));
  setD('dash-t-total',      fmt$(dtot));
  setD('dash-t-total-sub',  dtotCant+' venta'+(dtotCant!==1?'s':'')+' hoy');

  renderDashStockAlerta();
}


function metodoLabel(m){
  return {efectivo:'💵 Efectivo',transferencia:'🏦 Transf.',debito:'💳 Débito',credito:'💳 Crédito',qr:'📱 QR',
    'Efectivo':'💵 Efectivo','Transferencia':'🏦 Transf.','Débito':'💳 Débito','TC':'💳 Crédito'}[m]||m||'—';
}

// ══════════════════════════════════════════
//  REGISTRAR VENTA
// ══════════════════════════════════════════
function refreshDatalist(){
  const dl=document.getElementById('socios-list');
  dl.innerHTML=socios.map(s=>`<option value="${s.nombre}">`).join('');
}

function registrarVenta(){
  const cliente=document.getElementById('f-cliente').value.trim();
  let fecha=document.getElementById('f-fecha').value;
  const concepto=document.getElementById('f-concepto').value;
  const monto=parseFloat(document.getElementById('f-monto').value)||0;
  const unidades=parseInt(document.getElementById('f-unidades')?.value)||1;
  const metodo=document.getElementById('f-metodo').value;
  const estado=document.getElementById('f-estado').value;
  const obs=document.getElementById('f-obs').value.trim();
  const pagoMixto = document.getElementById('f-pago-mixto')?.checked;

  // fecha siempre es hoy -- forzar si el hidden quedo vacio
  if(!fecha){ fecha = todayStr(); const _hf=document.getElementById('f-fecha'); if(_hf) _hf.value=fecha; }
  if(!concepto){ toast('⚠️ Seleccioná un concepto','var(--sc-yellow)'); return; }
  // Validar cliente para conceptos que lo requieren
  const conceptosSinCliente = ['retiro','egreso','cortesia'];
  if(!cliente && !conceptosSinCliente.includes(concepto)){
    toast('⚠️ Ingresá el nombre del cliente','var(--sc-yellow)'); return;
  }
  if(monto<0){ toast('⚠️ Monto inválido','var(--sc-yellow)'); return; }
  if(monto===0 && concepto !== 'cortesia' && concepto !== 'ficha_tragada'){ toast('⚠️ Ingresá un monto válido','var(--sc-yellow)'); return; }

  const hora=new Date().toTimeString().slice(0,5);
  const seq = parseInt(localStorage.getItem(sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24') || '0') + 1;
  const seqKey = sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24';
  localStorage.setItem(seqKey, seq);
  const prefix = sedeActual === 'BARRIO NORTE' ? 'SC-BN-' : 'SC-V24-';
  const numero = prefix + String(seq).padStart(6,'0');

  // Distribución por método de pago
  let ef=0,tr=0,deb=0,cred=0,qr=0,metodoLabel=metodo;
  if (pagoMixto && monto > 0) {
    const m1 = document.getElementById('f-metodo1')?.value || 'efectivo';
    const m2 = document.getElementById('f-metodo2')?.value || 'transferencia';
    const v1 = parseFloat(document.getElementById('f-monto1')?.value) || 0;
    const v2 = Math.max(0, monto - v1);
    if (v1 <= 0 || v1 > monto) { toast('⚠️ El monto del primer método es inválido','var(--sc-yellow)'); return; }
    const add = (m,val) => { if(m==='efectivo') ef+=val; else if(m==='transferencia') tr+=val; else if(m==='debito') deb+=val; else if(m==='credito') cred+=val; else if(m==='qr') qr+=val; };
    add(m1,v1); add(m2,v2);
    metodoLabel = m1+'+'+m2;
  } else {
    if(metodo==='efectivo') ef=monto; else if(metodo==='transferencia') tr=monto;
    else if(metodo==='debito') deb=monto; else if(metodo==='credito') cred=monto; else if(metodo==='qr') qr=monto;
  }

  const v={id: genUID(), timestamp: Date.now(),numero,fecha,hora,cliente,concepto,sede:sedeActual,unidades,monto:monto,
    efectivo:ef, transferencia:tr, debito:deb, credito:cred, qr:qr,
    metodo:metodoLabel, pagoMixto:pagoMixto||false, obs, estado};
  // Si es membresía, registrar en socios con vencimiento según plan
  const diasPorConcepto = { membresia:30, semestral:180, anual:365, pase_diario:1 };
  // pack_cafe: se registra normalmente, el nombre del comprador va en 'cliente'
  if (diasPorConcepto[concepto] && cliente) {
    const diasVig = diasPorConcepto[concepto];
    const vigDesde = fecha;
    const vigHasta = addDaysStr(fecha, diasVig);
    socios.push({
      nombre: cliente,
      fecha_pago: fecha,
      metodo: metodo,
      monto: monto,
      concepto: concepto,
      vigencia_desde: vigDesde,
      vigencia_hasta: vigHasta,
      estado: estado,
      montoParcial: estado === 'parcial' ? (parseFloat(document.getElementById('f-monto-parcial')?.value)||0) : null,
      sede: sedeActual
    });
    saveSocios();
  }

  // Si es pago parcial, registrar deuda + teléfono de contacto
  if (estado === 'parcial' && cliente) {
    const montoPagado = parseFloat(document.getElementById('f-monto-parcial')?.value) || 0;
    const telDeuda = document.getElementById('f-tel-deuda')?.value?.trim() || '';
    const deuda = Math.max(0, monto - montoPagado);
    if (deuda > 0) {
      v.deuda = deuda;
      v.montoPagado = montoPagado;
      v.estadoDeuda = 'pendiente';
      if (telDeuda) v.telefono = telDeuda;
    }
  }

  ventas.push(v);
  save();
  guardarVentaSheets(v).catch(()=>{});
  descontarStock(concepto, unidades); // descontar stock según unidades
  renderDashRecepcion();
  if (document.getElementById('section-dashboard')?.classList.contains('active')) renderDashboard();
  toast(`✅ ${numero} registrado`);
  mostrarConfirmVenta(v);
  limpiarForm();
}

function limpiarForm(){
  ['f-cliente','f-obs'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-monto').value='';
  setFechaHoy();
  seleccionarConcepto('membresia');
  document.getElementById('f-metodo').value='efectivo';
  document.getElementById('f-estado').value='cobrado';
  const pw=document.getElementById('f-parcial-wrap'); if(pw) pw.style.display='none';
  const mp=document.getElementById('f-monto-parcial'); if(mp) mp.value='';
  const dp=document.getElementById('f-deuda-preview'); if(dp) dp.style.display='none';
  const tw=document.getElementById('f-tel-deuda-wrap'); if(tw) tw.style.display='none';
  const td=document.getElementById('f-tel-deuda'); if(td) td.value='';
  // Reset pago mixto
  const pmToggle=document.getElementById('f-pago-mixto'); if(pmToggle) pmToggle.checked=false;
  const pmWrap=document.getElementById('f-pago-mixto-wrap'); if(pmWrap) pmWrap.style.display='none';
  const m1i=document.getElementById('f-monto1'); if(m1i) m1i.value='';
  const m2i=document.getElementById('f-monto2'); if(m2i) m2i.value='';
  const mprev=document.getElementById('f-mixto-preview'); if(mprev) mprev.innerHTML='';
}

// ══════════════════════════════════════════
//  CIERRE DE CAJA
// ══════════════════════════════════════════
// caja-fecha se inicializa en DOMContentLoaded

function renderCaja(){
  const fecha=document.getElementById('caja-fecha').value||todayStr();
  const del_dia=ventas.filter(v=>v.fecha===fecha && (!v.sede || v.sede===sedeActual));
  // Anuladas se muestran separadas, no suman al total
  const del_dia_activas=del_dia.filter(v=>!v.anulada);
  const del_dia_anuladas=del_dia.filter(v=>v.anulada);

  const sumCampo=(arr,campo)=>arr.reduce((a,v)=>a+(v[campo]||0),0);
  const esEgresoV=v=>v.concepto==='egreso'||v.concepto==='retiro'||v._esGasto;
  const sumTotal=arr=>arr.filter(v=>!esEgresoV(v)).reduce((a,v)=>a+ventaMonto(v),0);
  const sumEgresos=arr=>arr.filter(esEgresoV).reduce((a,v)=>a+ventaMonto(v),0);

  // Por concepto (solo activas)
  const conMap={};
  del_dia_activas.forEach(v=>{
    const c=v.concepto||'otro';
    conMap[c]=(conMap[c]||0)+ventaMonto(v);
  });
  const cLabel={membresia:'Membresía',semestral:'Semestral',anual:'Anual',pase_diario:'Pase diario',
    locker:'Locker',agua:'Agua',cafe:'Café',pack_cafe:'Pack café',barrita:'Barrita',
    power:'Power/Monster',soda:'Soda',sauna:'Sauna',rutina:'Rutina',
    egreso:'Egreso',retiro:'Retiro',otro:'Otro'};
  document.getElementById('caja-conceptos').innerHTML=
    Object.entries(conMap).filter(([,v])=>v>0).map(([k,v])=>
      `<div class="caja-row"><span>${cLabel[k]||k}</span><span style="color:var(--green);font-weight:600">${fmt$(v)}</span></div>`
    ).join('')||'<div style="color:var(--muted);font-size:12px">Sin movimientos</div>';

  // Por método
  const metodos={efectivo:'💵 Efectivo',transferencia:'🏦 Transferencia',debito:'💳 Débito',credito:'💳 Crédito',qr:'📱 QR'};
  document.getElementById('caja-metodos').innerHTML=
    Object.entries(metodos).map(([k,label])=>{
      const t=sumCampo(del_dia_activas,k);
      return t>0?`<div class="caja-row"><span>${label}</span><span style="color:var(--teal);font-weight:600">${fmt$(t)}</span></div>`:'';
    }).join('')||'<div style="color:var(--muted);font-size:12px">Sin datos</div>';

  // Resumen
  const total=sumTotal(del_dia_activas);
  const efectivo=sumCampo(del_dia_activas,'efectivo');
  document.getElementById('caja-resumen').innerHTML=`
    <div class="caja-row"><span>Transacciones activas</span><strong>${del_dia_activas.length}</strong></div>
    <div class="caja-row"><span>Anuladas (no suman)</span><strong style="color:#f59e0b">${del_dia_anuladas.length}</strong></div>
    <div class="caja-row"><span>Efectivo en caja</span><strong style="color:var(--green)">${fmt$(efectivo)}</strong></div>
    <div class="caja-row"><span>Digital (transf + QR + deb)</span><strong style="color:var(--teal)">${fmt$(total-efectivo)}</strong></div>
  `;
  document.getElementById('caja-total').textContent=fmt$(total);
  document.getElementById('caja-total-sub').textContent=`${del_dia_activas.length} activas · ${del_dia_anuladas.length} anuladas — ${fmtDate(fecha)}`;
}


// ══════════════════════════════════════════════════════
//  PLANILLA PARA EL CONTADOR (.xlsx)
// ══════════════════════════════════════════════════════
async function exportarPlanillaContador() {
  // Cargar SheetJS si no está
  if (typeof XLSX === 'undefined') {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const desde = document.getElementById('cont-desde')?.value || '';
  const hasta = document.getElementById('cont-hasta')?.value || todayStr();
  const sedeF = document.getElementById('cont-sede')?.value  || '';

  const base = ventas.filter(v => {
    if (v.anulada) return false;
    if (desde && v.fecha < desde) return false;
    if (v.fecha > hasta) return false;
    if (sedeF && v.sede !== sedeF) return false;
    return true;
  });

  const esEgr = v => v.concepto==='egreso' || v.concepto==='retiro' || v._esGasto || v._esRetiro;
  const ingresos = base.filter(v => !esEgr(v));
  const egresos  = base.filter(v =>  esEgr(v));

  const wb = XLSX.utils.book_new();

  // ── HOJA 1: INGRESOS ──────────────────────────────────────
  const headI = ['Fecha','Hora','N° Comprobante','Sede','Cliente / Detalle',
                 'Concepto','Efectivo','Transferencia','Débito','Crédito','QR','TOTAL','Método','Observaciones'];
  const rowsI = ingresos.map(v => [
    v.fecha, v.hora||'', v.numero||'',
    v.sede||'', v.cliente||v.detalle||'',
    v.concepto||'',
    v.efectivo||0, v.transferencia||0, v.debito||0, v.credito||0, v.qr||0,
    ventaMonto(v),
    v.metodo||'', v.obs||''
  ]);
  // Fila de totales
  if (rowsI.length) {
    rowsI.push(['','','','','','TOTAL',
      ingresos.reduce((a,v)=>a+(v.efectivo||0),0),
      ingresos.reduce((a,v)=>a+(v.transferencia||0),0),
      ingresos.reduce((a,v)=>a+(v.debito||0),0),
      ingresos.reduce((a,v)=>a+(v.credito||0),0),
      ingresos.reduce((a,v)=>a+(v.qr||0),0),
      ingresos.reduce((a,v)=>a+ventaMonto(v),0),
      '','']);
  }
  const wsI = XLSX.utils.aoa_to_sheet([headI, ...rowsI]);
  wsI['!cols'] = [8,6,16,12,24,16,10,14,8,8,8,12,12,18].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsI, 'Ingresos');

  // ── HOJA 2: EGRESOS ───────────────────────────────────────
  const headE = ['Fecha','Hora','N° Comprobante','Sede','Detalle',
                 'Tipo','Monto','Método','Observaciones'];
  const rowsE = egresos.map(v => [
    v.fecha, v.hora||'', v.numero||'',
    v.sede||'', v.cliente||v.detalle||'',
    v.concepto==='retiro' ? 'Retiro de caja' : 'Gasto',
    ventaMonto(v),
    v.metodo||'efectivo', v.obs||''
  ]);
  if (rowsE.length) {
    rowsE.push(['','','','','','TOTAL',
      egresos.reduce((a,v)=>a+ventaMonto(v),0),'','']);
  }
  const wsE = XLSX.utils.aoa_to_sheet([headE, ...rowsE]);
  wsE['!cols'] = [8,6,16,12,28,16,12,12,20].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsE, 'Egresos');

  // ── HOJA 3: EGRESOS REGISTRADOS (módulo Egresos) ──────────
  if (typeof egresos !== "undefined" && egresos && egresos.length) {
    const headEr = ['Descripción','Categoría','Monto','Vencimiento','Estado',
                    'Fecha pago','Método','Recurrencia','Notas'];
    const rowsEr = egresos.map(eg => [
      eg.desc||'', eg.categoria||'', eg.monto||0,
      eg.vencimiento||'', eg.estado||'',
      eg.fechaPago||'', eg.metodoPago||'',
      eg.recurrencia||'', eg.notas||''
    ]);
    const wsEr = XLSX.utils.aoa_to_sheet([headEr, ...rowsEr]);
    wsEr['!cols'] = [28,16,12,12,10,12,12,12,28].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, wsEr, 'Egresos registrados');
  }

  // ── HOJA 4: RESUMEN ───────────────────────────────────────
  const totalIng = ingresos.reduce((a,v)=>a+ventaMonto(v),0);
  const totalEgr = egresos.reduce((a,v)=>a+ventaMonto(v),0);
  const neto     = totalIng - totalEgr;

  // Agrupar ingresos por concepto
  const porConcepto = {};
  ingresos.forEach(v => {
    const c = v.concepto || 'otro';
    porConcepto[c] = (porConcepto[c]||0) + ventaMonto(v);
  });

  // Agrupar por método de pago
  const porMetodo = { efectivo:0, transferencia:0, debito:0, credito:0, qr:0 };
  ingresos.forEach(v => {
    porMetodo.efectivo      += v.efectivo||0;
    porMetodo.transferencia += v.transferencia||0;
    porMetodo.debito        += v.debito||0;
    porMetodo.credito       += v.credito||0;
    porMetodo.qr            += v.qr||0;
  });

  const rowsR = [
    ['RESUMEN CONTABLE — SportClub Tucumán'],
    [''],
    ['Período', desde ? `${desde} al ${hasta}` : `hasta ${hasta}`],
    ['Sede', sedeF || 'Todas'],
    ['Generado', new Date().toLocaleString('es-AR')],
    [''],
    ['── RESUMEN GENERAL ──'],
    ['Total ingresos', totalIng],
    ['Total egresos',  totalEgr],
    ['RESULTADO NETO', neto],
    [''],
    ['── INGRESOS POR CONCEPTO ──'],
    ...Object.entries(porConcepto).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k, v]),
    [''],
    ['── INGRESOS POR MÉTODO DE PAGO ──'],
    ['Efectivo',      porMetodo.efectivo],
    ['Transferencia', porMetodo.transferencia],
    ['Débito',        porMetodo.debito],
    ['Crédito',       porMetodo.credito],
    ['QR / MP',       porMetodo.qr],
    [''],
    ['── CANTIDADES ──'],
    ['Transacciones de ingreso', ingresos.length],
    ['Egresos / retiros',        egresos.length],
  ];
  const wsR = XLSX.utils.aoa_to_sheet(rowsR);
  wsR['!cols'] = [{wch:30},{wch:18}];
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumen');

  // ── DESCARGAR ─────────────────────────────────────────────
  const label = sedeF ? sedeF.replace(/\s/g,'_') : 'todas_sedes';
  const fname = `sportclub_contador_${desde||'inicio'}_al_${hasta}_${label}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast('📊 Planilla descargada correctamente');
}

function exportarCajaTxt(){
  const fecha=document.getElementById('caja-fecha').value||todayStr();
  const del_dia=ventas.filter(v=>v.fecha===fecha && (!v.sede || v.sede===sedeActual));
  // Anuladas se muestran separadas, no suman al total
  const del_dia_activas=del_dia.filter(v=>!v.anulada);
  const del_dia_anuladas=del_dia.filter(v=>v.anulada);
  if(!del_dia.length){ toast('⚠️ Sin ventas para esta fecha','var(--sc-yellow)'); return; }
  const total=del_dia.reduce((a,v)=>a+ventaMonto(v),0);
  let txt=`CIERRE DE CAJA — ${fmtDate(fecha)}\n${'═'.repeat(40)}\n\n`;
  txt+=`TOTAL: ${fmt$(total)}\n\nDETALLE:\n`;
  del_dia.forEach(v=>{
    txt+=`  ${v.hora||'--:--'}  ${(v.cliente||v.detalle||'').padEnd(22)} ${(v.concepto||'').padEnd(14)} ${fmt$(ventaMonto(v)).padStart(12)}\n`;
  });
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`cierre_${fecha}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast('📄 Exportado');
}

// ══════════════════════════════════════════
//  RECAUDACIÓN
// ══════════════════════════════════════════
// [moved to store.js] let currentPeriod='semana';...
function setPeriod(p,el){
  currentPeriod=p;
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderRecaudacion();
}

function renderRecaudacion(){
  let dias=[];
  const hoy=todayStr();
  if(currentPeriod==='semana'){
    for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); dias.push(d.toISOString().split('T')[0]); }
  } else if(currentPeriod==='mes'){
    const m=hoy.slice(0,7);
    dias=[...new Set(ventas.filter(v=>v.fecha&&v.fecha.startsWith(m)).map(v=>v.fecha))].sort();
  } else {
    dias=[...new Set(ventas.filter(v=>v.fecha).map(v=>v.fecha))].sort().slice(-45);
  }
  const sumV=arr=>arr.reduce((a,v)=>a+ventaMonto(v),0);
  const vFiltradas=ventas.filter(v=>dias.includes(v.fecha) && (!v.sede || v.sede===sedeActual) && v.concepto!=='egreso' && !v._esGasto);
  const total=sumV(vFiltradas);
  const prom=dias.length?total/dias.length:0;
  const porDia=dias.map(d=>({d,t:sumV(ventas.filter(v=>v.fecha===d && v.concepto!=='egreso' && !v._esGasto))}));
  const mejor=porDia.reduce((a,b)=>b.t>a.t?b:a,{d:'',t:0});

  document.getElementById('r-total').textContent=fmt$(total);
  document.getElementById('r-prom').textContent=fmt$(prom);
  document.getElementById('r-mejor').textContent=fmt$(mejor.t);
  document.getElementById('r-mejor-fecha').textContent=mejor.d?fmtDate(mejor.d):'-';

  const chart=document.getElementById('chart-recaud');
  const max=Math.max(...porDia.map(d=>d.t),1);
  chart.innerHTML=porDia.map(({d,t})=>{
    const lbl=new Date(d+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'});
    return `<div class="bar-wrap">
      <div class="bar" style="height:${Math.max(Math.round(t/max*100),2)}%" data-val="${fmt$(t)}"></div>
      <div class="bar-label">${lbl}</div>
    </div>`;
  }).join('');

  // Por concepto
  const conMap={};
  vFiltradas.forEach(v=>{ if(v.concepto==='egreso'||v._esGasto) return; const c=v.concepto||'otro'; conMap[c]=(conMap[c]||0)+ventaMonto(v); });
  const cLabel={membresia:'Membresía',semestral:'Semestral',anual:'Anual',pase_diario:'Pase diario',
    locker:'Locker',cafe:'Café',agua:'Agua',barrita:'Barrita',power:'Power/Monster',otro:'Otros'};
  const sorted=Object.entries(conMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('r-conceptos').innerHTML=sorted.map(([k,v])=>{
    const pct=total?Math.round(v/total*100):0;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span>${cLabel[k]||k}</span><span style="color:var(--accent)">${fmt$(v)}</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--sc-red)"></div></div>
    </div>`;
  }).join('')||'<div style="color:var(--muted);font-size:12px">Sin datos</div>';

  // Por método
  const mets={efectivo:0,transferencia:0,debito:0,credito:0,qr:0};
  vFiltradas.forEach(v=>{
    mets.efectivo+=v.efectivo||0; mets.transferencia+=v.transferencia||0;
    mets.debito+=v.debito||0; mets.credito+=v.credito||0; mets.qr+=v.qr||0;
    if(v.monto&&!v.efectivo&&!v.transferencia&&!v.debito&&!v.credito&&!v.qr){
      const m=v.metodo||'efectivo'; if(mets[m]!==undefined) mets[m]+=v.monto; else mets.efectivo+=v.monto;
    }
  });
  const mTotal=Object.values(mets).reduce((a,b)=>a+b,1);
  const mLabel={efectivo:'💵 Efectivo',transferencia:'🏦 Transf.',debito:'💳 Débito',credito:'💳 Crédito',qr:'📱 QR'};
  document.getElementById('r-metodos').innerHTML=Object.entries(mets).filter(([,v])=>v>0).map(([k,v])=>{
    const pct=Math.round(v/mTotal*100);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span>${mLabel[k]}</span><span style="color:var(--teal)">${fmt$(v)}</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--teal)"></div></div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
//  EDITAR VENTA
// ══════════════════════════════════════════
function abrirEditar(id){
  const v = ventas.find(x=>x.id===id);
  if(!v) return;
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-cliente').value = v.cliente||v.detalle||'';
  document.getElementById('edit-fecha').value = v.fecha||'';
  document.getElementById('edit-hora').value = v.hora||'';
  document.getElementById('edit-concepto').value = v.concepto||'otro';
  document.getElementById('edit-monto').value = ventaMonto(v)||'';
  document.getElementById('edit-metodo').value = v.metodo||'efectivo';
  document.getElementById('edit-sede').value = v.sede||sedeActual;
  document.getElementById('edit-obs').value = v.obs||'';
  // Historial de cambios de esta venta
  const cambios = historialCambios.filter(c=>c.ventaId===id);
  const hw = document.getElementById('edit-historial-wrap');
  const hl = document.getElementById('edit-historial-list');
  if(cambios.length>0){
    hw.style.display='block';
    hl.innerHTML = cambios.map(c=>`
      <div style="padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--sc-yellow)">${c.fecha} ${c.hora}</span>
        — ${c.descripcion}
        ${c.valorAnterior?`<br><span style="color:#555">Antes: ${c.valorAnterior}</span>`:''} 
        ${c.valorNuevo?`→ <span style="color:var(--green)">${c.valorNuevo}</span>`:''}
      </div>`).join('');
  } else {
    hw.style.display='none';
  }
  openModal('modal-editar');
}

function guardarEdicion(){
  const id = parseFloat(document.getElementById('edit-id').value);
  const idx = ventas.findIndex(x=>x.id===id);
  if(idx<0) return;
  const v = ventas[idx];
  const nuevoCliente = document.getElementById('edit-cliente').value.trim();
  const nuevaFecha   = document.getElementById('edit-fecha').value;
  const nuevaHora    = document.getElementById('edit-hora').value;
  const nuevoConcepto= document.getElementById('edit-concepto').value;
  const nuevoMonto   = parseFloat(document.getElementById('edit-monto').value)||0;
  const nuevoMetodo  = document.getElementById('edit-metodo').value;
  const nuevaSede    = document.getElementById('edit-sede').value;
  const nuevaObs     = document.getElementById('edit-obs').value.trim();

  // Registrar cambios detectados
  const cambios = [];
  if((v.cliente||v.detalle||'') !== nuevoCliente) cambios.push({desc:'Cliente', ant:v.cliente||v.detalle, nvo:nuevoCliente});
  if(v.fecha !== nuevaFecha) cambios.push({desc:'Fecha', ant:fmtDate(v.fecha), nvo:fmtDate(nuevaFecha)});
  if(v.concepto !== nuevoConcepto) cambios.push({desc:'Concepto', ant:v.concepto, nvo:nuevoConcepto});
  if(ventaMonto(v) !== nuevoMonto) cambios.push({desc:'Monto', ant:fmt$(ventaMonto(v)), nvo:fmt$(nuevoMonto)});
  if((v.metodo||'efectivo') !== nuevoMetodo) cambios.push({desc:'Método', ant:v.metodo, nvo:nuevoMetodo});
  if((v.sede||'') !== nuevaSede) cambios.push({desc:'Sede', ant:v.sede, nvo:nuevaSede});

  if(cambios.length===0){ toast('Sin cambios detectados','var(--sc-yellow)'); closeModal('modal-editar'); return; }

  cambios.forEach(c => registrarCambio('editar', id, `${c.desc} modificado`, c.ant, c.nvo));

  // Recalcular vigencia_hasta si cambió concepto o fecha (para membresías)
  let nuevaVigencia = v.vigencia_hasta;
  const membConceptos = ['membresia','semestral','anual','pase_diario'];
  if (membConceptos.includes(nuevoConcepto)) {
    const diasMap = { membresia: 30, semestral: 180, anual: 365, pase_diario: 1 };
    const dias = diasMap[nuevoConcepto] || 30;
    if (v.fecha !== nuevaFecha || v.concepto !== nuevoConcepto) {
      nuevaVigencia = addDaysStr(nuevaFecha, dias);
    }
  }

  // Aplicar cambios a la venta
  ventas[idx] = {
    ...v,
    cliente: nuevoCliente,
    detalle: nuevoCliente,
    fecha: nuevaFecha,
    hora: nuevaHora,
    concepto: nuevoConcepto,
    efectivo: nuevoMetodo==='efectivo'?nuevoMonto:0,
    transferencia: nuevoMetodo==='transferencia'?nuevoMonto:0,
    debito: nuevoMetodo==='debito'?nuevoMonto:0,
    credito: nuevoMetodo==='credito'?nuevoMonto:0,
    qr: nuevoMetodo==='qr'?nuevoMonto:0,
    monto: nuevoMonto,
    retiros: v._esRetiro ? nuevoMonto : (v.retiros || 0),
    metodo: nuevoMetodo,
    sede: nuevaSede,
    obs: nuevaObs,
    vigencia_hasta: nuevaVigencia
  };
  save();
  closeModal('modal-editar');
  renderDashboard();
  renderHistorial();
  toast(`✅ Venta actualizada (${cambios.length} cambio${cambios.length>1?'s':''})`);
}

// ══════════════════════════════════════════
//  HISTORIAL
// ══════════════════════════════════════════
function renderHistorial(){
  const sede=document.getElementById('h-sede').value;
  const q=document.getElementById('h-q').value.toLowerCase();
  const concepto=document.getElementById('h-concepto').value;
  const metodo=document.getElementById('h-metodo').value;
  const desde=document.getElementById('h-desde').value;
  const hasta=document.getElementById('h-hasta').value;

  let filtradas=[...ventas].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||(b.id-a.id));
  if(sede) filtradas=filtradas.filter(v=>v.sede===sede);
  if(q) filtradas=filtradas.filter(v=>(v.cliente||v.detalle||'').toLowerCase().includes(q)||(v.concepto||'').toLowerCase().includes(q));
  if(concepto){
    if(concepto==='producto') filtradas=filtradas.filter(v=>{ const p=productos.find(x=>x.key===v.concepto); return p&&p.esFisico; });
    else filtradas=filtradas.filter(v=>(v.concepto||'').startsWith(concepto));
  }
  if(metodo) filtradas=filtradas.filter(v=>(v.metodo||'efectivo')===metodo);
  if(desde) filtradas=filtradas.filter(v=>v.fecha>=desde);
  if(hasta) filtradas=filtradas.filter(v=>v.fecha<=hasta);

  document.getElementById('h-count').textContent=`(${filtradas.length})`;
  document.getElementById('hist-tbody').innerHTML=filtradas.map(v=>{
    const cambios=historialCambios.filter(c=>c.ventaId===v.id).length;
    const bloq=ventaBloqueada(v);
    const editBtn = v.anulada ? '' :
      bloq ? `<span class="lock-icon" onclick="editarConBloqueo(${v.id})" title="Bloqueado — requiere admin">🔒</span>` :
      `<button class="btn-edit" onclick="editarConBloqueo(${v.id})">✏️</button>`;
    const anulBtn = v.anulada ? '' :
      `<button class="btn btn-outline btn-xs" onclick="anularVenta(${v.id})" style="border-color:#b45309;color:#f59e0b" title="Anular">🟡</button>`;
    return `<tr class="${v.anulada?'row-anulada':''}">
      <td>
        <div>${fmtDate(v.fecha)}</div>
        <div class="comprobante">${v.numero||'—'}</div>
      </td>
      <td><span class="badge ${v.sede==='BARRIO NORTE'?'badge-purple':'badge-teal'}" style="font-size:10px">${v.sede||'—'}</span></td>
      <td>${v.cliente||v.detalle||'—'}${cambios>0?` <span class="hist-chip" onclick="editarConBloqueo(${v.id})" title="${cambios} edición(es)">✏️ ${cambios}</span>`:''}</td>
      <td>${v.anulada?`<span class="badge-anulado">ANULADA</span><br><span style="font-size:10px;color:var(--muted)">${v.anulacion?.motivo||''}</span>`:`<span class="badge badge-teal" style="font-size:10px">${v.concepto||'—'}</span>`}</td>
      <td>${v.efectivo?fmt$(v.efectivo):''}</td>
      <td>${v.transferencia?fmt$(v.transferencia):''}</td>
      <td>${v.debito?fmt$(v.debito):''}</td>
      <td>${v.credito?fmt$(v.credito):''}</td>
      <td>${v.qr?fmt$(v.qr):''}</td>
      <td><strong style="${v.anulada?'text-decoration:line-through;color:var(--muted)':''}">${fmt$(ventaMonto(v))}</strong></td>
      <td style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
        ${editBtn}${anulBtn}
        <button class="btn-edit" onclick="imprimirTicketById(${v.id})" title="Imprimir ticket">🖨</button>
        ${v.anulada?`<span style="font-size:10px;color:var(--muted)" title="Anulada por ${v.anulacion?.quien||'?'} el ${v.anulacion?.fecha||'?'}">👤 ${v.anulacion?.quien||'?'}</span>`:''}
      </td>
    </tr>`;
  }).join('')||'<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:24px">Sin resultados</td></tr>';
}

// [moved to store.js] let _eliminarId = null;...
function eliminarVenta(id){
  _eliminarId = id;
  const v = ventas.find(x=>x.id===id);
  if(!v){ return; }
  const det = document.getElementById('eliminar-detalle');
  det.innerHTML = `
    <div style="margin-bottom:6px"><span style="color:var(--muted);font-size:10px">CLIENTE</span><br><strong>${v.cliente||v.detalle||'—'}</strong></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
      <div><span style="color:var(--muted);font-size:10px">CONCEPTO</span><br>${v.concepto||'—'}</div>
      <div><span style="color:var(--muted);font-size:10px">MONTO</span><br><strong style="color:var(--sc-red)">${fmt$(ventaMonto(v))}</strong></div>
      <div><span style="color:var(--muted);font-size:10px">FECHA</span><br>${fmtDate(v.fecha)}</div>
    </div>`;
  openModal('modal-eliminar');
}
function confirmarEliminar() {
  if (_eliminarId === null) return;
  const idx = ventas.findIndex(x => x.id === _eliminarId);
  if (idx < 0) { closeModal('modal-eliminar'); return; }
  ventas.splice(idx, 1);
  save();
  closeModal('modal-eliminar');
  toast('🗑️ Venta eliminada');
  renderHistorial();
  _eliminarId = null;
}

function mostrarTicket(id) { imprimirTicketById(id); }
function imprimirTicketById(id) {
  const v = ventas.find(x => x.id === id);
  if (!v) { toast('⚠️ Venta no encontrada', 'var(--sc-yellow)'); return; }
  imprimirTicket(v);
}

// ══════════════════════════════════════════
//  SOCIOS
// ══════════════════════════════════════════
function renderSocios(){
  // KPIs - deduplicar por nombre (ultimo pago por persona)
  const _kpiDedup = {};
  socios.forEach(s => {
    if (!_kpiDedup[s.nombre] || s.fecha_pago > _kpiDedup[s.nombre].fecha_pago)
      _kpiDedup[s.nombre] = s;
  });
  const sociosUnicos = Object.values(_kpiDedup);
  const aldia=sociosUnicos.filter(s=>socioEstado(s)==='aldia');
  const porVencer=sociosUnicos.filter(s=>socioEstado(s)==='por_vencer');
  const vencidos=sociosUnicos.filter(s=>socioEstado(s)==='vencido');
  document.getElementById('s-aldia').textContent=aldia.length;
  document.getElementById('s-por-vencer').textContent=porVencer.length;
  document.getElementById('s-vencidos').textContent=vencidos.length;

  const q=document.getElementById('ss-q').value.toLowerCase();
  const estadoF=document.getElementById('ss-estado').value;

  // Filtrar primero, luego deduplicar por nombre
  let base=[...socios];
  if(q) base=base.filter(s=>(s.nombre||'').toLowerCase().includes(q));
  const base_sede = base.filter(s => !s.sede || s.sede === sedeActual);
  const ultimoPago={};
  base_sede.forEach(s=>{ if(!ultimoPago[s.nombre]||s.fecha_pago>ultimoPago[s.nombre].fecha_pago) ultimoPago[s.nombre]=s; });
  let filtrados=Object.values(ultimoPago);

  if(q) filtrados=filtrados.filter(s=>(s.nombre||'').toLowerCase().includes(q));
  if(estadoF) filtrados=filtrados.filter(s=>socioEstado(s)===estadoF);
  filtrados.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));

  document.getElementById('ss-count').textContent=`(${filtrados.length})`;
  document.getElementById('socios-tbody').innerHTML=filtrados.map(s=>{
    const est=socioEstado(s);
    const badge=est==='aldia'?'badge-green':est==='por_vencer'?'badge-yellow':'badge-red';
    const label=est==='aldia'?'Al día':est==='por_vencer'?'Por vencer':'Vencido';
    const nombreSafe = s.nombre.replace(/'/g,"\\'");
    const nombrePlain = s.nombre.replace(/["']/g,'');
    const btnRenovar = est === 'vencido'
      ? '<button class="btn btn-xs" style="background:var(--sc-yellow);color:#000;border:none;font-weight:700;padding:3px 8px;border-radius:6px;cursor:pointer;margin-left:4px" onclick="nuevaVentaSocio(\'' + nombrePlain + '\')">🔄</button>'
      : '';
    return `<tr>
      <td><strong>${s.nombre}</strong></td>
      <td>${fmtDate(s.fecha_pago)}</td>
      <td>${fmt$(s.monto)}</td>
      <td style="color:var(--muted)">${s.metodo||'—'}</td>
      <td>${fmtDate(s.vigencia_hasta)}</td>
      <td><span class="badge ${badge}">${label}</span></td>
      <td><button class="btn btn-outline btn-xs" onclick="verSocio('${nombreSafe}')">Ver</button>${btnRenovar}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Sin resultados</td></tr>';
}

function verSocio(nombre){
  const historial=socios.filter(s=>s.nombre===nombre).sort((a,b)=>b.fecha_pago.localeCompare(a.fecha_pago));
  const ultimo=historial[0]||{};
  const est=socioEstado(ultimo);
  const badge=est==='aldia'?'badge-green':est==='por_vencer'?'badge-yellow':'badge-red';
  const label=est==='aldia'?'Al día':est==='por_vencer'?'Vence pronto':'Vencido';

  document.getElementById('modal-socio-title').textContent=nombre;
  document.getElementById('modal-socio-body').innerHTML=`
    <div style="display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap">
      <div style="background:var(--s2);border-radius:10px;padding:14px;flex:1">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">ESTADO</div>
        <span class="badge ${badge}">${label}</span>
      </div>
      <div style="background:var(--s2);border-radius:10px;padding:14px;flex:1">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">VIGENTE HASTA</div>
        <div style="font-weight:600">${fmtDate(ultimo.vigencia_hasta)}</div>
      </div>
      <div style="background:var(--s2);border-radius:10px;padding:14px;flex:1">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">ÚLTIMO MONTO</div>
        <div style="font-weight:600;color:var(--accent)">${fmt$(ultimo.monto)}</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Historial de pagos</div>
    <div class="socio-history">
      <table style="width:100%">
        <thead><tr><th>Fecha pago</th><th>Método</th><th>Monto</th><th>Vigente hasta</th></tr></thead>
        <tbody>
          ${historial.map(h=>`<tr>
            <td>${fmtDate(h.fecha_pago)}</td>
            <td style="color:var(--muted)">${h.metodo||'—'}</td>
            <td><strong>${fmt$(h.monto)}</strong></td>
            <td>${fmtDate(h.vigencia_hasta)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  openModal('modal-socio');
}

// ══════════════════════════════════════════
//  LOCKERS
// ══════════════════════════════════════════
function ajustarLockers(sexo) {
  const inputId = sexo === 'H' ? 'cant-lockersH' : 'cant-lockersM';
  const arr     = sexo === 'H' ? lockersH : lockersM;
  const el      = document.getElementById(inputId);
  const nueva   = parseInt(el?.value) || 0;
  if (!nueva || nueva < 1) { toast('⚠️ Ingresá una cantidad válida', 'var(--sc-yellow)'); return; }

  const actual = arr.length;
  if (nueva > actual) {
    // Agregar lockers nuevos
    for (let i = actual + 1; i <= nueva; i++) {
      arr.push({ numero: i, tamaño: 'GRANDE', precio: 18000, socio: '', telefono: '', vencimiento: '' });
    }
    toast(`✅ ${nueva - actual} lockers agregados`);
  } else if (nueva < actual) {
    // Solo eliminar los que están libres al final
    const ocupadosAlFinal = arr.slice(nueva).some(l => l.socio);
    if (ocupadosAlFinal) {
      toast('⚠️ Hay lockers ocupados en ese rango — liberalos primero', 'var(--sc-yellow)');
      el.value = actual;
      return;
    }
    if (sexo === 'H') lockersH = arr.slice(0, nueva);
    else lockersM = arr.slice(0, nueva);
    toast(`✅ Lockers reducidos a ${nueva}`);
  }
  saveData();
  renderLockers();
}



function toggleAutoRenovarLocker(numero, sexo, valor) {
  const arr = sexo === 'H' ? lockersH : lockersM;
  const l   = arr.find(x => x.numero === numero);
  if (!l) return;
  l.renovacionAuto = valor;
  saveData();
  const span = document.querySelector('#lk-auto-renovar-edit + span') ||
               document.querySelector('[id="lk-auto-renovar-edit"]')?.closest('div')?.querySelector('span');
  if (span) {
    span.style.color = valor ? 'var(--green)' : 'var(--muted)';
    span.textContent = '🔄 Renovación automática ' + (valor ? 'ACTIVA' : 'inactiva');
  }
  toast(valor ? '🔄 Renovación automática activada' : 'Renovación automática desactivada',
    valor ? 'var(--green)' : 'var(--muted)');
}

function checkRenovacionAutoLockers() {
  const hoy = todayStr();
  const todos = [...lockersH.map(l=>({...l,_sexo:'H'})), ...lockersM.map(l=>({...l,_sexo:'M'}))];
  let renovados = 0;

  todos.forEach(ref => {
    const arr = ref._sexo === 'H' ? lockersH : lockersM;
    const l   = arr.find(x => x.numero === ref.numero);
    if (!l || !l.socio || !l.renovacionAuto || !l.vencimiento) return;

    const diasRestantes = daysDiff(l.vencimiento, hoy); // positivo = faltan días
    // Renovar si vence en 3 días o menos (incluyendo ya vencidos)
    if (diasRestantes <= 3) {
      const nuevaFecha = addDaysStr(l.vencimiento > hoy ? l.vencimiento : hoy, 30);
      l.vencimiento       = nuevaFecha;
      l.ultimaRenovacion  = hoy;
      l._autoRenovadoHoy  = true;
      renovados++;

      // Registrar en historial
      try {
        registrarCambio('locker_auto_renovacion',
          `Locker #${l.numero} (${l.socio}) renovado automáticamente hasta ${fmtDate(nuevaFecha)}`);
      } catch(e) {}
    }
  });

  if (renovados > 0) {
    saveData();
    try { renderLockers(); } catch(e) {}
    toast(`🔄 ${renovados} locker${renovados > 1 ? 's' : ''} renovado${renovados > 1 ? 's' : ''} automáticamente`, 'var(--green)', 4000);
  }
  return renovados;
}

function renderLockers() {
  const todos = [...lockersH, ...lockersM];
  const libres  = todos.filter(l => !l.socio).length;
  const ocupados = todos.filter(l => l.socio).length;
  const vence   = todos.filter(l => l.socio && l.vencimiento && daysDiff(l.vencimiento, todayStr()) <= 7).length;

  const set = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  set('l-libres',   libres);
  set('l-ocupados', ocupados);
  set('l-vence',    vence);
  set('l-total',    todos.length);

  const libH = lockersH.filter(l => !l.socio).length;
  const libM = lockersM.filter(l => !l.socio).length;
  set('l-libres-sub',  `${libH} H · ${libM} M`);
  set('l-ocupados-sub', `${lockersH.filter(l=>l.socio).length} H · ${lockersM.filter(l=>l.socio).length} M`);

  // Actualizar input de cantidad
  const inH = document.getElementById('cant-lockersH');
  const inM = document.getElementById('cant-lockersM');
  if (inH && !inH.value) inH.value = lockersH.length || '';
  if (inM && !inM.value) inM.value = lockersM.length || '';

  function renderGrid(lockers, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!lockers.length) {
      el.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:20px;text-align:center">
        Sin lockers configurados.<br>
        <span style="font-size:11px">Ingresá la cantidad arriba y hacé click en Aplicar.</span>
      </div>`;
      return;
    }
    el.innerHTML = lockers.map(l => {
      const est = lockerEstado(l);
      const cls = !l.socio ? 'libre' : est === 'vence-pronto' ? 'vence-pronto' : 'ocupado';
      const dias = l.vencimiento ? daysDiff(l.vencimiento, todayStr()) : null;
      return `<div class="locker-cell ${cls}" onclick="verLocker('${containerId}',${l.numero})" title="${l.socio || 'Libre'}">
        <span class="locker-num">${l.numero}</span>
        <div class="locker-size">${l.tamaño || ''}</div>
        ${l.socio
          ? `<div class="locker-name">${l.socio.split(' ')[0]}</div>
             <div style="font-size:8px;margin-top:1px;opacity:.8">${dias !== null ? (dias < 0 ? '⚠ VEN' : dias + 'd') : ''}${l.renovacionAuto ? ' 🔄' : ''}</div>`
          : '<div style="font-size:9px;margin-top:3px;opacity:.7">LIBRE</div>'}
      </div>`;
    }).join('');
  }
  renderGrid(lockersH, 'lockers-hombres');
  renderGrid(lockersM, 'lockers-mujeres');
}

function verLocker(containerId, numero) {
  const sexo = containerId === 'lockers-hombres' ? 'H' : 'M';
  const arr  = sexo === 'H' ? lockersH : lockersM;
  const l    = arr.find(x => x.numero === numero);
  if (!l) return;

  const est  = lockerEstado(l);
  const dias = l.vencimiento ? daysDiff(l.vencimiento, todayStr()) : null;
  const libre = !l.socio;

  document.getElementById('modal-locker-title').textContent =
    `${containerId === 'lockers-hombres' ? '🚹' : '🚺'} Locker #${l.numero}`;

  document.getElementById('modal-locker-body').innerHTML = `
    <!-- Estado y tamaño -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">
      <div style="background:var(--s2);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:6px">ESTADO</div>
        <span class="badge ${libre ? 'badge-green' : est === 'vence-pronto' ? 'badge-yellow' : 'badge-red'}">
          ${libre ? '✅ Libre' : est === 'vence-pronto' ? '⚠ Vence pronto' : '🔐 Ocupado'}
        </span>
      </div>
      <div style="background:var(--s2);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">TAMAÑO</div>
        <select id="lk-tamano" onchange="actualizarLockerPrecio(${numero},'${sexo}')"
          style="background:var(--s1);border:1px solid var(--border);border-radius:6px;
            padding:4px 6px;color:var(--text);font-family:'DM Sans';font-size:12px;outline:none">
          <option value="GRANDE" ${l.tamaño==='GRANDE'?'selected':''}>GRANDE</option>
          <option value="MEDIANO" ${l.tamaño==='MEDIANO'?'selected':''}>MEDIANO</option>
          <option value="CHICO"  ${l.tamaño==='CHICO' ?'selected':''}>CHICO</option>
        </select>
      </div>
      <div style="background:var(--s2);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">PRECIO</div>
        <input type="number" id="lk-precio" value="${l.precio || 18000}"
          style="width:80px;background:var(--s1);border:1px solid var(--border);border-radius:6px;
            padding:4px 6px;color:var(--sc-yellow);font-family:'DM Sans';font-size:13px;
            font-weight:700;text-align:center;outline:none">
      </div>
    </div>

    ${libre ? `
    <!-- FORM ASIGNAR -->
    <div style="background:var(--s2);border-radius:12px;padding:16px">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;
        letter-spacing:1px;margin-bottom:14px;font-weight:600">Asignar a cliente</div>
      <div class="form-group">
        <label>Nombre completo</label>
        <input type="text" id="lk-socio" placeholder="Ej: González Martín"
          style="background:var(--s1);border:1px solid var(--border);border-radius:8px;
            padding:9px 12px;color:var(--text);font-family:'DM Sans';width:100%;outline:none">
      </div>
      <div class="form-group">
        <label>Teléfono</label>
        <input type="text" id="lk-tel" placeholder="381..."
          style="background:var(--s1);border:1px solid var(--border);border-radius:8px;
            padding:9px 12px;color:var(--text);font-family:'DM Sans';width:100%;outline:none">
      </div>
      <div class="form-group">
        <label>Email (opcional)</label>
        <input type="email" id="lk-email" placeholder="cliente@mail.com"
          style="background:var(--s1);border:1px solid var(--border);border-radius:8px;
            padding:9px 12px;color:var(--text);font-family:'DM Sans';width:100%;outline:none">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label>Vencimiento (1 mes desde hoy por defecto)</label>
        <input type="date" id="lk-venc" value="${addDays(todayStr(), 30)}"
          style="background:var(--s1);border:1px solid var(--border);border-radius:8px;
            padding:9px 12px;color:var(--text);font-family:'DM Sans';width:100%;outline:none">
      </div>
      <div style="margin-top:12px" id="lk-metodo-wrap">
        <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:6px">Método de cobro</label>
        <select id="lk-metodo" style="width:100%;background:var(--s1);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-family:'DM Sans';font-size:13px;outline:none">
          <option value="efectivo">💵 Efectivo</option>
          <option value="transferencia">🏦 Transferencia</option>
          <option value="debito">💳 Débito</option>
          <option value="credito">💳 Crédito</option>
          <option value="qr">📱 QR</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:12px;
        background:rgba(0,200,100,.06);border:1px solid rgba(0,200,100,.2);
        border-radius:10px;padding:12px 14px;">
        <input type="checkbox" id="lk-auto-renovar" style="width:18px;height:18px;accent-color:var(--green);cursor:pointer"
          onchange="document.getElementById('lk-metodo-wrap').style.display=this.checked?'none':'block'">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--green)">🔄 Renovación automática</div>
          <div style="font-size:11px;color:var(--muted)">El locker se renueva solo — cobro por plataforma externa, no genera venta</div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn btn-accent" style="flex:1;justify-content:center"
        onclick="asignarLocker(${numero},'${sexo}')">🔐 Asignar locker</button>
      <button class="btn btn-outline" onclick="closeModal('modal-locker')">Cancelar</button>
    </div>
    ` : `
    <!-- INFO OCUPADO -->
    <div style="background:var(--s2);border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="margin-bottom:12px">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px">CLIENTE</div>
        <div style="font-size:16px;font-weight:700">${l.socio}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">TELÉFONO</div>
          <div style="font-weight:500">${l.telefono || '—'}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">VENCIMIENTO</div>
          <div style="font-weight:700;color:${dias < 0 ? 'var(--sc-red)' : dias <= 7 ? 'var(--sc-yellow)' : 'var(--green)'}">
            ${fmtDate(l.vencimiento)}
          </div>
        </div>
      </div>
      ${l.email ? `<div style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px">EMAIL</div>
        <div style="font-weight:500;font-size:12px">${l.email}</div>
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
        background:${l.renovacionAuto ? 'rgba(0,200,100,.07)' : 'var(--s3)'};
        border:1px solid ${l.renovacionAuto ? 'rgba(0,200,100,.25)' : 'var(--border)'};
        border-radius:8px;padding:9px 12px;">
        <input type="checkbox" id="lk-auto-renovar-edit" ${l.renovacionAuto ? 'checked' : ''}
          style="width:16px;height:16px;accent-color:var(--green);cursor:pointer"
          onchange="toggleAutoRenovarLocker(${numero},'${sexo}',this.checked)">
        <span style="font-size:12px;font-weight:600;color:${l.renovacionAuto ? 'var(--green)' : 'var(--muted)'}">
          🔄 Renovación automática ${l.renovacionAuto ? 'ACTIVA' : 'inactiva'}
        </span>
      </div>
      ${dias !== null ? `
      <div style="background:var(--s3);border-radius:8px;padding:10px;text-align:center">
        <span style="font-size:13px;font-weight:600;color:${dias < 0 ? 'var(--sc-red)' : dias <= 7 ? 'var(--sc-yellow)' : 'var(--green)'}">
          ${dias < 0 ? `⚠ Venció hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}` :
            dias === 0 ? '⚠ Vence HOY' :
            `Quedan ${dias} día${dias !== 1 ? 's' : ''}`}
        </span>
      </div>` : ''}
    </div>

    <!-- Renovar vencimiento -->
    <div style="background:rgba(245,193,0,.05);border:1px solid rgba(245,193,0,.2);
      border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--sc-yellow);font-weight:600;
        margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">🔄 Renovar</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <input type="date" id="lk-nueva-venc" value="${addDays(l.vencimiento || todayStr(), 30)}"
          style="flex:1;background:var(--s1);border:1px solid var(--border);border-radius:8px;
            padding:8px 10px;color:var(--text);font-family:'DM Sans';font-size:12px;outline:none">
        <button class="btn btn-accent btn-sm" onclick="renovarLocker(${numero},'${sexo}')">
          Renovar
        </button>
      </div>
      <input type="email" id="lk-email-edit" placeholder="Email del cliente" value="${l.email || ''}"
        style="width:100%;background:var(--s1);border:1px solid var(--border);border-radius:8px;
          padding:8px 10px;color:var(--text);font-family:'DM Sans';font-size:12px;outline:none;box-sizing:border-box">
      ${l.renovacionAuto
        ? `<div style="margin-top:10px;background:rgba(245,193,0,.08);border:1px solid rgba(245,193,0,.2);
            border-radius:8px;padding:10px 12px;font-size:12px;color:var(--sc-yellow)">
            🔄 Renovación automática activa — cobro por plataforma externa,
            <strong>no genera venta</strong> en el sistema
           </div>`
        : `<div style="margin-top:10px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:6px">Método de cobro</label>
            <select id="lk-metodo-renovar" style="width:100%;background:var(--s1);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:'DM Sans';font-size:13px;outline:none">
              <option value="efectivo">💵 Efectivo</option>
              <option value="transferencia">🏦 Transferencia</option>
              <option value="debito">💳 Débito</option>
              <option value="credito">💳 Crédito</option>
              <option value="qr">📱 QR</option>
            </select>
           </div>`
      }
    </div>

    <div style="display:flex;gap:8px">
      <button class="btn btn-outline btn-sm" style="flex:1;justify-content:center;border-color:var(--sc-red);color:var(--sc-red)"
        onclick="liberarLocker(${numero},'${sexo}')">🔓 Liberar locker</button>
      ${l.telefono ? `<a class="btn-wa btn-sm" href="https://wa.me/549${l.telefono.replace(/\D/g,'')}?text=${encodeURIComponent('Hola '+l.socio.split(' ')[0]+'! 👋 Tu locker #'+l.numero+' en SportClub vence el '+fmtDate(l.vencimiento)+'. ¡Pasate por recepción para renovar! 💪')}" target="_blank">💬 WA</a>` : ''}
      <button class="btn btn-outline btn-sm" onclick="guardarLockerConfig(${numero},'${sexo}')">💾 Guardar</button>
    </div>
    `}
  `;

  openModal('modal-locker');
}

function actualizarLockerPrecio(numero, sexo) {
  const tam = document.getElementById('lk-tamano')?.value;
  const precioEl = document.getElementById('lk-precio');
  if (!tam || !precioEl) return;
  const precios = {
    GRANDE:  parseInt(localStorage.getItem('sc_precio_locker_grande')  || '18000'),
    MEDIANO: parseInt(localStorage.getItem('sc_precio_locker_mediano') || '14000'),
    CHICO:   parseInt(localStorage.getItem('sc_precio_locker_chico')   || '10000'),
  };
  precioEl.value = precios[tam] || 18000;
}
function guardarPreciosLocker() {
  // Guardar precio actual como default para este tamaño
  const tam = document.getElementById('lk-tamano')?.value;
  const prec = document.getElementById('lk-precio')?.value;
  if (tam && prec) {
    const key = 'sc_precio_locker_' + tam.toLowerCase();
    localStorage.setItem(key, prec);
  }
}

function asignarLocker(numero, sexo) {
  const arr   = sexo === 'H' ? lockersH : lockersM;
  const l     = arr.find(x => x.numero === numero);
  if (!l) { toast('⚠️ Locker no encontrado', 'var(--sc-yellow)'); return; }
  const socio   = document.getElementById('lk-socio')?.value.trim();
  const tel     = document.getElementById('lk-tel')?.value.trim();
  const email   = document.getElementById('lk-email')?.value.trim();
  const venc    = document.getElementById('lk-venc')?.value;
  const tam     = document.getElementById('lk-tamano')?.value || 'GRANDE';
  const prec    = parseFloat(document.getElementById('lk-precio')?.value) || 0;
  const autoRen = document.getElementById('lk-auto-renovar')?.checked || false;
  const metodo  = document.getElementById('lk-metodo')?.value || 'efectivo';

  if (!socio) { toast('⚠️ Ingresá el nombre del cliente', 'var(--sc-yellow)'); return; }
  if (!venc)  { toast('⚠️ Ingresá la fecha de vencimiento', 'var(--sc-yellow)'); return; }
  if (!autoRen && prec <= 0) { toast('⚠️ Ingresá el precio del locker', 'var(--sc-yellow)'); return; }

  guardarPreciosLocker();
  l.socio          = socio;
  l.telefono       = tel;
  l.email          = email;
  l.vencimiento    = venc;
  l.tamaño         = tam;
  l.precio         = prec;
  l.renovacionAuto = autoRen;
  l.fechaAsignado  = todayStr();

  if (!autoRen && prec > 0) {
    // Registrar como venta manual desde la pestaña Lockers
    const venta = {
      id: genUID(), timestamp: Date.now(),
      numero: (typeof getNextNumero === 'function') ? getNextNumero() : Date.now(),
      fecha: todayStr(), hora: new Date().toTimeString().slice(0,5),
      cliente: socio, concepto: 'locker', sede: sedeActual,
      unidades: 1, monto: prec,
      efectivo:      metodo === 'efectivo'      ? prec : 0,
      transferencia: metodo === 'transferencia' ? prec : 0,
      debito:        metodo === 'debito'        ? prec : 0,
      credito:       metodo === 'credito'       ? prec : 0,
      qr:            metodo === 'qr'            ? prec : 0,
      metodo: metodo, pagoMixto: false, estado: 'cobrado',
      obs: `Locker #${numero} ${tam} · vence ${fmtDate(venc)}`,
      _esLocker: true, _lockerNumero: numero, _lockerSexo: sexo
    };
    ventas.push(venta);
    try { guardarVentaSheets(venta).catch(()=>{}); } catch(e) {}
    save();
  } else {
    // Auto-renovación: solo guarda datos del locker, sin registrar venta
    saveData();
  }

  closeModal('modal-locker');
  renderLockers();
  toast(
    autoRen
      ? `✅ Locker #${numero} asignado a ${socio} · cobro por plataforma externa 🔄`
      : `✅ Locker #${numero} asignado a ${socio} · $${prec.toLocaleString('es-AR')} (${metodo})`,
    'var(--green)'
  );
}

function renovarLocker(numero, sexo) {
  const arr  = sexo === 'H' ? lockersH : lockersM;
  const l    = arr.find(x => x.numero === numero);
  if (!l) return;
  const venc    = document.getElementById('lk-nueva-venc')?.value;
  const email   = document.getElementById('lk-email-edit')?.value?.trim();
  const autoRen = document.getElementById('lk-auto-renovar-edit')?.checked;
  const metodo  = document.getElementById('lk-metodo-renovar')?.value || 'efectivo';

  if (!venc) { toast('⚠️ Ingresá la nueva fecha', 'var(--sc-yellow)'); return; }

  const esAuto = autoRen !== undefined ? autoRen : l.renovacionAuto;
  const prec   = l.precio || 0;

  l.vencimiento      = venc;
  if (email   !== undefined) l.email = email;
  if (autoRen !== undefined) l.renovacionAuto = autoRen;
  l.ultimaRenovacion = todayStr();

  if (!esAuto && prec > 0) {
    // Registrar renovación como venta
    const venta = {
      id: genUID(), timestamp: Date.now(),
      numero: (typeof getNextNumero === 'function') ? getNextNumero() : Date.now(),
      fecha: todayStr(), hora: new Date().toTimeString().slice(0,5),
      cliente: l.socio, concepto: 'locker', sede: sedeActual,
      unidades: 1, monto: prec,
      efectivo:      metodo === 'efectivo'      ? prec : 0,
      transferencia: metodo === 'transferencia' ? prec : 0,
      debito:        metodo === 'debito'        ? prec : 0,
      credito:       metodo === 'credito'       ? prec : 0,
      qr:            metodo === 'qr'            ? prec : 0,
      metodo: metodo, pagoMixto: false, estado: 'cobrado',
      obs: `Renovación Locker #${numero} · vence ${fmtDate(venc)}`,
      _esLocker: true, _lockerNumero: numero, _lockerSexo: sexo
    };
    ventas.push(venta);
    try { guardarVentaSheets(venta).catch(()=>{}); } catch(e) {}
    save();
  } else {
    // Auto-renovación o sin precio: solo actualiza datos
    saveData();
  }

  closeModal('modal-locker');
  renderLockers();
  toast(
    esAuto
      ? `🔄 Locker #${numero} renovado hasta ${fmtDate(venc)} · cobro externo`
      : `✅ Locker #${numero} renovado hasta ${fmtDate(venc)} · $${prec.toLocaleString('es-AR')} (${metodo})`,
    'var(--green)'
  );
}

function liberarLocker(numero, sexo) {
  const arr = sexo === 'H' ? lockersH : lockersM;
  const l   = arr.find(x => x.numero === numero);
  if (!l) return;
  if (!confirm(`¿Liberar locker #${numero} de ${l.socio || 'este socio'}?`)) return;
  l.socio = ''; l.telefono = ''; l.email = ''; l.vencimiento = '';
  l.renovacionAuto = false; l.fechaAsignado = ''; l.ultimaRenovacion = '';
  saveData();
  closeModal('modal-locker');
  renderLockers();
  toast(`🔓 Locker #${numero} liberado`);
}

function guardarLockerConfig(numero, sexo) {
  const arr   = sexo === 'H' ? lockersH : lockersM;
  const l     = arr.find(x => x.numero === numero);
  const tam   = document.getElementById('lk-tamano')?.value;
  const prec  = parseFloat(document.getElementById('lk-precio')?.value);
  const email = document.getElementById('lk-email-edit')?.value?.trim();
  const auto  = document.getElementById('lk-auto-renovar-edit')?.checked;
  if (tam)              l.tamaño = tam;
  if (prec)             l.precio = prec;
  if (email !== undefined) l.email = email;
  if (auto  !== undefined) l.renovacionAuto = auto;
  saveData();
  closeModal('modal-locker');
  renderLockers();
  toast('✅ Locker actualizado');
}



// ══════════════════════════════════════════
//  ALERTAS
// ══════════════════════════════════════════
function getAlertas(){
  const alerts=[];
  const hoy=todayStr();

  // Socios vencidos
  const ultimoPago={};
  socios.forEach(s=>{ if(!ultimoPago[s.nombre]||s.fecha_pago>ultimoPago[s.nombre].fecha_pago) ultimoPago[s.nombre]=s; });
  Object.values(ultimoPago).forEach(s=>{
    const est=socioEstado(s);
    if(est==='vencido'){
      if(!s.vigencia_hasta) return;
      const dias=Math.abs(daysDiff(s.vigencia_hasta||hoy,hoy));
      const _tel = (contactos.find(c=>c.nombre?.toLowerCase()===s.nombre?.toLowerCase())?.telefono || s.telefono || '');
      const _msgVenc = `Hola ${s.nombre.split(' ')[0]}! 👋 Tu membresía en SportClub Tucumán venció hace ${dias} día${dias!==1?'s':''}. ¿Renovamos? 💪`;
      alerts.push({tipo:'critical',titulo:`Cuota vencida: ${s.nombre}`,desc:`Vencida hace ${dias} día${dias!==1?'s':''} — Último pago: ${fmt$(s.monto)}`, telefono:_tel, msgWA:_msgVenc});
    } else if(est==='por_vencer'){
      const dias=daysDiff(s.vigencia_hasta,hoy);
      const _telPV = (contactos.find(c=>c.nombre?.toLowerCase()===s.nombre?.toLowerCase())?.telefono || s.telefono || '');
      alerts.push({tipo:'warning',titulo:`Por vencer: ${s.nombre}`,desc:`Vence en ${dias} día${dias!==1?'s':''} — ${fmtDate(s.vigencia_hasta)}`, telefono:_telPV, msgWA:`Hola ${s.nombre.split(' ')[0]}! 👋 Tu membresía en SportClub vence en ${dias} días. ¿La renovamos? 💪`});
    }
  });

  // Lockers vencidos o por vencer
  [...lockersH,...lockersM].filter(l=>l.socio&&l.vencimiento).forEach(l=>{
    const dias=daysDiff(l.vencimiento,hoy);
    if(dias<0) alerts.push({tipo:'critical',titulo:`Locker #${l.numero} vencido`,desc:`${l.socio} — venció hace ${Math.abs(dias)} días`});
    else if(dias<=7) alerts.push({tipo:'warning',titulo:`Locker #${l.numero} por vencer`,desc:`${l.socio} — vence en ${dias} días (${fmtDate(l.vencimiento)})`});
  });

  return alerts;
}

// renderAlertas ahora es el CRM completo — definido en el bloque CRM de arriba
function alertItem(a){
  return `<div class="alert-item ${a.tipo}">
    <div class="alert-dot ${a.tipo}"></div>
    <div><div style="font-size:13px;font-weight:500">${a.titulo}</div><div style="font-size:12px;color:var(--muted);margin-top:3px">${a.desc}</div></div>
  </div>`;
}

// ══════════════════════════════════════════
//  IMPORTAR EXCEL
// ══════════════════════════════════════════
function handleDrop(e){
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('dragover');
  const file=e.dataTransfer.files[0];
  if(file) pedirPass(
    '🔒 Importar Excel',
    'Esta acción reemplaza todos los datos actuales.',
    () => handleFile(file)
  );
}

function handleFile(file){
  if(!file) return;
  if(!file.name.match(/\.xlsx?$/i)){ toast('⚠️ Seleccioná un archivo .xlsx','var(--sc-yellow)'); return; }
  showProgress('Leyendo archivo...',5);
  const reader=new FileReader();
  reader.onload=e=>{ try{ processExcel(e.target.result); } catch(err){ toast('❌ Error: '+err.message,'var(--red)'); hideProgress(); } };
  reader.readAsArrayBuffer(file);
}

function showProgress(msg,pct){
  document.getElementById('import-progress').style.display='block';
  document.getElementById('import-label').textContent=msg;
  document.getElementById('import-bar').style.width=pct+'%';
}
function hideProgress(){ document.getElementById('import-progress').style.display='none'; }

function processExcel(buffer){
  showProgress('Parseando hojas...',15);
  const wb=XLSX.read(buffer,{type:'arraybuffer',cellDates:true});

  // ── SOCIOS ──
  showProgress('Importando socios...',30);
  const nuevosSocios=[];
  if(wb.SheetNames.includes('Socios')){
    const ws=wb.Sheets['Socios'];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'yyyy-mm-dd'});
    rows.slice(1).forEach(r=>{
      if(!r[0]) return;
      const fechaPago=parseExcelDate(r[1]);
      const vigDesde=parseExcelDate(r[5]);
      const vigHasta=parseExcelDate(r[6]);
      if(!fechaPago) return;
      nuevosSocios.push({
        nombre:String(r[0]).trim(),
        fecha_pago:fechaPago,
        metodo:String(r[2]||'').trim(),
        monto:parseFloat(r[3])||0,
        vigencia_desde:vigDesde||fechaPago,
        vigencia_hasta:vigHasta||addDays(fechaPago,30),
      });
    });
  }

  // ── LOCKERS ──
  showProgress('Importando lockers...',50);
  const nuevosLH=[], nuevosLM=[];
  ['Lockers Hombres','Lockers Mujeres'].forEach((sheet,idx)=>{
    if(!wb.SheetNames.includes(sheet)) return;
    const ws=wb.Sheets[sheet];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'yyyy-mm-dd'});
    rows.slice(1).forEach(r=>{
      if(r[1]===undefined||r[1]===null||r[1]==='') return;
      const venc=parseExcelDate(r[6]);
      const obj={
        numero:parseInt(r[1])||0,
        tamaño:String(r[2]||r[0]||'').trim(),
        precio:parseFloat(r[3])||0,
        socio:String(r[4]||'').trim(),
        telefono:String(r[5]||'').trim(),
        vencimiento:venc||'',
      };
      if(idx===0) nuevosLH.push(obj); else nuevosLM.push(obj);
    });
  });

  // ── CAJAS ──
  showProgress('Importando cajas...',65);
  const nuevasVentas=[];
  const cajaSheets=wb.SheetNames.filter(n=>/caja/i.test(n));
  cajaSheets.forEach(sheetName=>{
    const ws=wb.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'yyyy-mm-dd'});
    let headers=[];
    rows.forEach((row,i)=>{
      if(i===0){ headers=row.map(h=>(h||'').toString().toLowerCase().trim()); return; }
      if(!row[0]||!row[1]) return;
      const get=(keys)=>{ for(const k of keys){ const idx=headers.findIndex(h=>h.includes(k)); if(idx>=0&&row[idx]) return row[idx]; } return null; };
      const fecha=parseExcelDate(row[0]);
      if(!fecha) return;
      const concepto=String(row[1]||'').trim().toLowerCase();
      const detalle=String(row[2]||'').trim();
      const efectivo=parseNum(get(['efectivo'])||row[3]);
      const transf=parseNum(get(['transf'])||row[4]);
      const tc=parseNum(get([' tc','tc'])||row[5]);
      const qr=parseNum(get(['qr'])||row[6]);
      const deb=parseNum(get(['deb'])||row[7]);
      const retiros=parseNum(get(['retiro'])||row[8]);
      const egresos=parseNum(get(['egreso'])||row[9]);
      const total=efectivo+transf+tc+qr+deb;
      if(total===0&&retiros===0&&egresos===0) return;
      // Mapear concepto
      const conMap=mapConcepto(concepto);
      nuevasVentas.push({
        id:Math.random(),fecha,hora:'',
        cliente:detalle,concepto:conMap,
        efectivo,transferencia:transf,debito:deb,credito:tc,qr,
        retiros,egresos,obs:''
      });
    });
  });

  showProgress('Guardando datos...',90);

  // Merge (reemplazar todo)
  if(nuevosSocios.length>0) socios=nuevosSocios;
  if(nuevosLH.length>0) lockersH=nuevosLH;
  if(nuevosLM.length>0) lockersM=nuevosLM;
  if(nuevasVentas.length>0) ventas=nuevasVentas;
  save();

  showProgress('¡Completado!',100);
  setTimeout(()=>{
    hideProgress();
    document.getElementById('import-stats').style.display='block';
    document.getElementById('import-results').innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
        <div style="background:var(--s2);border-radius:10px;padding:16px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">TRANSACCIONES</div>
          <div style="font-family:'Bebas Neue';font-size:36px;color:var(--accent)">${nuevasVentas.length.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--muted)">${cajaSheets.length} hojas de caja</div>
        </div>
        <div style="background:var(--s2);border-radius:10px;padding:16px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">SOCIOS</div>
          <div style="font-family:'Bebas Neue';font-size:36px;color:var(--teal)">${nuevosSocios.length.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--muted)">Registros de pagos</div>
        </div>
        <div style="background:var(--s2);border-radius:10px;padding:16px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">LOCKERS H</div>
          <div style="font-family:'Bebas Neue';font-size:36px;color:var(--purple)">${nuevosLH.length}</div>
        </div>
        <div style="background:var(--s2);border-radius:10px;padding:16px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">LOCKERS M</div>
          <div style="font-family:'Bebas Neue';font-size:36px;color:var(--orange)">${nuevosLM.length}</div>
        </div>
      </div>`;
    renderImportStatus();
    refreshDatalist();
    toast('✅ Excel importado correctamente');
  },600);
}

function parseExcelDate(val){
  if(!val) return null;
  if(val instanceof Date){ const d=val; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  const s=String(val).trim();
  if(s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10);
  if(s.match(/^\d{2}\/\d{2}\/\d{4}/)){
    const[d,m,y]=s.split('/'); return `${y}-${m}-${d}`;
  }
  // Excel serial number
  const n=parseFloat(s);
  if(!isNaN(n)&&n>40000&&n<60000){
    const d=new Date((n-25569)*86400000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return null;
}

function parseNum(v){ if(!v) return 0; const n=parseFloat(String(v).replace(/[^0-9.-]/g,'')); return isNaN(n)?0:Math.abs(n); }

function mapConcepto(c){
  c=c.toLowerCase();
  if(c.includes('membr')||c.includes('cuota')) return 'membresia';
  if(c.includes('semest')) return 'semestral';
  if(c.includes('anual')) return 'anual';
  if(c.includes('locker')) return 'locker';
  if(c.includes('pase')||c.includes('jornada')) return 'pase_diario';
  if(c.includes('café')||c.includes('cafe')||c.includes('pack café')) return 'cafe';
  if(c.includes('agua')) return 'agua';
  if(c.includes('barrita')||c.includes('barra')) return 'barrita';
  if(c.includes('power')||c.includes('monster')||c.includes('soda')||c.includes('coca')) return 'power';
  if(c.includes('turron')||c.includes('alfajor')||c.includes('caramelo')||c.includes('chicle')||c.includes('pasta')) return 'barrita';
  if(c.includes('sauna')) return 'sauna';
  if(c.includes('rutina')) return 'rutina';
  if(c.includes('retiro')) return 'retiro';
  if(c.includes('egreso')) return 'egreso';
  if(c.includes('saldo inicio')) return 'saldo_inicio';
  return 'otro';
}

function importarContactos(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'arraybuffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const nuevos = [];
      rows.slice(1).forEach(r => {
        const nombre = String(r[0] || '').trim();
        const tel    = String(r[1] || '').replace(/\D/g, '');
        if (nombre && tel) nuevos.push({ nombre, telefono: tel });
      });
      contactos = nuevos;
      save();
      document.getElementById('contactos-count').textContent = nuevos.length;
      toast(`✅ ${nuevos.length} contactos importados`);
    } catch(err) { toast('❌ Error: ' + err.message, 'var(--sc-red)'); }
  };
  reader.readAsArrayBuffer(file);
}

function renderImportStatus(){
  document.getElementById('contactos-count').textContent = contactos.length;
  document.getElementById('current-data-status').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
      <div class="caja-row"><span>Transacciones</span><strong style="color:var(--accent)">${ventas.length.toLocaleString()}</strong></div>
      <div class="caja-row"><span>Registros de socios</span><strong style="color:var(--teal)">${socios.length.toLocaleString()}</strong></div>
      <div class="caja-row"><span>Lockers hombres</span><strong>${lockersH.length}</strong></div>
      <div class="caja-row"><span>Lockers mujeres</span><strong>${lockersM.length}</strong></div>
    </div>
    <button class="btn btn-danger btn-sm" style="margin-top:16px" onclick="resetSeguro()">🗑️ Limpiar todos los datos</button>`;
}

// ══════════════════════════════════════════
//  EXPORTAR PARA CONTADOR (SheetJS)
// ══════════════════════════════════════════
function initExportarSelect(){
  const anios=[...new Set(ventas.filter(v=>v.fecha).map(v=>v.fecha.slice(0,4)))].sort().reverse();
  if(!anios.length) anios.push(new Date().getFullYear().toString());
  const sel=document.getElementById('exp-anio');
  if(sel) sel.innerHTML=anios.map(a=>`<option value="${a}">${a}</option>`).join('');
}

const MESES_LABELS=['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CONCEPTO_LABEL2={membresia:'Membresía',semestral:'Semestral',anual:'Anual',
  pase_diario:'Pase diario',locker:'Locker',cafe:'Café',agua:'Agua',barrita:'Barrita',
  power:'Power/Monster',soda:'Soda',sauna:'Sauna',rutina:'Rutina',
  egreso:'Egreso',retiro:'Retiro',saldo_inicio:'Saldo inicio',otro:'Otro'};

function exportarContador(){
  if(typeof XLSX==='undefined'){ toast('⚠️ Librería XLSX no cargada','var(--red)'); return; }
  const anio=document.getElementById('exp-anio').value;
  const mes=document.getElementById('exp-mes').value;
  if(!anio){ toast('⚠️ Seleccioná un año','var(--sc-yellow)'); return; }

  // Filtrar datos
  let prefix=mes?`${anio}-${mes}`:anio;
  let vFilt=ventas.filter(v=>v.fecha&&v.fecha.startsWith(prefix));
  if(!vFilt.length){ toast('⚠️ Sin datos para ese período','var(--sc-yellow)'); return; }

  const wb=XLSX.utils.book_new();
  const FMT_PESO='$#,##0;($#,##0);"-"';
  const FMT_DATE='DD/MM/YYYY';

  const sumCampo=(arr,campo)=>arr.reduce((a,v)=>a+(v[campo]||0),0);
  const ingreso=v=>(v.efectivo||0)+(v.transferencia||0)+(v.debito||0)+(v.credito||0)+(v.qr||0);
  const esEgreso=v=>['egreso','retiro','saldo_inicio'].includes(v.concepto);

  // ── HOJA 1: RESUMEN ──
  const resumenRows=[
    ['GIMNASIO — INFORME CONTABLE '+anio+(mes?' — '+MESES_LABELS[parseInt(mes)-1]:'')],
    [`Generado el ${new Date().toLocaleDateString('es-AR')} desde GymControl v2`],
    [],
    ['MES','EFECTIVO','TRANSFERENCIA','DÉBITO','CRÉDITO','QR / MP','TOTAL INGRESOS','EGRESOS','RETIROS','NETO','TRANSACCIONES']
  ];

  const mesesConDatos=mes?[mes]:['01','02','03','04','05','06','07','08','09','10','11','12'];
  mesesConDatos.forEach(m=>{
    const vMes=vFilt.filter(v=>v.fecha.startsWith(`${anio}-${m}`));
    if(!vMes.length) return;
    const ing=vMes.filter(v=>!esEgreso(v));
    resumenRows.push([
      MESES_LABELS[parseInt(m)-1],
      sumCampo(ing,'efectivo'), sumCampo(ing,'transferencia'),
      sumCampo(ing,'debito'),   sumCampo(ing,'credito'), sumCampo(ing,'qr'),
      {f:`SUM(B${resumenRows.length+1}:F${resumenRows.length+1})`},
      sumCampo(vMes,'egresos'), sumCampo(vMes,'retiros'),
      {f:`G${resumenRows.length+1}-H${resumenRows.length+1}-I${resumenRows.length+1}`},
      ing.length
    ]);
  });

  // Fila total
  const dataStart=5, dataEnd=resumenRows.length;
  resumenRows.push([
    'TOTAL',
    {f:`SUM(B${dataStart}:B${dataEnd})`},{f:`SUM(C${dataStart}:C${dataEnd})`},
    {f:`SUM(D${dataStart}:D${dataEnd})`},{f:`SUM(E${dataStart}:E${dataEnd})`},
    {f:`SUM(F${dataStart}:F${dataEnd})`},{f:`SUM(G${dataStart}:G${dataEnd})`},
    {f:`SUM(H${dataStart}:H${dataEnd})`},{f:`SUM(I${dataStart}:I${dataEnd})`},
    {f:`SUM(J${dataStart}:J${dataEnd})`},{f:`SUM(K${dataStart}:K${dataEnd})`}
  ]);

  const wsRes=XLSX.utils.aoa_to_sheet(resumenRows);
  // Formato de monedas en columnas B-J desde fila 5
  const monedaCols=['B','C','D','E','F','G','H','I','J'];
  for(let row=5;row<=resumenRows.length;row++){
    monedaCols.forEach(col=>{
      const ref=col+row;
      if(wsRes[ref]) wsRes[ref].z=FMT_PESO;
    });
  }
  wsRes['!cols']=[{wch:16},{wch:15},{wch:15},{wch:13},{wch:12},{wch:14},{wch:17},{wch:14},{wch:14},{wch:16},{wch:13}];
  XLSX.utils.book_append_sheet(wb, wsRes, 'RESUMEN');

  // ── HOJAS POR MES ──
  mesesConDatos.forEach(m=>{
    const vMes=vFilt.filter(v=>v.fecha.startsWith(`${anio}-${m}`)).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));
    if(!vMes.length) return;

    const rows=[
      [`GIMNASIO — ${MESES_LABELS[parseInt(m)-1].toUpperCase()} ${anio}`],
      [],
      ['FECHA','DETALLE','CONCEPTO','EFECTIVO','TRANSFERENCIA','DÉBITO','CRÉDITO','QR / MP','EGRESOS','RETIROS']
    ];

    // Ingresos primero
    const ing=vMes.filter(v=>!esEgreso(v));
    if(ing.length){
      rows.push(['▼ INGRESOS','','','','','','','','','']);
      ing.forEach(v=>{
        rows.push([v.fecha,v.cliente||v.detalle||'',
          CONCEPTO_LABEL2[v.concepto]||v.concepto||'',
          v.efectivo||null, v.transferencia||null,
          v.debito||null, v.credito||null, v.qr||null, null, null]);
      });
      const s=rows.length; rows.push(['SUBTOTAL INGRESOS','','',
        {f:`SUM(D5:D${s})`},{f:`SUM(E5:E${s})`},{f:`SUM(F5:F${s})`},
        {f:`SUM(G5:G${s})`},{f:`SUM(H5:H${s})`},'','']);
    }

    // Egresos
    const egs=vMes.filter(v=>esEgreso(v));
    if(egs.length){
      rows.push([]);
      rows.push(['▼ EGRESOS Y RETIROS','','','','','','','','','']);
      const egStart=rows.length+1;
      egs.forEach(v=>{
        rows.push([v.fecha,v.detalle||'',v.concepto==='retiro'?'Retiro':'Egreso',
          null,null,null,null,null,v.egresos||null,v.retiros||null]);
      });
      const egEnd=rows.length;
      rows.push(['SUBTOTAL EGRESOS','','','','','','','',
        {f:`SUM(I${egStart}:I${egEnd})`},{f:`SUM(J${egStart}:J${egEnd})`}]);
    }

    const ws=XLSX.utils.aoa_to_sheet(rows);
    // Formato fechas col A
    for(let i=5;i<=rows.length;i++){
      const ref='A'+i;
      if(ws[ref]&&ws[ref].v&&String(ws[ref].v).match(/^\d{4}-\d{2}-\d{2}/)) ws[ref].z=FMT_DATE;
    }
    // Formato monedas cols D-J
    ['D','E','F','G','H','I','J'].forEach(col=>{
      for(let i=5;i<=rows.length;i++){
        const ref=col+i;
        if(ws[ref]) ws[ref].z=FMT_PESO;
      }
    });
    ws['!cols']=[{wch:13},{wch:28},{wch:16},{wch:14},{wch:15},{wch:13},{wch:12},{wch:13},{wch:13},{wch:13}];
    XLSX.utils.book_append_sheet(wb, ws, MESES_LABELS[parseInt(m)-1].slice(0,3).toUpperCase());
  });

  // ── HOJA EGRESOS CONSOLIDADOS ──
  const egRows=[
    ['EGRESOS Y RETIROS — '+anio+(mes?' — '+MESES_LABELS[parseInt(mes)-1]:'')],
    [],
    ['FECHA','MES','DETALLE','TIPO','EGRESO','RETIRO']
  ];
  vFilt.filter(v=>v.egresos>0||v.retiros>0).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')).forEach(v=>{
    const mesNum=parseInt(v.fecha.slice(5,7));
    egRows.push([v.fecha, MESES_LABELS[mesNum-1]||'',
      v.detalle||'', v.retiros>0?'Retiro':'Egreso',
      v.egresos||null, v.retiros||null]);
  });
  const egs=egRows.length;
  egRows.push(['TOTAL','','','',{f:`SUM(E4:E${egs})`},{f:`SUM(F4:F${egs})`}]);
  const wsEg=XLSX.utils.aoa_to_sheet(egRows);
  ['A','E','F'].forEach(col=>{
    for(let i=4;i<=egRows.length;i++){
      const ref=col+i;
      if(wsEg[ref]){
        if(col==='A'&&String(wsEg[ref].v||'').match(/^\d{4}-\d{2}-\d{2}/)) wsEg[ref].z=FMT_DATE;
        if(col==='E'||col==='F') wsEg[ref].z=FMT_PESO;
      }
    }
  });
  wsEg['!cols']=[{wch:13},{wch:14},{wch:35},{wch:11},{wch:15},{wch:15}];
  XLSX.utils.book_append_sheet(wb, wsEg, 'EGRESOS');

  // Descargar
  const filename=`informe_contador_${anio}${mes?'_'+mes:''}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast(`✅ ${filename} descargado`);
}

// Init selects de exportar
// initExportarSelect() se llama en DOMContentLoaded

// ══════════════════════════════════════════
//  BUSCADOR SOCIOS INTELIGENTE
// ══════════════════════════════════════════
function buscarSocioInput(q){
  const dd = document.getElementById('socio-dropdown');
  if(!q || q.length < 2){ dd.style.display='none'; return; }
  const ql = q.toLowerCase();
  // Buscar en socios únicos
  const ultimoPago={};
  socios.forEach(s=>{ if(!ultimoPago[s.nombre]||s.fecha_pago>ultimoPago[s.nombre].fecha_pago) ultimoPago[s.nombre]=s; });
  const matches = Object.values(ultimoPago)
    .filter(s=>(s.nombre||'').toLowerCase().includes(ql))
    .slice(0,8);
  if(!matches.length){ dd.style.display='none'; return; }
  dd.style.display='block';
  dd.innerHTML = matches.map(s=>{
    const est = socioEstado(s);
    const color = est==='aldia'?'var(--green)':est==='por_vencer'?'var(--sc-yellow)':'var(--sc-red)';
    const label = est==='aldia'?'✓ Al día':est==='por_vencer'?'⚠ Por vencer':'✗ Vencido';
    return `<div class="socio-opt" onclick="seleccionarSocio('${s.nombre.replace(/'/g,"\'")}')">
      <div>${s.nombre}</div>
      <div class="opt-sub" style="color:${color}">${label} · ${fmtDate(s.vigencia_hasta)}</div>
    </div>`;
  }).join('');
}

function seleccionarSocio(nombre){
  document.getElementById('f-cliente').value = nombre;
  cerrarDropdown();
}

function cerrarDropdown(){
  const dd = document.getElementById('socio-dropdown');
  if(dd) dd.style.display='none';
}



// ══════════════════════════════════════════
//  ADMIN — PRODUCTOS Y PRECIOS
// ══════════════════════════════════════════
function renderProductos() {
  try { renderRanking(); } catch(e) {}
  try { renderStockAlertas(); } catch(e) {}

  const el = document.getElementById('productos-lista');
  if (!el) return;

  const lista = productos.filter(p => p.key !== 'retiro' && p.key !== 'egreso' && !p._oculto);
  el.innerHTML = lista.map(p => {
    const badgeBg = p.esFisico ? 'rgba(34,197,94,.12)' : 'rgba(99,102,241,.12)';
    const badgeFg = p.esFisico ? 'var(--green)'        : '#818cf8';
    const badgeTxt= p.esFisico ? 'producto'            : 'servicio';
    return `<div class="card" style="margin-bottom:8px;padding:11px 14px" id="prod-card-${p.key}">
      <div style="display:grid;grid-template-columns:1fr 100px 44px 44px 36px 36px;gap:8px;align-items:center">
        <div style="min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
            <span style="font-size:18px">${p.icon}</span>
            <span style="font-size:13px;font-weight:600">${p.label}</span>
            <span style="font-size:9px;padding:2px 7px;border-radius:20px;background:${badgeBg};color:${badgeFg}">${badgeTxt}</span>
            ${p.stock != null ? `<span style="font-size:9px;padding:2px 7px;border-radius:20px;background:rgba(245,193,0,.1);color:var(--sc-yellow)">stock: ${p.stock}</span>` : ''}
          </div>
          <input class="precio-input" type="text" id="desc-${p.key}"
            value="${(p.desc||'').replace(/"/g,'&quot;')}" placeholder="Descripcion opcional..."
            style="font-size:11px;padding:2px 6px;margin-top:2px;color:var(--muted);background:transparent;border-color:transparent;width:100%;max-width:260px"
            onfocus="this.style.borderColor='var(--border)';this.style.background='var(--s2)'"
            onblur="this.style.borderColor='transparent';this.style.background='transparent'">
        </div>
        <input class="precio-input" type="number" min="0" id="precio-${p.key}"
          value="${p.precio}" placeholder="0" style="text-align:right;padding:7px 8px">
        <div style="text-align:center" title="Acceso rápido en nueva venta">
          <input type="checkbox" id="rapido-${p.key}" ${p.rapido ? 'checked' : ''}
            onchange="guardarPrecios()"
            style="width:18px;height:18px;accent-color:var(--sc-yellow);cursor:pointer">
        </div>
        <div style="text-align:center" title="Mostrar en Venta Rápida del dashboard">
          <input type="checkbox" id="rapido-dash-${p.key}" ${p.rapidoDash ? 'checked' : ''}
            onchange="guardarPrecios()"
            style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer">
        </div>
        <div style="text-align:center">
          <button onclick="abrirEdicionProducto('${p.key}')"
            style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted);padding:4px;border-radius:5px"
            onmouseover="this.style.color='var(--sc-yellow)'" onmouseout="this.style.color='var(--muted)'"
            title="Editar">✏️</button>
        </div>
        <div style="text-align:center">
          <button onclick="eliminarProducto('${p.key}')"
            style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted);padding:4px;border-radius:5px"
            onmouseover="this.style.color='var(--sc-red)'" onmouseout="this.style.color='var(--muted)'"
            title="Eliminar">&#128465;</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:13px;padding:20px;text-align:center">Sin productos</div>';
}

function crearProducto() {
  const icon     = document.getElementById('np-icon').value.trim()     || '📦';
  const label    = document.getElementById('np-label').value.trim();
  const desc     = document.getElementById('np-desc').value.trim();
  const precio   = parseFloat(document.getElementById('np-precio').value)    || 0;
  const rapido   = document.getElementById('np-rapido').checked;
  const esFisico = document.getElementById('np-fisico').checked;
  const stock    = esFisico && document.getElementById('np-stock').value !== ''
    ? parseInt(document.getElementById('np-stock').value) : null;
  const stockMin = esFisico && document.getElementById('np-stockmin').value !== ''
    ? parseInt(document.getElementById('np-stockmin').value) : null;

  if (!label) { toast('⚠️ Ingresá el nombre del producto', 'var(--sc-yellow)'); return; }
  if (productos.some(p => p.label.toLowerCase() === label.toLowerCase())) {
    toast('⚠️ Ya existe un producto con ese nombre', 'var(--sc-yellow)'); return;
  }

  const key = 'custom_' + label.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').slice(0, 30)
    + '_' + Date.now().toString(36);

  const nuevo = { key, icon, label, desc, precio, rapido, esFisico, stock, stockMin, custom: true };
  productos.push(nuevo);
  saveProductos();

  // Limpiar form
  document.getElementById('np-icon').value     = '';
  document.getElementById('np-label').value    = '';
  document.getElementById('np-desc').value     = '';
  document.getElementById('np-precio').value   = '';
  document.getElementById('np-rapido').checked = true;
  document.getElementById('np-fisico').checked = false;
  document.getElementById('np-stock').value    = '';
  document.getElementById('np-stockmin').value = '';
  document.getElementById('np-stock-wrap').style.display = 'none';

  // Actualizar select del form de venta
  actualizarSelectConceptos();
  renderProductos();
  renderQuickButtons();
  toast(`✅ "${label}" agregado al catálogo`);
}

function eliminarProducto(key) {
  const p = productos.find(x => x.key === key);
  if (!p) { toast('⚠️ Producto no encontrado', 'var(--sc-yellow)'); return; }
  if (!confirm(`¿Eliminar "${p.label}" del catálogo?`)) return;

  const esDefault = PRODUCTOS_DEFAULT.some(d => d.key === key);
  if (esDefault) {
    // Los productos default no se pueden borrar del array (vuelven al recargar)
    // Se marcan como ocultos para que no aparezcan
    p._oculto = true;
  } else {
    // Productos custom: eliminar completamente
    productos = productos.filter(x => x.key !== key);
  }

  saveProductos();
  actualizarSelectConceptos();
  renderProductos();
  renderQuickButtons();
  toast(`🗑️ "${p.label}" eliminado del catálogo`);
}

function abrirEdicionProducto(key) {
  const p = productos.find(x => x.key === key);
  if (!p) return;
  document.getElementById('ep-key').value       = key;
  document.getElementById('ep-icon').value      = p.icon   || '';
  document.getElementById('ep-label').value     = p.label  || '';
  document.getElementById('ep-desc').value      = p.desc   || '';
  document.getElementById('ep-precio').value    = p.precio != null ? p.precio : '';
  document.getElementById('ep-rapido').checked  = !!p.rapido;
  document.getElementById('ep-fisico').checked  = !!p.esFisico;
  const stockWrap = document.getElementById('ep-stock-wrap');
  stockWrap.style.display = p.esFisico ? 'grid' : 'none';
  document.getElementById('ep-stock').value     = p.stock    != null ? p.stock    : '';
  document.getElementById('ep-stockmin').value  = p.stockMin != null ? p.stockMin : '';
  openModal('modal-editar-producto');
}

function guardarEdicionProducto() {
  try {
    const key      = document.getElementById('ep-key').value;
    const icon     = document.getElementById('ep-icon').value.trim()  || '📦';
    const label    = document.getElementById('ep-label').value.trim();
    const desc     = document.getElementById('ep-desc').value.trim();
    const precio   = parseFloat(document.getElementById('ep-precio').value) || 0;
    const rapido   = document.getElementById('ep-rapido').checked;
    const esFisico = document.getElementById('ep-fisico').checked;
    const stockVal = document.getElementById('ep-stock').value;
    const stockMin = document.getElementById('ep-stockmin').value;
    const stock    = esFisico && stockVal !== '' ? parseInt(stockVal) : null; // puede ser negativo
    const stockMinV= esFisico && stockMin !== '' ? parseInt(stockMin) : null;

    if (!label) { toast('⚠️ El nombre no puede estar vacío', 'var(--sc-yellow)'); return; }

    const duplicado = productos.some(p => p.key !== key && p.label.toLowerCase() === label.toLowerCase());
    if (duplicado) { toast('⚠️ Ya existe un producto con ese nombre', 'var(--sc-yellow)'); return; }

    const idx = productos.findIndex(p => p.key === key);
    if (idx < 0) { toast('⚠️ Producto no encontrado', 'var(--sc-yellow)'); return; }

    // Preservar rapidoDash al editar
    const rapidoDash = productos[idx].rapidoDash || false;
    productos[idx] = { ...productos[idx], icon, label, desc, precio, rapido, rapidoDash, esFisico, stock, stockMin: stockMinV };

    saveProductos();

    // Cerrar modal y mostrar toast ANTES de los renders (para que no los bloqueen)
    closeModal('modal-editar-producto');
    toast(`✅ "${label}" actualizado`);

    // Renders después del toast
    try { actualizarSelectConceptos(); } catch(e) {}
    try { renderProductos(); } catch(e) {}
    try { renderQuickButtons(); } catch(e) {}
    try { renderVentasRapidasDash(); } catch(e) {}

  } catch(err) {
    toast('❌ Error al guardar: ' + err.message, 'var(--sc-red)');
  }
}

function guardarPrecios() {
  productos.forEach(p => {
    const ip  = document.getElementById('precio-'      + p.key);
    const ir  = document.getElementById('rapido-'      + p.key);
    const ird = document.getElementById('rapido-dash-' + p.key);
    const id  = document.getElementById('desc-'        + p.key);
    const ist = document.getElementById('stock-'       + p.key);
    const ism = document.getElementById('stockmin-'    + p.key);
    if (ip)  p.precio     = parseFloat(ip.value)  || 0;
    if (ir)  p.rapido     = ir.checked;
    if (ird) p.rapidoDash = ird.checked;
    if (id)  p.desc       = id.value.trim();
    if (ist) p.stock      = ist.value !== '' ? parseInt(ist.value) : null;
    if (ism) p.stockMin   = ism.value !== '' ? parseInt(ism.value) : null;
  });
  saveProductos();
  actualizarSelectConceptos();
  renderQuickButtons();
  renderVentasRapidasDash();
  renderStockAlertas();
  toast('✅ Catálogo guardado');
}

function actualizarSelectConceptos() {
  // Actualizar el <select> del form de nueva venta
  const sel = document.getElementById('f-concepto');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = productos
    .filter(p => !p._oculto && p.key !== 'retiro' && p.key !== 'egreso' && !p.soloLockers)
    .map(p => `<option value="${p.key}">${p.icon} ${p.label}${p.desc ? ' — ' + p.desc : ''}</option>`)
    .join('');
  // Restaurar selección si sigue existiendo
  if ([...sel.options].some(o => o.value === current)) sel.value = current;

  // Igual para el select de edición de venta
  const sel2 = document.getElementById('edit-concepto');
  if (sel2) {
    const cur2 = sel2.value;
    sel2.innerHTML = sel.innerHTML;
    if ([...sel2.options].some(o => o.value === cur2)) sel2.value = cur2;
  }
}


// ══════════════════════════════════════════
//  TICKET IMPRIMIBLE
// ══════════════════════════════════════════
function getConceptoLabel(concepto) {
  const labels = {
    membresia:   'Membresía mensual',
    semestral:   'Membresía semestral',
    anual:       'Membresía anual',
    pase_diario: 'Pase diario',
    locker:      'Locker',
    agua:        'Agua',
    cafe:        'Café',
    pack_cafe:   'Pack café',
    barrita:     'Barrita proteica',
    power:       'Power / Monster',
    soda:        'Soda',
    sauna:       'Sauna',
    rutina:      'Rutina personalizada',
    egreso:      'Egreso',
    retiro:      'Retiro de caja',
    otro:        'Otro',
  };
  return labels[concepto] || concepto || '—';
}

function imprimirTicket(v) {
  document.getElementById('tkt-sede').textContent    = v.sede || sedeActual;
  document.getElementById('tkt-fecha').textContent   = fmtDate(v.fecha);
  document.getElementById('tkt-hora').textContent    = v.hora || '—';
  document.getElementById('tkt-cliente').textContent = v.cliente || v.detalle || '—';
  document.getElementById('tkt-concepto').textContent= getConceptoLabel(v.concepto) || '—';
  document.getElementById('tkt-metodo').textContent  = ({
    efectivo:'Efectivo 💵', transferencia:'Transferencia 🏦',
    debito:'Débito 💳', credito:'Crédito 💳', qr:'QR / MercadoPago 📱'
  }[v.metodo] || v.metodo || '—');
  document.getElementById('tkt-total').textContent   = fmt$(ventaMonto(v));
  document.getElementById('tkt-numero').textContent  = v.numero || '';
  document.getElementById('ticket-print-wrap').style.display = 'block';
}

function cerrarTicket() {
  document.getElementById('ticket-print-wrap').style.display = 'none';
}

// Auto-mostrar ticket después de registrar venta
function mostrarConfirmVenta(v) {
  const el = document.getElementById('post-venta-confirm');
  if (!el) return;
  window._lastVenta = v;
  document.getElementById('pv-numero').textContent = v.numero || 'Venta registrada';
  document.getElementById('pv-resumen').textContent =
    `${v.cliente||v.detalle||'—'} · ${getConceptoLabel(v.concepto)} · ${fmt$(ventaMonto(v))}`;
  el.style.display = 'flex';
  clearTimeout(window._pvTimer);
  window._pvTimer = setTimeout(() => { el.style.display = 'none'; }, 30000);
}

function descargarTicketPDF() {
  const v = window._lastVenta;
  if (!v) return;
  const metodos = {
    efectivo:'Efectivo', transferencia:'Transferencia',
    debito:'Débito', credito:'Crédito', qr:'QR / MercadoPago'
  };
  const ticketHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      html{scroll-behavior:smooth}
*{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Courier New',monospace;font-size:11px;color:#000;width:72mm}
      .logo{text-align:center;font-size:20px;font-weight:900;letter-spacing:3px;padding:4mm 0 1mm}
      .sede{text-align:center;font-size:9px;color:#555;margin-bottom:3mm}
      .line{border:none;border-top:1px dashed #999;margin:3mm 0}
      .row{display:flex;justify-content:space-between;margin-bottom:2mm}
      .total{display:flex;justify-content:space-between;font-size:15px;font-weight:900;margin:2mm 0}
      .center{text-align:center}
      .muted{color:#777;font-size:9px}
    </style></head><body>
    <div class="logo">SPORTCLUB</div>
    <div class="sede">${v.sede||sedeActual} · TUCUMÁN</div>
    <hr class="line">
    <div class="row"><span>Fecha:</span><span>${fmtDate(v.fecha)}</span></div>
    <div class="row"><span>Hora:</span><span>${v.hora||'—'}</span></div>
    <hr class="line">
    <div class="row"><span>Cliente:</span><span><b>${v.cliente||v.detalle||'—'}</b></span></div>
    <div class="row"><span>Concepto:</span><span>${getConceptoLabel(v.concepto)||'—'}</span></div>
    <hr class="line">
    <div class="row"><span>Método:</span><span>${metodos[v.metodo]||v.metodo||'—'}</span></div>
    <div class="total"><span>TOTAL</span><span>$${ventaMonto(v).toLocaleString('es-AR')}</span></div>
    <hr class="line">
    <div class="center" style="font-size:10px;margin:2mm 0"><b>${v.numero||''}</b></div>
    <hr class="line">
    <div class="center muted">¡Gracias por entrenar con nosotros!</div>
    <div class="center muted" style="margin-top:1mm">SportClub Tucumán</div>
    </body></html>`;
  const win = window.open('', '_blank', 'width=340,height=520');
  if (!win) { toast('⚠️ Activá los popups para descargar el PDF', 'var(--sc-yellow)'); return; }
  win.document.write(ticketHTML);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// Mantener para uso desde historial
function mostrarTicketPostVenta(v) { mostrarConfirmVenta(v); }


// ══════════════════════════════════════════
//  HISTORIAL DE CONTACTOS WHATSAPP
// ══════════════════════════════════════════
// [moved to store.js] let waLog = JSON.parse(localStorage.getItem('sc_wa...

function saveWALog() {
  localStorage.setItem('sc_wa_log', JSON.stringify(waLog));
  clearTimeout(window._waSaveTimer);
  window._waSaveTimer = setTimeout(function(){ if (typeof save==='function') save(); }, 1500);
}

function registrarContactoWA(nombre, telefono, mensaje) {
  waLog.unshift({
    id: genUID(),
    fecha: todayStr(),
    hora: new Date().toTimeString().slice(0,5),
    nombre, telefono, mensaje,
    sede: sedeActual
  });
  if (waLog.length > 500) waLog = waLog.slice(0, 500);
  saveWALog();
  // Actualizar badge si está en la sección
  renderWAlog();
}


// ══════════════════════════════════════════
// === CONTACTOS: COPIAR Y PEGAR ===
// [moved to store.js] var contactosPegados = [];...

function procesarContactosPegados() {
  var paste = document.getElementById('contactos-paste');
  var texto = paste ? paste.value : '';
  var lineas = texto.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 2; });
  contactosPegados = [];
  for (var k = 0; k < lineas.length; k++) {
    var linea = lineas[k];
    var telMatch = linea.match(/[0-9][0-9 \-\.]{4,18}[0-9]/g) || [];
    var telLimpio = telMatch.map(function(t){ return t.replace(/[^0-9]/g, ''); }).filter(function(t){ return t.length >= 7; }).map(function(t){ return normalizarTelWA(t) || t; });
    var nombre = linea.replace(/[\d \-\.\/\:\(\)\+]+$/, '').replace(/[-:\/]$/, '').trim();
    if (nombre.length > 0 && telLimpio.length > 0) {
      contactosPegados.push({ nombre: nombre, telefonos: telLimpio });
    } else if (telLimpio.length > 0) {
      contactosPegados.push({ nombre: telLimpio[0], telefonos: telLimpio });
    }
  }
  var lbl = document.getElementById('vcf-count-label2');
  if (lbl) lbl.textContent = contactosPegados.length > 0 ? contactosPegados.length + ' contactos detectados' : '';
  var q = (document.getElementById('vcf-search') || {}).value || '';
  if (q) buscarContacto();
  else if (contactosPegados.length > 0) renderContactos(contactosPegados.slice(0, 100));
  else { var r = document.getElementById('vcf-results'); if (r) r.innerHTML = ''; }
}

function buscarContacto() {
  var q = ((document.getElementById('vcf-search') || {}).value || '').toLowerCase().trim();
  var el = document.getElementById('vcf-results');
  if (!el) return;
  if (!q) {
    if (contactosPegados.length > 0) renderContactos(contactosPegados.slice(0, 100));
    return;
  }
  var res = contactosPegados.filter(function(c) {
    return c.nombre.toLowerCase().includes(q) ||
      c.telefonos.some(function(t) { return t.includes(q.replace(/[^0-9]/g, '')); });
  }).slice(0, 50);
  if (!res.length) {
    el.innerHTML = '<div style="color:var(--muted);padding:10px;text-align:center;font-size:12px">Sin resultados</div>';
    return;
  }
  renderContactos(res);
}

function renderContactos(lista) {
  if (!lista) return;
  var el = document.getElementById('vcf-results');
  if (!el) return;
  var html = '';
  for (var i = 0; i < lista.length; i++) {
    var c = lista[i];
    var tels = c.telefonos.slice(0, 3);
    var inicial = c.nombre.charAt(0).toUpperCase();
    var btns = '';
    for (var j = 0; j < tels.length; j++) {
      var tel = tels[j];
      var wn = normalizarTelWA(tel);
      var ns = c.nombre.replace(/"/g, '').replace(/'/g, '');
      btns += '<a href="https://wa.me/' + wn + '" target="_blank"'
            + ' data-nom="' + ns + '" data-tel="' + tel + '" data-wa="1"'
            + ' style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:8px;'
            + 'background:#25D366;color:#fff;font-size:11px;font-weight:700;text-decoration:none;margin-left:4px">WA</a>';
    }
    html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--border)">'
          + '<div style="width:34px;height:34px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:var(--accent)">' + inicial + '</div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-weight:700;font-size:13px">' + c.nombre + '</div>'
          + '<div style="font-size:11px;color:var(--muted)">' + tels.join(' &middot; ') + '</div>'
          + '</div>'
          + '<div style="display:flex;gap:4px">' + btns + '</div>'
          + '</div>';
  }
  el.innerHTML = html;
  // Agregar listener para botones WA con data-wa
  el.querySelectorAll('[data-wa]').forEach(function(a) {
    a.addEventListener('click', function() {
      registrarContactoWA(this.dataset.nom, this.dataset.tel, 'Agenda');
    });
  });
}

function normalizarTelWA(tel) {
  var t = tel.replace(/[^0-9]/g, '');
  if (t.startsWith('549')) return t;
  if (t.startsWith('54'))  return '549' + t.slice(2);
  if (t.startsWith('0'))   t = t.slice(1);
  if (t.startsWith('15'))  t = t.slice(2);
  if (t.length >= 10) return '549' + t.slice(-10);
  return '549' + t;
}

function limpiarContactosPegados() {
  contactosPegados = [];
  var pa = document.getElementById('contactos-paste'); if (pa) pa.value = '';
  var sr = document.getElementById('vcf-search');      if (sr) sr.value = '';
  var re = document.getElementById('vcf-results');     if (re) re.innerHTML = '';
  var lb = document.getElementById('vcf-count-label2'); if (lb) lb.textContent = '';
}

function actualizarVCFLabel() {}


function renderWAlog() {
  const el = document.getElementById('wa-log-list');
  if (!el) return;
  const q = (document.getElementById('wa-search')?.value || '').toLowerCase();
  const filtrado = waLog.filter(w => !q || w.nombre?.toLowerCase().includes(q));

  if (!filtrado.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px 0;text-align:center">Sin contactos registrados todavía.<br><span style="font-size:11px">Los mensajes WA quedan acá automáticamente.</span></div>';
    return;
  }

  // Agrupar por fecha
  const grupos = {};
  filtrado.forEach(w => {
    if (!grupos[w.fecha]) grupos[w.fecha] = [];
    grupos[w.fecha].push(w);
  });

  el.innerHTML = Object.entries(grupos).sort(([a],[b]) => b.localeCompare(a)).map(([fecha, items]) => `
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;padding:10px 0 6px;border-bottom:1px solid var(--border)">${fmtDate(fecha)}</div>
    ${items.map(w => `
      <div class="wa-log-item">
        <div class="wa-log-dot"></div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${w.nombre}</div>
          <div style="color:var(--muted);font-size:11px;margin-top:2px">${w.hora} · ${w.sede || '—'} · ${w.telefono}</div>
          <div style="font-size:11px;color:var(--text);margin-top:4px;font-style:italic;opacity:.7">"${w.mensaje?.slice(0,80)}${w.mensaje?.length>80?'…':''}"</div>
        </div>
        <a class="btn-wa" href="https://wa.me/549${w.telefono?.replace(/\D/g,'')}?text=${encodeURIComponent(w.mensaje)}" 
           target="_blank" onclick="registrarContactoWA('${w.nombre.replace(/'/g,"&apos;")}','${w.telefono}','${(w.mensaje||'').replace(/'/g,"&apos;")}')">
          💬 Reenviar
        </a>
      </div>`).join('')}
  `).join('');
}

function limpiarWAlog() {
  if (!confirm('¿Limpiar todo el historial de contactos WA?')) return;
  waLog = [];
  saveWALog();
  renderWAlog();
  toast('Historial WA limpiado', 'var(--muted)');
}

// ══════════════════════════════════════════
//  BACKUP AUTOMÁTICO
// ══════════════════════════════════════════
// ══════════════════════════════════════════
//  RESET TOTAL DEL SISTEMA
// ══════════════════════════════════════════
function ejecutarReset() {
  const input = document.getElementById('reset-confirm-input');
  if (input?.value !== 'RESETEAR') return;

  // Hacer backup automático antes de borrar
  hacerBackup(false);

  // Limpiar datos operativos
  ventas           = [];
  socios           = [];
  historialCambios = [];
  contactos        = [];
  waLog            = [];
  crmNotas         = {};
  crmResueltos     = {};
  lockersH         = lockersH.map(l => ({ ...l, socio: '', telefono: '', vencimiento: '' }));
  lockersM         = lockersM.map(l => ({ ...l, socio: '', telefono: '', vencimiento: '' }));

  // Resetear numeradores de comprobantes
  localStorage.removeItem('sc_seq_v24');
  localStorage.removeItem('sc_seq_bn');

  // Limpiar retiros
  localStorage.removeItem('sc_retiros');

  // Guardar estado limpio
  saveData();
  saveCrmNotas();
  saveCrmResueltos();

  // Limpiar campo de confirmación
  if (input) { input.value = ''; }
  const btn = document.getElementById('btn-reset-exec');
  if (btn) btn.disabled = true;

  // Refrescar vistas
  renderDashboard();
  renderDashRecepcion();
  renderLockers();

  toast('✅ Sistema reseteado — comprobante reiniciado desde 0001', 'var(--green)');
}
function resetSeguro() {
  const confirmacion = prompt(
    '⚠️ ATENCIÓN: Esta acción borra TODOS los datos locales.\n\n' +
    'Se descargará un backup automático antes de continuar.\n\n' +
    'Escribí BORRAR para confirmar:'
  );
  if (confirmacion !== 'BORRAR') {
    toast('Reset cancelado', 'var(--sc-yellow)');
    return;
  }
  // Backup automático obligatorio
  try { descargarBackup(); } catch(e) {}
  setTimeout(() => {
    const keysToDelete = Object.keys(localStorage).filter(k =>
      k.startsWith('gc_') || k.startsWith('sc_') || k.startsWith('sp_')
    );
    keysToDelete.forEach(k => localStorage.removeItem(k));
    toast('Datos borrados — recargando...', 'var(--sc-red)');
    setTimeout(() => location.reload(), 1200);
  }, 800);
}


// ══════════════════════════════════════════
//  ALERTA DE STOCK BAJO EN DASHBOARD
// ══════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
//  PACK CAFÉ — gestión de fichas por cliente
// ══════════════════════════════════════════════════════════════

// [moved to store.js] let _packActivoId = null;...

function savePacksCafe() {
  localStorage.setItem('sc_packs_cafe', JSON.stringify(packsCafe));
  if (typeof save === 'function') save();
}

function abrirNuevoPack() {
  document.getElementById('pack-cliente').value = '';
  document.getElementById('pack-fichas').value  = '10';
  document.getElementById('pack-obs').value     = '';
  const sedeEl = document.getElementById('pack-sede');
  if (sedeEl) sedeEl.value = sedeActual;
  openModal('modal-nuevo-pack');
  setTimeout(() => document.getElementById('pack-cliente')?.focus(), 100);
}

function confirmarNuevoPack() {
  const cliente = document.getElementById('pack-cliente').value.trim();
  const fichas  = parseInt(document.getElementById('pack-fichas').value) || 10;
  const sede    = document.getElementById('pack-sede').value || sedeActual;
  const obs     = document.getElementById('pack-obs').value.trim();
  const metodo  = document.getElementById('pack-metodo')?.value || 'efectivo';

  if (!cliente) { toast('⚠️ Ingresá el nombre del cliente', 'var(--sc-yellow)'); return; }
  if (fichas <= 0 || fichas > 100) { toast('⚠️ Cantidad de fichas inválida (1-100)', 'var(--sc-yellow)'); return; }

  // Registrar venta en el historial
  const seq    = parseInt(localStorage.getItem(sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24') || '0') + 1;
  const seqKey = sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24';
  localStorage.setItem(seqKey, seq);
  const numero = (sede === 'BARRIO NORTE' ? 'SC-BN-' : 'SC-V24-') + String(seq).padStart(6,'0');
  const ventaPC = {
    id: genUID(), timestamp: Date.now(), numero, fecha: todayStr(),
    hora: new Date().toTimeString().slice(0,5), cliente, concepto: 'pack_cafe',
    sede, monto: getProducto('pack_cafe')?.precio || 0, unidades: 1,
    efectivo: (metodo==='efectivo' ? (getProducto('pack_cafe')?.precio||0) : 0),
    transferencia: (metodo==='transferencia' ? (getProducto('pack_cafe')?.precio||0) : 0),
    debito: (metodo==='debito' ? (getProducto('pack_cafe')?.precio||0) : 0),
    credito: (metodo==='credito' ? (getProducto('pack_cafe')?.precio||0) : 0),
    qr: (metodo==='qr' ? (getProducto('pack_cafe')?.precio||0) : 0),
    metodo: metodo, obs: obs || ('Pack café ' + fichas + ' fichas'), estado: 'cobrado'
  };
  ventas.push(ventaPC);

  // Crear pack
  packsCafe.push({
    id: genUID(),
    cliente,
    sede,
    fichasTotal: fichas,
    fichasDisp: fichas,
    fichasTragadas: 0,
    historial: [{ fecha: todayStr(), hora: new Date().toTimeString().slice(0,5), tipo: 'compra', fichas, obs: obs || '' }],
    creado: todayStr(),
    ventaId: ventaPC.id
  });

  savePacksCafe();
  save();
  closeModal('modal-nuevo-pack');
  renderPackCafe();
  toast('☕ Pack de ' + fichas + ' fichas creado para ' + cliente);
}

function abrirUsarFicha(packId) {
  const pack = packsCafe.find(p => p.id === packId);
  if (!pack) return;
  _packActivoId = packId;
  document.getElementById('uf-titulo').textContent = '☕ ' + pack.cliente;
  document.getElementById('uf-fichas-disp').textContent = pack.fichasDisp;
  openModal('modal-usar-ficha');
}

function confirmarUsarFicha(tipo) {
  const pack = packsCafe.find(p => p.id === _packActivoId);
  if (!pack) return;
  if (pack.fichasDisp <= 0) {
    toast('❌ No quedan fichas disponibles', 'var(--sc-red)');
    closeModal('modal-usar-ficha');
    return;
  }

  const hora = new Date().toTimeString().slice(0,5);
  pack.fichasDisp--;

  if (tipo === 'tragada') {
    pack.fichasTragadas = (pack.fichasTragadas || 0) + 1;
    pack.historial.unshift({ fecha: todayStr(), hora, tipo: 'tragada', obs: 'Ficha tragada por máquina' });

    // Registrar como venta de ficha tragada (precio $0)
    const seq    = parseInt(localStorage.getItem(sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24') || '0') + 1;
    const seqKey = sedeActual === 'BARRIO NORTE' ? 'sc_seq_bn' : 'sc_seq_v24';
    localStorage.setItem(seqKey, seq);
    const numero = (sedeActual === 'BARRIO NORTE' ? 'SC-BN-' : 'SC-V24-') + String(seq).padStart(6,'0');
    ventas.push({
      id: genUID(), timestamp: Date.now(), numero, fecha: todayStr(), hora,
      cliente: pack.cliente, concepto: 'ficha_tragada', sede: sedeActual,
      monto: 0, unidades: 1, efectivo: 0, transferencia: 0, debito: 0, credito: 0, qr: 0,
      metodo: 'cortesia', obs: 'Ficha tragada — pack de ' + pack.fichasTotal, estado: 'cobrado', _fichasTragada: true
    });
    toast('🪙 Ficha tragada registrada — ' + pack.cliente + ' (' + pack.fichasDisp + ' restantes)');
  } else {
    pack.historial.unshift({ fecha: todayStr(), hora, tipo: 'consumo', obs: 'Café consumido' });
    // Descontar 1 unidad del stock físico del producto café
    descontarStock('cafe', 1);
    toast('☕ Ficha usada — ' + pack.cliente + ' (' + pack.fichasDisp + ' restantes)');
  }

  savePacksCafe();
  save();
  closeModal('modal-usar-ficha');
  renderPackCafe();
}

function renderPackCafe() {
  const q       = (document.getElementById('pc-search')?.value || '').toLowerCase();
  const filtro  = document.getElementById('pc-filtro')?.value || 'activos';
  const sedeFil = document.getElementById('pc-sede-filtro')?.value || '';

  let lista = [...packsCafe].sort((a, b) => b.id - a.id);
  if (q)       lista = lista.filter(p => (p.cliente||'').toLowerCase().includes(q));
  if (sedeFil) lista = lista.filter(p => p.sede === sedeFil);
  if (filtro === 'activos')  lista = lista.filter(p => p.fichasDisp > 0);
  if (filtro === 'agotados') lista = lista.filter(p => p.fichasDisp <= 0);

  // KPI fichas tragadas del mes
  const mes = todayStr().slice(0,7);
  const tragadas = packsCafe.reduce((a, p) => {
    const t = (p.historial||[]).filter(h => h.tipo === 'tragada' && h.fecha?.startsWith(mes)).length;
    return a + t;
  }, 0);
  const totalPacks = packsCafe.filter(p => p.sede === (sedeFil || p.sede)).length;
  const el_t = document.getElementById('pc-fichas-tragadas-total');
  const el_s = document.getElementById('pc-fichas-tragadas-sub');
  if (el_t) el_t.textContent = tragadas;
  if (el_s) el_s.textContent = tragadas > 0
    ? tragadas + ' ficha' + (tragadas!==1?'s':'') + ' tragada' + (tragadas!==1?'s':'') + ' este mes · ' + totalPacks + ' packs'
    : 'Sin fichas tragadas este mes · ' + totalPacks + ' packs';

  // Badge en nav
  const activos = packsCafe.filter(p => p.fichasDisp > 0).length;
  const badge = document.getElementById('pack-cafe-badge');
  if (badge) { badge.textContent = activos; badge.style.display = activos > 0 ? 'inline' : 'none'; }

  const cont = document.getElementById('pc-lista');
  if (!cont) return;

  if (!lista.length) {
    cont.innerHTML = '<div style="text-align:center;padding:50px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:10px">☕</div><div style="font-size:16px;font-weight:600;color:var(--text)">Sin packs registrados</div><div style="margin-top:6px">Creá uno con el botón + NUEVO PACK</div></div>';
    return;
  }

  cont.innerHTML = lista.map(pack => {
    const pct      = Math.round(pack.fichasDisp / pack.fichasTotal * 100);
    const barColor = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--sc-yellow)' : 'var(--sc-red)';
    const fichasHTML = Array.from({length: pack.fichasTotal}, (_,i) => {
      const used = i >= pack.fichasDisp;
      const trag = i >= (pack.fichasDisp) && i < (pack.fichasDisp + (pack.fichasTragadas||0));
      return `<span style="font-size:18px;opacity:${used?'.2':'1'};filter:${trag?'grayscale(1)':'none'}" title="${used?(trag?'Tragada':'Usada'):'Disponible'}">${trag?'🪙':'☕'}</span>`;
    }).join('');

    const ultimaActividad = pack.historial?.[0];
    const histHTML = (pack.historial||[]).slice(0,5).map(h =>
      `<div style="font-size:11px;color:var(--muted);padding:3px 0;border-bottom:1px solid var(--border)">
        ${h.tipo==='compra'?'🟢':h.tipo==='tragada'?'🪙':'☕'} ${h.fecha} ${h.hora} — ${h.obs||h.tipo}
      </div>`
    ).join('');

    return `<div class="card" style="margin-bottom:12px;${pack.fichasDisp===0?'opacity:.6':''}">
      <div style="display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div>
          <div style="font-size:16px;font-weight:700">${pack.cliente}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            <span class="badge badge-teal" style="font-size:9px">${pack.sede}</span>
            <span style="margin-left:6px">📅 ${fmtDate(pack.creado)}</span>
            ${pack.fichasTragadas ? `<span style="margin-left:6px;color:var(--sc-yellow)">🪙 ${pack.fichasTragadas} tragada${pack.fichasTragadas!==1?'s':''}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'Bebas Neue';font-size:36px;color:${barColor};line-height:1">${pack.fichasDisp}</div>
          <div style="font-size:10px;color:var(--muted)">de ${pack.fichasTotal} fichas</div>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:10px">${fichasHTML}</div>

      <div style="background:var(--s2);border-radius:8px;height:8px;margin-bottom:12px">
        <div style="height:100%;border-radius:8px;background:${barColor};width:${pct}%;transition:width .4s"></div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${pack.fichasDisp > 0
          ? `<button class="btn btn-accent" style="font-weight:700;font-size:13px" onclick="abrirUsarFicha(${pack.id})">☕ Usar ficha</button>`
          : '<span style="font-size:12px;color:var(--sc-red);font-weight:600">❌ Sin fichas disponibles</span>'}
        <button class="btn btn-outline btn-sm" onclick="toggleHistorialPack('hist-${pack.id}')">📋 Historial</button>
        ${pack.fichasDisp === 0 ? '' : ''}
      </div>

      <div id="hist-${pack.id}" style="display:none;margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Últimos movimientos</div>
        ${histHTML || '<div style="font-size:11px;color:var(--muted)">Sin movimientos</div>'}
      </div>
    </div>`;
  }).join('');
}

function toggleHistorialPack(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════
//  TURNOS — cambio de turno y recaudación por turno
// ══════════════════════════════════════════════════════════════

function saveTurnos() {
  localStorage.setItem('sc_turnos', JSON.stringify(turnos));
  if (typeof save === 'function') save();
}

function getTurnoActual() {
  // El turno actual es el último registrado sin hora de cierre
  const abiertos = turnos.filter(t => !t.cierre && t.fecha === todayStr());
  return abiertos.length > 0 ? abiertos[abiertos.length-1] : null;
}

function abrirCambioTurno() {
  const turno = getTurnoActual();
  const hoy   = todayStr();

  // Calcular recaudación del turno actual
  let resumen = '';
  if (turno) {
    const ventasTurno = ventas.filter(v =>
      !v.anulada && v.fecha === hoy && v.hora >= turno.inicio &&
      v.concepto !== 'retiro' && v.concepto !== 'egreso' && !v._esGasto
    );
    const total = ventasTurno.reduce((a,v) => a + ventaMonto(v), 0);
    const ef    = ventasTurno.reduce((a,v) => a + (v.efectivo||0), 0);
    resumen = `<strong>${turno.personal}</strong> entró a las ${turno.inicio} — <strong style="color:var(--green)">${fmt$(total)}</strong> recaudado (💵 efectivo: ${fmt$(ef)}) · ${ventasTurno.length} venta${ventasTurno.length!==1?'s':''}`;
    document.getElementById('ct-sale').value = turno.personal || '';
  } else {
    resumen = 'No hay turno abierto hoy — este será el primer turno del día';
    document.getElementById('ct-sale').value = '';
  }

  document.getElementById('ct-resumen-turno').innerHTML = resumen;
  document.getElementById('ct-entra').value  = '';
  document.getElementById('ct-obs').value    = '';
  document.getElementById('ct-confirm-area').style.display = 'none';
  document.getElementById('ct-btn-confirm').textContent = '✅ Confirmar cambio';
  document.getElementById('ct-btn-confirm').onclick = preConfirmarTurno;
  _turnoConfirmado = false;
  openModal('modal-cambio-turno');
}

// [moved to store.js] let _turnoConfirmado = false;...

function preConfirmarTurno() {
  const sale  = document.getElementById('ct-sale').value.trim();
  const entra = document.getElementById('ct-entra').value.trim();
  if (!entra) { toast('⚠️ Ingresá quién entra al turno', 'var(--sc-yellow)'); return; }

  if (!_turnoConfirmado) {
    // Primera pulsación: mostrar confirmación
    const confirmArea = document.getElementById('ct-confirm-area');
    confirmArea.style.display = 'block';
    document.getElementById('ct-confirm-text').textContent =
      (sale ? sale + ' sale' : 'Apertura') + ' → ' + entra + ' entra';
    document.getElementById('ct-btn-confirm').textContent = '🔄 CONFIRMAR DEFINITIVAMENTE';
    document.getElementById('ct-btn-confirm').style.background = 'var(--sc-yellow)';
    document.getElementById('ct-btn-confirm').style.color = '#000';
    _turnoConfirmado = true;
    return;
  }

  // Segunda pulsación: ejecutar cambio
  ejecutarCambioTurno();
  _turnoConfirmado = false;
}

function ejecutarCambioTurno() {
  const sale  = document.getElementById('ct-sale').value.trim();
  const entra = document.getElementById('ct-entra').value.trim();
  const obs   = document.getElementById('ct-obs').value.trim();
  const ahora = new Date().toTimeString().slice(0,5);
  const hoy   = todayStr();

  // Cerrar turno actual si existe
  const turnoActual = getTurnoActual();
  if (turnoActual) {
    const ventasTurno = ventas.filter(v =>
      !v.anulada && v.fecha === hoy && v.hora >= turnoActual.inicio &&
      v.concepto !== 'retiro' && v.concepto !== 'egreso' && !v._esGasto
    );
    turnoActual.cierre        = ahora;
    turnoActual.personalSale  = sale || turnoActual.personal;
    turnoActual.totalRecaudado = ventasTurno.reduce((a,v) => a + ventaMonto(v), 0);
    turnoActual.cantVentas    = ventasTurno.length;
    turnoActual.obsCierre     = obs;
  }

  // Abrir nuevo turno
  turnos.push({
    id: genUID(),
    fecha:    hoy,
    inicio:   ahora,
    cierre:   null,
    personal: entra,
    sede:     sedeActual,
    obs:      obs || ''
  });

  saveTurnos();
  save();
  closeModal('modal-cambio-turno');
  renderTurnos();
  if (document.getElementById('section-dashboard')?.classList.contains('active')) renderDashboard();
  toast('🔄 Turno cambiado — ' + entra + ' ingresó a las ' + ahora, 'var(--green)');
}

function renderTurnos() {
  const hoy = todayStr();

  // Turno activo
  const turnoActual = getTurnoActual();
  const activeCard  = document.getElementById('turno-activo-content');
  if (activeCard) {
    if (turnoActual) {
      activeCard.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="width:12px;height:12px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse-border 1.5s infinite;flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Turno activo desde las ${turnoActual.inicio}</div>
            <div style="font-size:20px;font-weight:700;margin:4px 0">${turnoActual.personal}</div>
            <div style="font-size:12px;color:var(--muted)">${fmtDate(turnoActual.fecha)} · ${turnoActual.sede}</div>
          </div>
        </div>`;
    } else {
      activeCard.innerHTML = '<div style="color:var(--muted);font-size:13px">⚠️ No hay turno abierto hoy. Usá el botón para registrar el primer turno.</div>';
    }
  }

  // KPIs recaudación por turno
  const turnosHoy = turnos.filter(t => t.fecha === hoy).sort((a,b) => a.inicio.localeCompare(b.inicio));

  // Mañana = primer turno, Tarde = segundo turno (o según hora)
  const turnoManana = turnosHoy[0];
  const turnoTarde  = turnosHoy[1];

  const calcTurno = (t) => {
    if (!t) return { total:0, cant:0 };
    const fin = t.cierre || '23:59';
    const vts = ventas.filter(v =>
      !v.anulada && v.fecha === hoy && v.hora >= t.inicio && v.hora <= fin &&
      v.concepto !== 'retiro' && v.concepto !== 'egreso' && !v._esGasto
    );
    return { total: vts.reduce((a,v) => a + ventaMonto(v), 0), cant: vts.length, personal: t.personal };
  };

  const m = calcTurno(turnoManana);
  const t = calcTurno(turnoTarde);
  const total = m.total + t.total;
  const totalCant = m.cant + t.cant;

  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  set('t-manana',     fmt$(m.total));
  set('t-manana-sub', (m.personal || 'Sin turno') + ' · ' + m.cant + ' venta' + (m.cant!==1?'s':''));
  set('t-tarde',      fmt$(t.total));
  set('t-tarde-sub',  (t.personal || 'Sin turno') + ' · ' + t.cant + ' venta' + (t.cant!==1?'s':''));
  set('t-total',      fmt$(total));
  set('t-total-sub',  totalCant + ' venta' + (totalCant!==1?'s':'') + ' totales hoy');

  // Historial
  const histEl = document.getElementById('turnos-historial');
  if (!histEl) return;
  const todosTurnos = [...turnos].sort((a,b) => (b.fecha+b.inicio).localeCompare(a.fecha+a.inicio));
  if (!todosTurnos.length) {
    histEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center">Sin turnos registrados</div>';
    return;
  }
  histEl.innerHTML = todosTurnos.slice(0,20).map(t => {
    const esActual = !t.cierre && t.fecha === hoy;
    return `<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:50%;background:${esActual?'var(--green)':'var(--muted)'};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${t.personal}</div>
        <div style="font-size:11px;color:var(--muted)">${fmtDate(t.fecha)} · ${t.inicio}${t.cierre?' → '+t.cierre:' (turno activo)'} · ${t.sede}</div>
        ${t.obsCierre ? '<div style="font-size:11px;color:var(--muted)">📝 '+t.obsCierre+'</div>' : ''}
      </div>
      ${t.totalRecaudado != null ? `<div style="text-align:right;flex-shrink:0"><div style="font-weight:700;color:var(--green)">${fmt$(t.totalRecaudado)}</div><div style="font-size:10px;color:var(--muted)">${t.cantVentas||0} ventas</div></div>` : ''}
      ${esActual ? '<span style="font-size:10px;background:var(--green);color:#000;padding:2px 8px;border-radius:20px;font-weight:700;white-space:nowrap">EN TURNO</span>' : ''}
    </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════
//  ACCIONES CRM RÁPIDAS — No insistir / Renovado / Volvió
// ══════════════════════════════════════════════════════════════

const CRM_ACCIONES_CONFIG = {
  no_insistir: { label: '🚫 No insistir', color: 'var(--sc-red)',  dias: 30 },
  renovado:    { label: '✅ Renovado',     color: 'var(--green)',  dias: 30 },
  volvio:      { label: '🎉 Volvió!',      color: '#F59E0B',       dias: 0  },
};

function accionCRM(nombre, tipo) {
  const cfg = CRM_ACCIONES_CONFIG[tipo];
  if (!cfg) return;

  if (!crmNotas[nombre]) crmNotas[nombre] = [];

  // Registrar la nota
  crmNotas[nombre].unshift({
    fecha: todayStr(),
    hora:  new Date().toTimeString().slice(0,5),
    texto: cfg.label,
    tipo,
    autor: rolActual === 'admin' ? 'Admin' : 'Recepción',
    _accionRapida: true
  });

  // Si es renovado o volvió → marcar como resuelto temporalmente
  if (tipo === 'renovado' || tipo === 'volvio') {
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 30);
    const hastaStr = hasta.getFullYear()+'-'+String(hasta.getMonth()+1).padStart(2,'0')+'-'+String(hasta.getDate()).padStart(2,'0');
    crmResueltos[nombre] = { hasta: hastaStr, fecha: todayStr(), hora: new Date().toTimeString().slice(0,5), motivo: tipo };
    saveCrmResueltos();
  }

  // Si es no_insistir → marcar resuelto por 30 días
  if (tipo === 'no_insistir') {
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 30);
    const hastaStr = hasta.getFullYear()+'-'+String(hasta.getMonth()+1).padStart(2,'0')+'-'+String(hasta.getDate()).padStart(2,'0');
    crmResueltos[nombre] = { hasta: hastaStr, fecha: todayStr(), hora: new Date().toTimeString().slice(0,5), motivo: tipo };
    saveCrmResueltos();
  }

  saveCrmNotas();
  renderAlertas();
  try { renderCRMRanking(); } catch(e) {}

  const msgs = {
    no_insistir: '🚫 ' + nombre + ' — marcado como No insistir (30 días)',
    renovado:    '✅ ' + nombre + ' — ¡Renovado! Genial 💪',
    volvio:      '🎉 ' + nombre + ' — ¡Volvió al gym!',
  };
  toast(msgs[tipo] || cfg.label, cfg.color);
}

// Obtener estadísticas de acciones CRM
function getCRMStats(periodo) {
  const hoy = todayStr();
  let desde = '';
  if (periodo === 'hoy')    desde = hoy;
  else if (periodo === 'semana') {
    const d = new Date(hoy+'T00:00:00'); d.setDate(d.getDate()-6);
    desde = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  } else { // mes
    desde = hoy.slice(0,7)+'-01';
  }

  const stats = { no_insistir: 0, renovado: 0, volvio: 0 };
  Object.values(crmNotas).forEach(notas => {
    notas.forEach(n => {
      if (n._accionRapida && stats[n.tipo] !== undefined && n.fecha >= desde) {
        stats[n.tipo]++;
      }
    });
  });
  return stats;
}

function renderCRMRanking() {
  const el = document.getElementById('crm-ranking-wrap');
  if (!el) return;
  const periodo = document.getElementById('crm-rank-periodo')?.value || 'mes';
  const stats   = getCRMStats(periodo);
  const total   = stats.no_insistir + stats.renovado + stats.volvio;

  const items = [
    { tipo: 'renovado',    cfg: CRM_ACCIONES_CONFIG.renovado    },
    { tipo: 'volvio',      cfg: CRM_ACCIONES_CONFIG.volvio      },
    { tipo: 'no_insistir', cfg: CRM_ACCIONES_CONFIG.no_insistir },
  ];

  el.innerHTML = items.map(({ tipo, cfg }) => {
    const val = stats[tipo] || 0;
    const pct = total > 0 ? Math.round(val / total * 100) : 0;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;font-weight:600;color:${cfg.color}">${cfg.label}</span>
        <span style="font-size:18px;font-weight:700;font-family:'Bebas Neue';color:${cfg.color}">${val}</span>
      </div>
      <div style="background:var(--s2);border-radius:20px;height:8px">
        <div style="height:100%;border-radius:20px;background:${cfg.color};width:${pct}%;transition:width .5s;opacity:.85"></div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">${pct}% del total</div>
    </div>`;
  }).join('') + `<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;display:flex;justify-content:space-between">
    <span style="font-size:11px;color:var(--muted)">Total acciones</span>
    <span style="font-size:14px;font-weight:700">${total}</span>
  </div>`;
}


function renderDashStockAlerta() {
  const bajos = productos.filter(p =>
    p.esFisico && p.stock != null &&
    p.stock <= (p.stockMin != null ? p.stockMin : 5)
  );
  // Incluir siempre los negativos aunque no tengan stockMin configurado
  const buildHTML = () => {
    if (!bajos.length) return null;
    const sinStock  = bajos.filter(p => p.stock <= 0);
    const porAgotar = bajos.filter(p => p.stock > 0);
    return `
    <div class="dash-stock-alerta">
      <div class="dash-stock-alerta-icon">📦</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:700;color:var(--sc-red);margin-bottom:2px">
          ¡NECESITAMOS STOCKEARNOS!
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
          ${sinStock.length ? `<strong style="color:var(--sc-red)">${sinStock.length} producto${sinStock.length!==1?'s':''} sin stock</strong>` : ''}
          ${sinStock.length && porAgotar.length ? ' · ' : ''}
          ${porAgotar.length ? `${porAgotar.length} producto${porAgotar.length!==1?'s':''} por agotarse` : ''}
        </div>
        <div class="dash-stock-alerta-items">
          ${bajos.map(p => `
            <span class="dash-stock-chip">
              ${p.icon} ${p.label}${p.stock === 0 ? ' — SIN STOCK' : ` — quedan ${p.stock}`}
            </span>`).join('')}
        </div>
      </div>
      <button class="btn btn-outline btn-sm"
        onclick="goTo('productos',document.getElementById('nav-productos'))"
        style="border-color:var(--sc-red);color:var(--sc-red);white-space:nowrap">
        Ver stock →
      </button>
    </div>`;
  };
  const el = document.getElementById('dash-stock-alerta');
  if (el) { const html = buildHTML(); el.style.display = html ? 'block' : 'none'; if (html) el.innerHTML = html; }
  const elR = document.getElementById('dash-stock-alerta-rec');
  if (elR) { const html = buildHTML(); elR.style.display = html ? 'block' : 'none'; if (html) elR.innerHTML = html; }
}

const BACKUP_KEY = 'sc_last_backup';

// ══════════════════════════════════════════════════════
//  SISTEMA DE BACKUPS — SportClub Tucumán
// ══════════════════════════════════════════════════════
const BK_KEYS = {
  v24:    'sc_bk_last_v24',
  bn:     'sc_bk_last_bn',
  hist:   'sc_bk_last_hist',
  conf:   'sc_bk_last_conf',
  auto:   'sc_bk_auto',          // 'on' | 'off'
  autoDia:'sc_bk_auto_dia',      // fecha YYYY-MM-DD del último auto-backup
};

// Construir payload de un tipo de backup
function buildBackupPayload(tipo) {
  const ahora = new Date().toISOString();
  const hoy   = todayStr();

  if (tipo === 'VIA 24') {
    const v = ventas.filter(x => x.sede === 'VIA 24');
    const s = socios.filter(x => (x.sede || '') === 'VIA 24');
    return { version:'4.0', tipo:'sede_v24', fecha:ahora,
             ventas:v, socios:s, lockersH, lockersM,
             historialCambios:historialCambios.filter(c=>
               v.some(vv=>vv.id===c.ventaId)),
             contactos, waLog };
  }
  if (tipo === 'BARRIO NORTE') {
    const v = ventas.filter(x => x.sede === 'BARRIO NORTE');
    const s = socios.filter(x => (x.sede || '') === 'BARRIO NORTE');
    return { version:'4.0', tipo:'sede_bn', fecha:ahora,
             ventas:v, socios:s, lockersH, lockersM,
             historialCambios:historialCambios.filter(c=>
               v.some(vv=>vv.id===c.ventaId)),
             contactos, waLog };
  }
  if (tipo === 'HISTORICO') {
    return { version:'4.0', tipo:'historico', fecha:ahora,
             ventas, socios, lockersH, lockersM,
             historialCambios, contactos, waLog, egresos,
             crmNotas, crmResueltos };
  }
  if (tipo === 'CONFIG') {
    // Todo el localStorage del sistema EXCEPTO ventas/socios grandes
    const config = {};
    const skipKeys = new Set([KEYS.ventas, KEYS.socios, KEYS.cambios,
      KEYS.lockers_h, KEYS.lockers_m, 'sc_wa_log', 'sc_contactos',
      'sc_crm_notas', 'sc_crm_resueltos', 'sc_egresos']);
    Object.keys(localStorage).forEach(k => {
      if ((k.startsWith('gc_') || k.startsWith('sc_') || k.startsWith('sp_'))
          && !skipKeys.has(k)) {
        config[k] = localStorage.getItem(k);
      }
    });
    return { version:'4.0', tipo:'config', fecha:ahora,
             config,
             productos,
             lockersH, lockersM,
             egresos };
  }
  return null;
}

// Generar y descargar un backup específico
function descargarBackup(tipo, silencioso = false) {
  const payload = buildBackupPayload(tipo);
  if (!payload) return;

  const json  = JSON.stringify(payload, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const fecha = todayStr().replace(/-/g,'');
  const sufijo = { 'VIA 24':'via24', 'BARRIO NORTE':'bn',
                   'HISTORICO':'historico', 'CONFIG':'config' }[tipo] || tipo.toLowerCase();
  a.href     = url;
  a.download = `sportclub_${sufijo}_${fecha}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Registrar fecha en localStorage
  const dotKey  = { 'VIA 24':BK_KEYS.v24, 'BARRIO NORTE':BK_KEYS.bn,
                    'HISTORICO':BK_KEYS.hist, 'CONFIG':BK_KEYS.conf }[tipo];
  if (dotKey) localStorage.setItem(dotKey, todayStr());

  actualizarBackupUI();
  if (!silencioso) toast(`✅ Backup ${tipo} descargado`);
}

// Descargar todos los backups de una vez (con delay para no bloquear el browser)
async function descargarTodosLosBackups() {
  const tipos = ['VIA 24', 'BARRIO NORTE', 'HISTORICO', 'CONFIG'];
  toast('📥 Descargando 4 backups...');
  for (let i = 0; i < tipos.length; i++) {
    await new Promise(r => setTimeout(r, 600));
    descargarBackup(tipos[i], true);
  }
  toast('✅ Los 4 backups descargados correctamente', 'var(--green)');
  // Marcar auto-backup del día como hecho
  localStorage.setItem(BK_KEYS.autoDia, todayStr());
  actualizarBackupUI();
}

// Backup automático diario — se llama al iniciar la app
function checkBackupAuto() {
  const autoOn  = localStorage.getItem(BK_KEYS.auto) !== 'off'; // default ON
  const ultimoDia = localStorage.getItem(BK_KEYS.autoDia) || '';
  const hoy     = todayStr();

  // Actualizar toggle en UI
  const toggle = document.getElementById('backup-auto-toggle');
  if (toggle) toggle.checked = autoOn;
  actualizarSliderAuto(autoOn);
  actualizarBackupUI();

  if (!autoOn) return;
  if (ultimoDia === hoy) return; // ya se hizo hoy
  if (ventas.length === 0 && socios.length === 0) return; // sin datos, no hay nada que respaldar

  // Ejecutar automáticamente al abrir la app (con pequeño delay para no bloquear el render)
  setTimeout(async () => {
    const tipos = ['VIA 24', 'BARRIO NORTE', 'HISTORICO', 'CONFIG'];
    for (let i = 0; i < tipos.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      descargarBackup(tipos[i], true);
    }
    localStorage.setItem(BK_KEYS.autoDia, hoy);
    actualizarBackupUI();
    toast('📦 Backup diario automático completado (4 archivos)', 'var(--green)');
  }, 3000); // esperar 3s para que cargue todo
}

// Activar / desactivar backup automático
function toggleBackupAuto(activo) {
  localStorage.setItem(BK_KEYS.auto, activo ? 'on' : 'off');
  actualizarSliderAuto(activo);
  toast(activo ? '✅ Backup automático activado' : '⚠️ Backup automático desactivado',
        activo ? 'var(--green)' : 'var(--sc-yellow)');
}

function actualizarSliderAuto(activo) {
  const slider = document.getElementById('backup-auto-slider');
  const knob   = document.getElementById('backup-slider-knob');
  const dot    = document.getElementById('backup-auto-dot');
  const label  = document.getElementById('backup-auto-label');
  if (slider) slider.style.background = activo ? 'var(--green)' : 'var(--border)';
  if (knob)   knob.style.transform    = activo ? 'translateX(18px)' : 'translateX(0)';
  if (dot)    dot.style.background    = activo ? 'var(--green)' : 'var(--muted)';
  if (label)  label.textContent       = activo ? 'Backup automático: ON' : 'Backup automático: OFF';
}

// Actualizar los indicadores del panel de backups
function actualizarBackupUI() {
  const hoy = todayStr();
  const tipos = [
    { key: BK_KEYS.v24,  dotId: 'bk-dot-v24',  lastId: 'bk-last-v24'  },
    { key: BK_KEYS.bn,   dotId: 'bk-dot-bn',   lastId: 'bk-last-bn'   },
    { key: BK_KEYS.hist, dotId: 'bk-dot-hist',  lastId: 'bk-last-hist' },
    { key: BK_KEYS.conf, dotId: 'bk-dot-conf',  lastId: 'bk-last-conf' },
  ];
  tipos.forEach(({ key, dotId, lastId }) => {
    const ultima = localStorage.getItem(key) || '';
    const dot    = document.getElementById(dotId);
    const last   = document.getElementById(lastId);
    if (dot)  dot.textContent  = ultima === hoy ? '🟢' : (ultima ? '🟡' : '⚪');
    if (last) last.textContent = ultima
      ? (ultima === hoy ? 'Hoy ✓' : fmtDate(ultima))
      : 'Nunca';
  });
  // Compat: actualizar id="backup-last" si existe
  const bl = document.getElementById('backup-last');
  if (bl) {
    const ult = [BK_KEYS.v24,BK_KEYS.bn,BK_KEYS.hist,BK_KEYS.conf]
      .map(k=>localStorage.getItem(k)||'').filter(Boolean).sort().pop();
    bl.textContent = ult ? (ult === hoy ? 'Hoy ✓' : fmtDate(ult)) : 'Nunca';
  }
}

// Backward compat — la función hacerBackup original sigue funcionando
function hacerBackup(manual = false) {
  descargarBackup('HISTORICO', !manual);
  if (manual) {} // toast ya lo hace descargarBackup con silencioso=false
}

// checkBackupDiario — mantener por compatibilidad, ahora llama checkBackupAuto
function checkBackupDiario() { checkBackupAuto(); }



function restaurarBackup(file) { restaurarBackupV2(file); }

function restaurarBackupV2(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const datos = JSON.parse(e.target.result);
      const tipo  = datos.tipo || 'historico';

      if (tipo === 'config') {
        // Restaurar solo configuración
        if (!datos.config) throw new Error('Archivo de configuración inválido');
        Object.entries(datos.config).forEach(([k,v]) => localStorage.setItem(k, v));
        if (datos.productos) { productos = datos.productos; saveProductos(); }
        if (datos.lockersH)  { lockersH = datos.lockersH; }
        if (datos.lockersM)  { lockersM = datos.lockersM; }
        if (datos.egresos)   { egresos  = datos.egresos; saveEgresos(); }
        save();
        toast('✅ Configuración restaurada — recargando...', 'var(--green)');
        setTimeout(() => location.reload(), 1500);
        return;
      }

      // Restaurar datos (sede o histórico)
      if (!datos.ventas && !datos.socios) throw new Error('Archivo inválido — sin datos');

      const tipo_label = { sede_v24:'VIA 24', sede_bn:'BARRIO NORTE',
                           historico:'Histórico' }[tipo] || tipo;

      // Confirmación si hay datos existentes
      const tiene_datos = ventas.length > 0 || socios.length > 0;
      if (tiene_datos) {
        const ok = confirm(
          `⚠️ Restaurar backup ${tipo_label}

` +
          `Esto REEMPLAZARÁ los datos actuales:
` +
          `• ${datos.ventas?.length || 0} ventas
` +
          `• ${datos.socios?.length || 0} socios

` +
          `¿Confirmar?`
        );
        if (!ok) return;
      }

      ventas           = datos.ventas           || [];
      socios           = datos.socios           || [];
      lockersH         = datos.lockersH         || lockersH;
      lockersM         = datos.lockersM         || lockersM;
      historialCambios = datos.historialCambios || [];
      contactos        = datos.contactos        || contactos;
      waLog            = datos.waLog            || waLog;
      if (datos.egresos)      egresos      = datos.egresos;
      if (datos.crmNotas)     crmNotas     = datos.crmNotas;
      if (datos.crmResueltos) crmResueltos = datos.crmResueltos;

      save(); saveWALog(); saveEgresos();
      renderDashboard();
      renderDashRecepcion();
      toast(`✅ Backup ${tipo_label} restaurado — ${ventas.length} ventas, ${socios.length} socios`, 'var(--green)');
    } catch(err) {
      toast('❌ Error al restaurar: ' + err.message, 'var(--sc-red)');
    }
  };
  reader.readAsText(file);
}

// Backup automático al final del día — verificar 1x por día
function checkBackupDiario() {
  const lastBackup  = localStorage.getItem(BACKUP_KEY);
  const hoy         = todayStr();
  if (!lastBackup || !lastBackup.includes(new Date().toLocaleDateString('es-AR'))) {
    const hora = new Date().getHours();
    // Sugerir backup si es después de las 20hs y no se hizo hoy
    if (hora >= 20 && ventas.length > 0) {
      setTimeout(() => {
        if (confirm('📦 Backup diario\n\n¿Querés descargar el backup de hoy antes de cerrar?')) {
          hacerBackup();
        }
      }, 2000);
    }
  }
}

// ── ATAJOS DE TECLADO DESKTOP ──
document.addEventListener('keydown', e => {
  // Esc: cerrar cualquier modal abierto
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
      m.classList.remove('active');
    });
    return;
  }
  // Ignorar si hay un input/textarea enfocado
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  // Alt + R: ir a Registrar venta
  if (e.altKey && e.key === 'r') { e.preventDefault(); goTo('registrar', document.getElementById('nav-registrar')); }
  // Alt + D: ir a Dashboard
  if (e.altKey && e.key === 'd') { e.preventDefault(); if(esAdmin()) goTo('dashboard', document.getElementById('nav-dashboard')); }
  // Alt + A: ir a Alertas
  if (e.altKey && e.key === 'a') { e.preventDefault(); goTo('alertas', document.getElementById('nav-alertas')); }
  // Alt + H: ir a Historial
  if (e.altKey && e.key === 'h') { e.preventDefault(); if(esAdmin()) goTo('historial', document.getElementById('nav-historial')); }
});

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
// Iniciar fechas de retiros
// Estas inicializaciones se hacen en DOMContentLoaded
// const hoyInit, initTema, refreshDatalist → movidos a DOMContentLoaded
function updateOnlineStatus() {
  if (!navigator.onLine) setSyncStatus('offline', 'Sin internet — modo local');
  else if (!dbConectado) setSyncStatus('offline', 'Sin base de datos');
}
// Event listeners de red — no necesitan DOM
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
// El resto se inicializa en DOMContentLoaded


// Login screen se muestra automáticamente — no renderizar dashboard hasta que se loguee

// ══════════════════════════════════════════




// ── Funciones recuperadas de módulos ──
function ejecutarResetTotal() {
  // Backup automático antes de borrar
  try { hacerBackup(false); } catch(e) {}
  // Borrar absolutamente todo el localStorage del sistema
  const keysToDelete = Object.keys(localStorage).filter(k =>
    k.startsWith('gc_') || k.startsWith('sc_') || k.startsWith('sp_')
  );
  keysToDelete.forEach(k => localStorage.removeItem(k));
  toast('Sistema reseteado — recargando...', 'var(--sc-red)');
  setTimeout(() => location.reload(), 1200);
}

function confirmarResetTotal() {
  const modal = document.createElement('div');
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:20px`;
  modal.innerHTML = `
    <div style="background:var(--s1);border:2px solid var(--sc-red);border-radius:16px;
      padding:28px;max-width:440px;width:100%;text-align:center">
      <div style="font-size:48px;margin-bottom:12px">💣</div>
      <div style="font-family:'Bebas Neue';font-size:24px;color:var(--sc-red);margin-bottom:8px">
        RESET TOTAL DEL SISTEMA
      </div>
      <p style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:16px">
        Se borrará <strong style="color:var(--sc-red)">absolutamente todo</strong>: ventas, socios, 
        lockers, productos, notas CRM, historial y configuración.<br><br>
        El sistema quedará <strong style="color:var(--text)">como si fuera la primera vez que se abre</strong>.
      </p>
      <p style="font-size:12px;color:var(--sc-yellow);margin-bottom:6px">⚠️ Esta acción no se puede deshacer.</p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:20px">
        Escribí <strong style="color:var(--text)">RESET</strong> para confirmar:
      </p>
      <input type="text" id="reset-confirm-input-exp" placeholder="Escribí RESET"
        style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border);
          background:var(--s2);color:var(--text);font-family:'DM Sans';font-size:14px;
          text-align:center;outline:none;margin-bottom:16px;text-transform:uppercase">
      <div style="display:flex;gap:10px;justify-content:center">
        <button onclick="this.closest('div[style*=fixed]').remove()"
          style="padding:10px 24px;border-radius:8px;border:1px solid var(--border);
            background:var(--s2);color:var(--text);cursor:pointer;font-family:'DM Sans';font-size:13px">
          Cancelar
        </button>
        <button onclick="verificarResetTotal(this)"
          style="padding:10px 24px;border-radius:8px;border:none;
            background:var(--sc-red);color:#fff;cursor:pointer;font-family:'DM Sans';
            font-size:13px;font-weight:600;box-shadow:0 0 14px rgba(204,0,21,.4)">
          💣 Resetear todo
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('#reset-confirm-input')?.focus(), 100);
}

function verificarResetTotal(btn) {
  // Buscar el input más cercano al botón (puede haber duplicados de ID)
  const input = btn.closest('[id]')?.querySelector('[id*="reset-confirm-input"]') 
    || document.getElementById('reset-confirm-input-exp')
    || document.getElementById('reset-confirm-input');
  if (!input || input.value.toUpperCase() !== 'RESET') {
    input.style.borderColor = 'var(--sc-red)';
    input.style.animation = 'shake .3s ease';
    input.placeholder = '⚠ Escribí exactamente RESET';
    setTimeout(() => { input.style.borderColor = 'var(--border)'; input.style.animation = ''; }, 800);
    return;
  }
  btn.closest('div[style*="position:fixed"]').remove();
  ejecutarResetTotal();
}

async function forzarSync() {
  if (!dbConectado) {
    toast('⚠️ Sin conexión a la base de datos', 'var(--sc-yellow)');
    return;
  }
  const el = document.getElementById('sync-status');
  if (el) el.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block">⟳</span> Sincronizando...';
  try {
    await saveToSheets();
    await mergeFromSheets();
    toast('✅ Sincronización forzada completada', 'var(--green)');
  } catch(e) {
    toast('❌ Error al sincronizar: ' + e.message, 'var(--sc-red)');
  }
}

async function descargarDeSheets() {
  if (!dbConectado) { toast('⚠️ Conectá primero la base de datos', 'var(--sc-yellow)'); return; }
  const btn = event?.target;
  if (btn) { btn.innerHTML = '<span class="spinning">⟳</span> Descargando...'; btn.disabled = true; }
  try {
    const ok = await loadFromSheets();
    if (ok) {
      try { renderDashboard(); } catch(e){}
      try { renderDashRecepcion(); } catch(e){}
      const n = ventas.length;
      toast(`✅ ${n} ventas + todos los datos descargados`);
    }
  } catch(e) {
    toast('❌ Error: ' + e.message, 'var(--sc-red)');
  }
  if (btn) { btn.innerHTML = '⬇️ Descargar desde Sheets'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════
//  INICIALIZACIÓN — conecta módulos con la UI
// ══════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {

  // 1. Inicializar aliases de state (window.SC ya está disponible)
  if (window.SC) {
    _initStateAliases();
  }

  // 2. UI básica
  const topbarDate = document.getElementById('topbar-date');
  if (topbarDate) topbarDate.textContent =
    new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  setFechaHoy();
  const cajaFecha = document.getElementById('caja-fecha');
  if (cajaFecha) cajaFecha.value = todayStr();

  try { initExportarSelect(); } catch(e) {}

  // Inicializar filtros de retiro
  const hoyI = todayStr();
  const retDesde = document.getElementById('ret-desde');
  const retHasta = document.getElementById('ret-hasta');
  if (retDesde) retDesde.value = hoyI.slice(0,8)+'01';
  if (retHasta) retHasta.value = hoyI;

  try { initTema(); } catch(e) {}
  try { refreshDatalist(); } catch(e) {}
  try { setSede(sedeActual); } catch(e) {}
  try { actualizarSelectConceptos(); } catch(e) {}
  try { renderQuickButtons(); } catch(e) {}
  try { actualizarVCFLabel(); } catch(e) {}
  try { renderVentasRapidasDash(); } catch(e) {}
  try { actualizarBackupUI(); } catch(e) {}
  try { updateOnlineStatus(); } catch(e) {}
  try { renderImportStatus(); } catch(e) {}

  // 3. Conectar con GAS y sincronizar
  setTimeout(async () => {
    try {
      const cfg = getGasConfig();
      if (cfg.url && cfg.token) {
        if (window.SC?.state) {
          window.SC.state.gasUrl   = cfg.url;
          window.SC.state.gasToken = cfg.token;
        }
        setSyncStatus('loading', 'Conectando...');
        const ok = await (window.SC?.sync?.testConexion?.() || Promise.resolve(false));
        if (ok) {
          await window.SC?.sync?.loadFromRemote?.();
          _initStateAliases(); // re-sync aliases después de carga remota
          try { renderDashboard(); } catch(e) {}
          try { renderDashRecepcion(); } catch(e) {}
          window.SC?.sync?.startPolling?.();
        }
      } else {
        setSyncStatus('offline', 'Sin base de datos configurada');
      }
    } catch(e) {
      setSyncStatus('offline', 'Sin conexión — modo local activo');
    }
  }, 500);

  setTimeout(() => { try { checkBackupAuto(); } catch(e) {} }, 1500);
  setTimeout(() => { try { checkRenovacionAutoLockers(); } catch(e) {} }, 2200);
});
