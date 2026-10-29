"""Разбор словаря учебника Маунса (с. 438–461) из текста в Юникоде.
Запуск: python3 tools/dict_parse.py ПУТЬ/uchebnik_maunsa_unicode.txt > статьи.json
Статья: g (заголовок как в книге), ru, f (раз в НЗ), ch (глава минимума), c (код MBG или часть речи),
im (имперфект), pp (5 форм после настоящего времени), p (страница).
Исправления после сверки с PDF лежат в tools/dict_fixes.py."""
import re, sys, json, unicodedata, os
sys.path.insert(0, os.path.dirname(__file__))
from dict_fixes import LINE_FIX, ENTRY_FIX

LETTER_HEADS = {"ἄλφα", "βῆτα", "γάμμα", "δέλτα", "ἒ ψιλόν", "ζῆτα", "ἦτα", "θῆτα", "ἰῶτα", "κάππα", "λάμβδα", "μῦ", "νῦ",
                "ξῖ", "ὂ μικρόν", "πῖ", "ῥῶ", "σίγμα", "ταῦ", "ὖ ψιλόν", "φῖ", "χῖ", "ψῖ", "ὦ μέγα"}
NFC = lambda s: unicodedata.normalize("NFC", s)
GREEK = "Ά-ώἀ-῾"

def pages(path, first=438, last=461):
    cur, out = None, {}
    for line in open(path, encoding="utf-8"):
        m = re.match(r"=== \[стр\. (\d+)\] ===", line)
        if m:
            cur = int(m.group(1)); continue
        if cur and first <= cur <= last:
            out.setdefault(cur, []).append(NFC(line.rstrip("\n")))
    return out

def clean_lines(p, lines):
    res = []
    for i, l in enumerate(lines):
        s = l.strip()
        if not s: continue
        if i < 4 and s in ("Словарь", str(p), "Основы библейского греческого языка"): continue
        if s in LETTER_HEADS: continue
        res.append(LINE_FIX.get(s, s))
    if p == 438:  # примечание о порядке временных форм внизу страницы
        k = next((i for i, s in enumerate(res) if s.startswith("Временны")), None)
        if k is not None: res = res[:k]
    return res

CODE_TAIL = re.compile(r"(?:^|[\s(,])(?:c?v|n|a)-$")
def join(prev, nxt):
    """Склейка строк: перенос по слогам убирается, дефис внутри кода MBG (n-3f) остаётся."""
    if prev.endswith("-"):
        return prev + nxt if CODE_TAIL.search(prev) else prev[:-1] + nxt
    return prev + " " + nxt

# статья без ◆ (знак потерян при извлечении текста или пропущен в книге) прилипает к предыдущей:
# «… ἐξεβλήθην ἐκεῖ там; туда (105, …)», «… (42, a-1a[2a]) καιρός, –οῦ, ὁ время …»
def split_lost(raw):
    m = PAREN.search(raw.split("◆", 1)[1]) if "◆" in raw else None
    if not m: return [raw]
    cut = raw.index("◆") + 1 + m.end()
    toks = raw[cut:].split(" ")
    i = next((k for k, t in enumerate(toks) if re.match(r"[а-яё]", t) and t != "или"), None)
    if i is None or i == 0: return [raw]
    j = i - 1
    while j > 0 and toks[j - 1].endswith(",") and re.match(r"[" + GREEK + r"–]", toks[j - 1]): j -= 1
    if j > 0 and toks[j - 1].endswith(","): return [raw]  # не удалось понять, где начало
    head = " ".join(toks[j:i]).strip()
    if not head or not re.match(r"[" + GREEK + r"]", head): return [raw]
    first = (raw[:cut] + " " + " ".join(toks[:j])).strip()
    return [first] + split_lost(head + " ◆ " + " ".join(toks[i:]))

def entries(path):
    out = []
    for p, lines in pages(path).items():
        for s in clean_lines(p, lines):
            if "◆" in s:
                out.append({"p": p, "raw": s})
            else:
                out[-1]["raw"] = join(out[-1]["raw"], s)
    res = []
    for e in out:
        for k, raw in enumerate(split_lost(re.sub(r"\s+", " ", e["raw"]).strip())):
            res.append({"p": e["p"], "raw": raw, **({"lost": True} if k else {})})
    return res

