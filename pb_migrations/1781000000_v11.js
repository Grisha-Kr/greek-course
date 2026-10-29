/// <reference path="../pb_data/types.d.ts" />

// Правки 1.1: фото профиля. Хранится только обрезанный по кругу квадрат 400×400 (JPEG),
// файл защищённый: открывается по токену, а запись пользователя видит только он сам.

migrate((app) => {
  const MB = 1024 * 1024;
  const IMG = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  const users = app.findCollectionByNameOrId("users");
  const av = users.fields.getByName("avatar");
  if (av) {
    av.maxSelect = 1;
    av.maxSize = 10 * MB;
    av.mimeTypes = IMG;
    av.thumbs = [];
    av.protected = true;
  } else {
    users.fields.add(new FileField({ name: "avatar", maxSelect: 1, maxSize: 10 * MB, mimeTypes: IMG, protected: true }));
  }
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  const av = users.fields.getByName("avatar");
  if (av) { users.fields.removeById(av.id); app.save(users); }
});
