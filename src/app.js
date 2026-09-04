import { supabase, BUCKET } from './supabaseClient.js';
import { SITE_URL } from './config.js';
import { encodeQR, qrToSVG, qrToCanvas } from './qrcode.js';
import { makeZip } from './zip.js';
import { makeSingleImagePDF } from './pdf.js';

// ── DATA (aus Supabase geladen) ────────────────────────────────
let STATIONS = [];
let GALLERY = [];
let dataLoaded = false;
let dataError = null;
let session = null;

const QUELLEN = [
  { t:'Deutsche Digitale Bibliothek / Westfälisches Wirtschaftsarchiv',
    s:'Firmenbestand Funcke &amp; Hueck',
    d:'Gründung, Unternehmensleitung, Beschäftigtenentwicklung, Gesenkschmiede, Sozialpolitik, Wiederaufbau und Verkauf an Bauer &amp; Schaurte.' },
  { t:'Tag des offenen Denkmals / Deutsche Stiftung Denkmalschutz',
    s:'Denkmalbeschreibung',
    d:'Bau- und Standortgeschichte der ehemaligen Schraubenfabrik sowie Angaben zur aktuellen Sanierung und Nutzung.' },
  { t:'Ardey-Verlag',
    s:'Wissenschaftliche Materialien zur Hagener Industrialisierung',
    d:'Daten zu Handelskammer, Beschäftigtenentwicklung, Unterstützungskassen und wirtschaftlicher Einordnung der Hagener Industrie.' },
  { t:'Stadtarchiv Hagen',
    s:'Lokale Bestände der Industriegeschichte',
    d:'Weiterführende Akten und Fotografien zu Funcke &amp; Hueck und zur Hagener Zeitgeschichte.' },
  { t:'Deutsche Biographie',
    s:'Biografische Einträge',
    d:'Wilhelm Funcke, Karl Ernst Osthaus und Liselotte Funcke — Familienbeziehungen, wirtschaftspolitisches Wirken und politische Funktionen.' },
  { t:'Stadt Hagen',
    s:'Stadtporträt / Ehrenbürger',
    d:'Nachweise zur Ehrenbürgerwürde Theodor Springmanns (1925) und Liselotte Funckes (2003).' },
  { t:'Deutscher Bundestag',
    s:'Historische Mitgliederverzeichnisse',
    d:'Parlamentsunterlagen zu Oscar Funcke als Abgeordnetem des ersten Deutschen Bundestages.' },
  { t:'FernUniversität in Hagen · Deutsches Historisches Museum',
    s:'Ergänzende Angaben',
    d:'Biografische und stadtgeschichtliche Angaben zu Karl Ernst Osthaus und Liselotte Funcke.' },
  { t:'Projektseite Alte Schraubenfabrik',
    s:'Jüngere Gebäudegeschichte',
    d:'Stilllegung, Abrissphase und Sanierung des erhaltenen Baus.' },
  { t:'Ergänzende Film- und Ortsquellen',
    s:'Nicht zentrale Quelle',
    d:'Hinweise auf die Nutzung des ehemaligen Fabrikgeländes als Drehort von „Manta, Manta" 1991.' },
];

// ── STATE ────────────────────────────────────────────────────
let state = {
  view: 'loading',       // loading | error | visitor | admin-login | admin
  vScreen: 'start',       // start | list | scanner | station | sources
  stIdx: 0,
  playing: false,
  elapsed: 0,
  galIdx: 0,
  lightbox: false,
  scanState: 'idle',      // idle | requesting | live | denied | done
  scanError: '',
  // admin
  aScreen: 'dash',        // dash | edit | qr
  loginEmail: '',
  loginPw: '',
  loginErr: '',
  loginLoading: false,
  pwVisible: false,
  editIdx: -1,             // -1 = neue Station
  editTitle: '', editSub: '', editEra: '', editDesc: '', editStatus: 'draft', editDur: 0,
  editImageUrl: null, editImageFile: null,
  editAudioUrl: null, editAudioName: null, editAudioType: null, editAudioFile: null,
  saving: false,
  searchQ: '', filterStatus: 'all',
  qrSize: 168,
  qrLabel: true,
  qrStationId: null,
};

function setState(partial) { state = { ...state, ...partial }; render(); }

// ── SPEECH SYNTHESIS (Fallback ohne hochgeladene Audiodatei) ──
let tickTimer = null;
const synth = window.speechSynthesis;
let currentUtterance = null;
let speechStartTime = null;
let realAudioEl = null;
let _voices = [];
function _loadVoices() { _voices = synth.getVoices(); }
_loadVoices();
if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = _loadVoices;
function _bestVoice() {
  const vs = _voices.length ? _voices : synth.getVoices();
  return vs.find(v => v.lang === 'de-DE') || vs.find(v => v.lang && v.lang.startsWith('de')) || vs[0] || null;
}
function _startTick() {
  stopTick();
  const st = STATIONS[state.stIdx]; if (!st) return;
  const dur = st.dur;
  tickTimer = setInterval(() => {
    if (!state.playing || !speechStartTime) return;
    const el = Math.min(Math.floor((Date.now() - speechStartTime) / 1000), dur);
    if (el !== state.elapsed) { state.elapsed = el; patchPlayerUI(el, dur); }
    if (synth.speaking && !synth.paused) { try { synth.pause(); synth.resume(); } catch (e) {} }
  }, 300);
}
function startSpeech() {
  stopSpeech();
  const st = STATIONS[state.stIdx]; if (!st) return;
  if (st.audio_url) { startRealAudio(st); return; }
  if (!('speechSynthesis' in window)) return;
  const text = st.narration || st.description || '';
  const dur = st.dur;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'de-DE'; utter.rate = 0.9; utter.volume = 1.0;
  const v = _bestVoice(); if (v) utter.voice = v;
  currentUtterance = utter;
  speechStartTime = Date.now() - (state.elapsed * 1000);
  utter.onstart = () => { speechStartTime = Date.now() - (state.elapsed * 1000); };
  utter.onboundary = () => {
    if (!speechStartTime) return;
    const el = Math.min(Math.floor((Date.now() - speechStartTime) / 1000), dur);
    state.elapsed = el; patchPlayerUI(el, dur);
  };
  utter.onend = () => { stopTick(); state = { ...state, playing: false, elapsed: dur }; currentUtterance = null; render(); };
  utter.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    stopTick(); state = { ...state, playing: false }; currentUtterance = null; render();
  };
  _startTick();
  synth.speak(utter);
}
function startRealAudio(st) {
  if (!realAudioEl || realAudioEl.dataset.src !== st.audio_url) {
    realAudioEl = new Audio(st.audio_url);
    realAudioEl.dataset.src = st.audio_url;
    realAudioEl.addEventListener('timeupdate', () => {
      const el = Math.floor(realAudioEl.currentTime);
      if (el !== state.elapsed) { state.elapsed = el; patchPlayerUI(el, Math.round(realAudioEl.duration) || st.dur); }
    });
    realAudioEl.addEventListener('ended', () => {
      state = { ...state, playing: false, elapsed: Math.round(realAudioEl.duration) || st.dur }; render();
    });
  }
  realAudioEl.currentTime = state.elapsed || 0;
  realAudioEl.play().catch(() => {});
}
function stopSpeech() {
  stopTick(); speechStartTime = null;
  try { synth.cancel(); } catch (e) {}
  currentUtterance = null;
  if (realAudioEl) { try { realAudioEl.pause(); } catch (e) {} }
}
function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
function toggleSpeech() {
  const st = STATIONS[state.stIdx]; if (!st) return;
  if (st.audio_url) {
    if (state.playing) { try { realAudioEl && realAudioEl.pause(); } catch (e) {} state = { ...state, playing: false }; render(); }
    else { state = { ...state, playing: true }; render(); startRealAudio(st); }
    return;
  }
  if (!('speechSynthesis' in window)) { alert('Ihr Browser unterstützt keine Sprachausgabe. Bitte Chrome oder Safari verwenden.'); return; }
  if (state.playing) {
    stopTick(); try { synth.pause(); } catch (e) {}
    state = { ...state, playing: false }; render();
  } else {
    state = { ...state, playing: true }; render();
    if (synth.paused) {
      try { synth.resume(); speechStartTime = Date.now() - (state.elapsed * 1000); _startTick(); }
      catch (e) { startSpeech(); }
    } else startSpeech();
  }
}
function skipSpeech(seconds) {
  const st = STATIONS[state.stIdx]; if (!st) return;
  const dur = st.dur;
  const newElapsed = Math.max(0, Math.min(dur - 2, state.elapsed + seconds));
  if (st.audio_url) {
    state = { ...state, elapsed: newElapsed };
    if (realAudioEl) realAudioEl.currentTime = newElapsed;
    render(); return;
  }
  const wasPlaying = state.playing;
  stopSpeech();
  state = { ...state, elapsed: newElapsed, playing: wasPlaying };
  render();
  if (wasPlaying) { speechStartTime = Date.now() - (newElapsed * 1000); startSpeech(); }
}

// ── HELPERS ──────────────────────────────────────────────────
function fmt(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slugify(s) {
  return (s || '').toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/&/g, 'und')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'station';
}
function uniqueSlug(base) {
  let s = base, n = 2;
  while (STATIONS.some(st => st.slug === s)) { s = `${base}-${n}`; n++; }
  return s;
}
function nextStationId() {
  const nums = STATIONS.map(s => parseInt(s.id, 10)).filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(next).padStart(2, '0');
}
function stationUrl(st) { return `${SITE_URL}/#/s/${st.slug}`; }
function findStationBySlugOrUrl(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/\/s\/([a-z0-9-]+)/i);
  const needle = (m ? m[1] : s).toLowerCase();
  let idx = STATIONS.findIndex(st => st.slug === needle);
  if (idx < 0) idx = STATIONS.findIndex(st => st.id === needle || String(Number(needle)).padStart(2, '0') === st.id);
  return idx;
}
function makeWaveform(prog) {
  const h = [8,14,19,11,23,17,26,20,14,28,21,24,13,22,25,28,19,16,23,14,21,26,18,23,28,20,13,24,20,17,26,20,15,22,18,27,21,14,24,17,23,19,27,21,16];
  const cut = Math.floor(h.length * prog);
  return h.map((v, i) => `<div class="wv-bar" style="flex-shrink:0;width:2.5px;height:${v}px;border-radius:1.5px;background:${i < cut ? '#C9A87C' : 'rgba(255,255,255,.18)'}"></div>`).join('');
}
function patchPlayerUI(elapsed, dur) {
  const prog = dur > 0 ? elapsed / dur : 0;
  const pct = (prog * 100).toFixed(1) + '%';
  const elEl = document.getElementById('pl-elapsed');
  const bar = document.getElementById('pl-bar');
  const th = document.getElementById('pl-thumb');
  if (elEl) elEl.textContent = fmt(elapsed);
  if (bar) bar.style.width = pct;
  if (th) th.style.left = pct;
  const bars = document.querySelectorAll('.wv-bar');
  const cut = Math.floor(bars.length * prog);
  bars.forEach((b, i) => { b.style.background = i < cut ? '#C9A87C' : 'rgba(255,255,255,.18)'; });
}
function toast(msg) {
  const el = document.getElementById('toast-box');
  if (!el) return;
  el.textContent = msg; el.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.opacity = '0'; }, 3200);
}

