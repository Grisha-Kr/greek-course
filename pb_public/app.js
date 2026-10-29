(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Справочники ---------- */
// LETTERS (data/letters.js), WORDS и SPECIAL (data/words.js), PARTS и CHAPTERS (data/chapters.js) подключены отдельными файлами
const INT = [0, 1, 3, 7, 14, 30, 60]; // интервалы повторения по ступеням 0–6, дней
const NEW = 10;      // новых слов за сессию и в плане на день
const QUIZ_N = 20;   // вопросов в тесте слов
const SURE = 4;      // с этой ступени (интервал от двух недель) слово «уверенно»
const PBN = {words:'word_progress', letters:'letter_progress', plans:'plan_days'};
const KEYS = Object.keys(PBN);
const FIELDS = {words:['n','level','due','hard'], letters:['n','known','hard'], plans:['date','tasks','done']};
const MATCH = {words:'n', letters:'n', plans:'date'}; // по какому полю запись единственная у пользователя
const WORD = new Map(WORDS.map(w => [w.n, w]));
const CHS = [...new Set(WORDS.map(w => w.ch))];
const chapter = n => CHAPTERS.find(c => c.n === n);
const chWords = ch => WORDS.filter(w => w.ch === ch);

/* ---------- Значки ---------- */
const svg = (d, cls) => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chev: svg('<path d="M9 5l7 7-7 7"/>', 'chev'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  cards: svg('<rect x="3" y="6" width="13" height="15" rx="2.5"/><path d="M8 3.5h10.5A2.5 2.5 0 0 1 21 6v11"/>'),
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17.2v.1"/>'),
  table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  done: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
  cal: svg('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
};

/* ---------- Состояние ---------- */
const S = {words:[], letters:[], plans:[], invites:[], loaded:false};
const WP = new Map(), LP = new Map(); // прогресс по номеру слова и буквы
const loadLS = (k, d) => { try { const v = localStorage.getItem('gk_'+k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } };
const saveLS = (k, v) => { try { localStorage.setItem('gk_'+k, JSON.stringify(v)); } catch(e){} };
const UI = {hops:0, shown:'', day:'', folds: new Set()};
const pb = new PocketBase(location.origin);
pb.autoCancellation(false);
const me = () => pb.authStore.record || {};
const isAdmin = () => me().role === 'admin';

/* ---------- Тема оформления: auto (как в системе), light, dark ---------- */
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function themePref(){ const t = loadLS('theme', 'auto'); return t === 'light' || t === 'dark' ? t : 'auto'; }
function isDark(){ const t = themePref(); return t === 'dark' || (t === 'auto' && darkMQ.matches); }
function applyTheme(){
  const t = themePref(), root = document.documentElement;
  if(t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', isDark() ? '#1C1916' : '#F4EFE4'));
  $$('[data-act="theme"]').forEach(b => { b.innerHTML = isDark() ? ICON.sun : ICON.moon; b.setAttribute('aria-label', isDark() ? 'Светлая тема' : 'Тёмная тема'); });
}
// Тема запоминается на устройстве и в профиле, чтобы совпадала на телефоне и компьютере
function setTheme(t){
  saveLS('theme', t); applyTheme();
  if(pb.authStore.isValid && me().theme !== t) pb.collection('users').update(me().id, {theme: t}).then(r => pb.authStore.save(pb.authStore.token, r)).catch(() => {});
}
function themeFromUser(){ const t = me().theme; if((t === 'auto' || t === 'light' || t === 'dark') && t !== themePref()){ saveLS('theme', t); applyTheme(); } }
darkMQ.addEventListener && darkMQ.addEventListener('change', () => { if(themePref() === 'auto') applyTheme(); });
applyTheme();

/* ---------- Даты (день считается по часам устройства) ---------- */
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const addDays = (iso, k) => { const [y,m,d] = iso.split('-').map(Number); return isoOf(new Date(y, m-1, d + k)); };
const MONF = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WDF = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const MONN = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONP = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
const WDM = ['пн','вт','ср','чт','пт','сб','вс']; // неделя с понедельника
const monIndex = d => (d.getDay() + 6) % 7;  // 0 = понедельник
const weekStart = () => addDays(todayISO(), -monIndex(new Date())); // понедельник текущей недели
const longDate = () => { const d = new Date(); return `${WDF[d.getDay()]}, ${d.getDate()} ${MONF[d.getMonth()]}`; };
const fmtDay = iso => { if(!iso) return ''; const [y,m,d] = iso.split('-').map(Number); return d + ' ' + MONF[m-1] + (y !== new Date().getFullYear() ? ' ' + y : ''); };
const plural = (n, f) => { n = Math.abs(n) % 100; const n1 = n % 10; if(n > 10 && n < 20) return f[2]; if(n1 > 1 && n1 < 5) return f[1]; if(n1 === 1) return f[0]; return f[2]; };
const WORDS_F = ['слово','слова','слов'], CH_F = ['глава','главы','глав'], DAYS_F = ['день','дня','дней'], LET_F = ['буква','буквы','букв'];
const shuffle = a => { a = [...a]; for(let i = a.length - 1; i > 0; i--){ const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
// «ἄγγελος, -ου, ὁ» → ['ἄγγελος', '-ου, ὁ']
const split = g => { const m = g.match(/^([^,(]+?)\s*(?:,\s*|(?=\())(.*)$/); return m ? [m[1], m[2]] : [g, '']; };
const times = n => `${n.toLocaleString('ru-RU')} ${n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'раза':'раз'}`;
// Поиск без учёта ударений, придыханий, регистра и конечной сигмы
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/ё/g, 'е');

/* ---------- Прогресс слов и букв ---------- */
const today = () => todayISO();
const wRec = n => WP.get(n);
const lRec = n => LP.get(n);
// Состояние слова: new (впереди), hard (трудное), sure (уверенно), learn (в изучении)
function wState(n){ const r = wRec(n); if(!r) return 'new'; if(r.hard) return 'hard'; return (r.level || 0) >= SURE ? 'sure' : 'learn'; }
// Выучено: хотя бы раз «знаю» и сейчас не трудное
const isLearned = n => { const r = wRec(n); return !!r && !r.hard && (r.level || 0) >= 1; };
const isDue = n => { const r = wRec(n); return !!r && r.due <= today(); };
const lettersKnown = () => LETTERS.filter(L => (lRec(L.n) || {}).known).length;
const lettersHard = () => LETTERS.filter(L => (lRec(L.n) || {}).hard).length;
function wordCounts(list){
  const c = {sure:0, learn:0, hard:0, new:0};
  (list || WORDS).forEach(w => c[wState(w.n)]++);
  return c;
}
function reindex(key){
  if(key === 'words'){ WP.clear(); S.words.forEach(r => WP.set(r.n, r)); }
  if(key === 'letters'){ LP.clear(); S.letters.forEach(r => LP.set(r.n, r)); }
}

/* ---------- Главы: что пройдено ---------- */
// Глава со словами пройдена, когда все её слова начаты; глава 3, когда все 24 буквы отмечены «знаю».
// Главы без заданий (1, 2 и главы без слов) пройдены вместе с предыдущей главой с заданиями, главы 1–2 вместе с главой 3.
function chapterDone(n){
  if(n === 3) return lettersKnown() === LETTERS.length;
  if(n < 3) return chapterDone(3);
  const ws = chWords(n);
  if(ws.length) return ws.every(w => wRec(w.n));
  return chapterDone(n - 1);
}
const hasTasks = n => n === 3 || chWords(n).length > 0;
const passedCount = () => CHAPTERS.filter(c => chapterDone(c.n)).length;
const currentChapter = () => CHAPTERS.find(c => hasTasks(c.n) && !chapterDone(c.n)) || CHAPTERS[CHAPTERS.length - 1];

/* ---------- Сохранение: сразу на экране, на сервер через очередь (работает и без интернета) ---------- */
const ID_ABC = 'abcdefghijklmnopqrstuvwxyz0123456789';
function newId(){ const a = new Uint8Array(15); crypto.getRandomValues(a); return Array.from(a, x => ID_ABC[x % 36]).join(''); }
let Q = {};          // ключ «words:12» → {key, id, isNew}
const qKey = () => 'queue_' + me().id;
const cacheKey = () => 'cache_' + me().id;
function pick(key, rec){ const o = {}; for(const f of FIELDS[key]) if(rec[f] !== undefined) o[f] = rec[f]; return o; }
function findLocal(key, val){ return S[key].find(r => r[MATCH[key]] === val); }
function upsertLocal(key, rec){
  const arr = S[key], i = arr.findIndex(x => x.id === rec.id || x[MATCH[key]] === rec[MATCH[key]]);
  if(i >= 0) arr[i] = {...rec}; else arr.push({...rec});
  reindex(key); saveCache(); schedule();
}
// Изменить запись пользователя (слово n, буква n, план на дату): локально сразу, на сервер по очереди
function saveRec(key, val, patch){
  const old = findLocal(key, val);
  // _local: запись создана на устройстве и ещё не дошла до сервера
  const rec = old ? {...old, ...patch} : {id: newId(), user: me().id, [MATCH[key]]: val, created: new Date().toISOString(), _local: true, ...patch};
  upsertLocal(key, rec);
  const qk = key + ':' + val, prev = Q[qk];
  Q[qk] = {key, val, isNew: prev ? prev.isNew : !!rec._local};
  saveLS(qKey(), Q);
  flush();
  return rec;
}
let flushing = false, flushAgain = false;
async function flush(){
  if(flushing){ flushAgain = true; return; }
  flushing = true;
  try {
    for(const qk of Object.keys(Q)){
      const q = Q[qk], rec = findLocal(q.key, q.val);
      if(!rec){ delete Q[qk]; continue; }
      const c = pb.collection(PBN[q.key]), data = pick(q.key, rec);
      try {
        let saved;
        if(q.isNew){
          try { saved = await c.create({...data, id: rec.id, user: me().id}); }
          catch(e){
            if(e.status !== 400) throw e;
            // запись уже создана с другого устройства: берём её и записываем свои изменения поверх
            const srv = await c.getFirstListItem(pb.filter(MATCH[q.key] + ' = {:v}', {v: q.val}));
            saved = await c.update(srv.id, q.key === 'plans' ? mergePlan(srv, rec) : data);
          }
        } else {
          try { saved = await c.update(rec.id, data); }
          catch(e){ if(e.status !== 404) throw e; saved = await c.create({...data, id: rec.id, user: me().id}); }
        }
        // за время запроса запись могла измениться ещё раз: тогда она останется в очереди
        const now = findLocal(q.key, q.val);
        if(Q[qk] === q){
          delete Q[qk];
          S[q.key] = S[q.key].filter(r => r !== now);
          upsertLocal(q.key, saved);
        } else if(Q[qk]){
          Q[qk].isNew = false;
          if(now){ now.id = saved.id; delete now._local; }
        }
        saveLS(qKey(), Q);
      } catch(e){
        if(!e || !e.status){ flushAgain = false; break; } // нет связи: попробуем позже
        delete Q[qk]; saveLS(qKey(), Q);
        toast('Не удалось сохранить: ' + errText(e));
      }
    }
  } finally {
    flushing = false;
    if(flushAgain){ flushAgain = false; flush(); }
  }
}
// Два устройства составили план на один день: оставляем план с сервера, отметки «сделано» объединяем
function mergePlan(srv, mine){
  const doneKeys = new Set((mine.tasks || []).filter(t => t.done).map(t => t.key));
  const tasks = (srv.tasks || []).map(t => doneKeys.has(t.key) ? {...t, done: true} : t);
  return {tasks, done: tasks.every(t => t.done)};
}
let cacheTimer = 0;
function saveCache(){
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => saveLS(cacheKey(), {words: S.words, letters: S.letters, plans: S.plans}), 300);
}
function loadCache(){
  const c = loadLS(cacheKey(), null);
  if(!c) return false;
  KEYS.forEach(k => { S[k] = c[k] || []; reindex(k); });
  return true;
}
const LIST_FILTER = {plans: () => pb.filter('date >= {:d}', {d: addDays(todayISO(), -400)})};
async function loadAll(){
  const res = await Promise.all(KEYS.map(k => pb.collection(PBN[k]).getFullList({batch: 500, ...(LIST_FILTER[k] ? {filter: LIST_FILTER[k]()} : {})})));
  KEYS.forEach((k, n) => {
    // несохранённые изменения из очереди важнее того, что пришло с сервера
    const pending = Object.values(Q).filter(q => q.key === k).map(q => findLocal(k, q.val)).filter(Boolean);
    S[k] = res[n].filter(r => !pending.some(p => p[MATCH[k]] === r[MATCH[k]])).concat(pending);
    reindex(k);
  });
  saveCache();
  schedule();
}
let subscribed = false;
async function subscribeAll(){
  if(subscribed) return; subscribed = true;
  await pb.collection('users').subscribe(me().id, e => { if(e.action === 'update'){ pb.authStore.save(pb.authStore.token, e.record); themeFromUser(); schedule(); } });
  for(const k of KEYS){
    await pb.collection(PBN[k]).subscribe('*', e => {
      const val = e.record[MATCH[k]];
      if(Q[k + ':' + val]) return; // своё изменение ещё в пути
      if(e.action === 'delete'){ S[k] = S[k].filter(r => r.id !== e.record.id); reindex(k); saveCache(); schedule(); }
      else upsertLocal(k, e.record);
    });
  }
}
const setWord = (n, patch) => saveRec('words', n, patch);
const setLetter = (n, patch) => saveRec('letters', n, patch);

/* ---------- План на сегодня ---------- */
// Задания: review: слова с подошедшим сроком, new: следующие 10 новых слов по порядку учебника,
// alphabet: карточки трудных и ещё не выученных букв. План составляется при первом открытии дня и хранится в plan_days.
const TASK_ORDER = ['review', 'new', 'alphabet'];
const todayPlan = () => S.plans.find(p => p.date === today());
function taskDeck(t){
  if(t.key === 'review') return WORDS.filter(w => isDue(w.n));
  if(t.key === 'new') return (t.words || []).map(n => WORD.get(n)).filter(w => w && (!wRec(w.n) || isDue(w.n)));
  if(t.key === 'alphabet') return LETTERS.filter(L => { const r = lRec(L.n); return !r || !r.known || r.hard; });
  return [];
}
function buildPlan(){
  const tasks = [];
  const due = taskDeck({key: 'review'}).length;
  if(due) tasks.push({key: 'review', count: due, done: false});
  const next = WORDS.filter(w => !wRec(w.n)).slice(0, NEW).map(w => w.n);
  if(next.length) tasks.push({key: 'new', words: next, done: false});
  const abc = taskDeck({key: 'alphabet'}).length;
  if(abc) tasks.push({key: 'alphabet', count: abc, done: false});
  return tasks;
}
// Составить план на сегодня, если его ещё нет; отметить задания, которые уже нечего делать
function checkPlan(){
  if(!UI.ready || !pb.authStore.isValid) return;
  const p = todayPlan();
  if(!p){ const tasks = buildPlan(); saveRec('plans', today(), {tasks, done: tasks.length === 0}); return; }
  if((p.tasks || []).some(t => !t.done && !taskDeck(t).length)){
    const tasks = p.tasks.map(t => !t.done && !taskDeck(t).length ? {...t, done: true} : t);
    saveRec('plans', today(), {tasks, done: tasks.every(t => t.done)});
  }
}
function markTask(key, count){
  const p = todayPlan(); if(!p) return;
  const tasks = (p.tasks || []).map(t => t.key === key ? {...t, done: true, ...(count ? {count} : {})} : t);
  saveRec('plans', today(), {tasks, done: tasks.every(t => t.done)});
}
const nextTask = () => { const p = todayPlan(); return p && (p.tasks || []).find(t => !t.done); };
function chRange(ns){
  const chs = [...new Set(ns.map(n => (WORD.get(n) || {}).ch).filter(Boolean))];
  if(!chs.length) return '';
  return chs.length === 1 ? `глава ${chs[0]}` : `главы ${chs[0]}–${chs[chs.length - 1]}`;
}
function taskInfo(t){
  const n = t.done ? (t.count || (t.words || []).length) : t.key === 'new' ? (t.words || []).length : taskDeck(t).length;
  if(t.key === 'review') return {title: `Слова к повторению · ${n}`, min: Math.max(1, Math.ceil(n * 8 / 60)), href: '#/task/review'};
  if(t.key === 'new') return {title: `Новые слова, ${chRange(t.words || [])} · ${n}`, min: Math.max(2, Math.ceil(n * 25 / 60)), href: '#/task/new'};
  return {title: 'Алфавит', sub: `трудные и невыученные: ${n} ${plural(n, LET_F)}`, min: Math.max(2, Math.ceil(n * 8 / 60)), href: '#/task/alphabet'};
}
// День в календаре: full: план выполнен полностью, half: сделано хотя бы одно задание, '': занятий не было
function dayState(p){
  if(!p) return '';
  const t = p.tasks || [];
  if(p.done && t.length) return 'full';
  return t.some(x => x.done) ? 'half' : '';
}
const planMap = () => new Map(S.plans.map(p => [p.date, p]));
// Дней подряд с выполненным планом: считаем от сегодня, а если сегодня ещё не выполнен, от вчера
function streak(){
  const done = new Set(S.plans.filter(p => p.done).map(p => p.date));
  let d = done.has(today()) ? today() : addDays(today(), -1), n = 0;
  while(done.has(d)){ n++; d = addDays(d, -1); }
  return n;
}

/* ---------- Запуск ---------- */
async function boot(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const invite = new URLSearchParams(location.search).get('invite');
  if(invite) history.replaceState(null, '', location.pathname + location.hash);
  if(!pb.authStore.isValid){ showAuth(invite ? 'register' : 'login', invite); return; }
  try { await pb.collection('users').authRefresh(); }
  catch(e){ if(e && e.status && e.status !== 0){ pb.authStore.clear(); showAuth('login'); return; } }
  startApp();
}
async function startApp(){
  $('#auth').hidden = true; $('#app').hidden = false;
  themeFromUser();
  Q = loadLS(qKey(), {});
  UI.day = today();
  // сначала то, что сохранено на устройстве: приложение открывается и без интернета
  if(loadCache()) S.loaded = true;
  render(true);
  try {
    await loadAll();
    S.loaded = true; UI.ready = true; $('#notice').hidden = true; render(true);
    if(route().name === 'profile') loadProfileExtras();
    flush();
    subscribeAll().catch(() => {});
  } catch(e){
    // без связи план составляется по прогрессу, сохранённому на устройстве
    if(S.loaded){ UI.ready = true; schedule(); }
    if(S.loaded) showNotice('Нет связи с сервером. Прогресс сохранится на устройстве и отправится, когда связь вернётся.');
    else showNotice('Не удалось загрузить данные. ' + errText(e));
  }
}
// Новый день по часам устройства: план пересчитывается
function checkDay(){
  if(!S.loaded || UI.day === today()) return;
  UI.day = today();
  if(['home', 'task'].includes(route().name)) render(true); else schedule();
}
setInterval(checkDay, 30e3);
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  checkUpdate(); checkDay();
  if(S.loaded && pb.authStore.isValid){ flush(); loadAll().catch(() => {}); }
});
window.addEventListener('online', () => { $('#notice').hidden = true; if(S.loaded){ flush(); loadAll().catch(() => {}); } });
window.addEventListener('offline', () => showNotice('Нет подключения к интернету. Прогресс сохранится на устройстве и отправится, когда связь вернётся.'));

/* ---------- Проверка новой версии ---------- */
// Сравниваем ?v= у app.js и app.css в открытой странице и в свежем index.html с сервера
const verOf = html => (html.match(/\/app\.(?:js|css)\?v=\d+/g) || []).sort().join(' ');
const MY_VER = verOf(document.documentElement.innerHTML);
let lastCheck = 0;
async function checkUpdate(){
  if(!navigator.onLine || Date.now() - lastCheck < 60e3) return;
  lastCheck = Date.now();
  try {
    const res = await fetch('/index.html', {cache: 'no-store'});
    if(!res.ok) return;
    const v = verOf(await res.text());
    if(v && MY_VER && v !== MY_VER) $('#update-bar').hidden = false;
  } catch(e){}
}
setInterval(checkUpdate, 30*60e3);
$('#update-btn').addEventListener('click', () => location.reload());
$('#update-close').addEventListener('click', () => { $('#update-bar').hidden = true; });
function showNotice(text){ $('#notice-text').textContent = text; $('#notice').hidden = false; }

/* ---------- Адреса экранов: #/ сегодня, #/task/КЛЮЧ задание плана, #/course, #/ch/N глава, #/abc алфавит,
   #/dict словарь, #/words?r=ДИАПАЗОН&m=quiz карточки и тест слов, #/progress, #/profile ---------- */
function route(){
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return {name: parts[0] || 'home', id: parts[1] || '', q: new URLSearchParams(q || '')};
}
const go = (hash, replace) => { if(replace) location.replace(hash); else location.hash = hash; };
function goBack(fallback){ if(UI.hops > 0) history.back(); else go(fallback, true); }
window.addEventListener('hashchange', () => { UI.hops++; render(true); window.scrollTo(0, 0); });

/* ---------- Отрисовка ---------- */
// still: экран с карточками, тестом или поиском не перерисовывается от изменений данных, только при переходе
const VIEWS = {
  home: {f: vHome}, task: {f: vTask, init: initTask, still: true},
  course: {f: vCourse}, ch: {f: vChapter}, abc: {f: vAbc, init: initAbc, still: true},
  dict: {f: vDict, init: initDict, still: true}, words: {f: vWords, init: initWords, still: true},
  progress: {f: vProgress}, profile: {f: vProfile},
};
const TAB = {home:'today', task:'today', course:'course', ch:'course', abc:'course', dict:'dict', words:'dict', progress:'progress'};
let raf = 0;
function schedule(){ if(raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render(force){
  const r = route();
  $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.tab === TAB[r.name] ? 'page' : 'false'));
  const m = $('#main');
  if(!S.loaded){ m.innerHTML = '<div class="loading">Загружаю…</div>'; return; }
  checkPlan();
  const v = VIEWS[r.name] || VIEWS.home;
  if(v.still && !force && UI.shown === location.hash) return;
  m.innerHTML = v.f(r);
  UI.shown = location.hash;
  v.init && v.init(r);
}
const initial = u => (String(u.name || u.email || '?').trim()[0] || '?').toUpperCase();
// Кружок профиля: фото или первая буква имени
const avatarInner = u => { const src = avatarSrc(u); return src ? `<img src="${esc(src)}" alt="">` : esc(initial(u)); };
const backLink = (href, text) => `<a class="backlink" href="${href}" data-back="${href}">${ICON.back}<span>${esc(text)}</span></a>`;
const headActs = () => `<div class="head-acts"><button type="button" class="round" data-act="theme" aria-label="${isDark() ? 'Светлая тема' : 'Тёмная тема'}">${isDark() ? ICON.sun : ICON.moon}</button><a class="me" href="#/profile" aria-label="Профиль" data-av>${avatarInner(me())}</a></div>`;
const head = (title, sub) => `<header class="head"><div class="head-t"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${headActs()}</header>`;
const subHead = (href, text, title, sub) => `<div class="nav-head">${backLink(href, text)}${headActs()}</div><header class="sub-head"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</header>`;
const bar = (part, total, cls) => `<div class="pbar${cls ? ' ' + cls : ''}"><i style="width:${total ? Math.round(part / total * 100) : 0}%"></i></div>`;

/* ---------- Сегодня ---------- */
function vHome(){
  const p = todayPlan(), tasks = p ? (p.tasks || []).slice().sort((a, b) => TASK_ORDER.indexOf(a.key) - TASK_ORDER.indexOf(b.key)) : [];
  const done = tasks.filter(t => t.done).length, cur = tasks.find(t => !t.done);
  const left = tasks.filter(t => !t.done).reduce((a, t) => a + taskInfo(t).min, 0);
  const st = streak();
  let planCard;
  if(!tasks.length) planCard = `<section class="card plan"><h2>План на сегодня</h2><p class="lead">На сегодня заданий нет: все слова и буквы пройдены, повторять пока нечего. Загляните завтра.</p></section>`;
  else planCard = `<section class="card plan">
      <div class="plan-top"><h2>План на сегодня</h2><span class="muted">${done} из ${tasks.length}</span></div>
      <div class="segs" aria-hidden="true">${tasks.map(t => `<i class="${t.done ? 'on' : ''}"></i>`).join('')}</div>
      ${cur ? `<p class="lead">Около ${left} мин</p><a class="btn primary big" href="${taskInfo(cur).href}">Продолжить</a>`
        : `<p class="lead ok">${ICON.check}План на сегодня выполнен${st > 1 ? `, ${st} ${plural(st, DAYS_F)} подряд` : ''}.</p>`}
      <ol class="tasks">${tasks.map(t => { const i = taskInfo(t), on = t === cur;
        return `<li><a class="task${t.done ? ' done' : ''}${on ? ' cur' : ''}" href="${i.href}">
          <span class="tick" aria-hidden="true">${t.done ? ICON.check : ''}</span>
          <span class="tt"><b>${esc(i.title)}</b>${i.sub && !t.done ? `<small>${esc(i.sub)}</small>` : ''}</span>
          <span class="tm">${t.done ? 'сделано' : i.min + ' мин'}</span></a></li>`; }).join('')}</ol>
    </section>`;
  return `${head('Сегодня', longDate())}<div class="cols"><div class="col">${planCard}</div><div class="col">${chapterCard()}</div></div>`;
}
function chapterCard(){
  const c = currentChapter(), passed = passedCount(), learned = WORDS.filter(w => isLearned(w.n)).length;
  const href = c.n === 3 ? '#/abc' : '#/ch/' + c.n;
  return `<section class="card chap-card">
    <span class="kicker">Сейчас</span>
    <a class="chap-link" href="${href}"><h2>Глава ${c.n}</h2><span>${esc(c.t)}</span></a>
    <div class="meter"><div class="meter-t"><span>Курс</span><b>${passed} ${plural(passed, CH_F)} из ${CHAPTERS.length}</b></div>${bar(passed, CHAPTERS.length)}</div>
    <div class="meter"><div class="meter-t"><span>Слова минимума</span><b>${learned} из ${WORDS.length}</b></div>${bar(learned, WORDS.length, 'good')}</div>
  </section>`;
}

/* ---------- Задание плана ---------- */
function vTask(r){
  const p = todayPlan(), t = p && (p.tasks || []).find(x => x.key === r.id);
  if(!t) return `${subHead('#/', 'Сегодня', 'Задание')}<section class="card"><p>Этого задания сегодня нет в плане.</p><a class="btn" href="#/">К плану</a></section>`;
  const i = taskInfo(t);
  if(t.key === 'alphabet') return `${subHead('#/', 'Сегодня', 'Алфавит', 'Карточки трудных и ещё не выученных букв')}<div class="trainer">${abcCardsHTML(true)}</div>`;
  return `${subHead('#/', 'Сегодня', esc(i.title.replace(/ · \d+$/, '')), t.key === 'new' ? 'Новые слова по порядку учебника' : 'Слова, у которых подошёл срок повторения')}<div class="trainer">${wCardsHTML(true)}</div>`;
}
function initTask(r){
  const p = todayPlan(), t = p && (p.tasks || []).find(x => x.key === r.id);
  if(!t) return;
  if(t.key === 'alphabet') startAbcCards(t); else startWCards(t);
}
// Экран «задание выполнено» и переход к следующему
function taskDoneHTML(text){
  const nt = nextTask();
  return `<div class="done-box"><span class="done-ic">${ICON.done}</span><p>${text}</p>
    <div class="row center">${nt ? `<a class="btn primary" href="${taskInfo(nt).href}">Следующее задание</a><a class="btn" href="#/">К плану</a>` : `<a class="btn primary" href="#/">К плану</a>`}</div></div>`;
}

/* ---------- Курс ---------- */
function chapterRow(c){
  const ws = chWords(c.n), d = chapterDone(c.n);
  let sub = `с. ${c.p}`;
  if(c.n === 3) sub += ` · знаю ${lettersKnown()} из ${LETTERS.length} букв`;
  else if(ws.length) sub += ` · ${ws.length} ${plural(ws.length, WORDS_F)}, выучено ${ws.filter(w => isLearned(w.n)).length}`;
  return `<a class="ch-row${d ? ' passed' : ''}" href="${c.n === 3 ? '#/abc' : '#/ch/' + c.n}"><span class="num">${c.n}</span>
    <span class="tt"><b>${esc(c.t)}</b><small>${sub}</small></span>${d ? `<span class="ok-ic" aria-label="пройдена">${ICON.check}</span>` : ICON.chev}</a>`;
}
function vCourse(){
  const passed = passedCount();
  return `${head('Курс', `Маунс, «Основы библейского греческого языка» · пройдено ${passed} из ${CHAPTERS.length}`)}
    <div class="parts">${PARTS.map(p => `<section class="card part"><h2><span>Часть ${p.n}</span>${esc(p.t)}</h2>
      <div class="ch-list">${CHAPTERS.filter(c => c.n >= p.from && c.n <= p.to).map(chapterRow).join('')}</div></section>`).join('')}</div>
    <p class="hint">Сейчас в главах есть алфавит (глава 3) и слова лексического минимума. Объяснения, таблицы окончаний и упражнения из рабочей тетради появятся позже.</p>`;
}
function vChapter(r){
  const c = chapter(Number(r.id));
  if(!c) return `${subHead('#/course', 'Курс', 'Глава не найдена')}`;
  const ws = chWords(c.n), learned = ws.filter(w => isLearned(w.n)).length;
  const words = ws.length ? `<section class="card"><div class="plan-top"><h2>Слова главы</h2><span class="muted">выучено ${learned} из ${ws.length}</span></div>${bar(learned, ws.length, 'good')}
      <div class="row"><a class="btn primary" href="#/words?r=c:${c.n}">${ICON.cards}Карточки</a><a class="btn" href="#/words?r=c:${c.n}&m=quiz">${ICON.quiz}Тест</a></div></section>`
    : `<section class="card"><p class="lead">В этой главе нет слов лексического минимума.</p></section>`;
  return `${subHead('#/course', 'Курс', `Глава ${c.n}. ${esc(c.t)}`, `Учебник, с. ${c.p}`)}
    <div class="cols"><div class="col">${words}
      <p class="hint">Остальное содержимое главы (объяснения, таблицы, упражнения из рабочей тетради) появится позже.</p></div>
    <div class="col">${ws.length ? `<section class="card flat">${wordTable(ws)}</section>` : ''}</div></div>`;
}

/* ---------- Словарь ---------- */
const DOT = {sure: 'k', learn: 's', hard: 'h', new: ''};
function wordTable(list){
  return `<table class="words"><thead><tr><th>Слово</th><th>Перевод</th><th class="r">НЗ</th></tr></thead><tbody>${list.map(w => { const [h, f] = split(w.g);
    return `<tr><td class="wgt"><span class="wh"><span class="dot ${DOT[wState(w.n)]}"></span>${h}</span>${f ? `<div class="wforms">${f}</div>` : ''}</td><td>${esc(w.ru)}</td><td class="fr">${w.f.toLocaleString('ru-RU')}</td></tr>`; }).join('')}</tbody></table>`;
}
function vDict(){
  const q = loadLS('dict_q', ''), c = loadLS('dict_ch', 'all');
  return `${head('Словарь', `Лексический минимум, главы 4–36 · ${WORDS.length} слов`)}
    <div class="cols"><div class="col">
      <div class="dict-tools">
        <input class="inp" id="d-q" type="search" placeholder="Поиск по-гречески или по-русски" autocomplete="off" value="${esc(q)}">
        <select class="inp" id="d-ch" aria-label="Глава"><option value="all">Все главы</option>${CHS.map(n => `<option value="${n}"${String(n) === String(c) ? ' selected' : ''}>Глава ${n}</option>`).join('')}</select>
        <div class="row"><a class="btn primary" id="d-cards" href="#/words">${ICON.cards}Карточки</a><a class="btn" id="d-quiz" href="#/words?m=quiz">${ICON.quiz}Тест</a></div>
      </div>
      <p class="meta" id="d-count"></p>
      <div id="d-list"></div>
    </div><div class="col">
      <section class="card rules"><h3>Особые формы</h3><ul>${SPECIAL.map(s => `<li><span class="gr">${s.g}</span>: ${esc(s.ru)}. В НЗ ${times(s.f)}, гл. ${s.ch}, с. ${s.p}.</li>`).join('')}</ul>
        <p class="src">Маунс даёт их в лексическом минимуме отдельно, в счёт 320 слов они не входят.</p></section>
      <section class="card rules"><h3>Как работает повторение</h3><ul>
        <li>За одну сессию добавляется 10 новых слов, по порядку учебника.</li>
        <li>«Знаю» отодвигает слово дальше: через 1, 3, 7, 14, 30 и 60 дней.</li>
        <li>«Повторить» возвращает слово через три карточки и сбрасывает интервал. Ошибки в тесте тоже сбрасывают его.</li>
        <li>Точки в словаре: <span class="dot k"></span>уверенно (интервал от двух недель), <span class="dot s"></span>в изучении, <span class="dot h"></span>трудное.</li>
        <li>Частотность: сколько раз слово встречается в Новом Завете, по лексическому минимуму главы.</li>
      </ul></section>
    </div></div>`;
}
function initDict(){
  const upd = () => {
    const q = norm($('#d-q').value.trim()), c = $('#d-ch').value;
    saveLS('dict_q', $('#d-q').value); saveLS('dict_ch', c);
    const list = WORDS.filter(w => (c === 'all' || w.ch === +c) && (!q || norm(w.g).includes(q) || norm(w.ru).includes(q)));
    $('#d-count').textContent = list.length ? `Найдено слов: ${list.length}` : 'Ничего не найдено';
    $('#d-list').innerHTML = CHS.map(ch => { const ws = list.filter(w => w.ch === ch); if(!ws.length) return '';
      const ps = ws.map(w => w.p), pg = Math.min(...ps) === Math.max(...ps) ? `с. ${ps[0]}` : `с. ${Math.min(...ps)}–${Math.max(...ps)}`;
      return `<h3 class="chh">Глава ${ch} <span class="meta">${pg}</span></h3><section class="card flat">${wordTable(ws)}</section>`; }).join('');
    const r = c === 'all' ? 'all' : 'c:' + c;
    $('#d-cards').href = '#/words?r=' + r; $('#d-quiz').href = '#/words?r=' + r + '&m=quiz';
  };
  $('#d-q').oninput = upd; $('#d-ch').onchange = upd;
  upd();
}

/* ---------- Карточки и тест слов (как в старом приложении) ---------- */
// Диапазон: all: все главы, c:N: одна глава, u:N: с начала по главу N
const WS = {range: loadLS('range', 'all'), dir: 'g', set: 'srs', deck: [], idx: 0, known: 0, failed: new Set(), task: null, rendered: false};
const inRange = w => { if(WS.range === 'all') return true; const [t, c] = WS.range.split(':'); return t === 'c' ? w.ch === +c : w.ch <= +c; };
const rangeWords = () => WORDS.filter(inRange);
function rangeOptions(){
  const cnt = c => chWords(c).length, upto = c => WORDS.filter(w => w.ch <= c).length;
  return `<option value="all">Все главы · ${WORDS.length} слов</option>
    <optgroup label="Одна глава">${CHS.map(c => `<option value="c:${c}">Глава ${c} · ${cnt(c)} сл.</option>`).join('')}</optgroup>
    <optgroup label="С начала по главу">${CHS.slice(1).map(c => `<option value="u:${c}">Главы 4–${c} · ${upto(c)} сл.</option>`).join('')}</optgroup>`;
}
const lvl = w => { const s = wRec(w.n); return s ? '●'.repeat(s.level || 0) + '○'.repeat(6 - (s.level || 0)) : 'новое'; };
const seg = (attr, items, cur, label) => `<div class="seg" role="group" aria-label="${label}">${items.map(([k, l]) => `<button type="button" data-${attr}="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
function wCardsHTML(task){
  return `<div class="row between">${seg('wdir', [['g','Греч. → рус.'],['r','Рус. → греч.']], WS.dir, 'Направление')}
      ${task ? '' : seg('wset', [['srs','Повторение'],['all','Все'],['hard','Трудные']], WS.set, 'Набор')}</div>
    <div class="pbar thin"><i id="wBar"></i></div>
    <div class="row between"><span class="meta" id="wMeta"></span>${task ? '' : '<button type="button" class="btn sm" id="wShuffle">Перемешать</button>'}</div>
    <div id="wArea">
      <div class="stage"><div class="fcard" id="wCard" tabindex="0" role="button" aria-label="Перевернуть карточку"><div class="face front" id="wFront"></div><div class="face back" id="wBack"></div></div></div>
      <div class="grid2"><button type="button" class="btn bad" id="wAgain">Повторить</button><button type="button" class="btn good" id="wKnow">Знаю</button></div>
    </div>
    <div class="done-box" id="wDone" hidden></div>
    ${task ? '' : '<p class="meta center" id="wStats"></p>'}`;
}
function vWords(r){
  const rr = r.q.get('r');
  if(rr && (rr === 'all' || /^[cu]:\d+$/.test(rr))){ WS.range = rr; saveLS('range', rr); }
  WS.mode = r.q.get('m') === 'quiz' ? 'quiz' : 'cards';
  return `${subHead('#/dict', 'Словарь', 'Слова', 'Лексический минимум Маунса, главы 4–36')}
    <div class="trainer">
      ${seg('wmode', [['cards','Карточки'],['quiz','Тест']], WS.mode, 'Режим')}
      <select class="inp" id="wRange" aria-label="Главы">${rangeOptions()}</select>
      <section id="w-cards"${WS.mode === 'cards' ? '' : ' hidden'}>${wCardsHTML(false)}</section>
      <section id="w-quiz"${WS.mode === 'quiz' ? '' : ' hidden'}>
        ${seg('wq', [['tr','Перевод'],['gr','Греческое слово']], WQ.type, 'Тип теста')}
        <div class="pbar thin"><i id="wqBar"></i></div>
        <div class="row between"><span class="meta" id="wqMeta"></span><span class="meta" id="wqScore"></span></div>
        <div id="wqArea"><div class="qbox"><div class="meta" id="wqAsk"></div><div class="prompt" id="wqPrompt"></div></div>
          <div class="opts" id="wqOpts"></div><div class="feedback" id="wqFb"></div>
          <button type="button" class="btn primary wide" id="wqNext" hidden>Дальше</button></div>
        <div class="done-box" id="wqDone" hidden><div class="pct" id="wqPct"></div><p id="wqSum"></p><p class="meta" id="wqMiss"></p><button type="button" class="btn primary" id="wqRestart">Ещё раз</button></div>
      </section>
    </div>`;
}
function initWords(){
  $('#wRange').value = WS.range;
  $('#wRange').onchange = () => { WS.range = $('#wRange').value; saveLS('range', WS.range); buildWDeck(); WQ.list = []; if(WS.mode === 'quiz') startWQuiz(); };
  $$('[data-wmode]').forEach(b => b.onclick = () => { WS.mode = b.dataset.wmode; pressed($$('[data-wmode]'), b);
    $('#w-cards').hidden = WS.mode !== 'cards'; $('#w-quiz').hidden = WS.mode !== 'quiz';
    if(WS.mode === 'quiz' && !WQ.list.length) startWQuiz(); if(WS.mode === 'cards') wStats(); });
  $$('[data-wq]').forEach(b => b.onclick = () => { WQ.type = b.dataset.wq; pressed($$('[data-wq]'), b); startWQuiz(); });
  $('#wqNext').onclick = () => { WQ.i++; WQ.i >= WQ.list.length ? wqFinish() : wAsk(); };
  $('#wqRestart').onclick = startWQuiz;
  startWCards(null);
  WQ.list = [];
  if(WS.mode === 'quiz') startWQuiz();
}
function pressed(group, btn){ group.forEach(x => x.setAttribute('aria-pressed', String(x === btn))); }
function startWCards(task){
  WS.task = task; WS.rendered = false;
  $('#wCard').onclick = () => $('#wCard').classList.toggle('flipped');
  $('#wCard').onkeydown = e => { if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); $('#wCard').classList.toggle('flipped'); } };
  $('#wKnow').onclick = () => wNext(true); $('#wAgain').onclick = () => wNext(false);
  if($('#wShuffle')) $('#wShuffle').onclick = buildWDeck;
  $$('[data-wdir]').forEach(b => b.onclick = () => { WS.dir = b.dataset.wdir; pressed($$('[data-wdir]'), b); if(WS.deck.length && WS.idx < WS.deck.length) wRender(); });
  $$('[data-wset]').forEach(b => b.onclick = () => { WS.set = b.dataset.wset; pressed($$('[data-wset]'), b); buildWDeck(); });
  buildWDeck();
}
function wGreekFace(w){ const [h, r] = split(w.g); return `<div class="num">гл. ${w.ch}</div><div class="lvl">${lvl(w)}</div><div class="wg">${h}</div>${r ? `<div class="wforms">${r}</div>` : ''}<div class="hint">нажмите, чтобы перевернуть</div>`; }
function wRuFace(w){ const L = w.ru.length; return `<div class="num">гл. ${w.ch}</div><div class="lvl">${lvl(w)}</div><div class="wru" style="margin:0;font-size:${L < 16 ? 2.2 : L < 40 ? 1.7 : 1.3}rem">${esc(w.ru)}</div><div class="hint">как по-гречески? нажмите</div>`; }
function wBackFace(w){ const [h, r] = split(w.g); return `<div class="num">гл. ${w.ch}</div><div class="lvl">${lvl(w)}</div><div class="wg sm">${h}</div>${r ? `<div class="wforms">${r}</div>` : ''}
  <div class="wru">${esc(w.ru)}</div><div class="note">В Новом Завете: ${times(w.f)}</div><div class="src">Маунс, гл. ${w.ch}, с. ${w.p}</div>`; }
function buildWDeck(){
  const t = today();
  if(WS.task){
    // задание плана: повторение вперемешку, новые слова по порядку учебника
    const d = taskDeck(WS.task);
    WS.deck = WS.task.key === 'review' ? shuffle(d) : d;
  } else {
    const R = rangeWords();
    if(WS.set === 'hard' && !R.some(w => (wRec(w.n) || {}).hard)){ WS.set = 'all'; pressed($$('[data-wset]'), $('[data-wset=all]')); }
    if(WS.set === 'srs') WS.deck = shuffle(R.filter(w => wRec(w.n) && wRec(w.n).due <= t)).concat(R.filter(w => !wRec(w.n)).slice(0, NEW));
    else WS.deck = shuffle(WS.set === 'hard' ? R.filter(w => (wRec(w.n) || {}).hard) : R);
  }
  WS.idx = 0; WS.known = 0; WS.failed.clear(); WS.size = new Set(WS.deck.map(w => w.n)).size;
  if(!WS.deck.length) return wFinish();
  $('#wDone').hidden = true; $('#wArea').hidden = false; wRender();
}
function wRender(){
  const w = WS.deck[WS.idx], c = $('#wCard'); c.classList.remove('flipped');
  setTimeout(() => { $('#wFront').innerHTML = WS.dir === 'g' ? wGreekFace(w) : wRuFace(w); $('#wBack').innerHTML = wBackFace(w); }, WS.rendered ? 120 : 0);
  WS.rendered = true;
  $('#wMeta').textContent = `Карточка ${WS.idx + 1} из ${WS.deck.length}`;
  $('#wBar').style.width = (WS.idx / WS.deck.length * 100) + '%';
  wStats();
}
function wStats(){
  const el = $('#wStats'); if(!el) return;
  const t = today(); let st = 0, due = 0, sure = 0, hard = 0; const R = rangeWords();
  R.forEach(w => { const s = wRec(w.n); if(s){ st++; if(s.due <= t) due++; if((s.level || 0) >= SURE) sure++; if(s.hard) hard++; } });
  el.textContent = `В наборе ${R.length} · начато ${st} · уверенно ${sure} · к повторению ${due} · трудных ${hard}`;
}
function wNext(ok){
  const w = WS.deck[WS.idx]; if(!w) return;
  const t = today(), s = wRec(w.n);
  if(ok){
    if(!s || WS.failed.has(w.n)) setWord(w.n, {level: 1, due: addDays(t, 1), hard: false});
    else if(s.due <= t){ const b = Math.min((s.level || 0) + 1, 6); setWord(w.n, {level: b, due: addDays(t, INT[b]), hard: false}); }
    else if(s.hard) setWord(w.n, {hard: false});
    WS.known++;
  } else {
    setWord(w.n, {level: 0, due: t, hard: true}); WS.failed.add(w.n);
    WS.deck.splice(Math.min(WS.idx + 4, WS.deck.length), 0, w); // вернётся через три карточки
  }
  WS.idx++;
  WS.idx >= WS.deck.length ? wFinish() : wRender();
}
function wFinish(){
  $('#wArea').hidden = true; $('#wDone').hidden = false; $('#wBar').style.width = '100%'; $('#wMeta').textContent = '';
  const box = $('#wDone');
  if(WS.task){
    const k = WS.task.key;
    if(WS.deck.length) markTask(k, k === 'review' ? WS.size : 0);
    const tomorrow = WORDS.filter(w => wRec(w.n) && wRec(w.n).due <= addDays(today(), 1)).length;
    box.innerHTML = taskDoneHTML(WS.deck.length ? `Задание выполнено: ${WS.size} ${plural(WS.size, WORDS_F)}. Завтра к повторению: <b>${tomorrow}</b>.` : (k === 'review' ? 'На сегодня всё повторено.' : 'Эти слова уже пройдены.'));
    return;
  }
  const R = rangeWords(), t = today(), fresh = R.filter(w => !wRec(w.n)).length, tomorrow = R.filter(w => wRec(w.n) && wRec(w.n).due <= addDays(t, 1)).length;
  box.innerHTML = `<span class="done-ic">${ICON.done}</span><p>${WS.set === 'srs'
    ? `${WS.deck.length ? 'Сессия завершена.' : 'На сегодня всё повторено.'} Завтра к повторению: <b>${tomorrow}</b>.${fresh ? ` Новых слов в наборе: ${fresh}.` : ''}`
    : `Круг пройден. Отмечено «знаю»: <b>${WS.known}</b> из <b>${WS.size}</b>.`}</p>
    <div class="row center">${WS.set === 'srs' && fresh ? `<button type="button" class="btn primary" id="wMore">Ещё ${Math.min(NEW, fresh)} новых</button>` : ''}<button type="button" class="btn" id="wRestart">${WS.set === 'srs' ? 'Все слова набора' : 'Начать заново'}</button></div>`;
  if($('#wMore')) $('#wMore').onclick = buildWDeck;
  $('#wRestart').onclick = () => { if(WS.set === 'srs'){ WS.set = 'all'; pressed($$('[data-wset]'), $('[data-wset=all]')); } buildWDeck(); };
  wStats();
}

/* тест слов: 20 вопросов, 4 варианта, неверные варианты из той же части речи */
const WQ = {type: 'tr', list: [], i: 0, score: 0, miss: []};
const toks = ru => ru.toLowerCase().replace(/\(.*?\)/g, '').split(/[;,]/).map(x => x.replace(/^[^:]*:\s*/, '').trim()).filter(Boolean);
const clash = (a, b) => { const A = toks(a.ru); return toks(b.ru).some(x => A.includes(x)); };
function distractors(w, R){
  const out = [], ok = x => x !== w && !clash(w, x) && !out.some(o => o === x || clash(o, x));
  for(const pool of [R.filter(x => x.k === w.k), WORDS.filter(x => x.k === w.k), WORDS])
    for(const x of shuffle(pool)){ if(out.length === 3) return out; if(ok(x)) out.push(x); }
  return out;
}
function startWQuiz(){
  const R = rangeWords(), hard = w => (wRec(w.n) || {}).hard;
  WQ.list = shuffle(shuffle(R.filter(hard)).concat(shuffle(R.filter(w => !hard(w)))).slice(0, QUIZ_N));
  WQ.i = 0; WQ.score = 0; WQ.miss = []; $('#wqDone').hidden = true; $('#wqArea').hidden = false; wAsk();
}
function wAsk(){
  const w = WQ.list[WQ.i], tr = WQ.type === 'tr', N = WQ.list.length;
  const opts = shuffle([w, ...distractors(w, rangeWords())]);
  $('#wqFb').innerHTML = ''; $('#wqNext').hidden = true;
  $('#wqMeta').textContent = `Вопрос ${WQ.i + 1} из ${N}`; $('#wqScore').textContent = `верно: ${WQ.score}`;
  $('#wqBar').style.width = (WQ.i / N * 100) + '%';
  $('#wqAsk').textContent = tr ? 'Что означает слово?' : 'Как это по-гречески?';
  const p = $('#wqPrompt'); p.className = 'prompt ' + (tr ? 'word' : 'text ask'); p.innerHTML = tr ? w.g : esc(w.ru);
  p.style.fontSize = tr ? '' : (w.ru.length < 16 ? '2.2rem' : w.ru.length < 40 ? '1.6rem' : '1.25rem');
  const box = $('#wqOpts'); box.className = 'opts' + (tr ? ' one' : ''); box.innerHTML = '';
  opts.forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (tr ? 'ru' : 'wgr');
    b.innerHTML = tr ? esc(o.ru) : o.g; b.dataset.ok = o === w ? 1 : 0; b.onclick = () => wAnswer(b, o === w, w); box.appendChild(b); });
}
function wAnswer(b, ok, w){
  $$('#wqOpts .btn').forEach(x => { x.disabled = true; if(x.dataset.ok === '1') x.classList.add('right'); });
  if(ok) WQ.score++; else { b.classList.add('wrong'); WQ.miss.push(w); setWord(w.n, {level: 0, due: today(), hard: true}); }
  $('#wqFb').innerHTML = `<b class="${ok ? 'good-t' : 'bad-t'}">${ok ? 'Верно' : 'Неверно'}.</b> <span class="gr big-gr">${w.g}</span>: ${esc(w.ru)}. Гл. ${w.ch}, с. ${w.p}.`;
  $('#wqScore').textContent = `верно: ${WQ.score}`; $('#wqNext').hidden = false; $('#wqNext').focus();
}
function wqFinish(){
  const N = WQ.list.length; $('#wqArea').hidden = true; $('#wqDone').hidden = false; $('#wqBar').style.width = '100%';
  $('#wqPct').textContent = Math.round(WQ.score / N * 100) + '%'; $('#wqSum').textContent = `Верно ${WQ.score} из ${N}.`;
  $('#wqMiss').innerHTML = WQ.miss.length ? `Ошибки: <span class="gr big-gr">${WQ.miss.map(w => split(w.g)[0]).join(', ')}</span>. Эти слова попали в «Трудные» и вернутся в повторение сегодня.` : 'Без ошибок.';
}

