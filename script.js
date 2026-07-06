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
      '%BHB':{min:75,max:null}, 'Freespace':{min:0,max:null},
      'OCH':{min:103.85,max:104.45}, 'Flange Width':{min:2.00,max:2.40},
      'C/S':{min:5.08,max:5.48}, '%TR':{min:75,max:null}
    };
  }
}

/* ============ CALCULATOR (logic unchanged from source) ============ */
class Calculator {
  calculate(inputs, standards){
    const { bodyThickness, eoeThickness, measurements, mode, ochValue } = inputs;
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
    if(avg['Flange Width']!==undefined) results['Flange Width'] = avg['Flange Width'];
    if(avg['C/S']!==undefined) results['C/S'] = avg['C/S'];
    if(avg['%TR']!==undefined) results['%TR'] = avg['%TR'];
    if(ochValue!==undefined && ochValue!==null && ochValue!=='' && !isNaN(parseFloat(ochValue))){
      results['OCH'] = parseFloat(ochValue);
    }

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
      panelGeneral:$('panel-general'), panelOverlap:$('panel-overlap'), panelLainnya:$('panel-lainnya'),
      saveSettingsBtn:$('saveSettingsBtn'), saveIcon:$('saveIcon'), saveLabel:$('saveLabel'), resetStandardsBtn:$('resetStandardsBtn'),
      toast:$('toast'), toastText:$('toastText'),
      sheetBackdrop:$('sheetBackdrop'), sheet:$('sheet'), sheetTitle:$('sheetTitle'), sheetBody:$('sheetBody'), sheetClose:$('sheetClose'), sheetHandleZone:$('sheetHandleZone'),
      alertBackdrop:$('alertBackdrop'), alertBox:$('alertBox'), alertTitle:$('alertTitle'), alertMessage:$('alertMessage'), alertActions:$('alertActions'),
      brandBadge:$('brandBadge'),
      consentGate:$('consentGate'), consentAgreeBtn:$('consentAgreeBtn'), consentDeclineBtn:$('consentDeclineBtn'),
      blockedGate:$('blockedGate'), reconsiderBtn:$('reconsiderBtn'),
      devPanel:$('devPanel'), devPanelBody:$('devPanelBody'), devRefreshBtn:$('devRefreshBtn'), devClearAllBtn:$('devClearAllBtn'), devLogoutBtn:$('devLogoutBtn'),
      modeSelectScreen:$('modeSelectScreen'), pickKalkulatorBtn:$('pickKalkulatorBtn'), pickFormPdfBtn:$('pickFormPdfBtn'), switchModeBtn:$('switchModeBtn'),
      modeToggleRow:$('modeToggleRow'), noHeadRow:$('noHeadRow'), rowHeadCount:$('rowHeadCount'), headCountValue:$('headCountValue'),
      kalkulatorModeView:$('kalkulatorModeView'), formPdfModeView:$('formPdfModeView'),
      formPdfStepLabel:$('formPdfStepLabel'), formPdfWizardBody:$('formPdfWizardBody'),
      formPdfBackBtn:$('formPdfBackBtn'), formPdfNextBtn:$('formPdfNextBtn'),
      formPdfWizardWrap:$('formPdfWizardWrap'), formPdfResultsWrap:$('formPdfResultsWrap')
    };
    this.state = { mode:'3', body:0.16, eoe:0.22 };
    this.bodyOptions = ['0.15','0.16','0.17'];
    this.eoeOptions = ['0.16','0.17','0.18','0.19','0.20','0.21','0.22','0.23','0.24'];
    this.headCountOptions = [4,6,8,12];
    this.appMode = null;
    this.formPdf = {
      headCount: 8,
      stepIndex: 0,
      steps: ['OCH','Flange Width','C/S','Seam Thickness','Seam Length','Body Hook','Cover Hook'],
      data: {},
      results: null
    };
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
    this.initModeSelect();
    this.flushPendingLogs();
    requestAnimationFrame(()=>{ this.layoutIndicator(this.dom.tabSegmented, this.dom.tabIndicator); this.layoutIndicator(this.dom.settingsSegmented, this.dom.settingsIndicator); });
    window.addEventListener('resize', ()=>{ this.layoutIndicator(this.dom.tabSegmented, this.dom.tabIndicator); this.layoutIndicator(this.dom.settingsSegmented, this.dom.settingsIndicator); });
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
    const titles = { calculator:(this.appMode==='formpdf'?'Form PDF':'Kalkulator'), history:'Riwayat', settings:'Atur Standar' };
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
    this.dom.panelLainnya.classList.toggle('hidden', panelId!=='panel-lainnya');
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
      this.dom.modeSelectScreen.classList.add('show');
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
     MODE SELECT (Kalkulator vs Form PDF)
     ========================================================= */
  initModeSelect(){
    const consentStatus = localStorage.getItem('ds_consent');
    if(consentStatus === 'agreed'){
      this.dom.modeSelectScreen.classList.add('show');
    }
    this.dom.pickKalkulatorBtn.addEventListener('click', ()=>this.chooseMode('kalkulator'));
    this.dom.pickFormPdfBtn.addEventListener('click', ()=>this.chooseMode('formpdf'));
    this.dom.switchModeBtn.addEventListener('click', ()=>{ this.dom.modeSelectScreen.classList.add('show'); vibrate(8); });
    this.dom.rowHeadCount.addEventListener('click', ()=>this.openHeadCountPicker());
    this.dom.formPdfNextBtn.addEventListener('click', ()=>this.handleWizardNext());
    this.dom.formPdfBackBtn.addEventListener('click', ()=>this.handleWizardBack());
    // Terapkan tampilan default (Kalkulator) sebelum user memilih apapun
    this.applyMode('kalkulator');
  }

