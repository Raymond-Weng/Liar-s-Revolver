# Liar's Revolver 🔫

模擬 Liar's Bar 的左輪手槍：6 發彈巢、1 發實彈，扣下扳機看你的運氣。

**▶ [gun.raymondweng.dev](https://gun.raymondweng.dev)**

## 玩法

- 每次裝填隨機決定實彈位置
- 扣扳機後轉到下一格、**不重新轉輪**，中彈機率逐發上升：1/6 → 1/5 → … → 1/1
- 遊戲中的「重新裝填」要按住約 0.8 秒；中彈後的「重新裝填」前 1 秒不能按（防誤觸）
- 重新整理或關掉再開，會接著上一局
- 桌機快捷鍵：`Space` / `Enter` 扣扳機；中彈後 `Space` / `Enter` / `R` 重新裝填

## 特色

- 純靜態網站，無 build 步驟、無相依套件
- 隨機數用 `crypto.getRandomValues`
- 音效用 Web Audio 即時合成，不需要音檔；Android 會震動，iPhone 改用畫面震動與閃光
- PWA：可離線使用，可加入主畫面當 App 開
- 遊戲中不自動熄屏：優先用 Screen Wake Lock API，舊版 iOS 退回播放隱藏的無聲迴圈影片

> iPhone 記得關掉靜音開關才聽得到槍聲。

## 檔案

```
index.html            頁面
style.css             樣式
app.js                遊戲邏輯、音效、防熄屏
sw.js                 Service Worker（離線快取）
manifest.webmanifest  PWA 設定
icons/                App 圖示（180 / 192 / 512）與分享預覽圖 og.png
_headers              Cloudflare Pages 的 HTTP header
```

## 開發

```bash
python3 -m http.server 8000
```

打開 <http://localhost:8000>。改完要讓已安裝的使用者拿到新版，記得把 `sw.js` 的 `CACHE` 版本號加一。

## License

[MIT](LICENSE)