/* ---------- Алфавит, глава 3 (как в старом приложении) ---------- */
const SRC = 'Маунс, гл. 3, с. 24–25';
const AS = {dir: 'g', set: 'all', deck: [], idx: 0, known: 0, task: null, rendered: false, mode: 'cards'};
const AQ = {type: 'name', list: [], i: 0, score: 0, miss: []};
function abcCardsHTML(task){
  return `<div class="row between">${seg('adir', [['g','Буква → название'],['r','Название → буква']], AS.dir, 'Направление')}
      ${task ? '' : seg('aset', [['all','Все'],['hard','Трудные']], AS.set, 'Набор')}</div>
    <div class="pbar thin"><i id="aBar"></i></div>
    <div class="row between"><span class="meta" id="aMeta"></span>${task ? '' : '<button type="button" class="btn sm" id="aShuffle">Перемешать</button>'}</div>
    <div id="aArea">
      <div class="stage"><div class="fcard" id="aCard" tabindex="0" role="button" aria-label="Перевернуть карточку"><div class="face front" id="aFront"></div><div class="face back" id="aBack"></div></div></div>
      <div class="grid2"><button type="button" class="btn bad" id="aAgain">Повторить</button><button type="button" class="btn good" id="aKnow">Знаю</button></div>
    </div>
    <div class="done-box" id="aDone" hidden></div>`;
}
function vAbc(r){
  AS.mode = ['quiz', 'table'].includes(r.q.get('m')) ? r.q.get('m') : 'cards';
  return `${subHead('#/course', 'Курс', 'Глава 3. Алфавит и произношение', 'Маунс, «Основы библейского греческого языка», с. 23–27')}
    <div class="trainer">
      ${seg('amode', [['cards','Карточки'],['quiz','Тест'],['table','Таблица']], AS.mode, 'Режим')}
      <section id="a-cards"${AS.mode === 'cards' ? '' : ' hidden'}>${abcCardsHTML(false)}</section>
      <section id="a-quiz"${AS.mode === 'quiz' ? '' : ' hidden'}>
        ${seg('aq', [['name','Название'],['letter','Буква'],['sound','Звук']], AQ.type, 'Тип теста')}
        <div class="pbar thin"><i id="aqBar"></i></div>
        <div class="row between"><span class="meta" id="aqMeta"></span><span class="meta" id="aqScore"></span></div>
        <div id="aqArea"><div class="qbox"><div class="meta" id="aqAsk"></div><div class="prompt" id="aqPrompt"></div></div>
          <div class="opts" id="aqOpts"></div><div class="feedback" id="aqFb"></div>
          <button type="button" class="btn primary wide" id="aqNext" hidden>Дальше</button></div>
        <div class="done-box" id="aqDone" hidden><div class="pct" id="aqPct"></div><p id="aqSum"></p><p class="meta" id="aqMiss"></p><button type="button" class="btn primary" id="aqRestart">Ещё раз</button></div>
      </section>
      <section id="a-table"${AS.mode === 'table' ? '' : ' hidden'}>
        <section class="card flat"><table class="abc"><thead><tr><th>Буква</th><th>Название</th><th>Звук</th></tr></thead><tbody>${LETTERS.map(L =>
          `<tr><td class="g">${L.up} ${L.low}</td><td>${L.ru}<br><span class="gr">${L.gn}</span></td><td class="s">[${L.pron}]${L.pnote ? `<br><span class="meta">${L.pnote}</span>` : ''}</td></tr>`).join('')}</tbody></table></section>
        <section class="card rules"><h3>Главное из главы 3</h3><ul>
          <li>Гласные: <span class="gr">α, ε, η, ι, ο, υ, ω</span> (§3.2).</li>
          <li><span class="gr">ε, ο</span> всегда краткие; <span class="gr">η, ω</span> всегда долгие; <span class="gr">α, ι</span> бывают и теми и другими (§3.3).</li>
          <li>Двумя русскими буквами передаются <span class="gr">ζ</span> «дз», <span class="gr">ξ</span> «кс», <span class="gr">ψ</span> «пс» (§3.2).</li>
          <li>Не путать: <span class="gr">ν</span> и <span class="gr">υ</span> (написание); <span class="gr">ε</span>/<span class="gr">η</span>, <span class="gr">ο</span>/<span class="gr">ω</span>, <span class="gr">θ</span>/<span class="gr">τ</span> (звучание); русскую «в» и <span class="gr">β</span> [б] (§3.2).</li>
          <li><span class="gr">ς</span> пишется только в конце слова, <span class="gr">σ</span> в остальных местах: <span class="gr">ἀπόστολος</span> (§3.2).</li>
          <li>Перед <span class="gr">γ, κ, χ, ξ</span> гамма звучит [н]: <span class="gr">ἄγγελος</span> [ангэлос] (§3.3).</li>
          <li>Каждое слово на гласную или <span class="gr">ρ</span> имеет знак придыхания. Густое <span class="gr">ὑ</span> даёт [х]: <span class="gr">ὑπέρ</span> [ху̣пэр]; тонкое <span class="gr">ἀ</span> не произносится: <span class="gr">ἀπόστολος</span> [апостолос]. Слова на <span class="gr">ρ</span> и <span class="gr">υ</span> всегда с густым (§3.4).</li>
        </ul><p class="src">Источник: Маунс, Учебник, гл. 3, §3.1–3.4, с. 23–26. Подведение итогов: с. 27.</p></section>
      </section>
    </div>`;
}
function initAbc(){
  $$('[data-amode]').forEach(b => b.onclick = () => { AS.mode = b.dataset.amode; pressed($$('[data-amode]'), b);
    ['cards', 'quiz', 'table'].forEach(m => { $('#a-' + m).hidden = m !== AS.mode; });
    if(AS.mode === 'quiz' && !AQ.list.length) startAQuiz(); });
  $$('[data-aq]').forEach(b => b.onclick = () => { AQ.type = b.dataset.aq; pressed($$('[data-aq]'), b); startAQuiz(); });
  $('#aqNext').onclick = () => { AQ.i++; AQ.i >= AQ.list.length ? aqFinish() : aAsk(); };
  $('#aqRestart').onclick = startAQuiz;
  startAbcCards(null);
  AQ.list = [];
  if(AS.mode === 'quiz') startAQuiz();
}
function letterFace(L){ return `<div class="num">${L.n}/24</div><div class="biglet">${L.low}</div><div class="upper">прописная ${L.up}</div><div class="hint">нажмите, чтобы перевернуть</div>`; }
function infoFace(L, showLetter){ return `<div class="num">${L.n}/24</div>
  ${showLetter ? `<div class="biglet mid">${L.low}</div><div class="upper" style="margin:0 0 6px">прописная ${L.up}</div>` : ''}
  <div class="ru">${L.ru}</div><div class="gn">${L.gn}</div><div class="pron">[${L.pron}]</div>
  ${L.pnote ? `<div class="pnote">${L.pnote}</div>` : ''}<div class="note">${L.note}</div><div class="src">${SRC}</div>`; }
