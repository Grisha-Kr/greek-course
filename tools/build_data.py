"""Сборка данных этапа 2: pb_public/data/dictionary.js (словарь учебника) и pb_public/data/parts.js (основные формы).
Запуск из корня репозитория:
  python3 tools/build_data.py ../greek-materials/uchebnik_maunsa_unicode.txt

Номера слов постоянные (на них держится прогресс пользователей):
- слово лексического минимума получает свой номер 1–320 из words.js;
- остальные слова получают номера с 321; уже выданный номер берётся из текущего dictionary.js
  (по заголовку статьи) и никогда не меняется, новые статьи получают следующий свободный номер;
- глаголы основных форм нумеруются так же: номер из текущего parts.js или следующий свободный.
Если статья пропала или заголовок изменился так, что номер не нашёлся, скрипт останавливается."""
import json, re, sys, os, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dict_parse, parts_parse

ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "pb_public", "data")
NFC = lambda s: unicodedata.normalize("NFC", s)
strip = lambda s: "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower().replace("ς", "σ")
def head(g):
    g = re.sub(r"\(.*?\)", "", NFC(g))
    return re.split(r",| или ", g)[0].strip()

def js_array(path, name):
    if not os.path.exists(path): return None
    m = re.search(r"const " + name + r"=(\[.*?\]);", open(path, encoding="utf-8").read(), re.S)
    return json.loads(m.group(1)) if m else None

def main(src):
    words = js_array(os.path.join(DATA, "words.js"), "WORDS")
    es = dict_parse.build(src)
    old = js_array(os.path.join(DATA, "dictionary.js"), "DICT") or []
    old_n = {e["g"]: e["n"] for e in old}

    # 1. слова минимума: заголовок словаря совпадает с заголовком слова в words.js
    by_head = {}
    for i, e in enumerate(es): by_head.setdefault(head(e["g"]), []).append(i)
    min_of = {}
    problems = []
    for w in words:
        c = by_head.get(head(w["g"]), [])
        if len(c) == 1: min_of[c[0]] = w["n"]
        else: problems.append(f"слово минимума {w['n']} «{w['g']}» в словаре {'не найдено' if not c else 'найдено несколько раз'}")

    # 2. номера остальных слов: прежние сохраняются, новые с 321 по порядку словаря
    used = set(min_of.values()) | set(old_n.values())
    nxt = max([320] + [n for n in old_n.values()]) + 1
    for i, e in enumerate(es):
        if i in min_of: e["n"] = min_of[i]
        elif e["g"] in old_n: e["n"] = old_n[e["g"]]
        else: e["n"] = nxt; nxt += 1
    lost = set(old_n) - {e["g"] for e in es}
    if lost: raise SystemExit("В новом разборе нет статей, которым уже выданы номера: " + ", ".join(sorted(lost)))
    ns = [e["n"] for e in es]
    assert len(ns) == len(set(ns)), "повтор номера"

    out = []
    for e in es:
        d = {"n": e["n"], "g": e["g"], "ru": e.get("ru", ""), "f": e.get("f", 0)}
        for k in ("ch", "c", "im", "pp", "note"):
            if e.get(k): d[k] = e[k]
        d["k"] = e["k"]; d["p"] = e["p"]
        out.append(d)

    # 3. основные формы: значение и номер статьи берутся из словаря
    verbs = parts_parse.parse(src)
    old_v = {v["v"]: v["n"] for v in (js_array(os.path.join(DATA, "parts.js"), "VERBS") or [])}
    vn = max([0] + list(old_v.values())) + 1
    dict_by_head = {}
    for d in out: dict_by_head.setdefault(head(d["g"]), d)
    vout = []
    for v in verbs:
        d = dict_by_head.get(v["v"])
        if not d: raise SystemExit(f"глагол {v['v']} не найден в словаре")
        if v["v"] in old_v: n = old_v[v["v"]]
        else: n = vn; vn += 1
        vout.append({"n": n, "v": v["v"], "ru": d["ru"], "d": d["n"], "f": v["f"], "b": v["b"],
                     "fn": {str(k): t for k, t in sorted(v["fn"].items(), key=lambda x: int(x[0]))}, "p": v["p"]})

    with open(os.path.join(DATA, "dictionary.js"), "w", encoding="utf-8") as f:
        f.write("/* Словарь учебника Маунса (с. 438–461): все слова, которые встречаются в Новом Завете 10 раз и больше.\n"
                "   Собран скриптом tools/build_data.py из текста учебника и сверен с изображениями страниц (docs/data-check.md).\n"
                "   Поля: n — постоянный номер слова (1–320 лексический минимум, как в words.js; новые слова с 321),\n"
                "   g — словарная форма, ru — значение, f — частотность в НЗ, ch — глава лексического минимума,\n"
                "   c — код MBG или часть речи, k — часть речи (n сущ., v глаг., a прил. и мест., d нареч., p предлог, c союз, q частица и др.),\n"
                "   im — имперфект, pp — временные формы (будущее, аорист, перфект, перфект ср./страд., аорист страд.), note — примечание, p — страница. */\n")
        f.write("const DICT=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(DATA, "parts.js"), "w", encoding="utf-8") as f:
        f.write("/* Основные формы глаголов, которые встречаются в НЗ 50 раз и больше: учебник Маунса, приложение «Временные формы глаголов», с. 414–421.\n"
                "   Собраны скриптом tools/build_data.py и сверены с изображениями страниц (docs/data-check.md).\n"
                "   Поля: n — постоянный номер глагола (прогресс в parts_progress), v — настоящее время, ru — значение по словарю, d — номер слова в DICT,\n"
                "   f — 5 форм (будущее, аорист действ., перфект действ., перфект ср./страд., аорист страд.; «–» формы нет),\n"
                "   b — формы, выделенные в книге полужирным (0 настоящее время, 1–5 формы f), fn — сноски к формам (0 настоящее время, 1–5), p — страница. */\n")
        f.write("const VERBS=" + json.dumps(vout, ensure_ascii=False, separators=(",", ":")) + ";\n")

    print(f"Статей словаря: {len(out)}, из них слов минимума: {len(min_of)}, новых номеров: {len(out) - len(min_of)} (до {max(ns)})")
    print(f"Глаголов основных форм: {len(vout)}")
    for p in problems: print("ВНИМАНИЕ:", p)

if __name__ == "__main__":
    main(sys.argv[1])
