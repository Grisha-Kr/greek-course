/// <reference path="../pb_data/types.d.ts" />

// Этап 3а: таблицы и правила для заучивания (pb_public/data/drills.js).
// drill_progress: прогресс таблиц, правил и карточек предлогов, k = постоянный ключ пункта (например «t07-art», «p-dia-gen»),
// level, due, hard как у word_progress. users.strict_marks: проверять ударения и придыхания при заполнении таблиц
// (по умолчанию выключено: автор пишет, что знать ударения необязательно, с. 31).
// Прогресс слов, букв, форм, текущая глава и дни плана не меняются.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("strict_marks")) {
    users.fields.add(new BoolField({ name: "strict_marks" }));
  }
  app.save(users);

  const ME = "user = @request.auth.id";
  const ME_CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
  const ME_UPDATE = "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";
  let exists = true;
  try { app.findCollectionByNameOrId("drill_progress"); } catch (_) { exists = false; }
  if (!exists) {
    app.save(new Collection({
      type: "base",
      name: "drill_progress",
      listRule: ME, viewRule: ME, createRule: ME_CREATE, updateRule: ME_UPDATE, deleteRule: ME,
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
        { type: "text", name: "k", required: true, min: 1, max: 40, pattern: "^[a-z0-9-]+$" },
        { type: "number", name: "level", onlyInt: true, min: 0, max: 6 },
        { type: "text", name: "due", max: 10, required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        { type: "bool", name: "hard" },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_drill_progress_key ON drill_progress (user, k)"],
    }));
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("drill_progress")); } catch (_) {}
  const users = app.findCollectionByNameOrId("users");
  const f = users.fields.getByName("strict_marks");
  if (f) { users.fields.removeById(f.id); app.save(users); }
});