function nameFace(L){ return `<div class="num">${L.n}/24</div><div class="ru" style="font-size:2.6rem">${L.ru}</div><div class="pron">[${L.pron}]</div>${L.pnote ? `<div class="pnote">${L.pnote}</div>` : ''}<div class="hint">какая это буква? нажмите</div>`; }
function startAbcCards(task){
  AS.task = task; AS.rendered = false;
  $('#aCard').onclick = () => $('#aCard').classList.toggle('flipped');
  $('#aCard').onkeydown = e => { if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); $('#aCard').classList.toggle('flipped'); } };
  $('#aKnow').onclick = () => aNext(true); $('#aAgain').onclick = () => aNext(false);
  if($('#aShuffle')) $('#aShuffle').onclick = buildADeck;
  $$('[data-adir]').forEach(b => b.onclick = () => { AS.dir = b.dataset.adir; pressed($$('[data-adir]'), b); if(AS.idx < AS.deck.length) aRender(); });
  $$('[data-aset]').forEach(b => b.onclick = () => { AS.set = b.dataset.aset; pressed($$('[data-aset]'), b); buildADeck(); });
  buildADeck();
}
function buildADeck(){
  let base;
  if(AS.task) base = taskDeck(AS.task);
  else {
    base = AS.set === 'hard' ? LETTERS.filter(L => (lRec(L.n) || {}).hard) : LETTERS;
    if(!base.length){ base = LETTERS; AS.set = 'all'; pressed($$('[data-aset]'), $('[data-aset=all]')); }
  }
  AS.deck = shuffle(base); AS.idx = 0; AS.known = 0;
  if(!AS.deck.length) return aFinish();
  $('#aDone').hidden = true; $('#aArea').hidden = false; aRender();
}
function aRender(){
  const L = AS.deck[AS.idx], c = $('#aCard'); c.classList.remove('flipped');
  setTimeout(() => {
    $('#aFront').innerHTML = AS.dir === 'g' ? letterFace(L) : nameFace(L);
    $('#aBack').innerHTML = AS.dir === 'g' ? infoFace(L, false) : infoFace(L, true);
  }, AS.rendered ? 120 : 0);
  AS.rendered = true;
  $('#aMeta').textContent = `Карточка ${AS.idx + 1} из ${AS.deck.length} · знаю: ${lettersKnown()}/24`;
  $('#aBar').style.width = (AS.idx / AS.deck.length * 100) + '%';
}
function aNext(k){
  const L = AS.deck[AS.idx]; if(!L) return;
  if(k){ setLetter(L.n, {known: true, hard: false}); AS.known++; }
  else setLetter(L.n, {known: false, hard: true});
  AS.idx++;
  AS.idx >= AS.deck.length ? aFinish() : aRender();
}
function aFinish(){
  $('#aArea').hidden = true; $('#aDone').hidden = false; $('#aBar').style.width = '100%';
  $('#aMeta').textContent = `Знаю: ${lettersKnown()}/24 · трудных: ${lettersHard()}`;
  if(AS.task){
    if(AS.deck.length) markTask('alphabet', AS.deck.length);
    $('#aDone').innerHTML = taskDoneHTML(AS.deck.length ? `Круг пройден. Отмечено «знаю»: <b>${AS.known}</b> из <b>${AS.deck.length}</b>.` : 'Все буквы уже отмечены «знаю».');
    return;
  }
  $('#aDone').innerHTML = `<span class="done-ic">${ICON.done}</span><p>Круг пройден. Отмечено «знаю»: <b>${AS.known}</b> из <b>${AS.deck.length}</b>.</p><button type="button" class="btn primary" id="aRestart">Начать заново</button>`;
  $('#aRestart').onclick = buildADeck;
}
function startAQuiz(){ AQ.list = shuffle(LETTERS); AQ.i = 0; AQ.score = 0; AQ.miss = []; $('#aqDone').hidden = true; $('#aqArea').hidden = false; aAsk(); }
function aAsk(){
  const L = AQ.list[AQ.i], t = AQ.type;
  const opts = shuffle([L, ...shuffle(LETTERS.filter(x => x !== L)).slice(0, 3)]);
  $('#aqFb').innerHTML = ''; $('#aqNext').hidden = true;
  $('#aqMeta').textContent = `Вопрос ${AQ.i + 1} из 24`; $('#aqScore').textContent = `верно: ${AQ.score}`;
  $('#aqBar').style.width = (AQ.i / 24 * 100) + '%';
  const p = $('#aqPrompt');
  if(t === 'name'){ $('#aqAsk').textContent = 'Как называется буква?'; p.className = 'prompt'; p.innerHTML = L.low; }
  if(t === 'letter'){ $('#aqAsk').textContent = 'Найдите строчную букву'; p.className = 'prompt text'; p.innerHTML = L.ru; }
  if(t === 'sound'){ $('#aqAsk').textContent = 'Как произносится буква?'; p.className = 'prompt'; p.innerHTML = L.low; }
  const box = $('#aqOpts'); box.className = 'opts'; box.innerHTML = '';
  opts.forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (t === 'letter' ? ' greek' : '');
    b.innerHTML = t === 'name' ? o.ru : t === 'letter' ? o.low : `[${o.pron}]`;
    b.onclick = () => aAnswer(b, o === L, L); b.dataset.ok = o === L ? 1 : 0; box.appendChild(b); });
}
function aAnswer(b, ok, L){
  $$('#aqOpts .btn').forEach(x => { x.disabled = true; if(x.dataset.ok === '1') x.classList.add('right'); });
  if(ok) AQ.score++; else { b.classList.add('wrong'); AQ.miss.push(L); setLetter(L.n, {hard: true}); }
  $('#aqFb').innerHTML = `<b class="${ok ? 'good-t' : 'bad-t'}">${ok ? 'Верно' : 'Неверно'}.</b> <span class="gr big-gr">${L.low}</span>: ${L.ru} (<span class="gr">${L.gn}</span>), [${L.pron}]. ${L.note}`;
  $('#aqScore').textContent = `верно: ${AQ.score}`; $('#aqNext').hidden = false; $('#aqNext').focus();
}
function aqFinish(){
  $('#aqArea').hidden = true; $('#aqDone').hidden = false; $('#aqBar').style.width = '100%';
  $('#aqPct').textContent = Math.round(AQ.score / 24 * 100) + '%'; $('#aqSum').textContent = `Верно ${AQ.score} из 24.`;
  $('#aqMiss').innerHTML = AQ.miss.length ? `Ошибки: <span class="gr big-gr">${AQ.miss.map(x => x.low).join(' ')}</span>. Эти буквы добавлены в «Трудные» на карточках.` : 'Без ошибок.';
}

