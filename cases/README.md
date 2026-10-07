# Детективные дела

Каждое дело — это папка `cases/src/<id>/`:

- `head.html` — стили и шрифты дела;
- `template.html` — разметка экранов (дыры `{{ имя }}`, блоки `<sc-if value="{{ x }}">` и `<sc-for list="{{ xs }}" as="x">`);
- `logic.js` — материалы, улики, допросы, запросы Диме и класс `Component` с `state` и `renderVals()`.

Сборка в один файл, который подключает `case.html`:

```
python3 tools/build-case.py tikhaya-noch
```

Открыть дело: `case.html?case=tikhaya-noch`. Кнопки быстрого перехода по версиям: `case.html?case=tikhaya-noch&dev=1`.

Прогресс игрока сохраняется в браузере телефона (localStorage) и восстанавливается при повторном открытии.
Движок — `cases/dc-lite.js`: перерисовывает экран при каждом `setState` и правит DOM на месте.
