/// <reference path="../pb_data/types.d.ts" />

// Этап 2: полный словарь учебника и основные формы глаголов.
// Прогресс слов, букв и дней плана не трогаем: добавляются только новые поля и коллекции.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // --- настройки плана: что учить дальше (chapters: по главам учебника, freq: по частоте; пусто = по главам)
  //     и основные формы в плане (parts_off = true: задание выключено; по умолчанию включено) ---
  if (!users.fields.getByName("plan_order")) {
    users.fields.add(new SelectField({ name: "plan_order", values: ["chapters", "freq"], maxSelect: 1 }));
  }
  if (!users.fields.getByName("parts_off")) {
    users.fields.add(new BoolField({ name: "parts_off" }));
  }
  app.save(users);

  const ME = "user = @request.auth.id";
  const ME_CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
  const ME_UPDATE = "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";
  const userField = () => ({ type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 });
  const date = (name, required) => ({ type: "text", name, max: 10, required: !!required, pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
  const int = (name, min, max, required) => ({ type: "number", name, onlyInt: true, min, max, required: !!required });
  const stamps = () => [
    { type: "autodate", name: "created", onCreate: true },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];
  function mine(name, fields, unique) {
    try { app.findCollectionByNameOrId(name); return; } catch (_) {}
    app.save(new Collection({
      type: "base",
      name,
      listRule: ME, viewRule: ME, createRule: ME_CREATE, updateRule: ME_UPDATE, deleteRule: ME,
      fields: [userField(), ...fields, ...stamps()],
      indexes: [`CREATE UNIQUE INDEX idx_${name}_key ON ${name} (user, ${unique})`],
    }));
  }

  // --- прогресс основных форм: n — номер глагола в parts.js, level и due как у word_progress ---
  mine("parts_progress", [int("n", 1, 999, true), int("level", 0, 6), date("due", true), { type: "bool", name: "hard" }], "n");

  // --- слова, добавленные в изучение из словаря вручную: n — номер слова в dictionary.js.
  //     Пока у слова нет записи в word_progress, оно ждёт своей очереди в новых словах плана ---
  mine("word_added", [int("n", 1, 9999, true)], "n");
}, (app) => {
  for (const name of ["word_added", "parts_progress"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["plan_order", "parts_off"]) {
    const fld = users.fields.getByName(f);
    if (fld) users.fields.removeById(fld.id);
  }
  app.save(users);
});