/* ---------- Прогресс ---------- */
function vProgress(){
  const c = wordCounts(), total = WORDS.length, kn = lettersKnown(), st = streak();
  const parts = [['sure', 'Уверенно', 'интервал от двух недель'], ['learn', 'В изучении', ''], ['hard', 'Трудные', 'ошибка или «Повторить»'], ['new', 'Впереди', 'ещё не начаты']];
  const week = Array.from({length: 7}, (_, i) => addDays(weekStart(), i)), plans = planMap(), t = today();
  return `${head('Прогресс', 'Слова, алфавит и дни занятий')}
    <div class="cols"><div class="col">
      <section class="card"><div class="plan-top"><h2>Слова минимума</h2><span class="muted">${total} слов</span></div>
        <div class="stack-bar" aria-hidden="true">${parts.map(([k]) => c[k] ? `<i class="${k}" style="flex:${c[k]}"></i>` : '').join('')}</div>
        <ul class="legend">${parts.map(([k, l, s]) => `<li><span class="sw ${k}"></span><span class="tt"><b>${l}</b>${s ? `<small>${s}</small>` : ''}</span><b class="n">${c[k]}</b></li>`).join('')}</ul>
      </section>
    </div><div class="col">
      <section class="card"><div class="plan-top"><h2>Алфавит</h2><span class="muted">знаю ${kn} из ${LETTERS.length}</span></div>${bar(kn, LETTERS.length, 'good')}
        <a class="btn" href="#/abc">Открыть алфавит</a></section>
      <section class="card week-card" data-act="calendar" role="button" tabindex="0" aria-label="План выполнен: ${st} ${plural(st, DAYS_F)} подряд. Открыть календарь занятий">
        <div class="plan-top"><h2>План выполнен</h2><span class="muted">${st} ${plural(st, DAYS_F)} подряд</span></div>
        <div class="days" aria-hidden="true">${week.map((d, i) => { const dd = +d.slice(8), s = dayState(plans.get(d));
          return `<span class="${s}${d === t ? ' today' : ''}${d > t ? ' future' : ''}"><small>${WDM[i]}</small><i>${s === 'full' ? ICON.check : dd}</i></span>`; }).join('')}</div>
        <span class="week-more">${ICON.cal}Календарь занятий${ICON.chev}</span>
      </section>
    </div></div>`;
}

