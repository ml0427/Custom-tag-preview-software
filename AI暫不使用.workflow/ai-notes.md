# AI Notes

## 2026-05-25 v0.112 Tauri dev loads stale UI

- Symptom: `npm run tauri:dev` still displayed the old file-health UI with duplicate detection even though `FileHealthView.vue` had been updated.
- Finding: Vite served the updated `FileHealthView.vue` from `http://127.0.0.1:5173`, but the default `localhost` setup could bind to IPv6 `::1` on Windows. WebView2/Tauri could then miss the live dev server and appear to load stale `dist` content.
- Fix: Pin Vite dev to `127.0.0.1:5173`, update Tauri `devUrl` to the same IPv4 loopback address, and allow `127.0.0.1:5173` in CSP.
- Verification: `npm run build` passed. `npm run tauri:dev` started Vite at `http://127.0.0.1:5173/`, launched `src-tauri/target/debug/app.exe`, and `FileHealthView.vue` from the dev server contained the test title while not containing `重複檔案偵測`.