  chooseMode(mode){
    this.appMode = mode;
    this.dom.modeSelectScreen.classList.remove('show');
    this.applyMode(mode);
    if(this.activeView!=='calculator') this.switchView('calculator');
    vibrate(10);
  }

  applyMode(mode){
    const isPdf = mode==='formpdf';
    this.dom.modeToggleRow.classList.toggle('hidden', isPdf);
    this.dom.noHeadRow.classList.toggle('hidden', isPdf);
    this.dom.rowHeadCount.classList.toggle('hidden', !isPdf);
    this.dom.kalkulatorModeView.classList.toggle('hidden', isPdf);
    this.dom.formPdfModeView.classList.toggle('hidden', !isPdf);
    const title = isPdf ? 'Form PDF' : 'Kalkulator';
    if(this.activeView==='calculator'){
      this.dom.largeTitle.textContent = title;
      this.dom.navCompactTitle.textContent = title;
    }
    const firstTabBtn = this.dom.tabSegmented.querySelector('.segmented-opt[data-view="calculator"]');
    if(firstTabBtn){
      const svg = firstTabBtn.querySelector('svg');
      firstTabBtn.innerHTML = '';
      if(svg) firstTabBtn.appendChild(svg);
      firstTabBtn.appendChild(document.createTextNode(title));
    }
    if(isPdf){
      this.resetFormPdfWizard();
      this.renderFormPdfStep();
    }
  }

  /* =========================================================
     FORM PDF — WIZARD MULTI-HEAD
     ========================================================= */
  openHeadCountPicker(){
    const html = this.headCountOptions.map(v=>
      '<div class="picker-opt" data-v="'+v+'"><span>'+v+' Head</span>'+ICON_CHECK+'</div>'
    ).join('');
    this.openSheet('Jumlah Head', html, (body)=>{
      body.querySelectorAll('.picker-opt').forEach(row=>{
        row.classList.toggle('selected', parseInt(row.dataset.v,10)===this.formPdf.headCount);
        row.addEventListener('click', ()=>{
          const newCount = parseInt(row.dataset.v,10);
          if(newCount !== this.formPdf.headCount){
            this.openAlert('Ganti Jumlah Head?', 'Data yang sudah diisi di sesi Form PDF ini akan direset ulang.', [
              {text:'Batal', style:'cancel'},
              {text:'Ganti', style:'destructive', onClick:()=>{
                this.formPdf.headCount = newCount;
                this.dom.headCountValue.textContent = newCount;
                this.resetFormPdfWizard();
                this.renderFormPdfStep();
              }}
            ]);
          }
          this.closeSheet(); vibrate(8);
        });
      });
    });
  }

  resetFormPdfWizard(){
    const n = this.formPdf.headCount;
    const data = {};
    this.formPdf.steps.forEach(step=>{
      if(step==='OCH') data[step] = new Array(n).fill('');
      else data[step] = Array.from({length:n}, ()=>['','','']);
    });
    this.formPdf.data = data;
    this.formPdf.stepIndex = 0;
    this.formPdf.results = null;
    this.dom.formPdfWizardWrap.classList.remove('hidden');
    this.dom.formPdfResultsWrap.classList.add('hidden');
    this.dom.formPdfResultsWrap.innerHTML = '';
  }