/* ---------- Профиль ---------- */
function vProfile(){
  const u = me();
  const inv = S.invites.slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return `<div class="nav-head">${backLink('#/', 'Сегодня')}${headActs()}</div><header class="sub-head"><h1>Профиль</h1></header>
    <div class="cols"><div class="col">
    <section class="card me-card"><span class="me xl" aria-hidden="true" data-av>${avatarInner(u)}</span><div class="who"><b>${esc(u.name || 'Без имени')}</b><span>${esc(u.email || '')}</span>
        <button type="button" class="btn sm" data-act="avatar">${u.avatar ? 'Изменить фото' : 'Поставить фото'}</button></div>
      <button type="button" class="icon-btn" data-act="edit-name" aria-label="Изменить имя">${ICON.pen}</button></section>
    <section class="card"><h2>Оформление</h2>
      <div class="seg3" role="radiogroup" aria-label="Тема">${[['light','Светлая'],['dark','Тёмная'],['auto','Как в системе']].map(([k, l]) =>
        `<input type="radio" name="p-theme" id="p-theme-${k}" value="${k}"${themePref() === k ? ' checked' : ''}><label for="p-theme-${k}">${l}</label>`).join('')}</div></section>
    </div><div class="col">
    ${isAdmin() ? `<details class="fold card" data-fold="inv"${UI.folds.has('inv') ? ' open' : ''}><summary><span>Приглашения</span>${ICON.chev}</summary><div class="fold-body">
      <p class="hint">Новый человек может зарегистрироваться только по приглашению. Создайте его и отправьте ссылку.</p>
      <div class="field"><label for="i-note">Для кого (заметка)</label><input class="inp" type="text" id="i-note" placeholder="Например: студенты"></div>
      <div class="field"><label for="i-max">Сколько регистраций</label><select class="inp" id="i-max"><option value="1">1 человек</option><option value="5">до 5 человек</option><option value="20">до 20 человек</option><option value="0">без ограничения</option></select></div>
      <div class="field"><label for="i-exp">Действует до (необязательно)</label><input class="inp" type="date" id="i-exp"></div>
      <button type="button" class="btn primary" data-act="new-invite">Создать и скопировать ссылку</button>
      <div>${inv.length ? inv.map(i => `<div class="inv"><code>${esc(i.code)}</code><span class="muted">${i.note ? esc(i.note) + ' · ' : ''}использовано ${i.uses || 0}${i.max_uses > 0 ? ' из ' + i.max_uses : ', без ограничения'}${i.expires ? ' · до ' + fmtDay(i.expires) : ''}</span>
        <div class="row"><button type="button" class="btn sm" data-act="copy-invite" data-code="${esc(i.code)}">Скопировать ссылку</button><button type="button" class="btn sm ghost danger" data-act="del-invite" data-id="${esc(i.id)}">Удалить</button></div></div>`).join('') : '<p class="hint">Приглашений пока нет.</p>'}</div>
    </div></details>` : ''}
    <details class="fold card"><summary><span>Сменить пароль</span>${ICON.chev}</summary><div class="fold-body">
      <div class="field"><label for="p-old">Текущий пароль</label><input class="inp" type="password" id="p-old" autocomplete="current-password"></div>
      <div class="field"><label for="p-new">Новый пароль (не короче 8 символов)</label><input class="inp" type="password" id="p-new" autocomplete="new-password"></div>
      <div class="field"><label for="p-new2">Повторите новый</label><input class="inp" type="password" id="p-new2" autocomplete="new-password"></div>
      <button type="button" class="btn" data-act="save-pass">Сменить пароль</button></div></details>
    <button type="button" class="btn wide" data-act="logout">Выйти</button>
    <details class="fold card"><summary><span>Удаление аккаунта</span>${ICON.chev}</summary><div class="fold-body">
      <p class="hint">Вместе с аккаунтом удалится весь прогресс: слова, буквы и планы. Вернуть их будет нельзя.</p>
      <button type="button" class="btn danger" data-act="delete-account">Удалить аккаунт и все данные</button></div></details>
    <p class="hint"><a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a></p>
    </div></div>`;
}
async function loadProfileExtras(){
  if(isAdmin()){ try { S.invites = await pb.collection('invites').getFullList(); } catch(e){} }
  if(route().name === 'profile') schedule();
}
window.addEventListener('hashchange', () => { if(route().name === 'profile' && S.loaded) loadProfileExtras(); });
document.addEventListener('change', e => { if(e.target.name === 'p-theme') setTheme(e.target.value); });
// открытый блок «Приглашения» остаётся открытым после перерисовки
document.addEventListener('toggle', e => { const f = e.target.dataset && e.target.dataset.fold; if(f) e.target.open ? UI.folds.add(f) : UI.folds.delete(f); }, true);