// ── SUPABASE DATENZUGRIFF ───────────────────────────────────
async function loadData() {
  const [stRes, galRes] = await Promise.all([
    supabase.from('stations').select('*').order('sort_order', { ascending: true }),
    supabase.from('gallery').select('*').order('sort_order', { ascending: true }),
  ]);
  if (stRes.error) throw stRes.error;
  if (galRes.error) throw galRes.error;
  STATIONS = stRes.data || [];
  GALLERY = (galRes.data || []).map(g => ({ src: g.image_url, cap: g.caption }));
}
async function incrementScan(stationId) {
  try { await supabase.rpc('increment_station_scans', { station_id: stationId }); } catch (e) {}
}
async function uploadToStorage(file, folder) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ── SCANNER (Kamera) ─────────────────────────────────────────
// jsQR wird lokal mitgeliefert (src/vendor/jsQR.js, klassisches <script>
// in index.html) und läuft immer als zuverlässiger Decoder mit - die
// browsereigene BarcodeDetector-API wird zusätzlich versucht, wo
// vorhanden, ist aber auf vielen Geräten zwar als API "vorhanden",
// erkennt in der Praxis aber keine Codes (Kamera geht an, es scannt
// aber nie). Deshalb nie allein darauf verlassen.
let scanStream = null, scanTimer = null, scanDetector = null;
let scanCanvas = null, scanCtx = null, scanBusy = false;

function stopCamera() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  scanDetector = null;
  scanBusy = false;
}

function scanWithJsQR(video) {
  if (typeof window.jsQR !== 'function' || !video.videoWidth) return;
  const maxW = 480; // kleiner Frame reicht für QR-Erkennung und ist deutlich schneller
  const scale = Math.min(1, maxW / video.videoWidth);
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));
  if (!scanCanvas) { scanCanvas = document.createElement('canvas'); scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true }); }
  scanCanvas.width = w; scanCanvas.height = h;
  scanCtx.drawImage(video, 0, 0, w, h);
  let img;
  try { img = scanCtx.getImageData(0, 0, w, h); } catch (e) { return; }
  const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  if (code && code.data) handleScanResult(code.data);
}

function scanFrame(video) {
  if (scanBusy || !video.videoWidth) return;
  if (scanDetector) {
    scanBusy = true;
    scanDetector.detect(video)
      .then(codes => {
        if (codes && codes.length) { handleScanResult(codes[0].rawValue); return; }
        scanWithJsQR(video);
      })
      .catch(() => scanWithJsQR(video))
      .finally(() => { scanBusy = false; });
  } else {
    scanWithJsQR(video);
  }
}

async function startCamera() {
  stopCamera();
  setState({ scanState: 'requesting', scanError: '' });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    scanStream = stream;
    setState({ scanState: 'live' });
    requestAnimationFrame(() => {
      const video = document.getElementById('scan-video');
      if (!video) return;
      video.srcObject = stream;
      video.play().catch(() => {});
      if ('BarcodeDetector' in window) {
        try { scanDetector = new window.BarcodeDetector({ formats: ['qr_code'] }); }
        catch (e) { scanDetector = null; }
      }
      scanTimer = setInterval(() => scanFrame(video), 300);
    });
  } catch (e) {
    let msg = 'Kamera konnte nicht gestartet werden.';
    if (e && e.name === 'NotAllowedError') msg = 'Kamerazugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben.';
    else if (e && e.name === 'NotFoundError') msg = 'Keine Kamera gefunden. Prüfen Sie, ob ein Gerät verbunden ist, oder nutzen Sie die manuelle Eingabe.';
    setState({ scanState: 'denied', scanError: msg });
  }
}
function handleScanResult(raw) {
  const idx = findStationBySlugOrUrl(raw);
  if (idx < 0) return;
  stopCamera();
  setState({ scanState: 'done' });
  setTimeout(() => openStation(idx), 900);
}
function openStation(idx, { fromScan } = {}) {
  stopSpeech();
  const st = STATIONS[idx];
  setState({ view: 'visitor', vScreen: 'station', stIdx: idx, elapsed: 0, playing: false, galIdx: 0, lightbox: false, scanState: 'idle' });
  if (st) incrementScan(st.id);
}

