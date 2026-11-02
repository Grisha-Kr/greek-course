/// <reference path="../pb_data/types.d.ts" />

// Доступ на срок (правки 3.1): когда срок прошёл или стоит пауза, виден только свой прогресс.
// Логика в access_lib.js. Чтение своих записей открыто: на нём держатся «Прогресс» и календарь.
// Без доступа открыты: вход, чтение, смена пароля и темы, выход, удаление аккаунта.
// Каскадное удаление (удаление аккаунта) идёт мимо этих хуков: это не запросы API к коллекциям прогресса.

// Коллекции прогресса пользователя. parts_progress приложение с правок 2.1 не использует, закрыта на всякий случай.
const DATA = ["word_progress", "letter_progress", "plan_days", "form_progress", "drill_progress", "word_added", "parts_progress"];

onRecordCreateRequest((e) => { require(`${__hooks}/access_lib.js`).guard(e); e.next(); }, ...DATA);
onRecordUpdateRequest((e) => { require(`${__hooks}/access_lib.js`).guard(e); e.next(); }, ...DATA);
onRecordDeleteRequest((e) => { require(`${__hooks}/access_lib.js`).guard(e); e.next(); }, ...DATA);

// Свой профиль: без доступа нельзя менять имя, фото, текущую главу и настройки занятий; пароль и тему можно.
onRecordUpdateRequest((e) => { require(`${__hooks}/access_lib.js`).guardProfile(e); e.next(); }, "users");

// Срок доступа в приглашении: только из списка
onRecordCreateRequest((e) => { require(`${__hooks}/access_lib.js`).checkInvite(e); e.next(); }, "invites");
onRecordUpdateRequest((e) => { require(`${__hooks}/access_lib.js`).checkInvite(e); e.next(); }, "invites");

routerAdd("GET", "/api/greek/access", (e) => require(`${__hooks}/access_lib.js`).myAccess(e), $apis.requireAuth("users"));
routerAdd("GET", "/api/greek/admin/users", (e) => require(`${__hooks}/access_lib.js`).adminUsers(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/greek/admin/access", (e) => require(`${__hooks}/access_lib.js`).adminAccess(e), $apis.requireAuth("users"));
routerAdd("GET", "/api/greek/admin/users/{id}/avatar", (e) => require(`${__hooks}/access_lib.js`).adminAvatar(e), $apis.requireAuth("users"));