/* ---------- Фото профиля ---------- */
// Хранится только круг 400×400 (JPEG) в users.avatar, файл защищённый: загружается по токену.
// Загруженное фото держим в памяти и на устройстве (data:), чтобы кружок был с фото и без интернета.
const MAX_PHOTO = 10 * 1024 * 1024, ROUND = 400;
let tokP = null, tokAt = 0;
function fileToken(){
  if(!tokP || Date.now() - tokAt > 100e3){ tokAt = Date.now(); tokP = pb.files.getToken().catch(e => { tokP = null; throw e; }); }
  return tokP;
}
const AV = {name: '', src: '', failAt: 0};
function avatarSrc(u){
  if(!u || !u.avatar) return '';
  if(AV.name === u.avatar) return AV.src;
  const c = loadLS('avatar_' + u.id, null);
  if(c && c.name === u.avatar){ AV.name = c.name; AV.src = c.src; return c.src; }
  if(Date.now() - AV.failAt > 60e3) loadAvatar(u);
  return '';
}
async function loadAvatar(u){
  const name = u.avatar;
  AV.name = name; AV.src = '';
  try {
    const res = await fetch(pb.files.getURL(u, name, {token: await fileToken()}));
    if(!res.ok) throw new Error('Фото не загрузилось.');
    const blob = await res.blob();
    const src = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
    if(AV.name !== name) return;
    AV.src = src; saveLS('avatar_' + u.id, {name, src});
    refreshAvatars();
  } catch(e){ if(AV.name === name){ AV.name = ''; AV.failAt = Date.now(); } }
}
function refreshAvatars(){ $$('[data-av]').forEach(el => { el.innerHTML = avatarInner(me()); }); }
// Фото уменьшаем в браузере до 1600 точек по длинной стороне: так обрезка работает быстро и на телефоне
async function preparePhoto(file){
  if(file.size > MAX_PHOTO) throw new Error('Фото больше 10 МБ. Выберите фото поменьше.');
  let img;
  try { img = await createImageBitmap(file); }
  catch(e){
    try { img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    catch(e2){
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      throw new Error(['heic', 'heif'].includes(ext) ? 'Это фото в формате HEIC не открывается в этом браузере. Выберите фото в формате JPG или PNG.' : 'Не удалось открыть картинку. Выберите фото в формате JPG, PNG, WEBP или HEIC.');
    }
  }
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
  if(!blob) throw new Error('Не удалось обработать фото.');
  return blob;
}

/* окно обрезки по кругу (как в «Молитвенном дневнике»): центр круга cx, cy в долях фото и увеличение z от 1 до 4;
   при z = 1 короткая сторона фото ровно вписана в круг */
const cropDlg = $('#crop'), cropStage = $('#crop-stage'), cropImg = $('#crop-img');
const CR = {img: null, W: 0, H: 0, cx: .5, cy: .5, z: 1, resolve: null, seq: 0};
const ZMAX = 4;
const clampZ = z => Math.min(ZMAX, Math.max(1, +z || 1));
// Открывает окно с новым файлом (file) или с уже сохранённым фото (src). Возвращает {round}, {remove: true} или null (отмена)
function cropPhoto(o){
  return new Promise(resolve => {
    if(CR.resolve) CR.resolve(null);
    Object.assign(CR, {resolve, img: null});
    const rm = $('#crop-remove');
    rm.hidden = !o.canRemove; rm.dataset.armed = ''; rm.textContent = 'Удалить фото';
    if(!cropDlg.open) cropDlg.showModal();
    if(o.file) cropLoadFile(o.file);
    else { const seq = ++CR.seq; cropMsg('Открываю фото…'); cropSetImage(o.src, seq).catch(() => { if(seq === CR.seq) cropMsg('Фото не открылось. Выберите другое.'); }); }
  });
}
function cropMsg(text){
  const m = $('#crop-msg');
  m.textContent = text || ''; m.hidden = !text;
  cropImg.hidden = !!text;
  cropDlg.classList.toggle('no-img', !!text);
}
async function cropLoadFile(file){
  const seq = ++CR.seq;
  CR.img = null; cropMsg('Открываю фото…');
  try {
    const blob = await preparePhoto(file);
    if(seq === CR.seq) await cropSetImage(URL.createObjectURL(blob), seq);
  } catch(e){ if(seq === CR.seq) cropMsg(errText(e)); }
}
function cropSetImage(url, seq){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      if(seq !== CR.seq) return res();
      Object.assign(CR, {img: im, W: im.naturalWidth, H: im.naturalHeight, cx: .5, cy: .5, z: 1});
      cropImg.src = url;
      cropDlg.querySelectorAll('.pv-photo img').forEach(i => { i.src = url; });
      cropMsg('');
      cropDraw();
      res();
    };
    im.onerror = rej;
    im.src = url;
  });
}
const cropD = () => cropStage.clientWidth * 0.8; // диаметр круга на экране
// Фото не может уйти так, чтобы в круге осталась пустота
function cropClamp(){
  const k = Math.min(CR.W, CR.H) / CR.z / 2; // половина стороны круга в точках фото
  CR.cx = Math.min(1 - k / CR.W, Math.max(k / CR.W, CR.cx));
  CR.cy = Math.min(1 - k / CR.H, Math.max(k / CR.H, CR.cy));
}
// Ставит фото так, чтобы центр обрезки оказался в точке center, при масштабе s
function cropPlace(img, center, s){
  img.style.width = CR.W + 'px'; img.style.height = CR.H + 'px';
  img.style.transform = `translate(${center - CR.cx * CR.W * s}px, ${center - CR.cy * CR.H * s}px) scale(${s})`;
}
let cropRaf = 0;
function cropDraw(){
  if(cropRaf) return;
  cropRaf = requestAnimationFrame(() => {
    cropRaf = 0;
    if(!CR.img) return;
    cropClamp();
    const D = cropD(), s = D / Math.min(CR.W, CR.H) * CR.z;
    cropPlace(cropImg, cropStage.clientWidth / 2, s);
    $('#crop-z').value = CR.z;
    cropDlg.querySelectorAll('.pv-photo').forEach(el => { const d = el.clientWidth; cropPlace(el.querySelector('img'), d / 2, s * d / D); });
  });
}
// Пальцы и мышь: один палец двигает, два пальца увеличивают и двигают
const ptrs = new Map();
cropStage.addEventListener('pointerdown', e => {
  if(!CR.img) return;
  try { cropStage.setPointerCapture(e.pointerId); } catch(err){}
  ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
});
cropStage.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if(!p || !CR.img) return;
  const before = [...ptrs.values()].map(q => ({...q}));
  p.x = e.clientX; p.y = e.clientY;
  const after = [...ptrs.values()];
  const s = cropD() / Math.min(CR.W, CR.H) * CR.z;
  let dx, dy;
  if(after.length === 1){ dx = after[0].x - before[0].x; dy = after[0].y - before[0].y; }
  else {
    const mid = a => ({x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2});
    const dist = a => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
    const m0 = mid(before), m1 = mid(after);
    dx = m1.x - m0.x; dy = m1.y - m0.y;
    CR.z = clampZ(CR.z * dist(after) / dist(before));
  }
  CR.cx -= dx / (s * CR.W); CR.cy -= dy / (s * CR.H);
  cropDraw();
});
const ptrEnd = e => ptrs.delete(e.pointerId);
cropStage.addEventListener('pointerup', ptrEnd);
cropStage.addEventListener('pointercancel', ptrEnd);
cropStage.addEventListener('wheel', e => { if(!CR.img) return; e.preventDefault(); CR.z = clampZ(CR.z * Math.exp(-e.deltaY * 0.0015)); cropDraw(); }, {passive: false});
$('#crop-z').addEventListener('input', e => { if(!CR.img) return; CR.z = clampZ(e.target.value); cropDraw(); });
window.addEventListener('resize', () => { if(cropDlg.open) cropDraw(); });
$('#crop-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if(f) cropLoadFile(f); });
function cropFinish(result){ const r = CR.resolve; CR.resolve = null; CR.seq++; ptrs.clear(); if(cropDlg.open) cropDlg.close(); r && r(result); }
$('#crop-cancel').addEventListener('click', () => cropFinish(null));
cropDlg.addEventListener('close', () => { if(CR.resolve) cropFinish(null); });
$('#crop-remove').addEventListener('click', e => { if(arm(e.currentTarget, 'Точно удалить фото?')) cropFinish({remove: true}); });
$('#crop-done').addEventListener('click', async e => {
  if(!CR.img){ toast('Сначала выберите фото.'); return; }
  const btn = e.currentTarget; btn.disabled = true;
  try {
    cropClamp();
    const side = Math.min(CR.W, CR.H) / CR.z;
    const cv = document.createElement('canvas');
    cv.width = cv.height = ROUND;
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(CR.img, CR.cx * CR.W - side / 2, CR.cy * CR.H - side / 2, side, side, 0, 0, ROUND, ROUND);
    const round = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.88));
    if(!round) throw new Error('Не удалось обработать фото.');
    cropFinish({round});
  } catch(err){ toast(errText(err)); }
  finally { btn.disabled = false; }
});
// Выбор файла: скрытое поле в документе (в «Выбрать другое фото» внутри окна своё поле)
const picker = document.createElement('input');
picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'; picker.className = 'picker';
let pickCb = null;
picker.addEventListener('change', () => { const f = picker.files[0], cb = pickCb; picker.value = ''; pickCb = null; if(f && cb) cb(f); });
function pickPhoto(cb){ pickCb = cb; document.body.appendChild(picker); picker.click(); }
// Фото уже есть: открываем его в окне (можно сдвинуть, заменить или удалить), иначе сначала выбор файла
async function askAvatar(){
  if(!navigator.onLine){ toast('Без интернета фото не сохранить. Попробуйте, когда связь вернётся.'); return; }
  const u = me(), src = avatarSrc(u);
  const ph = await (u.avatar && src ? cropPhoto({src, canRemove: true}) : new Promise(res => pickPhoto(file => cropPhoto({file, canRemove: !!u.avatar}).then(res))));
  if(!ph) return;
  toast(ph.remove ? 'Удаляю фото…' : 'Сохраняю фото…');
  try {
    const r = await pb.collection('users').update(u.id, {avatar: ph.remove ? null : new File([ph.round], 'avatar.jpg', {type: 'image/jpeg'})});
    if(!ph.remove){
      const src = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(ph.round); });
      Object.assign(AV, {name: r.avatar, src}); saveLS('avatar_' + u.id, {name: r.avatar, src});
    } else saveLS('avatar_' + u.id, null);
    pb.authStore.save(pb.authStore.token, r);
    render(true);
    toast(ph.remove ? 'Фото удалено' : 'Фото сохранено');
  } catch(e){ toast(errText(e)); }
}

