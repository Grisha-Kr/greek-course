// Доступ на срок и пауза (правки 3.1, по образцу «Зачётки» и «Молитвенного дневника»).
// Подключается через require() внутри обработчиков (access.pb.js, main.pb.js).
// Правило: администратор всегда с доступом. Остальные с доступом, если нет паузы
// и дата access_until пустая (бессрочно) или ещё не прошла (последний день включительно).
// Без доступа виден свой прогресс (чтение открыто), а заниматься, менять главу, добавлять слова,
// менять имя, фото и настройки занятий нельзя. Пароль, тему, выход и удаление аккаунта можно.
// «Сегодня» считается по времени Хабаровска: APP_TZ_OFFSET в часах, по умолчанию 10.

function today() {
  const off = parseFloat($os.getenv("APP_TZ_OFFSET"));
  return new Date(Date.now() + (isNaN(off) ? 10 : off) * 3600 * 1000).toISOString().slice(0, 10);
}
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !isNaN(new Date(v + "T00:00:00Z").getTime())
  && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
function addDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Прибавить месяцы: 31 января + 1 месяц = 28 (29) февраля
function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}
// Срок из приглашения: "" бессрочно, "7d", "14d", "1m", "3m"
const PERIODS = { "": "бессрочно", "7d": "7 дней", "14d": "14 дней", "1m": "1 месяц", "3m": "3 месяца" };
function untilFor(period) {
  const m = /^(\d+)([dm])$/.exec(String(period || ""));
  if (!m) return "";
  return m[2] === "d" ? addDays(today(), +m[1]) : addMonths(today(), +m[1]);
}

function state(user) {
  const admin = user.getString("role") === "admin";
  const until = user.getString("access_until");
  const suspended = user.getBool("suspended");
  const t = today();
  let reason = "";
  if (!admin && suspended) reason = "suspended";
  else if (!admin && until && until < t) reason = "expired";
  return { admin, until, suspended, active: !reason, reason, today: t };
}
function contact() { return ($os.getenv("CONTACT_EMAIL") || "").trim() || "администратору"; }
function message() {
  return "Доступ приостановлен: виден ваш прогресс, а заниматься и открывать главы и словарь нельзя. Чтобы продлить доступ, напишите: " + contact() + ".";
}
const isUser = (e) => !!(e.auth && e.auth.collection().name === "users");
// Для обработчиков создания, изменения и удаления записей прогресса
function guard(e) {
  if (e.hasSuperuserAuth() || !isUser(e)) return;
  if (!state(e.auth).active) throw new ForbiddenError(message());
}
// Свой профиль без доступа: можно сменить пароль и тему оформления; имя, фото, текущую главу и настройки занятий нельзя
const PROFILE_LOCKED = ["name", "avatar", "chapter", "strict_marks", "parts_off", "plan_order", "emailVisibility"];
function guardProfile(e) {
  if (e.hasSuperuserAuth() || !isUser(e) || state(e.auth).active) return;
  const o = e.record.original();
  const changed = e.record.getUnsavedFiles("avatar").length > 0
    || PROFILE_LOCKED.some((f) => e.record.getString(f) !== o.getString(f));
  if (changed) throw new ForbiddenError(message());
}

// Срок доступа в приглашении: только из списка PERIODS
function checkInvite(e) {
  if (!Object.prototype.hasOwnProperty.call(PERIODS, e.record.getString("access_period"))) {
    throw new BadRequestError("Выберите срок доступа из списка.");
  }
}

