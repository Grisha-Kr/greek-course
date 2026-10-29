/// <reference path="../pb_data/types.d.ts" />

// Регистрация: первый пользователь становится администратором,
// все следующие регистрируются только по коду приглашения.
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }

  const total = $app.countRecords("users");
  let invite = null;

  if (total > 0) {
    const body = e.requestInfo().body || {};
    const code = String(body["invite"] || "").trim().toUpperCase();
    if (!code) {
      throw new BadRequestError("Для регистрации нужен код приглашения.");
    }
    try {
      invite = $app.findFirstRecordByData("invites", "code", code);
    } catch (_) {
      invite = null;
    }
    if (!invite) {
      throw new BadRequestError("Такого кода приглашения нет. Проверьте, что он введён без ошибок.");
    }
    const max = invite.getInt("max_uses");
    if (max > 0 && invite.getInt("uses") >= max) {
      throw new BadRequestError("Это приглашение уже использовано.");
    }
    const expires = invite.getString("expires");
    if (expires && expires < new Date().toISOString().slice(0, 10)) {
      throw new BadRequestError("Срок действия приглашения истёк.");
    }
    e.record.set("role", "user");
  } else {
    e.record.set("role", "admin");
  }
  if (!e.record.getString("theme")) e.record.set("theme", "auto");

  e.next();

  if (invite) {
    invite.set("uses", invite.getInt("uses") + 1);
    invite.set("used_by", invite.getStringSlice("used_by").concat([e.record.id]));
    $app.save(invite);
  }
}, "users");

// Кто создал приглашение, записывает сервер.
onRecordCreateRequest((e) => {
  if (e.auth) e.record.set("created_by", e.auth.id);
  e.record.set("uses", 0);
  e.record.set("used_by", []);
  e.next();
}, "invites");

// Настройки из окружения:
// APP_URL: адрес приложения для писем (сброс пароля);
// BEHIND_PROXY=1: приложение стоит за Caddy, настоящий IP посетителя берётся из X-Forwarded-For.
onBootstrap((e) => {
  e.next();
  const s = $app.settings();
  let changed = false;
  const url = $os.getenv("APP_URL");
  if (url && s.meta.appURL !== url) {
    s.meta.appURL = url;
    changed = true;
  }
  if ($os.getenv("BEHIND_PROXY") === "1") {
    const h = s.trustedProxy.headers || [];
    if (h.length !== 1 || h[0] !== "X-Forwarded-For") {
      s.trustedProxy.headers = ["X-Forwarded-For"];
      changed = true;
    }
  }
  if (changed) $app.save(s);
});

// Сведения для экрана входа и политики конфиденциальности.
routerAdd("GET", "/api/greek/setup", (e) => {
  return e.json(200, {
    firstRun: $app.countRecords("users") === 0,
    owner: $os.getenv("OWNER_NAME") || "",
    contact: $os.getenv("CONTACT_EMAIL") || "",
  });
});