/* ---------- Календарь занятий: месяц и год, только просмотр ---------- */
// Полный день: план выполнен целиком; неполный: сделано хотя бы одно задание
const calDlg = $('#cal');
const CAL = {view: 'month', y: 0, m: 0};
function studiedIn(prefix){
  let all = 0, full = 0;
  S.plans.forEach(p => { if(!String(p.date).startsWith(prefix)) return; const st = dayState(p); if(st){ all++; if(st === 'full') full++; } });
  return {all, full};
}
function calMonthCells(y, m, mini, plans){
  const first = new Date(y, m, 1), n = new Date(y, m + 1, 0).getDate(), t = todayISO();
  let html = '<span class="cd blank"></span>'.repeat(monIndex(first));
  for(let d = 1; d <= n; d++){
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`, st = dayState(plans.get(iso));
    const cls = `cd${st ? ' ' + st : ''}${iso === t ? ' today' : ''}${iso > t ? ' future' : ''}`;
    html += mini ? `<span class="${cls}"></span>` : `<span class="${cls}" aria-label="${d} ${MONF[m]}${st === 'full' ? ', план выполнен' : st === 'half' ? ', часть плана' : ''}">${d}</span>`;
  }
  return html;
}
const studiedText = c => c.all ? `занимались ${c.all} ${plural(c.all, DAYS_F)}${c.full ? `, из них весь план ${c.full}` : ''}` : 'занятий не было';
function calSel(el){
  const d = el && calDlg.contains(el) ? el.dataset : null;
  if(!d || !d.cal) return '';
  return d.m ? `[data-cal="open"][data-m="${d.m}"]` : `[data-cal="${d.cal}"]`;
}
function renderCal(sel){
  const {view, y, m} = CAL, month = view === 'month', plans = planMap();
  const now = new Date(), thisYear = now.getFullYear();
  const title = month ? `${MONN[m]} ${y}` : String(y);
  const where = month ? (y === thisYear && m === now.getMonth() ? 'В этом месяце' : `В ${MONP[m]}${y !== thisYear ? ' ' + y : ''}`) : (y === thisYear ? 'В этом году' : `В ${y} году`);
  const sum = studiedIn(month ? `${y}-${pad(m + 1)}-` : `${y}-`);
  const body = month
    ? `<div class="cal-wd" aria-hidden="true">${WDM.map(w => `<span>${w}</span>`).join('')}</div><div class="cal-grid">${calMonthCells(y, m, false, plans)}</div>`
    : `<div class="cal-year">${MONN.map((name, i) => { const k = studiedIn(`${y}-${pad(i + 1)}-`); return `<button type="button" class="cal-mini" data-cal="open" data-m="${i}" aria-label="${name}: ${studiedText(k)}"><b>${name}</b><span class="mini-grid" aria-hidden="true">${calMonthCells(y, i, true, plans)}</span></button>`; }).join('')}</div>`;
  if(sel === undefined) sel = calSel(document.activeElement);
  calDlg.innerHTML = `<div class="cal-in">
    <div class="dlg-head"><h2>Календарь занятий</h2><button type="button" class="icon-btn" data-cal="close" aria-label="Закрыть">×</button></div>
    <div class="cal-body">
      ${seg('cal', [['month', 'Месяц'], ['year', 'Год']], view, 'Вид календаря')}
      <div class="cal-nav"><button type="button" class="icon-btn" data-cal="prev" aria-label="${month ? 'Предыдущий месяц' : 'Предыдущий год'}">${ICON.left}</button><b aria-live="polite">${title}</b><button type="button" class="icon-btn" data-cal="next" aria-label="${month ? 'Следующий месяц' : 'Следующий год'}">${ICON.right}</button></div>
      <p class="cal-sum">${where}: ${studiedText(sum)}</p>
      ${body}
      <ul class="cal-legend"><li><span class="cd full"></span>план выполнен</li><li><span class="cd half"></span>часть плана</li><li><span class="cd today"></span>сегодня</li></ul>
    </div></div>`;
  const el = sel && calDlg.querySelector(sel);
  if(el) el.focus();
}
// Календарь закрывается крестиком, по фону, клавишей Esc и жестом «назад» (для этого шаг в истории)
function openCalendar(){
  const d = new Date();
  Object.assign(CAL, {view: 'month', y: d.getFullYear(), m: d.getMonth()});
  renderCal();
  calDlg.showModal();
  history.pushState({cal: 1}, '');
}
calDlg.addEventListener('close', () => { if(history.state && history.state.cal) history.back(); });
window.addEventListener('popstate', () => { if(calDlg.open) calDlg.close(); });
calDlg.addEventListener('click', e => {
  if(e.target === calDlg){ calDlg.close(); return; }
  const b = e.target.closest('[data-cal]');
  if(!b) return;
  const act = b.dataset.cal, sel = act === 'open' ? '[data-cal="month"]' : calSel(b);
  if(act === 'close'){ calDlg.close(); return; }
  if(act === 'month' || act === 'year') CAL.view = act;
  else if(act === 'open'){ CAL.view = 'month'; CAL.m = +b.dataset.m; }
  else if(act === 'prev' || act === 'next'){
    const k = act === 'prev' ? -1 : 1;
    if(CAL.view === 'year') CAL.y += k;
    else { const d = new Date(CAL.y, CAL.m + k, 1); CAL.y = d.getFullYear(); CAL.m = d.getMonth(); }
  }
  renderCal(sel);
});

/* ---------- Диалог с формой ---------- */
const dlg = $('#dlg'), form = $('#dlg-form');
let cur = null;
function openForm(o){
  cur = {...o, saved: false};
  form.innerHTML = `<div class="dlg-head"><h2>${esc(o.title)}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">×</button></div>
    <div class="dlg-body">${o.text ? `<p class="dlg-text">${esc(o.text)}</p>` : ''}${(o.fields || []).map(fd =>
      `<div class="field"><label for="fld-${fd.key}">${esc(fd.label)}</label><input class="inp" type="text" id="fld-${fd.key}" value="${esc((o.values || {})[fd.key] ?? '')}" maxlength="${fd.max || 300}" autocomplete="off"></div>`).join('')}</div>
    <p class="dlg-err" id="dlg-err" hidden></p>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn primary" id="dlg-ok">${esc(o.submit || 'Сохранить')}</button></div>`;
  if(!dlg.open) dlg.showModal();
}
function formErr(msg){ const p = $('#dlg-err'); if(!p) return; p.textContent = msg; p.hidden = !msg; }
form.addEventListener('submit', async e => {
  e.preventDefault();
  if(!cur) return;
  const v = {};
  for(const fd of cur.fields || []){ const el = form.querySelector('#fld-' + fd.key); v[fd.key] = el ? el.value.trim() : ''; }
  const miss = (cur.fields || []).find(fd => fd.required && !v[fd.key]);
  if(miss){ formErr(`Заполните поле «${miss.label}».`); return; }
  const ok = $('#dlg-ok'); ok.disabled = true; formErr('');
  try { await cur.onSave(v); cur.saved = true; dlg.close(); }
  catch(err){ formErr(errText(err)); }
  finally { ok.disabled = false; }
});
form.addEventListener('click', e => { if(e.target.closest('[data-close]')) dlg.close(); });
dlg.addEventListener('close', () => { cur = null; });
function arm(btn, text){
  if(btn.dataset.armed === '1') return true;
  btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = text;
  setTimeout(() => { if(btn.isConnected){ btn.dataset.armed = ''; btn.textContent = old; } }, 3500);
  return false;
}
const FIELD_RU = {email:'почта', password:'пароль', passwordConfirm:'повтор пароля', oldPassword:'текущий пароль', name:'имя', code:'код'};
function errText(e){
  if(!e) return 'Неизвестная ошибка.';
  if(e.isAbort) return 'Запрос прерван.';
  if(e.status === 0) return 'Нет связи с сервером. Проверьте интернет.';
  const r = e.response || {};
  const msg = r.message || e.message || '';
  if(/[а-яё]/i.test(msg)) return msg;
  const data = r.data || {};
  const keys = Object.keys(data);
  if(e.status === 400 && keys.length){
    if(data.email && data.email.code === 'validation_not_unique') return 'Этот адрес почты уже зарегистрирован.';
    if(data.password && /length/.test(data.password.code || '')) return 'Пароль должен быть не короче 8 символов.';
    if(data.passwordConfirm) return 'Пароли не совпадают.';
    if(data.oldPassword) return 'Текущий пароль введён неверно.';
    return 'Проверьте поля: ' + keys.map(k => FIELD_RU[k] || k).join(', ') + '.';
  }
  if(e.status === 401 || e.status === 403) return 'Нет доступа. Войдите заново.';
  if(e.status === 404) return 'Запись не найдена.';
  if(e.status === 429) return 'Слишком много запросов подряд. Подождите немного.';
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}

/* ---------- Нажатия ---------- */
document.addEventListener('click', async e => {
  const bk = e.target.closest('#main a[data-back]');
  if(bk){ e.preventDefault(); goBack(bk.dataset.back); return; }
  const a = e.target.closest('#main [data-act]');
  if(!a) return;
  const d = a.dataset;
  switch(d.act){
    case 'theme': setTheme(isDark() ? 'light' : 'dark'); if(route().name === 'profile') render(true); break;
    case 'avatar': askAvatar(); break;
    case 'calendar': openCalendar(); break;
    case 'edit-name': openForm({title: 'Имя', fields: [{key: 'name', label: 'Как вас зовут', max: 100}], values: {name: me().name || ''},
      async onSave(v){ const r = await pb.collection('users').update(me().id, {name: v.name}); pb.authStore.save(pb.authStore.token, r); render(true); }}); break;
    default: accountAction(a, d);
  }
});

document.addEventListener('keydown', e => {
  const a = e.target.closest && e.target.closest('#main [role="button"][data-act]');
  if(a && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); a.click(); }
});

