(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Справочники ---------- */
// LETTERS (data/letters.js), WORDS и SPECIAL (data/words.js), PARTS и CHAPTERS (data/chapters.js),
// DICT (data/dictionary.js, словарь учебника), VERBS (data/parts.js, основные формы) и карта курса
// COURSE, PP_OPEN, PP_EX, PP_NAME, PP_VERB_CH, COURSE_END (data/course.js), DRILLS и PREPS (data/drills.js, этап 3а) подключены отдельными файлами
const INT = [0, 1, 3, 7, 14, 30, 60]; // интервалы повторения по ступеням 0–6, дней
const NEW = 10;      // новых слов за сессию и в плане на день (и ещё до 10 добавленных вручную)
const NEW_PARTS = 5; // новых полужирных основных форм в плане на день
const QUIZ_N = 20;   // вопросов в тесте слов и основных форм
const SURE = 4;      // с этой ступени (интервал от двух недель) слово «уверенно»
const NT_WORDS = 138167; // слов в тексте Нового Завета (учебник, конец главы 8)
// forms: прогресс полужирных основных форм (form_progress, номер = глагол × 10 + форма). Старая parts_progress (этап 2) не загружается
// drills: прогресс таблиц, правил и карточек предлогов (drill_progress, этап 3а), ключ k из data/drills.js
const PBN = {words:'word_progress', letters:'letter_progress', plans:'plan_days', forms:'form_progress', added:'word_added', drills:'drill_progress'};
const KEYS = Object.keys(PBN);
const FIELDS = {words:['n','level','due','hard'], letters:['n','known','hard'], plans:['date','tasks','done'], forms:['n','level','due','hard'], added:['n'], drills:['k','level','due','hard']};
const MATCH = {words:'n', letters:'n', plans:'date', forms:'n', added:'n', drills:'k'}; // по какому полю запись единственная у пользователя
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
const S = {words:[], letters:[], plans:[], forms:[], added:[], drills:[], invites:[], loaded:false, access:null, adminUsers:null};
const WP = new Map(), LP = new Map(), FP = new Map(), AD = new Map(), DP = new Map(); // прогресс по номеру слова, буквы и формы; добавленные слова; таблицы и правила по ключу
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
  if(key === 'drills'){ DP.clear(); S.drills.forEach(r => DP.set(r.k, r)); }
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
    if(e && e.status){ CHP = 0; saveLS(chKey(), null); toast('Не удалось сохранить главу: ' + errText(e)); render(true); if(e.status === 403) loadAccess(); }
  }
}

