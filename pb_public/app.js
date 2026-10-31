(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Справочники ---------- */
// LETTERS (data/letters.js), WORDS и SPECIAL (data/words.js), PARTS и CHAPTERS (data/chapters.js),
// DICT (data/dictionary.js, словарь учебника), VERBS (data/parts.js, основные формы) и карта курса
// COURSE, PP_OPEN, PP_EX, PP_NAME, PP_VERB_CH, COURSE_END (data/course.js) подключены отдельными файлами
const INT = [0, 1, 3, 7, 14, 30, 60]; // интервалы повторения по ступеням 0–6, дней
const NEW = 10;      // новых слов за сессию и в плане на день (и ещё до 10 добавленных вручную)
const NEW_PARTS = 5; // новых полужирных основных форм в плане на день
const QUIZ_N = 20;   // вопросов в тесте слов и основных форм
const SURE = 4;      // с этой ступени (интервал от двух недель) слово «уверенно»
const NT_WORDS = 138167; // слов в тексте Нового Завета (учебник, конец главы 8)
// forms: прогресс полужирных основных форм (form_progress, номер = глагол × 10 + форма). Старая parts_progress (этап 2) не загружается
const PBN = {words:'word_progress', letters:'letter_progress', plans:'plan_days', forms:'form_progress', added:'word_added'};
const KEYS = Object.keys(PBN);
const FIELDS = {words:['n','level','due','hard'], letters:['n','known','hard'], plans:['date','tasks','done'], forms:['n','level','due','hard'], added:['n']};
const MATCH = {words:'n', letters:'n', plans:'date', forms:'n', added:'n'}; // по какому полю запись единственная у пользователя
// Все слова: лексический минимум (как в главах, номера 1–320) и остальные статьи словаря (номера с 321).
// Частотность и часть речи у всех слов из словаря; d: статья словаря (у εἰ μή её нет)
const DICTN = new Map(DICT.map(d => [d.n, d]));
const POS_MIN = {n: 'n', v: 'v', a: 'a', x: 'q'};
const MINW = WORDS.map(w => { const d = DICTN.get(w.n); return {...w, f: d ? d.f : w.f, k: d ? d.k : POS_MIN[w.k] || 'q', d: d || null, min: true}; });
const LEX = MINW.concat(DICT.filter(d => d.n > 320).map(d => ({n: d.n, g: d.g, ru: d.ru, f: d.f, ch: d.ch, p: d.p, k: d.k, d, min: false})));
const WORD = new Map(LEX.map(w => [w.n, w]));
const BY_FREQ = LEX.slice().sort((a, b) => b.f - a.f || a.n - b.n);
// Весь словарь в порядке книги; слово минимума без статьи (εἰ μή) стоит рядом по алфавиту
let FULL = null;
function fullList(){
  if(FULL) return FULL;
  const ord = s => norm(split(s)[0]);
  FULL = DICT.map(d => WORD.get(d.n));
  MINW.filter(w => !w.d).forEach(w => { const i = FULL.findIndex(x => ord(x.d.g) > ord(w.g)); FULL.splice(i < 0 ? FULL.length : i, 0, w); });
  return FULL;
}
const VERB = new Map(VERBS.map(v => [v.n, v]));
const VERB_OF = new Map(VERBS.map(v => [v.d, v])); // номер слова → глагол основных форм
const vFreq = v => (WORD.get(v.d) || {}).f || 0;
const CHS = [...new Set(MINW.map(w => w.ch))];
const chapter = n => CHAPTERS.find(c => c.n === n);
const courseOf = n => COURSE.find(c => c.n === n);
const chWords = ch => MINW.filter(w => w.ch === ch);
// Основные формы по учебнику: форма открывается в главе, где учебник вводит это время (PP_OPEN, исключения PP_EX),
// глагол входит в раздел вместе с главой, где он есть в лексическом минимуме (два глагола вне минимума: PP_VERB_CH).
// FORMS: все формы, которые есть в таблице книги; n = номер глагола × 10 + номер формы; ch: глава, с которой форма открыта
const verbCh = v => PP_VERB_CH[v.n] || (v.d <= 320 && WORD.get(v.d) ? WORD.get(v.d).ch : COURSE_END);
const formOf = (v, i) => i ? v.f[i - 1] : v.v;
const FORMS = [];
VERBS.forEach(v => [v.v].concat(v.f).forEach((g, i) => {
  if(g === '–') return;
  FORMS.push({v, i, n: v.n * 10 + i, g, bold: (v.b || []).includes(i), ch: Math.max(verbCh(v), PP_EX[v.n + ':' + i] || PP_OPEN[i])});
}));
const FORM = new Map(FORMS.map(f => [f.n, f]));
// Полужирные формы (их автор велит заучить, с. 412–413) в порядке открытия: по главам, затем от частых глаголов к редким
const BOLD = FORMS.filter(f => f.bold).sort((a, b) => a.ch - b.ch || vFreq(b.v) - vFreq(a.v) || a.n - b.n);
const vForms = v => FORMS.filter(f => f.v === v);

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
const S = {words:[], letters:[], plans:[], forms:[], added:[], invites:[], loaded:false};
const WP = new Map(), LP = new Map(), FP = new Map(), AD = new Map(); // прогресс по номеру слова, буквы и формы; добавленные слова
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
  (list || MINW).forEach(w => c[wState(w.n)]++);
  return c;
}
// Полужирные основные формы: те же состояния и тот же порядок повторения, прогресс в form_progress
const fRec = n => FP.get(n);
function fState(n){ const r = fRec(n); if(!r) return 'new'; if(r.hard) return 'hard'; return (r.level || 0) >= SURE ? 'sure' : 'learn'; }
const isFDue = n => { const r = fRec(n); return !!r && r.due <= today(); };
const isAdded = n => AD.has(n);
// Доля текста НЗ: сумма частотности выученных слов, делённая на число слов НЗ
const coverage = () => LEX.reduce((a, w) => a + (isLearned(w.n) ? w.f : 0), 0);
function reindex(key){
  if(key === 'words'){ WP.clear(); S.words.forEach(r => WP.set(r.n, r)); }
  if(key === 'letters'){ LP.clear(); S.letters.forEach(r => LP.set(r.n, r)); }
  if(key === 'forms'){ FP.clear(); S.forms.forEach(r => FP.set(r.n, r)); }
  if(key === 'added'){ AD.clear(); S.added.forEach(r => AD.set(r.n, r)); }
}
// Ответ «Знаю» или «Повторить» (ошибка в тесте): изменения записи прогресса слова или глагола.
// «Знаю» новому или ошибочному в этой сессии: ступень 1 на завтра; со сроком: следующая ступень; «Повторить»: ступень 0, сегодня, трудное
function srsPatch(s, failed, ok){
  const t = today();
  if(!ok) return {level: 0, due: t, hard: true};
  if(!s || failed) return {level: 1, due: addDays(t, 1), hard: false};
  if(s.due <= t){ const b = Math.min((s.level || 0) + 1, 6); return {level: b, due: addDays(t, INT[b]), hard: false}; }
  return s.hard ? {hard: false} : null;
}

/* ---------- Текущая глава ---------- */
// Курс идёт по учебнику: текущая глава хранится в users.chapter (1–36, после окончания курса 37).
// Глава закрывается только кнопкой «Глава пройдена», вернуться можно кнопкой «Сделать текущей».
// Без связи новая глава запоминается на устройстве (gk_chapter_<id>) и отправляется, когда связь вернётся
let CHP = 0;
const chKey = () => 'chapter_' + me().id;
const curCh = () => Math.min(Math.max((CHP || me().chapter || 1) | 0, 1), COURSE_END);
// Глава известна: в записи пользователя есть поле chapter (без связи после обновления может остаться старая запись)
const chKnown = () => !!CHP || me().chapter !== undefined;
const passedCount = () => Math.min(curCh() - 1, CHAPTERS.length);
const chStatus = n => n < curCh() ? 'passed' : n === curCh() ? 'current' : 'ahead';
const isOpen = f => f.ch <= curCh();
const openBold = () => BOLD.filter(isOpen);
// Слова, из которых план берёт новые: лексический минимум глав до текущей по порядку учебника;
// после главы 36 ещё не начатые слова минимума, затем остальной словарь от частых слов к редким
let PW = null;
function planWords(){
  const c = curCh();
  if(!PW || PW.c !== c) PW = {c, list: c > 36 ? MINW.concat(BY_FREQ.filter(w => !w.min)) : MINW.filter(w => w.ch <= c)};
  return PW.list;
}
function setChapter(n){
  CHP = n; saveLS(chKey(), n);
  pushChapter();
  afterChapterChange();
  render(true);
}
async function pushChapter(){
  if(!CHP || !pb.authStore.isValid) return;
  const n = CHP;
  try {
    const r = await pb.collection('users').update(me().id, {chapter: n});
    pb.authStore.save(pb.authStore.token, r);
    if(CHP === n){ CHP = 0; saveLS(chKey(), null); }
    schedule();
  } catch(e){
    if(e && e.status){ CHP = 0; saveLS(chKey(), null); toast('Не удалось сохранить главу: ' + errText(e)); render(true); }
  }
}

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
      const q = Q[qk], rec = PBN[q.key] && findLocal(q.key, q.val);
      if(!rec){ delete Q[qk]; continue; } // в том числе записи старой parts_progress, оставшиеся с этапа 2
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
  cacheTimer = setTimeout(() => saveLS(cacheKey(), Object.fromEntries(KEYS.map(k => [k, S[k]]))), 300);
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
const setForm = (n, patch) => saveRec('forms', n, patch);

