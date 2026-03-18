# Playwright Best Practices & Patterns

## Загальні поради

- Використовуйте TypeScript для автодоповнення та перевірки типів.
- Структуруйте тести за функціональністю (папки, describe).
- Додавайте зрозумілі назви тестів та кроків (step).
- Використовуйте async/await для всіх Playwright-операцій.

## Патерни програмування

### Page Object Model (POM)

- Виносьте логіку роботи зі сторінкою у окремі класи (Page Objects).
- Один клас — одна сторінка/модуль.
- Приклад:
  ```ts
  // tests/pages/LoginPage.ts
  export class LoginPage {
    constructor(private page: Page) {}
    async login(user: string, pass: string) {
      await this.page.fill('#user', user);
      await this.page.fill('#pass', pass);
      await this.page.click('button[type=submit]');
    }
  }
  ```

### Fixtures

- Використовуйте test.use/fixtures для спільної підготовки (логін, дані).
- Приклад:
  ```ts
  test.use({ storageState: 'state.json' });
  ```

## Best Practices

- Уникайте hardcode: використовуйте config, .env, testData.
- Додавайте перевірки (expect) після кожної важливої дії.
- Використовуйте retries для нестабільних тестів (але краще стабілізувати).
- Зберігайте скріншоти/відео для фейлів (налаштуйте у config).
- Додавайте теги до тестів для гнучкого запуску (test.describe.configure({ tag: 'smoke' })).
- Пишіть atomic тести: один тест — один сценарій.
- Використовуйте beforeEach/afterEach для підготовки та очистки.
- Не змішуйте UI та API тести в одному файлі.
- Додавайте коментарі до складних кроків.

## Приклади корисних патернів

- Data-driven tests (масив даних + test.each)
- Custom test steps (test.step)
- Моки/заглушки для API (page.route)

## Додатково

- Регулярно оновлюйте Playwright та залежності.
- Використовуйте CI для автоматичного запуску тестів.
- Ведіть changelog для тестової інфраструктури.

---

_Цей документ допоможе підтримувати якість та масштабованість тестів на Playwright._
