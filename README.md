# mentality-tests

Цей репозиторій містить автоматизовані end-to-end тести для проєкту [Mentality](https://dzvin.co), написані з використанням Playwright та TypeScript.

## Призначення

Тести призначені для перевірки функціональності вебзастосунку Mentality, забезпечення стабільності та якості продукту.

## Як запускати тести

1. Встановіть залежності:
   ```sh
   pnpm install
   ```
2. Запустіть тести:
   ```sh
   pnpm test
   ```

## Як писати нові тести

- Додавайте нові файли у папку `tests/`.
- Використовуйте Playwright API та TypeScript для написання тестів.
- Дивіться приклади у `tests/example.spec.ts`.

## Додатково

- Для запуску тестів у різних браузерах використовуйте відповідні параметри Playwright.
- Для генерації репортів використовуйте команду:
  ```sh
  pnpm test -- --reporter=html
  ```

---

_Проєкт підтримується командою Mentality (dzvin.co)._

## Корисні Playwright команди

```
pnpm exec playwright test
   Runs the end-to-end tests.

pnpm exec playwright test --ui
   Starts the interactive UI mode.

pnpm exec playwright test --project=chromium
   Runs the tests only on Desktop Chrome.

pnpm exec playwright test example
   Runs the tests in a specific file.

pnpm exec playwright test --debug
   Runs the tests in debug mode.

pnpm exec playwright codegen
   Auto generate tests with Codegen.
```

Ми радимо почати з:

pnpm exec playwright test

та ознайомитись з файлами:

- `tests/example.spec.ts` — приклад end-to-end тесту
- `playwright.config.ts` — конфігурація Playwright Test

Детальніше: https://playwright.dev/docs/intro

## Якість коду: лінтери, форматування, перевірка типів

У цьому проєкті налаштовано ESLint (з підтримкою TypeScript і Playwright), Prettier та перевірку типів TypeScript.

### Основні команди

```
pnpm run lint
   Перевірка коду ESLint

pnpm run format
   Форматування коду Prettier

pnpm run format:check
   Перевірка форматування Prettier

pnpm run typecheck
   Перевірка типів TypeScript (tsc --noEmit)
```

> Рекомендовано запускати lint, format:check та typecheck у CI або перед комітом, щоб уникати помилок у тестах.
