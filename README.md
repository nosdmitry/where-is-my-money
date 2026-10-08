# Where Is My Money

Telegram-бот для учёта домашних расходов семьи. Помогает контролировать,
куда уходят деньги, и следить за лимитами по категориям.

## Что умеет

- **Администратор** создаёт бюджет на месяц, задаёт общий лимит и распределяет
  его по категориям (Продукты, Коммуналка, Кружки и т.д.).
- **Все участники** вносят свои траты, выбирая категорию.
- Лимиты по категориям уменьшаются автоматически.
- Остатки, отчёт, история трат доступны в любой момент.
- Остаток между категориями живёт в «Свободных средствах».
- Все участники получают уведомление, когда лимит категории исчерпан.
- Прошлые месяцы архивируются и остаются доступны для просмотра.
- Экспорт трат в CSV.

## Стек

- **Node.js 22** + **TypeScript** (ESM)
- **grammY** — фреймворк для Telegram-ботов
- **SQLite** (WAL) + **Drizzle ORM**
- **Zod**, **pino**, **node-cron**
- Деплой: **Docker** + **GitHub Actions** + **GitHub Container Registry**

## Архитектура

```
src/
├── bot/              # grammY: команды, callback'и, wizard'ы, тексты, клавиатуры
├── services/         # бизнес-логика (household, budget, category, transaction, invite, report)
├── db/               # Drizzle: схема, клиент, миграции
├── domain/           # типы, константы, ошибки
├── utils/            # деньги, даты, парсинг
├── config/           # env, logger
└── index.ts          # точка входа
```

**Правила слоёв:**

- `bot` не работает с БД напрямую — только через `services`.
- `services` не знает про Telegram.
- Вся валидация входа — в `services` через Zod.
- Деньги — целые числа в рублях.

## Локальный запуск

### 1. Требования

- Node.js 22+
- npm 10+
- Токен бота от [@BotFather](https://t.me/BotFather)

### 2. Установка

```bash
git clone git@github.com:nosdmitry/where-is-my-money.git
cd where-is-my-money
npm install
```

### 3. Конфигурация

Скопируй `.env.example` в `.env` и заполни:

```bash
cp .env.example .env
```

```env
NODE_ENV=development
BOT_TOKEN=токен_из_botfather
DATABASE_PATH=./data/budget.db
LOG_LEVEL=info

# Опционально: SOCKS5-прокси для разработки (если Telegram недоступен напрямую)
# SOCKS_PROXY_URL=socks5://127.0.0.1:10808
```

### 4. Миграции

```bash
npm run db:migrate
```

### 5. Запуск

```bash
npm run dev
```

Бот запустится в режиме polling. Отправь `/start` в Telegram.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Запуск с hot-reload через tsx |
| `npm run build` | Компиляция TS в `dist/` |
| `npm start` | Запуск собранного приложения |
| `npm run typecheck` | Проверка типов без сборки |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint с автоисправлением |
| `npm run format` | Prettier |
| `npm run db:generate` | Сгенерировать миграцию по изменениям схемы |
| `npm run db:migrate` | Применить миграции |
| `npm run db:studio` | Drizzle Studio (визуальный редактор БД) |

## Деплой

Деплой полностью автоматический через GitHub Actions.

### Как это работает

1. Ты пушишь в `main`.
2. GitHub собирает Docker-образ.
3. Образ пушится в `ghcr.io/nosdmitry/fb-bot`.
4. GitHub заходит по SSH на VPS, тянет образ, пересоздаёт контейнер.

### Настройка (один раз)

**1. SSH-ключ для деплоя.** На локальной машине:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/fb-bot-deploy
ssh-copy-id -i ~/.ssh/fb-bot-deploy.pub -p 3333 root@176.126.162.26
```

**2. Секреты в GitHub.** Открой
[Settings → Secrets and variables → Actions](https://github.com/nosdmitry/where-is-my-money/settings/secrets/actions)
и добавь:

| Имя | Значение |
|---|---|
| `VPS_HOST` | `176.126.162.26` |
| `VPS_PORT` | `3333` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Содержимое `~/.ssh/fb-bot-deploy` |

**3. Подготовка VPS.** Установить Docker и Compose V2, создать `/opt/fb-bot`:

```bash
mkdir -p /opt/fb-bot/data /opt/fb-bot/backups
nano /opt/fb-bot/.env
chmod 600 /opt/fb-bot/.env
```

`.env` на VPS:

```env
NODE_ENV=production
BOT_TOKEN=токен_из_botfather
DATABASE_PATH=/app/data/budget.db
LOG_LEVEL=info
```

`docker-compose.yml` в `/opt/fb-bot/`:

```yaml
services:
  bot:
    image: ghcr.io/nosdmitry/fb-bot:latest
    container_name: fb-bot
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
      - ./backups:/app/backups
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**4. Сделать образ публичным.** После первого успешного запуска workflow
открой [Packages](https://github.com/nosdmitry?tab=packages) → `fb-bot` →
Package settings → Change visibility → Public.

### Обновление

```bash
git push origin main
```

Всё. Прогресс — во вкладке [Actions](https://github.com/nosdmitry/where-is-my-money/actions).

### Ручной перезапуск на VPS

```bash
ssh -p 3333 root@176.126.162.26
cd /opt/fb-bot
docker compose pull
docker compose up -d --force-recreate
docker logs -f fb-bot
```

## Бэкапы

SQLite-БД лежит в `/opt/fb-bot/data/budget.db` на VPS. Раз в сутки
создаётся бэкап в `/opt/fb-bot/backups/`, старые (старше 30 дней)
удаляются.

Скрипт `/opt/fb-bot/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/opt/fb-bot/backups"
DATE=$(date +%F)
sqlite3 /opt/fb-bot/data/budget.db ".backup '$BACKUP_DIR/budget-$DATE.db'"
find "$BACKUP_DIR" -name 'budget-*.db' -mtime +30 -delete
```

Cron:

```
0 4 * * * /opt/fb-bot/backup.sh >> /var/log/fb-bot-backup.log 2>&1
```

## Структура БД

| Таблица | Назначение |
|---|---|
| `users` | Пользователи Telegram |
| `households` | Семейные бюджеты (один пользователь — один household) |
| `memberships` | Привязка пользователя к household и роль |
| `budget_periods` | Месячные периоды бюджета |
| `categories` | Категории трат, включая системную «Свободные средства» |
| `transactions` | Записи о расходах |
| `invites` | Одноразовые ссылки-приглашения |

## Бизнес-правила

- Период — календарный месяц.
- Остатки между месяцами не переносятся.
- Превышение лимита категории разрешено, но с предупреждением.
- Учитываются только расходы (доходы не вводятся).
- Один пользователь — один household.
- Роли: `admin` (владелец) и `member`.
- Удалять транзакции может только админ.
- Удаление категории с тратами запрещено — только архивация.
- Прошлые периоды архивируются и доступны только для чтения.

## Лицензия

MIT