// ── ROUTING ──────────────────────────────────────────────────
function parseRoute() {
  const hash = location.hash || '';
  if (/^#\/?admin$/.test(hash)) return { type: 'admin' };
  const m = hash.match(/^#\/s\/([a-z0-9-]+)/i);
  if (m) return { type: 'station', slug: m[1] };
  return { type: 'start' };
}
async function applyInitialRoute() {
  const route = parseRoute();
  if (route.type === 'admin') {
    if (session) setState({ view: 'admin', aScreen: 'dash' });
    else setState({ view: 'admin-login', loginErr: '' });
    return;
  }
  if (route.type === 'station') {
    const idx = STATIONS.findIndex(st => st.slug === route.slug);
    if (idx >= 0) { openStation(idx); return; }
  }
  setState({ view: 'visitor', vScreen: 'start' });
}

// ── RENDER ────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  const prev = app.querySelectorAll('.scroll');
  const tops = Array.from(prev).map(el => el.scrollTop);
  app.innerHTML = buildApp();
  app.className = (state.view === 'admin' || state.view === 'admin-login') ? 'mode-admin' : 'mode-visitor';
  const next = app.querySelectorAll('.scroll');
  next.forEach((el, i) => { if (tops[i] != null) el.scrollTop = tops[i]; });
  bindEvents();
}

function buildApp() {
  if (state.view === 'loading') return buildLoading();
  if (state.view === 'error') return buildErrorScreen();
  if (state.view === 'visitor') return buildVisitor();
  if (state.view === 'admin-login') return buildAdminLogin();
  if (state.view === 'admin') return buildAdmin();
  return '';
}

function buildLoading() {
  return `
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#3C3C3B;gap:16px;">
    <span style="width:34px;height:34px;border:3px solid rgba(255,255,255,.25);border-top-color:#C9A87C;border-radius:50%;display:inline-block;animation:spin .8s linear infinite;"></span>
    <div style="font:400 13px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.6);">Audioguide wird geladen…</div>
  </div>`;
}
function buildErrorScreen() {
  return `
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#faf7f7;gap:14px;padding:0 30px;text-align:center;">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c1453f" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
    <div style="font:700 18px 'Cormorant Garamond',serif;color:#3C3C3B;">Verbindung fehlgeschlagen</div>
    <p style="font:400 14px/1.6 'Hanken Grotesk',sans-serif;color:#706f6f;margin:0;max-width:320px;">${escHtml(dataError || 'Die Daten konnten nicht geladen werden. Prüfen Sie SUPABASE_URL und SUPABASE_ANON_KEY in src/config.js.')}</p>
    <button data-action="retry-load" class="tap" style="margin-top:6px;background:#3C3C3B;color:#faf7f7;border:none;border-radius:999px;padding:12px 22px;font:600 13px 'Hanken Grotesk',sans-serif;cursor:pointer;">Erneut versuchen</button>
  </div>`;
}

// ════ VISITOR ════
function buildVisitor() {
  let content = '';
  if (state.vScreen === 'start') content = buildStart();
  if (state.vScreen === 'list') content = buildList();
  if (state.vScreen === 'scanner') content = buildScanner();
  if (state.vScreen === 'station') content = buildStation();
  if (state.vScreen === 'sources') content = buildSources();
  if (state.vScreen === 'impressum') content = buildImpressum();
  if (state.vScreen === 'datenschutz') content = buildDatenschutz();
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:${state.vScreen === 'scanner' ? '#0A0A0A' : state.vScreen === 'station' ? '#ffffff' : '#faf7f7'};">
    ${content}
  </div>
  ${buildLightbox()}
  ${buildToast()}`;
}

function buildToast() {
  return `<div id="toast-box" style="position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#3C3C3B;color:#fff;padding:11px 20px;border-radius:999px;font:500 13px 'Hanken Grotesk',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:opacity .25s;z-index:500;max-width:86vw;text-align:center;"></div>`;
}

function buildSources() {
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#faf7f7;animation:fadein .2s ease both;">
    <div style="background:#faf7f7;padding:env(safe-area-inset-top,0px) 18px 0;flex-shrink:0;border-bottom:1px solid #e9e4e4;">
      <div style="height:56px;display:flex;align-items:center;justify-content:space-between;">
        <button data-action="go-start" class="tap" style="width:42px;height:42px;border-radius:50%;background:#e9e4e4;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" aria-label="Zurück">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3C3C3B" stroke-width="2.5"><path d="M19 12H5M5 12l7 7M5 12l7-7"/></svg>
        </button>
        <span style="font:600 16px 'Hanken Grotesk',sans-serif;color:#3C3C3B;">Quellen</span>
        <div style="width:42px;"></div>
      </div>
    </div>
    <div class="scroll" style="flex:1;">
      <div style="padding:22px 20px 8px;">
        <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#C9A87C;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">Recherchegrundlage</div>
        <h2 style="font:600 24px/1.2 'Cormorant Garamond',serif;color:#3C3C3B;margin:0 0 12px;letter-spacing:-.2px;">Woher die Inhalte stammen</h2>
        <p style="font:400 15px/1.7 'Hanken Grotesk',sans-serif;color:#706f6f;margin:0 0 6px;text-wrap:pretty;">Die Texte dieses Audioguides beruhen auf öffentlich zugänglichen Denkmal-, Archiv- und industriegeschichtlichen Quellen sowie auf Angaben zur heutigen Nutzung.</p>
        <p style="font:400 15px/1.7 'Hanken Grotesk',sans-serif;color:#706f6f;margin:0 0 22px;text-wrap:pretty;">Wo Einzelheiten online nicht eindeutig belegbar sind, wurde bewusst auf weitergehende Behauptungen verzichtet — etwa zum Einsatz von Zwangsarbeitskräften während des Zweiten Weltkriegs.</p>
      </div>
      ${QUELLEN.map((it, i) => `
      <div style="padding:16px 20px;border-top:1px solid #e9e4e4;background:#fff;">
        <div style="display:flex;gap:12px;">
          <span style="font:600 11px 'Hanken Grotesk',sans-serif;color:#C9A87C;flex-shrink:0;padding-top:2px;">${String(i + 1).padStart(2, '0')}</span>
          <div style="min-width:0;">
            <div style="font:600 14px/1.35 'Hanken Grotesk',sans-serif;color:#3C3C3B;">${it.t}</div>
            <div style="font:500 12px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:3px;">${it.s}</div>
            <p style="font:400 13.5px/1.6 'Hanken Grotesk',sans-serif;color:#706f6f;margin:7px 0 0;text-wrap:pretty;">${it.d}</p>
          </div>
        </div>
      </div>`).join('')}
      <div style="padding:20px;background:#f4f0f0;margin-top:8px;">
        <p style="font:400 12.5px/1.65 'Hanken Grotesk',sans-serif;color:#908d8d;margin:0;text-wrap:pretty;">Für eine vertiefte Beschäftigung sind vor allem die Familien- und Firmenakten des Westfälischen Wirtschaftsarchivs heranzuziehen. Dort liegt auch eine von Oscar Funcke selbst verfasste Geschichte des Unternehmens.</p>
      </div>
      <div style="height:calc(32px + env(safe-area-inset-bottom,0px));"></div>
    </div>
  </div>`;
}

// ── EINFACHE TEXTSEITE (Impressum / Datenschutz) ─────────────
function buildLegalPage(title, sectionsHtml) {
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#faf7f7;animation:fadein .2s ease both;">
    <div style="background:#faf7f7;padding:env(safe-area-inset-top,0px) 18px 0;flex-shrink:0;border-bottom:1px solid #e9e4e4;">
      <div style="height:56px;display:flex;align-items:center;justify-content:space-between;">
        <button data-action="go-start" class="tap" style="width:42px;height:42px;border-radius:50%;background:#e9e4e4;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" aria-label="Zurück">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3C3C3B" stroke-width="2.5"><path d="M19 12H5M5 12l7 7M5 12l7-7"/></svg>
        </button>
        <span style="font:600 16px 'Hanken Grotesk',sans-serif;color:#3C3C3B;">${title}</span>
        <div style="width:42px;"></div>
      </div>
    </div>
    <div class="scroll" style="flex:1;">
      <div style="padding:22px 20px 40px;max-width:640px;">
        ${sectionsHtml}
      </div>
      <div style="height:calc(24px + env(safe-area-inset-bottom,0px));"></div>
    </div>
  </div>`;
}
function legalSection(heading, bodyHtml) {
  return `
  <div style="margin-bottom:26px;">
    <h2 style="font:600 18px/1.3 'Cormorant Garamond',serif;color:#3C3C3B;margin:0 0 8px;">${heading}</h2>
    <div style="font:400 14px/1.75 'Hanken Grotesk',sans-serif;color:#454444;">${bodyHtml}</div>
  </div>`;
}
function placeholder(text) {
  return `<span style="background:#fbf2e3;color:#c98a3e;padding:1px 6px;border-radius:5px;font-weight:600;">[${text}]</span>`;
}

function buildImpressum() {
  return buildLegalPage('Impressum', `
    ${legalSection('Angaben gemäß § 5 TMG', `
      ${placeholder('Name / Firma / Verein')}<br>
      ${placeholder('Straße und Hausnummer')}<br>
      ${placeholder('PLZ und Ort')}<br><br>
      Vertreten durch: ${placeholder('Name der verantwortlichen Person')}
    `)}
    ${legalSection('Kontakt', `
      Telefon: ${placeholder('Telefonnummer, optional')}<br>
      E-Mail: ${placeholder('kontakt@example.de')}
    `)}
    ${legalSection('Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV', `
      ${placeholder('Name, Anschrift wie oben')}
    `)}
    ${legalSection('Über dieses Angebot', `
      Dieser Audioguide informiert im Rahmen des Denkmalprojekts „Alte Schraubenfabrik Hagen" über die Geschichte des Standorts Funcke &amp; Hueck.
    `)}
    ${legalSection('Hinweis zur Erstellung mit Künstlicher Intelligenz', `
      Diese Website wurde mit technischer Unterstützung eines KI-Assistenzsystems (Claude von Anthropic) entwickelt. Die inhaltliche Verantwortung für die veröffentlichten Texte liegt beim Betreiber dieser Seite.<br><br>
      Die gesprochenen Audio-Inhalte der Stationen werden mit KI-basierter Sprachsynthese (ElevenLabs) erzeugt. Es handelt sich nicht um die Stimme einer realen Person.
    `)}
    ${legalSection('Streitschlichtung', `
      Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <span style="color:#706f6f;">ec.europa.eu/consumers/odr</span>. Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, sofern hier nichts anderes angegeben ist.
    `)}
  `);
}

function buildDatenschutz() {
  return buildLegalPage('Datenschutz', `
    ${legalSection('Verantwortlicher', `
      ${placeholder('Name / Firma / Verein')}, ${placeholder('Anschrift')}<br>
      E-Mail: ${placeholder('kontakt@example.de')}
    `)}
    ${legalSection('Hosting', `
      Diese Website wird als statische Seite gehostet (${placeholder('z.B. GitHub Pages / Strato')}). Beim Aufruf der Seite verarbeitet der Hosting-Anbieter automatisch technische Zugriffsdaten (z.B. IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Seite) in sogenannten Server-Logfiles. Diese Daten sind für den technischen Betrieb der Website erforderlich.
    `)}
    ${legalSection('Datenbank &amp; Backend (Supabase)', `
      Die Inhalte der Stationen (Texte, Bilder, Audiodateien) werden über den Dienst Supabase bereitgestellt. Beim Abruf der Stationsdaten wird eine Verbindung zu den Servern von Supabase aufgebaut. Es werden dabei keine personenbezogenen Besucherdaten gespeichert, die über technisch notwendige Verbindungsdaten hinausgehen.
    `)}
    ${legalSection('Keine Cookies, kein Tracking', `
      Diese Website setzt keine Analyse- oder Tracking-Cookies ein. Es findet keine Erstellung von Nutzungsprofilen statt.
    `)}
    ${legalSection('Kamerazugriff für den QR-Scanner', `
      Für die Funktion „QR-Code scannen" fragt Ihr Browser die Erlaubnis ab, auf die Kamera Ihres Geräts zuzugreifen. Das Kamerabild wird ausschließlich lokal auf Ihrem Gerät zur Erkennung des QR-Codes ausgewertet und nicht an einen Server übertragen oder gespeichert.
    `)}
    ${legalSection('KI-generierte Inhalte', `
      Die Sprachausgabe der Stationstexte wird entweder über die Vorlesefunktion Ihres Browsers oder über eine vorab mit KI-Sprachsynthese (ElevenLabs) erzeugte Audiodatei wiedergegeben. Bei der Erstellung der Website kam außerdem ein KI-Assistenzsystem (Claude von Anthropic) unterstützend zum Einsatz.
    `)}
    ${legalSection('Ihre Rechte', `
      Sie haben jederzeit das Recht auf Auskunft, Berichtigung, Löschung oder Einschränkung der Verarbeitung Ihrer personenbezogenen Daten sowie ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde. Wenden Sie sich hierzu an die oben genannte Kontaktadresse.
    `)}
  `);
}

function buildLightbox() {
  if (!state.lightbox) return '';
  const gal = GALLERY;
  if (!gal.length) return '';
  const gi = Math.max(0, Math.min(gal.length - 1, state.galIdx));
  const cur = gal[gi];
  return `
  <div id="lightbox" style="position:fixed;inset:0;z-index:200;background:#151514;display:flex;flex-direction:column;animation:fadein .18s ease both;">
    <div style="padding:env(safe-area-inset-top,0px) 16px 0;flex-shrink:0;">
      <div style="height:56px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font:500 13px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.6);">${gi + 1} / ${gal.length}</span>
        <button data-action="gal-close" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Schließen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div id="lb-stage" style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:pan-y;">
      <img src="${cur.src}" alt="${escHtml(cur.cap)}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;"/>
      <button data-action="gal-prev" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Vorheriges Bild">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button data-action="gal-next" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Nächstes Bild">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div style="flex-shrink:0;padding:16px 20px calc(20px + env(safe-area-inset-bottom,0px));">
      <p style="font:400 14px/1.6 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.82);margin:0 0 14px;text-wrap:pretty;">${escHtml(cur.cap)}</p>
      <div class="hscroll" style="gap:8px;">
        ${gal.map((g, i) => `<div data-action="gal-sel" data-gal="${i}" style="flex:none;width:64px;height:48px;border-radius:8px;overflow:hidden;cursor:pointer;background:#000;opacity:${gi === i ? 1 : .45};outline:${gi === i ? '2px solid #C9A87C' : '2px solid transparent'};outline-offset:-2px;transition:opacity .15s;"><img src="${g.src}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>`).join('')}
      </div>
    </div>
  </div>`;
}

function buildStart() {
  const hero = GALLERY[0]?.src || STATIONS[0]?.image_url || '';
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;animation:fadein .28s ease both;">
    <div style="position:relative;flex-shrink:0;height:48vh;min-height:260px;overflow:hidden;background:#3C3C3B;">
      <img src="${hero}" alt="Die alte Schraubenfabrik Hagen, restaurierte Backsteinfassade" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.10) 0%,rgba(0,0,0,.22) 45%,rgba(20,20,19,.90) 100%);"></div>
      <div style="position:absolute;top:env(safe-area-inset-top,16px);right:16px;margin-top:8px;background:rgba(201,168,124,.9);backdrop-filter:blur(8px);padding:6px 14px;border-radius:20px;">
        <span style="font:600 11px 'Hanken Grotesk',sans-serif;color:#fff;letter-spacing:.6px;">${STATIONS.length} STATIONEN</span>
      </div>
      <div style="position:absolute;bottom:20px;left:20px;right:20px;">
        <div style="font:700 36px/1.06 'Cormorant Garamond',serif;color:#fff;letter-spacing:-.3px;text-shadow:0 2px 14px rgba(0,0,0,.3);">Alte Schrauben&shy;fabrik<br>Hagen</div>
        <div data-action="admin-tap" style="font:400 13px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.65);margin-top:6px;letter-spacing:.4px;">Funcke &amp; Hueck</div>
      </div>
    </div>
    <div class="scroll" style="flex:1;background:#faf7f7;">
      <div style="padding:22px 20px 10px;">
        <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#C9A87C;letter-spacing:.14em;text-transform:uppercase;margin-bottom:7px;">Willkommen</div>
        <h1 style="font:600 29px/1.16 'Cormorant Garamond',serif;color:#3C3C3B;margin:0 0 12px;letter-spacing:-.2px;">${STATIONS.length} Stationen,<br>180 Jahre.</h1>
        <p style="font:400 15.5px/1.7 'Hanken Grotesk',sans-serif;color:#706f6f;margin:0 0 22px;text-wrap:pretty;">Von der ersten Dampfmaschine Hagens 1844 über 1.500 Beschäftigte im Jahr 1913 bis zur denkmalgerechten Sanierung heute. Jede Station: ein kurzer Text und ein Audioguide von etwa drei Minuten.</p>
        <div style="display:flex;flex-direction:column;gap:11px;margin-bottom:28px;">
          <button data-action="go-scanner" class="tap" style="background:#3C3C3B;color:#faf7f7;border:none;border-radius:999px;padding:18px 26px;font:600 15px 'Hanken Grotesk',sans-serif;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;width:100%;letter-spacing:.1px;min-height:56px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/><line x1="14" y1="14" x2="21" y2="14"/><line x1="14" y1="17" x2="17" y2="17"/><line x1="20" y1="17" x2="21" y2="17"/><line x1="14" y1="20" x2="17" y2="20"/><line x1="20" y1="20" x2="21" y2="20"/></svg>
            QR-Code scannen
          </button>
          <button data-action="go-list" class="tap" style="background:transparent;color:#3C3C3B;border:1.5px solid #d8d2d2;border-radius:999px;padding:17px 26px;font:500 15px 'Hanken Grotesk',sans-serif;cursor:pointer;width:100%;min-height:56px;">Alle Stationen ansehen</button>
        </div>
        <a href="https://www.alte-schraubenfabrik.de" target="_blank" rel="noopener noreferrer" class="tap" style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,#C9A87C,#b8925f);border-radius:16px;padding:16px 18px;margin-bottom:24px;text-decoration:none;box-shadow:0 6px 20px rgba(201,168,124,.35);">
          <div>
            <div style="font:700 10px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.85);letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px;">Das Projekt</div>
            <div style="font:600 15px 'Hanken Grotesk',sans-serif;color:#fff;">Mehr auf alte-schraubenfabrik.de</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" style="flex-shrink:0;"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>
        </a>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <span style="font:600 10px 'Hanken Grotesk',sans-serif;color:#908d8d;letter-spacing:.14em;text-transform:uppercase;">Stationen</span>
          <span data-action="go-list" style="font:500 13px 'Hanken Grotesk',sans-serif;color:#C9A87C;cursor:pointer;">Alle →</span>
        </div>
      </div>
      <div class="hscroll" style="gap:12px;padding:0 20px 28px;">
        ${STATIONS.slice(0, 5).map((st) => `
        <div data-action="go-station" data-idx="${STATIONS.indexOf(st)}" class="tap" style="flex:none;width:min(48vw,160px);background:#fff;border-radius:16px;overflow:hidden;cursor:pointer;box-shadow:0 2px 14px rgba(60,60,59,.08);">
          <div style="height:100px;position:relative;overflow:hidden;background:#3C3C3B;">
            <img src="${st.image_url || ''}" alt="${escHtml(st.title)}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.35),transparent 60%);"></div>
            <div style="position:absolute;top:9px;left:9px;background:rgba(60,60,59,.82);backdrop-filter:blur(4px);border-radius:6px;padding:3px 8px;font:700 9px 'Hanken Grotesk',sans-serif;color:#fff;letter-spacing:.06em;">${st.id}</div>
          </div>
          <div style="padding:10px 12px 13px;">
            <div style="font:600 12px/1.3 'Hanken Grotesk',sans-serif;color:#3C3C3B;">${escHtml(st.title)}</div>
            <div style="font:400 11px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:4px;">${fmt(st.dur)} · ${escHtml(st.era)}</div>
          </div>
        </div>`).join('')}
      </div>
      <div style="padding:4px 20px 20px;display:flex;justify-content:center;">
        <button data-action="go-sources" class="tap" style="background:transparent;border:1.5px solid #d8d2d2;border-radius:999px;padding:11px 22px;font:500 13px 'Hanken Grotesk',sans-serif;color:#3C3C3B;cursor:pointer;display:flex;align-items:center;gap:8px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#908d8d" stroke-width="1.9"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          Quellen &amp; Recherche
        </button>
      </div>
      <div style="padding:0 20px 32px;display:flex;justify-content:center;gap:18px;">
        <span data-action="go-impressum" style="font:400 11.5px 'Hanken Grotesk',sans-serif;color:#b3aeae;cursor:pointer;text-decoration:underline;text-underline-offset:3px;">Impressum</span>
        <span data-action="go-datenschutz" style="font:400 11.5px 'Hanken Grotesk',sans-serif;color:#b3aeae;cursor:pointer;text-decoration:underline;text-underline-offset:3px;">Datenschutz</span>
      </div>
    </div>
  </div>`;
}

function buildList() {
  const filtered = STATIONS.filter(st => st.status === 'pub' || session);
  const q = state.searchQ.toLowerCase();
  const shown = filtered.filter(st => !q || st.title.toLowerCase().includes(q));
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;animation:fadein .2s ease both;">
    <div style="background:#faf7f7;padding:env(safe-area-inset-top,0px) 18px 0;flex-shrink:0;">
      <div style="height:56px;display:flex;align-items:center;justify-content:space-between;">
        <button data-action="go-start" class="tap" style="width:42px;height:42px;border-radius:50%;background:#e9e4e4;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3C3C3B" stroke-width="2.5"><path d="M19 12H5M5 12l7 7M5 12l7-7"/></svg>
        </button>
        <span style="font:600 16px 'Hanken Grotesk',sans-serif;color:#3C3C3B;">Alle Stationen</span>
        <div style="width:42px;"></div>
      </div>
      <div style="position:relative;margin-bottom:12px;">
        <svg style="position:absolute;left:13px;top:50%;transform:translateY(-50%);" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#908d8d" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input placeholder="Stationen suchen…" value="${escHtml(state.searchQ)}" data-field="searchQ" style="width:100%;border:1.5px solid #d8d2d2;border-radius:12px;padding:12px 14px 12px 38px;font:400 14px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;outline:none;"/>
      </div>
    </div>
    <div class="scroll" style="flex:1;background:#faf7f7;">
      ${shown.map((st) => `
      <div data-action="go-station" data-idx="${STATIONS.indexOf(st)}" class="tap" style="display:flex;align-items:center;gap:14px;padding:13px 18px;cursor:pointer;border-bottom:1px solid rgba(60,60,59,.06);background:#faf7f7;">
        <div style="width:58px;height:58px;border-radius:14px;flex-shrink:0;position:relative;overflow:hidden;background:#3C3C3B;">
          <img src="${st.image_url || ''}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
          <span style="position:absolute;bottom:4px;left:6px;font:700 9px 'Hanken Grotesk',sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7);">${st.id}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font:500 14px 'Hanken Grotesk',sans-serif;color:#3C3C3B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(st.title)}</div>
          <div style="font:400 12px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:3px;">${escHtml(st.sub)} · ${fmt(st.dur)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="font:500 10px 'Hanken Grotesk',sans-serif;background:${st.status === 'pub' ? '#e9f4ef' : '#fbf2e3'};color:${st.status === 'pub' ? '#4c9a78' : '#c98a3e'};padding:3px 10px;border-radius:20px;">${st.status === 'pub' ? 'Live' : 'Entwurf'}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b3aeae" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>`).join('') || `<div style="padding:40px 20px;text-align:center;font:400 14px 'Hanken Grotesk',sans-serif;color:#908d8d;">Keine Stationen gefunden.</div>`}
      <div style="height:env(safe-area-inset-bottom,24px);min-height:24px;"></div>
    </div>
  </div>`;
}

function buildScanner() {
  const isDone = state.scanState === 'done';
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#0A0A0A;animation:fadein .18s ease both;">
    <div style="padding:env(safe-area-inset-top,0px) 18px 0;flex-shrink:0;">
      <div style="height:56px;display:flex;align-items:center;justify-content:space-between;">
        <button data-action="go-start" class="tap" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);cursor:pointer;display:flex;align-items:center;justify-content:center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M19 12H5M5 12l7 7M5 12l7-7"/></svg>
        </button>
        <span style="font:600 15px 'Hanken Grotesk',sans-serif;color:#fff;">QR-Code scannen</span>
        <div style="width:42px;"></div>
      </div>
    </div>
    <div style="flex:1;position:relative;overflow:hidden;background:#000;">
      ${state.scanState === 'live' || state.scanState === 'done' ? `<video id="scan-video" autoplay muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>` : ''}
      <div style="position:absolute;inset:0;background:rgba(0,0,0,.38);z-index:1;"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);width:min(68vw,260px);height:min(68vw,260px);z-index:3;">
        <div style="position:absolute;top:0;left:0;width:38px;height:38px;border-top:3px solid #C9A87C;border-left:3px solid #C9A87C;border-radius:3px 0 0 0;"></div>
        <div style="position:absolute;top:0;right:0;width:38px;height:38px;border-top:3px solid #C9A87C;border-right:3px solid #C9A87C;border-radius:0 3px 0 0;"></div>
        <div style="position:absolute;bottom:0;left:0;width:38px;height:38px;border-bottom:3px solid #C9A87C;border-left:3px solid #C9A87C;border-radius:0 0 0 3px;"></div>
        <div style="position:absolute;bottom:0;right:0;width:38px;height:38px;border-bottom:3px solid #C9A87C;border-right:3px solid #C9A87C;border-radius:0 0 3px 0;"></div>
        ${state.scanState === 'live' ? `<div style="position:absolute;left:4px;right:4px;height:2px;background:linear-gradient(90deg,transparent,#C9A87C 25%,#E5C9A0 50%,#C9A87C 75%,transparent);animation:scan-ln 1.8s ease-in-out infinite;box-shadow:0 0 14px rgba(201,168,124,.7);"></div>` : ''}
      </div>
      ${isDone ? `
      <div style="position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:rgba(0,0,0,.6);animation:popin .3s ease both;">
        <div style="position:relative;width:88px;height:88px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#C9A87C;animation:ping .9s ease infinite;"></div>
          <div style="position:absolute;inset:0;border-radius:50%;background:#C9A87C;display:flex;align-items:center;justify-content:center;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
        <div style="text-align:center;"><div style="font:700 24px 'Cormorant Garamond',serif;color:#fff;">QR-Code erkannt!</div></div>
      </div>` : ''}
      ${state.scanState === 'denied' ? `
      <div style="position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 30px;text-align:center;">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        <p style="font:400 14px/1.6 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.75);margin:0;">${escHtml(state.scanError || 'Kamera nicht verfügbar.')}</p>
      </div>` : ''}
      <div style="position:absolute;bottom:0;left:0;right:0;padding:20px 22px calc(22px + env(safe-area-inset-bottom,0px));z-index:5;">
        <p style="font:400 14px/1.55 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.55);text-align:center;margin:0 0 18px;">${state.scanState === 'denied' ? 'Kamera nicht erreichbar — QR-Code-Link stattdessen manuell eingeben.' : 'Halten Sie die Kamera auf den QR-Code an der Station'}</p>
        ${state.scanState === 'denied' ? `<button data-action="retry-camera" class="tap" style="background:#C9A87C;border:none;border-radius:999px;padding:17px 26px;font:600 15px 'Hanken Grotesk',sans-serif;color:#fff;cursor:pointer;width:100%;margin-bottom:11px;min-height:56px;">Erneut versuchen</button>` : ''}
        <button data-action="manual-scan" class="tap" style="background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.14);border-radius:999px;padding:15px 26px;font:500 14px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.85);cursor:pointer;width:100%;min-height:52px;">Stattdessen URL eingeben</button>
      </div>
    </div>
  </div>`;
}

function buildStation() {
  const st = STATIONS[state.stIdx];
  if (!st) return buildLoading();
  const next = STATIONS[(state.stIdx + 1) % STATIONS.length];
  const prog = st.dur > 0 ? state.elapsed / st.dur : 0;
  const waveHTML = makeWaveform(prog);
  const gal = GALLERY;
  const gi = gal.length ? Math.max(0, Math.min(gal.length - 1, state.galIdx)) : 0;
  const cur = gal[gi];
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#ffffff;animation:fadein .22s ease both;">
    <div style="position:relative;flex-shrink:0;height:44vh;min-height:240px;max-height:340px;overflow:hidden;">
      <img src="${st.image_url || ''}" alt="${escHtml(st.title)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.08) 0%,rgba(0,0,0,.18) 40%,rgba(20,20,19,.90) 100%);"></div>
      <div style="position:absolute;top:env(safe-area-inset-top,0px);left:0;right:0;padding:8px 18px 0;display:flex;align-items:center;justify-content:space-between;z-index:5;">
        <button data-action="go-list" class="tap" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.13);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M19 12H5M5 12l7 7M5 12l7-7"/></svg>
        </button>
        <div style="background:rgba(255,255,255,.13);backdrop-filter:blur(8px);padding:6px 16px;border-radius:22px;border:1px solid rgba(255,255,255,.14);">
          <span style="font:500 12px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.9);">Station ${state.stIdx + 1} von ${STATIONS.length}</span>
        </div>
        <div style="width:42px;"></div>
      </div>
      <div style="position:absolute;bottom:18px;left:20px;right:20px;z-index:5;">
        <div style="font:400 11px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.58);letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px;">${escHtml(st.sub)}</div>
        <div style="font:700 30px/1.06 'Cormorant Garamond',serif;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.25);">${escHtml(st.title)}</div>
      </div>
    </div>
    <div class="scroll" style="flex:1;background:#ffffff;">
      <div style="margin:16px 16px 0;background:linear-gradient(148deg,#3C3C3B,#4a4a48);border-radius:20px;padding:18px 20px;box-shadow:0 6px 32px rgba(60,60,59,.3);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div style="font:400 9px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.36);letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px;">Audioguide · ${fmt(st.dur)}</div>
            <div style="font:500 13px/1.3 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.88);">${escHtml(st.audio_title)}</div>
          </div>
          <div style="width:8px;height:8px;border-radius:50%;background:#C9A87C;margin-top:3px;flex-shrink:0;box-shadow:0 0 7px rgba(201,168,124,.7);"></div>
        </div>
        <div style="display:flex;gap:2px;align-items:center;height:28px;margin-bottom:12px;">${waveHTML}</div>
        <div data-action="seek" style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-bottom:10px;position:relative;cursor:pointer;">
          <div id="pl-bar" style="width:${(prog * 100).toFixed(1)}%;height:100%;background:#C9A87C;border-radius:2px;"></div>
          <div id="pl-thumb" style="position:absolute;top:50%;left:${(prog * 100).toFixed(1)}%;transform:translate(-50%,-50%);width:13px;height:13px;background:#C9A87C;border-radius:50%;box-shadow:0 0 7px rgba(201,168,124,.65);"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span id="pl-elapsed" style="font:400 11px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.36);">${fmt(state.elapsed)}</span>
          <div style="display:flex;align-items:center;gap:22px;">
            <button data-action="skip-back" class="tap" style="background:none;border:none;cursor:pointer;padding:8px;opacity:.6;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/></svg>
            </button>
            <button data-action="toggle-play" class="tap" style="width:58px;height:58px;border-radius:50%;background:#C9A87C;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(201,168,124,.55);">
              ${state.playing ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>` : `<svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>`}
            </button>
            <button data-action="skip-fwd" class="tap" style="background:none;border:none;cursor:pointer;padding:8px;opacity:.6;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 5V1l5 5-5 5V7c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6h2c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8z"/></svg>
            </button>
          </div>
          <span style="font:400 11px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.36);">${fmt(st.dur)}</span>
        </div>
      </div>
      <div style="padding:18px 20px 0;">
        ${(st.description || '').split('\n\n').map(p => `<p style="font:400 16.5px/1.78 'Hanken Grotesk',sans-serif;color:#454444;margin:0 0 15px;text-wrap:pretty;">${escHtml(p)}</p>`).join('')}
      </div>
      ${cur ? `
      <div style="padding:6px 0 0;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;padding:0 20px 10px;">
          <span style="font:600 10px 'Hanken Grotesk',sans-serif;color:#908d8d;letter-spacing:.14em;text-transform:uppercase;">Das Gebäude heute</span>
          <span style="font:500 11px 'Hanken Grotesk',sans-serif;color:#908d8d;">${gi + 1} / ${gal.length}</span>
        </div>
        <div style="position:relative;margin:0 auto;max-width:340px;border-radius:11px;overflow:hidden;background:#3C3C3B;aspect-ratio:3/2;">
          <img src="${cur.src}" alt="${escHtml(cur.cap)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
          <button data-action="gal-open" style="position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.2);cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Bild groß anzeigen">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
          <button data-action="gal-prev" style="position:absolute;left:7px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.42);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Vorheriges Bild">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.6"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button data-action="gal-next" style="position:absolute;right:7px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.42);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Nächstes Bild">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div style="display:flex;gap:6px;justify-content:center;padding:12px 0 0;">
          ${gal.map((g, i) => `<button data-action="gal-sel" data-gal="${i}" aria-label="Bild ${i + 1}" style="width:${gi === i ? '22px' : '8px'};height:8px;border-radius:999px;border:none;padding:0;cursor:pointer;background:${gi === i ? '#C9A87C' : '#d8d2d2'};transition:width .2s,background .2s;"></button>`).join('')}
        </div>
        <div style="padding:12px 20px 4px;">
          <p style="font:400 13px/1.6 'Hanken Grotesk',sans-serif;color:#706f6f;margin:0;text-wrap:pretty;">${escHtml(cur.cap)}</p>
        </div>
      </div>` : ''}
      <div style="padding:14px 20px 0;">
        <div style="padding:0 20px 4px;">
          <button data-action="go-sources" class="tap" style="background:transparent;border:none;padding:0;font:500 12.5px 'Hanken Grotesk',sans-serif;color:#908d8d;cursor:pointer;display:flex;align-items:center;gap:6px;text-decoration:underline;text-underline-offset:3px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
            Quellen zu diesem Text
          </button>
        </div>
        <div style="margin:4px 16px 24px;padding:15px 16px;background:#f4f0f0;border-radius:16px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#908d8d;letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px;">Nächste Station</div>
            <div style="font:600 17px/1.2 'Cormorant Garamond',serif;color:#3C3C3B;">${escHtml(next.title)}</div>
            <div style="font:400 12px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:2px;">Station ${(state.stIdx + 2) > STATIONS.length ? 1 : (state.stIdx + 2)} · ${escHtml(next.era)}</div>
          </div>
          <button data-action="go-next" class="tap" style="width:48px;height:48px;border-radius:50%;background:#3C3C3B;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
      <div style="height:env(safe-area-inset-bottom,24px);min-height:24px;"></div>
    </div>
  </div>`;
}

