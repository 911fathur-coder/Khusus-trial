(function(){
'use strict';

/* ============ ICONS ============ */
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12z"/></svg>';
const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const ICON_MINUS_CIRCLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>';

/* ============ STORAGE ============ */
class StorageManager {
  constructor(key){ this.storageKey = key || 'dscalc_ios_v1'; this.memory = null; this.data = this.load(); }
  getInitialData(){
    return { activeProfileId:'default', profiles:{ default:{ name:'Default Standard', standards:this.getDefaultStandards() } }, history:[], config:{ theme:'light' } };
  }
  load(){
    try{
      if(typeof window==='undefined' || !window.localStorage) return this.getInitialData();
      const raw = localStorage.getItem(this.storageKey);
      if(raw) return JSON.parse(raw);
      const d = this.getInitialData(); this.save(d); return d;
    }catch(e){ return this.memory || this.getInitialData(); }
  }
  save(d){ this.data = d || this.data; try{ if(typeof window!=='undefined' && window.localStorage){ localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } else { this.memory = this.data; } }catch(e){ this.memory = this.data; } }
  getHistory(){ return [...this.data.history].sort((a,b)=>b.timestamp-a.timestamp); }
  addHistory(r){ const MAX=27; this.data.history.push(r); this.data.history.sort((a,b)=>b.timestamp-a.timestamp); if(this.data.history.length>MAX) this.data.history=this.data.history.slice(0,MAX); this.save(); }
  deleteHistoryAt(timestamp){ this.data.history = this.data.history.filter(h=>h.timestamp!==timestamp); this.save(); }
  clearHistory(){ this.data.history=[]; this.save(); }
  getProfiles(){ return this.data.profiles; }
  getProfile(id){ return this.data.profiles[id]; }
  addProfile(name){ const id='profile_'+Date.now(); this.data.profiles[id]={name, standards:this.getDefaultStandards()}; this.data.activeProfileId=id; this.save(); return id; }
  deleteProfile(id){ if(id==='default'||!this.data.profiles[id]) return; delete this.data.profiles[id]; if(this.data.activeProfileId===id) this.data.activeProfileId='default'; this.save(); }
  updateStandards(id, s){ if(this.data.profiles[id]){ this.data.profiles[id].standards=s; this.save(); } }
  setActiveProfile(id){ if(this.data.profiles[id]){ this.data.activeProfileId=id; this.save(); } }
  getActiveProfileId(){ return this.data.activeProfileId; }
  getActiveProfile(){ return this.data.profiles[this.getActiveProfileId()]; }
  getTheme(){ return this.data.config.theme; }
  setTheme(t){ this.data.config.theme=t; this.save(); }
  getDefaultStandards(){
    return {
      'Seam Thickness':{min:1.15,max:1.35}, 'Seam Length':{min:2.50,max:2.80},
      'Body Hook':{min:1.70,max:2.10}, 'Cover Hook':{min:1.50,max:1.90},
      'Actual Overlap':{min:1.00,max:null}, '% Overlap':{min:0,max:null},
      '%BHB':{min:75,max:null}, 'Freespace':{min:0,max:null}
    };
  }
}

/* ============ CALCULATOR (logic unchanged from source) ============ */
class Calculator {
  calculate(inputs, standards){
    const { bodyThickness, eoeThickness, measurements, mode } = inputs;
    const cols = mode==='1' ? 1 : 3;
    const avg = {};
    Object.keys(measurements).forEach(p=>{ avg[p] = measurements[p].reduce((a,b)=>a+b,0)/cols; });

    const denomAvg = avg['Seam Length'] - (2*eoeThickness + bodyThickness);
    const avgActualOverlap = (avg['Cover Hook'] + avg['Body Hook'] + eoeThickness) - avg['Seam Length'];
    const avgPercentOverlap = denomAvg>0 ? (avgActualOverlap/denomAvg)*100 : 0;
    const bhb = denomAvg>0 ? (((avg['Body Hook']-bodyThickness)/denomAvg)*100) : 0;
    const freeSpace = avg['Seam Thickness'] - ((3*eoeThickness)+(2*bodyThickness));

    const overlapPoints = Array.from({length:cols},(_,i)=>{
      const sl=measurements['Seam Length'][i], bh=measurements['Body Hook'][i], ch=measurements['Cover Hook'][i];
      const actual=(ch+bh+eoeThickness)-sl;
      const denomPoint = sl-(2*eoeThickness+bodyThickness);
      const percent = denomPoint>0 ? (actual/denomPoint)*100 : 0;
      return { label:String.fromCharCode(65+i), actual, percent };
    });

    const results = {
      'Seam Thickness':avg['Seam Thickness'], 'Seam Length':avg['Seam Length'],
      'Body Hook':avg['Body Hook'], 'Cover Hook':avg['Cover Hook'],
      '%BHB':bhb, 'Freespace':freeSpace, 'Actual Overlap':avgActualOverlap, '% Overlap':avgPercentOverlap
    };

    const checks = {}; let overallStatus='pass';
    for(const key in results){ checks[key]=this.checkStandard(results[key], standards[key]); if(checks[key]==='fail') overallStatus='fail'; }
    overlapPoints.forEach((p,i)=>{
      checks['actual_overlap_'+i]=this.checkStandard(p.actual, standards['Actual Overlap']);
      checks['percent_overlap_'+i]=this.checkStandard(p.percent, standards['% Overlap']);
      if(checks['actual_overlap_'+i]==='fail' || checks['percent_overlap_'+i]==='fail') overallStatus='fail';
    });

    return { timestamp:Date.now(), overallStatus, inputs, results, checks, overlapPoints };
  }
  checkStandard(value, standard){
    if(!standard) return 'pass';
    const { min, max } = standard;
    if((min!==null && value<min) || (max!==null && value>max)) return 'fail';
    return 'pass';
  }
}

/* ============ HELPERS ============ */
function animateValue(el, end, decimals, suffix, delay){
  suffix = suffix || ''; delay = delay || 0;
  const start = 0;
  setTimeout(()=>{
    const t0 = performance.now(), dur=650;
    function tick(now){
      const p = Math.min((now-t0)/dur,1);
      const eased = 1-Math.pow(1-p,3);
      const val = start + (end-start)*eased;
      el.textContent = val.toFixed(decimals)+suffix;
      if(p<1) requestAnimationFrame(tick); else el.textContent = end.toFixed(decimals)+suffix;
    }
    requestAnimationFrame(tick);
  }, delay);
}
function fmt(n,d){ return Number(n).toFixed(d===undefined?2:d); }
function vibrate(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }

/* ============ APP ============ */
class App{
  constructor(){
    this.storage = new StorageManager();
    this.calculator = new Calculator();
    this.currentResult = null;
    this.activeView = 'calculator';
    this.sheetOnClose = null;
    this.cacheDom();
    this.init();
  }

  cacheDom(){
    const $ = id => document.getElementById(id);
    this.dom = {
      navbar:$('navbar'), navCompactTitle:$('navCompactTitle'), themeToggle:$('themeToggle'),
      scrollArea:$('scrollArea'), largeTitle:$('largeTitle'), largeTitleSub:$('largeTitleSub'),
      clearHistoryBtn:$('clearHistoryBtn'),
      tabSegmented:$('tabSegmented'), tabIndicator:$('tabIndicator'),
      rowProfile:$('rowProfile'), profileValue:$('profileValue'),
      modeSegmented:$('modeSegmented'), modeIndicator:$('modeIndicator'),
      headNoInput:$('headNoInput'),
      rowBody:$('rowBody'), bodyValue:$('bodyValue'),
      rowEoe:$('rowEoe'), eoeValue:$('eoeValue'),
      measureHead:$('measureHead'), measureBody:$('measureBody'),
      generateBtn:$('generateBtn'), clearBtn:$('clearBtn'), resultContainer:$('resultContainer'),
      historyListContainer:$('historyListContainer'),
      profileListContainer:$('profileListContainer'), newProfileName:$('newProfileName'), addProfileBtn:$('addProfileBtn'),
      editingProfileName:$('editingProfileName'), settingsSegmented:$('settingsSegmented'), settingsIndicator:$('settingsIndicator'),
      panelGeneral:$('panel-general'), panelOverlap:$('panel-overlap'),
      saveSettingsBtn:$('saveSettingsBtn'), saveIcon:$('saveIcon'), saveLabel:$('saveLabel'), resetStandardsBtn:$('resetStandardsBtn'),
      toast:$('toast'), toastText:$('toastText'),
      sheetBackdrop:$('sheetBackdrop'), sheet:$('sheet'), sheetTitle:$('sheetTitle'), sheetBody:$('sheetBody'), sheetClose:$('sheetClose'), sheetHandleZone:$('sheetHandleZone'),
      alertBackdrop:$('alertBackdrop'), alertBox:$('alertBox'), alertTitle:$('alertTitle'), alertMessage:$('alertMessage'), alertActions:$('alertActions'),
      brandBadge:$('brandBadge'),
      consentGate:$('consentGate'), consentAgreeBtn:$('consentAgreeBtn'), consentDeclineBtn:$('consentDeclineBtn'),
      blockedGate:$('blockedGate'), reconsiderBtn:$('reconsiderBtn'),
      devPanel:$('devPanel'), devRefreshBtn:$('devRefreshBtn'), devClearAllBtn:$('devClearAllBtn'), devLogoutBtn:$('devLogoutBtn'),
      devSearchInput:$('devSearchInput'), devStatusSegmented:$('devStatusSegmented'), devStatusIndicator:$('devStatusIndicator'),
      devDailySummary:$('devDailySummary'), devLogListArea:$('devLogListArea'),
      offlineBanner:$('offlineBanner'),
      appMenuBtn:$('appMenuBtn'),
      doubleSeamApp:$('doubleSeamApp'), timingOutputApp:$('timingOutputApp'), spcSeamerApp:$('spcSeamerApp'),
      timingStart:$('timingStart'), timingEnd:$('timingEnd'),
      timingPoints:$('timingPoints'), timingMin:$('timingMin'), timingMax:$('timingMax'),
      timingBreakStart:$('timingBreakStart'), timingBreakEnd:$('timingBreakEnd'),
      timingGenerateBtn:$('timingGenerateBtn'), timingResetBtn:$('timingResetBtn'),
      timingGapMapWrap:$('timingGapMapWrap'), timingGapMap:$('timingGapMap'),
      timingResultList:$('timingResultList'),
      spcSeamerParamSegmented:$('spcSeamerParamSegmented'), spcSeamerParamIndicator:$('spcSeamerParamIndicator'),
      spcSeamerInputTitle:$('spcSeamerInputTitle'), spcSeamerInstruction:$('spcSeamerInstruction'),
      spcSeamerInputTableWrap:$('spcSeamerInputTableWrap'),
      spcSeamerResetBtn:$('spcSeamerResetBtn'), spcSeamerGenerateBtn:$('spcSeamerGenerateBtn'), spcSeamerPdfBtn:$('spcSeamerPdfBtn'),
      spcSeamerOutputWrap:$('spcSeamerOutputWrap'), spcSeamerOutputTitle:$('spcSeamerOutputTitle'),
      spcSeamerOutputTableWrap:$('spcSeamerOutputTableWrap'), spcSeamerChartsWrap:$('spcSeamerChartsWrap'),
      spcSlitterApp:$('spcSlitterApp'),
      spcSlitterParamSegmented:$('spcSlitterParamSegmented'), spcSlitterParamIndicator:$('spcSlitterParamIndicator'),
      spcSlitterInputTitle:$('spcSlitterInputTitle'), spcSlitterInstruction:$('spcSlitterInstruction'),
      spcSlitterLajur9Wrapper:$('spcSlitterLajur9Wrapper'), spcSlitterLajur9Toggle:$('spcSlitterLajur9Toggle'),
      spcSlitterInputTableWrap:$('spcSlitterInputTableWrap'),
      spcSlitterResetBtn:$('spcSlitterResetBtn'), spcSlitterGenerateBtn:$('spcSlitterGenerateBtn'), spcSlitterPdfBtn:$('spcSlitterPdfBtn'),
      spcSlitterOutputWrap:$('spcSlitterOutputWrap'), spcSlitterOutputTitle:$('spcSlitterOutputTitle'),
      spcSlitterOutputTableWrap:$('spcSlitterOutputTableWrap'), spcSlitterChartsWrap:$('spcSlitterChartsWrap')
    };
    this.state = { mode:'3', body:0.16, eoe:0.22 };
    this.bodyOptions = ['0.15','0.16','0.17'];
    this.eoeOptions = ['0.16','0.17','0.18','0.19','0.20','0.21','0.22','0.23','0.24'];
    this.activeApp = 'doubleseam';
    this.timingScheduleData = [];
    this.spcSeamerParam = 'thickness';
    this.spcSeamerCharts = {};
    this.spcSeamerLastResult = null;
    this.spcSlitterParam = 'height';
    this.spcSlitterCharts = {};
    this.spcSlitterLastResult = null;
  }

  init(){
    this.initTheme();
    this.initNav();
    this.initSegmented(this.dom.tabSegmented, this.dom.tabIndicator, (view)=>this.switchView(view), 'data-view');
    this.initSegmented(this.dom.settingsSegmented, this.dom.settingsIndicator, (p)=>this.switchSettingsPanel(p), 'data-panel');
    this.initModeSegmented();
    this.initScrollBehavior();
    this.initFieldFocusFX();
    this.bindStaticEvents();
    this.buildMeasureTable();
    this.renderAll();
    this.initGates();
    this.initDevAccess();
    this.initAppSwitcher();
    this.initTimingOutput();
    this.initSpcSeamer();
    this.initSpcSlitter();
    this.initOfflineIndicator();
    this.flushPendingLogs();
    requestAnimationFrame(()=>{ this.layoutIndicator(this.dom.tabSegmented, this.dom.tabIndicator); this.layoutIndicator(this.dom.settingsSegmented, this.dom.settingsIndicator); this.layoutIndicator(this.dom.spcSeamerParamSegmented, this.dom.spcSeamerParamIndicator); this.layoutIndicator(this.dom.spcSlitterParamSegmented, this.dom.spcSlitterParamIndicator); });
    window.addEventListener('resize', ()=>{ this.layoutIndicator(this.dom.tabSegmented, this.dom.tabIndicator); this.layoutIndicator(this.dom.settingsSegmented, this.dom.settingsIndicator); this.layoutIndicator(this.dom.spcSeamerParamSegmented, this.dom.spcSeamerParamIndicator); this.layoutIndicator(this.dom.spcSlitterParamSegmented, this.dom.spcSlitterParamIndicator); });
    window.addEventListener('online', ()=>this.flushPendingLogs());
  }

  /* ---------- theme ---------- */
  initTheme(){
    const theme = this.storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
  }
  toggleTheme(){
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur==='dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    this.storage.setTheme(next);
    vibrate(8);
  }

  /* ---------- nav / scroll ---------- */
  initNav(){
    this.dom.themeToggle.addEventListener('click', ()=>this.toggleTheme());
  }
  initScrollBehavior(){
    this.dom.scrollArea.addEventListener('scroll', ()=>{
      const y = this.dom.scrollArea.scrollTop;
      this.dom.navbar.classList.toggle('scrolled', y>8);
    });
  }
  switchView(view){
    if(view===this.activeView) return;
    this.activeView = view;
    document.querySelectorAll('.view-panel').forEach(p=>p.classList.remove('active'));
    const target = document.getElementById('view-'+view);
    target.classList.add('active');
    const titles = { calculator:'Kalkulator', history:'Riwayat', settings:'Atur Standar' };
    this.dom.largeTitle.textContent = titles[view];
    this.dom.navCompactTitle.textContent = titles[view];
    this.dom.largeTitleSub.textContent = view==='calculator' ? 'DS.CALC · PRESENTED BY FATHUR' : (view==='history' ? 'LOG PENGUKURAN TERSIMPAN' : 'PROFILE & TOLERANSI');
    this.dom.clearHistoryBtn.classList.toggle('visible', view==='history');
    this.dom.scrollArea.scrollTo({top:0, behavior:'auto'});
    if(view==='history') this.renderHistoryList();
    if(view==='settings') this.renderSettingsForms();
    vibrate(6);
  }

  /* ---------- generic segmented ---------- */
  initSegmented(container, indicator, onChange, attr){
    if(!container) return;
    const opts = container.querySelectorAll('.segmented-opt');
    opts.forEach(opt=>{
      opt.addEventListener('click', ()=>{
        opts.forEach(o=>o.classList.remove('active'));
        opt.classList.add('active');
        this.layoutIndicator(container, indicator);
        onChange(opt.getAttribute(attr));
        vibrate(6);
      });
    });
  }
  layoutIndicator(container, indicator){
    if(!container || !indicator) return;
    const active = container.querySelector('.segmented-opt.active');
    if(!active) return;
    indicator.style.width = active.offsetWidth+'px';
    indicator.style.left = active.offsetLeft+'px';
  }
  switchSettingsPanel(panelId){
    this.dom.panelGeneral.classList.toggle('hidden', panelId!=='panel-general');
    this.dom.panelOverlap.classList.toggle('hidden', panelId!=='panel-overlap');
  }

  /* ---------- mode mini segmented ---------- */
  initModeSegmented(){
    const opts = this.dom.modeSegmented.querySelectorAll('.mini-seg-opt');
    opts.forEach(opt=>{
      opt.addEventListener('click', ()=>{
        opts.forEach(o=>o.classList.remove('active'));
        opt.classList.add('active');
        this.dom.modeIndicator.style.transform = opt.dataset.mode==='1' ? 'translateX(0)' : 'translateX(100%)';
        this.state.mode = opt.dataset.mode;
        this.buildMeasureTable();
        vibrate(6);
      });
    });
  }

  /* ---------- field focus fx (row lift not needed, just ring via CSS :focus) ---------- */
  initFieldFocusFX(){ /* handled purely via CSS focus states */ }

  bindStaticEvents(){
    this.dom.rowProfile.addEventListener('click', ()=>this.openProfilePicker());
    this.dom.rowBody.addEventListener('click', ()=>this.openBodyPicker());
    this.dom.rowEoe.addEventListener('click', ()=>this.openEoePicker());
    this.dom.generateBtn.addEventListener('click', ()=>this.handleCalculate());
    this.dom.clearBtn.addEventListener('click', ()=>this.clearCalculatorInputs());
    this.dom.addProfileBtn.addEventListener('click', ()=>this.handleAddProfile());
    this.dom.saveSettingsBtn.addEventListener('click', ()=>this.handleSaveSettings());
    this.dom.resetStandardsBtn.addEventListener('click', ()=>this.handleResetStandards());
    this.dom.clearHistoryBtn.addEventListener('click', ()=>this.handleClearHistory());
    this.dom.sheetClose.addEventListener('click', ()=>this.closeSheet());
    this.dom.sheetBackdrop.addEventListener('click', ()=>this.closeSheet());
    this.initSheetDrag();

    document.addEventListener('click', (e)=>{
      const help = e.target.closest('.help-dot');
      if(help){ e.stopPropagation(); this.handleHelpClick(help); return; }
      const historyCard = e.target.closest('.history-card');
      if(historyCard && !e.target.closest('.help-dot')){ this.toggleHistoryDetail(historyCard); }
    });
  }

  /* ---------- sheet ---------- */
  openSheet(title, bodyHTML, onMount){
    this.dom.sheetTitle.textContent = title;
    this.dom.sheetBody.innerHTML = bodyHTML;
    this.dom.sheetBackdrop.classList.add('show');
    requestAnimationFrame(()=>this.dom.sheet.classList.add('show'));
    if(onMount) onMount(this.dom.sheetBody);
  }
  closeSheet(){
    this.dom.sheet.classList.remove('show');
    this.dom.sheetBackdrop.classList.remove('show');
    this.dom.sheet.style.transform = '';
  }
  initSheetDrag(){
    let startY=0, curY=0, dragging=false;
    const zone = this.dom.sheetHandleZone;
    const onDown = (e)=>{
      dragging=true; startY = (e.touches?e.touches[0].clientY:e.clientY);
      this.dom.sheet.classList.add('dragging');
    };
    const onMove = (e)=>{
      if(!dragging) return;
      curY = (e.touches?e.touches[0].clientY:e.clientY);
      const dy = Math.max(0, curY-startY);
      this.dom.sheet.style.transform = 'translate(-50%,'+dy+'px)';
    };
    const onUp = ()=>{
      if(!dragging) return;
      dragging=false;
      this.dom.sheet.classList.remove('dragging');
      const dy = Math.max(0, curY-startY);
      if(dy>110){ this.closeSheet(); } else { this.dom.sheet.style.transform=''; }
    };
    zone.addEventListener('mousedown', onDown); zone.addEventListener('touchstart', onDown, {passive:true});
    window.addEventListener('mousemove', onMove); window.addEventListener('touchmove', onMove, {passive:true});
    window.addEventListener('mouseup', onUp); window.addEventListener('touchend', onUp);
  }

  /* ---------- alert ---------- */
  openAlert(title, message, buttons){
    this.dom.alertTitle.textContent = title;
    this.dom.alertMessage.textContent = message;
    this.dom.alertActions.innerHTML = '';
    buttons.forEach(btn=>{
      const b = document.createElement('button');
      b.className = 'alert-btn'+(btn.style?(' '+btn.style):'');
      b.textContent = btn.text;
      b.addEventListener('click', ()=>{ this.closeAlert(); if(btn.onClick) btn.onClick(); });
      this.dom.alertActions.appendChild(b);
    });
    this.dom.alertBackdrop.classList.add('show');
    this.dom.alertBox.classList.add('show');
  }
  closeAlert(){ this.dom.alertBackdrop.classList.remove('show'); this.dom.alertBox.classList.remove('show'); }

  /* ---------- toast ---------- */
  showToast(msg){
    this.dom.toastText.textContent = msg;
    this.dom.toast.classList.add('show');
    vibrate(15);
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(()=>this.dom.toast.classList.remove('show'), 2600);
  }

  /* =========================================================
     CONSENT GATE & BLOCKED GATE
     ========================================================= */
  /* ---------- offline indicator ---------- */
  initOfflineIndicator(){
    const update = ()=>{ this.dom.offlineBanner.classList.toggle('show', !navigator.onLine); };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  initGates(){
    const consentStatus = localStorage.getItem('ds_consent');
    if(consentStatus === 'declined'){
      this.dom.blockedGate.classList.add('show');
    } else if(consentStatus !== 'agreed'){
      this.dom.consentGate.classList.add('show');
    }
    this.dom.consentAgreeBtn.addEventListener('click', ()=>{
      localStorage.setItem('ds_consent', 'agreed');
      this.dom.consentGate.classList.remove('show');
      vibrate(10);
    });
    this.dom.consentDeclineBtn.addEventListener('click', ()=>{
      localStorage.setItem('ds_consent', 'declined');
      this.dom.consentGate.classList.remove('show');
      this.dom.blockedGate.classList.add('show');
      vibrate([10,30,10]);
    });
    this.dom.reconsiderBtn.addEventListener('click', ()=>{
      this.dom.blockedGate.classList.remove('show');
      this.dom.consentGate.classList.add('show');
    });
  }

  /* =========================================================
     APP SWITCHER — menu untuk pindah antar aplikasi (Double Seam,
     Setting Timing Output, SPC Slitter, SPC Seamer). Ditrigger dari
     ikon grid di navbar. SPC Slitter/Seamer masih "Segera Hadir"
     sampai kodenya diberikan.
     ========================================================= */
  APPS = [
    { id:'doubleseam', title:'Double Seam', desc:'Kalkulator inspeksi double seam', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="2.5"/><path d="M7 7v3M11 7v4M15 7v3M19 7v4"/></svg>', ready:true },
    { id:'timing', title:'Setting Timing Output', desc:'Jadwal cek QC per shift', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>', ready:true },
    { id:'spc-slitter', title:'SPC Slitter', desc:'Tren statistik bodyblank & unsquarness', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18M10 3v18M15 3v18M20 3v18"/></svg>', ready:true },
    { id:'spc-seamer', title:'SPC Seamer', desc:'Tren statistik parameter seamer', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/></svg>', ready:true }
  ];

  initAppSwitcher(){
    this.dom.appMenuBtn.addEventListener('click', ()=>this.openAppPicker());
    this.applyDoubleSeamHeader();
  }

  openAppPicker(){
    const html = '<div class="app-picker-options">'+this.APPS.map(app=>{
      const isActive = app.id===this.activeApp;
      const cls = 'app-picker-btn'+(isActive?' active':'')+(!app.ready?' disabled':'');
      return '<button class="'+cls+'" data-app-id="'+app.id+'" data-ready="'+app.ready+'">'
        + '<span class="app-picker-icon">'+app.icon+'</span>'
        + '<span class="app-picker-text"><span class="app-picker-title-row"><span class="app-picker-title">'+app.title+'</span>'
        + (!app.ready?'<span class="app-picker-soon-tag">Segera Hadir</span>':'')+'</span>'
        + '<span class="app-picker-desc">'+app.desc+'</span></span>'
        + (isActive?ICON_CHECK.replace('<svg ','<svg class="app-picker-check" '):'')
        + '</button>';
    }).join('')+'</div>';
    this.openSheet('Pilih Aplikasi', html, (body)=>{
      body.querySelectorAll('.app-picker-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          if(btn.dataset.ready!=='true'){ this.showToast('Fitur ini segera hadir'); return; }
          this.switchApp(btn.dataset.appId);
        });
      });
    });
  }

  switchApp(appId){
    if(appId===this.activeApp){ this.closeSheet(); return; }
    this.activeApp = appId;
    this.dom.doubleSeamApp.classList.toggle('hidden', appId!=='doubleseam');
    this.dom.timingOutputApp.classList.toggle('hidden', appId!=='timing');
    this.dom.spcSeamerApp.classList.toggle('hidden', appId!=='spc-seamer');
    this.dom.spcSlitterApp.classList.toggle('hidden', appId!=='spc-slitter');
    if(appId==='doubleseam') this.applyDoubleSeamHeader();
    else if(appId==='timing'){
      this.dom.largeTitle.textContent = 'Setting Timing Output';
      this.dom.navCompactTitle.textContent = 'Timing Output';
      this.dom.largeTitleSub.textContent = 'QC SCHEDULE · PRESENTED BY FATHUR';
      this.dom.clearHistoryBtn.classList.remove('visible');
    } else if(appId==='spc-seamer'){
      this.dom.largeTitle.textContent = 'SPC Seamer';
      this.dom.navCompactTitle.textContent = 'SPC Seamer';
      this.dom.largeTitleSub.textContent = 'TREN STATISTIK · PRESENTED BY FATHUR';
      this.dom.clearHistoryBtn.classList.remove('visible');
    } else if(appId==='spc-slitter'){
      this.dom.largeTitle.textContent = 'SPC Slitter';
      this.dom.navCompactTitle.textContent = 'SPC Slitter';
      this.dom.largeTitleSub.textContent = 'TREN STATISTIK · PRESENTED BY FATHUR';
      this.dom.clearHistoryBtn.classList.remove('visible');
    }
    this.closeSheet();
    this.dom.scrollArea.scrollTo({top:0, behavior:'auto'});
    vibrate(10);
  }

  applyDoubleSeamHeader(){
    const titles = { calculator:'Kalkulator', history:'Riwayat', settings:'Atur Standar' };
    this.dom.largeTitle.textContent = titles[this.activeView];
    this.dom.navCompactTitle.textContent = titles[this.activeView];
    this.dom.largeTitleSub.textContent = this.activeView==='calculator' ? 'DS.CALC · PRESENTED BY FATHUR' : (this.activeView==='history' ? 'LOG PENGUKURAN TERSIMPAN' : 'PROFILE & TOLERANSI');
    this.dom.clearHistoryBtn.classList.toggle('visible', this.activeView==='history');
  }

  /* =========================================================
     SETTING TIMING OUTPUT — port dari app standalone, logika
     perhitungan (parseTime, formatTime, distribusi slack, dst)
     TIDAK diubah, hanya dipasangkan ke komponen UI app utama.
     ========================================================= */
  initTimingOutput(){
    this.dom.timingGenerateBtn.addEventListener('click', ()=>this.timingCalculate());
    this.dom.timingResetBtn.addEventListener('click', ()=>this.timingReset());
  }

  timingParseTime(str){
    if(!str) return 0;
    const normalized = str.toString().replace('.', ':');
    const [h, m] = normalized.split(':').map(v => parseInt(v) || 0);
    return (h * 60) + m;
  }

  timingFormatTime(min){
    let val = min % 1440;
    if (val < 0) val += 1440;
    return String(Math.floor(val/60)).padStart(2,'0')+':'+String(val%60).padStart(2,'0');
  }

  timingCalculate(){
    const start = this.timingParseTime(this.dom.timingStart.value);
    let end = this.timingParseTime(this.dom.timingEnd.value);
    const count = parseInt(this.dom.timingPoints.value);
    const minGap = parseInt(this.dom.timingMin.value);
    const maxGap = parseInt(this.dom.timingMax.value);
    let bS = this.timingParseTime(this.dom.timingBreakStart.value);
    let bE = this.timingParseTime(this.dom.timingBreakEnd.value);

    // MIDNIGHT LOGIC - handle shift yang lewat tengah malam
    if (end <= start) end += 1440;

    let bSRel = (bS < start && bS + 1440 < end) ? bS + 1440 : bS;
    let bERel = (bE <= bSRel) ? bE + 1440 : bE;

    const targetEnd = end - Math.floor(Math.random() * 8);
    let bOverlap = (bSRel < targetEnd && bERel > start)
      ? (Math.min(targetEnd, bERel) - Math.max(start, bSRel)) : 0;

    let netDur = (targetEnd - start) - bOverlap;
    let numGaps = count - 1;

    if (isNaN(count) || count < 2) {
      this.openAlert('Data Kurang', 'Minimal harus 2 titik cek ya, Fathur!', [{text:'Oke', style:'cancel'}]);
      return;
    }
    if (numGaps * minGap > netDur) {
      this.openAlert('Waktu Gak Cukup', 'Butuh '+(numGaps*minGap)+'m bersih, cuma ada '+Math.floor(netDur)+'m.', [{text:'Oke', style:'cancel'}]);
      return;
    }

    // SLACK DISTRIBUTION
    let gaps = Array(numGaps).fill(minGap);
    let slack = netDur - (numGaps * minGap);
    let safety = 0;
    while (slack > 0 && safety < 5000) {
      let i = Math.floor(Math.random() * numGaps);
      if (gaps[i] < maxGap) { gaps[i]++; slack--; }
      safety++;
    }

    // BUILD SCHEDULE
    let schedule = [start];
    let curr = start;
    for (let g of gaps) {
      curr += g;
      if (curr >= bSRel && (curr - g) < bERel) curr += (bERel - bSRel);
      schedule.push(curr);
    }

    this.timingScheduleData = schedule.map((m, i) => ({
      tag: i === 0 ? 'START' : (i === schedule.length - 1 ? 'FINISH' : ('CEK '+(i+1))),
      val: this.timingFormatTime(m),
      gap: i > 0 ? gaps[i-1] : 0,
      raw: m
    }));

    this.timingRenderResults(schedule, start, end);
    vibrate(10);
  }

  timingRenderResults(schedule, start, end){
    this.dom.timingGapMapWrap.classList.remove('hidden');
    this.dom.timingGapMap.innerHTML = '';

    const totalW = end - start;
    schedule.forEach(m=>{
      const pos = ((m - start) / totalW) * 100;
      const dot = document.createElement('div');
      dot.className = 'timing-gap-dot';
      dot.style.left = pos+'%';
      this.dom.timingGapMap.appendChild(dot);
    });

    this.dom.timingResultList.innerHTML = '<div class="card">'+this.timingScheduleData.map(item=>
      '<div class="timing-result-row"><div class="timing-result-meta"><span class="timing-result-tag">'+item.tag+'</span>'
      + '<span class="timing-result-time">'+item.val+'</span></div>'
      + (item.gap>0 ? '<span class="timing-gap-badge">'+item.gap+' min</span>' : '')
      + '</div>'
    ).join('')+'</div>';

    setTimeout(()=>{ this.dom.timingResultList.scrollIntoView({behavior:'smooth', block:'start'}); }, 60);
  }

  timingReset(){
    this.timingScheduleData = [];
    this.dom.timingResultList.innerHTML = '';
    this.dom.timingGapMapWrap.classList.add('hidden');
    this.dom.timingGapMap.innerHTML = '';
    vibrate(10);
  }

  /* =========================================================
     SPC SEAMER — port dari app standalone. Algoritma simulasi
     tren (mean-reversion random walk di spcSeamerGenerateStableValue)
     dan seluruh rumus parsing nilai TIDAK diubah, hanya dipasangkan
     ke komponen UI app utama + tema warna ikut light/dark mode.
     ========================================================= */
  SPC_SEAMER_PARAM_SPECS = {
    thickness: { title:'Seam Thickness', basePrefix:1, prefixStr:'1.', minLimit:1.15, maxLimit:1.35, stepSize:0.02, maxStep:0.018, fallbackValues:[1.27,1.25,1.29] },
    length: { title:'Seam Length', basePrefix:2, prefixStr:'2.', minLimit:2.50, maxLimit:2.80, stepSize:0.03, maxStep:0.025, fallbackValues:[2.65,2.62,2.68] },
    countersink: { title:'Countersink', basePrefix:5, prefixStr:'5.', minLimit:5.13, maxLimit:5.48, stepSize:0.03, maxStep:0.025, fallbackValues:[5.30,5.27,5.33] }
  };
  SPC_SEAMER_ROW_LABELS = ['A1','B1','C1','A2','B2','C2','A3','B3','C3','A4','B4','C4'];

  initSpcSeamer(){
    this.initSegmented(this.dom.spcSeamerParamSegmented, this.dom.spcSeamerParamIndicator, (p)=>this.spcSeamerSwitchParam(p), 'data-param');
    this.dom.spcSeamerResetBtn.addEventListener('click', ()=>this.spcSeamerReset());
    this.dom.spcSeamerGenerateBtn.addEventListener('click', ()=>this.spcSeamerGenerate());
    this.dom.spcSeamerPdfBtn.addEventListener('click', ()=>this.openSpcExportForm('seamer'));
    this.spcSeamerRenderInputTable();
  }

  spcSeamerGetCssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  spcSeamerSwitchParam(paramKey){
    this.spcSeamerParam = paramKey;
    const spec = this.SPC_SEAMER_PARAM_SPECS[paramKey];
    this.dom.spcSeamerInputTitle.textContent = 'Input Pengukuran ('+spec.title+')';
    this.dom.spcSeamerOutputTitle.textContent = 'Master Preview ('+spec.title+')';
    this.dom.spcSeamerInstruction.textContent = 'Ketik 2 angka di belakang koma (contoh: 27 untuk '+spec.prefixStr+'27)';
    this.spcSeamerReset();
    this.spcSeamerRenderInputTable();
  }

  /* Proteksi input hanya angka & pindah fokus otomatis: turun A->B->C lalu ke head berikutnya */
  spcSeamerHandleAutoTab(e){
    e.target.value = e.target.value.replace(/[^0-9]/g,'');
    if(e.target.value.length===2){
      const row = e.target.dataset.row, col = parseInt(e.target.dataset.col,10);
      let nextRow = '', nextCol = col;
      if(row==='A') nextRow='B';
      else if(row==='B') nextRow='C';
      else if(row==='C'){ if(col<8){ nextRow='A'; nextCol=col+1; } }
      if(nextRow!==''){
        const nextInput = this.dom.spcSeamerInputTableWrap.querySelector('input[data-row="'+nextRow+'"][data-col="'+nextCol+'"]');
        if(nextInput){ nextInput.focus(); nextInput.select(); } else { e.target.blur(); }
      } else { e.target.blur(); }
    }
  }

  spcSeamerRenderInputTable(){
    const spec = this.SPC_SEAMER_PARAM_SPECS[this.spcSeamerParam];
    let html = '<table class="spc-table"><thead><tr><th>Titik</th>';
    for(let i=1;i<=8;i++) html += '<th>H'+i+'</th>';
    html += '</tr></thead><tbody>';
    ['A','B','C'].forEach(point=>{
      const dotClass = point==='A' ? 'spc-dot-a' : (point==='B' ? 'spc-dot-b' : 'spc-dot-c');
      html += '<tr><td class="spc-row-label"><span class="spc-dot '+dotClass+'"></span>'+point+'</td>';
      for(let i=1;i<=8;i++){
        html += '<td><div class="spc-cell-wrap"><span class="spc-cell-prefix">'+spec.prefixStr+'</span>'
          + '<input type="text" class="spc-cell-input spc-seamer-input" data-row="'+point+'" data-col="'+i+'" placeholder="00" inputmode="numeric" maxlength="2"></div></td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    this.dom.spcSeamerInputTableWrap.innerHTML = html;
    this.dom.spcSeamerInputTableWrap.querySelectorAll('.spc-seamer-input').forEach(inp=>{
      inp.addEventListener('input', (e)=>this.spcSeamerHandleAutoTab(e));
    });
  }

  /* Algoritma penyeimbang (mean reversion) — nilai berikutnya "ditarik" balik
     ke arah nilai anchor (titik awal) supaya tren tetap stabil di sekitar
     spesifikasi, bukan random murni. */
  spcSeamerGenerateStableValue(currentValue, anchor, maxDelta, minSpec, maxSpec){
    const reversionStrength = 0.55;
    const randomNoise = (Math.random() * (maxDelta * 2)) - maxDelta;
    const pullBack = (anchor - currentValue) * reversionStrength;
    let nextVal = currentValue + randomNoise + pullBack;
    if(nextVal < minSpec) nextVal = minSpec + (Math.random() * (maxDelta * 0.4));
    if(nextVal > maxSpec) nextVal = maxSpec - (Math.random() * (maxDelta * 0.4));
    return parseFloat(nextVal.toFixed(3));
  }

  spcSeamerGetParsedValue(row, col){
    const el = this.dom.spcSeamerInputTableWrap.querySelector('input[data-row="'+row+'"][data-col="'+col+'"]');
    if(!el || el.value==='') return null;
    const spec = this.SPC_SEAMER_PARAM_SPECS[this.spcSeamerParam];
    const rawVal = parseFloat(el.value);
    return spec.basePrefix + (rawVal/100);
  }

  spcSeamerGenerate(){
    const spec = this.SPC_SEAMER_PARAM_SPECS[this.spcSeamerParam];
    const inputs = this.dom.spcSeamerInputTableWrap.querySelectorAll('.spc-seamer-input');
    const hasData = Array.from(inputs).some(inp=>inp.value!=='');
    if(!hasData){ this.openAlert('Data Kosong', 'Isi data pengukurannya dulu ya, Bos!', [{text:'Oke', style:'cancel'}]); return; }

    this.dom.spcSeamerOutputWrap.classList.remove('hidden');
    this.dom.spcSeamerChartsWrap.innerHTML = '';
    Object.keys(this.spcSeamerCharts).forEach(key=>{ this.spcSeamerCharts[key].destroy(); delete this.spcSeamerCharts[key]; });

    const compiledData = {};
    let tableHtml = '<table class="spc-table spc-out-table"><thead><tr><th>Titik</th>';
    for(let i=1;i<=8;i++) tableHtml += '<th>H'+i+'</th>';
    tableHtml += '</tr></thead><tbody>';

    for(let i=1;i<=8;i++){
      const a1 = this.spcSeamerGetParsedValue('A',i) ?? spec.fallbackValues[0];
      const b1 = this.spcSeamerGetParsedValue('B',i) ?? spec.fallbackValues[1];
      const c1 = this.spcSeamerGetParsedValue('C',i) ?? spec.fallbackValues[2];

      const a2 = this.spcSeamerGenerateStableValue(a1, a1, spec.maxStep, spec.minLimit, spec.maxLimit);
      const a3 = this.spcSeamerGenerateStableValue(a2, a1, spec.maxStep, spec.minLimit, spec.maxLimit);
      const a4 = this.spcSeamerGenerateStableValue(a3, a1, spec.maxStep, spec.minLimit, spec.maxLimit);

      const b2 = this.spcSeamerGenerateStableValue(b1, b1, spec.maxStep, spec.minLimit, spec.maxLimit);
      const b3 = this.spcSeamerGenerateStableValue(b2, b1, spec.maxStep, spec.minLimit, spec.maxLimit);
      const b4 = this.spcSeamerGenerateStableValue(b3, b1, spec.maxStep, spec.minLimit, spec.maxLimit);

      const c2 = this.spcSeamerGenerateStableValue(c1, c1, spec.maxStep, spec.minLimit, spec.maxLimit);
      const c3 = this.spcSeamerGenerateStableValue(c2, c1, spec.maxStep, spec.minLimit, spec.maxLimit);
      const c4 = this.spcSeamerGenerateStableValue(c3, c1, spec.maxStep, spec.minLimit, spec.maxLimit);

      compiledData[i] = [a1,b1,c1,a2,b2,c2,a3,b3,c3,a4,b4,c4];

      this.dom.spcSeamerChartsWrap.insertAdjacentHTML('beforeend',
        '<div class="spc-charts-wrap-item">'
        + '<div class="spc-chart-title">HEAD '+i+' TREN</div>'
        + '<div class="card spc-chart-card"><div class="spc-chart-canvas-wrap"><canvas id="spcSeamerChart'+i+'"></canvas></div></div>'
        + '</div>'
      );
    }

    // Render tabel: lewati A1/B1/C1 (baris input asli), tampilkan titik hasil generate saja
    this.SPC_SEAMER_ROW_LABELS.forEach((lbl, rIdx)=>{
      if(rIdx<3) return;
      tableHtml += '<tr><td class="spc-out-row-label">'+lbl+'</td>';
      for(let i=1;i<=8;i++) tableHtml += '<td>'+compiledData[i][rIdx].toFixed(2)+'</td>';
      tableHtml += '</tr>';
      if(lbl.includes('C') && rIdx<this.SPC_SEAMER_ROW_LABELS.length-1){
        tableHtml += '<tr class="spc-empty-divider"><td colspan="9"></td></tr>';
      }
    });
    tableHtml += '</tbody></table>';
    this.dom.spcSeamerOutputTableWrap.innerHTML = tableHtml;

    for(let i=1;i<=8;i++){
      this.spcSeamerCreateChart('spcSeamerChart'+i, this.SPC_SEAMER_ROW_LABELS, compiledData[i], 'Head '+i, spec);
    }

    this.spcSeamerLastResult = { param: this.spcSeamerParam, compiledData };
    vibrate(10);
    setTimeout(()=>{ this.dom.spcSeamerOutputWrap.scrollIntoView({behavior:'smooth', block:'start'}); }, 60);
  }

  spcSeamerCreateChart(canvasId, labels, data, label, spec){
    const canvas = document.getElementById(canvasId);
    if(!canvas || typeof Chart==='undefined') return;
    const accent = this.spcSeamerGetCssVar('--accent') || '#FF8F1F';
    const labelColor = this.spcSeamerGetCssVar('--label-2') || '#6C6C70';
    const gridColor = this.spcSeamerGetCssVar('--separator') || 'rgba(60,60,67,.22)';
    const ctx = canvas.getContext('2d');
    this.spcSeamerCharts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{
        label, data,
        borderColor: accent, borderWidth: 3, tension: 0.1, fill: false,
        pointBackgroundColor: this.spcSeamerGetCssVar('--bg-elev') || '#fff',
        pointBorderColor: accent, pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: {
            min: spec.minLimit, max: spec.maxLimit,
            title: { display:true, text: spec.title.toUpperCase()+' (mm)', color: labelColor, font: { weight:'700', size:9 } },
            ticks: { stepSize: spec.stepSize, autoSkip:false, color: labelColor, font:{ size:9 }, callback: val=>val.toFixed(2) },
            grid: { color: gridColor, drawBorder:false }
          },
          x: { ticks: { color: labelColor, font:{ weight:'700', size:9 } }, grid: { display:false } }
        },
        plugins: {
          legend: { display:false },
          tooltip: { backgroundColor:'rgba(26,32,44,0.9)', padding:8, borderRadius:8, callbacks:{ label: ctx=>' '+ctx.dataset.label+': '+ctx.parsed.y.toFixed(2)+' mm' } }
        }
      }
    });
  }

  spcSeamerReset(){
    this.dom.spcSeamerInputTableWrap.querySelectorAll('.spc-seamer-input').forEach(inp=>inp.value='');
    this.dom.spcSeamerOutputWrap.classList.add('hidden');
    this.dom.spcSeamerOutputTableWrap.innerHTML = '';
    this.dom.spcSeamerChartsWrap.innerHTML = '';
    Object.keys(this.spcSeamerCharts).forEach(key=>this.spcSeamerCharts[key].destroy());
    this.spcSeamerCharts = {};
    this.spcSeamerLastResult = null;
    vibrate(10);
  }

  /* =========================================================
     SPC SLITTER — port dari app standalone. Tiga parameter beda
     struktur (BB Height/Length pakai toggle Lajur 9; Unsquarness
     pakai layout Kanan/Kiri A/B per pocket). Algoritma simulasi
     tren, pewarnaan status titik (getStatusColor), dan plugin
     garis pembatas pocket di grafik gabungan TIDAK diubah.
     ========================================================= */
  SPC_SLITTER_PARAM_SPECS = {
    height: { title:'Bodyblank Height', basePrefix:107, prefixStr:'107.', minLimit:107.65, maxLimit:107.75, stepSize:0.01, maxStep:0.007, fallbackVal:70 },
    length: { title:'Bodyblank Length', basePrefix:165, prefixStr:'165.', minLimit:165.15, maxLimit:165.25, stepSize:0.01, maxStep:0.007, fallbackVal:20 },
    unsquarness: { title:'Unsquarness', basePrefix:0, prefixStr:'', minLimit:-0.08, maxLimit:0.08, stepSize:0.01, maxStep:0.015, fallbackVal:0 }
  };

  initSpcSlitter(){
    this.initSegmented(this.dom.spcSlitterParamSegmented, this.dom.spcSlitterParamIndicator, (p)=>this.spcSlitterSwitchParam(p), 'data-param');
    this.dom.spcSlitterResetBtn.addEventListener('click', ()=>this.spcSlitterReset());
    this.dom.spcSlitterGenerateBtn.addEventListener('click', ()=>this.spcSlitterGenerate());
    this.dom.spcSlitterPdfBtn.addEventListener('click', ()=>this.openSpcExportForm('slitter'));
    this.dom.spcSlitterLajur9Toggle.addEventListener('change', ()=>this.spcSlitterRenderInputTable());
    this.spcSlitterRegisterPocketDividerPlugin();
    this.spcSlitterRenderInputTable();
  }

  /* Plugin Chart.js kustom: gambar garis putus-putus pembatas antar pocket
     + label "POCKET N" di grafik gabungan Unsquarness (48 titik data).
     Didaftarkan sekali saja secara global ke Chart.js. */
  spcSlitterRegisterPocketDividerPlugin(){
    if(this._pocketDividerRegistered || typeof Chart==='undefined') return;
    this._pocketDividerRegistered = true;
    const self = this;
    Chart.register({
      id: 'pocketDivider',
      afterDraw: (chart)=>{
        if(chart.data.labels.length !== 48) return;
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        ctx.save();
        ctx.strokeStyle = self.spcSeamerGetCssVar('--label-3') || '#a0aec0';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5,5]);
        for(let i=1;i<=5;i++){
          const xPos = (x.getPixelForTick(i*8-1) + x.getPixelForTick(i*8)) / 2;
          ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom); ctx.stroke();
        }
        ctx.fillStyle = self.spcSeamerGetCssVar('--label') || '#4a5568';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        for(let i=0;i<6;i++){
          const tickMid = i*8+3;
          const xPos = x.getPixelForTick(tickMid) + (x.getPixelForTick(tickMid+1)-x.getPixelForTick(tickMid))/2;
          ctx.fillText('POCKET '+(i+1), xPos, top+15);
        }
        ctx.restore();
      }
    });
  }

  spcSlitterSwitchParam(paramKey){
    this.spcSlitterParam = paramKey;
    const spec = this.SPC_SLITTER_PARAM_SPECS[paramKey];
    this.dom.spcSlitterInputTitle.textContent = 'Input ('+spec.title+')';
    this.dom.spcSlitterOutputTitle.textContent = 'Master Preview ('+spec.title+')';
    if(paramKey==='unsquarness'){
      this.dom.spcSlitterLajur9Wrapper.classList.add('hidden');
      this.dom.spcSlitterInstruction.textContent = 'Ketik nilai (contoh: 5 untuk 0.05, -8 untuk -0.08)';
    } else {
      this.dom.spcSlitterLajur9Wrapper.classList.remove('hidden');
      this.dom.spcSlitterInstruction.textContent = 'Ketik 2 digit belakang koma (contoh: 68 untuk '+spec.prefixStr+'68)';
    }
    this.spcSlitterReset();
    this.spcSlitterRenderInputTable();
  }

  /* Proteksi input & pindah fokus otomatis — beda alur per parameter:
     Height/Length turun A->B->C lalu ke lajur berikutnya (menghormati
     toggle Lajur 9); Unsquarness muter KananA->KananB->KiriA->KiriB
     lalu ke pocket berikutnya, dan boleh pakai tanda minus. */
  spcSlitterHandleAutoTab(e){
    if(this.spcSlitterParam==='unsquarness'){
      e.target.value = e.target.value.replace(/[^0-9-]/g,'').replace(/(?!^)-/g,'');
    } else {
      e.target.value = e.target.value.replace(/[^0-9]/g,'');
    }
    const val = e.target.value;
    const targetLength = (this.spcSlitterParam==='unsquarness' && val.includes('-')) ? 3 : 2;
    if(val.length===targetLength){
      const row = e.target.dataset.row, col = parseInt(e.target.dataset.col,10);
      let nextRow='', nextCol=col;
      if(this.spcSlitterParam==='height' || this.spcSlitterParam==='length'){
        const useLajur9 = this.dom.spcSlitterLajur9Toggle.checked;
        const maxCol = useLajur9 ? 9 : 8;
        if(row==='A') nextRow='B';
        else if(row==='B') nextRow='C';
        else if(row==='C'){ if(col<maxCol){ nextRow='A'; nextCol=col+1; } }
      } else if(this.spcSlitterParam==='unsquarness'){
        const maxCol = 6;
        if(row==='KananA') nextRow='KananB';
        else if(row==='KananB') nextRow='KiriA';
        else if(row==='KiriA') nextRow='KiriB';
        else if(row==='KiriB'){ if(col<maxCol){ nextRow='KananA'; nextCol=col+1; } }
      }
      if(nextRow!==''){
        const nextInput = this.dom.spcSlitterInputTableWrap.querySelector('input[data-row="'+nextRow+'"][data-col="'+nextCol+'"]');
        if(nextInput){ nextInput.focus(); nextInput.select(); } else { e.target.blur(); }
      } else { e.target.blur(); }
    }
  }

  spcSlitterRenderInputTable(){
    const spec = this.SPC_SLITTER_PARAM_SPECS[this.spcSlitterParam];
    let html = '<table class="spc-table"><thead><tr><th>Titik</th>';
    if(this.spcSlitterParam==='height' || this.spcSlitterParam==='length'){
      const useLajur9 = this.dom.spcSlitterLajur9Toggle.checked;
      const totalCols = useLajur9 ? 9 : 8;
      for(let i=1;i<=totalCols;i++) html += '<th>L'+i+'</th>';
      html += '</tr></thead><tbody>';
      ['A','B','C'].forEach(point=>{
        const dotClass = point==='A' ? 'spc-slitter-dot-a' : (point==='B' ? 'spc-slitter-dot-b' : 'spc-slitter-dot-c');
        html += '<tr><td class="spc-row-label"><span class="spc-dot '+dotClass+'"></span>'+point+'</td>';
        for(let i=1;i<=totalCols;i++){
          html += '<td><div class="spc-cell-wrap"><span class="spc-cell-prefix">'+spec.prefixStr+'</span>'
            + '<input type="text" class="spc-cell-input spc-slitter-input" data-row="'+point+'" data-col="'+i+'" placeholder="00" inputmode="numeric"></div></td>';
        }
        html += '</tr>';
      });
    } else {
      for(let i=1;i<=6;i++) html += '<th>P'+i+'</th>';
      html += '</tr></thead><tbody>';
      const rows = [{id:'KananA',label:'Kn A'},{id:'KananB',label:'Kn B'},{id:'KiriA',label:'Kr A'},{id:'KiriB',label:'Kr B'}];
      rows.forEach(r=>{
        const dotClass = r.id.includes('A') ? 'spc-slitter-dot-a' : 'spc-slitter-dot-b';
        html += '<tr><td class="spc-row-label"><span class="spc-dot '+dotClass+'"></span>'+r.label+'</td>';
        for(let i=1;i<=6;i++){
          html += '<td><div class="spc-cell-wrap"><input type="text" class="spc-cell-input spc-cell-input-center spc-slitter-input" data-row="'+r.id+'" data-col="'+i+'" placeholder="0" inputmode="text"></div></td>';
        }
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    this.dom.spcSlitterInputTableWrap.innerHTML = html;
    this.dom.spcSlitterInputTableWrap.querySelectorAll('.spc-slitter-input').forEach(inp=>{
      inp.addEventListener('input', (e)=>this.spcSlitterHandleAutoTab(e));
    });
  }

  spcSlitterGetParsedValue(row, col){
    const el = this.dom.spcSlitterInputTableWrap.querySelector('input[data-row="'+row+'"][data-col="'+col+'"]');
    if(!el || el.value==='') return null;
    const spec = this.SPC_SLITTER_PARAM_SPECS[this.spcSlitterParam];
    const rawVal = parseFloat(el.value);
    return this.spcSlitterParam==='unsquarness' ? rawVal/100 : spec.basePrefix + (rawVal/100);
  }

  /* Sama seperti algoritma Seamer, bedanya di sini presisi dibulatkan
     2 desimal (bukan 3) — persis seperti kode aslinya. */
  spcSlitterGenerateStableValue(currentValue, anchor, maxDelta, minSpec, maxSpec){
    const reversionStrength = 0.55;
    const randomNoise = (Math.random() * (maxDelta * 2)) - maxDelta;
    const pullBack = (anchor - currentValue) * reversionStrength;
    let nextVal = currentValue + randomNoise + pullBack;
    if(nextVal < minSpec) nextVal = minSpec + (Math.random() * (maxDelta * 0.4));
    if(nextVal > maxSpec) nextVal = maxSpec - (Math.random() * (maxDelta * 0.4));
    return parseFloat(nextVal.toFixed(2));
  }

  /* Warna status titik di grafik — kuning kalau dekat batas toleransi,
     hijau kalau aman. Ambang batas literal sesuai spesifikasi asli. */
  spcSlitterGetStatusColor(val, param){
    if(val===null || val===undefined) return 'transparent';
    const v = parseFloat(val.toFixed(2));
    if(param==='height'){ if(v<=107.66 || v>=107.74) return '#f1c40f'; return '#2ecc71'; }
    if(param==='length'){ if(v<=165.16 || v>=165.24) return '#f1c40f'; return '#2ecc71'; }
    if(param==='unsquarness'){ if((v>=-0.08 && v<=-0.05) || (v>=0.05 && v<=0.08)) return '#f1c40f'; return '#2ecc71'; }
    return '#2ecc71';
  }

  spcSlitterGenerate(){
    const spec = this.SPC_SLITTER_PARAM_SPECS[this.spcSlitterParam];
    const inputs = this.dom.spcSlitterInputTableWrap.querySelectorAll('.spc-slitter-input');
    const hasData = Array.from(inputs).some(inp=>inp.value!=='');
    if(!hasData){ this.openAlert('Data Kosong', 'Isi data pengukurannya dulu ya, Bos!', [{text:'Oke', style:'cancel'}]); return; }

    this.dom.spcSlitterOutputWrap.classList.remove('hidden');
    this.dom.spcSlitterChartsWrap.innerHTML = '';
    Object.keys(this.spcSlitterCharts).forEach(key=>{ this.spcSlitterCharts[key].destroy(); delete this.spcSlitterCharts[key]; });

    const tableContainer = this.dom.spcSlitterOutputTableWrap;
    const graphContainer = this.dom.spcSlitterChartsWrap;
    const accent = this.spcSeamerGetCssVar('--accent') || '#FF8F1F';

    if(this.spcSlitterParam==='height' || this.spcSlitterParam==='length'){
      const useLajur9 = this.dom.spcSlitterLajur9Toggle.checked;
      const totalCols = useLajur9 ? 9 : 8;
      const labels = ['A1','B1','C1','A2','B2','C2','A3','B3','C3','A4','B4','C4'];
      const compiledData = {};

      let tableHtml = '<table class="spc-table spc-out-table"><thead><tr><th>Titik</th>';
      for(let i=1;i<=totalCols;i++) tableHtml += '<th>L'+i+'</th>';
      tableHtml += '</tr></thead><tbody>';

      for(let i=1;i<=totalCols;i++){
        const fallback = spec.basePrefix + (spec.fallbackVal/100);
        const a1 = this.spcSlitterGetParsedValue('A',i) ?? fallback;
        const b1 = this.spcSlitterGetParsedValue('B',i) ?? fallback;
        const c1 = this.spcSlitterGetParsedValue('C',i) ?? fallback;

        const a2 = this.spcSlitterGenerateStableValue(a1,a1,spec.maxStep,spec.minLimit,spec.maxLimit);
        const a3 = this.spcSlitterGenerateStableValue(a2,a1,spec.maxStep,spec.minLimit,spec.maxLimit);
        const a4 = this.spcSlitterGenerateStableValue(a3,a1,spec.maxStep,spec.minLimit,spec.maxLimit);

        const b2 = this.spcSlitterGenerateStableValue(b1,b1,spec.maxStep,spec.minLimit,spec.maxLimit);
        const b3 = this.spcSlitterGenerateStableValue(b2,b1,spec.maxStep,spec.minLimit,spec.maxLimit);
        const b4 = this.spcSlitterGenerateStableValue(b3,b1,spec.maxStep,spec.minLimit,spec.maxLimit);

        const c2 = this.spcSlitterGenerateStableValue(c1,c1,spec.maxStep,spec.minLimit,spec.maxLimit);
        const c3 = this.spcSlitterGenerateStableValue(c2,c1,spec.maxStep,spec.minLimit,spec.maxLimit);
        const c4 = this.spcSlitterGenerateStableValue(c3,c1,spec.maxStep,spec.minLimit,spec.maxLimit);

        compiledData[i] = [a1,b1,c1,a2,b2,c2,a3,b3,c3,a4,b4,c4];

        graphContainer.insertAdjacentHTML('beforeend',
          '<div class="spc-charts-wrap-item">'
          + '<div class="spc-chart-title">LAJUR '+i+' TREN</div>'
          + '<div class="card spc-chart-card"><div class="spc-chart-canvas-wrap"><canvas id="spcSlitterChart'+i+'"></canvas></div></div>'
          + '</div>'
        );
      }

      labels.forEach((lbl, rIdx)=>{
        if(rIdx<3) return;
        tableHtml += '<tr><td class="spc-out-row-label">'+lbl+'</td>';
        for(let i=1;i<=totalCols;i++) tableHtml += '<td>'+compiledData[i][rIdx].toFixed(2)+'</td>';
        tableHtml += '</tr>';
        if(lbl.includes('C') && rIdx<labels.length-1){
          tableHtml += '<tr class="spc-empty-divider"><td colspan="'+(totalCols+1)+'"></td></tr>';
        }
      });
      tableHtml += '</tbody></table>';
      tableContainer.innerHTML = tableHtml;

      for(let i=1;i<=totalCols;i++){
        this.spcSlitterCreateChart('spcSlitterChart'+i, labels, [{label:'Lajur '+i, data:compiledData[i], color:accent}], spec, false);
      }
      this.spcSlitterLastResult = { param: this.spcSlitterParam, compiledData, useLajur9 };
    } else {
      const compiledData = { KananA:[], KananB:[], KiriA:[], KiriB:[] };
      ['Kanan','Kiri'].forEach(sisi=>{
        for(let i=1;i<=6;i++){
          const a1 = this.spcSlitterGetParsedValue(sisi+'A', i) ?? (spec.fallbackVal/100);
          const b1 = this.spcSlitterGetParsedValue(sisi+'B', i) ?? (spec.fallbackVal/100);
          const aData=[a1], bData=[b1];
          for(let step=0; step<3; step++){
            aData.push(this.spcSlitterGenerateStableValue(aData[step], a1, spec.maxStep, spec.minLimit, spec.maxLimit));
            bData.push(this.spcSlitterGenerateStableValue(bData[step], b1, spec.maxStep, spec.minLimit, spec.maxLimit));
          }
          compiledData[sisi+'A'][i] = aData;
          compiledData[sisi+'B'][i] = bData;
        }
      });

      let tableHtml = '<table class="spc-table spc-out-table"><thead><tr>'
        + '<th>Pocket (Sisi)</th>'
        + '<th>A2</th><th class="spc-block-divider">B2</th>'
        + '<th>A3</th><th class="spc-block-divider">B3</th>'
        + '<th>A4</th><th>B4</th>'
        + '</tr></thead><tbody>';

      for(let p=1;p<=6;p++){
        ['Kanan','Kiri'].forEach(sisi=>{
          const lblName = 'Pocket '+p+' ('+(sisi==='Kanan'?'Kn':'Kr')+')';
          const dataA = compiledData[sisi+'A'][p];
          const dataB = compiledData[sisi+'B'][p];
          tableHtml += '<tr><td class="spc-out-row-label">'+lblName+'</td>';
          for(let step=1; step<4; step++){
            const divClass = step<3 ? ' class="spc-block-divider"' : '';
            tableHtml += '<td>'+dataA[step].toFixed(2)+'</td>';
            tableHtml += '<td'+divClass+'>'+dataB[step].toFixed(2)+'</td>';
          }
          tableHtml += '</tr>';
        });
        if(p<6) tableHtml += '<tr class="spc-empty-divider"><td colspan="7"></td></tr>';
      }
      tableHtml += '</tbody></table>';
      tableContainer.innerHTML = tableHtml;

      ['Kanan','Kiri'].forEach(sisi=>{
        const uLabels=[], chartDataA=[], chartDataB=[];
        for(let i=1;i<=6;i++){
          const rawA = compiledData[sisi+'A'][i];
          const rawB = compiledData[sisi+'B'][i];
          for(let j=0;j<4;j++){
            uLabels.push('A'+(j+1)); chartDataA.push(rawA[j]); chartDataB.push(null);
            uLabels.push('B'+(j+1)); chartDataA.push(null); chartDataB.push(rawB[j]);
          }
        }
        const cId = 'spcSlitterChart_'+sisi+'_merged';
        graphContainer.insertAdjacentHTML('beforeend',
          '<div class="spc-charts-wrap-item">'
          + '<div class="spc-chart-title">GRAFIK GABUNGAN 6 POCKET ('+sisi.toUpperCase()+')</div>'
          + '<div class="card spc-chart-card"><div class="spc-chart-scroll"><div class="spc-chart-canvas-wrap-wide"><canvas id="'+cId+'"></canvas></div></div></div>'
          + '</div>'
        );
        const datasets = [
          { label:'Sisi A', data:chartDataA, color:accent },
          { label:'Sisi B', data:chartDataB, color:'#9b59b6' }
        ];
        setTimeout(()=>{ this.spcSlitterCreateChart(cId, uLabels, datasets, spec, true); }, 50);
      });
      this.spcSlitterLastResult = { param: this.spcSlitterParam, compiledData };
    }

    vibrate(10);
    setTimeout(()=>{ this.dom.spcSlitterOutputWrap.scrollIntoView({behavior:'smooth', block:'start'}); }, 60);
  }

  spcSlitterCreateChart(canvasId, labels, datasetsData, spec, isWideMode){
    const canvas = document.getElementById(canvasId);
    if(!canvas || typeof Chart==='undefined') return;
    const labelColor = this.spcSeamerGetCssVar('--label-2') || '#718096';
    const gridColor = this.spcSeamerGetCssVar('--separator') || 'rgba(203,213,224,.5)';
    const legendColor = this.spcSeamerGetCssVar('--label') || '#4a5568';
    const ctx = canvas.getContext('2d');
    const datasets = datasetsData.map(d=>{
      const pointColors = d.data.map(val=>this.spcSlitterGetStatusColor(val, this.spcSlitterParam));
      return {
        label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.1, fill: false,
        pointBackgroundColor: pointColors, pointBorderColor: '#ffffff', pointBorderWidth: 1.5,
        pointRadius: 5, pointHoverRadius: 7, spanGaps: isWideMode,
        segment: isWideMode ? {
          borderColor: (segCtx)=>{
            if(Math.floor(segCtx.p0DataIndex/8) !== Math.floor(segCtx.p1DataIndex/8)) return 'transparent';
            return d.color;
          }
        } : undefined
      };
    });
    this.spcSlitterCharts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: {
            min: spec.minLimit, max: spec.maxLimit,
            title: { display:true, text: spec.title.toUpperCase()+' (mm)', color:labelColor, font:{weight:'700',size:9} },
            ticks: { stepSize: spec.stepSize, autoSkip:false, color:labelColor, font:{size:9}, callback: val=>val.toFixed(2) },
            grid: { color: gridColor, drawBorder:false }
          },
          x: { ticks: { color:labelColor, font:{weight:'700',size:9} }, grid: { display:false } }
        },
        plugins: {
          legend: { display:true, labels:{ color:legendColor, font:{size:10,weight:'600'}, usePointStyle:true } },
          tooltip: { backgroundColor:'rgba(26,32,44,0.9)', padding:8, borderRadius:8, callbacks:{ label: tctx=>' '+tctx.dataset.label+': '+tctx.parsed.y.toFixed(2) } }
        }
      }
    });
  }

  spcSlitterReset(){
    this.dom.spcSlitterInputTableWrap.querySelectorAll('.spc-slitter-input').forEach(inp=>inp.value='');
    this.dom.spcSlitterOutputWrap.classList.add('hidden');
    this.dom.spcSlitterOutputTableWrap.innerHTML = '';
    this.dom.spcSlitterChartsWrap.innerHTML = '';
    Object.keys(this.spcSlitterCharts).forEach(key=>this.spcSlitterCharts[key].destroy());
    this.spcSlitterCharts = {};
    this.spcSlitterLastResult = null;
    vibrate(10);
  }

  /* =========================================================
     SPC SHEET EXPORT — Seamer & Slitter
     Menulis hasil "Generate Tren" ke spreadsheet SPC_OTB_BARU
     (sheet "SEAMER 52 Warna" / "SLITTER 52 KURMA 107.70") lewat
     Apps Script, lalu generate & download PDF dari sheet itu.
     Export berjalan PER-PARAMETER (sesuai tab aktif saat Generate
     terakhir dijalankan) — cuma kolom parameter itu yang ditulis;
     parameter lain & baris Pengukuran yang tidak dicentang di
     checklist TIDAK disentuh/dihapus.
     ========================================================= */
  openSpcExportForm(appKind){
    const lastResult = appKind==='seamer' ? this.spcSeamerLastResult : this.spcSlitterLastResult;
    if(!lastResult){ this.showToast('Generate Tren dulu sebelum export'); return; }
    const todayStr = new Date().toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'numeric'});
    const h = (appKind==='seamer' ? this._spcSeamerHeaderData : this._spcSlitterHeaderData) || {};
    const checklistHtml = [1,2,3,4].map(k=>
      '<label class="spc-check-row"><input type="checkbox" class="spc-check-input" data-check="'+k+'" checked><span>Pengukuran ke-'+k+'</span></label>'
    ).join('');
    const html = '<div class="dev-login-form">'
      + '<div class="dev-login-field"><label>Tanggal</label><input type="text" id="spcExpTanggal" value="'+todayStr+'"></div>'
      + '<div class="dev-login-field"><label>Design</label><input type="text" id="spcExpDesign" value="'+(h.design||'').replace(/"/g,'&quot;')+'"></div>'
      + '<div class="dev-login-field"><label>Line</label><input type="text" id="spcExpLine" value="'+(h.line||'').replace(/"/g,'&quot;')+'"></div>'
      + '<div class="dev-login-field"><label>Size</label><input type="text" id="spcExpSize" value="'+(h.size||'').replace(/"/g,'&quot;')+'"></div>'
      + '<div class="dev-login-field"><label>Tulis Data Pengukuran Ke-</label><div class="spc-check-list">'+checklistHtml+'</div></div>'
      + '<div class="dev-login-error" id="spcExpError"></div>'
      + '<button class="btn btn-primary" id="spcExpSubmitBtn">Export</button>'
      + '</div>';
    this.openSheet('Export ke Sheet', html, ()=>{
      document.getElementById('spcExpSubmitBtn').addEventListener('click', ()=>this.handleSpcExportSubmit(appKind));
    });
  }

  async handleSpcExportSubmit(appKind){
    const val = id=>document.getElementById(id).value.trim();
    const errEl = document.getElementById('spcExpError');
    errEl.textContent = '';
    const header = { tanggal: val('spcExpTanggal'), design: val('spcExpDesign'), line: val('spcExpLine'), size: val('spcExpSize') };
    const checks = Array.from(document.querySelectorAll('.spc-check-input')).filter(c=>c.checked).map(c=>parseInt(c.dataset.check,10));
    if(checks.length===0){ errEl.textContent = 'Pilih minimal 1 pengukuran.'; return; }
    if(appKind==='seamer') this._spcSeamerHeaderData = header; else this._spcSlitterHeaderData = header;

    if(!window.SPC_SHEETS_WEBAPP_URL || window.SPC_SHEETS_WEBAPP_URL.indexOf('GANTI_')===0){
      errEl.textContent = 'URL Apps Script belum diisi di spc-sheets-config.js (lihat SPC_SHEETS_SETUP.md).';
      return;
    }

    const btn = document.getElementById('spcExpSubmitBtn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span><span>Menulis data ke Sheet…</span>';
    btn.setAttribute('disabled','');

    // Buka tab kosong SEKARANG juga (masih di dalam event klik user) supaya
    // tidak kena popup-blocker browser. URL PDF-nya baru diisi belakangan,
    // setelah server konfirmasi data berhasil ditulis.
    const pdfWindow = window.open('', '_blank');

    try{
      const payload = appKind==='seamer' ? this.buildSpcSeamerPayload(header, checks) : this.buildSpcSlitterPayload(header, checks);
      const res = await fetch(window.SPC_SHEETS_WEBAPP_URL, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if(!data || !data.success || !data.exportUrl) throw new Error(data && data.error ? data.error : 'Respons server tidak valid');

      if(pdfWindow && !pdfWindow.closed){
        pdfWindow.location.href = data.exportUrl;
      } else {
        // Fallback kalau tab sempat diblokir: buka lagi langsung.
        window.open(data.exportUrl, '_blank');
      }

      this.closeSheet();
      this.showToast(data.cellsWritten+' sel tertulis ke Sheet — PDF dibuka di tab baru');
      vibrate(12);
    }catch(err){
      console.error(err);
      if(pdfWindow && !pdfWindow.closed) pdfWindow.close();
      const isNetworkErr = /failed to fetch/i.test(err.message||'');
      errEl.textContent = isNetworkErr
        ? 'Gagal terhubung ke Apps Script. Kemungkinan besar: (1) deployment belum dibuat lewat "Deploy → New deployment" (klik Save saja tidak cukup), atau (2) izin akses deployment bukan "Anyone". Cek SPC_SHEETS_SETUP.md bagian Troubleshooting.'
        : 'Gagal: '+(err.message||'periksa koneksi & URL Apps Script');
      btn.innerHTML = originalHTML;
      btn.removeAttribute('disabled');
    }
  }

  buildSpcSeamerPayload(header, checks){
    const { param, compiledData } = this.spcSeamerLastResult;
    const pockets = {};
    for(let i=1;i<=8;i++) pockets[i] = compiledData[i];
    return { target:'seamer52warna', parameter: param, header, selectedChecks: checks, pockets };
  }

  buildSpcSlitterPayload(header, checks){
    const { param, compiledData, useLajur9 } = this.spcSlitterLastResult;
    if(param==='height' || param==='length'){
      const pockets = {};
      const totalCols = useLajur9 ? 9 : 8;
      for(let i=1;i<=totalCols;i++) pockets[i] = compiledData[i];
      return { target:'slitter52kurma', parameter: param, header, selectedChecks: checks, useLajur9: !!useLajur9, pockets };
    }
    const squareness = { kiri:{}, kanan:{} };
    for(let i=1;i<=6;i++){
      squareness.kiri[i] = { a: compiledData['KiriA'][i], b: compiledData['KiriB'][i] };
      squareness.kanan[i] = { a: compiledData['KananA'][i], b: compiledData['KananB'][i] };
    }
    return { target:'slitter52kurma', parameter:'unsquarness', header, selectedChecks: checks, squareness };
  }

  /* =========================================================
     DEVELOPER MODE ACCESS
     - Ketuk logo aplikasi (brand badge) 5x berturut-turut dalam
       2.5 detik untuk memunculkan form login developer.
     - Login memakai Firebase Authentication (bukan sekadar cek
       string di JS) supaya akses BACA log log benar-benar dibatasi
       lewat Firestore Security Rules di sisi server.
     - Mapping: username "9Fathur_" -> email akun Firebase Auth
       "9fathur_@dscalc.local" (Firebase Auth butuh format email).
       Buat akun ini di Firebase Console > Authentication > Users.
     ========================================================= */
  initDevAccess(){
    let tapCount = 0, tapTimer = null;
    this.dom.brandBadge.addEventListener('click', ()=>{
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(()=>{ tapCount = 0; }, 2500);
      if(tapCount>=5){ tapCount = 0; this.openDevLogin(); }
    });
    this.dom.devRefreshBtn.addEventListener('click', ()=>{ vibrate(6); this.renderDevDashboard(); });
    this.dom.devClearAllBtn.addEventListener('click', ()=>this.handleDevClearAll());
    this.dom.devLogoutBtn.addEventListener('click', ()=>this.closeDevPanel());
  }

  openDevLogin(){
    vibrate(10);
    const html = '<div class="dev-login-form">'
      + '<div class="dev-login-field"><label>Username</label><input type="text" id="devUsername" autocomplete="off" autocapitalize="off"></div>'
      + '<div class="dev-login-field"><label>Password</label><input type="password" id="devPassword" autocomplete="off"></div>'
      + '<div class="dev-login-error" id="devLoginError"></div>'
      + '<button class="btn btn-primary" id="devLoginSubmit">Masuk</button>'
      + '</div>';
    this.openSheet('Developer Access', html, (body)=>{
      body.querySelector('#devLoginSubmit').addEventListener('click', ()=>this.handleDevLogin());
      body.querySelector('#devPassword').addEventListener('keydown', (e)=>{ if(e.key==='Enter') this.handleDevLogin(); });
      body.querySelector('#devUsername').focus();
    });
  }

  async handleDevLogin(){
    const userEl = document.getElementById('devUsername');
    const passEl = document.getElementById('devPassword');
    const errEl = document.getElementById('devLoginError');
    if(!userEl || !passEl) return;
    const user = userEl.value.trim();
    const pass = passEl.value;
    errEl.textContent = '';
    if(!user || !pass){ errEl.textContent = 'Isi username & password.'; return; }
    if(!window.firebaseAuth){ errEl.textContent = 'Firebase belum dikonfigurasi (lihat firebase-config.js).'; return; }
    const email = user.toLowerCase() + '@dscalc.local';
    try{
      await window.firebaseAuth.signInWithEmailAndPassword(email, pass);
      this.closeSheet();
      vibrate(12);
      this.openDevPanel();
    }catch(err){
      errEl.textContent = 'Username atau password salah.';
      vibrate([10,30,10]);
    }
  }

  openDevPanel(){
    this.dom.devPanel.classList.add('show');
    this.initDevToolbar();
    this.renderDevDashboard();
  }
  closeDevPanel(){
    this.dom.devPanel.classList.remove('show');
    if(window.firebaseAuth) window.firebaseAuth.signOut().catch(()=>{});
    vibrate(8);
  }

  /* Batas tampilan: 300 log terbaru sekaligus. Ini jauh di bawah kuota baca
     gratis Firestore (50rb/hari), dan volume total akan otomatis terjaga
     oleh TTL 7 hari (lihat FIREBASE_SETUP.md) jadi jarang akan mepet. */
  DEV_LOG_LIMIT = 300;

  initDevToolbar(){
    if(this._devToolbarReady) return;
    this._devToolbarReady = true;
    this._devStatusFilter = 'all';
    this.dom.devSearchInput.addEventListener('input', ()=>this.renderDevLogList());
    this.initSegmented(this.dom.devStatusSegmented, this.dom.devStatusIndicator, (status)=>{
      this._devStatusFilter = status;
      this.renderDevLogList();
    }, 'data-status');
    requestAnimationFrame(()=>this.layoutIndicator(this.dom.devStatusSegmented, this.dom.devStatusIndicator));
  }

  async renderDevDashboard(){
    this.dom.devDailySummary.innerHTML = '';
    this.dom.devLogListArea.innerHTML = '<div class="empty-state"><p>Memuat data…</p></div>';
    if(!window.firebaseDb){
      this.dom.devLogListArea.innerHTML = '<div class="empty-state"><h4>Firebase belum siap</h4><p>Lengkapi firebase-config.js terlebih dahulu.</p></div>';
      return;
    }
    try{
      const snap = await window.firebaseDb.collection('activity_logs').orderBy('timestamp','desc').limit(this.DEV_LOG_LIMIT).get();
      this._devLogsCache = snap.docs.map(doc=>Object.assign({_id:doc.id}, doc.data()));
      this.renderDevDailySummary();
      this.renderDevLogList();
    }catch(err){
      console.error(err);
      this.dom.devLogListArea.innerHTML = '<div class="empty-state"><h4>Gagal memuat</h4><p>'+(err.message||'Periksa koneksi & Firestore Rules.')+'</p></div>';
    }
  }

  renderDevDailySummary(){
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayStartMs = todayStart.getTime();
    let pass=0, fail=0;
    (this._devLogsCache||[]).forEach(d=>{
      if(d.timestamp>=todayStartMs){ if(d.overallStatus==='pass') pass++; else fail++; }
    });
    const total = pass+fail;
    this.dom.devDailySummary.innerHTML = '<div class="dev-summary">'
      + '<div class="dev-summary-chip"><span class="l">Hari Ini</span><span class="v">'+total+'</span></div>'
      + '<div class="dev-summary-chip"><span class="l">Lolos</span><span class="v pass">'+pass+'</span></div>'
      + '<div class="dev-summary-chip"><span class="l">Gagal</span><span class="v fail">'+fail+'</span></div>'
      + '</div>';
  }

  renderDevLogList(){
    const all = this._devLogsCache || [];
    const term = this.dom.devSearchInput.value.trim().toLowerCase();
    const statusFilter = this._devStatusFilter || 'all';
    const filtered = all.filter(d=>{
      if(statusFilter!=='all' && d.overallStatus!==statusFilter) return false;
      if(!term) return true;
      const haystack = [(d.profileName||''), (d.deviceLabel||''), (d.deviceId||''), (d.headNo!=null?String(d.headNo):'')].join(' ').toLowerCase();
      return haystack.indexOf(term)!==-1;
    });

    if(all.length===0){
      this.dom.devLogListArea.innerHTML = '<div class="empty-state"><h4>Belum ada data</h4><p>Log aktivitas user akan muncul di sini setelah mereka melakukan perhitungan.</p></div>';
      return;
    }
    if(filtered.length===0){
      this.dom.devLogListArea.innerHTML = '<div class="empty-state"><h4>Tidak ketemu</h4><p>Coba ubah kata kunci atau filter status.</p></div>';
      return;
    }

    this.dom.devLogListArea.innerHTML = '<div class="dev-log-count">Menampilkan '+filtered.length+' dari '+all.length+' log'+(all.length>=this.DEV_LOG_LIMIT?' (mungkin ada lebih banyak)':'')+'</div>'
      + filtered.map(d=>{
      const date = new Date(d.timestamp).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
      const inputSummary = Object.entries(d.measurements||{}).map(([k,v])=>k+': '+(Array.isArray(v)?v.join(', '):v)).join(' · ');
      const resultSummary = Object.entries(d.results||{}).map(([k,v])=>k+': '+(typeof v==='number'?v.toFixed(2):v)).join(' · ');
      const statusLabel = d.overallStatus==='pass' ? 'SESUAI STANDAR' : 'DI LUAR STANDAR';
      return '<div class="dev-log-card" data-doc-id="'+d._id+'">'
        + '<button class="dev-log-delete" data-doc-id="'+d._id+'" aria-label="Hapus log ini">'+ICON_TRASH+'</button>'
        + '<div class="dev-log-top">'
        +   '<span class="dev-log-time">'+date+'</span>'
        +   '<span class="dev-log-device">'+(d.deviceLabel||'—')+'</span>'
        +   '<span class="dev-log-status '+d.overallStatus+'">'+statusLabel+'</span>'
        +   (d.wasDelayed ? '<span class="dev-log-status delayed">SEMPAT TERTUNDA</span>' : '')
        + '</div>'
        + '<div class="dev-log-row"><span class="k">Profile</span><span class="v">'+(d.profileName||'—')+(d.headNo?(' · H#'+d.headNo):'')+'</span></div>'
        + '<div class="dev-log-row"><span class="k">Data Input</span><span class="v">'+inputSummary+'</span></div>'
        + '<div class="dev-log-row"><span class="k">Hasil Generate</span><span class="v">'+resultSummary+'</span></div>'
        + '<div class="dev-log-row"><span class="k">Device ID</span><span class="v">'+(d.deviceId||'—')+'</span></div>'
        + '</div>';
    }).join('');

    this.dom.devLogListArea.querySelectorAll('.dev-log-delete').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const docId = btn.dataset.docId;
        this.openAlert('Hapus Log Ini?', 'Data log pengukuran ini akan dihapus permanen dari database.', [
          {text:'Batal', style:'cancel'},
          {text:'Hapus', style:'destructive', onClick:()=>this.handleDevDeleteLog(docId)}
        ]);
      });
    });
  }

  async handleDevDeleteLog(docId){
    if(!window.firebaseAuth || !window.firebaseAuth.currentUser){
      this.openAlert('Sesi Login Habis', 'Login developer-mu sudah tidak aktif. Tutup panel ini dan login ulang, lalu coba hapus lagi.', [{text:'Oke', style:'cancel'}]);
      return;
    }
    try{
      await window.firebaseDb.collection('activity_logs').doc(docId).delete();
      vibrate(10);
      this.renderDevDashboard();
    }catch(err){
      console.error(err);
      this.openAlert('Gagal Menghapus Log', (err.message||'Periksa koneksi.') + '\n\nKalau pesannya soal "permission" / "insufficient permissions", berarti Firestore Rules di Firebase Console belum diupdate untuk mengizinkan hapus — cek ulang FIREBASE_SETUP.md bagian Rules, pastikan sudah di-Publish.', [{text:'Oke', style:'cancel'}]);
    }
  }

  handleDevClearAll(){
    if(!window.firebaseAuth || !window.firebaseAuth.currentUser){
      this.openAlert('Sesi Login Habis', 'Login developer-mu sudah tidak aktif. Tutup panel ini dan login ulang, lalu coba lagi.', [{text:'Oke', style:'cancel'}]);
      return;
    }
    this.openAlert('Hapus SEMUA Log?', 'Seluruh log aktivitas di database akan dihapus permanen dan tidak bisa dikembalikan. Yakin lanjut?', [
      {text:'Batal', style:'cancel'},
      {text:'Hapus Semua', style:'destructive', onClick:async ()=>{
        this.dom.devLogListArea.innerHTML = '<div class="empty-state"><p>Menghapus semua log…</p></div>';
        try{
          let totalDeleted = 0;
          // Hapus per-batch 500 dokumen (batas writeBatch Firestore), diulang
          // sampai koleksinya benar-benar kosong.
          while(true){
            const snap = await window.firebaseDb.collection('activity_logs').limit(500).get();
            if(snap.empty) break;
            const batch = window.firebaseDb.batch();
            snap.docs.forEach(doc=>batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += snap.docs.length;
            if(snap.docs.length<500) break;
          }
          vibrate(12);
          this.showToast(totalDeleted+' log berhasil dihapus');
          this.renderDevDashboard();
        }catch(err){
          console.error(err);
          this.dom.devLogListArea.innerHTML = '<div class="empty-state"><h4>Gagal menghapus</h4><p>'+(err.message||'Periksa koneksi & Firestore Rules.')+'</p></div>';
          this.openAlert('Gagal Menghapus', (err.message||'Periksa koneksi.') + '\n\nKalau pesannya soal "permission", Firestore Rules di Firebase Console belum diupdate untuk mengizinkan hapus.', [{text:'Oke', style:'cancel'}]);
        }
      }}
    ]);
  }

  /* ---------- pickers ---------- */
  openProfilePicker(){
    const profiles = this.storage.getProfiles();
    const activeId = this.storage.getActiveProfileId();
    const html = Object.entries(profiles).map(([id,p])=>
      '<div class="picker-opt" data-id="'+id+'"><span>'+p.name+'</span>'+ICON_CHECK+'</div>'
    ).join('');
    this.openSheet('Pilih Profile', html, (body)=>{
      body.querySelectorAll('.picker-opt').forEach(row=>{
        row.classList.toggle('selected', row.dataset.id===activeId);
        row.addEventListener('click', ()=>{
          this.storage.setActiveProfile(row.dataset.id);
          this.renderAll();
          this.closeSheet();
          vibrate(8);
        });
      });
    });
  }
  openBodyPicker(){
    const html = this.bodyOptions.map(v=>
      '<div class="picker-opt" data-v="'+v+'"><span>'+v+' mm</span>'+ICON_CHECK+'</div>'
    ).join('');
    this.openSheet('Tebal Body', html, (body)=>{
      body.querySelectorAll('.picker-opt').forEach(row=>{
        row.classList.toggle('selected', row.dataset.v===String(this.state.body));
        row.addEventListener('click', ()=>{
          this.state.body = parseFloat(row.dataset.v);
          this.dom.bodyValue.textContent = row.dataset.v;
          this.closeSheet(); vibrate(8);
        });
      });
    });
  }
  openEoePicker(){
    const html = this.eoeOptions.map(v=>
      '<div class="picker-opt" data-v="'+v+'"><span>'+v+' mm</span>'+ICON_CHECK+'</div>'
    ).join('');
    this.openSheet('Tebal EOE', html, (body)=>{
      body.querySelectorAll('.picker-opt').forEach(row=>{
        row.classList.toggle('selected', row.dataset.v===String(this.state.eoe));
        row.addEventListener('click', ()=>{
          this.state.eoe = parseFloat(row.dataset.v);
          this.dom.eoeValue.textContent = row.dataset.v;
          this.closeSheet(); vibrate(8);
        });
      });
    });
  }

  /* ---------- measurement table ---------- */
  buildMeasureTable(){
    const points = this.state.mode==='1' ? 1 : 3;
    const params = ['Seam Thickness','Seam Length','Body Hook','Cover Hook'];
    let head = '<div class="measure-head-row"><span class="measure-head-label">Parameter</span><div class="measure-head-cols">';
    for(let i=0;i<points;i++) head += '<span>Titik '+String.fromCharCode(65+i)+'</span>';
    head += '</div></div>';
    this.dom.measureHead.innerHTML = head;

    let body = params.map(p=>{
      const label = p.replace(' ','<br>');
      const inputs = Array.from({length:points},(_,i)=>
        '<input type="text" inputmode="decimal" class="measure-input" data-param="'+p+'" data-idx="'+i+'" placeholder="0.00">'
      ).join('');
      return '<div class="measure-row"><span class="measure-label">'+label+'</span><div class="measure-inputs">'+inputs+'</div></div>';
    }).join('');
    this.dom.measureBody.innerHTML = body;
    this.attachMeasureInputEvents();
  }
  attachMeasureInputEvents(){
    const inputs = Array.from(this.dom.measureBody.querySelectorAll('.measure-input'));
    inputs.forEach((input, idx)=>{
      input.addEventListener('focus', ()=>{ input.select(); });
      input.addEventListener('input', ()=>{
        let val = input.value;
        if(val.includes(',')){ val = val.replace(',', '.'); input.value = val; }
        if(!/^[0-9.]*$/.test(val)){ input.value = val.replace(/[^0-9.]/g,''); val = input.value; }
        if((val.match(/\./g)||[]).length>1){ input.value = val.substring(0, val.lastIndexOf('.')); val = input.value; }
        if(val.includes('.')){
          const parts = val.split('.');
          if(parts[1].length>2){ val = parts[0]+'.'+parts[1].substring(0,2); input.value = val; }
          if(parts[1].length===2){ if(idx<inputs.length-1) inputs[idx+1].focus(); else input.blur(); }
        }
        this.validateInputLive(input);
      });
    });
  }
  validateInputLive(input){
    const wasFail = input.classList.contains('spec-fail');
    input.classList.remove('spec-fail');
    const standards = this.storage.getActiveProfile().standards;
    const key = input.dataset.param;
    const value = parseFloat(input.value);
    if(isNaN(value) || !standards[key]) return;
    const { min, max } = standards[key];
    if((min!==null && value<min) || (max!==null && value>max)){
      input.classList.add('spec-fail');
      if(!wasFail){ input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); }
    }
  }

  getCalculatorInputs(){
    const measurements = {}; let isEmpty = false;
    this.dom.measureBody.querySelectorAll('.measure-input').forEach(inp=>{
      const param = inp.dataset.param, idx = parseInt(inp.dataset.idx,10);
      if(!measurements[param]) measurements[param] = [];
      if(inp.value.trim()==='') isEmpty = true;
      measurements[param][idx] = parseFloat(inp.value) || 0;
    });
    if(isEmpty){ this.showToast('Lengkapi semua titik pengukuran'); return null; }
    const profileId = this.storage.getActiveProfileId();
    const profileName = this.storage.getProfile(profileId).name;
    return {
      profileId, profileName,
      headNo: this.dom.headNoInput.value.trim(),
      mode: this.state.mode,
      bodyThickness: this.state.body,
      eoeThickness: this.state.eoe,
      measurements
    };
  }

  clearCalculatorInputs(){
    this.dom.measureBody.querySelectorAll('.measure-input').forEach(inp=>{ inp.value=''; inp.classList.remove('spec-fail'); });
    this.dom.headNoInput.value = '';
    this.dom.resultContainer.innerHTML = '';
    vibrate(10);
  }

  /* ---------- calculate ---------- */
  handleCalculate(){
    const inputs = this.getCalculatorInputs();
    if(!inputs) return;
    const btn = this.dom.generateBtn;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span><span>Menghitung…</span>';
    btn.setAttribute('disabled','');
    setTimeout(()=>{
      const profile = this.storage.getActiveProfile();
      const resultData = this.calculator.calculate(inputs, profile.standards);
      resultData.standards = JSON.parse(JSON.stringify(profile.standards));
      this.currentResult = resultData;
      this.storage.addHistory(resultData);
      this.logActivityToFirebase(resultData);
      this.renderResult(resultData);
      btn.innerHTML = originalHTML;
      btn.removeAttribute('disabled');
      vibrate(resultData.overallStatus==='pass' ? [12] : [12,40,12]);
    }, 380);
  }

  /* ---------- render: profile select / list ---------- */
  renderAll(){
    const active = this.storage.getActiveProfile();
    this.dom.profileValue.textContent = active.name;
    this.renderProfileList();
    this.renderSettingsForms();
    if(this.activeView==='history') this.renderHistoryList();
  }

  renderProfileList(){
    const profiles = this.storage.getProfiles();
    const activeId = this.storage.getActiveProfileId();
    this.dom.profileListContainer.innerHTML = Object.entries(profiles).map(([id,p])=>{
      const trailing = id==='default'
        ? '<span class="default-tag">Default</span>'
        : '<button class="icon-btn danger profile-delete-btn" data-id="'+id+'" style="width:30px;height:30px;">'+ICON_MINUS_CIRCLE+'</button>';
      return '<div class="list-row tappable profile-row'+(id===activeId?' active-profile':'')+'" data-id="'+id+'">'
        + '<div class="profile-row-inner"><span class="row-label">'+p.name+'</span>'
        + '<svg class="profile-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>'
        + trailing + '</div>';
    }).join('');

    this.dom.profileListContainer.querySelectorAll('.profile-row').forEach(row=>{
      row.addEventListener('click', (e)=>{
        if(e.target.closest('.profile-delete-btn')) return;
        this.storage.setActiveProfile(row.dataset.id);
        this.renderAll();
        vibrate(6);
      });
    });
    this.dom.profileListContainer.querySelectorAll('.profile-delete-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        this.openAlert('Hapus Profile?', 'Standar dan pengaturan pada profile ini akan dihapus permanen.', [
          {text:'Batal', style:'cancel'},
          {text:'Hapus', style:'destructive', onClick:()=>{ this.storage.deleteProfile(btn.dataset.id); this.renderAll(); }}
        ]);
      });
    });
  }

  handleAddProfile(){
    const name = this.dom.newProfileName.value.trim();
    if(!name) return;
    this.storage.addProfile(name);
    this.dom.newProfileName.value = '';
    this.renderAll();
    vibrate(10);
  }

  /* ---------- settings forms ---------- */
  renderSettingsForms(){
    const profile = this.storage.getActiveProfile();
    if(!profile) return;
    this.dom.editingProfileName.textContent = profile.name;
    const { standards } = profile;
    const build = (keys)=> keys.map(key=>{
      const s = standards[key] || {min:null,max:null};
      return '<div class="setting-item"><label>'+key+'</label><div class="setting-inputs">'
        + '<input type="number" step="0.01" class="mini-field" placeholder="Min" data-key="'+key+'" data-type="min" value="'+(s.min ?? '')+'">'
        + '<span class="field-dash">–</span>'
        + '<input type="number" step="0.01" class="mini-field" placeholder="Max" data-key="'+key+'" data-type="max" value="'+(s.max ?? '')+'">'
        + '</div></div>';
    }).join('');
    this.dom.panelGeneral.innerHTML = build(['Seam Thickness','Seam Length','Body Hook','Cover Hook','%BHB','Freespace']);
    this.dom.panelOverlap.innerHTML = build(['Actual Overlap','% Overlap']);
  }

  handleSaveSettings(){
    const activeId = this.storage.getActiveProfileId();
    const currentProfile = this.storage.getActiveProfile();
    const newStandards = JSON.parse(JSON.stringify(currentProfile.standards));
    document.querySelectorAll('#view-settings input[data-key]').forEach(input=>{
      const { key, type } = input.dataset;
      const val = input.value.trim();
      if(!newStandards[key]) newStandards[key] = {min:null,max:null};
      newStandards[key][type] = val==='' ? null : parseFloat(val);
    });
    this.storage.updateStandards(activeId, newStandards);
    const label = this.dom.saveLabel, icon = this.dom.saveIcon;
    const prevLabel = label.textContent;
    icon.innerHTML = '<path d="M5 13l4 4L19 7"/>';
    label.textContent = 'Tersimpan';
    vibrate(12);
    setTimeout(()=>{ icon.innerHTML = '<path d="M12 5v14M5 12h14"/>'; label.textContent = prevLabel; }, 1400);
  }

  handleResetStandards(){
    this.openAlert('Reset Standar?', 'Nilai toleransi profile ini akan dikembalikan ke pengaturan pabrik.', [
      {text:'Batal', style:'cancel'},
      {text:'Reset', style:'destructive', onClick:()=>{
        const activeId = this.storage.getActiveProfileId();
        this.storage.updateStandards(activeId, this.storage.getDefaultStandards());
        this.renderSettingsForms();
      }}
    ]);
  }

  /* ---------- history ---------- */
  handleClearHistory(){
    this.openAlert('Hapus Semua Riwayat?', 'Seluruh log pengukuran yang tersimpan akan dihapus permanen.', [
      {text:'Batal', style:'cancel'},
      {text:'Hapus Semua', style:'destructive', onClick:()=>{ this.storage.clearHistory(); this.renderHistoryList(); }}
    ]);
  }

  renderHistoryList(){
    const history = this.storage.getHistory();
    if(history.length===0){
      this.dom.historyListContainer.innerHTML =
        '<div class="empty-state">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>'
        + '<h4>Belum Ada Pengukuran</h4><p>Hasil kalkulasi akan muncul di sini.</p></div>';
      return;
    }
    this.dom.historyListContainer.innerHTML = history.map((record, index)=>{
      const date = new Date(record.timestamp).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
      const headText = record.inputs.headNo ? ('H#'+record.inputs.headNo) : '';
      const statusLabel = record.overallStatus==='pass' ? 'LOLOS' : 'GAGAL';
      return '<div class="swipe-wrap" data-timestamp="'+record.timestamp+'">'
        + '<div class="swipe-actions"><button class="swipe-delete" data-timestamp="'+record.timestamp+'">'+ICON_TRASH+'<span>Hapus</span></button></div>'
        + '<div class="swipe-content"><div class="card history-card '+record.overallStatus+'" data-index="'+index+'">'
        + '<div class="history-head"><div class="history-meta"><span class="history-profile">'+record.inputs.profileName+'</span><span class="history-date">'+date+'</span></div>'
        + '<span class="status-pill '+record.overallStatus+'">'+statusLabel+(headText?(' · '+headText):'')+'</span></div>'
        + '<div class="history-details">'+this.generateResultHTML(record, true, index)+'</div>'
        + '</div></div></div>';
    }).join('');

    this.dom.historyListContainer.querySelectorAll('.swipe-content').forEach(el=>this.makeSwipeable(el));
  }

  makeSwipeable(contentEl){
    const wrap = contentEl.closest('.swipe-wrap');
    let startX=0, startY=0, curX=0, dragging=false, decided=false, open=false;
    const OPEN_X = -84;
    const onDown = (e)=>{
      startX = (e.touches?e.touches[0].clientX:e.clientX);
      startY = (e.touches?e.touches[0].clientY:e.clientY);
      dragging=true; decided=false;
    };
    const onMove = (e)=>{
      if(!dragging) return;
      const x = (e.touches?e.touches[0].clientX:e.clientX);
      const y = (e.touches?e.touches[0].clientY:e.clientY);
      const dx = x-startX, dy = y-startY;
      if(!decided){
        if(Math.abs(dx)>Math.abs(dy) && Math.abs(dx)>8) decided='h';
        else if(Math.abs(dy)>8) decided='v';
        else return;
      }
      if(decided!=='h') return;
      let base = open ? OPEN_X : 0;
      let next = base + dx;
      next = Math.max(OPEN_X-16, Math.min(0, next));
      curX = next;
      contentEl.style.transition = 'none';
      contentEl.style.transform = 'translateX('+next+'px)';
    };
    const onUp = ()=>{
      if(!dragging) return;
      dragging=false;
      contentEl.style.transition = '';
      if(decided==='h'){
        if(curX < OPEN_X/2){ contentEl.style.transform='translateX('+OPEN_X+'px)'; open=true; }
        else { contentEl.style.transform='translateX(0)'; open=false; }
      } else if(decided!=='h' && open){
        contentEl.style.transform='translateX(0)'; open=false;
      }
      decided=false;
    };
    contentEl.addEventListener('mousedown', onDown);
    contentEl.addEventListener('touchstart', onDown, {passive:true});
    window.addEventListener('mousemove', onMove);
    contentEl.addEventListener('touchmove', onMove, {passive:true});
    window.addEventListener('mouseup', onUp);
    contentEl.addEventListener('touchend', onUp);

    const delBtn = wrap.querySelector('.swipe-delete');
    delBtn.addEventListener('click', ()=>{
      const ts = parseFloat(wrap.dataset.timestamp);
      wrap.style.transition = 'max-height .3s var(--ease-out), opacity .3s var(--ease-out), margin .3s var(--ease-out)';
      wrap.style.maxHeight = wrap.offsetHeight+'px';
      requestAnimationFrame(()=>{
        wrap.style.maxHeight = '0px';
        wrap.style.opacity = '0';
        wrap.style.marginBottom = '0px';
      });
      vibrate(14);
      setTimeout(()=>{ this.storage.deleteHistoryAt(ts); this.renderHistoryList(); }, 300);
    });
  }

  toggleHistoryDetail(cardEl){
    const wrapper = cardEl.querySelector('.history-details');
    const isOpen = cardEl.classList.contains('expanded');
    document.querySelectorAll('.history-card.expanded').forEach(c=>{
      if(c!==cardEl){ c.classList.remove('expanded'); c.querySelector('.history-details').style.maxHeight = null; }
    });
    if(isOpen){ cardEl.classList.remove('expanded'); wrapper.style.maxHeight = null; }
    else { cardEl.classList.add('expanded'); wrapper.style.maxHeight = wrapper.scrollHeight+'px'; }
  }

  /* ---------- result rendering ---------- */
  generateResultHTML(record, showRaw, historyIndex){
    const { inputs, results, checks, overlapPoints } = record;
    const dataAttr = historyIndex!==undefined && historyIndex!==null ? ('data-history-idx="'+historyIndex+'"') : 'data-is-current="true"';

    const specHTML = '<div class="spec-chip-row">'
      + '<div class="spec-chip"><span class="l">Body</span><span class="v">'+fmt(inputs.bodyThickness)+'</span></div>'
      + '<div class="spec-chip"><span class="l">EOE</span><span class="v">'+fmt(inputs.eoeThickness)+'</span></div>'
      + '<div class="spec-chip"><span class="l">Mode</span><span class="v">'+inputs.mode+'-Pt</span></div>'
      + '</div>';

    let failureHTML = '';
    if(record.overallStatus==='fail'){
      const reasons = this._getFailureDetails(record);
      if(reasons) failureHTML = '<div class="failure-banner">'+ICON_INFO.replace('viewBox="0 0 24 24"','viewBox="0 0 24 24"')+'<span>'+reasons+'</span></div>';
    }

    const items = [
      {k:'Seam Thickness', l:'ST', v:fmt(results['Seam Thickness']), h:false},
      {k:'Seam Length', l:'SL', v:fmt(results['Seam Length']), h:false},
      {k:'Body Hook', l:'BH', v:fmt(results['Body Hook']), h:false},
      {k:'Cover Hook', l:'CH', v:fmt(results['Cover Hook']), h:false},
      {k:'%BHB', l:'BHB', v:fmt(results['%BHB'],0)+'%', h:true, type:'bhb'},
      {k:'Freespace', l:'FS', v:fmt(results['Freespace']), h:true, type:'freespace'}
    ];
    const gridHTML = '<div class="stat-grid">'+items.map(i=>
      '<div class="stat-tile"><span class="l">'+i.l+(i.h?('<span class="help-dot" '+dataAttr+' data-type="'+i.type+'">'+ICON_INFO+'</span>'):'')+'</span>'
      + '<span class="v '+checks[i.k]+'">'+i.v+'</span></div>'
    ).join('')+'</div>';

    let overlapHTML = '<div class="overlap-block">';
    overlapPoints.forEach((p,i)=>{
      overlapHTML += '<div class="overlap-row"><span class="overlap-point">'+p.label+'</span><div class="overlap-metrics">'
        + '<div class="overlap-metric"><small>Actual <span class="help-dot" '+dataAttr+' data-type="actual" data-point="'+i+'">'+ICON_INFO+'</span></small><span class="'+checks['actual_overlap_'+i]+'">'+fmt(p.actual)+'</span></div>'
        + '<div class="overlap-metric"><small>% <span class="help-dot" '+dataAttr+' data-type="percent" data-point="'+i+'">'+ICON_INFO+'</span></small><span class="'+checks['percent_overlap_'+i]+'">'+fmt(p.percent,0)+'%</span></div>'
        + '</div></div>';
    });
    overlapHTML += '<div class="overlap-row summary"><span class="overlap-point avg">AVG</span><div class="overlap-metrics">'
      + '<div class="overlap-metric"><small>Avg Act</small><span class="'+checks['Actual Overlap']+'">'+fmt(results['Actual Overlap'])+'</span></div>'
      + '<div class="overlap-metric"><small>Avg %</small><span class="'+checks['% Overlap']+'">'+fmt(results['% Overlap'],0)+'%</span></div>'
      + '</div></div></div>';

    let rawHTML = '';
    if(showRaw){
      const rawParams = ['Seam Thickness','Seam Length','Body Hook','Cover Hook'];
      rawHTML = '<div class="raw-block"><div class="raw-title">Input Data</div>';
      rawParams.forEach(key=>{
        const values = inputs.measurements[key] || [];
        const valsHTML = values.map(v=>'<span>'+fmt(v)+'</span>').join('<span class="sep">|</span>');
        rawHTML += '<div class="raw-row"><span>'+key+'</span><div class="raw-values">'+valsHTML+'</div></div>';
      });
      rawHTML += '</div>';
    }

    return specHTML+failureHTML+gridHTML+overlapHTML+rawHTML;
  }

  _getFailureDetails(record){
    const { checks, overlapPoints } = record;
    const failures = [];
    Object.entries(checks).forEach(([key,status])=>{
      if(status==='fail'){
        let name = key;
        if(key.startsWith('actual_overlap_')) name = 'Act. Overlap '+overlapPoints[key.split('_').pop()].label;
        else if(key.startsWith('percent_overlap_')) name = '% Overlap '+overlapPoints[key.split('_').pop()].label;
        failures.push(name);
      }
    });
    return failures.length ? 'Perlu perhatian: '+failures.join(', ') : '';
  }

  renderResult(data){
    const statusLabel = data.overallStatus==='pass' ? 'LOLOS' : 'GAGAL';
    const caption = data.overallStatus==='pass' ? 'Seluruh parameter dalam toleransi' : 'Ada parameter di luar toleransi';
    const iconSVG = data.overallStatus==='pass'
      ? '<svg viewBox="0 0 64 64" width="60" height="60" fill="none"><circle class="status-ring" cx="32" cy="32" r="28" stroke="currentColor" stroke-width="3"/><path class="status-check" d="M19 33l8.5 8.5L46 21" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 64 64" width="60" height="60" fill="none"><circle class="status-ring" cx="32" cy="32" r="28" stroke="currentColor" stroke-width="3"/><path class="status-check" d="M21 21l22 22M43 21L21 43" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const html = '<div class="card result-card '+(data.overallStatus==='fail'?'fail-status':'')+'" id="liveResultCard">'
      + '<div class="result-status"><span class="status-icon-wrap">'+iconSVG+'</span>'
      + '<span class="status-title">'+statusLabel+'</span><span class="status-caption">'+caption+'</span></div>'
      + this.generateResultHTML(data, false)
      + '</div>';
    this.dom.resultContainer.innerHTML = html;

    const card = document.getElementById('liveResultCard');
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>card.classList.add('show')); });

    card.querySelectorAll('.stat-tile .v').forEach((el,i)=>{
      const end = parseFloat(el.textContent);
      if(isNaN(end)) return;
      const decimals = el.textContent.includes('%') ? 0 : 2;
      const suffix = el.textContent.includes('%') ? '%' : '';
      animateValue(el, end, decimals, suffix, 120+i*70);
    });
    card.querySelectorAll('.overlap-metric span').forEach((el,i)=>{
      const txt = el.textContent;
      const end = parseFloat(txt);
      if(isNaN(end)) return;
      const decimals = txt.includes('%') ? 0 : 2;
      const suffix = txt.includes('%') ? '%' : '';
      animateValue(el, end, decimals, suffix, 500+i*40);
    });

    setTimeout(()=>{ this.dom.resultContainer.scrollIntoView({behavior:'smooth', block:'start'}); }, 60);
  }

  handleHelpClick(el){
    const type = el.dataset.type;
    const point = el.dataset.point ? parseInt(el.dataset.point) : null;
    let record = null;
    if(el.dataset.isCurrent) record = this.currentResult;
    else { const idx = parseInt(el.dataset.historyIdx); record = this.storage.getHistory()[idx]; }
    if(record) this.showBreakdown(record, type, point);
  }

  showBreakdown(record, type, pointIdx){
    const { inputs, results, overlapPoints } = record;
    const bt = inputs.bodyThickness, et = inputs.eoeThickness, m = inputs.measurements;
    let title='', content='';
    const getAvg = (p)=>results[p];
    const calcDenom = (sl)=> (sl-(2*et+bt)).toFixed(3);

    if(type==='actual'){
      const pt = overlapPoints[pointIdx];
      const sl=m['Seam Length'][pointIdx], bh=m['Body Hook'][pointIdx], ch=m['Cover Hook'][pointIdx];
      title = 'Actual Overlap ('+pt.label+')';
      content = '<div class="formula-card"><span class="formula-label">Formula</span><code class="formula-math">(CH + BH + EOE) - SL</code>'
        + '<span class="formula-label">Angka</span><code class="formula-math">('+fmt(ch)+' + '+fmt(bh)+' + '+fmt(et)+') - '+fmt(sl)+'</code>'
        + '<div class="formula-result"><span class="rl">Hasil</span><span class="rv">'+fmt(pt.actual)+' mm</span></div></div>';
    } else if(type==='percent'){
      const pt = overlapPoints[pointIdx];
      const sl = m['Seam Length'][pointIdx];
      const denom = calcDenom(sl);
      title = '% Overlap ('+pt.label+')';
      content = '<div class="formula-card"><span class="formula-label">Formula</span><code class="formula-math">(Actual / (SL - (2×EOE + Body))) × 100</code>'
        + '<span class="formula-label">Angka</span><code class="formula-math">('+fmt(pt.actual,3)+' / ('+fmt(sl)+' - (2×'+fmt(et)+' + '+fmt(bt)+'))) × 100</code>'
        + '<code class="formula-math">('+fmt(pt.actual,3)+' / '+denom+') × 100</code>'
        + '<div class="formula-result"><span class="rl">Hasil</span><span class="rv">'+fmt(pt.percent,0)+'%</span></div></div>';
    } else if(type==='bhb'){
      const bhAvg = getAvg('Body Hook'), slAvg = getAvg('Seam Length');
      const denom = calcDenom(slAvg);
      title = '% BHb (Avg)';
      content = '<div class="formula-card"><span class="formula-label">Formula</span><code class="formula-math">((BH - Body) / (SL - (2×EOE + Body))) × 100</code>'
        + '<span class="formula-label">Angka</span><code class="formula-math">(('+fmt(bhAvg)+' - '+fmt(bt)+') / ('+fmt(slAvg)+' - (2×'+fmt(et)+' + '+fmt(bt)+'))) × 100</code>'
        + '<code class="formula-math">('+fmt(bhAvg-bt,3)+' / '+denom+') × 100</code>'
        + '<div class="formula-result"><span class="rl">Hasil</span><span class="rv">'+fmt(results['%BHB'],0)+'%</span></div></div>';
    } else if(type==='freespace'){
      const stAvg = getAvg('Seam Thickness');
      title = 'Freespace';
      content = '<div class="formula-card"><span class="formula-label">Formula</span><code class="formula-math">ST - (3×EOE + 2×Body)</code>'
        + '<span class="formula-label">Angka</span><code class="formula-math">'+fmt(stAvg)+' - (3×'+fmt(et)+' + 2×'+fmt(bt)+')</code>'
        + '<code class="formula-math">'+fmt(stAvg)+' - '+fmt(3*et+2*bt,3)+'</code>'
        + '<div class="formula-result"><span class="rl">Hasil</span><span class="rv">'+fmt(results['Freespace'])+' mm</span></div></div>';
    }
    this.openSheet(title, content);
  }
}

document.addEventListener('DOMContentLoaded', ()=>{ new App(); });
})();