  renderFormPdfStep(){
    const step = this.formPdf.steps[this.formPdf.stepIndex];
    const n = this.formPdf.headCount;
    const totalSteps = this.formPdf.steps.length;
    this.dom.formPdfStepLabel.textContent = 'Langkah '+(this.formPdf.stepIndex+1)+' / '+totalSteps+' — '+step;
    this.dom.formPdfBackBtn.style.visibility = this.formPdf.stepIndex===0 ? 'hidden' : 'visible';
    this.dom.formPdfNextBtn.textContent = (this.formPdf.stepIndex===totalSteps-1) ? 'Generate' : 'Lanjut';

    let html = '';
    if(step==='OCH'){
      html = Array.from({length:n}, (_,i)=>
        '<div class="wizard-head-block">'
        + '<div class="wizard-head-title">Head '+(i+1)+'</div>'
        + '<input type="text" inputmode="decimal" class="wizard-single-input" data-step="OCH" data-head="'+i+'" placeholder="0.00" value="'+(this.formPdf.data['OCH'][i] ?? '')+'">'
        + '</div>'
      ).join('');
    } else {
      html = Array.from({length:n}, (_,i)=>{
        const vals = this.formPdf.data[step][i];
        const cols = ['A','B','C'].map((lbl,pIdx)=>
          '<div class="wizard-point-col"><label>'+lbl+'</label>'
          + '<input type="text" inputmode="decimal" data-step="'+step+'" data-head="'+i+'" data-point="'+pIdx+'" value="'+(vals[pIdx] ?? '')+'" placeholder="0.00"></div>'
        ).join('');
        return '<div class="wizard-head-block"><div class="wizard-head-title">Head '+(i+1)+'</div><div class="wizard-point-row">'+cols+'</div></div>';
      }).join('');
    }
    this.dom.formPdfWizardBody.innerHTML = html;
    this.attachWizardInputEvents();
  }

  attachWizardInputEvents(){
    const standards = this.storage.getActiveProfile().standards;
    const inputs = Array.from(this.dom.formPdfWizardBody.querySelectorAll('input'));
    inputs.forEach((input, idx)=>{
      input.addEventListener('focus', ()=>input.select());
      input.addEventListener('input', ()=>{
        let val = input.value;
        if(val.includes(',')){ val = val.replace(',', '.'); input.value = val; }
        if(!/^[0-9.]*$/.test(val)){ input.value = val.replace(/[^0-9.]/g,''); val = input.value; }
        if((val.match(/\./g)||[]).length>1){ val = val.substring(0, val.lastIndexOf('.')); input.value = val; }
        let advance = false;
        if(val.includes('.')){
          const parts = val.split('.');
          if(parts[1].length>2){ val = parts[0]+'.'+parts[1].substring(0,2); input.value = val; }
          if(parts[1].length===2){ advance = true; }
        }
        const step = input.dataset.step, head = parseInt(input.dataset.head,10);
        if(input.dataset.point!==undefined){
          this.formPdf.data[step][head][parseInt(input.dataset.point,10)] = val;
        } else {
          this.formPdf.data[step][head] = val;
        }
        input.classList.remove('spec-fail');
        const num = parseFloat(val);
        const std = standards[step];
        if(!isNaN(num) && std && ((std.min!==null && num<std.min) || (std.max!==null && num>std.max))){
          input.classList.add('spec-fail');
        }
        if(advance){ if(idx<inputs.length-1) inputs[idx+1].focus(); else input.blur(); }
      });
    });
  }

  handleWizardNext(){
    const step = this.formPdf.steps[this.formPdf.stepIndex];
    const complete = step==='OCH'
      ? this.formPdf.data['OCH'].every(v=>v!==''&&v!==undefined)
      : this.formPdf.data[step].every(arr=>arr.every(v=>v!==''&&v!==undefined));
    if(!complete){ this.showToast('Lengkapi semua head sebelum lanjut'); return; }

    if(this.formPdf.stepIndex === this.formPdf.steps.length-1){
      this.handleFormPdfGenerate();
      return;
    }
    this.formPdf.stepIndex++;
    this.renderFormPdfStep();
    this.dom.scrollArea.scrollTo({top:0, behavior:'smooth'});
    vibrate(8);
  }