// ════ ADMIN LOGIN ════
function buildAdminLogin() {
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#faf7f7;">
    <div class="scroll" style="flex:1;">
      <div style="max-width:420px;margin:0 auto;padding:env(safe-area-inset-top,0px) 24px 40px;">
        <div style="padding-top:48px;text-align:center;margin-bottom:40px;">
          <div style="width:70px;height:70px;border-radius:20px;background:#3C3C3B;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#C9A87C" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <div style="font:700 30px/1.15 'Cormorant Garamond',serif;color:#3C3C3B;margin-bottom:7px;">Admin-Bereich</div>
          <div style="font:400 14px 'Hanken Grotesk',sans-serif;color:#908d8d;">Funcke &amp; Hueck · Alte Schraubenfabrik Hagen</div>
        </div>
        <div style="background:#fff;border-radius:22px;padding:30px 24px;box-shadow:0 4px 24px rgba(60,60,59,.1);border:1px solid #e9e4e4;">
          <div style="margin-bottom:18px;">
            <label style="font:500 12px 'Hanken Grotesk',sans-serif;color:#706f6f;display:block;margin-bottom:7px;">E-Mail</label>
            <input value="${escHtml(state.loginEmail)}" data-field="loginEmail" type="email" autocomplete="username" placeholder="admin@ihre-domain.de" style="width:100%;border:1.5px solid #d8d2d2;border-radius:12px;padding:14px 15px;font:400 15px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#ffffff;outline:none;"/>
          </div>
          <div style="margin-bottom:10px;">
            <label style="font:500 12px 'Hanken Grotesk',sans-serif;color:#706f6f;display:block;margin-bottom:7px;">Passwort</label>
            <div style="position:relative;">
              <input id="pw-input" value="${escHtml(state.loginPw)}" data-field="loginPw" type="${state.pwVisible ? 'text' : 'password'}" placeholder="••••••••" style="width:100%;border:${state.loginErr ? '1.5px solid #c1453f' : '1.5px solid #d8d2d2'};border-radius:12px;padding:14px 48px 14px 15px;font:400 15px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#ffffff;outline:none;" autocomplete="current-password"/>
              <button data-action="toggle-pw" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:6px;opacity:.5;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#706f6f" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
            ${state.loginErr ? `<div id="login-err-msg" style="font:400 13px 'Hanken Grotesk',sans-serif;color:#c1453f;margin-top:7px;display:flex;align-items:center;gap:5px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c1453f" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${escHtml(state.loginErr)}</div>` : ''}
          </div>
          <button data-action="do-login" id="login-btn" class="tap" style="background:${state.loginLoading ? '#908d8d' : '#3C3C3B'};border:none;border-radius:999px;padding:16px 26px;font:600 15px 'Hanken Grotesk',sans-serif;color:#faf7f7;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:9px;min-height:56px;">
            ${state.loginLoading ? `<span style="width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;display:inline-block;animation:spin .7s linear infinite;"></span> Anmelden…` : 'Anmelden →'}
          </button>
        </div>
        <div style="text-align:center;margin-top:20px;">
          <span data-action="go-start" style="font:400 13px 'Hanken Grotesk',sans-serif;color:rgba(60,60,59,.3);cursor:pointer;text-decoration:underline;">← Zur Besucher-App</span>
        </div>
      </div>
    </div>
  </div>`;
}

// ════ ADMIN SHELL ════
function buildAdmin() {
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#ffffff;">
    <div class="admin-sidebar" style="background:#332f2f;padding:env(safe-area-inset-top,0px) 0 0;flex-shrink:0;">
      <div class="admin-topbar-row" style="display:flex;align-items:center;justify-content:space-between;padding:0 18px;height:52px;">
        <div style="font:700 13px 'Cormorant Garamond',serif;color:#faf7f7;letter-spacing:-.1px;">Schraubenfabrik Hagen <span style="font:400 10px 'Hanken Grotesk',sans-serif;color:rgba(250,247,247,.35);">Admin</span></div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button data-action="go-start" class="tap" style="background:rgba(255,255,255,.07);border:none;border-radius:7px;padding:5px 10px;font:400 11px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.4);cursor:pointer;">← App</button>
          <button data-action="do-logout" class="tap" style="background:rgba(255,255,255,.07);border:none;border-radius:7px;padding:5px 10px;font:400 11px 'Hanken Grotesk',sans-serif;color:rgba(255,255,255,.4);cursor:pointer;">Abmelden</button>
        </div>
      </div>
      <div class="admin-nav-tabs" style="display:flex;border-top:1px solid rgba(255,255,255,.07);">
        ${[['dash', 'Dashboard'], ['edit', 'Bearbeiten'], ['qr', 'QR-Codes']].map(([k, l]) => `
        <button data-action="admin-nav" data-nav="${k}" data-current="${state.aScreen === k}" style="flex:1;background:none;border:none;border-bottom:2.5px solid ${state.aScreen === k ? '#C9A87C' : 'transparent'};padding:12px 4px;font:${state.aScreen === k ? '600' : '400'} 12px 'Hanken Grotesk',sans-serif;color:${state.aScreen === k ? '#C9A87C' : 'rgba(250,247,247,.45)'};cursor:pointer;transition:color .12s;">${l}</button>`).join('')}
      </div>
    </div>
    <div class="admin-main" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
      ${state.aScreen === 'dash' ? buildAdminDash() : state.aScreen === 'edit' ? buildAdminEdit() : buildAdminQr()}
    </div>
  </div>
  ${buildToast()}`;
}

