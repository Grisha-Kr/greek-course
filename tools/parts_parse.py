"""Разбор приложения «Временные формы глаголов» учебника Маунса (с. 414–424).
Запуск: python3 tools/parts_parse.py ПУТЬ/uchebnik_maunsa_unicode.txt > формы.json
Глагол: v (настоящее время), f (5 форм: будущее, аорист, перфект, перфект ср./страд., аорист страд.),
fn (сноски: номер формы 0–5 → текст), p (страница). Исправления после сверки с PDF в tools/parts_fixes.py."""
import re, sys, json, unicodedata, os
sys.path.insert(0, os.path.dirname(__file__))
from parts_fixes import TOKEN_FIX, VERB_FIX, BOLD, NOTE_FIX

NFC = lambda s: unicodedata.normalize("NFC", s)
GREEK = "Ά-ώἀ-῾"
TOK = re.compile(r"^([" + GREEK + r"]+|–)(\d*)$")

def pages(path, first=414, last=421):
    cur, out = None, {}
    for line in open(path, encoding="utf-8"):
        m = re.match(r"=== \[стр\. (\d+)\] ===", line)
        if m: cur = int(m.group(1)); continue
        if cur and first <= cur <= last: out.setdefault(cur, []).append(NFC(line.rstrip("\n")))
    return out

def split_page(p, lines):
    body = [l.strip() for l in lines]
    body = [l for l in body if l and l not in (str(p), "Основы библейского греческого языка", "Приложение: Временные формы глаголов")]
    # сноски начинаются со строки «1 …» после таблицы
    k = next(i for i, l in enumerate(body) if re.match(r"^1\s+\S", l))
    table, notes = body[:k], body[k:]
    fns, cur = {}, None
    for l in notes:
        m = re.match(r"^(\d+)\s+(.*)$", l)
        if m and (cur is None or int(m.group(1)) == cur + 1):
            cur = int(m.group(1)); fns[cur] = m.group(2)
        else:
            fns[cur] = (fns[cur][:-1] if fns[cur].endswith("-") and not fns[cur].endswith(" -") else fns[cur] + " ") + l
    def fix(t):
        t = re.sub(r"\s+", " ", t).strip()
        for a, b in NOTE_FIX: t = t.replace(a, b)
        return t
    return table, {k: fix(v) for k, v in fns.items()}

def parse(path):
    verbs = []
    for p, lines in pages(path).items():
        table, fns = split_page(p, lines)
        toks = []
        for l in table:
            for t in l.split():
                t = TOKEN_FIX.get((p, t), t)
                m = TOK.match(t)
                if not m: raise SystemExit(f"с. {p}: непонятная часть таблицы «{t}» в строке «{l}»")
                toks.append((m.group(1), int(m.group(2)) if m.group(2) else None))
        if len(toks) % 6: raise SystemExit(f"с. {p}: {len(toks)} форм, не делится на 6")
        for i in range(0, len(toks), 6):
            row = toks[i:i + 6]
            v = {"v": row[0][0], "f": [t[0] for t in row[1:]], "fn": {}, "p": p}
            for j, (_, n) in enumerate(row):
                if n is not None: v["fn"][j] = fns.get(n, f"?? сноска {n}")
            verbs.append(v)
    out = []
    for v in verbs:
        v["b"] = BOLD.get(v["v"], [])
        fix = VERB_FIX.get(v["v"])
        if fix: v.update(fix)
        out.append(v)
    return out

if __name__ == "__main__":
    json.dump(parse(sys.argv[1]), sys.stdout, ensure_ascii=False, indent=0)
