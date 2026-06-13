# Деплой Justify-showcase на Hetzner (Ubuntu)

## Что мне нужно от тебя, чтобы я сделал всё сам по SSH
1. **IP сервера** + SSH-доступ: либо `root@IP` + приватный ключ (путь к файлу), либо пароль.
2. **Домен** (СИЛЬНО рекомендуется): A-запись на IP. Почему важно — Dynamic login и World ID/passkeys требуют **secure context (HTTPS)**; по голому `http://IP` логин может не работать. С доменом я поставлю Let's Encrypt.
   - Если домена нет — подниму на http://IP:3000, но залогиниться может не дать (браузер блокирует passkeys вне HTTPS).
3. Подтверждение, что секреты (ключи фаусета/ENS-owner, ANTHROPIC_API_KEY, World ID signing key) можно залить в `.env` на сервере.

## Что я сделаю (автоматически)
1. Поставлю Node 22, nginx, pm2, certbot.
2. Залью app (tar без node_modules/.next) → `npm ci` → `npm run build`.
3. Запущу `next start` на :3000 под pm2 (автозапуск).
4. nginx reverse-proxy домен → :3000 + Let's Encrypt SSL.
5. Подниму `.env` из локального `.env.local` (секреты).

## Что нужно поправить в дашбордах ПОСЛЕ деплоя (иначе логин/виджеты не заведутся)
- **Dynamic** (app.dynamic.xyz → твой env): добавить `https://<домен>` в **Allowed Origins (CORS)**. Без этого login падает.
- **World ID** (developer.world.org): убедиться, что app в staging — симулятор работает с любого origin; RP-подпись серверная, домен не критичен.
- (Опц.) **NEXT_PUBLIC_*** уже вшиты в билд — если меняешь env id, нужен пересборка.

## Известные ограничения на сервере (Linux)
- **CRE-запуск из UI** (`/api/cre-run`, кнопка на /market/1) шеллит `cre.exe` (Windows) — на Linux не заработает без установки Linux-бинаря `cre` + `bun` + `cre login`. На демо: оставляем **захваченный CRE-лог** (он уже в `cre-sim-log.txt`, показывается); кнопка просто отдаст ошибку/старый лог. Если нужен живой запуск на сервере — отдельно поставлю Linux cre+bun и сделаю `cre login` (интерактив).
- Файловые сторы (agents/feed/social/...) живут на диске сервера — для демо ок.
- Фаусет Arc (~17 USDC) ограничен — на массовую аудиторию добей через faucet.circle.com заранее.

## Команды (я выполню по SSH; здесь для прозрачности)
```bash
# на сервере (Ubuntu 24.04)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
sudo npm i -g pm2
# залить app/, затем:
cd /opt/justify && npm ci && npm run build
pm2 start "npm run start" --name justify && pm2 save && pm2 startup
# nginx: proxy_pass http://127.0.0.1:3000; затем:
sudo certbot --nginx -d <домен>
```