/* ---------- План на сегодня ---------- */
// Задания: review: слова с подошедшим сроком из любых глав; new: 10 новых слов лексического минимума глав до текущей
// по порядку учебника и до 10 слов, добавленных из словаря вручную; parts: до 5 новых полужирных основных форм открытых
// времён и формы со сроком; alphabet: трудные и невыученные буквы, с главы 3. План составляется при первом открытии дня
// и хранится в plan_days. У заданий new и parts есть ch: глава, для которой они составлены
const TASK_ORDER = ['review', 'new', 'parts', 'alphabet'];
const todayPlan = () => S.plans.find(p => p.date === today());
const partsOn = () => !me().parts_off;
const addedWaiting = () => S.added.slice().sort((a, b) => String(a.created).localeCompare(String(b.created))).map(r => WORD.get(r.n)).filter(w => w && !wRec(w.n));
function nextNew(){
  const mine = addedWaiting().slice(0, NEW);
  const next = planWords().filter(w => !wRec(w.n) && !mine.includes(w)).slice(0, NEW);
  return next.concat(mine).map(w => w.n);
}
function partsTask(){
  if(!partsOn()) return null;
  const forms = openBold().filter(f => !fRec(f.n)).slice(0, NEW_PARTS).map(f => f.n);
  const due = BOLD.filter(f => isFDue(f.n)).length;
  return forms.length || due ? {key: 'parts', forms, count: due, ch: curCh(), done: false} : null;
}
const lettersLeft = () => LETTERS.filter(L => { const r = lRec(L.n); return !r || !r.known || r.hard; });
function taskDeck(t){
  if(t.key === 'review') return LEX.filter(w => isDue(w.n));
  if(t.key === 'new') return (t.words || []).map(n => WORD.get(n)).filter(w => w && (!wRec(w.n) || isDue(w.n)));
  if(t.key === 'parts'){
    const fresh = (t.forms || []).map(n => FORM.get(n)).filter(f => f && !fRec(f.n));
    return BOLD.filter(f => isFDue(f.n)).concat(fresh);
  }
  if(t.key === 'alphabet') return lettersLeft();
  return [];
}
function buildPlan(){
  const tasks = [];
  const due = taskDeck({key: 'review'}).length;
  if(due) tasks.push({key: 'review', count: due, done: false});
  const next = nextNew();
  if(next.length) tasks.push({key: 'new', words: next, ch: curCh(), done: false});
  const pt = partsTask();
  if(pt) tasks.push(pt);
  const abc = lettersLeft().length;
  if(abc && curCh() >= 3) tasks.push({key: 'alphabet', count: abc, done: false});
  return tasks;
}
// Привести сегодняшний план в соответствие с текущей главой. Ещё не начатые задания new и parts, составленные
// для другой главы (или старым приложением), пересобираются; алфавит до главы 3 убирается.
// add: добавить недостающие задания (после нажатия «Глава пройдена» или «Сделать текущей»), если план ещё не выполнен
function fitPlan(tasks, add){
  const ch = curCh(), out = tasks.slice();
  let changed = false;
  const i = out.findIndex(t => t.key === 'new'), t = out[i];
  if(i >= 0 ? !t.done && t.ch !== ch && !(t.words || []).some(n => wRec(n)) : add){
    const next = nextNew();
    if(i >= 0){ if(next.length) out[i] = {...t, words: next, ch}; else out.splice(i, 1); changed = true; }
    else if(next.length){ out.push({key: 'new', words: next, ch, done: false}); changed = true; }
  }
  const j = out.findIndex(t => t.key === 'parts'), pt0 = out[j];
  if(j >= 0 ? !pt0.done && (pt0.verbs || (pt0.ch !== ch && !(pt0.forms || []).some(n => fRec(n)))) : add && partsOn()){
    const pt = partsTask();
    if(j >= 0){ if(pt) out[j] = pt; else out.splice(j, 1); changed = true; }
    else if(pt){ out.push(pt); changed = true; }
  }
  const k = out.findIndex(t => t.key === 'alphabet');
  if(k >= 0 && !out[k].done && ch < 3){ out.splice(k, 1); changed = true; }
  if(k < 0 && add && ch >= 3){ const n = lettersLeft().length; if(n){ out.push({key: 'alphabet', count: n, done: false}); changed = true; } }
  return changed ? out : null;
}
// Составить план на сегодня, если его ещё нет; согласовать с текущей главой; отметить задания, которые уже нечего делать
function checkPlan(){
  if(!UI.ready || !pb.authStore.isValid || !chKnown()) return;
  const p = todayPlan();
  if(!p){ const tasks = buildPlan(); saveRec('plans', today(), {tasks, done: tasks.length === 0}); return; }
  let tasks = fitPlan(p.tasks || [], false), changed = !!tasks;
  tasks = tasks || p.tasks || [];
  if(tasks.some(t => !t.done && !taskDeck(t).length)){ tasks = tasks.map(t => !t.done && !taskDeck(t).length ? {...t, done: true} : t); changed = true; }
  if(changed) saveRec('plans', today(), {tasks, done: tasks.every(t => t.done)});
}
// Глава сменилась: ещё не начатые задания пересобираются; недостающие задания появляются сегодня, если план не выполнен
function afterChapterChange(){
  const p = todayPlan(); if(!p || !UI.ready) return;
  const add = !p.done || !(p.tasks || []).length;
  const tasks = fitPlan(p.tasks || [], add);
  if(tasks) saveRec('plans', today(), {tasks, done: tasks.every(t => t.done)});
}
// Выключатель основных форм в профиле: задание убирается, если не сделано, или добавляется
function replanToday(){
  const p = todayPlan(); if(!p) return;
  const tasks = (p.tasks || []).slice();
  const j = tasks.findIndex(t => t.key === 'parts');
  if(!partsOn() && j >= 0 && !tasks[j].done) tasks.splice(j, 1);
  if(partsOn() && j < 0){ const pt = partsTask(); if(pt) tasks.push(pt); }
  saveRec('plans', today(), {tasks, done: tasks.every(t => t.done)});
}
// Слово из словаря добавлено в изучение: попадает в новые слова сегодняшнего плана, если задание ещё не выполнено
function addToStudy(n){
  if(wRec(n) || isAdded(n)) return 'already';
  saveRec('added', n, {});
  const p = todayPlan(), t = p && (p.tasks || []).find(x => x.key === 'new');
  if(t && t.done) return 'tomorrow';
  const tasks = (p ? p.tasks || [] : []).filter(x => x.key !== 'new').concat({...(t || {key: 'new', ch: curCh(), done: false}), words: ((t && t.words) || []).filter(x => x !== n).concat(n)});
  if(p) saveRec('plans', today(), {tasks, done: false});
  return 'today';
}
function markTask(key, count){
  const p = todayPlan(); if(!p) return;
  const tasks = (p.tasks || []).map(t => t.key === key ? {...t, done: true, ...(count ? {count} : {})} : t);
  saveRec('plans', today(), {tasks, done: tasks.every(t => t.done)});
}
const nextTask = () => { const p = todayPlan(); return p && (p.tasks || []).find(t => !t.done); };
function chRange(ws){
  const chs = [...new Set(ws.map(w => w.ch))].sort((a, b) => a - b);
  return chs.length === 1 ? `глава ${chs[0]}` : `главы ${chs[0]}–${chs[chs.length - 1]}`;
}
// Подпись задания «Новые слова»: главы минимума; после курса слова из словаря; отдельно добавленные вручную
function newInfo(ns){
  const ws = ns.map(n => WORD.get(n)).filter(Boolean), my = ws.filter(w => isAdded(w.n)), rest = ws.filter(w => !isAdded(w.n));
  const range = rest.length && rest.every(w => w.min) ? chRange(rest) : '';
  const sub = [];
  if(rest.length && !range) sub.push('из словаря, от частых к редким');
  if(my.length) sub.push(`добавленные вами: ${my.length}`);
  return {range, sub: sub.join(', ')};
}
function taskInfo(t){
  const n = t.done ? (t.count || (t.words || []).length || (t.forms || t.verbs || []).length) : t.key === 'new' ? (t.words || []).length : taskDeck(t).length;
  if(t.key === 'review') return {title: `Слова к повторению · ${n}`, min: Math.max(1, Math.ceil(n * 8 / 60)), href: '#/task/review'};
  if(t.key === 'new'){ const r = newInfo(t.words || []); return {title: `Новые слова${r.range ? ', ' + r.range : ''} · ${n}`, sub: r.sub, min: Math.max(2, Math.ceil(n * 25 / 60)), href: '#/task/new'}; }
  if(t.key === 'parts'){ const fresh = (t.forms || []).filter(x => !fRec(x)).length; return {title: `Основные формы · ${n}`, sub: t.done ? '' : [fresh ? `новых форм: ${fresh}` : '', n - fresh > 0 ? `повторить: ${n - fresh}` : ''].filter(Boolean).join(', '), min: Math.max(1, Math.ceil(n * 12 / 60)), href: '#/task/parts'}; }
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
  CHP = +loadLS(chKey(), 0) || 0;
  UI.day = today();
  // сначала то, что сохранено на устройстве: приложение открывается и без интернета
  if(loadCache()) S.loaded = true;
  render(true);
  try {
    await loadAll();
    S.loaded = true; UI.ready = true; $('#notice').hidden = true; render(true);
    if(route().name === 'profile') loadProfileExtras();
    flush(); pushChapter();
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
  if(S.loaded && pb.authStore.isValid){ flush(); pushChapter(); loadAll().catch(() => {}); }
});
window.addEventListener('online', () => { $('#notice').hidden = true; if(S.loaded){ flush(); pushChapter(); loadAll().catch(() => {}); } });
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
   #/dict словарь, #/words?r=НАБОР&m=quiz карточки и тест слов, #/parts?m=cards|quiz|table&v=N основные формы,
   #/progress, #/profile ---------- */
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
  parts: {f: vParts, init: initParts, still: true},
  progress: {f: vProgress}, profile: {f: vProfile},
};
const TAB = {home:'today', task:'today', course:'course', ch:'course', abc:'course', parts:'course', dict:'dict', words:'dict', progress:'progress'};
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
  if(!tasks.length) planCard = `<section class="card plan"><h2>План на сегодня</h2><p class="lead">${curCh() < 3
      ? 'Заданий пока нет: в первых главах заучивать нечего. Прочитайте главу и нажмите «Глава пройдена».'
      : 'На сегодня заданий нет: повторять нечего, новые слова пройденных глав начаты. Загляните завтра.'}</p></section>`;
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
  return `${head('Сегодня', longDate())}<div class="cols"><div class="col">${chapterNow()}${planCard}</div><div class="col">${courseMeters()}</div></div>`;
}
// «с. 154–163», «с. 69–72; обзор № 4: с. 89–92»
const pgs = r => r[0] === r[1] ? `с. ${r[0]}` : `с. ${r[0]}–${r[1]}`;
const tbText = c => `Учебник: ${pgs(c.tb)}`;
const wbText = c => c.wb.length ? `Тетрадь: ${c.wb.map(r => (r[2] ? r[2].toLowerCase() + ', ' : '') + pgs(r)).join('; ')}` : 'В тетради упражнений нет';
const learnList = c => `<ul class="learn-list">${c.learn.map(([t, pg]) => `<li><span>${esc(t)}</span><small>с. ${esc(pg)}</small></li>`).join('')}</ul>`;
// Подсказка в карточке текущей главы: что осталось сделать до кнопки «Глава пройдена»
function chapterHint(n){
  const ws = chWords(n);
  if(n === 3){ const k = lettersKnown(); return k < LETTERS.length ? `Алфавит в плане, пока не выучены все буквы: знаю ${k} из ${LETTERS.length}.` : 'Все буквы выучены. Когда прочитаете главу, нажмите «Глава пройдена».'; }
  if(ws.length){
    const left = planWords().filter(w => !wRec(w.n)).length, own = ws.filter(w => !wRec(w.n)).length;
    if(!left) return 'Слова главы начаты. Когда прочитаете главу, нажмите «Глава пройдена».';
    return `Слова главы приходят в новых словах плана, по ${NEW} в день: не начато ${own} из ${ws.length}${left > own ? `, из прошлых глав ещё ${left - own}` : ''}.`;
  }
  return 'В этой главе нет слов лексического минимума. Когда прочитаете главу, нажмите «Глава пройдена».';
}
function chapterNow(){
  const n = curCh();
  if(n > 36) return `<section class="card chap-now"><span class="kicker">Курс</span><h2>Учебник пройден</h2>
    <p class="lead">Все 36 глав пройдены. Новые слова теперь приходят из словаря учебника, от частых слов к редким.</p>
    <a class="btn" href="#/course">Открыть курс</a></section>`;
  const c = chapter(n), k = courseOf(n);
  return `<section class="card chap-now">
    <span class="kicker">Текущая глава</span>
    <a class="chap-link" href="#/ch/${n}"><h2>Глава ${n}</h2><span>${esc(c.t)}</span></a>
    <p class="pages">${tbText(k)}<br>${wbText(k)}</p>
    ${k.learn.length ? `<details class="tolearn" data-fold="learn"${UI.folds.has('learn') ? ' open' : ''}><summary><span>Заучить в этой главе <span class="muted">· ${k.learn.length}</span></span>${ICON.chev}</summary>${learnList(k)}</details>`
      : '<p class="hint">В этой главе автор не просит ничего заучивать.</p>'}
    <p class="hint">${esc(chapterHint(n))}</p>
    <button type="button" class="btn primary" data-act="pass">${ICON.check}Глава пройдена</button>
  </section>`;
}
function courseMeters(){
  const passed = passedCount(), learned = MINW.filter(w => isLearned(w.n)).length;
  return `<section class="card chap-card">
    <div class="meter"><div class="meter-t"><span>Курс</span><b>${passed} ${plural(passed, CH_F)} из ${CHAPTERS.length}</b></div>${bar(passed, CHAPTERS.length)}</div>
    <div class="meter"><div class="meter-t"><span>Слова минимума</span><b>${learned} из ${MINW.length}</b></div>${bar(learned, MINW.length, 'good')}</div>
    <div class="meter"><div class="meter-t"><span>Текст Нового Завета</span><b>${pctNT()}</b></div>${bar(coverage(), NT_WORDS, 'good')}</div>
  </section>`;
}
// «Глава пройдена»: окно подтверждения; незаконченное никуда не пропадает
function passChapter(){
  const n = curCh(); if(n > 36) return;
  const notes = [];
  if(n === 3 && lettersKnown() < LETTERS.length) notes.push('Ещё не все буквы отмечены «знаю». Алфавит останется в плане, пока вы их не выучите.');
  const own = chWords(n).filter(w => !wRec(w.n)).length;
  if(own) notes.push(`Ещё не начаты ${own} ${plural(own, WORDS_F)} этой главы. Они никуда не пропадут: придут в новых словах раньше слов следующей главы.`);
  const p = todayPlan(), t = p && (p.tasks || []).find(x => x.key === 'new');
  if(n < 36 && chWords(n + 1).length && t && (t.done || (t.words || []).some(x => wRec(x)))) notes.push('Новые слова на сегодня уже начаты, слова следующей главы придут в плане завтра. Начать их сразу можно на экране главы.');
  const next = n < 36 ? `Текущей станет глава ${n + 1}: ${chapter(n + 1).t}.` : 'Это последняя глава. После неё новые слова пойдут из словаря, от частых к редким.';
  openForm({title: `Глава ${n} пройдена?`, text: [next].concat(notes).join(' '), submit: 'Глава пройдена',
    async onSave(){ setChapter(n + 1); toast(n < 36 ? `Текущая глава: ${n + 1}` : 'Учебник пройден'); }});
}
// «Сделать текущей» у пройденной главы: прогресс не стирается
function makeCurrent(n){
  openForm({title: `Вернуться к главе ${n}?`, text: `Глава ${n} снова станет текущей. Прогресс не сотрётся: начатые слова и формы остаются в повторении. Новые слова и формы будут приходить только из глав до ${n}-й включительно.`, submit: 'Сделать текущей',
    async onSave(){ setChapter(n); toast(`Текущая глава: ${n}`); }});
}