/* ---------- Раздел «Пользователи» для администратора ---------- */
function requireAdmin(e) {
  if (!isUser(e) || e.auth.getString("role") !== "admin") throw new ForbiddenError("Только для администратора.");
}
// Последний день, когда выполнено хотя бы одно задание плана (по plan_days)
function lastDays() {
  const rows = arrayOf(new DynamicModel({ user: "", last: "" }));
  $app.db().newQuery(
    "SELECT user, MAX(date) AS last FROM plan_days WHERE EXISTS " +
    "(SELECT 1 FROM json_each(CASE WHEN json_valid(plan_days.tasks) THEN plan_days.tasks ELSE '[]' END) " +
    "WHERE json_extract(json_each.value, '$.done') = 1) GROUP BY user"
  ).all(rows);
  const out = {};
  for (const r of rows) out[r.user] = r.last;
  return out;
}
function userOut(u, last, logs) {
  const st = state(u);
  const ch = u.getInt("chapter");
  return {
    id: u.id, name: u.getString("name"), email: u.getString("email"), avatar: u.getString("avatar"),
    created: u.getString("created"), role: u.getString("role") || "user",
    access_until: st.until, suspended: st.suspended, active: st.active, reason: st.reason,
    chapter: ch >= 1 && ch <= 37 ? ch : 1, last_day: last[u.id] || "",
    log: (logs[u.id] || []).slice(0, 20),
  };
}
function adminUsers(e) {
  requireAdmin(e);
  const last = lastDays();
  const logs = {};
  for (const l of $app.findRecordsByFilter("access_log", "id != ''", "-created", 5000, 0)) {
    const u = l.getString("user");
    (logs[u] = logs[u] || []).push({
      created: l.getString("created"), by: l.getString("by_name"), action: l.getString("action"),
      until_before: l.getString("until_before"), until_after: l.getString("until_after"), note: l.getString("note"),
    });
  }
  const users = $app.findAllRecords("users").map((u) => userOut(u, last, logs));
  return e.json(200, { today: today(), contact: contact(), users });
}
function adminAccess(e) {
  requireAdmin(e);
  const b = e.requestInfo().body || {};
  let u = null;
  try { u = $app.findRecordById("users", String(b.user || "")); } catch (_) {}
  if (!u) throw new NotFoundError("Пользователь не найден.");
  const note = String(b.note || "").trim().slice(0, 1000);
  const before = u.getString("access_until");
  const t = today();
  const action = String(b.action || "");
  if (u.getString("role") === "admin" && action !== "note") throw new BadRequestError("У администратора доступ всегда бессрочный.");
  let months = 0;
  switch (action) {
    case "extend": {
      months = parseInt(b.months, 10);
      if (!(months >= 1 && months <= 24)) throw new BadRequestError("Продлить можно на 1–24 месяца.");
      // продление считается от даты окончания, если она ещё не прошла, иначе от сегодня
      const from = before && before >= t ? before : t;
      u.set("access_until", addMonths(from, months));
      u.set("suspended", false);
      break;
    }
    case "set": {
      if (!isDate(b.date)) throw new BadRequestError("Укажите дату.");
      u.set("access_until", String(b.date));
      u.set("suspended", false);
      break;
    }
    case "unlimited": u.set("access_until", ""); u.set("suspended", false); break;
    case "suspend": u.set("suspended", true); break;
    case "resume": u.set("suspended", false); break;
    case "note": if (!note) throw new BadRequestError("Заметка пустая."); break;
    default: throw new BadRequestError("Неизвестное действие.");
  }
  $app.runInTransaction((tx) => {
    if (action !== "note") tx.save(u);
    const log = new Record(tx.findCollectionByNameOrId("access_log"));
    log.set("user", u.id);
    log.set("by_name", e.auth.getString("name") || e.auth.getString("email"));
    log.set("action", action + (action === "extend" ? ":" + months : ""));
    log.set("until_before", before);
    log.set("until_after", u.getString("access_until"));
    log.set("note", note);
    tx.save(log);
  });
  return e.json(200, { ok: true });
}
// Фото профиля пользователя для раздела «Пользователи». Файл защищённый, а читать чужие записи users
// администратор через обычный API не может, поэтому фото отдаёт этот маршрут (только администратору).
function adminAvatar(e) {
  requireAdmin(e);
  let u = null;
  try { u = $app.findRecordById("users", e.request.pathValue("id")); } catch (_) {}
  const name = u ? u.getString("avatar") : "";
  if (!name || $app.settings().s3.enabled) throw new NotFoundError("Фото нет.");
  e.response.header().set("Cache-Control", "private, no-store");
  return e.fileFS($os.dirFS($filepath.join($app.dataDir(), "storage", u.baseFilesPath())), name);
}

// Своё состояние доступа для приложения
function myAccess(e) {
  const st = state(e.auth);
  return e.json(200, { active: st.active, reason: st.reason, until: st.until, suspended: st.suspended, admin: st.admin, today: st.today, contact: contact() });
}

module.exports = { today, addMonths, state, guard, guardProfile, message, untilFor, PERIODS, checkInvite, adminUsers, adminAccess, adminAvatar, myAccess };