  handleWizardBack(){
    if(this.formPdf.stepIndex===0) return;
    this.formPdf.stepIndex--;
    this.renderFormPdfStep();
    this.dom.scrollArea.scrollTo({top:0, behavior:'smooth'});
    vibrate(6);
  }

  handleFormPdfGenerate(){
    const n = this.formPdf.headCount;
    const profile = this.storage.getActiveProfile();
    const results = [];
    for(let i=0;i<n;i++){
      const measurements = {};
      ['Flange Width','C/S','Seam Thickness','Seam Length','Body Hook','Cover Hook'].forEach(p=>{
        measurements[p] = this.formPdf.data[p][i].map(v=>parseFloat(v)||0);
      });
      const inputs = {
        profileId: this.storage.getActiveProfileId(),
        profileName: profile.name,
        mode: '3',
        bodyThickness: this.state.body,
        eoeThickness: this.state.eoe,
        ochValue: this.formPdf.data['OCH'][i],
        headIndex: i+1,
        headTotal: n,
        measurements
      };
      const record = this.calculator.calculate(inputs, profile.standards);
      record.standards = JSON.parse(JSON.stringify(profile.standards));
      record.isFormPdf = true;
      results.push(record);
      this.storage.addHistory(record);
      this.logActivityToFirebase(record);
    }
    this.formPdf.results = results;
    this.renderFormPdfResults();
    vibrate([12,30,12]);
  }

  renderFormPdfResults(){
    this.dom.formPdfWizardWrap.classList.add('hidden');
    const wrap = this.dom.formPdfResultsWrap;
    wrap.classList.remove('hidden');
    wrap.innerHTML = this.formPdf.results.map((record,i)=>{
      const statusLabel = record.overallStatus==='pass' ? 'LOLOS' : 'GAGAL';
      return '<div class="head-result-card '+record.overallStatus+'" data-head-idx="'+i+'">'
        + '<div class="head-result-title-row"><span class="head-result-title">Head '+(i+1)+' — '+statusLabel+'</span></div>'
        + this.generateResultHTML(record, false)
        + '<div class="head-result-tr-row"><label>%TR (manual)</label>'
        + '<input type="text" inputmode="decimal" class="head-tr-input" data-head-idx="'+i+'" placeholder="0"></div>'
        + '</div>';
    }).join('')
      + '<button class="btn btn-primary" id="formPdfContinueBtn" style="margin-top:8px;">Lanjut ke Cetak</button>'
      + '<button class="btn btn-plain" id="formPdfBackToWizardBtn" style="margin-top:2px;">Kembali edit data pengukuran</button>';

    wrap.querySelectorAll('.head-tr-input').forEach(input=>{
      input.addEventListener('input', ()=>{
        input.value = input.value.replace(',', '.').replace(/[^0-9.]/g,'');
      });
    });
    document.getElementById('formPdfContinueBtn').addEventListener('click', ()=>this.handleFormPdfContinueToPrint());
    document.getElementById('formPdfBackToWizardBtn').addEventListener('click', ()=>{
      wrap.classList.add('hidden');
      this.dom.formPdfWizardWrap.classList.remove('hidden');
    });
  }

  handleFormPdfContinueToPrint(){
    const wrap = this.dom.formPdfResultsWrap;
    const inputs = wrap.querySelectorAll('.head-tr-input');
    let allFilled = true;
    inputs.forEach(inp=>{
      const idx = parseInt(inp.dataset.headIdx,10);
      const val = inp.value.trim();
      if(val===''){ allFilled = false; return; }
      const record = this.formPdf.results[idx];
      record.results['%TR'] = parseFloat(val);
      const std = record.standards['%TR'];
      record.checks['%TR'] = this.calculator.checkStandard(record.results['%TR'], std);
      if(record.checks['%TR']==='fail') record.overallStatus = 'fail';
    });
    if(!allFilled){ this.showToast('Isi %TR untuk semua head dulu sebelum lanjut'); return; }
    this.openPrintHeaderForm();
  }

