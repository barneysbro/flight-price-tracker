# tw.trip.com 台北－曼谷機票搜尋器

- 網頁：http://127.0.0.1:43173
- 航線：TPE → BKK / DMK
- 來源：https://tw.trip.com/
- 條件：直飛、tw.trip.com 標示 `FREE_CHECKED_BAGGAGE`
- 人數：2 位成人、經濟艙
- 快取：台灣日期跨日後重新搜尋

```bash
npm install
npm start
node scan.mjs 2026-10-01 2026-10-31 5,6 BKK
```

tw.trip.com 列表價格是每人來回價；CSV 的 `total_twd` 會乘以 2，保存兩人總價。tw.trip.com 要選擇去程後才顯示配套回程，因此目前 CSV 的回程欄會標示「選擇去程後由 Trip.com 確認」。
