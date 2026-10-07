#!/usr/bin/env python3
"""Собирает дело из cases/src/<id>/ в один файл cases/<id>.js.

В папке дела три файла:
  head.html     — стили и шрифты дела
  template.html — разметка экранов с {{ дырами }}, <sc-if>, <sc-for>
  logic.js      — данные дела и класс Component (state + renderVals)

Запуск из корня репозитория:  python3 tools/build-case.py tikhaya-noch
"""
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
case_id = sys.argv[1] if len(sys.argv) > 1 else "tikhaya-noch"
src = root / "cases" / "src" / case_id

head = (src / "head.html").read_text(encoding="utf-8")
template = (src / "template.html").read_text(encoding="utf-8")
logic = (src / "logic.js").read_text(encoding="utf-8")

out = (
    "// Собрано tools/build-case.py из cases/src/" + case_id + "/ — правьте исходники, не этот файл.\n"
    "window.HUDDLE_CASES = window.HUDDLE_CASES || {};\n"
    "(function () {\n"
    + logic
    + "\nwindow.HUDDLE_CASES[" + json.dumps(case_id) + "] = { head: " + json.dumps(head, ensure_ascii=False)
    + ", template: " + json.dumps(template, ensure_ascii=False) + ", Component: Component };\n"
    "})();\n"
)
(root / "cases" / (case_id + ".js")).write_text(out, encoding="utf-8")
print("ok:", case_id, len(out), "bytes")