def norm_head(h):
    """Запятые между формами заголовка (в тексте часть запятых потеряна): «γραφή –ῆς, ἡ» → «γραφή, –ῆς, ἡ»."""
    h = re.sub(r"\(\s+", "(", h); h = re.sub(r"\s+\)", ")", h)
    toks, buf, depth = [], "", 0
    for ch in h:
        depth += (ch == "(") - (ch == ")")
        if ch in " ," and depth == 0:
            if buf: toks.append(buf); buf = ""
            if ch == ",": toks.append(",")
            continue
        buf += ch
    if buf: toks.append(buf)
    words = [t for t in toks if t != ","]
    out = ""
    for i, t in enumerate(words):
        if i == 0: out = t
        elif t.startswith("(") or t == "или" or words[i - 1] == "или": out += " " + t
        else: out += ", " + t
    return out

POS = [("наречие", "d"), ("нареч.", "d"), ("предлог", "p"), ("союз", "c"), ("частица", "q"), ("междометье", "q"), ("междометие", "q")]
def pos_of(code, ru):
    m = re.match(r"(c?v|n|a)-", code)
    if m: return {"v": "v", "cv": "v", "n": "n", "a": "a"}[m.group(1)]
    for label, k in POS:
        if code.startswith(label) or code.startswith("гл.") and label in code: return k
    for label, k in POS:
        if ru.startswith(label): return k
    return "x"

PAREN = re.compile(r"\((\d[\d ]*)(?:,\s*гл\.\s*(\d+))?(?:[,;]\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)")
def parse(e):
    raw = e["raw"]
    head, rest = [x.strip() for x in raw.split("◆", 1)]
    d = {"g": norm_head(head), "p": e["p"]}
    m = next(PAREN.finditer(rest), None)
    if not m:
        d["ru"] = rest; return d
    d["ru"] = rest[:m.start()].strip()
    d["f"] = int(m.group(1).replace(" ", ""))
    if m.group(2): d["ch"] = int(m.group(2))
    code = (m.group(3) or "").strip()
    m2 = re.match(r"гл\.\s*(\d+);\s*(.*)$", code)  # «(29, гл. 11; частица)»
    if m2: d["ch"] = int(m2.group(1)); code = m2.group(2)
    d["c"] = code
    tail = rest[m.end():].strip().lstrip(",").strip().rstrip(",").strip()
    if tail.startswith("."):  # примечание после скобки: «. Также возможен вариант κρείττων.»
        d["note"] = tail.lstrip(". "); tail = ""
    if tail:
        mi = re.match(r"^\(([^)]*)\)\s*,?\s*(.*)$", tail)
        if mi: d["im"] = mi.group(1).strip(); tail = mi.group(2)
        if tail: d["pp"] = [x.strip() for x in tail.split(",")]
    # пробелы внутри греческих слов от выключки строк: «δε δόξασ μαι» → «δεδόξασμαι»
    glue = lambda s: " или ".join(re.sub(r"(?<=[" + GREEK + r"])\s+(?=[" + GREEK + r"])", "", x.strip()) for x in s.split(" или "))
    if d.get("im"): d["im"] = glue(d["im"])
    if d.get("pp"): d["pp"] = [glue(x) for x in d["pp"]]
    return d

def build(path):
    es = [parse(e) for e in entries(path)]
    out = []
    for d in es:
        fix = ENTRY_FIX.get((d["p"], d["g"]))
        if fix == "drop": continue
        if fix: d.update(fix)
        d["k"] = pos_of(d.get("c", ""), d.get("ru", ""))
        if d["g"] == "ἄν": d["k"] = "q"  # «непереводимая … частица», кода нет
        if d["g"] == "εἶπεν": d["k"] = "v"  # форма аориста λέγω
        out.append(d)
    return out

if __name__ == "__main__":
    json.dump(build(sys.argv[1]), sys.stdout, ensure_ascii=False, indent=0)