/* ---------- Срок доступа (правки 3.1) ---------- */
// Состояние приходит с сервера (/api/greek/access, «сегодня» он считает по времени Хабаровска).
// Пока ответа нет (запуск без интернета), срок берётся из записи профиля на устройстве (access_until, suspended).
// Без доступа видны только «Сегодня» без плана, список глав, «Прогресс» и профиль; остальные экраны закрыты (render).
// Полоску вверху можно закрыть до следующего входа (gk_accHide сбрасывается при входе и выходе).
function acc(){
  const u = me(), a = S.access && S.access.uid === u.id ? S.access : null;
  const t = a && a.today > todayISO() ? a.today : todayISO();
  const admin = a ? a.admin : u.role === 'admin';
  const until = a ? a.until || '' : u.access_until || '';
  const suspended = a ? !!a.suspended : !!u.suspended;
  const reason = admin ? '' : suspended ? 'suspended' : until && until < t ? 'expired' : '';
  return {admin, until, suspended, reason, active: !reason, today: t, contact: (a && a.contact) || loadLS('contact', '')};
}
const closed = () => pb.authStore.isValid && !acc().active;
const OPEN_CLOSED = new Set(['home', 'course', 'dict', 'progress', 'profile']); // экраны, открытые без доступа
const contactHTML = c => /^[^\s@]+@[^\s@]+$/.test(c || '') ? `<a href="mailto:${esc(c)}">${esc(c)}</a>` : esc(c || 'администратору');
const dnum = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const leftText = k => k <= 0 ? 'сегодня последний день' : `осталось ${k} ${plural(k, DAYS_F)}`;
const accWhy = a => a.reason === 'expired' ? ` (срок закончился ${fmtDay(a.until)})` : '';
const ACC_REST = 'Ваш прогресс сохранён и виден, занятия, главы и словарь откроются после продления.';
const accMsg = () => `Доступ приостановлен: виден ваш прогресс, а заниматься и открывать главы и словарь нельзя. Чтобы продлить доступ, напишите: ${acc().contact || 'администратору'}.`;
async function loadAccess(){
  if(!pb.authStore.isValid) return;
  const was = closed();
  try {
    const a = await pb.send('/api/greek/access', {});
    S.access = {...a, uid: me().id};
    if(a.contact) saveLS('contact', a.contact);
  } catch(e){ return; }
  accessChanged(was);
}
// Доступ закрылся: открытые окна закрываются, закрытый экран сменяется «Сегодня»; открылся: всё как обычно
function accessChanged(was){
  renderAccessBar();
  if(was === closed()) return;
  if(closed()){
    if(wcDlg.open) wcDlg.close();
    if(dlg.open) dlg.close();
    if(cropDlg.open) cropFinish(null);
  }
  if(S.loaded) render(true);
}
const accKey = a => [me().id, a.reason, a.until].join('|');
function renderAccessBar(force){
  const a = acc(), bar = $('#access-bar');
  let html = '';
  if(!pb.authStore.isValid) html = '';
  else if(!a.active) html = `<b>Доступ приостановлен${accWhy(a)}.</b> ${ACC_REST} Чтобы продлить, напишите: ${contactHTML(a.contact)}`;
  else if(a.until && !a.admin && dnum(a.until) - dnum(a.today) <= 7) html = `Доступ действует до ${fmtDay(a.until)} (${leftText(Math.round(dnum(a.until) - dnum(a.today)))}). Чтобы продлить, напишите: ${contactHTML(a.contact)}`;
  bar.classList.toggle('off', !a.active);
  $('#access-text').innerHTML = html;
  if(force && html) saveLS('accHide', '');
  bar.hidden = !html || loadLS('accHide', '') === accKey(a);
}
$('#access-close').addEventListener('click', () => { saveLS('accHide', accKey(acc())); $('#access-bar').hidden = true; });
function accessLine(){
  const a = acc();
  if(a.admin) return 'Вы администратор, доступ бессрочный.';
  if(!a.active) return `Доступ приостановлен${accWhy(a)}. ${ACC_REST} Чтобы продлить, напишите: ${contactHTML(a.contact)}`;
  return a.until ? `Доступ действует до ${fmtDay(a.until)} включительно.` : 'Доступ бессрочный.';
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
  if(closed()){ toast(accMsg()); return null; } // без доступа заниматься нельзя: ничего не сохраняем и не копим в очереди
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
  let denied = false;
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
        // ошибка сервера (в том числе доступ закрыт): запись не копится в очереди, показываем ошибку
        delete Q[qk]; saveLS(qKey(), Q);
        if(e.status === 403) denied = true;
        toast('Не удалось сохранить: ' + errText(e));
      }
    }
  } finally {
    flushing = false;
    // доступ закрыт: перечитываем его и прогресс с сервера, чтобы на экране не осталось несохранённого
    if(denied){ loadAccess(); loadAll().catch(() => {}); }
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
  await pb.collection('users').subscribe(me().id, e => { if(e.action === 'update'){ const was = closed(); pb.authStore.save(pb.authStore.token, e.record); themeFromUser(); accessChanged(was); schedule(); loadAccess(); } });
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
// времён и формы со сроком; drills (этап 3а): таблицы, правила и предлоги со сроком и новые (до 3 и до 5) из глав до текущей;
// alphabet: трудные и невыученные буквы, с главы 3. План составляется при первом открытии дня
// и хранится в plan_days. У заданий new и parts есть ch: глава, для которой они составлены
const TASK_ORDER = ['review', 'new', 'drills', 'parts', 'alphabet'];
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
  if(t.key === 'drills') return ITEMS.filter(d => isDDue(d.k)).concat((t.items || []).map(k => ITEM.get(k)).filter(d => d && !dRec(d.k)));
  return [];
}
function buildPlan(){
  const tasks = [];
  const due = taskDeck({key: 'review'}).length;
  if(due) tasks.push({key: 'review', count: due, done: false});
  const next = nextNew();
  if(next.length) tasks.push({key: 'new', words: next, ch: curCh(), done: false});
  const dt = drillsTask();
  if(dt) tasks.push(dt);
  const pt = partsTask();
  if(pt) tasks.push(pt);
  const abc = lettersLeft().length;
  if(abc && curCh() >= 3) tasks.push({key: 'alphabet', count: abc, done: false});
  return tasks;
}
// Привести сегодняшний план в соответствие с текущей главой. Ещё не начатые задания new и parts, составленные
// для другой главы (или старым приложением), пересобираются; алфавит до главы 3 убирается.
// add: добавить недостающие задания (после нажатия «Глава пройдена» или «Сделать текущей»), если план ещё не выполнен
function fitPlan(tasks, add, fresh){
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
  // Таблицы и правила: так же, как основные формы. Плану, составленному до этапа 3а, задание добавляется один раз (fresh)
  const q = out.findIndex(t => t.key === 'drills'), dt0 = out[q];
  if(q >= 0 ? !dt0.done && dt0.ch !== ch && !(dt0.items || []).some(k => dRec(k)) : add || fresh){
    const dt = drillsTask();
    if(q >= 0){ if(dt) out[q] = dt; else out.splice(q, 1); changed = true; }
    else if(dt){ out.push(dt); changed = true; }
  }
  const k = out.findIndex(t => t.key === 'alphabet');
  if(k >= 0 && !out[k].done && ch < 3){ out.splice(k, 1); changed = true; }
  if(k < 0 && add && ch >= 3){ const n = lettersLeft().length; if(n){ out.push({key: 'alphabet', count: n, done: false}); changed = true; } }
  return changed ? out : null;
}
// Составить план на сегодня, если его ещё нет; согласовать с текущей главой; отметить задания, которые уже нечего делать
function checkPlan(){
  if(!UI.ready || !pb.authStore.isValid || !chKnown() || closed()) return; // без доступа план не составляется
  const p = todayPlan();
  if(!p){ const tasks = buildPlan(); saveRec('plans', today(), {tasks, done: tasks.length === 0}); return; }
  // план, составленный до этапа 3а: задание «Таблицы и правила» добавляется один раз за день (отметка на устройстве)
  const mark = 'drills_fit_' + me().id, fresh = !p.done && loadLS(mark, '') !== p.date && !(p.tasks || []).some(t => t.key === 'drills');
  if(loadLS(mark, '') !== p.date) saveLS(mark, p.date);
  let tasks = fitPlan(p.tasks || [], false, fresh), changed = !!tasks;
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
  const n = t.done ? (t.count || (t.words || []).length || (t.forms || t.verbs || t.items || []).length) : t.key === 'new' ? (t.words || []).length : taskDeck(t).length;
  if(t.key === 'review') return {title: `Слова к повторению · ${n}`, min: Math.max(1, Math.ceil(n * 8 / 60)), href: '#/task/review'};
  if(t.key === 'new'){ const r = newInfo(t.words || []); return {title: `Новые слова${r.range ? ', ' + r.range : ''} · ${n}`, sub: r.sub, min: Math.max(2, Math.ceil(n * 25 / 60)), href: '#/task/new'}; }
  if(t.key === 'parts'){ const fresh = (t.forms || []).filter(x => !fRec(x)).length; return {title: `Основные формы · ${n}`, sub: t.done ? '' : [fresh ? `новых форм: ${fresh}` : '', n - fresh > 0 ? `повторить: ${n - fresh}` : ''].filter(Boolean).join(', '), min: Math.max(1, Math.ceil(n * 12 / 60)), href: '#/task/parts'}; }
  if(t.key === 'drills'){ const fresh = (t.items || []).filter(k => !dRec(k)).length; return {title: `Таблицы и правила · ${n}`, sub: t.done ? '' : [fresh ? `новых: ${fresh}` : '', n - fresh > 0 ? `повторить: ${n - fresh}` : ''].filter(Boolean).join(', '), min: Math.max(2, Math.ceil(n * 50 / 60)), href: '#/task/drills'}; }
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
  renderAccessBar();
  render(true);
  try {
    await Promise.all([loadAll(), loadAccess()]);
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
  renderAccessBar(); loadAccess();
  if(['home', 'task'].includes(route().name)) render(true); else schedule();
}
setInterval(checkDay, 30e3);
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  checkUpdate(); checkDay();
  if(S.loaded && pb.authStore.isValid){ loadAccess(); flush(); pushChapter(); loadAll().catch(() => {}); }
});
window.addEventListener('online', () => { $('#notice').hidden = true; if(S.loaded){ loadAccess(); flush(); pushChapter(); loadAll().catch(() => {}); } });
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
   #/dict словарь, #/words?r=НАБОР&m=quiz карточки и тест слов, #/parts?m=cards|quiz|table&v=N|ch=N основные формы,
   #/drills таблицы и правила по главам, #/drill?k=КЛЮЧИ|set=srs|hard[&m=view] упражнения (этап 3а),
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
  drills: {f: vDrills}, drill: {f: vDrill, init: initDrill, still: true},
  progress: {f: vProgress}, profile: {f: vProfile},
};
const TAB = {home:'today', task:'today', course:'course', ch:'course', abc:'course', parts:'course', drills:'course', drill:'course', dict:'dict', words:'dict', progress:'progress'};
let raf = 0;
function schedule(){ if(raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render(force){
  const r = route();
  // без доступа закрытый экран (адрес, кнопка «Назад», старая ссылка, ярлык) сменяется «Сегодня» с полоской о доступе
  if(VIEWS[r.name] && !OPEN_CLOSED.has(r.name) && closed()){ renderAccessBar(true); location.replace('#/'); return; }
  $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.tab === TAB[r.name] ? 'page' : 'false'));
  const m = $('#main');
  if(!S.loaded){ m.innerHTML = '<div class="loading">Загружаю…</div>'; return; }
  checkPlan();
  const v = VIEWS[r.name] || VIEWS.home;
  if(v.still && !force && UI.shown === location.hash) return;
  KB.target = null; // греческая клавиатура: каждый экран подключает её заново
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
  if(closed()) return `${head('Сегодня', longDate())}<div class="cols"><div class="col">${chapterStatic()}${accessCard()}</div><div class="col">${weekCard()}</div></div>`;
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
// Третий элемент пункта (этап 3а): ключи упражнений из drills.js (или «p:N» — предлоги главы N); у таких пунктов кнопка «Учить»
const learnList = c => `<ul class="learn-list">${c.learn.map(([t, pg, dk]) => { const its = dk ? itemsOf(dk) : [];
  return `<li><span>${esc(t)}</span><small>с. ${esc(pg)}</small>${its.length ? `<a class="btn sm learn-go" href="#/drill?k=${encodeURIComponent(dk)}">${its.length === 1 && its[0].kind === 't' ? 'Учить таблицу' : 'Учить'}</a>` : ''}</li>`; }).join('')}</ul>`;
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
// Без доступа: глава без ссылки, «Заучить» и кнопки, только полосы курса и слов минимума
function chapterStatic(){
  const n = curCh(), passed = passedCount(), learned = MINW.filter(w => isLearned(w.n)).length;
  return `<section class="card chap-now">
    <span class="kicker">${n > 36 ? 'Курс' : 'Текущая глава'}</span>
    ${n > 36 ? '<h2>Учебник пройден</h2>' : `<div class="chap-link"><h2>Глава ${n}</h2><span>${esc(chapter(n).t)}</span></div>`}
    <div class="meter"><div class="meter-t"><span>Курс</span><b>${passed} ${plural(passed, CH_F)} из ${CHAPTERS.length}</b></div>${bar(passed, CHAPTERS.length)}</div>
    <div class="meter"><div class="meter-t"><span>Слова минимума</span><b>${learned} из ${MINW.length}</b></div>${bar(learned, MINW.length, 'good')}</div>
  </section>`;
}
// Карточка вместо плана на день, когда доступа нет
function accessCard(){
  const a = acc();
  return `<section class="card acc-card"><h2>Доступ приостановлен</h2>
    <p class="lead">${a.reason === 'expired' ? `Срок доступа закончился ${fmtDay(a.until)}. ` : ''}${ACC_REST}</p>
    <p class="hint">Чтобы продлить, напишите: ${contactHTML(a.contact)}</p></section>`;
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
  if(t.key === 'drills') return `${subHead('#/', 'Сегодня', 'Таблицы и правила', 'Пункты, у которых подошёл срок, и новые из глав до текущей')}<div class="trainer">${drillTrainerHTML(true)}</div>`;
  if(t.key === 'parts'){ PS.ch = 0; return `${subHead('#/', 'Сегодня', 'Основные формы', 'Новые полужирные формы и формы, у которых подошёл срок повторения')}<div class="trainer">${pCardsHTML(true)}</div>`; }
  return `${subHead('#/', 'Сегодня', esc(i.title.replace(/ · \d+$/, '')), t.key === 'new' ? (i.sub ? 'Новые слова: ' + esc(i.sub) : 'Новые слова по порядку учебника') : 'Слова, у которых подошёл срок повторения')}<div class="trainer">${wCardsHTML(true)}</div>`;
}
function initTask(r){
  const p = todayPlan(), t = p && (p.tasks || []).find(x => x.key === r.id);
  if(!t) return;
  if(t.key === 'alphabet') startAbcCards(t); else if(t.key === 'parts') startPCards(t); else if(t.key === 'drills') startDrills(t); else startWCards(t);
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
  // без доступа глава не открывается: строка без ссылки
  const tag = closed() ? 'div' : 'a';
  return `<${tag} class="ch-row ${st}${closed() ? ' static' : ''}"${closed() ? '' : ` href="#/ch/${c.n}"`}><span class="num">${c.n}</span>
    <span class="tt"><b>${esc(c.t)}</b><small>${sub}</small></span><span class="st ${st}">${st === 'passed' ? ICON.check : ''}${ST_TEXT[st]}</span></${tag}>`;
}
function vCourse(){
  const passed = passedCount(), n = curCh();
  return `${head('Курс', `Маунс, «Основы библейского греческого языка» · ${n > 36 ? 'учебник пройден' : `текущая глава ${n}, пройдено ${passed} из ${CHAPTERS.length}`}`)}
    <div class="parts">${PARTS.map(p => `<section class="card part"><h2><span>Часть ${p.n}</span>${esc(p.t)}</h2>
      <div class="ch-list">${CHAPTERS.filter(c => c.n >= p.from && c.n <= p.to).map(chapterRow).join('')}</div></section>`).join('')}</div>
    ${closed() ? `${sectionsLine()}<p class="hint">Доступ приостановлен: главы, алфавит, основные формы, таблицы и правила откроются после продления. Прогресс сохранён.</p>` : `${drillsCard()}
    ${partsCard()}
    <p class="hint">Главы открываются по порядку: следующая становится текущей, когда вы нажимаете «Глава пройдена». Чтобы вернуться к пройденной главе, откройте её и нажмите «Сделать текущей». Главы впереди можно смотреть и учить их слова карточками, в план на день они придут в свой черёд.</p>`}`;
}
// Без доступа: алфавит, основные формы, таблицы и правила одной строкой прогресса, без кнопок
function sectionsLine(){
  const open = openBold(), fst = open.filter(f => fRec(f.n)).length, fsure = open.filter(f => fState(f.n) === 'sure').length;
  const dop = dOpenItems(), dst = dop.filter(d => dRec(d.k)).length, dsure = dop.filter(d => dState(d.k) === 'sure').length;
  const rows = [['Алфавит', `начато ${LP.size} из ${LETTERS.length}, знаю ${lettersKnown()}`],
    ['Основные формы', open.length ? `начато ${fst} из ${open.length}, уверенно ${fsure}` : 'откроются с главы 19'],
    ['Таблицы и правила', dop.length ? `начато ${dst} из ${dop.length}, уверенно ${dsure}` : 'откроются с главы 3']];
  return `<section class="card"><h2>Разделы</h2><ul class="legend">${rows.map(([t, v]) => `<li><span class="tt"><b>${t}</b><small>${v}</small></span></li>`).join('')}</ul></section>`;
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
  const dits = ITEMS.filter(d => d.ch === c.n), refs = REFS.filter(d => d.ch === c.n);
  const learn = `<section class="card"><h2>Заучить в этой главе</h2>${k.learn.length ? learnList(k) : '<p class="hint">В этой главе автор не просит ничего заучивать.</p>'}
      ${dits.length ? `<div class="row between drill-sum"><span class="meta">Таблицы и правила главы: начато ${dits.filter(d => dRec(d.k)).length} из ${dits.length}${st === 'ahead' ? '. Глава впереди: тренироваться можно, в план новые придут в свой черёд' : ''}</span><a class="btn sm" href="#/drill?k=ch:${c.n}">Учить всё</a></div>` : ''}
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
      ${fs.length ? `<a class="btn primary" href="#/parts?ch=${c.n}">${ICON.cards}Формы этой главы</a>` : `<a class="btn" href="#/parts?m=table">${ICON.table}Таблица основных форм</a>`}</section>` : '';
  const refCard = refs.length ? `<section class="card"><h2>Таблицы для справки</h2><p class="hint">Для справки, заучивать не нужно: автор советует понимать эти формы и узнавать их в тексте.</p>
      <ul class="dl">${refs.map(d => `<li class="drow ref"><span class="tt"><b>${esc(d.t)}</b><small>с. ${esc(d.p)}</small></span><span class="acts"><a class="btn sm ghost" href="#/drill?k=${d.k}&m=view">Посмотреть</a></span></li>`).join('')}</ul></section>` : '';
  return `${subHead('#/course', 'Курс', `Глава ${c.n}. ${esc(c.t)}`, `${tbText(k)} · ${wbText(k)}`)}
    <div class="cols"><div class="col">${status}${learn}${words}${forms}${refCard}</div>
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

/* ---------- Таблицы и правила (этап 3а): заполнение таблиц, карточки правил и предлогов ---------- */
// DRILLS и PREPS (data/drills.js). Учебные пункты: таблицы (kind t), правила (r), карточки «предлог + падеж» (p);
// таблицы kind v только для справки. Прогресс в drill_progress по ключу k, интервалы те же, что у слов.
// План: пункты со сроком из любых глав и новые из глав до текущей по порядку учебника: до 3 таблиц и правил и до 5 предлогов
const NEW_DRILLS = 3, NEW_PREPS = 5;
const ITEMS_F = ['пункт', 'пункта', 'пунктов'];
const KIND_RU = {t: 'таблица', r: 'правило', p: 'предлог', v: 'для справки'};
const withGrid = d => d.cells ? {...d, grid: d.cells.map(r => r.split('|'))} : d;
const ITEMS = DRILLS.filter(d => d.kind !== 'v').concat(PREPS.map(p => ({...p, kind: 'p', t: `${p.g} + ${p.c}`})))
  .map((d, i) => ({...withGrid(d), i})).sort((a, b) => a.ch - b.ch || a.i - b.i);
const ITEM = new Map(ITEMS.map(d => [d.k, d]));
const REFS = DRILLS.filter(d => d.kind === 'v').map(withGrid);
const REF = new Map(REFS.map(d => [d.k, d]));
const dRec = k => DP.get(k);
function dState(k){ const r = dRec(k); if(!r) return 'new'; if(r.hard) return 'hard'; return (r.level || 0) >= SURE ? 'sure' : 'learn'; }
const isDDue = k => { const r = dRec(k); return !!r && r.due <= today(); };
const dOpenItems = () => ITEMS.filter(d => d.ch <= curCh());
const setDrill = (k, patch) => saveRec('drills', k, patch);
const strictOn = () => !!me().strict_marks;
const dlvl = k => { const s = dRec(k); return s ? '●'.repeat(s.level || 0) + '○'.repeat(6 - (s.level || 0)) : 'новый'; };
// Новые на сегодня: по порядку учебника из глав до текущей
function drillsFresh(){
  const open = dOpenItems().filter(d => !dRec(d.k));
  return open.filter(d => d.kind !== 'p').slice(0, NEW_DRILLS).concat(open.filter(d => d.kind === 'p').slice(0, NEW_PREPS));
}
function drillsTask(){
  const items = drillsFresh().map(d => d.k), due = ITEMS.filter(d => isDDue(d.k)).length;
  return items.length || due ? {key: 'drills', items, count: due, ch: curCh(), done: false} : null;
}
// Пункты, которые открывает кнопка «Учить»: ключи через запятую, «p:N» — предлоги главы N, «ch:N» — всё из главы N
function itemsOf(spec){
  const out = [];
  String(spec || '').split(/[,\s]+/).filter(Boolean).forEach(s => {
    const m = s.match(/^(p|ch):(\d+)$/);
    const add = m ? ITEMS.filter(d => d.ch === +m[2] && (m[1] === 'ch' || d.kind === 'p')) : [ITEM.get(s)].filter(Boolean);
    add.forEach(d => { if(!out.includes(d)) out.push(d); });
  });
  return out;
}

/* Клетки таблицы. «–» нет окончания; «_α» подчёркнутая буква; «σι(ν)» ν можно не писать; «α/ν» любой вариант;
   «μου (ἐμοῦ)» оба варианта; «ἐστίν~ἐστί» после «~» другие верные ответы */
function cellParse(c){
  const [show, ...alts] = c.split('~'), acc = new Set([show, ...alts]);
  const m = show.match(/^(\S+) \((.+)\)$/); if(m){ acc.add(m[1]); acc.add(m[2]); }
  [...acc].forEach(x => {
    if(x.includes('(ν)')){ acc.add(x.replace('(ν)', '')); acc.add(x.replace('(ν)', 'ν')); }
    if(x.includes('/')) x.split('/').forEach(y => acc.add(y));
  });
  return {show, acc: [...acc]};
}
const cellShow = c => esc(cellParse(c).show).replace(/_(.)/gu, '<u>$1</u>');
// Сравнение ответа: без регистра, σ = ς, лишние пробелы не важны. Подписная йота проверяется всегда;
// ударения, придыхания и диарезис только при строгой проверке. Знаки над буквой приводятся к одному порядку
const MARK_GRP = {'̓': 1, '̔': 1, '̈': 2, '́': 3, '̀': 3, '͂': 3, 'ͅ': 4};
const LOOSE = /[̓̔̈́̀͂]/g;
const sortMarks = t => t.replace(/(\P{M})(\p{M}+)/gu, (m, b, ms) => b + [...ms].sort((x, y) => (MARK_GRP[x] || 9) - (MARK_GRP[y] || 9)).join(''));
function canon(s, strict){
  let t = String(s).normalize('NFD').replace(/_/g, '').toLowerCase().replace(/ς/g, 'σ')
    .replace(/[-—]/g, '–').replace(/['ʼ᾽᾿]/g, '’').replace(/\s+/g, ' ').trim();
  if(!strict) t = t.replace(LOOSE, '');
  return sortMarks(t);
}
const cellOk = (c, input, strict) => { const v = canon(input || '', strict); return !!v && cellParse(c).acc.some(a => canon(a, strict) === v); };
// Ввод: конечная сигма ставится сама, знак добавляется к последней букве (повторное нажатие снимает его)
const finalS = s => s.replace(/σ(?![\p{L}\p{M}])/gu, 'ς');
function addMark(s, c){
  const m = s.normalize('NFD').match(/^([\s\S]*?)(\p{L})(\p{M}*)$/u);
  if(!m) return s;
  let ms = [...m[3]];
  if(ms.includes(c)) ms = ms.filter(x => x !== c);
  else { ms = ms.filter(x => MARK_GRP[x] !== MARK_GRP[c]); ms.push(c); }
  return sortMarks(m[1] + m[2] + ms.join('')).normalize('NFC');
}
const delLast = s => s.normalize('NFD').replace(/[\s\S]\p{M}*$/u, '').normalize('NFC');

/* ---------- Экранная греческая клавиатура ---------- */
// Буквы по алфавиту, подписная йота, прочерк, пробел, стирание. Ряд знаков (придыхания, ударения, диарезис) при строгой проверке.
// С клавиатуры компьютера: латиница по физическим клавишам (работает при любой раскладке, в том числе русской)
const KB = {target: null};
const KB_ROWS = ['αβγδεζηθ', 'ικλμνξοπ', 'ρστυφχψω'];
const KB_MARKS = [['\u0313', '᾿', 'тонкое придыхание', 'тонкое'], ['\u0314', '῾', 'густое придыхание', 'густое'], ['\u0301', '´', 'острое ударение', 'острое'], ['\u0300', '`', 'тяжёлое ударение', 'тяжёлое'], ['\u0342', '῀', 'облечённое ударение', 'облеч.'], ['\u0308', '¨', 'диарезис', 'диарез.']];
const LAT = {KeyA: 'α', KeyB: 'β', KeyG: 'γ', KeyD: 'δ', KeyE: 'ε', KeyZ: 'ζ', KeyH: 'η', KeyQ: 'θ', KeyI: 'ι', KeyK: 'κ', KeyL: 'λ', KeyM: 'μ',
  KeyN: 'ν', KeyC: 'ξ', KeyO: 'ο', KeyP: 'π', KeyR: 'ρ', KeyS: 'σ', KeyT: 'τ', KeyU: 'υ', KeyF: 'φ', KeyX: 'χ', KeyY: 'ψ', KeyW: 'ω'};
const KB_HELP = `<div class="kb-help" hidden><p><b>С клавиатуры компьютера</b> (при любой раскладке):</p>
  <p class="gr kb-map">${Object.entries(LAT).map(([c, g]) => `<span><kbd>${c.slice(3).toLowerCase()}</kbd> ${g}</span>`).join('')}</p>
  <p class="kb-map"><span><kbd>)</kbd> тонкое придыхание</span><span><kbd>(</kbd> густое</span><span><kbd>/</kbd> острое ударение</span><span><kbd>\\</kbd> тяжёлое</span><span><kbd>=</kbd> облечённое</span><span><kbd>|</kbd> подписная йота</span><span><kbd>+</kbd> диарезис</span><span><kbd>-</kbd> прочерк</span><span><kbd>Tab</kbd> следующая клетка</span><span><kbd>Enter</kbd> проверить</span></p></div>`;
function kbHTML(o){
  const key = (attr, label, aria, cls) => `<button type="button" class="key${cls ? ' ' + cls : ''}" ${attr}${aria ? ` aria-label="${aria}"` : ''}>${label}</button>`;
  return `<div class="kb${o.dock ? ' dock' : ''}" role="group" aria-label="Греческая клавиатура">
    <div class="kb-top"><span class="meta">${o.marks ? 'Знак ставится на последнюю букву' : 'Ударения и придыхания можно не ставить'}</span><button type="button" class="kb-q" data-kbhelp aria-label="Как печатать с клавиатуры компьютера">?</button></div>
    ${KB_HELP}
    ${o.marks ? `<div class="kb-row marks">${KB_MARKS.map(([c, s, l, sh]) => key(`data-mk="${c}"`, `<span>${s}</span><small>${sh}</small>`, l, 'mk')).join('')}</div>` : ''}
    ${KB_ROWS.map(r => `<div class="kb-row">${[...r].map(ch => key(`data-ch="${ch}"`, ch, '', 'gr')).join('')}</div>`).join('')}
    <div class="kb-row fn">${key('data-mk="ͅ"', '<span class="gr">ͺ</span><small>йота</small>', 'подписная йота', 'mk')}
      ${o.dash ? key('data-fn="dash"', '–', 'прочерк: окончания нет', '') : ''}
      ${key('data-fn="space"', '<small>пробел</small>', 'пробел', 'wide2')}
      ${key('data-fn="back"', '⌫', 'стереть', '')}
      ${o.next ? key('data-fn="next"', '→', 'следующая клетка', '') : ''}</div></div>`;
}
function kbPress(b){
  const t = KB.target; if(!t) return;
  if(b.dataset.ch) t.ins(b.dataset.ch);
  else if(b.dataset.mk) t.mark(b.dataset.mk);
  else if(t[b.dataset.fn]) t[b.dataset.fn]();
}
// Нажатие на экранную клавишу не уводит фокус из поля ввода
document.addEventListener('pointerdown', e => { const b = e.target.closest('.kb .key'); if(b){ e.preventDefault(); kbPress(b); } });
document.addEventListener('click', e => {
  const b = e.target.closest('.kb .key'); if(b && e.detail === 0) kbPress(b); // нажатие с клавиатуры (Enter на кнопке)
  const q = e.target.closest('[data-kbhelp]'); if(q){ const h = q.closest('.kb').querySelector('.kb-help'); h.hidden = !h.hidden; }
});
function kbKey(e){
  const t = KB.target, c = e.code, sh = e.shiftKey;
  if(LAT[c] && t.ins) t.ins(LAT[c]);
  else if(c === 'Digit0' && sh) t.mark('̓');
  else if(c === 'Digit9' && sh) t.mark('̔');
  else if(c === 'Slash' && !sh) t.mark('́');
  else if(c === 'Backslash') t.mark(sh ? 'ͅ' : '̀');
  else if(c === 'Equal') t.mark(sh ? '̈' : '͂');
  else if(c === 'Minus' && !sh && t.dash) t.dash();
  else if(c === 'Backspace') t.back();
  else if(c === 'Space' && t.space) t.space();
  else if((c === 'Tab' || c === 'ArrowRight' || c === 'ArrowDown') && t.next) t.next(c === 'Tab' && sh);
  else if((c === 'ArrowLeft' || c === 'ArrowUp') && t.next) t.next(true);
  else if((c === 'Enter' || c === 'NumpadEnter') && t.enter) t.enter();
  else return false;
  return true;
}
document.addEventListener('keydown', e => {
  const t = KB.target;
  if(!t || e.ctrlKey || e.metaKey || e.altKey || !t.wants(e)) return;
  if(kbKey(e)) e.preventDefault();
});
// Поле ввода с греческой клавиатурой (поиск в словаре)
function inputTarget(inp){
  const edit = f => {
    const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
    const [before, after] = f(inp.value.slice(0, a).replace(/ς/g, 'σ'), inp.value.slice(b).replace(/ς/g, 'σ'));
    inp.value = finalS(before + after); inp.setSelectionRange(before.length, before.length);
    inp.dispatchEvent(new Event('input', {bubbles: true}));
  };
  return {
    wants: e => document.activeElement === inp,
    ins: ch => edit((b, a) => [b + ch, a]), mark: c => edit((b, a) => [addMark(b, c), a]),
    back: () => edit((b, a) => [delLast(b), a]), space: () => edit((b, a) => [b + ' ', a]),
  };
}

/* ---------- Сессия: пункты по очереди ---------- */
// Таблица: новая сначала показывается целиком, потом заполнение. Пустых клеток тем больше, чем выше ступень:
// 0 четверть (не меньше 2), 1 40%, 2 60%, 3 80%, с 4-й вся таблица. Ошибка: ступень 0, трудное, таблица возвращается
// в конце сессии, а клетки с ошибками снова пустые. Правило и предлог: «Знаю» / «Повторить», как у слов
const FRAC = [0.25, 0.4, 0.6, 0.8, 1, 1, 1];
const DS = {deck: [], idx: 0, failed: new Set(), wrong: new Map(), task: null, size: 0, known: 0, phase: '', blanks: [], vals: {}, cur: '', peek: false, set: '', title: ''};
function pickBlanks(d, level, force){
  const cells = [];
  d.grid.forEach((row, r) => row.forEach((c, j) => { if(c) cells.push(r + ':' + j); }));
  const out = new Set();
  if(d.lines){
    const lines = d.rows.map((_, r) => d.cols.map((_, j) => r + ':' + j)).concat(d.cols.map((_, j) => d.rows.map((_, r) => r + ':' + j)));
    if(level >= 2) cells.forEach(x => out.add(x)); else shuffle(lines).slice(0, level + 1).forEach(l => l.forEach(x => out.add(x)));
  } else {
    const n = Math.min(cells.length, Math.max(2, Math.round(cells.length * FRAC[Math.min(level, 6)])));
    shuffle(cells).slice(0, n).forEach(x => out.add(x));
  }
  (force || []).forEach(x => out.add(x));
  return cells.filter(x => out.has(x)); // по порядку чтения: строка за строкой
}
const cellAt = (d, key) => { const [r, j] = key.split(':').map(Number); return d.grid[r][j]; };
// Таблица как в книге: падежи по строкам, роды по столбцам, сверху склонение
function drillTable(d, mode){
  const fill = mode === 'fill', chk = mode === 'check', showInfo = d.info && !fill;
  const blanks = new Set(fill || chk ? DS.blanks : []);
  const strict = strictOn();
  const top = d.groups ? `<tr class="decl"><th></th>${d.groups.map(([t, n]) => `<th colspan="${n}">${esc(t)}</th>`).join('')}</tr>`
    : d.decl ? `<tr class="decl"><th></th>${d.decl.map(x => `<th>${esc(x)}</th>`).join('')}</tr>` : '';
  const td = (c, key) => {
    if(!c) return '<td class="none"></td>';
    if(!blanks.has(key)) return `<td>${cellShow(c)}</td>`;
    const v = DS.vals[key] || '';
    if(fill) return `<td class="blank"><button type="button" class="cin${key === DS.cur ? ' on' : ''}" data-c="${key}" aria-label="Клетка ${d.rows[+key.split(':')[0]]}, ${d.cols[+key.split(':')[1]]}">${DS.peekShow ? `<span class="peek">${cellShow(c)}</span>` : esc(finalS(v))}</button></td>`;
    const ok = cellOk(c, v, strict), same = canon(v, true) === canon(cellParse(c).show, true);
    return `<td class="${ok ? 'ok' : 'err'}">${ok ? (same ? cellShow(c) : `${cellShow(c)}<small class="was">вы: ${esc(finalS(v))}</small>`)
      : `${v ? `<s>${esc(finalS(v))}</s>` : '<s class="empty">пусто</s>'}<span class="right">${cellShow(c)}</span>`}</td>`;
  };
  return `<div class="tbl-wrap"><table class="ptab${d.grid[0].length > 3 ? ' many' : ''}">
    <thead>${top}<tr><th></th>${d.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${d.grid.map((row, r) => `<tr${r === 4 && d.rows.length === 8 ? ' class="pl"' : ''}><th class="rl${d.rowsGr ? ' gr' : ''}">${esc(d.rows[r]).replace(/^(.+? п\.) (.+)$/, '$1<br>$2')}${showInfo && d.info[r] ? `<small>${esc(d.info[r])}</small>` : ''}</th>${row.map((c, j) => td(c, r + ':' + j)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const srcLine = d => `Учебник, с. ${esc(d.p)} · глава ${d.ch}`;
function drillTrainerHTML(task){
  return `<div class="pbar thin"><i id="dBar"></i></div>
    <div class="row between"><span class="meta" id="dMeta"></span><span class="meta" id="dMode">${strictOn() ? 'Ударения и придыхания проверяются' : 'Ударения и придыхания не проверяются'}</span></div>
    <div id="dArea"></div>
    <div class="done-box" id="dDone" hidden></div>
    ${task ? '' : '<p class="meta center" id="dStats"></p>'}`;
}
function startDrills(task, list){
  DS.task = task; DS.idx = 0; DS.known = 0; DS.failed.clear(); DS.wrong.clear();
  if(task){ const d = taskDeck(task); DS.deck = shuffle(d.filter(x => dRec(x.k))).concat(d.filter(x => !dRec(x.k))); }
  else DS.deck = list.slice();
  DS.size = DS.deck.length;
  if(!DS.deck.length) return dFinish();
  dItem();
}
function dItem(){
  const d = DS.deck[DS.idx], r = dRec(d.k);
  DS.peek = false; DS.peekShow = false; DS.vals = {};
  if(d.kind === 't'){
    DS.phase = !r && !DS.failed.has(d.k) ? 'study' : 'fill';
    DS.blanks = pickBlanks(d, DS.failed.has(d.k) ? 0 : (r ? r.level || 0 : 0), DS.wrong.get(d.k));
    DS.cur = DS.blanks[0];
  } else DS.phase = 'front';
  $('#dMeta').textContent = `${DS.idx + 1} из ${DS.deck.length}`;
  $('#dBar').style.width = (DS.idx / DS.deck.length * 100) + '%';
  dDraw();
  dStats();
}
function dDraw(){
  const d = DS.deck[DS.idx], area = $('#dArea'); if(!d || !area) return;
  const top = `<div class="dc-top"><span class="kicker">гл. ${d.ch} · ${KIND_RU[d.kind]}</span><span class="lvl">${dlvl(d.k)}</span></div>`;
  KB.target = null;
  if(d.kind === 't'){
    const ph = DS.phase, n = DS.blanks.length;
    const res = ph === 'check' ? DS.blanks.filter(k => !cellOk(cellAt(d, k), DS.vals[k], strictOn())).length : 0;
    area.innerHTML = `<section class="card dcard dtab">${top}<h2>${esc(d.t)}</h2>${d.sub ? `<p class="hint">${esc(d.sub)}</p>` : ''}
      ${drillTable(d, ph === 'study' ? 'view' : ph === 'fill' ? 'fill' : 'check')}
      ${ph !== 'fill' && d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}
      <p class="src">${srcLine(d)}</p>
      ${ph === 'study' ? `<p class="hint">Новая таблица: посмотрите её целиком и проговорите вслух, потом заполните пустые клетки.</p><button type="button" class="btn primary wide" id="dFill">Заполнить</button>`
      : ph === 'fill' ? `<p class="hint">Пустых клеток: ${n}. ${DS.peek ? '<b class="bad-t">Вы подсмотрели: таблица вернётся в конце как «Повторить».</b>' : 'Нажмите клетку и печатайте.'}</p>
        <div class="row"><button type="button" class="btn" id="dPeek">${DS.peekShow ? 'Скрыть ответы' : 'Посмотреть таблицу'}</button><button type="button" class="btn primary" id="dCheck">Проверить</button></div>`
      : `<p class="lead ${res || DS.peek ? 'bad-t' : 'ok'}">${res ? `Ошибок: ${res} из ${n}. Таблица вернётся в конце, клетки с ошибками будут снова пустыми.` : DS.peek ? 'Всё верно, но вы подсмотрели: таблица вернётся в конце.' : `${ICON.check}Всё верно. Знаю.`}</p>
        <button type="button" class="btn primary wide" id="dNext">Дальше</button>`}
    </section>
    ${ph === 'fill' ? `<div class="kb-dock">${kbHTML({marks: strictOn(), dash: true, next: true, dock: true})}</div>` : ''}`;
    if(ph === 'study') $('#dFill').onclick = () => { DS.phase = 'fill'; dDraw(); };
    if(ph === 'fill'){
      $('#dPeek').onclick = () => { DS.peek = true; DS.peekShow = !DS.peekShow; dDraw(); };
      $('#dCheck').onclick = dCheck;
      area.querySelector('.ptab').onclick = e => { const b = e.target.closest('[data-c]'); if(b){ DS.cur = b.dataset.c; dMarkCur(); } };
      KB.target = tableTarget;
      dMarkCur(true);
    }
    if(ph === 'check'){ KB.target = tableTarget; $('#dNext').onclick = dNextItem; $('#dNext').focus({preventScroll: true}); }
    return;
  }
  const back = d.kind === 'p'
    ? `<div class="da gr-lg">${esc(d.a)}</div>${d.f ? `<p class="hint">Перед гласной: <span class="gr">${esc(d.f)}</span></p>` : ''}<p class="src">${esc(d.g)}: лексический минимум, с. ${esc(d.p)}. Значения из словаря учебника</p>`
    : `<p class="da">${esc(d.a)}</p>${d.ex ? `<p class="dex">${esc(d.ex)}</p>` : ''}<p class="src">${srcLine(d)}</p>`;
  const front = d.kind === 'p'
    ? `<div class="dprep"><span class="gr">${esc(d.g)}</span><small>+ ${esc(d.c)}</small></div><p class="dq">Что значит?</p>`
    : `<h2>${esc(d.t)}</h2><p class="dq">${esc(d.q)}</p>`;
  area.innerHTML = `<section class="card dcard">${top}${front}
    ${DS.phase === 'front' ? `<button type="button" class="btn primary wide" id="dShow">Показать ответ</button>`
      : `<div class="dans">${back}</div><div class="grid2"><button type="button" class="btn bad" id="dAgain">Повторить</button><button type="button" class="btn good" id="dKnow">Знаю</button></div>`}</section>`;
  if(DS.phase === 'front'){ $('#dShow').onclick = () => { DS.phase = 'back'; dDraw(); }; $('#dShow').focus({preventScroll: true}); }
  else { $('#dKnow').onclick = () => dRate(true); $('#dAgain').onclick = () => dRate(false); }
}
// Ввод в клетки таблицы
const tableTarget = {
  wants: e => DS.phase === 'check' ? e.code === 'Enter' || e.code === 'NumpadEnter' : DS.phase === 'fill' && !e.target.closest('input, textarea, select, dialog'),
  ins: ch => dSet(v => v + ch), mark: c => dSet(v => addMark(v, c)), back: () => dSet(delLast),
  space: () => dSet(v => v && !v.endsWith(' ') ? v + ' ' : v), dash: () => dSet(() => '–'),
  next: prev => { const i = DS.blanks.indexOf(DS.cur), n = DS.blanks.length; DS.cur = DS.blanks[(i + (prev ? n - 1 : 1)) % n]; dMarkCur(); },
  enter: () => DS.phase === 'fill' ? dCheck() : dNextItem(),
};
function dSet(f){
  if(DS.phase !== 'fill' || !DS.cur) return;
  DS.vals[DS.cur] = f(DS.vals[DS.cur] || '');
  const b = $(`[data-c="${DS.cur}"]`); if(b && !DS.peekShow) b.textContent = finalS(DS.vals[DS.cur]);
}
function dMarkCur(first){
  $$('.cin').forEach(b => b.classList.toggle('on', b.dataset.c === DS.cur));
  const b = $(`[data-c="${DS.cur}"]`);
  if(b && !first) b.scrollIntoView({block: 'nearest'});
}
function dCheck(){
  const d = DS.deck[DS.idx], strict = strictOn();
  const wrong = DS.blanks.filter(k => !cellOk(cellAt(d, k), DS.vals[k], strict));
  const ok = !wrong.length && !DS.peek;
  const patch = srsPatch(dRec(d.k), DS.failed.has(d.k), ok);
  if(patch) setDrill(d.k, patch);
  if(ok){ if(!DS.failed.has(d.k)) DS.known++; DS.wrong.delete(d.k); }
  else { DS.failed.add(d.k); DS.wrong.set(d.k, wrong); DS.deck.push(d); }
  DS.phase = 'check'; DS.peekShow = false; dDraw();
}
function dRate(ok){
  const d = DS.deck[DS.idx];
  const patch = srsPatch(dRec(d.k), DS.failed.has(d.k), ok);
  if(patch) setDrill(d.k, patch);
  if(ok){ if(!DS.failed.has(d.k)) DS.known++; }
  else { DS.failed.add(d.k); DS.deck.splice(Math.min(DS.idx + 4, DS.deck.length), 0, d); }
  dNextItem();
}
function dNextItem(){
  DS.idx++;
  if(DS.idx >= DS.deck.length) dFinish(); else { dItem(); window.scrollTo({top: 0}); }
}
function dStats(){
  const el = $('#dStats'); if(!el) return;
  const open = dOpenItems(); let st = 0, sure = 0, due = 0;
  open.forEach(d => { const r = dRec(d.k); if(r){ st++; if((r.level || 0) >= SURE) sure++; if(r.due <= today()) due++; } });
  el.textContent = `Открыто ${open.length} · начато ${st} · уверенно ${sure} · к повторению ${due}`;
}
function dFinish(){
  KB.target = null;
  $('#dArea').innerHTML = ''; $('#dDone').hidden = false; $('#dBar').style.width = '100%'; $('#dMeta').textContent = '';
  const box = $('#dDone'), tomorrow = ITEMS.filter(d => dRec(d.k) && dRec(d.k).due <= addDays(today(), 1)).length;
  if(DS.task){
    if(DS.deck.length) markTask('drills', DS.size);
    box.innerHTML = taskDoneHTML(DS.deck.length ? `Задание выполнено: ${DS.size} ${plural(DS.size, ITEMS_F)}. Завтра к повторению: <b>${tomorrow}</b>.` : 'Эти пункты уже пройдены.');
    return;
  }
  box.innerHTML = `<span class="done-ic">${ICON.done}</span><p>${DS.size ? `Пройдено: <b>${DS.size}</b> ${plural(DS.size, ITEMS_F)}, с первого раза: <b>${DS.known}</b>. Завтра к повторению: <b>${tomorrow}</b>.` : DS.set === 'srs' ? 'На сегодня всё повторено, новых пунктов из пройденных глав нет.' : 'Здесь пока нечего учить.'}</p>
    <div class="row center">${DS.size ? '<button type="button" class="btn primary" id="dAgainAll">Ещё раз</button>' : ''}<a class="btn" href="#/drills">Все таблицы и правила</a></div>`;
  if($('#dAgainAll')) $('#dAgainAll').onclick = () => { $('#dDone').hidden = true; startDrills(null, drillList(route())); };
  dStats();
}
// Набор пунктов по адресу: k=ключи (и p:N, ch:N), set=srs (со сроком и новые), set=hard
function drillList(r){
  const set = r.q.get('set') || '', k = r.q.get('k');
  DS.set = k ? '' : set;
  if(k) return itemsOf(k);
  if(set === 'hard') return shuffle(ITEMS.filter(d => (dRec(d.k) || {}).hard));
  return shuffle(ITEMS.filter(d => isDDue(d.k))).concat(drillsFresh());
}
function vDrill(r){
  const k = r.q.get('k') || '', view = r.q.get('m') === 'view';
  const one = ITEM.get(k) || REF.get(k);
  const ch = one ? one.ch : 0, backHref = r.q.get('from') === 'list' || !ch ? '#/drills' : '#/ch/' + ch;
  if(view && one && one.grid) return `${subHead(backHref, ch && !r.q.get('from') ? 'Глава ' + ch : 'Таблицы и правила', esc(one.t), esc(one.sub || ''))}
    <div class="trainer wide-t"><section class="card dcard dtab">${one.kind === 'v' ? '<span class="kicker">Для справки, заучивать не нужно</span>' : `<div class="dc-top"><span class="kicker">гл. ${one.ch} · таблица</span><span class="lvl">${dlvl(one.k)}</span></div>`}
      ${drillTable(one, 'view')}${one.note ? `<p class="hint">${esc(one.note)}</p>` : ''}<p class="src">${srcLine(one)}</p>
      ${one.kind === 't' ? `<a class="btn primary wide" href="#/drill?k=${one.k}">${ICON.pen}Учить</a>` : ''}</section></div>`;
  const list = drillList(r), m = k.match(/^(p|ch):(\d+)$/), lch = m ? +m[2] : list.length ? list[0].ch : 0;
  const title = !k ? (r.q.get('set') === 'hard' ? 'Трудные' : 'Повторение')
    : m ? (m[1] === 'p' ? `Предлоги с падежами, глава ${lch}` : `Глава ${lch}: таблицы и правила`)
    : list.length === 1 ? list[0].t : `Таблицы и правила: ${list.length} ${plural(list.length, ITEMS_F)}`;
  const bh = !k || r.q.get('from') === 'list' || !lch ? '#/drills' : '#/ch/' + lch;
  return `${subHead(bh, bh === '#/drills' ? 'Таблицы и правила' : 'Глава ' + lch, esc(title),
    k ? (m && m[1] === 'p' ? 'По карточке на каждый падеж, как советует автор (с. 76)' : '') : 'Пункты, у которых подошёл срок, и новые из глав до текущей')}<div class="trainer">${drillTrainerHTML(false)}</div>`;
}
function initDrill(r){ if(r.q.get('m') === 'view') return; startDrills(null, drillList(r)); }

/* ---------- Раздел «Таблицы и правила»: список по главам ---------- */
const DOT_D = {sure: 'k', learn: 's', hard: 'h', new: ''};
function drillRow(d){
  const st = dState(d.k), due = isDDue(d.k);
  return `<li class="drow"><span class="dot ${DOT_D[st]}"></span><span class="tt"><b>${esc(d.t)}</b><small>${KIND_RU[d.kind]} · с. ${esc(d.p)}${due ? ' · к повторению' : ''}</small></span>
    <span class="acts">${d.kind === 't' ? `<a class="btn sm ghost" href="#/drill?k=${d.k}&m=view&from=list" aria-label="Посмотреть таблицу">${ICON.table}</a>` : ''}<a class="btn sm" href="#/drill?k=${d.k}&from=list">Учить</a></span></li>`;
}
function vDrills(){
  const cur = curCh(), open = dOpenItems(), st = open.filter(d => dRec(d.k)).length, due = ITEMS.filter(d => isDDue(d.k)).length;
  const chs = [...new Set(ITEMS.map(d => d.ch).concat(REFS.map(d => d.ch)))].sort((a, b) => a - b);
  return `${subHead('#/course', 'Курс', 'Таблицы и правила', 'Что автор велит заучить в главах 3–14: таблицы окончаний и местоимений, правила, предлоги с падежами')}
    <section class="card"><div class="plan-top"><h2>Повторение</h2><span class="muted">начато ${st} из ${open.length}</span></div>${bar(st, open.length, 'good')}
      <p class="lead">${due ? `К повторению: ${due}. ` : ''}${drillsFresh().length ? `Новых на сегодня: ${drillsFresh().length}.` : 'Новые пункты придут с главами.'}</p>
      <div class="row"><a class="btn primary" href="#/drill?set=srs">${ICON.cards}Повторение</a>${ITEMS.some(d => (dRec(d.k) || {}).hard) ? `<a class="btn" href="#/drill?set=hard">Трудные</a>` : ''}</div>
      <p class="hint">Таблицы заполняются с экранной греческой клавиатуры. ${strictOn() ? 'Ударения и придыхания проверяются.' : 'Ударения и придыхания не проверяются; включить проверку можно в профиле.'}</p></section>
    ${chs.map(n => { const its = ITEMS.filter(d => d.ch === n), refs = REFS.filter(d => d.ch === n), s = chStatus(n);
      const ds = its.filter(d => d.kind !== 'p'), ps = its.filter(d => d.kind === 'p');
      return `<section class="card dlist${s === 'ahead' ? ' ahead' : ''}"><div class="plan-top"><h2>Глава ${n}</h2><span class="muted">${s === 'ahead' ? 'впереди' : `начато ${its.filter(d => dRec(d.k)).length} из ${its.length}`}</span></div>
        <ul class="dl">${ds.map(drillRow).join('')}${ps.length ? `<li class="drow"><span class="dot ${ps.every(d => dState(d.k) === 'sure') ? 'k' : ps.some(d => dRec(d.k)) ? 's' : ''}"></span><span class="tt"><b>Предлоги с падежами: ${esc([...new Set(ps.map(d => d.g))].join(', '))}</b><small>${ps.length} ${plural(ps.length, CARDS_F)}, начато ${ps.filter(d => dRec(d.k)).length}</small></span><span class="acts"><a class="btn sm" href="#/drill?k=p:${n}&from=list">Учить</a></span></li>` : ''}
        ${refs.map(d => `<li class="drow ref"><span class="dot"></span><span class="tt"><b>${esc(d.t)}</b><small>для справки, заучивать не нужно · с. ${esc(d.p)}</small></span><span class="acts"><a class="btn sm ghost" href="#/drill?k=${d.k}&m=view&from=list">Посмотреть</a></span></li>`).join('')}</ul>
        ${s === 'ahead' ? `<p class="hint">Глава впереди: потренироваться можно, в план новые пункты придут, когда глава станет текущей (сейчас глава ${cur}).</p>` : ''}</section>`; }).join('')}`;
}
const CARDS_F = ['карточка', 'карточки', 'карточек'];
// Карточка «Таблицы и правила» в курсе
function drillsCard(){
  const open = dOpenItems(), st = open.filter(d => dRec(d.k)).length, due = ITEMS.filter(d => isDDue(d.k)).length;
  return `<section class="card parts-card"><div class="plan-top"><h2>Таблицы и правила</h2><span class="muted">${open.length ? `начато ${st} из ${open.length}` : 'с главы 3'}</span></div>
    <p class="lead">${open.length ? `Таблицы окончаний и местоимений, правила и предлоги с падежами, которые автор велит заучить. Открыто ${open.length} из ${ITEMS.length}.${due ? ` К повторению: ${due}.` : ''}` : 'Открываются по главам учебника, первые в главе 3.'}</p>
    ${open.length ? bar(st, open.length, 'good') : ''}
    <div class="row"><a class="btn primary" href="#/drill?set=srs">${ICON.cards}Повторение</a><a class="btn" href="#/drills">${ICON.table}По главам</a></div></section>`;
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
  if(closed()) return `${head('Словарь', 'Словарь учебника и лексический минимум')}<section class="card"><p class="lead">Словарь откроется после продления доступа.</p><p class="hint">Чтобы продлить, напишите: ${contactHTML(acc().contact)}</p></section>`;
  const u = DICT_UI(), all = u.mode === 'all';
  const opt = (v, l, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`;
  const n = all ? fullList().length : MINW.length;
  return `${head('Словарь', `${all ? 'Словарь учебника, с. 437–461' : 'Лексический минимум, главы 4–36'} · ${n} ${plural(n, WORDS_F)}`)}
    <div class="cols"><div class="col">
      <div class="dict-tools">
        ${seg('dmode', [['min', `Минимум (${MINW.length})`], ['all', 'Весь словарь']], u.mode, 'Какие слова показывать')}
        <div class="search-row"><input class="inp" id="d-q" type="search" placeholder="Поиск по-гречески или по-русски" autocomplete="off" value="${esc(u.q)}"><button type="button" class="btn kb-toggle gr" id="d-kb" aria-pressed="false" aria-label="Греческая клавиатура">αβ</button></div>
        <div id="d-kbox" hidden>${kbHTML({})}</div>
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
  if(closed()) return;
  let timer = 0;
  const upd = () => {
    if(!$('#d-q')) return; // экран словаря уже закрыт
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
  // экранная греческая клавиатура: системная клавиатура телефона при этом не открывается, на компьютере латиница печатает греческие буквы
  $('#d-kb').onclick = () => {
    const on = $('#d-kbox').hidden, q = $('#d-q');
    $('#d-kbox').hidden = !on; $('#d-kb').setAttribute('aria-pressed', on);
    if(on){ q.setAttribute('inputmode', 'none'); KB.target = inputTarget(q); q.focus(); } else { q.removeAttribute('inputmode'); KB.target = null; }
  };
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
  if(closed()){ toast(accMsg()); return; }
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
// ch: карточки форм одной главы (кнопка на экране главы, правки 2.2), в том числе главы впереди
const PS = {set: 'srs', deck: [], idx: 0, known: 0, failed: new Set(), task: null, rendered: false, mode: 'cards', focus: 0, all: false, ch: 0};
// Что показывать на обороте: открытые формы, а в карточках главы впереди ещё и формы до этой главы
const fSeen = f => f.ch <= Math.max(curCh(), PS.ch || 0);
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
  if(PS.ch) return `<p class="hint">${chStatus(PS.ch) === 'ahead' ? `Глава ${PS.ch} впереди (сейчас глава ${curCh()}). Потренироваться можно уже сейчас: отмеченные формы придут в повторение по сроку, а новые формы этой главы попадут в план, когда глава станет текущей.` : `Формы для заучивания, которые открывает глава ${PS.ch}.`}</p>
    <div class="row between"><span class="meta">Глава ${PS.ch}: ${formsOfChapter(PS.ch).length} ${plural(formsOfChapter(PS.ch).length, FORMS_F)}</span><button type="button" class="btn sm" id="pShuffle">Перемешать</button></div>${pCardsCore(task)}`;
  return `${task ? '' : `<div class="row between">${seg('pset', [['srs','Повторение'],['all','Все'],['hard','Трудные']], PS.set, 'Набор')}<button type="button" class="btn sm" id="pShuffle">Перемешать</button></div>`}${pCardsCore(task)}`;
}
function pCardsCore(task){
  return `<div class="pbar thin"><i id="pBar"></i></div>
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
  // #/parts?ch=N: карточки форм главы N (с экрана главы), можно и для главы впереди
  const pch = +r.q.get('ch') || 0;
  PS.ch = chapter(pch) && formsOfChapter(pch).length ? pch : 0;
  if(PS.ch){ PS.mode = 'cards'; PS.focus = 0;
    return `${subHead('#/ch/' + PS.ch, 'Глава ' + PS.ch, 'Основные формы главы ' + PS.ch, 'Карточки полужирных форм из таблицы книги, с. 412–421')}
    <div class="trainer" id="p-trainer"><section id="p-cards">${pCardsHTML(false)}</section>
    <p class="hint center"><a href="#/parts">Все основные формы</a></p></div>`; }
  // открыт из статьи слова: если у глагола нет открытых форм для заучивания, показываем его строку в таблице
  const fv = VERB.get(PS.focus);
  if(fv && PS.mode === 'cards' && !openBold().some(f => f.v === fv)){ PS.mode = 'table'; if(!vForms(fv).every(isOpen)) PS.all = true; }
  const open = openBold();
  return `${subHead('#/course', 'Курс', 'Основные формы глаголов', open.length ? `Для заучивания открыто ${open.length} ${plural(open.length, FORMS_F)} из ${BOLD.length}. Учебник, с. 412–421` : 'Формы открываются по главам учебника. Учебник, с. 412–421')}
    <div class="trainer${PS.mode === 'table' ? ' wide' : ''}" id="p-trainer">
      ${seg('pmode', [['cards','Карточки'],['quiz','Тест'],['table','Таблица']], PS.mode, 'Режим')}
      <section id="p-cards"${PS.mode === 'cards' ? '' : ' hidden'}>${hasCards() ? pCardsHTML(false)
        : notYet(`Сейчас вы на главе ${curCh()}. Формы для заучивания начнут открываться с главы 19: там учебник вводит будущее время и первые такие формы (<span class="gr">ἔσομαι</span>, <span class="gr">ἕξω</span>). Карточка спрашивает одну форму, которую книга выделяет полужирным. Формы любой главы можно потренировать с экрана этой главы.`)}</section>
      <section id="p-quiz"${PS.mode === 'quiz' ? '' : ' hidden'}>${quizReady() ? `
        <div class="pbar thin"><i id="pqBar"></i></div>
        <div class="row between"><span class="meta" id="pqMeta"></span><span class="meta" id="pqScore"></span></div>
        <div id="pqArea"><div class="qbox"><div class="meta">Какая это форма?</div><div class="prompt word" id="pqPrompt"></div></div>
          <div class="opts one" id="pqOpts"></div><div class="feedback" id="pqFb"></div>
          <button type="button" class="btn primary wide" id="pqNext" hidden>Дальше</button></div>
        <div class="done-box" id="pqDone" hidden><div class="pct" id="pqPct"></div><p id="pqSum"></p><p class="meta" id="pqMiss"></p><button type="button" class="btn primary" id="pqRestart">Ещё раз</button></div>`
        : notYet(`Сейчас вы на главе ${curCh()}. Тест откроется в главе 19, когда кроме настоящего времени появится будущее. В тесте только открытые формы глаголов пройденных глав.`)}
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
  if(PS.ch){ startPCards(null); return; }
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
  } else if(PS.ch){
    PS.deck = shuffle(formsOfChapter(PS.ch));
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
  const v = f.v, open = vForms(v).filter(fSeen);
  const notes = Object.entries(v.fn || {}).filter(([i]) => { const g = FORM.get(v.n * 10 + +i); return g && fSeen(g); });
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
  if(PS.ch){
    box.innerHTML = `<span class="done-ic">${ICON.done}</span><p>Круг пройден. Отмечено «знаю»: <b>${PS.known}</b> из <b>${PS.size}</b>.</p>
      <div class="row center"><button type="button" class="btn primary" id="pRestart">Начать заново</button><a class="btn" href="#/ch/${PS.ch}">К главе ${PS.ch}</a></div>`;
    $('#pRestart').onclick = buildPDeck; return;
  }
  const fresh = openBold().filter(f => !fRec(f.n)).length;
  if(!openBold().length && !PS.deck.length){
    box.innerHTML = `<span class="done-ic">${ICON.done}</span><p>Сейчас вы на главе ${curCh()}. Формы для заучивания начнут открываться с главы 19.${BOLD.some(f => fRec(f.n)) ? ' Формы, которые вы уже тренировали с экрана главы, придут сюда в повторение по сроку.' : ''}</p><a class="btn" href="#/ch/${Math.min(curCh(), 36)}">Текущая глава</a>`;
    pStats(); return;
  }
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
// «Таблицы и правила: начато N из M, уверенно K» (M: открытые пункты глав до текущей)
function drillsProgress(){
  const open = dOpenItems(), st = open.filter(d => dRec(d.k)).length, sure = open.filter(d => dState(d.k) === 'sure').length;
  return `<section class="card"><div class="plan-top"><h2>Таблицы и правила</h2><span class="muted">${open.length ? `начато ${st} из ${open.length}` : 'с главы 3'}</span></div>${bar(st, open.length || 1, 'good')}
    <p class="hint">Таблицы и правила: начато ${st} из ${open.length}, уверенно ${sure}. Уверенно: интервал повторения от двух недель.</p>${closed() ? '' : '<a class="btn" href="#/drills">Открыть</a>'}</section>`;
}
// «План выполнен»: неделя с понедельника и дни подряд, нажатие открывает календарь занятий (открыт и без доступа)
function weekCard(){
  const st = streak(), week = Array.from({length: 7}, (_, i) => addDays(weekStart(), i)), plans = planMap(), t = today();
  return `<section class="card week-card" data-act="calendar" role="button" tabindex="0" aria-label="План выполнен: ${st} ${plural(st, DAYS_F)} подряд. Открыть календарь занятий">
        <div class="plan-top"><h2>План выполнен</h2><span class="muted">${st} ${plural(st, DAYS_F)} подряд</span></div>
        <div class="days" aria-hidden="true">${week.map((d, i) => { const dd = +d.slice(8), s = dayState(plans.get(d));
          return `<span class="${s}${d === t ? ' today' : ''}${d > t ? ' future' : ''}"><small>${WDM[i]}</small><i>${s === 'full' ? ICON.check : dd}</i></span>`; }).join('')}</div>
        <span class="week-more">${ICON.cal}Календарь занятий${ICON.chev}</span>
      </section>`;
}
function vProgress(){
  const kn = lettersKnown(), cov = coverage(), learned = LEX.filter(w => isLearned(w.n)).length;
  const all = {sure:0, learn:0, hard:0, new:0}; LEX.forEach(w => all[wState(w.n)]++);
  const open = openBold(), pc = {sure:0, learn:0, hard:0, new:0}; open.forEach(f => pc[fState(f.n)]++);
  const passed = passedCount(), cn = curCh();
  return `${head('Прогресс', 'Курс, слова, таблицы и правила, основные формы, алфавит и дни занятий')}
    <div class="cols"><div class="col">
      <section class="card"><div class="plan-top"><h2>Курс</h2><span class="muted">${passed} ${plural(passed, CH_F)} из ${CHAPTERS.length}</span></div>${bar(passed, CHAPTERS.length)}
        <p class="hint">${cn > 36 ? 'Учебник пройден.' : `Текущая глава ${cn}: ${esc(chapter(cn).t)}.`}</p>${closed() ? '' : `<a class="btn" href="${cn > 36 ? '#/course' : '#/ch/' + cn}">${cn > 36 ? 'Открыть курс' : 'Открыть главу'}</a>`}</section>
      <section class="card nt-card"><h2>Текст Нового Завета</h2>
        <p class="nt-line">Вы знаете слова, которые составляют <b>${pctNT()}</b> текста Нового Завета.</p>
        ${bar(cov, NT_WORDS, 'good')}
        <p class="hint">Выучено слов: ${learned}. Вместе они встречаются ${times(cov)} из ${NT_WORDS.toLocaleString('ru-RU')} слов текста. Выученным считается слово, которое вы хотя бы раз отметили «Знаю» и которое сейчас не трудное.</p></section>
      ${stackCard('Слова минимума', MINW.length, wordCounts(), plural(MINW.length, WORDS_F))}
      ${stackCard('Весь словарь', LEX.length, all, plural(LEX.length, WORDS_F))}
    </div><div class="col">
      ${weekCard()}
      ${drillsProgress()}
      ${open.length ? stackCard('Основные формы', open.length, pc, `${plural(open.length, FORMS_F)} для заучивания открыто из ${BOLD.length}`)
        : `<section class="card"><div class="plan-top"><h2>Основные формы</h2><span class="muted">с главы 19</span></div><p class="hint">Формы для заучивания открываются вместе с главами, где учебник вводит времена глаголов.</p></section>`}
      <section class="card"><div class="plan-top"><h2>Алфавит</h2><span class="muted">знаю ${kn} из ${LETTERS.length}</span></div>${bar(kn, LETTERS.length, 'good')}
        ${closed() ? '' : '<a class="btn" href="#/abc">Открыть алфавит</a>'}</section>
    </div></div>`;
}

/* ---------- Профиль ---------- */
function vProfile(){
  const u = me();
  const inv = S.invites.slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const ro = closed(); // без доступа: строка о доступе, тема, пароль, выход и удаление аккаунта
  return `<div class="nav-head">${backLink('#/', 'Сегодня')}${headActs()}</div><header class="sub-head"><h1>Профиль</h1></header>
    <div class="cols"><div class="col">
    <section class="card"><h2>Доступ</h2><p class="acc-line${ro ? ' off' : ''}">${accessLine()}</p></section>
    ${ro ? '' : `<section class="card me-card"><span class="me xl" aria-hidden="true" data-av>${avatarInner(u)}</span><div class="who"><b>${esc(u.name || 'Без имени')}</b><span>${esc(u.email || '')}</span>
        <button type="button" class="btn sm" data-act="avatar">${u.avatar ? 'Изменить фото' : 'Поставить фото'}</button></div>
      <button type="button" class="icon-btn" data-act="edit-name" aria-label="Изменить имя">${ICON.pen}</button></section>`}
    ${ro ? '' : `<section class="card"><h2>План на день</h2>
      <p class="hint">Порядок задаёт учебник: новые слова приходят из лексического минимума глав до текущей, по ${NEW} в день, плюс до ${NEW} слов, которые вы добавили из словаря. После главы 36 новые слова идут из словаря, от частых к редким.</p>
      <label class="check"><input type="checkbox" id="p-parts"${partsOn() ? ' checked' : ''}><span>Основные формы глаголов в плане: до ${NEW_PARTS} новых форм для заучивания в день и повторение тех, у кого подошёл срок. Формы открываются вместе с главами учебника</span></label>
      <p class="hint">Таблицы и правила приходят в план сами: до ${NEW_DRILLS} новых таблиц и правил и до ${NEW_PREPS} карточек предлогов в день из глав до текущей, плюс повторение по сроку.</p>
    </section>
    <section class="card"><h2>Таблицы</h2>
      <label class="check"><input type="checkbox" id="p-strict"${strictOn() ? ' checked' : ''}><span>Проверять ударения и придыхания. Без проверки сверяются только буквы и подписная йота: автор пишет, что знать ударения необязательно (с. 31). Правильная форма со всеми знаками показывается после проверки в любом случае</span></label>
    </section>`}
    <section class="card"><h2>Оформление</h2>
      <div class="seg3" role="radiogroup" aria-label="Тема">${[['light','Светлая'],['dark','Тёмная'],['auto','Как в системе']].map(([k, l]) =>
        `<input type="radio" name="p-theme" id="p-theme-${k}" value="${k}"${themePref() === k ? ' checked' : ''}><label for="p-theme-${k}">${l}</label>`).join('')}</div></section>
    </div><div class="col">
    ${isAdmin() ? `<details class="fold card" data-fold="inv"${UI.folds.has('inv') ? ' open' : ''}><summary><span>Приглашения</span>${ICON.chev}</summary><div class="fold-body">
      <p class="hint">Новый человек может зарегистрироваться только по приглашению. Создайте его и отправьте ссылку.</p>
      <div class="field"><label for="i-note">Для кого (заметка)</label><input class="inp" type="text" id="i-note" placeholder="Например: студенты"></div>
      <div class="field"><label for="i-max">Сколько регистраций</label><select class="inp" id="i-max"><option value="1">1 человек</option><option value="5">до 5 человек</option><option value="20">до 20 человек</option><option value="0">без ограничения</option></select></div>
      <div class="field"><label for="i-exp">Действует до (необязательно)</label><input class="inp" type="date" id="i-exp"></div>
      <div class="field"><label for="i-period">Срок доступа для новых пользователей</label><select class="inp" id="i-period">${Object.entries(ACC_PERIODS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <button type="button" class="btn primary" data-act="new-invite">Создать и скопировать ссылку</button>
      <div>${inv.length ? inv.map(i => `<div class="inv"><code>${esc(i.code)}</code><span class="muted">${i.note ? esc(i.note) + ' · ' : ''}использовано ${i.uses || 0}${i.max_uses > 0 ? ' из ' + i.max_uses : ', без ограничения'}${i.expires ? ' · до ' + fmtDay(i.expires) : ''} · доступ ${esc(ACC_PERIODS[i.access_period || ''] || i.access_period)}</span>
        <div class="row"><button type="button" class="btn sm" data-act="copy-invite" data-code="${esc(i.code)}">Скопировать ссылку</button><button type="button" class="btn sm ghost danger" data-act="del-invite" data-id="${esc(i.id)}">Удалить</button></div></div>`).join('') : '<p class="hint">Приглашений пока нет.</p>'}</div>
    </div></details>
    ${usersSection()}` : ''}
    <details class="fold card"><summary><span>Сменить пароль</span>${ICON.chev}</summary><div class="fold-body">
      <div class="field"><label for="p-old">Текущий пароль</label><input class="inp" type="password" id="p-old" autocomplete="current-password"></div>
      <div class="field"><label for="p-new">Новый пароль (не короче 8 символов)</label><input class="inp" type="password" id="p-new" autocomplete="new-password"></div>
      <div class="field"><label for="p-new2">Повторите новый</label><input class="inp" type="password" id="p-new2" autocomplete="new-password"></div>
      <button type="button" class="btn" data-act="save-pass">Сменить пароль</button></div></details>
    <button type="button" class="btn wide" data-act="logout">Выйти</button>
    <details class="fold card"><summary><span>Удаление аккаунта</span>${ICON.chev}</summary><div class="fold-body">
      <p class="hint">Вместе с аккаунтом удалится весь прогресс: слова, таблицы и правила, основные формы, буквы, главы и планы. Вернуть их будет нельзя.</p>
      <button type="button" class="btn danger" data-act="delete-account">Удалить аккаунт и все данные</button></div></details>
    <p class="hint"><a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a></p>
    </div></div>`;
}
async function loadProfileExtras(){
  if(isAdmin()){
    try { S.invites = await pb.collection('invites').getFullList(); } catch(e){}
    await loadAdminUsers();
  }
  if(route().name === 'profile') schedule();
}

/* ---------- Пользователи (только администратор, правки 3.1) ---------- */
const ACC_PERIODS = {'': 'бессрочно', '7d': '7 дней', '14d': '14 дней', '1m': '1 месяц', '3m': '3 месяца'};
const ACC_DONE = {extend: 'Доступ продлён', set: 'Дата доступа изменена', unlimited: 'Доступ бессрочный', suspend: 'Доступ приостановлен', resume: 'Доступ возобновлён', note: 'Заметка сохранена'};
const ACC_LOG = {set: 'дата изменена', unlimited: 'сделан бессрочным', suspend: 'приостановлен', resume: 'возобновлён', note: 'заметка'};
const MONTHS_F = ['месяц', 'месяца', 'месяцев'];
function accLogText(a){
  const m = /^extend:(\d+)$/.exec(a || '');
  return m ? `продлён на ${m[1]} ${plural(+m[1], MONTHS_F)}` : ACC_LOG[a] || a;
}
async function loadAdminUsers(){
  if(!isAdmin()) return;
  try { S.adminUsers = await pb.send('/api/greek/admin/users', {}); } catch(e){ return; }
  if(route().name === 'profile') schedule();
}
// Фото пользователя: у других людей фото профиля защищено, администратору его отдаёт отдельный маршрут.
// Загруженное фото ставится на место буквы без перерисовки экрана (чтобы не стереть набранную заметку)
const UPH = new Map();
function userPhoto(x){
  if(x.id === me().id) return avatarSrc(me());
  const k = x.id + '/' + x.avatar, v = UPH.get(k);
  if(v && v !== 'loading' && v !== 'err') return v;
  if(!v){
    UPH.set(k, 'loading');
    fetch('/api/greek/admin/users/' + encodeURIComponent(x.id) + '/avatar', {headers: {Authorization: pb.authStore.token}})
      .then(r => { if(!r.ok) throw new Error(); return r.blob(); })
      .then(b => { const src = URL.createObjectURL(b); UPH.set(k, src); $$(`[data-uface="${x.id}"]`).forEach(el => { el.innerHTML = `<img src="${src}" alt="">`; }); })
      .catch(() => UPH.set(k, 'err'));
  }
  return '';
}
const userFace = x => { const src = x.avatar ? userPhoto(x) : ''; return `<span class="uface" aria-hidden="true" data-uface="${esc(x.id)}">${src ? `<img src="${esc(src)}" alt="">` : esc(initial(x))}</span>`; };
function userState(x, t){
  if(x.role === 'admin') return '<span class="tag">администратор</span>';
  if(x.suspended) return '<span class="tag bad">приостановлен</span>';
  if(x.access_until && x.access_until < t) return `<span class="tag bad">срок закончился ${fmtDay(x.access_until)}</span>`;
  if(!x.access_until) return '<span class="tag ok">бессрочно</span>';
  const k = Math.round(dnum(x.access_until) - dnum(t));
  return `<span class="tag${k <= 7 ? ' warn' : ' ok'}">до ${fmtDay(x.access_until)}${k <= 7 ? ', ' + leftText(k) : ''}</span>`;
}
const untilText = d => d ? fmtDay(d) : 'бессрочно';
// «глава 7 · занимался 30 октября»: текущая глава и последний день, когда сделано хотя бы одно задание плана
const studyText = x => `${x.chapter > 36 ? 'учебник пройден' : 'глава ' + x.chapter} · ${x.last_day ? 'занимался ' + fmtDay(x.last_day) : 'ещё не занимался'}`;
function usersSection(){
  const data = S.adminUsers, n = data ? data.users.length : 0;
  const top = `<details class="fold card" data-fold="users"${UI.folds.has('users') ? ' open' : ''}><summary><span>Пользователи${data ? ' · ' + n : ''}</span>${ICON.chev}</summary><div class="fold-body">`;
  if(!data) return top + '<p class="hint">Загружаю…</p></div></details>';
  const t = data.today;
  // сначала без доступа, потом с датой (ближайшие сверху), потом бессрочные, администратор в конце
  const rank = x => x.role === 'admin' ? 3 : !x.active ? 0 : x.access_until ? 1 : 2;
  const list = data.users.slice().sort((a, b) => rank(a) - rank(b) || (a.access_until || '').localeCompare(b.access_until || '') || String(a.name || a.email).localeCompare(String(b.name || b.email), 'ru'));
  return top + `<p class="hint">Когда срок доступа заканчивается или вы ставите паузу, человек видит только «Сегодня» без плана, список глав, «Прогресс» и профиль. Прогресс сохраняется, после продления всё работает как раньше. Продление считается от даты окончания, если она ещё не прошла, иначе от сегодня.</p>
    <div class="users">${list.map(x => {
      const id = esc(x.id), adm = x.role === 'admin';
      const log = x.log.map(l => `<li><span class="d">${fmtDay(String(l.created).slice(0, 10))}</span> ${esc(accLogText(l.action))}${l.until_before !== l.until_after ? `: ${untilText(l.until_before)} → ${untilText(l.until_after)}` : ''}${l.note ? ` · ${esc(l.note)}` : ''}${l.by ? ` <span class="muted">(${esc(l.by)})</span>` : ''}</li>`).join('');
      return `<div class="usr">
        <div class="usr-head">${userFace(x)}
          <div class="usr-main"><b>${esc(x.name || x.email)}</b><span class="muted">${x.name ? esc(x.email) + ' · ' : ''}с ${fmtDay(String(x.created).slice(0, 10))}</span><span class="muted">${studyText(x)}</span><span>${userState(x, t)}</span></div></div>
        ${adm ? '' : `<div class="usr-acts"><button type="button" class="btn sm" data-act="acc" data-action="extend" data-months="1" data-id="${id}">+1 месяц</button><button type="button" class="btn sm" data-act="acc" data-action="extend" data-months="3" data-id="${id}">+3 месяца</button>${x.suspended ? `<button type="button" class="btn sm" data-act="acc" data-action="resume" data-id="${id}">Возобновить</button>` : `<button type="button" class="btn sm ghost danger" data-act="acc" data-action="suspend" data-id="${id}">Приостановить</button>`}</div>`}
        <details class="usr-more" data-fold="u-${id}"${UI.folds.has('u-' + x.id) ? ' open' : ''}><summary>${adm ? 'Заметки' : 'Дата, заметка и история'}</summary>
          ${adm ? '' : `<div class="usr-row"><div class="field"><label for="ud-${id}">Доступ до</label><input class="inp" type="date" id="ud-${id}" value="${esc(x.access_until || '')}"></div><div class="usr-btns"><button type="button" class="btn sm" data-act="acc" data-action="set" data-id="${id}">Поставить дату</button><button type="button" class="btn sm ghost" data-act="acc" data-action="unlimited" data-id="${id}">Бессрочно</button></div></div>`}
          <div class="usr-row"><div class="field"><label for="un-${id}">Заметка (видите только вы; добавится и к продлению)</label><input class="inp" type="text" id="un-${id}" maxlength="1000" placeholder="Например: оплатил 500 ₽ 1 ноября"></div><div class="usr-btns"><button type="button" class="btn sm ghost" data-act="acc" data-action="note" data-id="${id}">Сохранить заметку</button></div></div>
          ${log ? `<ul class="usr-log">${log}</ul>` : '<p class="hint">Истории пока нет.</p>'}
        </details>
      </div>`;
    }).join('')}</div>
    <p class="hint">Удалить пользователя совсем можно в панели администратора: <a href="/_/#/collections" target="_blank" rel="noopener">${esc(location.host)}/_/</a>, коллекция <code>users</code>. Вместе с ним удалится весь его прогресс.</p>
  </div></details>`;
}
window.addEventListener('hashchange', () => { if(route().name === 'profile' && S.loaded) loadProfileExtras(); });
document.addEventListener('change', e => {
  if(e.target.name === 'p-theme') setTheme(e.target.value);
  if(e.target.id === 'p-parts') savePlanSettings({parts_off: !e.target.checked}, e.target);
  if(e.target.id === 'p-strict') saveUserSetting({strict_marks: e.target.checked});
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
async function saveUserSetting(patch){
  try { const r = await pb.collection('users').update(me().id, patch); pb.authStore.save(pb.authStore.token, r); toast('Сохранено'); }
  catch(e){ toast(navigator.onLine ? errText(e) : 'Нет связи: настройка не сохранилась'); }
  render(true);
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
  // без доступа нельзя менять главу, имя и фото (кнопок на экране нет, проверка на всякий случай)
  if(closed() && ['avatar', 'pass', 'make-current', 'edit-name'].includes(d.act)){ toast(accMsg()); return; }
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
      saveLS('accHide', '');
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
function signOut(){ saveLS('accHide', ''); saveLS(cacheKey(), null); saveLS(qKey(), null); saveLS(chKey(), null); saveLS('avatar_' + me().id, null); pb.authStore.clear(); location.hash = ''; location.reload(); }
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
        const body = {code: inviteCode(), note: $('#i-note').value.trim(), max_uses: Number($('#i-max').value), uses: 0, expires: $('#i-exp').value, access_period: $('#i-period').value};
        const rec = await pb.collection('invites').create(body);
        S.invites.push(rec); render(true);
        copyText(`${location.origin}/?invite=${rec.code}`);
        break;
      }
      case 'acc': {
        const note = ($('#un-' + d.id) || {}).value || '', date = ($('#ud-' + d.id) || {}).value || '';
        if(d.action === 'suspend' && !arm(a, 'Точно приостановить?')) return;
        if(d.action === 'set' && !date){ toast('Выберите дату.'); return; }
        if(d.action === 'note' && !note.trim()){ toast('Напишите заметку.'); return; }
        a.disabled = true;
        try { await pb.send('/api/greek/admin/access', {method: 'POST', body: {user: d.id, action: d.action, months: Number(d.months || 0), date, note: note.trim()}}); }
        finally { a.disabled = false; }
        UI.folds.add('u-' + d.id);
        await loadAdminUsers(); render(true); toast(ACC_DONE[d.action] || 'Сохранено'); break;
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