/* ---------- Вход и регистрация ---------- */
let authMode = 'login', authInvite = '', isFirstRun = false;
async function showAuth(mode, invite){
  $('#app').hidden = true; $('#auth').hidden = false;
  authMode = mode || 'login'; if(invite) authInvite = invite;
  try { const r = await fetch('/api/greek/setup'); if(r.ok) isFirstRun = !!(await r.json()).firstRun; } catch(e){}
  if(isFirstRun) authMode = 'register';
  renderAuth();
}
function renderAuth(msg, ok){
  const b = $('#auth-body');
  const note = msg ? `<p class="${ok ? 'form-ok' : 'form-err'}">${esc(msg)}</p>` : '';
  if(authMode === 'register'){
    $('#auth-sub').textContent = isFirstRun ? 'Создайте аккаунт владельца. Вы станете администратором и сможете приглашать других.' : 'Регистрация по приглашению.';
    b.innerHTML = `<form class="stack" id="auth-form" data-mode="register" novalidate>
      ${isFirstRun ? '' : `<label>Код приглашения<input class="inp" type="text" id="a-invite" autocomplete="off" autocapitalize="characters" value="${esc(authInvite)}" required></label>`}
      <label>Имя<input class="inp" type="text" id="a-name" autocomplete="name"></label>
      <label>Почта<input class="inp" type="email" id="a-email" autocomplete="email" required></label>
      <label>Пароль (не короче 8 символов)<input class="inp" type="password" id="a-pass" autocomplete="new-password" minlength="8" required></label>
      <label>Повторите пароль<input class="inp" type="password" id="a-pass2" autocomplete="new-password" required></label>
      <label class="check"><input type="checkbox" id="a-consent"><span>Согласен на обработку персональных данных по <a href="/privacy.html" target="_blank" rel="noopener">политике конфиденциальности</a></span></label>
      ${note}<button class="btn primary big wide" type="submit">Создать аккаунт</button>
      ${isFirstRun ? '' : `<div class="auth-links"><button type="button" class="linkbtn" data-auth="login">У меня уже есть аккаунт</button></div>`}
    </form>`;
  } else if(authMode === 'reset'){
    $('#auth-sub').textContent = 'Пришлём ссылку для нового пароля на вашу почту.';
    b.innerHTML = `<form class="stack" id="auth-form" data-mode="reset" novalidate>
      <label>Почта<input class="inp" type="email" id="a-email" autocomplete="email" required></label>
      ${note}<button class="btn primary big wide" type="submit">Отправить ссылку</button>
      <div class="auth-links"><button type="button" class="linkbtn" data-auth="login">Вернуться ко входу</button></div>
    </form>`;
  } else {
    $('#auth-sub').textContent = 'по учебнику Маунса';
    b.innerHTML = `<form class="stack" id="auth-form" data-mode="login" novalidate>
      <label>Почта<input class="inp" type="email" id="a-email" autocomplete="email" required></label>
      <label>Пароль<input class="inp" type="password" id="a-pass" autocomplete="current-password" required></label>
      ${note}<button class="btn primary big wide" type="submit">Войти</button>
      <div class="auth-links"><button type="button" class="linkbtn" data-auth="register">Регистрация по приглашению</button><button type="button" class="linkbtn" data-auth="reset">Забыли пароль?</button></div>
    </form>`;
  }
}
$('#auth').addEventListener('click', e => { const b = e.target.closest('[data-auth]'); if(b){ authMode = b.dataset.auth; renderAuth(); } });
$('#auth').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('[type=submit]');
  const v = id => (f.querySelector('#' + id)?.value || '').trim();
  btn.disabled = true;
  try{
    if(f.dataset.mode === 'login'){
      if(!v('a-email') || !v('a-pass')) throw {msg:'Введите почту и пароль.'};
      try { await pb.collection('users').authWithPassword(v('a-email'), f.querySelector('#a-pass').value); }
      catch(err){ if(err.status === 400) throw {msg:'Неверная почта или пароль.'}; throw err; }
      startApp();
    } else if(f.dataset.mode === 'register'){
      const pass = f.querySelector('#a-pass').value, pass2 = f.querySelector('#a-pass2').value;
      if(!isFirstRun && !v('a-invite')) throw {msg:'Введите код приглашения.'};
      if(!v('a-email')) throw {msg:'Введите почту.'};
      if(pass.length < 8) throw {msg:'Пароль должен быть не короче 8 символов.'};
      if(pass !== pass2) throw {msg:'Пароли не совпадают.'};
      if(!f.querySelector('#a-consent').checked) throw {msg:'Нужно согласие на обработку персональных данных.'};
      const body = {email: v('a-email'), password: pass, passwordConfirm: pass2, name: v('a-name'), theme: themePref()};
      if(!isFirstRun) body.invite = v('a-invite');
      await pb.collection('users').create(body);
      await pb.collection('users').authWithPassword(body.email, pass);
      isFirstRun = false;
      startApp();
    } else {
      if(!v('a-email')) throw {msg:'Введите почту.'};
      await pb.collection('users').requestPasswordReset(v('a-email'));
      authMode = 'login'; renderAuth('Если такой адрес зарегистрирован, письмо со ссылкой уже отправлено. Проверьте и папку «Спам».', true); return;
    }
  }catch(err){
    const fe = $('#auth-form');
    if(fe){ let p = fe.querySelector('.form-err'); if(!p){ p = document.createElement('p'); p.className = 'form-err'; fe.querySelector('[type=submit]').before(p); } p.textContent = err.msg || errText(err); }
  }finally{ btn.disabled = false; }
});

/* ---------- Профиль: пароль, приглашения, выход ---------- */
const INV_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function inviteCode(){ const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a, x => INV_ABC[x % INV_ABC.length]).join(''); }
async function copyText(text){
  try { await navigator.clipboard.writeText(text); toast('Ссылка скопирована'); }
  catch(e){ window.prompt && window.prompt('Скопируйте:', text); }
}
function signOut(){ saveLS(cacheKey(), null); saveLS(qKey(), null); saveLS('avatar_' + me().id, null); pb.authStore.clear(); location.hash = ''; location.reload(); }
async function accountAction(a, d){
  try{
    switch(d.act){
      case 'save-pass': {
        const old = $('#p-old').value, n1 = $('#p-new').value, n2 = $('#p-new2').value;
        if(n1.length < 8){ toast('Новый пароль должен быть не короче 8 символов.'); return; }
        if(n1 !== n2){ toast('Новые пароли не совпадают.'); return; }
        const email = me().email;
        await pb.collection('users').update(me().id, {oldPassword: old, password: n1, passwordConfirm: n2});
        await pb.collection('users').authWithPassword(email, n1);
        toast('Пароль изменён'); render(true); break;
      }
      case 'new-invite': {
        const body = {code: inviteCode(), note: $('#i-note').value.trim(), max_uses: Number($('#i-max').value), uses: 0, expires: $('#i-exp').value};
        const rec = await pb.collection('invites').create(body);
        S.invites.push(rec); render(true);
        copyText(`${location.origin}/?invite=${rec.code}`);
        break;
      }
      case 'copy-invite': copyText(`${location.origin}/?invite=${d.code}`); break;
      case 'del-invite': {
        if(!arm(a, 'Точно?')) return;
        await pb.collection('invites').delete(d.id);
        S.invites = S.invites.filter(i => i.id !== d.id); render(true); break;
      }
      case 'logout': {
        if(Object.keys(Q).length && !arm(a, 'Часть прогресса ещё не отправлена. Выйти всё равно?')) return;
        signOut(); break;
      }
      case 'delete-account': {
        if(!arm(a, 'Всё будет удалено. Нажмите ещё раз')) return;
        await pb.collection('users').delete(me().id);
        signOut(); break;
      }
    }
  }catch(e){ toast(errText(e)); }
}

let tt = 0;
function toast(msg){ const el = $('#toast'); const host = [cropDlg, calDlg, dlg].find(x => x.open) || document.body; if(el.parentNode !== host) host.appendChild(el); el.textContent = msg; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2800); }

boot();
})();
