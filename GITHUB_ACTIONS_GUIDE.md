# GitHub Actions для mentality-tests

## Що таке CI?

CI (Continuous Integration) — це автоматичний запуск тестів та перевірок при кожному push/pull request у репозиторій.

## Як це працює у цьому проєкті?

- При кожному push/pull request у main запускається workflow .github/workflows/ci.yml
- Workflow автоматично:
  - Встановлює залежності
  - Встановлює браузери Playwright
  - Перевіряє lint (ESLint)
  - Перевіряє форматування (Prettier)
  - Перевіряє типи (TypeScript)
  - Запускає всі тести Playwright

## Як додати ще перевірки?

- Додайте нові кроки у .github/workflows/ci.yml
- Наприклад, можна додати генерацію html-репорту або деплой preview

## Де дивитись результати?

- На вкладці Actions у GitHub-репозиторії
- У pull request — статуси перевірок

---

_Цей файл допоможе студентам зрозуміти, як працює CI та як додавати свої перевірки._
