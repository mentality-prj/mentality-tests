# Налаштування VS Code для Playwright-проєкту

## Рекомендовані розширення

- **ms-playwright.playwright** — підтримка Playwright, snippets, запуск тестів
- **dbaeumer.vscode-eslint** — підсвічування та автофікс lint-помилок
- **esbenp.prettier-vscode** — автоформатування коду
- **streetsidesoftware.code-spell-checker** — перевірка орфографії у коді
- **github.copilot** — AI-підказки для коду (за наявності)

## Налаштування редактора

- Форматування коду при збереженні ("editor.formatOnSave": true)
- ESLint як лінтер за замовчуванням
- Prettier як форматтер за замовчуванням
- Підсвічування помилок TypeScript

> Усі ці налаштування вже додані у .vscode/settings.json та .vscode/extensions.json цього проєкту.

---

# Як працювати з тестами

- Відкрийте папку mentality-tests у VS Code
- Встановіть рекомендовані розширення (VS Code запропонує автоматично)
- Пишіть тести у папці tests/
- Запускайте тести через Playwright Test Explorer або термінал

---

_Цей файл допоможе студентам швидко налаштувати середовище для роботи з Playwright-тестами._
