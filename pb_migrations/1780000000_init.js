/// <reference path="../pb_data/types.d.ts" />

// Начальная схема «Греческого курса», этап 1.
// Буквы, слова и главы лежат в файлах pb_public/data/, в базе только то, что принадлежит пользователю:
// прогресс слов и букв и план на каждый день. Каждый видит и меняет только своё (поле user).

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // --- пользователи: роль и тема ---
  if (!users.fields.getByName("role")) {
    users.fields.add(new SelectField({ name: "role", values: ["user", "admin"], maxSelect: 1 }));
  }
  if (!users.fields.getByName("theme")) {
    users.fields.add(new SelectField({ name: "theme", values: ["auto", "light", "dark"], maxSelect: 1 }));
  }
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = "";
  // роль менять через API нельзя, только из панели администратора
  users.updateRule = "id = @request.auth.id && @request.body.role:isset = false";
  users.deleteRule = "id = @request.auth.id";
  app.save(users);

  const ME = "user = @request.auth.id";
  const ME_CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
  const ME_UPDATE = "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";

  const userField = () => ({ type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 });
  const date = (name, required) => ({ type: "text", name, max: 10, required: !!required, pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
  const int = (name, min, max, required) => ({ type: "number", name, onlyInt: true, min, max, required: !!required });
  const bool = (name) => ({ type: "bool", name });
  const stamps = () => [
    { type: "autodate", name: "created", onCreate: true },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  // Запись пользователя одна на (user, ключ), unique: поля ключа.
  function mine(name, fields, unique) {
    app.save(new Collection({
      type: "base",
      name,
      listRule: ME, viewRule: ME, createRule: ME_CREATE, updateRule: ME_UPDATE, deleteRule: ME,
      fields: [userField(), ...fields, ...stamps()],
      indexes: [`CREATE UNIQUE INDEX idx_${name}_key ON ${name} (user, ${unique})`],
    }));
  }

  // --- прогресс слова лексического минимума: n: номер слова в words.js,
  //     level 0–6: ступень интервала (0, 1, 3, 7, 14, 30, 60 дней), due: день следующего повторения.
  //     Записи нет: слово ещё новое. ---
  mine("word_progress", [int("n", 1, 9999, true), int("level", 0, 6), date("due", true), bool("hard")], "n");

  // --- прогресс буквы алфавита: n: номер в letters.js ---
  mine("letter_progress", [int("n", 1, 24, true), bool("known"), bool("hard")], "n");

  // --- план на день: список заданий (tasks, JSON) составляется при первом открытии дня
  //     по часам устройства; done: выполнены все задания ---
  mine("plan_days", [date("date", true), { type: "json", name: "tasks", maxSize: 20000 }, bool("done")], "date");

  // --- приглашения: видит и создаёт только администратор приложения ---
  const ADMIN = '@request.auth.role = "admin"';
  const txt = (name, max, required) => ({ type: "text", name, max: max || 500, required: !!required });
  app.save(new Collection({
    type: "base",
    name: "invites",
    listRule: ADMIN, viewRule: ADMIN, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      txt("code", 40, true), txt("note", 300), { type: "number", name: "max_uses" }, { type: "number", name: "uses" }, txt("expires", 10),
      { type: "relation", name: "created_by", collectionId: users.id, cascadeDelete: false, maxSelect: 1 },
      { type: "relation", name: "used_by", collectionId: users.id, cascadeDelete: false, maxSelect: 999 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_invites_code ON invites (code)"],
  }));

  // --- настройки: имя приложения и ежедневные резервные копии в 3:00, храним 14 ---
  const s = app.settings();
  s.meta.appName = "Греческий курс";
  s.backups.cron = "0 3 * * *";
  s.backups.cronMaxKeep = 14;
  app.save(s);
}, (app) => {
  for (const name of ["invites", "plan_days", "letter_progress", "word_progress"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