/* ---------- Задание плана ---------- */
function vTask(r){
  const p = todayPlan(), t = p && (p.tasks || []).find(x => x.key === r.id);
  if(!t) return `${subHead('#/', 'Сегодня', 'Задание')}<section class="card"><p>Этого задания сегодня нет в плане.</p><a class="btn" href="#/">К плану</a></section>`;
  const i = taskInfo(t);
  if(t.key === 'alphabet') return `${subHead('#/', 'Сегодня', 'Алфавит', 'Карточки трудных и ещё не выученных букв')}<div class="trainer">${abcCardsHTML(true)}</div>`;
  if(t.key === 'parts') return `${subHead('#/', 'Сегодня', 'Основные формы', 'Новые полужирные формы и формы, у которых подошёл срок повторения')}<div class="trainer">${pCardsHTML(true)}</div>`;
  return `${subHead('#/', 'Сегодня', esc(i.title.replace(/ · \d+$/, '')), t.key === 'new' ? (i.sub ? 'Новые слова: ' + esc(i.sub) : 'Новые слова по порядку учебника') : 'Слова, у которых подошёл срок повторения')}<div class="trainer">${wCardsHTML(true)}</div>`;
}
function initTask(r){
  const p = todayPlan(), t = p && (p.tasks || []).find(x => x.key === r.id);
  if(!t) return;
  if(t.key === 'alphabet') startAbcCards(t); else if(t.key === 'parts') startPCards(t); else startWCards(t);
}
// Экран «задание выполнено» и переход к следующему
function taskDoneHTML(text){
  const nt = nextTask();
  return `<div class="done-box"><span class="done-ic">${ICON.done}</span><p>${text}</p>
    <div class="row center">${nt ? `<a class="btn primary" href="${taskInfo(nt).href}">Следующее задание</a><a class="btn" href="#/">К плану</a>` : `<a class="btn primary" href="#/">К плану</a>`}</div></div>`;
}

