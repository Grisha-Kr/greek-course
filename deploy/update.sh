#!/usr/bin/env bash
# Обновление «Греческого курса» до последней версии кода из GitHub.
# Запуск на сервере (от root):  bash /opt/greek/src/deploy/update.sh
set -euo pipefail
NAME=greek
APP=/opt/$NAME
[ "$(id -u)" = "0" ] || { echo "Запустите от имени root."; exit 1; }

# Если что-то пойдёт не так, приложение всё равно запустится снова на старой версии.
trap 'systemctl start $NAME || true' EXIT

echo "Делаю резервную копию базы перед обновлением…"
mkdir -p "$APP/pb_data/backups"
systemctl stop $NAME
tar -czf "$APP/pb_data/backups/before-update-$(date +%Y%m%d-%H%M).tar.gz" -C "$APP/pb_data" data.db auxiliary.db 2>/dev/null || true

echo "Загружаю новую версию кода…"
# Папка с кодом принадлежит пользователю greek, поэтому git нужно явно разрешить работать с ней от root.
git -c safe.directory="$APP/src" -C "$APP/src" pull --ff-only
chown -R $NAME:$NAME "$APP"

systemctl start $NAME
sleep 3
if systemctl is-active --quiet $NAME; then
  echo "Готово: приложение обновлено и работает."
else
  journalctl -u $NAME -n 30 --no-pager
  echo "Приложение не запустилось. Текст ошибки выше; копия базы лежит в $APP/pb_data/backups."
  exit 1
fi
