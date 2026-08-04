# Flight Price Tracker

同一份前端支援兩種模式：

- 本機 Node.js：可執行 Chrome/Puppeteer 搜尋及篩選。
- GitHub Pages：只讀取最新 JSON，手機可篩選、排序及開啟訂票網站。

## 本機網址

| 網頁 | 網址 |
|---|---|
| 歐洲 | http://127.0.0.1:43170 |
| 曼谷 Google Flights | http://127.0.0.1:43171 |
| 日本 | http://127.0.0.1:43172 |
| 曼谷 Trip.com | http://127.0.0.1:43173 |

各專案內執行 `npm start` 即可開啟本機模式。

## 更新價格

`watchlist.tsv` 是定時掃描清單。修改後執行：

```bash
./update.sh
```

它會依序掃描、產生四份 `public/data/results.json`、commit 並 push。鎖定目錄會避免兩次排程重疊。

如果 OpenClaw agent 已自行完成掃描，只需輸出及上傳：

```bash
./update.sh --publish-only
```

## 靜態網站測試

```bash
for project in EuropeFlights JapanFlights ThailandFlights ThailandTripFlights; do
  (cd "$project" && npm run export)
done
node build-site.mjs
python3 -m http.server 43200 --directory site
```

開啟 http://127.0.0.1:43200 。

## GitHub Pages

`.github/workflows/pages.yml` 會在 `main` 更新時建立並部署：

- `/europe/`
- `/japan/`
- `/bangkok/`
- `/bangkok-trip/`

CSV 歷史、Chrome profile、log、PID 及 `node_modules` 不會上傳。
