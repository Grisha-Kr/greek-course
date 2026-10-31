/// <reference path="../pb_data/types.d.ts" />

// Правки 2.1: курс идёт по учебнику глава за главой.
// users.chapter: текущая глава (1–36, после окончания курса 37; 0 = не задана, приложение считает её главой 1).
// form_progress: прогресс полужирных основных форм, n = номер глагола в parts.js × 10 + номер формы (0 настоящее время,
// 1 будущее, 2 аорист действ., 3 перфект действ., 4 перфект ср./страд., 5 аорист страд.).
// Прогресс слов, букв, старых основных форм (parts_progress) и дни плана не меняются.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("chapter")) {
    users.fields.add(new NumberField({ name: "chapter", onlyInt: true, min: 0, max: 37 }));
  }
  app.save(users);

  const ME = "user = @request.auth.id";
  const ME_CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
  const ME_UPDATE = "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";
  let exists = true;
  try { app.findCollectionByNameOrId("form_progress"); } catch (_) { exists = false; }
  if (!exists) {
    app.save(new Collection({
      type: "base",
      name: "form_progress",
      listRule: ME, viewRule: ME, createRule: ME_CREATE, updateRule: ME_UPDATE, deleteRule: ME,
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
        { type: "number", name: "n", onlyInt: true, min: 10, max: 9995, required: true },
        { type: "number", name: "level", onlyInt: true, min: 0, max: 6 },
        { type: "text", name: "due", max: 10, required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        { type: "bool", name: "hard" },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_form_progress_key ON form_progress (user, n)"],
    }));
  }

  // Текущая глава для тех, кто уже занимается: первая глава с заданиями, которая не пройдена по правилу этапов 1–2
  // (глава 3: все 24 буквы «знаю»; глава со словами: все её слова начаты). Если пройдено всё, глава 36.
  // Номера слов лексического минимума по главам (words.js, номера идут по порядку глав).
  const WORDS_BY_CH = {
    4: [1, 26], 6: [27, 39], 7: [40, 53], 8: [54, 72], 9: [73, 87], 10: [88, 102], 11: [103, 123], 12: [124, 138],
    13: [139, 151], 14: [152, 169], 16: [170, 180], 17: [181, 191], 18: [192, 201], 19: [202, 211], 20: [212, 227],
    21: [228, 236], 22: [237, 250], 23: [251, 258], 24: [259, 266], 25: [267, 269], 27: [270, 283], 28: [284, 290],
    29: [291, 295], 30: [296, 297], 31: [298, 299], 32: [300, 301], 33: [302, 304], 34: [305, 311], 36: [312, 320],
  };
  const all = app.findAllRecords("users");
  for (const u of all) {
    if (u.getInt("chapter") > 0) continue;
    const started = {};
    for (const r of app.findRecordsByFilter("word_progress", "user = {:u}", "", 0, 0, { u: u.id })) started[r.getInt("n")] = true;
    let known = 0;
    for (const r of app.findRecordsByFilter("letter_progress", "user = {:u}", "", 0, 0, { u: u.id })) if (r.getBool("known")) known++;
    let cur = 36;
    for (let c = 1; c <= 36; c++) {
      let done;
      if (c === 3) done = known >= 24;
      else if (WORDS_BY_CH[c]) {
        done = true;
        for (let n = WORDS_BY_CH[c][0]; n <= WORDS_BY_CH[c][1]; n++) if (!started[n]) { done = false; break; }
      } else continue; // главы без заданий текущими не бывают
      if (!done) { cur = c; break; }
    }
    u.set("chapter", cur);
    app.saveNoValidate(u);
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("form_progress")); } catch (_) {}
  const users = app.findCollectionByNameOrId("users");
  const f = users.fields.getByName("chapter");
  if (f) { users.fields.removeById(f.id); app.save(users); }
});
