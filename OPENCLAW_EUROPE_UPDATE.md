# OpenClaw：歐洲航班 2026 年 9–12 月完整更新

## 任務

依序更新使用者指定的 14 個歐洲機場、各機場已知可飛的中國籍航空公司，以及所有：

- 出發日：2026-09-01 至 2026-12-31
- 旅遊天數：8、9、10 天
- 每完成一個目的地就 export、commit、push
- 全程使用 headless Chrome，不搶走桌面焦點

保留機場：`BCN`、`MAD`、`BER`、`FRA`、`MUC`、`CDG`、`FCO`、`MXP`、`VCE`、`AMS`、`VIE`、`BRU`、`ATH`、`BUD`。

總計 12,444 個日期／天數／航空公司組合，可能需要十多小時至一整天。不要因為長時間沒有完成而中止。

## 執行步驟

```bash
cd /Users/bct-barney/Documents/GoogleFlight
git pull --ff-only
chmod +x scan-europe-2026-sep-dec.sh
caffeinate -i ./scan-europe-2026-sep-dec.sh
```

只執行上面的專用腳本；不要另外執行 `update.sh`。

## 中斷與續跑

腳本會把最後完成並 push 的目的地寫入 `.europe-scan-progress`。如果 Chrome、網路或程序中斷，修正問題後直接重新執行同一條命令：

```bash
caffeinate -i ./scan-europe-2026-sep-dec.sh
```

它會從下一個尚未完成的目的地繼續。正在處理到一半的目的地會重新進入，但掃描器會略過當天已成功完成的組合。

不要刪除 `.europe-scan-progress`，除非使用者明確要求從馬德里重新開始整批更新。

## 完成條件

看到：

```text
All Europe destinations completed and pushed
```

然後確認：

```bash
git status --short
git log -5 --oneline
git push
```

`git status --short` 應沒有 tracked file 變更；最後一次 `git push` 應顯示已同步。回報使用者已完成、最後一個 commit SHA，以及失敗／無航班數量。不要修改前端程式或其他專案資料。