/* ---------- Курс ---------- */
const ST_TEXT = {passed: 'пройдена', current: 'текущая', ahead: 'впереди'};
function chapterRow(c){
  const ws = chWords(c.n), st = chStatus(c.n);
  let sub = `с. ${courseOf(c.n).tb[0]}`;
  if(c.n === 3) sub += ` · знаю ${lettersKnown()} из ${LETTERS.length} букв`;
  else if(ws.length) sub += ` · ${ws.length} ${plural(ws.length, WORDS_F)}, выучено ${ws.filter(w => isLearned(w.n)).length}`;
  return `<a class="ch-row ${st}" href="#/ch/${c.n}"><span class="num">${c.n}</span>
    <span class="tt"><b>${esc(c.t)}</b><small>${sub}</small></span><span class="st ${st}">${st === 'passed' ? ICON.check : ''}${ST_TEXT[st]}</span></a>`;
}
function vCourse(){
  const passed = passedCount(), n = curCh();
  return `${head('Курс', `Маунс, «Основы библейского греческого языка» · ${n > 36 ? 'учебник пройден' : `текущая глава ${n}, пройдено ${passed} из ${CHAPTERS.length}`}`)}
    <div class="parts">${PARTS.map(p => `<section class="card part"><h2><span>Часть ${p.n}</span>${esc(p.t)}</h2>
      <div class="ch-list">${CHAPTERS.filter(c => c.n >= p.from && c.n <= p.to).map(chapterRow).join('')}</div></section>`).join('')}</div>
    ${partsCard()}
    <p class="hint">Главы открываются по порядку: следующая становится текущей, когда вы нажимаете «Глава пройдена». Чтобы вернуться к пройденной главе, откройте её и нажмите «Сделать текущей». Главы впереди можно смотреть и учить их слова карточками, в план на день они придут в свой черёд.</p>`;
}
// Полужирные формы, которые открываются в главе n
const formsOfChapter = n => BOLD.filter(f => f.ch === n);
const formName = f => PP_NAME[f.v.n + ':' + f.i] || PP_LABELS[f.i];
function vChapter(r){
  const c = chapter(Number(r.id));
  if(!c) return `${subHead('#/course', 'Курс', 'Глава не найдена')}`;
  const k = courseOf(c.n), st = chStatus(c.n), ws = chWords(c.n), learned = ws.filter(w => isLearned(w.n)).length;
  const status = st === 'current'
      ? `<section class="card chap-now"><span class="kicker">Текущая глава</span><p class="hint">${esc(chapterHint(c.n))}</p><button type="button" class="btn primary" data-act="pass">${ICON.check}Глава пройдена</button></section>`
    : st === 'passed'
      ? `<section class="card"><span class="kicker ok-t">${ICON.check}Глава пройдена</span><p class="hint">Её слова и формы остаются в повторении. Можно вернуться к ней: новые слова и формы снова будут приходить только из глав до этой.</p><button type="button" class="btn" data-act="make-current" data-n="${c.n}">Сделать текущей</button></section>`
      : `<section class="card"><span class="kicker">Глава впереди</span><p class="hint">Смотреть главу и учить её слова карточками можно уже сейчас. В план на день они придут, когда глава станет текущей (сейчас глава ${curCh()}).</p></section>`;
  const learn = `<section class="card"><h2>Заучить в этой главе</h2>${k.learn.length ? learnList(k) : '<p class="hint">В этой главе автор не просит ничего заучивать.</p>'}
      ${k.minor.length ? `<h3 class="minor-h">Второстепенное</h3><ul class="minor-list">${k.minor.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      <p class="src">Составлено по учебнику; подробно со ссылками в docs/course-map.md.</p></section>`;
  const words = c.n === 3
    ? `<section class="card"><div class="plan-top"><h2>Алфавит</h2><span class="muted">знаю ${lettersKnown()} из ${LETTERS.length}</span></div>${bar(lettersKnown(), LETTERS.length, 'good')}
        <div class="row"><a class="btn primary" href="#/abc">${ICON.cards}Карточки</a><a class="btn" href="#/abc?m=quiz">${ICON.quiz}Тест</a><a class="btn" href="#/abc?m=table">${ICON.table}Таблица</a></div></section>`
    : ws.length ? `<section class="card"><div class="plan-top"><h2>Слова главы</h2><span class="muted">выучено ${learned} из ${ws.length}</span></div>${bar(learned, ws.length, 'good')}
      <div class="row"><a class="btn primary" href="#/words?r=c:${c.n}">${ICON.cards}Карточки</a><a class="btn" href="#/words?r=c:${c.n}&m=quiz">${ICON.quiz}Тест</a></div></section>`
    : `<section class="card"><p class="lead">В этой главе нет слов лексического минимума.</p></section>`;
  const fs = formsOfChapter(c.n);
  const forms = k.pp || fs.length ? `<section class="card"><h2>Основные формы</h2>${k.pp ? `<p class="lead">Глава открывает: ${esc(k.pp[0].toLowerCase() + k.pp.slice(1))}</p>` : ''}
      ${fs.length ? `<p class="hint">Новые формы для заучивания (полужирные в таблице книги): ${fs.length}</p><ul class="form-list">${fs.map(f => `<li><span class="gr">${esc(f.g)}</span> <small>${esc(formName(f).toLowerCase())} от <span class="gr">${esc(f.v.v)}</span></small></li>`).join('')}</ul>` : '<p class="hint">Новых форм для заучивания в этой главе нет: остальные формы образуются по правилам.</p>'}
      <a class="btn" href="#/parts">${ICON.cards}Основные формы</a></section>` : '';
  return `${subHead('#/course', 'Курс', `Глава ${c.n}. ${esc(c.t)}`, `${tbText(k)} · ${wbText(k)}`)}
    <div class="cols"><div class="col">${status}${learn}${words}${forms}</div>
    <div class="col">${ws.length ? `<section class="card flat">${wordTable(ws)}</section>` : ''}</div></div>`;
}

// Карточка «Основные формы глаголов» в курсе
function partsCard(){
  const open = openBold(), st = open.filter(f => fRec(f.n)).length, due = BOLD.filter(f => isFDue(f.n)).length;
  return `<section class="card parts-card"><div class="plan-top"><h2>Основные формы глаголов</h2><span class="muted">${open.length ? `начато ${st} из ${open.length}` : 'с главы 16'}</span></div>
    <p class="lead">${open.length
      ? `Заучиваются только формы, выделенные в книге полужирным (с. 412–413), по мере того как учебник вводит времена. Открыто ${open.length} из ${BOLD.length}.${due ? ` К повторению: ${due}.` : ''}`
      : 'Формы глаголов открываются по главам учебника: настоящее время в главе 16, первые формы для заучивания в главе 19.'}</p>
    ${open.length ? bar(st, open.length, 'good') : ''}
    <div class="row"><a class="btn primary" href="#/parts">${ICON.cards}Карточки</a><a class="btn" href="#/parts?m=quiz">${ICON.quiz}Тест</a><a class="btn" href="#/parts?m=table">${ICON.table}Таблица</a></div></section>`;
}

/* ---------- Словарь ---------- */
const DOT = {sure: 'k', learn: 's', hard: 'h', new: ''};
const POS = [['n', 'Существительные'], ['v', 'Глаголы'], ['a', 'Прилагательные и местоимения'], ['d', 'Наречия'], ['p', 'Предлоги'], ['c', 'Союзы'], ['q', 'Частицы и другие']];
const FREQS = [500, 100, 50, 25, 10];
const dotOf = w => `<span class="dot ${DOT[wState(w.n)] || (isAdded(w.n) ? 'a' : '')}"></span>`;
// art: в полном словаре статья книги, в минимуме слово как в главе
function wordTable(list, art){
  return `<table class="words"><thead><tr><th>Слово</th><th>Перевод</th><th class="r">НЗ</th></tr></thead><tbody>${list.map(w => { const a = art && w.d ? w.d : w, [h, f] = split(a.g);
    return `<tr data-w="${w.n}"><td class="wgt"><button type="button" class="wh" data-w="${w.n}">${dotOf(w)}${esc(h)}</button>${f ? `<div class="wforms">${esc(f)}</div>` : ''}</td><td>${esc(a.ru)}</td><td class="fr">${w.f.toLocaleString('ru-RU')}</td></tr>`; }).join('')}</tbody></table>`;
}
const DICT_UI = () => ({mode: loadLS('dict_mode', 'min') === 'all' ? 'all' : 'min', q: loadLS('dict_q', ''), ch: loadLS('dict_ch', 'all'), f: loadLS('dict_f', 'all'), k: loadLS('dict_k', 'all')});
function vDict(){
  const u = DICT_UI(), all = u.mode === 'all';
  const opt = (v, l, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`;
  const n = all ? fullList().length : MINW.length;
  return `${head('Словарь', `${all ? 'Словарь учебника, с. 437–461' : 'Лексический минимум, главы 4–36'} · ${n} ${plural(n, WORDS_F)}`)}
    <div class="cols"><div class="col">
      <div class="dict-tools">
        ${seg('dmode', [['min', `Минимум (${MINW.length})`], ['all', 'Весь словарь']], u.mode, 'Какие слова показывать')}
        <input class="inp" id="d-q" type="search" placeholder="Поиск по-гречески или по-русски" autocomplete="off" value="${esc(u.q)}">
        <div class="filters">
          <select class="inp" id="d-ch" aria-label="Глава">${opt('all', 'Все главы', u.ch)}${CHS.map(n => opt(n, 'Глава ' + n, u.ch)).join('')}</select>
          <select class="inp" id="d-f" aria-label="Частота в Новом Завете">${opt('all', 'Любая частота', u.f)}${FREQS.map(x => opt(x, x + ' раз и больше', u.f)).join('')}</select>
          <select class="inp" id="d-k" aria-label="Часть речи">${opt('all', 'Все части речи', u.k)}${POS.map(([k, l]) => opt(k, l, u.k)).join('')}</select>
        </div>
        <div class="row"><a class="btn primary" id="d-cards" href="#/words">${ICON.cards}Карточки</a><a class="btn" id="d-quiz" href="#/words?m=quiz">${ICON.quiz}Тест</a><a class="btn" href="#/parts">${ICON.table}Основные формы</a></div>
      </div>
      <p class="meta" id="d-count"></p>
      <div id="d-list"></div>
    </div><div class="col">
      <section class="card rules"><h3>Точки и частота</h3><ul>
        <li><span class="dot k"></span>уверенно (интервал от двух недель), <span class="dot s"></span>в изучении, <span class="dot h"></span>трудное, <span class="dot a"></span>добавлено, ждёт в новых словах.</li>
        <li>НЗ: сколько раз слово встречается в Новом Завете, по словарю учебника.</li>
        <li>Нажмите на слово, чтобы открыть его статью: значение, глава, код MBG, временные формы. Слово не из минимума можно добавить в изучение, тогда оно попадёт в новые слова плана.</li>
      </ul></section>
      <section class="card rules"><h3>Особые формы</h3><ul>${SPECIAL.map(s => `<li><span class="gr">${s.g}</span>: ${esc(s.ru)}. В НЗ ${times(s.f)}, гл. ${s.ch}, с. ${s.p}.</li>`).join('')}</ul>
        <p class="src">Маунс даёт их в лексическом минимуме отдельно, в счёт 320 слов они не входят.</p></section>
      <section class="card rules"><h3>Как работает повторение</h3><ul>
        <li>За одну сессию добавляется 10 новых слов.</li>
        <li>«Знаю» отодвигает слово дальше: через 1, 3, 7, 14, 30 и 60 дней.</li>
        <li>«Повторить» возвращает слово через три карточки и сбрасывает интервал. Ошибки в тесте тоже сбрасывают его.</li>
      </ul></section>
    </div></div>`;
}
// Буква, с которой начинается слово (без придыханий и ударений), для заголовков полного словаря
const firstLetter = g => (norm(g).replace(/[^α-ω]/g, '')[0] || '').toUpperCase();
function dictFilter(u){
  const q = norm(u.q.trim());
  const base = u.mode === 'all' ? fullList() : MINW;
  return base.filter(w => (u.ch === 'all' || w.ch === +u.ch) && (u.f === 'all' || w.f >= +u.f) && (u.k === 'all' || w.k === u.k)
    && (!q || norm(w.g).includes(q) || norm(w.ru).includes(q) || (w.d && (norm(w.d.g).includes(q) || norm(w.d.ru).includes(q)))));
}
function initDict(){
  let timer = 0;
  const upd = () => {
    const u = {mode: DICT_UI().mode, q: $('#d-q').value, ch: $('#d-ch').value, f: $('#d-f').value, k: $('#d-k').value};
    saveLS('dict_q', u.q); saveLS('dict_ch', u.ch); saveLS('dict_f', u.f); saveLS('dict_k', u.k);
    const list = dictFilter(u), all = u.mode === 'all';
    $('#d-count').textContent = list.length ? `Найдено слов: ${list.length}` : 'Ничего не найдено';
    let html;
    if(!all) html = CHS.map(ch => { const ws = list.filter(w => w.ch === ch); if(!ws.length) return '';
      const ps = ws.map(w => w.p), pg = Math.min(...ps) === Math.max(...ps) ? `с. ${ps[0]}` : `с. ${Math.min(...ps)}–${Math.max(...ps)}`;
      return `<h3 class="chh">Глава ${ch} <span class="meta">${pg}</span></h3><section class="card flat">${wordTable(ws)}</section>`; }).join('');
    else { const groups = []; list.forEach(w => { const L = firstLetter(w.d ? w.d.g : w.g), g = groups[groups.length - 1]; if(g && g.L === L) g.ws.push(w); else groups.push({L, ws: [w]}); });
      html = groups.map(g => `<h3 class="chh">${esc(g.L)} <span class="meta">${g.ws.length} ${plural(g.ws.length, WORDS_F)}</span></h3><section class="card flat">${wordTable(g.ws, true)}</section>`).join(''); }
    $('#d-list').innerHTML = html;
    // карточки и тест по выбранному: глава, частота или весь набор
    const r = u.ch !== 'all' ? 'c:' + u.ch : u.f !== 'all' ? 'f:' + u.f : all ? 'f:10' : 'all';
    $('#d-cards').href = '#/words?r=' + r; $('#d-quiz').href = '#/words?r=' + r + '&m=quiz';
  };
  $('#d-q').oninput = () => { clearTimeout(timer); timer = setTimeout(upd, 150); };
  $('#d-ch').onchange = upd; $('#d-f').onchange = upd; $('#d-k').onchange = upd;
  $$('[data-dmode]').forEach(b => b.onclick = () => { saveLS('dict_mode', b.dataset.dmode); render(true); });
  $('#d-list').onclick = e => { const t = e.target.closest('[data-w]'); if(t) openWord(+t.dataset.w); };
  upd();
}

/* ---------- Карточка слова: статья словаря, основные формы, «Добавить в изучение» ---------- */
const PP_LABELS = ['Настоящее время', 'Будущее время', 'Аорист действ. залога', 'Перфект действ. залога', 'Перфект ср./страд. залога', 'Аорист страд. залога'];
const PP_SHORT = ['наст.', 'буд.', 'аорист', 'перфект', 'перфект ср./страд.', 'аорист страд.'];
const POS_RU = {n: 'существительное', v: 'глагол', a: 'прилагательное или местоимение', d: 'наречие', p: 'предлог', c: 'союз', q: 'частица'};
const MBG = {n: 'существительное', a: 'прилагательное', v: 'глагол', cv: 'составной глагол'};
const DECL = {'1': 'первое склонение', '2': 'второе склонение', '3': 'третье склонение'};
// «n-2a» → «существительное, второе склонение»
function codeText(c){
  const m = String(c || '').match(/^(cv|n|a|v)-(\d)/);
  if(!m) return '';
  if(m[1] === 'n') return MBG.n + (DECL[m[2]] ? ', ' + DECL[m[2]] : '');
  return MBG[m[1]];
}
const fmtForm = f => esc(f).replace(/ или /g, ' <span class="muted">или</span> ');
function partsBlock(v){
  return `<div class="pp-grid">${[v.v].concat(v.f).map((f, i) => `<div class="pp-cell${(v.b || []).includes(i) ? ' bold' : ''}"><small>${PP_LABELS[i]}</small><span class="gr">${esc(f)}</span></div>`).join('')}</div>
    ${Object.keys(v.fn || {}).length ? `<ul class="pp-notes">${Object.entries(v.fn).map(([i, t]) => `<li><b>${PP_SHORT[+i]}</b> <span class="gr">${esc(+i ? v.f[i - 1] : v.v)}</span>: ${esc(t)}</li>`).join('')}</ul>` : ''}`;
}
function stateText(n){
  const r = wRec(n);
  if(!r) return isAdded(n) ? 'Добавлено в изучение: ждёт в новых словах плана.' : 'Ещё не начато.';
  const st = {hard: 'трудное', sure: 'уверенно', learn: 'в изучении'}[wState(n)];
  return `${st[0].toUpperCase() + st.slice(1)}, следующее повторение ${r.due <= today() ? 'сегодня' : fmtDay(r.due)}.`;
}
function wordCardHTML(w){
  const d = w.d, a = d || w, [h, rest] = split(a.g), v = VERB_OF.get(w.n);
  const facts = [`<li><span>В Новом Завете</span><b>${times(w.f)}</b></li>`,
    `<li><span>Лексический минимум</span><b>${w.min ? `глава ${w.ch}, с. ${w.p}` : 'не входит'}</b></li>`];
  if(d && d.c) facts.push(`<li><span>Код MBG</span><b>${esc(d.c)}${codeText(d.c) ? ` <span class="muted">(${codeText(d.c)})</span>` : ''}</b></li>`);
  else facts.push(`<li><span>Часть речи</span><b>${POS_RU[w.k] || ''}</b></li>`);
  facts.push(`<li><span>Учебник</span><b>${d ? `словарь, с. ${d.p}` : 'только в лексическом минимуме'}</b></li>`);
  const forms = d && (d.pp || d.im) ? `<h3>Временные формы в словаре</h3><div class="pp-grid">${[['Имперфект', d.im]].concat((d.pp || []).map((f, i) => [PP_LABELS[i + 1], f])).filter(x => x[1]).map(([l, f]) => `<div class="pp-cell"><small>${l}</small><span class="gr">${fmtForm(f)}</span></div>`).join('')}</div>` : '';
  const chapterForm = w.min && d && (w.g.replace(/-/g, '–') !== d.g || w.ru !== d.ru) ? `<p class="hint">В главе ${w.ch}: <span class="gr">${esc(w.g)}</span>, ${esc(w.ru)}.</p>` : '';
  let action = '';
  if(!w.min && !wRec(w.n) && !isAdded(w.n)) action = `<button type="button" class="btn primary wide" data-wc="add" data-n="${w.n}">Добавить в изучение</button>`;
  else if(w.min && !wRec(w.n)) action = `<p class="hint">Слово лексического минимума: придёт в новых словах плана.</p>`;
  return `<div class="dlg-head"><h2>Слово</h2><button type="button" class="icon-btn" data-wc="close" aria-label="Закрыть">×</button></div>
    <div class="wc-body">
      <div class="wc-word"><span class="gr wc-g">${esc(h)}</span>${rest ? `<span class="gr wc-f">${esc(rest)}</span>` : ''}</div>
      <p class="wc-ru">${esc(a.ru)}</p>${d && d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}
      ${chapterForm}
      <ul class="facts">${facts.join('')}</ul>
      ${forms}
      ${v ? `<h3>Основные формы <span class="meta">учебник, с. ${v.p}</span></h3>${partsBlock(v)}<a class="btn sm" href="#/parts?v=${v.n}" data-wc="close-go">Основные формы глагола</a>` : ''}
      <p class="wc-state"><span class="dot ${DOT[wState(w.n)] || (isAdded(w.n) ? 'a' : '')}"></span>${stateText(w.n)}</p>
      ${action}
    </div>`;
}
const wcDlg = $('#wcard');
let wcGo = '';  // адрес, куда перейти после закрытия карточки (после шага «назад» в истории)
function openWord(n){
  const w = WORD.get(n); if(!w) return;
  wcDlg.dataset.n = n;
  wcDlg.innerHTML = wordCardHTML(w);
  if(!wcDlg.open){ wcDlg.showModal(); history.pushState({wc: 1}, ''); }
  wcDlg.scrollTop = 0;
}
wcDlg.addEventListener('close', () => {
  if(history.state && history.state.wc) history.back();
  else if(wcGo){ const h = wcGo; wcGo = ''; go(h); }
});
window.addEventListener('popstate', () => {
  if(wcDlg.open) wcDlg.close();
  else if(wcGo){ const h = wcGo; wcGo = ''; go(h); }
});
wcDlg.addEventListener('click', e => {
  if(e.target === wcDlg){ wcDlg.close(); return; }
  const b = e.target.closest('[data-wc]'); if(!b) return;
  if(b.dataset.wc === 'close'){ wcDlg.close(); return; }
  if(b.dataset.wc === 'close-go'){ e.preventDefault(); wcGo = b.getAttribute('href'); wcDlg.close(); return; }
  if(b.dataset.wc === 'add'){
    const res = addToStudy(+b.dataset.n);
    toast(res === 'tomorrow' ? 'Слово добавлено: появится в новых словах завтра' : 'Слово добавлено в новые слова плана');
    openWord(+b.dataset.n);
    if(route().name === 'dict') $$(`#d-list [data-w="${b.dataset.n}"] .dot`).forEach(el => { el.className = 'dot a'; });
  }
});

/* ---------- Карточки и тест слов (как в старом приложении) ---------- */
// Набор: all: минимум, все главы; c:N: одна глава; u:N: с начала по главу N;
// f:X: весь словарь, слова с частотностью от X (от частых к редким); my: добавленные из словаря вручную
const RANGE_RE = /^(all|my|[cu]:\d+|f:(500|100|50|25|10))$/;
const WS = {range: RANGE_RE.test(loadLS('range', 'all')) ? loadLS('range', 'all') : 'all', dir: 'g', set: 'srs', deck: [], idx: 0, known: 0, failed: new Set(), task: null, rendered: false};
const myWords = () => S.added.slice().sort((a, b) => String(a.created).localeCompare(String(b.created))).map(r => WORD.get(r.n)).filter(Boolean);
function rangeWords(r){
  r = r || WS.range;
  if(r === 'all') return MINW;
  if(r === 'my') return myWords();
  const [t, x] = r.split(':');
  if(t === 'c') return MINW.filter(w => w.ch === +x);
  if(t === 'u') return MINW.filter(w => w.ch <= +x);
  if(t === 'f') return BY_FREQ.filter(w => w.f >= +x);
  return MINW;
}
function rangeTitle(r){
  r = r || WS.range;
  if(r === 'all') return 'Лексический минимум, главы 4–36';
  if(r === 'my') return 'Слова, добавленные из словаря';
  const [t, x] = r.split(':');
  if(t === 'c') return `Лексический минимум, глава ${x}`;
  if(t === 'u') return `Лексический минимум, главы 4–${x}`;
  return `Весь словарь: ${x} раз и больше в Новом Завете`;
}
function rangeOptions(){
  const cnt = c => chWords(c).length, upto = c => MINW.filter(w => w.ch <= c).length;
  return `<optgroup label="По главам"><option value="all">Все главы · ${MINW.length} слов</option>
    ${CHS.map(c => `<option value="c:${c}">Глава ${c} · ${cnt(c)} сл.</option>`).join('')}
    ${CHS.slice(1).map(c => `<option value="u:${c}">Главы 4–${c} · ${upto(c)} сл.</option>`).join('')}</optgroup>
    <optgroup label="По частоте в Новом Завете">${FREQS.map(x => `<option value="f:${x}">${x} раз и больше · ${rangeWords('f:' + x).length} сл.</option>`).join('')}</optgroup>
    <optgroup label="Мои"><option value="my">Мои добавленные · ${S.added.length} сл.</option></optgroup>`;
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
  if(rr && RANGE_RE.test(rr)){ WS.range = rr; saveLS('range', rr); }
  WS.mode = r.q.get('m') === 'quiz' ? 'quiz' : 'cards';
  return `${subHead('#/dict', 'Словарь', 'Слова', `<span id="w-title">${esc(rangeTitle())}</span>`)}
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
  $('#wRange').onchange = () => { WS.range = $('#wRange').value; saveLS('range', WS.range); $('#w-title').textContent = rangeTitle(); buildWDeck(); WQ.list = []; if(WS.mode === 'quiz') startWQuiz(); };
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
// Метка в углу карточки: глава минимума или «словарь»; источник: глава или страница словаря
const wTag = w => w.min ? `гл. ${w.ch}` : 'словарь';
const wSrc = w => w.min ? `Маунс, гл. ${w.ch}, с. ${w.p}` : `Маунс, словарь, с. ${w.p}`;
const wFormsLine = w => { const d = w.d; return d && d.k === 'v' && d.pp ? `<div class="wpp gr">${(d.im ? `(${esc(d.im)}), ` : '') + d.pp.map(esc).join(', ')}</div>` : ''; };
function wGreekFace(w){ const [h, r] = split(w.g); return `<div class="num">${wTag(w)}</div><div class="lvl">${lvl(w)}</div><div class="wg">${esc(h)}</div>${r ? `<div class="wforms">${esc(r)}</div>` : ''}<div class="hint">нажмите, чтобы перевернуть</div>`; }
function wRuFace(w){ const L = w.ru.length; return `<div class="num">${wTag(w)}</div><div class="lvl">${lvl(w)}</div><div class="wru" style="margin:0;font-size:${L < 16 ? 2.2 : L < 40 ? 1.7 : 1.3}rem">${esc(w.ru)}</div><div class="hint">как по-гречески? нажмите</div>`; }
function wBackFace(w){ const [h, r] = split(w.g); return `<div class="num">${wTag(w)}</div><div class="lvl">${lvl(w)}</div><div class="wg sm">${esc(h)}</div>${r ? `<div class="wforms">${esc(r)}</div>` : ''}
  <div class="wru">${esc(w.ru)}</div>${wFormsLine(w)}<div class="note">В Новом Завете: ${times(w.f)}</div><div class="src">${wSrc(w)}</div>`; }
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
  const patch = srsPatch(wRec(w.n), WS.failed.has(w.n), ok);
  if(patch) setWord(w.n, patch);
  if(ok) WS.known++;
  else {
    WS.failed.add(w.n);
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
    const tomorrow = LEX.filter(w => wRec(w.n) && wRec(w.n).due <= addDays(today(), 1)).length;
    box.innerHTML = taskDoneHTML(WS.deck.length ? `Задание выполнено: ${WS.size} ${plural(WS.size, WORDS_F)}. Завтра к повторению: <b>${tomorrow}</b>.` : (k === 'review' ? 'На сегодня всё повторено.' : 'Эти слова уже пройдены.'));
    return;
  }
  const R = rangeWords(), t = today(), fresh = R.filter(w => !wRec(w.n)).length, tomorrow = R.filter(w => wRec(w.n) && wRec(w.n).due <= addDays(t, 1)).length;
  if(!R.length){ box.innerHTML = `<span class="done-ic">${ICON.done}</span><p>В этом наборе пока нет слов. Откройте слово в словаре и нажмите «Добавить в изучение».</p><a class="btn primary" href="#/dict">Открыть словарь</a>`; return; }
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
  for(const pool of [R.filter(x => x.k === w.k), LEX.filter(x => x.k === w.k), LEX])
    for(const x of shuffle(pool)){ if(out.length === 3) return out; if(ok(x)) out.push(x); }
  return out;
}
function startWQuiz(){
  const R = rangeWords(), hard = w => (wRec(w.n) || {}).hard;
  if(!R.length){ $('#wqArea').hidden = true; $('#wqDone').hidden = false; $('#wqPct').textContent = ''; $('#wqSum').textContent = 'В этом наборе пока нет слов.'; $('#wqMiss').textContent = 'Откройте слово в словаре и нажмите «Добавить в изучение».'; return; }
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
  const p = $('#wqPrompt'); p.className = 'prompt ' + (tr ? 'word' : 'text ask'); p.innerHTML = tr ? esc(w.g) : esc(w.ru);
  p.style.fontSize = tr ? '' : (w.ru.length < 16 ? '2.2rem' : w.ru.length < 40 ? '1.6rem' : '1.25rem');
  const box = $('#wqOpts'); box.className = 'opts' + (tr ? ' one' : ''); box.innerHTML = '';
  opts.forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (tr ? 'ru' : 'wgr');
    b.innerHTML = tr ? esc(o.ru) : esc(o.g); b.dataset.ok = o === w ? 1 : 0; b.onclick = () => wAnswer(b, o === w, w); box.appendChild(b); });
}
function wAnswer(b, ok, w){
  $$('#wqOpts .btn').forEach(x => { x.disabled = true; if(x.dataset.ok === '1') x.classList.add('right'); });
  if(ok) WQ.score++; else { b.classList.add('wrong'); WQ.miss.push(w); setWord(w.n, {level: 0, due: today(), hard: true}); }
  $('#wqFb').innerHTML = `<b class="${ok ? 'good-t' : 'bad-t'}">${ok ? 'Верно' : 'Неверно'}.</b> <span class="gr big-gr">${esc(w.g)}</span>: ${esc(w.ru)}. ${wSrc(w).replace('Маунс, ', '')}.`;
  $('#wqScore').textContent = `верно: ${WQ.score}`; $('#wqNext').hidden = false; $('#wqNext').focus();
}
function wqFinish(){
  const N = WQ.list.length; $('#wqArea').hidden = true; $('#wqDone').hidden = false; $('#wqBar').style.width = '100%';
  $('#wqPct').textContent = Math.round(WQ.score / N * 100) + '%'; $('#wqSum').textContent = `Верно ${WQ.score} из ${N}.`;
  $('#wqMiss').innerHTML = WQ.miss.length ? `Ошибки: <span class="gr big-gr">${WQ.miss.map(w => esc(split(w.g)[0])).join(', ')}</span>. Эти слова попали в «Трудные» и вернутся в повторение сегодня.` : 'Без ошибок.';
}

/* ---------- Основные формы глаголов: карточки полужирных форм, тест «Какая это форма?», таблица ---------- */
// Карточка = одна полужирная форма открытого времени (её автор велит заучить, с. 412–413). Остальные формы видны на обороте
// и в таблице как «по правилу». Порядок повторения тот же, что у слов; прогресс в form_progress
const PS = {set: 'srs', deck: [], idx: 0, known: 0, failed: new Set(), task: null, rendered: false, mode: 'cards', focus: 0, all: false};
const PQ = {list: [], i: 0, score: 0, miss: []};
const FORMS_F = ['форма', 'формы', 'форм'];
const PP_SHORT_EX = {'35:2': 'имперф.', '64:2': 'плюсквамперф.'};
const formShort = f => PP_SHORT_EX[f.v.n + ':' + f.i] || PP_SHORT[f.i];
const flvl = f => { const s = fRec(f.n); return s ? '●'.repeat(s.level || 0) + '○'.repeat(6 - (s.level || 0)) : 'новая'; };
// Корень из первой сноски к глаголу: корни первого предложения, иначе первый найденный
function rootOf(v){
  const t = (v.fn || {})[0] || '', all = (t.match(/\*[^\s.,;:()▸]+/g) || []);
  const first = (t.split(/\.\s/)[0].match(/\*[^\s.,;:()▸]+/g) || []);
  return [...new Set(first.length ? first : all.slice(0, 1))];
}
const hasCards = () => openBold().length > 0 || BOLD.some(f => fRec(f.n));
const quizReady = () => FORMS.some(f => f.i > 0 && isOpen(f));
function pCardsHTML(task){
  return `${task ? '' : `<div class="row between">${seg('pset', [['srs','Повторение'],['all','Все'],['hard','Трудные']], PS.set, 'Набор')}<button type="button" class="btn sm" id="pShuffle">Перемешать</button></div>`}
    <div class="pbar thin"><i id="pBar"></i></div>
    <div class="row between"><span class="meta" id="pMeta"></span></div>
    <div id="pArea">
      <div class="stage"><div class="fcard" id="pCard" tabindex="0" role="button" aria-label="Перевернуть карточку"><div class="face front" id="pFront"></div><div class="face back pback" id="pBack"></div></div></div>
      <div class="grid2"><button type="button" class="btn bad" id="pAgain">Повторить</button><button type="button" class="btn good" id="pKnow">Знаю</button></div>
    </div>
    <div class="done-box" id="pDone" hidden></div>
    ${task ? '' : '<p class="meta center" id="pStats"></p>'}`;
}
const notYet = text => `<div class="done-box"><span class="done-ic">${ICON.done}</span><p>${text}</p><a class="btn" href="#/ch/${Math.min(curCh(), 36)}">Текущая глава</a></div>`;
function vParts(r){
  PS.mode = ['quiz', 'table'].includes(r.q.get('m')) ? r.q.get('m') : 'cards';
  PS.focus = +r.q.get('v') || 0;
  // открыт из статьи слова: если у глагола нет открытых форм для заучивания, показываем его строку в таблице
  const fv = VERB.get(PS.focus);
  if(fv && PS.mode === 'cards' && !openBold().some(f => f.v === fv)){ PS.mode = 'table'; if(!vForms(fv).every(isOpen)) PS.all = true; }
  const open = openBold();
  return `${subHead('#/course', 'Курс', 'Основные формы глаголов', open.length ? `Для заучивания открыто ${open.length} ${plural(open.length, FORMS_F)} из ${BOLD.length}. Учебник, с. 412–421` : 'Формы открываются по главам учебника. Учебник, с. 412–421')}
    <div class="trainer${PS.mode === 'table' ? ' wide' : ''}" id="p-trainer">
      ${seg('pmode', [['cards','Карточки'],['quiz','Тест'],['table','Таблица']], PS.mode, 'Режим')}
      <section id="p-cards"${PS.mode === 'cards' ? '' : ' hidden'}>${hasCards() ? pCardsHTML(false)
        : notYet('Карточки появятся в главе 19: там учебник вводит будущее время и первые формы для заучивания (<span class="gr">ἔσομαι</span>, <span class="gr">ἕξω</span>). Карточка спрашивает одну форму, которую книга выделяет полужирным.')}</section>
      <section id="p-quiz"${PS.mode === 'quiz' ? '' : ' hidden'}>${quizReady() ? `
        <div class="pbar thin"><i id="pqBar"></i></div>
        <div class="row between"><span class="meta" id="pqMeta"></span><span class="meta" id="pqScore"></span></div>
        <div id="pqArea"><div class="qbox"><div class="meta">Какая это форма?</div><div class="prompt word" id="pqPrompt"></div></div>
          <div class="opts one" id="pqOpts"></div><div class="feedback" id="pqFb"></div>
          <button type="button" class="btn primary wide" id="pqNext" hidden>Дальше</button></div>
        <div class="done-box" id="pqDone" hidden><div class="pct" id="pqPct"></div><p id="pqSum"></p><p class="meta" id="pqMiss"></p><button type="button" class="btn primary" id="pqRestart">Ещё раз</button></div>`
        : notYet('Тест откроется в главе 19, когда кроме настоящего времени появится будущее. В тесте только открытые формы глаголов пройденных глав.')}
      </section>
      <section id="p-table"${PS.mode === 'table' ? '' : ' hidden'}>${partsTableHTML()}</section>
    </div>`;
}
function partsTableHTML(){
  const all = PS.all, cols = [0, 1, 2, 3, 4, 5].filter(i => all || FORMS.some(f => f.i === i && isOpen(f)));
  const verbs = all ? VERBS : VERBS.filter(v => verbCh(v) <= curCh());
  const toggle = `<label class="check"><input type="checkbox" id="p-all"${all ? ' checked' : ''}><span>Показать всю таблицу книги</span></label>`;
  if(!cols.length || !verbs.length) return `${toggle}<p class="hint">Пока ничего не открыто: формы глаголов появляются с главы 16, когда учебник вводит настоящее время.</p>`;
  return `${toggle}<p class="hint">Полужирные формы заучиваются, остальные образуются по правилам (с. 413). Бледным то, что ещё не открыто. Нажмите на глагол, чтобы открыть его статью и сноски.</p>
    <div class="card flat scroll-x"><table class="pp-table"><thead><tr>${cols.map(i => `<th>${PP_SHORT[i]}</th>`).join('')}</tr></thead><tbody>${verbs.map(v =>
    `<tr data-pv="${v.n}"${v.n === PS.focus ? ' class="focus"' : ''}>${cols.map(i => { const f = FORM.get(v.n * 10 + i), g = formOf(v, i);
      return `<td class="gr${f && f.bold ? ' bold' : ''}${!f ? ' none' : !isOpen(f) ? ' off' : ''}"${f && PP_NAME[v.n + ':' + i] ? ` title="${esc(PP_NAME[v.n + ':' + i])}"` : ''}>${f && f.bold && isOpen(f) ? `<span class="dot ${DOT[fState(f.n)]}"></span>` : ''}${esc(g)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function initParts(){
  $$('[data-pmode]').forEach(b => b.onclick = () => { PS.mode = b.dataset.pmode; pressed($$('[data-pmode]'), b);
    ['cards', 'quiz', 'table'].forEach(m => { $('#p-' + m).hidden = m !== PS.mode; });
    $('#p-trainer').classList.toggle('wide', PS.mode === 'table');
    if(PS.mode === 'quiz' && quizReady() && !PQ.list.length) startPQuiz(); });
  const tbl = $('#p-table');
  tbl.onclick = e => { const tr = e.target.closest('[data-pv]'); if(tr) openWord(VERB.get(+tr.dataset.pv).d); };
  tbl.onchange = e => { if(e.target.id === 'p-all'){ PS.all = e.target.checked; tbl.innerHTML = partsTableHTML(); } };
  if(PS.focus && PS.mode === 'table'){ const row = tbl.querySelector('tr.focus'); if(row) setTimeout(() => row.scrollIntoView({block: 'center'}), 50); }
  if(quizReady()){ $('#pqNext').onclick = () => { PQ.i++; PQ.i >= PQ.list.length ? pqFinish() : pAsk(); }; $('#pqRestart').onclick = startPQuiz; }
  if(hasCards()) startPCards(null);
  PQ.list = [];
  if(PS.mode === 'quiz' && quizReady()) startPQuiz();
}
function startPCards(task){
  PS.task = task; PS.rendered = false;
  const card = $('#pCard'), flip = () => card.classList.toggle('flipped');
  // «Пояснения» раскрываются, не переворачивая карточку
  card.onclick = e => { if(!e.target.closest('a, details')) flip(); };
  card.onkeydown = e => { if(e.target === card && (e.key === ' ' || e.key === 'Enter')){ e.preventDefault(); flip(); } };
  $('#pKnow').onclick = () => pNext(true); $('#pAgain').onclick = () => pNext(false);
  if($('#pShuffle')) $('#pShuffle').onclick = buildPDeck;
  $$('[data-pset]').forEach(b => b.onclick = () => { PS.set = b.dataset.pset; pressed($$('[data-pset]'), b); PS.focus = 0; buildPDeck(); });
  buildPDeck();
}
const isFHard = f => !!(fRec(f.n) || {}).hard;
function buildPDeck(){
  if(PS.task){
    const d = taskDeck(PS.task), fresh = d.filter(f => !fRec(f.n));
    PS.deck = shuffle(d.filter(f => fRec(f.n))).concat(fresh);
  } else {
    const open = openBold();
    if(PS.set === 'hard' && !BOLD.some(isFHard)){ PS.set = 'all'; pressed($$('[data-pset]'), $('[data-pset=all]')); }
    if(PS.set === 'srs') PS.deck = shuffle(BOLD.filter(f => isFDue(f.n))).concat(open.filter(f => !fRec(f.n)).slice(0, NEW_PARTS));
    else PS.deck = shuffle(PS.set === 'hard' ? BOLD.filter(isFHard) : open);
    // открыт из статьи слова: формы этого глагола первыми
    const v = VERB.get(PS.focus);
    if(v){ const mine = open.filter(f => f.v === v); PS.deck = mine.concat(PS.deck.filter(f => f.v !== v)); PS.focus = 0; }
  }
  PS.idx = 0; PS.known = 0; PS.failed.clear(); PS.size = new Set(PS.deck.map(f => f.n)).size;
  if(!PS.deck.length) return pFinish();
  $('#pDone').hidden = true; $('#pArea').hidden = false; pRender();
}
// Лицевая сторона: глагол, значение, корень и вопрос; у настоящего времени сам глагол не показывается
function pFront(f){
  const v = f.v, root = rootOf(v);
  return `<div class="num">гл. ${f.ch}</div><div class="lvl">${flvl(f)}</div>
    ${f.i ? `<div class="wg">${esc(v.v)}</div><div class="wru">${esc(v.ru)}</div>` : `<div class="wru lg">${esc(v.ru)}</div>`}
    ${root.length ? `<div class="root">корень <span class="gr">${esc(root.join(', '))}</span></div>` : ''}
    <div class="fq">${esc(formName(f))}?</div><div class="hint">нажмите, чтобы перевернуть</div>`;
}
// Оборот: ответ крупно, ниже строка глагола только с открытыми формами, сноски свёрнуты в «Пояснения»
function pBack(f){
  const v = f.v, open = vForms(v).filter(isOpen);
  const notes = Object.entries(v.fn || {}).filter(([i]) => { const g = FORM.get(v.n * 10 + +i); return g && isOpen(g); });
  return `<div class="fb-q">${esc(formName(f))}</div><div class="fb-ans gr">${esc(f.g)}</div>
    <div class="fb-line">${open.map(g => `<span class="fl${g.bold ? ' bold' : ''}${g === f ? ' cur' : ''}"><small>${formShort(g)}</small><span class="gr">${esc(g.g)}</span><em>${g.bold ? 'заучить' : 'по правилу'}</em></span>`).join('')}</div>
    ${notes.length ? `<details class="fb-notes"><summary>Пояснения <span class="muted">· ${notes.length}</span>${ICON.chev}</summary><ul class="pp-notes">${notes.map(([i, t]) => `<li><b>${formShort(FORM.get(v.n * 10 + +i))}</b> <span class="gr">${esc(formOf(v, +i))}</span>: ${esc(t)}</li>`).join('')}</ul></details>` : ''}
    <div class="src"><span class="gr">${esc(v.v)}</span>, ${esc(v.ru)} · Маунс, с. ${v.p}</div>`;
}
function pRender(){
  const f = PS.deck[PS.idx], c = $('#pCard'); c.classList.remove('flipped');
  setTimeout(() => { $('#pFront').innerHTML = pFront(f); $('#pBack').innerHTML = pBack(f); $('#pBack').scrollTop = 0; }, PS.rendered ? 120 : 0);
  PS.rendered = true;
  $('#pMeta').textContent = `Карточка ${PS.idx + 1} из ${PS.deck.length}`;
  $('#pBar').style.width = (PS.idx / PS.deck.length * 100) + '%';
  pStats();
}
function pStats(){
  const el = $('#pStats'); if(!el) return;
  const t = today(), open = openBold(); let st = 0, due = 0, sure = 0, hard = 0;
  BOLD.forEach(f => { const s = fRec(f.n); if(s){ st++; if(s.due <= t) due++; if((s.level || 0) >= SURE) sure++; if(s.hard) hard++; } });
  el.textContent = `Открыто для заучивания ${open.length} · начато ${st} · уверенно ${sure} · к повторению ${due} · трудных ${hard}`;
}
function pNext(ok){
  const f = PS.deck[PS.idx]; if(!f) return;
  const patch = srsPatch(fRec(f.n), PS.failed.has(f.n), ok);
  if(patch) setForm(f.n, patch);
  if(ok) PS.known++;
  else { PS.failed.add(f.n); PS.deck.splice(Math.min(PS.idx + 4, PS.deck.length), 0, f); }
  PS.idx++;
  PS.idx >= PS.deck.length ? pFinish() : pRender();
}
function pFinish(){
  $('#pArea').hidden = true; $('#pDone').hidden = false; $('#pBar').style.width = '100%'; $('#pMeta').textContent = '';
  const box = $('#pDone'), tomorrow = BOLD.filter(f => fRec(f.n) && fRec(f.n).due <= addDays(today(), 1)).length;
  if(PS.task){
    if(PS.deck.length) markTask('parts', PS.size);
    box.innerHTML = taskDoneHTML(PS.deck.length ? `Задание выполнено: ${PS.size} ${plural(PS.size, FORMS_F)}. Завтра к повторению: <b>${tomorrow}</b>.` : 'Эти формы уже пройдены.');
    return;
  }
  const fresh = openBold().filter(f => !fRec(f.n)).length;
  box.innerHTML = `<span class="done-ic">${ICON.done}</span><p>${PS.set === 'srs'
    ? `${PS.deck.length ? 'Сессия завершена.' : 'На сегодня всё повторено.'} Завтра к повторению: <b>${tomorrow}</b>.${fresh ? ` Новых форм: ${fresh}.` : ''}`
    : `Круг пройден. Отмечено «знаю»: <b>${PS.known}</b> из <b>${PS.size}</b>.`}</p>
    <div class="row center">${PS.set === 'srs' && fresh ? `<button type="button" class="btn primary" id="pMore">Ещё ${Math.min(NEW_PARTS, fresh)} новых</button>` : ''}<button type="button" class="btn" id="pRestart">${PS.set === 'srs' ? 'Все открытые формы' : 'Начать заново'}</button></div>`;
  if($('#pMore')) $('#pMore').onclick = buildPDeck;
  $('#pRestart').onclick = () => { if(PS.set === 'srs'){ PS.set = 'all'; pressed($$('[data-pset]'), $('[data-pset=all]')); } buildPDeck(); };
  pStats();
}
// Тест: дана форма, выбрать глагол и какая это форма. Только открытые формы глаголов пройденных глав, полужирные и правильные.
// Неверные варианты: другая форма того же глагола и та же форма других глаголов; вариант с той же самой формой не предлагается
function startPQuiz(){
  const pool = FORMS.filter(f => f.i > 0 && isOpen(f));
  const hard = isFHard;
  // по одной форме от глагола, сначала трудные полужирные формы
  const byVerb = new Map();
  shuffle(pool.filter(hard)).concat(shuffle(pool.filter(f => !hard(f)))).forEach(f => { if(!byVerb.has(f.v.n)) byVerb.set(f.v.n, f); });
  const qs = [...byVerb.values()];
  PQ.list = shuffle(shuffle(qs.filter(hard)).concat(shuffle(qs.filter(f => !hard(f)))).slice(0, QUIZ_N));
  PQ.i = 0; PQ.score = 0; PQ.miss = []; $('#pqDone').hidden = true; $('#pqArea').hidden = false; pAsk();
}
function pOptions(q){
  let out = [q];
  const keys = new Set([q.n]);
  const ok = f => f && isOpen(f) && f.g !== q.g && !keys.has(f.n);
  const add = f => { if(out.length < 4 && ok(f)){ out.push(f); keys.add(f.n); } };
  shuffle(vForms(q.v)).forEach(add);
  if(out.length > 2){ out = out.slice(0, 2); keys.clear(); out.forEach(o => keys.add(o.n)); }
  shuffle(FORMS.filter(f => f.i === q.i && f.v !== q.v)).forEach(add);
  shuffle(FORMS).forEach(add);
  return shuffle(out);
}
function pAsk(){
  const q = PQ.list[PQ.i], N = PQ.list.length;
  $('#pqFb').innerHTML = ''; $('#pqNext').hidden = true;
  $('#pqMeta').textContent = `Вопрос ${PQ.i + 1} из ${N}`; $('#pqScore').textContent = `верно: ${PQ.score}`;
  $('#pqBar').style.width = (PQ.i / N * 100) + '%';
  $('#pqPrompt').textContent = q.g;
  const box = $('#pqOpts'); box.innerHTML = '';
  pOptions(q).forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn popt';
    const right = o === q;
    b.innerHTML = `<span class="gr">${esc(o.v.v)}</span><small>${esc(formName(o).toLowerCase())}</small>`; b.dataset.ok = right ? 1 : 0;
    b.onclick = () => pAnswer(b, right, q); box.appendChild(b); });
}
function pAnswer(b, ok, q){
  $$('#pqOpts .btn').forEach(x => { x.disabled = true; if(x.dataset.ok === '1') x.classList.add('right'); });
  if(ok) PQ.score++;
  else { b.classList.add('wrong'); PQ.miss.push(q); if(q.bold) setForm(q.n, {level: 0, due: today(), hard: true}); }
  const note = (q.v.fn || {})[q.i];
  $('#pqFb').innerHTML = `<b class="${ok ? 'good-t' : 'bad-t'}">${ok ? 'Верно' : 'Неверно'}.</b> <span class="gr big-gr">${esc(q.g)}</span>: ${esc(formName(q).toLowerCase())} от <span class="gr big-gr">${esc(q.v.v)}</span> (${esc(q.v.ru)}), ${q.bold ? 'форма для заучивания' : 'образуется по правилу'}.${note ? ` <span class="muted">${esc(note)}</span>` : ''}`;
  $('#pqScore').textContent = `верно: ${PQ.score}`; $('#pqNext').hidden = false; $('#pqNext').focus();
}
function pqFinish(){
  const N = PQ.list.length; $('#pqArea').hidden = true; $('#pqDone').hidden = false; $('#pqBar').style.width = '100%';
  $('#pqPct').textContent = Math.round(PQ.score / N * 100) + '%'; $('#pqSum').textContent = `Верно ${PQ.score} из ${N}.`;
  const bold = PQ.miss.filter(q => q.bold).length;
  $('#pqMiss').innerHTML = PQ.miss.length ? `Ошибки: <span class="gr big-gr">${PQ.miss.map(q => esc(q.g)).join(', ')}</span>.${bold ? ' Формы для заучивания с ошибкой попали в «Трудные» и вернутся в повторение сегодня.' : ''}${bold < PQ.miss.length ? ' Правильные формы стоит разобрать по правилам на с. 413.' : ''}` : 'Без ошибок.';
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
  return `${subHead('#/ch/3', 'Глава 3', 'Алфавит и произношение', 'Маунс, «Основы библейского греческого языка», с. 23–27')}
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
// «12,3%» — доля текста НЗ, которую составляют выученные слова
const pctNT = () => { const x = coverage() / NT_WORDS * 100; return (x > 0 && x < 0.1 ? '0,1' : x.toLocaleString('ru-RU', {maximumFractionDigits: 1})) + '%'; };
const STATE_PARTS = [['sure', 'Уверенно', 'интервал от двух недель'], ['learn', 'В изучении', ''], ['hard', 'Трудные', 'ошибка или «Повторить»'], ['new', 'Впереди', 'ещё не начаты']];
function stackCard(title, total, c, sub){
  return `<section class="card"><div class="plan-top"><h2>${title}</h2><span class="muted">${total} ${sub}</span></div>
    <div class="stack-bar" aria-hidden="true">${STATE_PARTS.map(([k]) => c[k] ? `<i class="${k}" style="flex:${c[k]}"></i>` : '').join('')}</div>
    <ul class="legend">${STATE_PARTS.map(([k, l, s]) => `<li><span class="sw ${k}"></span><span class="tt"><b>${l}</b>${s ? `<small>${s}</small>` : ''}</span><b class="n">${c[k]}</b></li>`).join('')}</ul>
  </section>`;
}
function vProgress(){
  const kn = lettersKnown(), st = streak(), cov = coverage(), learned = LEX.filter(w => isLearned(w.n)).length;
  const week = Array.from({length: 7}, (_, i) => addDays(weekStart(), i)), plans = planMap(), t = today();
  const all = {sure:0, learn:0, hard:0, new:0}; LEX.forEach(w => all[wState(w.n)]++);
  const open = openBold(), pc = {sure:0, learn:0, hard:0, new:0}; open.forEach(f => pc[fState(f.n)]++);
  const passed = passedCount(), cn = curCh();
  return `${head('Прогресс', 'Курс, слова, основные формы, алфавит и дни занятий')}
    <div class="cols"><div class="col">
      <section class="card"><div class="plan-top"><h2>Курс</h2><span class="muted">${passed} ${plural(passed, CH_F)} из ${CHAPTERS.length}</span></div>${bar(passed, CHAPTERS.length)}
        <p class="hint">${cn > 36 ? 'Учебник пройден.' : `Текущая глава ${cn}: ${esc(chapter(cn).t)}.`}</p><a class="btn" href="${cn > 36 ? '#/course' : '#/ch/' + cn}">${cn > 36 ? 'Открыть курс' : 'Открыть главу'}</a></section>
      <section class="card nt-card"><h2>Текст Нового Завета</h2>
        <p class="nt-line">Вы знаете слова, которые составляют <b>${pctNT()}</b> текста Нового Завета.</p>
        ${bar(cov, NT_WORDS, 'good')}
        <p class="hint">Выучено слов: ${learned}. Вместе они встречаются ${times(cov)} из ${NT_WORDS.toLocaleString('ru-RU')} слов текста. Выученным считается слово, которое вы хотя бы раз отметили «Знаю» и которое сейчас не трудное.</p></section>
      ${stackCard('Слова минимума', MINW.length, wordCounts(), plural(MINW.length, WORDS_F))}
      ${stackCard('Весь словарь', LEX.length, all, plural(LEX.length, WORDS_F))}
    </div><div class="col">
      <section class="card week-card" data-act="calendar" role="button" tabindex="0" aria-label="План выполнен: ${st} ${plural(st, DAYS_F)} подряд. Открыть календарь занятий">
        <div class="plan-top"><h2>План выполнен</h2><span class="muted">${st} ${plural(st, DAYS_F)} подряд</span></div>
        <div class="days" aria-hidden="true">${week.map((d, i) => { const dd = +d.slice(8), s = dayState(plans.get(d));
          return `<span class="${s}${d === t ? ' today' : ''}${d > t ? ' future' : ''}"><small>${WDM[i]}</small><i>${s === 'full' ? ICON.check : dd}</i></span>`; }).join('')}</div>
        <span class="week-more">${ICON.cal}Календарь занятий${ICON.chev}</span>
      </section>
      ${open.length ? stackCard('Основные формы', open.length, pc, `${plural(open.length, FORMS_F)} для заучивания открыто из ${BOLD.length}`)
        : `<section class="card"><div class="plan-top"><h2>Основные формы</h2><span class="muted">с главы 19</span></div><p class="hint">Формы для заучивания открываются вместе с главами, где учебник вводит времена глаголов.</p></section>`}
      <section class="card"><div class="plan-top"><h2>Алфавит</h2><span class="muted">знаю ${kn} из ${LETTERS.length}</span></div>${bar(kn, LETTERS.length, 'good')}
        <a class="btn" href="#/abc">Открыть алфавит</a></section>
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
    <section class="card"><h2>План на день</h2>
      <p class="hint">Порядок задаёт учебник: новые слова приходят из лексического минимума глав до текущей, по ${NEW} в день, плюс до ${NEW} слов, которые вы добавили из словаря. После главы 36 новые слова идут из словаря, от частых к редким.</p>
      <label class="check"><input type="checkbox" id="p-parts"${partsOn() ? ' checked' : ''}><span>Основные формы глаголов в плане: до ${NEW_PARTS} новых форм для заучивания в день и повторение тех, у кого подошёл срок. Формы открываются вместе с главами учебника</span></label>
    </section>
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
      <p class="hint">Вместе с аккаунтом удалится весь прогресс: слова, основные формы, буквы, главы и планы. Вернуть их будет нельзя.</p>
      <button type="button" class="btn danger" data-act="delete-account">Удалить аккаунт и все данные</button></div></details>
    <p class="hint"><a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a></p>
    </div></div>`;
}
async function loadProfileExtras(){
  if(isAdmin()){ try { S.invites = await pb.collection('invites').getFullList(); } catch(e){} }
  if(route().name === 'profile') schedule();
}
window.addEventListener('hashchange', () => { if(route().name === 'profile' && S.loaded) loadProfileExtras(); });
document.addEventListener('change', e => {
  if(e.target.name === 'p-theme') setTheme(e.target.value);
  if(e.target.id === 'p-parts') savePlanSettings({parts_off: !e.target.checked}, e.target);
});
// Выключатель основных форм хранится в профиле; задание на сегодня убирается или добавляется
async function savePlanSettings(patch, el){
  try {
    const r = await pb.collection('users').update(me().id, patch);
    pb.authStore.save(pb.authStore.token, r);
    replanToday();
    toast('Сохранено. План на сегодня обновлён');
    render(true);
  } catch(e){ toast(errText(e)); render(true); }
}
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
    case 'pass': passChapter(); break;
    case 'make-current': makeCurrent(+d.n); break;
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
function signOut(){ saveLS(cacheKey(), null); saveLS(qKey(), null); saveLS(chKey(), null); saveLS('avatar_' + me().id, null); pb.authStore.clear(); location.hash = ''; location.reload(); }
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
function toast(msg){ const el = $('#toast'); const host = [cropDlg, calDlg, wcDlg, dlg].find(x => x.open) || document.body; if(el.parentNode !== host) host.appendChild(el); el.textContent = msg; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2800); }

boot();
})();