  /* =========================================================
     CETAK — FORM HEADER -> PREVIEW -> DOWNLOAD (Sheets + PDF)
     ========================================================= */
  openPrintHeaderForm(){
    const todayStr = new Date().toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'numeric'});
    const h = this.formPdf.headerData || {};
    const field = (id,label,val,required)=>
      '<div class="dev-login-field"><label>'+label+(required?' *':'')+'</label>'
      + '<input type="text" id="'+id+'" value="'+(val||'').replace(/"/g,'&quot;')+'"></div>';
    const html = '<div class="dev-login-form">'
      + '<div class="dev-login-field"><label>Tanggal Periksa/Prod</label><input type="text" id="hfTanggal" value="'+todayStr+'"></div>'
      + field('hfDesign','Design',h.design)
      + field('hfNoSpp','No SPP End/No Lot',h.noSpp)
      + field('hfShift','Shift',h.shift)
      + '<div class="dev-login-field"><label>Body Thickness (otomatis)</label><input type="text" value="'+fmt(this.state.body)+'" disabled></div>'
      + field('hfTglProdEoe','Tgl Prod/Shift End (EOE)',h.tglProdEoe)
      + field('hfLine','Line',h.line)
      + '<div class="dev-login-field"><label>End/EOE Thickness (otomatis)</label><input type="text" value="'+fmt(this.state.eoe)+'" disabled></div>'
      + field('hfFitter','Fitter',h.fitter)
      + field('hfCanSize','Can Size',h.canSize)
      + field('hfLacquer','End/EOE Lacquer In/Out',h.lacquer)
      + field('hfInspector','Inspector',h.inspector)
      + field('hfKodeEoe','Kode EOE ***',h.kodeEoe,true)
      + '<div class="dev-login-field"><label>Catatan (opsional)</label><input type="text" id="hfCatatan" value="'+(h.catatan||'').replace(/"/g,'&quot;')+'"></div>'
      + '<div class="dev-login-error" id="hfError"></div>'
      + '<button class="btn btn-primary" id="hfPreviewBtn">Preview</button>'
      + '</div>';
    this.openSheet('Data Form Cetak', html, ()=>{
      document.getElementById('hfPreviewBtn').addEventListener('click', ()=>this.handlePreviewSubmit());
    });
  }

  handlePreviewSubmit(){
    const val = id=>document.getElementById(id).value.trim();
    const kodeEoe = val('hfKodeEoe');
    const errEl = document.getElementById('hfError');
    if(!kodeEoe){ errEl.textContent = 'Kode EOE *** wajib diisi.'; return; }
    this.formPdf.headerData = {
      tanggal: val('hfTanggal'), design: val('hfDesign'), noSpp: val('hfNoSpp'),
      shift: val('hfShift'), tglProdEoe: val('hfTglProdEoe'), line: val('hfLine'),
      fitter: val('hfFitter'), canSize: val('hfCanSize'), lacquer: val('hfLacquer'),
      inspector: val('hfInspector'), kodeEoe, catatan: val('hfCatatan')
    };
    this.closeSheet();
    this.openPrintPreview();
  }

  openPrintPreview(){
    const h = this.formPdf.headerData;
    const results = this.formPdf.results;
    const passCount = results.filter(r=>r.overallStatus==='pass').length;
    const failCount = results.length - passCount;
    const rows = [
      ['Tanggal', h.tanggal], ['Design', h.design], ['No SPP/Lot', h.noSpp],
      ['Shift', h.shift], ['Tgl Prod EOE', h.tglProdEoe], ['Line', h.line],
      ['Fitter', h.fitter], ['Can Size', h.canSize], ['Lacquer In/Out', h.lacquer],
      ['Inspector', h.inspector], ['Kode EOE ***', h.kodeEoe], ['Catatan', h.catatan||'—']
    ];
    const html = '<div class="raw-block" style="margin:0 0 14px;">'
      + rows.map(r=>'<div class="raw-row"><span>'+r[0]+'</span><span style="font-weight:700;">'+(r[1]||'—')+'</span></div>').join('')
      + '</div>'
      + '<div class="spec-chip-row" style="padding:0 0 14px;">'
      + '<div class="spec-chip"><span class="l">Total Head</span><span class="v">'+results.length+'</span></div>'
      + '<div class="spec-chip"><span class="l">Lolos</span><span class="v" style="color:var(--success);">'+passCount+'</span></div>'
      + '<div class="spec-chip"><span class="l">Gagal</span><span class="v" style="color:var(--danger);">'+failCount+'</span></div>'
      + '</div>'
      + '<div class="dev-login-error" id="dlError"></div>'
      + '<button class="btn btn-primary" id="dlDownloadBtn">Download PDF</button>'
      + '<button class="btn btn-plain" id="dlBackBtn" style="margin-top:4px;">Kembali edit data form</button>';
    this.openSheet('Preview Sebelum Download', html, ()=>{
      document.getElementById('dlDownloadBtn').addEventListener('click', ()=>this.handleDownloadToSheets());
      document.getElementById('dlBackBtn').addEventListener('click', ()=>{ this.closeSheet(); this.openPrintHeaderForm(); });
    });
  }

  buildSheetsPayload(){
    const h = this.formPdf.headerData;
    const profile = this.storage.getActiveProfile();
    const nowTime = new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    const heads = this.formPdf.results.map((record,i)=>{
      const points = {};
      ['Flange Width','C/S','Seam Thickness','Seam Length','Body Hook','Cover Hook'].forEach(p=>{
        points[p] = record.inputs.measurements[p];
      });
      return {
        headNo: i+1,
        jam: nowTime,
        och: record.results['OCH'],
        points,
        avg: {
          'Flange Width': record.results['Flange Width'], 'C/S': record.results['C/S'],
          'Seam Thickness': record.results['Seam Thickness'], 'Seam Length': record.results['Seam Length'],
          'Body Hook': record.results['Body Hook'], 'Cover Hook': record.results['Cover Hook'],
          'Actual Overlap': record.results['Actual Overlap'], '% Overlap': record.results['% Overlap'],
          '%TR': record.results['%TR'], '%BHB': record.results['%BHB'], 'Freespace': record.results['Freespace']
        },
        actOlPoints: record.overlapPoints.map(p=>p.actual),
        percentOlPoints: record.overlapPoints.map(p=>p.percent)
      };
    });
    return {
      header: {
        tglPeriksa: h.tanggal, design: h.design, noSppLot: h.noSpp,
        shift: h.shift, bodyThickness: fmt(this.state.body), tglProdShiftEoe: h.tglProdEoe,
        line: h.line, eoeThickness: fmt(this.state.eoe), fitter: h.fitter,
        canSize: h.canSize, lacquerInOut: h.lacquer, inspector: h.inspector,
        kodeEoe: h.kodeEoe, catatan: h.catatan
      },
      heads,
      standards: profile.standards
    };
  }

  async handleDownloadToSheets(){
    const btn = document.getElementById('dlDownloadBtn');
    const errEl = document.getElementById('dlError');
    errEl.textContent = '';
    if(!window.SHEETS_WEBAPP_URL || window.SHEETS_WEBAPP_URL.indexOf('GANTI_')===0){
      errEl.textContent = 'URL Apps Script belum diisi di sheets-config.js (lihat SHEETS_SETUP.md).';
      return;
    }
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span><span>Mengirim & membuat PDF…</span>';
    btn.setAttribute('disabled','');
    try{
      const payload = this.buildSheetsPayload();
      const res = await fetch(window.SHEETS_WEBAPP_URL, {
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if(!data || !data.pdfBase64) throw new Error(data && data.error ? data.error : 'Respons server tidak valid');

      const byteChars = atob(data.pdfBase64);
      const byteNumbers = new Array(byteChars.length);
      for(let i=0;i<byteChars.length;i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], {type:'application/pdf'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (data.filename || 'DS-Form-'+Date.now()+'.pdf');
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 4000);

      this.closeSheet();
      this.showToast('PDF berhasil didownload & form di Sheets sudah direset');
      vibrate(12);
      // Sesi Form PDF ini selesai — siapkan sesi baru
      this.resetFormPdfWizard();
      this.renderFormPdfStep();
    }catch(err){
      console.error(err);
      errEl.textContent = 'Gagal: '+(err.message||'periksa koneksi & URL Apps Script');
      btn.innerHTML = originalHTML;
      btn.removeAttribute('disabled');
    }
  }

  /* =========================================================
     DEVICE IDENTITY & INFO
     ========================================================= */
  getDeviceId(){
    let id = localStorage.getItem('ds_device_id');
    if(!id){
      id = 'dev_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
      localStorage.setItem('ds_device_id', id);
    }
    return id;
  }
  async getDeviceInfo(){
    const ua = navigator.userAgent || '';
    let os = 'Unknown OS';
    if(/Windows/i.test(ua)) os='Windows';
    else if(/Android/i.test(ua)) os='Android';
    else if(/iPhone|iPad|iPod/i.test(ua)) os='iOS';
    else if(/Mac OS X/i.test(ua)) os='macOS';
    else if(/Linux/i.test(ua)) os='Linux';
    let browser = 'Unknown Browser';
    if(/Edg\//i.test(ua)) browser='Edge';
    else if(/OPR\//i.test(ua)) browser='Opera';
    else if(/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser='Chrome';
    else if(/Firefox\//i.test(ua)) browser='Firefox';
    else if(/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser='Safari';

    // Coba ambil model device ASLI lewat User-Agent Client Hints (Chrome/Edge Android).
    // navigator.userAgent biasa SUDAH DISAMARKAN oleh Chrome sejak versi 110 demi privasi
    // (selalu tampil "Android 10; K"), jadi cuma cara ini yang masih bisa dapat model
    // sungguhan seperti "CPH2797". Tidak tersedia di Safari/iOS — batasan dari Apple.
    let model = '';
    try{
      if(navigator.userAgentData && navigator.userAgentData.getHighEntropyValues){
        const hv = await navigator.userAgentData.getHighEntropyValues(['model']);
        if(hv && hv.model) model = hv.model;
      }
    }catch(e){ /* browser tidak dukung / ditolak — pakai fallback di bawah */ }
    if(!model){
      const m = ua.match(/Android[^;]*;\s*([^)]+)\)/i);
      if(m && m[1]) model = m[1].replace(/\s*Build.*/i,'').trim();
    }
    const label = model ? (os+' · '+model) : (os+' · '+browser);
    return { os, browser, model, label, ua };
  }

  /* =========================================================
     FIREBASE ACTIVITY LOGGING
     - Setiap kali user berhasil generate hasil, sebuah entri log
       dikirim ke koleksi Firestore "activity_logs".
     - Kalau device sedang offline / request gagal, entri disimpan
       dulu di antrian lokal (ds_pending_logs) dan otomatis dicoba
       kirim ulang saat online / saat app dibuka lagi.
     - Setiap log dikasih field "expireAtMillis" (7 hari dari
       sekarang). Saat dikirim ke Firestore, ini dikonversi jadi
       Firestore Timestamp bernama "expireAt" — field inilah yang
       dipakai TTL policy (lihat FIREBASE_SETUP.md) untuk otomatis
       menghapus log setelah 7 hari.
     ========================================================= */
  _queuePendingLog(payload){
    let pending = [];
    try{ pending = JSON.parse(localStorage.getItem('ds_pending_logs')||'[]'); }catch(e){ pending=[]; }
    pending.push(payload);
    if(pending.length>100) pending = pending.slice(-100);
    localStorage.setItem('ds_pending_logs', JSON.stringify(pending));
  }
  _toFirestorePayload(payload){
    const { expireAtMillis, ...rest } = payload;
    rest.expireAt = firebase.firestore.Timestamp.fromMillis(expireAtMillis || (Date.now()+7*24*60*60*1000));
    return rest;
  }
  async flushPendingLogs(){
    if(!window.firebaseDb) return;
    let pending = [];
    try{ pending = JSON.parse(localStorage.getItem('ds_pending_logs')||'[]'); }catch(e){ pending=[]; }
    if(!pending.length) return;
    const remaining = [];
    for(const entry of pending){
      try{
        entry.wasDelayed = true;
        await window.firebaseDb.collection('activity_logs').add(this._toFirestorePayload(entry));
      }catch(e){ remaining.push(entry); }
    }
    localStorage.setItem('ds_pending_logs', JSON.stringify(remaining));
  }
  async logActivityToFirebase(record){
    const device = await this.getDeviceInfo();
    const payload = {
      timestamp: Date.now(),
      expireAtMillis: Date.now() + (7*24*60*60*1000),
      deviceId: this.getDeviceId(),
      deviceLabel: device.label,
      userAgent: device.ua,
      profileName: record.inputs.profileName,
      headNo: record.inputs.headNo || null,
      mode: record.inputs.mode,
      measurements: record.inputs.measurements,
      results: record.results,
      overallStatus: record.overallStatus,
      wasDelayed: false
    };
    if(!window.firebaseDb){ this._queuePendingLog(payload); return; }
    try{
      await window.firebaseDb.collection('activity_logs').add(this._toFirestorePayload(payload));
      this.flushPendingLogs();
    }catch(err){
      console.error('Gagal menyimpan log ke Firebase:', err);
      this._queuePendingLog(payload);
    }
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

  async renderDevDashboard(){
    this.dom.devPanelBody.innerHTML = '<div class="empty-state"><p>Memuat data…</p></div>';
    if(!window.firebaseDb){
      this.dom.devPanelBody.innerHTML = '<div class="empty-state"><h4>Firebase belum siap</h4><p>Lengkapi firebase-config.js terlebih dahulu.</p></div>';
      return;
    }
    try{
      const snap = await window.firebaseDb.collection('activity_logs').orderBy('timestamp','desc').limit(this.DEV_LOG_LIMIT).get();
      if(snap.empty){
        this.dom.devPanelBody.innerHTML = '<div class="empty-state"><h4>Belum ada data</h4><p>Log aktivitas user akan muncul di sini setelah mereka melakukan perhitungan.</p></div>';
        return;
      }
      this.dom.devPanelBody.innerHTML = '<div class="dev-log-count">Menampilkan '+snap.docs.length+' log terbaru'+(snap.docs.length>=this.DEV_LOG_LIMIT?' (mungkin ada lebih banyak)':'')+'</div>'
        + snap.docs.map(doc=>{
        const d = doc.data();
        const date = new Date(d.timestamp).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
        const inputSummary = Object.entries(d.measurements||{}).map(([k,v])=>k+': '+(Array.isArray(v)?v.join(', '):v)).join(' · ');
        const resultSummary = Object.entries(d.results||{}).map(([k,v])=>k+': '+(typeof v==='number'?v.toFixed(2):v)).join(' · ');
        const statusLabel = d.overallStatus==='pass' ? 'SESUAI STANDAR' : 'DI LUAR STANDAR';
        return '<div class="dev-log-card" data-doc-id="'+doc.id+'">'
          + '<button class="dev-log-delete" data-doc-id="'+doc.id+'" aria-label="Hapus log ini">'+ICON_TRASH+'</button>'
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

      this.dom.devPanelBody.querySelectorAll('.dev-log-delete').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          e.stopPropagation();
          const docId = btn.dataset.docId;
          this.openAlert('Hapus Log Ini?', 'Data log pengukuran ini akan dihapus permanen dari database.', [
            {text:'Batal', style:'cancel'},
            {text:'Hapus', style:'destructive', onClick:()=>this.handleDevDeleteLog(docId)}
          ]);
        });
      });
    }catch(err){
      console.error(err);
      this.dom.devPanelBody.innerHTML = '<div class="empty-state"><h4>Gagal memuat</h4><p>'+(err.message||'Periksa koneksi & Firestore Rules.')+'</p></div>';
    }
  }

  async handleDevDeleteLog(docId){
    try{
      await window.firebaseDb.collection('activity_logs').doc(docId).delete();
      vibrate(10);
      this.renderDevDashboard();
    }catch(err){
      console.error(err);
      this.showToast('Gagal menghapus log: '+(err.message||'periksa koneksi'));
    }
  }

  handleDevClearAll(){
    this.openAlert('Hapus SEMUA Log?', 'Seluruh log aktivitas di database akan dihapus permanen dan tidak bisa dikembalikan. Yakin lanjut?', [
      {text:'Batal', style:'cancel'},
      {text:'Hapus Semua', style:'destructive', onClick:async ()=>{
        this.dom.devPanelBody.innerHTML = '<div class="empty-state"><p>Menghapus semua log…</p></div>';
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
          this.dom.devPanelBody.innerHTML = '<div class="empty-state"><h4>Gagal menghapus</h4><p>'+(err.message||'Periksa koneksi & Firestore Rules.')+'</p></div>';
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
    this.dom.panelLainnya.innerHTML = build(['OCH','Flange Width','C/S','%TR']);
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
    if(results['OCH']!==undefined) items.unshift({k:'OCH', l:'OCH', v:fmt(results['OCH']), h:false});
    if(results['Flange Width']!==undefined) items.push({k:'Flange Width', l:'FW', v:fmt(results['Flange Width']), h:false});
    if(results['C/S']!==undefined) items.push({k:'C/S', l:'C/S', v:fmt(results['C/S']), h:false});
    if(results['%TR']!==undefined) items.push({k:'%TR', l:'%TR', v:fmt(results['%TR'],0)+'%', h:false});
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