function buildAdminDash() {
  const statTotal = STATIONS.length;
  const statPub = STATIONS.filter(s => s.status === 'pub').length;
  const nDraft = statTotal - statPub;
  const statDraftLabel = nDraft === 1 ? '1 Entwurf' : nDraft + ' Entwürfe';
  const statScans = STATIONS.reduce((a, s) => a + (s.scans || 0), 0).toLocaleString('de-DE');
  const avgSec = statTotal ? Math.round(STATIONS.reduce((a, s) => a + s.dur, 0) / statTotal) : 0;
  const statAvg = fmt(avgSec);
  const filtered = STATIONS.filter(st => {
    const q = state.searchQ.toLowerCase();
    const mQ = !q || st.title.toLowerCase().includes(q);
    const mF = state.filterStatus === 'all' || st.status === state.filterStatus;
    return mQ && mF;
  });
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;animation:fadein .18s ease both;">
    <div style="padding:16px 18px 12px;border-bottom:1px solid #e9e4e4;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#ffffff;">
      <div style="font:700 20px 'Cormorant Garamond',serif;color:#3C3C3B;">Dashboard</div>
      <button data-action="new-station" class="tap" style="background:#3C3C3B;border:none;border-radius:9px;padding:9px 16px;font:600 12px 'Hanken Grotesk',sans-serif;color:#faf7f7;cursor:pointer;display:flex;align-items:center;gap:5px;min-height:40px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Neue Station
      </button>
    </div>
    <div class="scroll" style="flex:1;">
      <div class="admin-stat-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 16px 8px;">
        <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid #e9e4e4;">
          <div style="font:400 9px 'Hanken Grotesk',sans-serif;color:#908d8d;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;">Stationen</div>
          <div style="font:700 28px/1 'Cormorant Garamond',serif;color:#3C3C3B;">${statTotal}</div>
          <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:3px;">gesamt</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid #e9e4e4;">
          <div style="font:400 9px 'Hanken Grotesk',sans-serif;color:#908d8d;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;">Veröffentlicht</div>
          <div style="font:700 28px/1 'Cormorant Garamond',serif;color:#4c9a78;">${statPub}</div>
          <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:3px;">${statDraftLabel}</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid #e9e4e4;">
          <div style="font:400 9px 'Hanken Grotesk',sans-serif;color:#908d8d;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;">Scans gesamt</div>
          <div style="font:700 28px/1 'Cormorant Garamond',serif;color:#3C3C3B;">${statScans}</div>
          <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:3px;">seit Start</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid #e9e4e4;">
          <div style="font:400 9px 'Hanken Grotesk',sans-serif;color:#908d8d;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;">⌀ Audiodauer</div>
          <div style="font:700 28px/1 'Cormorant Garamond',serif;color:#3C3C3B;">${statAvg}</div>
          <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:3px;">pro Station</div>
        </div>
      </div>
      <div style="padding:8px 16px 10px;display:flex;gap:8px;">
        <div style="position:relative;flex:1;">
          <svg style="position:absolute;left:11px;top:50%;transform:translateY(-50%);" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#908d8d" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Suche…" value="${escHtml(state.searchQ)}" data-field="searchQ" style="width:100%;border:1.5px solid #e9e4e4;border-radius:9px;padding:9px 12px 9px 30px;font:400 13px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;outline:none;"/>
        </div>
        <select data-field="filterStatus" style="border:1.5px solid #e9e4e4;border-radius:9px;padding:9px 10px;font:400 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;outline:none;cursor:pointer;flex-shrink:0;">
          <option value="all" ${state.filterStatus === 'all' ? 'selected' : ''}>Alle</option>
          <option value="pub" ${state.filterStatus === 'pub' ? 'selected' : ''}>Live</option>
          <option value="draft" ${state.filterStatus === 'draft' ? 'selected' : ''}>Entwurf</option>
        </select>
      </div>
      ${filtered.map((st) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f4f0f0;background:#fff;">
        <div style="width:46px;height:46px;border-radius:11px;flex-shrink:0;position:relative;overflow:hidden;background:#3C3C3B;">
          <img src="${st.image_url || ''}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
          <span style="position:absolute;bottom:3px;left:5px;font:700 8px 'Hanken Grotesk',sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);">${st.id}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font:500 13px 'Hanken Grotesk',sans-serif;color:#3C3C3B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(st.title)}</div>
          <div style="font:400 11px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:2px;display:flex;align-items:center;gap:7px;">
            ${escHtml(st.era)}
            <span style="background:${st.status === 'pub' ? '#e9f4ef' : '#fbf2e3'};color:${st.status === 'pub' ? '#4c9a78' : '#c98a3e'};padding:1px 8px;border-radius:20px;font:600 9px 'Hanken Grotesk',sans-serif;">${st.status === 'pub' ? 'Live' : 'Entwurf'}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button data-action="edit-station" data-idx="${STATIONS.indexOf(st)}" class="tap" style="width:34px;height:34px;border-radius:9px;background:#faf7f7;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#706f6f" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button data-action="go-qr" data-id="${st.id}" class="tap" style="width:34px;height:34px;border-radius:9px;background:#faf7f7;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#706f6f" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="5" y="5" width="3" height="3" fill="#706f6f" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="#706f6f" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="#706f6f" stroke="none"/></svg>
          </button>
        </div>
      </div>`).join('')}
      <div style="height:env(safe-area-inset-bottom,24px);min-height:24px;"></div>
    </div>
  </div>`;
}

function buildAdminEdit() {
  const st = state.editIdx >= 0 ? STATIONS[state.editIdx] : null;
  const title = state.editTitle;
  const sub = state.editSub;
  const era = state.editEra;
  const desc = state.editDesc;
  const status = state.editStatus;
  const imagePreview = state.editImageUrl || st?.image_url || '';
  const qr = encodeQR(st ? stationUrl(st) : `${SITE_URL}/#/s/${slugify(title || 'neue-station')}`, 'M');
  const qrHtml = qrToSVG(qr, { moduleSize: 4 });

  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;animation:fadein .18s ease both;">
    <div style="padding:14px 18px 12px;border-bottom:1px solid #e9e4e4;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#ffffff;">
      <button data-action="admin-nav" data-nav="dash" class="tap" style="background:transparent;border:1.5px solid #d8d2d2;border-radius:9px;padding:8px 13px;font:500 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;cursor:pointer;min-height:40px;">← Zurück</button>
      <div style="display:flex;gap:7px;">
        <button data-action="save-draft" class="tap" ${state.saving ? 'disabled' : ''} style="background:#3C3C3B;border:none;border-radius:9px;padding:8px 14px;font:600 12px 'Hanken Grotesk',sans-serif;color:#faf7f7;cursor:pointer;min-height:40px;opacity:${state.saving ? .6 : 1};">${state.saving ? 'Speichert…' : 'Speichern'}</button>
        <button data-action="save-pub" class="tap" ${state.saving ? 'disabled' : ''} style="background:#4c9a78;border:none;border-radius:9px;padding:8px 14px;font:600 12px 'Hanken Grotesk',sans-serif;color:#fff;cursor:pointer;min-height:40px;opacity:${state.saving ? .6 : 1};">Veröffentlichen</button>
      </div>
    </div>
    <div class="scroll" style="flex:1;padding:18px 18px 0;">
      <div style="font:700 18px 'Cormorant Garamond',serif;color:#3C3C3B;margin-bottom:18px;">${st ? 'Station bearbeiten' : 'Neue Station'}</div>
      <div class="admin-edit-layout" style="display:block;">
      <div class="admin-edit-main" style="min-width:0;">
      <div style="margin-bottom:15px;">
        <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:7px;">Titel</label>
        <input value="${escHtml(title)}" data-field="editTitle" placeholder="z.B. Großer Rittersaal" style="width:100%;border:1.5px solid #e9e4e4;border-radius:11px;padding:13px 14px;font:500 16px 'Cormorant Garamond',serif;color:#3C3C3B;background:#fff;outline:none;"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;">
        <div>
          <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:7px;">Lage</label>
          <input value="${escHtml(sub)}" data-field="editSub" placeholder="Erdgeschoss…" style="width:100%;border:1.5px solid #e9e4e4;border-radius:11px;padding:12px 13px;font:400 13px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;outline:none;"/>
        </div>
        <div>
          <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:7px;">Epoche</label>
          <input value="${escHtml(era)}" data-field="editEra" placeholder="15. Jahrhundert" style="width:100%;border:1.5px solid #e9e4e4;border-radius:11px;padding:12px 13px;font:400 13px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;outline:none;"/>
        </div>
      </div>
      <div style="margin-bottom:15px;">
        <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:7px;">Beschreibungstext</label>
        <textarea data-field="editDesc" rows="6" placeholder="Beschreibung… (Absätze mit einer Leerzeile trennen)" style="width:100%;border:1.5px solid #e9e4e4;border-radius:11px;padding:12px 14px;font:400 13px/1.65 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;outline:none;resize:vertical;">${escHtml(desc)}</textarea>
      </div>
      <div style="margin-bottom:15px;">
        <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:8px;">Bild</label>
        <div style="background:#fff;border:1.5px solid #e9e4e4;border-radius:11px;padding:12px;display:flex;align-items:center;gap:12px;">
          <div style="width:72px;height:56px;border-radius:8px;overflow:hidden;background:#3C3C3B;flex-shrink:0;">
            ${imagePreview ? `<img src="${imagePreview}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"/>` : ''}
          </div>
          <div style="flex:1;min-width:0;font:400 12px 'Hanken Grotesk',sans-serif;color:#908d8d;">${imagePreview ? 'Bild ausgewählt' : 'Noch kein Bild'}</div>
          <label class="tap" style="background:#faf7f7;border:none;border-radius:7px;padding:8px 13px;font:500 11px 'Hanken Grotesk',sans-serif;color:#706f6f;cursor:pointer;flex-shrink:0;">
            ${imagePreview ? 'Ersetzen' : 'Hochladen'}
            <input type="file" accept="image/*" data-action="upload-image" style="display:none;">
          </label>
        </div>
      </div>
      <div style="margin-bottom:15px;">
        <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:8px;">Audiodatei (Sprecher-Aufnahme)</label>
        <div style="background:#fff;border:1.5px solid #e9e4e4;border-radius:11px;padding:13px 14px;display:flex;align-items:center;gap:10px;">
          <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#C9A87C,#8AA179);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font:500 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(state.editAudioName || (st?.audio_url ? 'Audiodatei vorhanden' : 'Keine Audiodatei — Vorlesefunktion wird genutzt'))}</div>
            <div style="font:400 10px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:2px;">${fmt(state.editDur || st?.dur || 0)} · ${state.editAudioType || (st?.audio_url ? 'AUDIO' : '—')}</div>
          </div>
          <label class="tap" style="background:#faf7f7;border:none;border-radius:7px;padding:6px 11px;font:500 10px 'Hanken Grotesk',sans-serif;color:#706f6f;cursor:pointer;">
            Ersetzen
            <input type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a,.mp3,.wav,.m4a" data-action="upload-audio" style="display:none;">
          </label>
        </div>
        ${state.editAudioUrl ? `<audio controls src="${state.editAudioUrl}" style="width:100%;margin-top:8px;height:32px;"></audio>` : ''}
      </div>
      <div style="margin-bottom:15px;">
        <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:8px;">Status</label>
        <div style="display:flex;gap:8px;">
          <button data-action="set-status" data-status="draft" style="flex:1;background:${status === 'draft' ? '#fbf2e3' : '#faf7f7'};border:1.5px solid ${status === 'draft' ? '#c98a3e' : '#d8d2d2'};border-radius:10px;padding:10px;font:600 12px 'Hanken Grotesk',sans-serif;color:${status === 'draft' ? '#c98a3e' : '#908d8d'};cursor:pointer;min-height:44px;">Entwurf</button>
          <button data-action="set-status" data-status="pub" style="flex:1;background:${status === 'pub' ? '#e9f4ef' : '#faf7f7'};border:1.5px solid ${status === 'pub' ? '#4c9a78' : '#d8d2d2'};border-radius:10px;padding:10px;font:600 12px 'Hanken Grotesk',sans-serif;color:${status === 'pub' ? '#4c9a78' : '#908d8d'};cursor:pointer;min-height:44px;">Veröffentlicht</button>
        </div>
      </div>
      </div>
      <div class="admin-edit-side">
      <div style="background:#fff;border-radius:14px;border:1px solid #e9e4e4;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;">
        <div style="background:#ffffff;border-radius:8px;padding:8px;flex-shrink:0;">${qrHtml}</div>
        <div style="flex:1;min-width:0;">
          <div style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;">QR-Code</div>
          <div style="font:400 11px 'Hanken Grotesk',sans-serif;color:#908d8d;word-break:break-all;">${escHtml((st ? stationUrl(st) : `${SITE_URL}/#/s/${slugify(title || 'station')}`).replace(/^https?:\/\//, ''))}</div>
          ${st ? `<button data-action="go-qr" data-id="${st.id}" class="tap" style="margin-top:8px;background:#faf7f7;border:none;border-radius:7px;padding:6px 12px;font:500 11px 'Hanken Grotesk',sans-serif;color:#706f6f;cursor:pointer;">QR exportieren →</button>` : `<div style="margin-top:8px;font:400 11px 'Hanken Grotesk',sans-serif;color:#b3aeae;">Erst speichern, dann exportierbar</div>`}
        </div>
      </div>
      </div>
      </div>
      <div style="height:env(safe-area-inset-bottom,32px);min-height:32px;"></div>
    </div>
  </div>`;
}

function buildAdminQr() {
  const st = STATIONS.find(s => s.id === state.qrStationId) || STATIONS[0];
  if (!st) return `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#908d8d;font:400 13px 'Hanken Grotesk',sans-serif;">Noch keine Stationen vorhanden.</div>`;
  const url = stationUrl(st);
  const qr = encodeQR(url, 'M');
  const moduleSize = Math.max(2, Math.round(state.qrSize / qr.size));
  const qrHtml = qrToSVG(qr, { moduleSize });
  return `
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;animation:fadein .18s ease both;">
    <div style="padding:14px 18px 12px;border-bottom:1px solid #e9e4e4;flex-shrink:0;background:#ffffff;">
      <div style="font:700 18px 'Cormorant Garamond',serif;color:#3C3C3B;">QR-Codes exportieren</div>
    </div>
    <div class="scroll" style="flex:1;padding:18px 18px 0;">
      <div class="admin-qr-layout" style="display:block;">
      <div class="admin-qr-preview-col">
      <div style="margin-bottom:16px;">
        <label style="font:600 11px 'Hanken Grotesk',sans-serif;color:#706f6f;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:7px;">Station</label>
        <select data-field="qrStationId" style="width:100%;border:1.5px solid #e9e4e4;border-radius:11px;padding:12px 14px;font:400 14px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;outline:none;cursor:pointer;">
          ${STATIONS.map(s => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${s.id} · ${escHtml(s.title)}</option>`).join('')}
        </select>
      </div>
      <div style="background:#fff;border-radius:16px;padding:20px;box-shadow:0 4px 20px rgba(60,60,59,.09);display:flex;flex-direction:column;align-items:center;gap:14px;margin-bottom:16px;">
        <div id="qr-preview" style="background:#ffffff;border-radius:8px;padding:12px;">${qrHtml}</div>
        <div style="text-align:center;">
          <div style="font:700 16px/1.2 'Cormorant Garamond',serif;color:#3C3C3B;">${escHtml(st.title)}</div>
          <div style="font:400 11px 'Hanken Grotesk',sans-serif;color:#908d8d;margin-top:3px;">Station ${st.id} · ${escHtml(url.replace(/^https?:\/\//, ''))}</div>
        </div>
      </div>
      </div>
      <div class="admin-qr-controls-col">
      <div style="background:#fff;border-radius:14px;border:1px solid #e9e4e4;padding:18px;margin-bottom:14px;">
        <div style="font:600 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;margin-bottom:14px;">Einstellungen</div>
        <div style="margin-bottom:6px;">
          <label style="font:500 11px 'Hanken Grotesk',sans-serif;color:#706f6f;display:block;margin-bottom:7px;">Größe: ${state.qrSize} × ${state.qrSize} px</label>
          <input type="range" min="120" max="600" value="${state.qrSize}" data-field="qrSize" style="width:100%;accent-color:#C9A87C;cursor:pointer;"/>
        </div>
      </div>
      <div style="background:#fff;border-radius:14px;border:1px solid #e9e4e4;padding:18px;margin-bottom:14px;">
        <div style="font:600 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;margin-bottom:12px;">Herunterladen</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <button data-action="dl-qr" data-fmt="png" class="tap" style="border:1.5px solid #e9e4e4;border-radius:9px;padding:12px;font:600 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>PNG
          </button>
          <button data-action="dl-qr" data-fmt="svg" class="tap" style="border:1.5px solid #e9e4e4;border-radius:9px;padding:12px;font:600 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>SVG
          </button>
          <button data-action="dl-qr" data-fmt="jpg" class="tap" style="border:1.5px solid #e9e4e4;border-radius:9px;padding:12px;font:600 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>JPG
          </button>
          <button data-action="dl-qr" data-fmt="pdf" class="tap" style="border:1.5px solid #e9e4e4;border-radius:9px;padding:12px;font:600 12px 'Hanken Grotesk',sans-serif;color:#3C3C3B;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>PDF
          </button>
        </div>
        <button data-action="dl-qr-zip" class="tap" style="background:#3C3C3B;border:none;border-radius:11px;padding:15px 18px;font:600 13px 'Hanken Grotesk',sans-serif;color:#faf7f7;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Alle ${STATIONS.length} QR-Codes als ZIP
        </button>
      </div>
      </div>
      </div>
      <div style="height:env(safe-area-inset-bottom,32px);min-height:32px;"></div>
    </div>
  </div>`;
}

// ── QR-DOWNLOAD-HELFER ───────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function svgTextOf(qr, size) {
  const moduleSize = Math.max(2, Math.round(size / qr.size));
  return qrToSVG(qr, { moduleSize });
}
async function canvasFromQR(qr, size) {
  const moduleSize = Math.max(2, Math.round(size / qr.size));
  const canvas = document.createElement('canvas');
  qrToCanvas(qr, canvas, { moduleSize });
  return canvas;
}
async function downloadQR(st, fmt) {
  const qr = encodeQR(stationUrl(st), 'M');
  const safeTitle = slugify(st.title);
  if (fmt === 'svg') {
    const svg = svgTextOf(qr, state.qrSize);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `qr-${st.id}-${safeTitle}.svg`);
    return;
  }
  const canvas = await canvasFromQR(qr, state.qrSize);
  if (fmt === 'png') {
    canvas.toBlob(blob => downloadBlob(blob, `qr-${st.id}-${safeTitle}.png`), 'image/png');
    return;
  }
  if (fmt === 'jpg') {
    // JPEG braucht einen weißen Hintergrund statt Transparenz
    canvas.toBlob(blob => downloadBlob(blob, `qr-${st.id}-${safeTitle}.jpg`), 'image/jpeg', 0.95);
    return;
  }
  if (fmt === 'pdf') {
    canvas.toBlob(async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const pdf = makeSingleImagePDF(bytes, canvas.width, canvas.height, { label: `${st.id} · ${st.title}` });
      downloadBlob(pdf, `qr-${st.id}-${safeTitle}.pdf`);
    }, 'image/jpeg', 0.95);
  }
}
async function downloadAllQrZip() {
  const files = [];
  for (const st of STATIONS) {
    const qr = encodeQR(stationUrl(st), 'M');
    const canvas = await canvasFromQR(qr, state.qrSize);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    files.push({ name: `qr-${st.id}-${slugify(st.title)}.png`, data: buf });
  }
  const zip = makeZip(files);
  downloadBlob(zip, 'audioguide-qr-codes.zip');
}

// ── EVENTS ───────────────────────────────────────────────────
function bindEvents() {
  const imgInput = document.querySelector('[data-action="upload-image"]');
  if (imgInput) imgInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (state.editImageUrl) URL.revokeObjectURL(state.editImageUrl);
    setState({ editImageUrl: URL.createObjectURL(file), editImageFile: file });
  });
  const audioInput = document.querySelector('[data-action="upload-audio"]');
  if (audioInput) audioInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (state.editAudioUrl) URL.revokeObjectURL(state.editAudioUrl);
    const url = URL.createObjectURL(file);
    setState({ editAudioUrl: url, editAudioFile: file, editAudioName: file.name, editAudioType: (file.type.split('/')[1] || 'audio').toUpperCase() });
    const a = new Audio(url);
    a.addEventListener('loadedmetadata', () => { if (isFinite(a.duration) && a.duration > 0) setState({ editDur: Math.round(a.duration) }); });
  });
  const stage = document.getElementById('lb-stage');
  if (stage) {
    let x0 = null;
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) < 45) return;
      handleAction(dx < 0 ? 'gal-next' : 'gal-prev', {});
    }, { passive: true });
  }
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      handleAction(el.dataset.action, el.dataset);
    });
  });
  document.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('input', e => {
      const field = el.dataset.field;
      const value = el.type === 'range' ? Number(el.value) : el.value;
      state = { ...state, [field]: value };
      if (field !== 'qrSize') return;
      render();
    });
    el.addEventListener('change', e => {
      const field = el.dataset.field;
      const value = el.type === 'range' ? Number(el.value) : el.value;
      setState({ [field]: value });
    });
  });
}

function resetEditState(idx) {
  const st = idx >= 0 ? STATIONS[idx] : null;
  return {
    aScreen: 'edit', editIdx: idx,
    editTitle: st?.title || '', editSub: st?.sub || '', editEra: st?.era || '',
    editDesc: st?.description || '', editStatus: st?.status || 'draft', editDur: st?.dur || 180,
    editImageUrl: null, editImageFile: null,
    editAudioUrl: null, editAudioName: null, editAudioType: null, editAudioFile: null,
  };
}

function handleAction(action, data) {
  switch (action) {
    case 'go-start': stopSpeech(); stopCamera(); setState({ view: 'visitor', vScreen: 'start', playing: false }); break;
    case 'go-list': stopCamera(); setState({ vScreen: 'list', playing: false }); break;
    case 'go-scanner': setState({ vScreen: 'scanner', scanState: 'idle' }); startCamera(); break;
    case 'admin-tap': {
      window._adminTaps = (window._adminTaps || 0) + 1;
      clearTimeout(window._adminTapTimer);
      window._adminTapTimer = setTimeout(() => { window._adminTaps = 0; }, 1500);
      if (window._adminTaps >= 5) {
        window._adminTaps = 0;
        setState(session ? { view: 'admin', aScreen: 'dash' } : { view: 'admin-login', loginErr: '' });
      }
      break;
    }
    case 'retry-camera': startCamera(); break;
    case 'retry-load': location.reload(); break;
    case 'manual-scan': {
      const input = window.prompt('QR-Code-Link oder Stationsnummer eingeben:', `${SITE_URL}/#/s/`);
      if (input) {
        const idx = findStationBySlugOrUrl(input);
        if (idx >= 0) { stopCamera(); openStation(idx); }
        else window.alert('Station nicht gefunden.');
      }
      break;
    }
    case 'go-station': stopCamera(); openStation(Number(data.idx)); break;
    case 'go-next': openStation((state.stIdx + 1) % STATIONS.length); break;
    case 'go-sources': stopSpeech(); setState({ vScreen: 'sources', playing: false }); break;
    case 'go-impressum': stopSpeech(); setState({ vScreen: 'impressum', playing: false }); break;
    case 'go-datenschutz': stopSpeech(); setState({ vScreen: 'datenschutz', playing: false }); break;
    case 'gal-sel': setState({ galIdx: Number(data.gal) }); break;
    case 'gal-prev': setState({ galIdx: (state.galIdx - 1 + GALLERY.length) % GALLERY.length }); break;
    case 'gal-next': setState({ galIdx: (state.galIdx + 1) % GALLERY.length }); break;
    case 'gal-open': setState({ lightbox: true }); break;
    case 'gal-close': setState({ lightbox: false }); break;
    case 'toggle-play': toggleSpeech(); break;
    case 'skip-back': skipSpeech(-15); break;
    case 'skip-fwd': skipSpeech(+15); break;
    case 'toggle-pw': setState({ pwVisible: !state.pwVisible }); break;
    case 'do-login': doLogin(); break;
    case 'do-logout': doLogout(); break;
    case 'admin-nav': setState({ aScreen: data.nav }); break;
    case 'new-station': setState(resetEditState(-1)); break;
    case 'edit-station': setState(resetEditState(Number(data.idx))); break;
    case 'go-qr': setState({ aScreen: 'qr', qrStationId: data.id }); break;
    case 'set-status': setState({ editStatus: data.status }); break;
    case 'save-draft': saveStationEdits('draft'); break;
    case 'save-pub': saveStationEdits('pub'); break;
    case 'dl-qr': {
      const st = STATIONS.find(s => s.id === state.qrStationId) || STATIONS[0];
      if (st) downloadQR(st, data.fmt);
      break;
    }
    case 'dl-qr-zip': {
      toast('QR-Codes werden gepackt…');
      downloadAllQrZip().then(() => toast('ZIP heruntergeladen.')).catch(() => toast('Export fehlgeschlagen.'));
      break;
    }
  }
}

async function doLogin() {
  setState({ loginLoading: true, loginErr: '' });
  const { data, error } = await supabase.auth.signInWithPassword({ email: state.loginEmail.trim(), password: state.loginPw });
  if (error) {
    setState({ loginLoading: false, loginErr: 'Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.' });
    const box = document.getElementById('pw-input');
    if (box) { box.classList.add('shake'); setTimeout(() => box.classList.remove('shake'), 400); }
    return;
  }
  session = data.session;
  await loadData().catch(() => {});
  setState({ loginLoading: false, view: 'admin', aScreen: 'dash' });
}
async function doLogout() {
  await supabase.auth.signOut();
  session = null;
  setState({ view: 'admin-login', loginPw: '', loginErr: '' });
}

async function saveStationEdits(status) {
  const title = state.editTitle.trim();
  if (!title) { alert('Bitte einen Titel eingeben.'); return; }
  setState({ saving: true });
  try {
    let imageUrl = state.editIdx >= 0 ? STATIONS[state.editIdx].image_url : null;
    if (state.editImageFile) imageUrl = await uploadToStorage(state.editImageFile, 'images');
    let audioUrl = state.editIdx >= 0 ? STATIONS[state.editIdx].audio_url : null;
    if (state.editAudioFile) audioUrl = await uploadToStorage(state.editAudioFile, 'audio');
    const dur = state.editDur || (state.editIdx >= 0 ? STATIONS[state.editIdx].dur : 180);

    const payload = {
      title, sub: state.editSub.trim(), era: state.editEra.trim(),
      description: state.editDesc.trim(), status, image_url: imageUrl, audio_url: audioUrl, dur,
    };

    if (state.editIdx >= 0) {
      const st = STATIONS[state.editIdx];
      const { data, error } = await supabase.from('stations').update(payload).eq('id', st.id).select().single();
      if (error) throw error;
      STATIONS[state.editIdx] = data;
    } else {
      const id = nextStationId();
      const slug = uniqueSlug(slugify(title));
      const insertPayload = { id, slug, sort_order: STATIONS.length, audio_title: title, narration: '', scans: 0, ...payload };
      const { data, error } = await supabase.from('stations').insert(insertPayload).select().single();
      if (error) throw error;
      STATIONS.push(data);
    }
    toast(status === 'pub' ? 'Station veröffentlicht.' : 'Als Entwurf gespeichert.');
    setState({ saving: false, aScreen: 'dash', editImageFile: null, editAudioFile: null });
  } catch (e) {
    setState({ saving: false });
    alert('Speichern fehlgeschlagen: ' + (e?.message || e));
  }
}

// ── KEYBOARD ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (state.lightbox) {
    if (e.key === 'Escape') handleAction('gal-close', {});
    if (e.key === 'ArrowLeft') handleAction('gal-prev', {});
    if (e.key === 'ArrowRight') handleAction('gal-next', {});
  }
});

// ── INIT ─────────────────────────────────────────────────────
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Zeitüberschreitung beim Laden (${label}). Bitte Internetverbindung prüfen.`)), ms)),
  ]);
}

async function init() {
  render(); // sofort die Ladeanzeige zeigen, statt einer leeren Seite bis die Daten da sind
  try {
    const { data: { session: s } } = await withTimeout(supabase.auth.getSession(), 10000, 'Anmeldestatus');
    session = s;
    supabase.auth.onAuthStateChange((event, s2) => {
      session = s2;
      if (event === 'SIGNED_OUT' && state.view === 'admin') setState({ view: 'admin-login', loginErr: '' });
    });
    await withTimeout(loadData(), 15000, 'Stationsdaten');
    dataLoaded = true;
    await applyInitialRoute();
  } catch (e) {
    dataError = e?.message || String(e);
    setState({ view: 'error' });
    return;
  }
  window.addEventListener('hashchange', () => {
    const route = parseRoute();
    if (route.type === 'station') {
      const idx = STATIONS.findIndex(st => st.slug === route.slug);
      if (idx >= 0) openStation(idx);
    } else if (route.type === 'admin' && state.view !== 'admin') {
      setState(session ? { view: 'admin', aScreen: 'dash' } : { view: 'admin-login', loginErr: '' });
    }
  });
}

init();
