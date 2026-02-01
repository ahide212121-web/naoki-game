# Cyber Tennis Online

オンライン対戦ができるテニスゲームです。

## 技術スタック
- フロントエンド: HTML5 Canvas, Vanilla JS, Vite
- バックエンド: Node.js, Express, Socket.io
- デザイン: Cyberpunk/Neon Style (CSS)

## 実行方法

1. 依存関係のインストール
   ```bash
   npm install
   ```
   ※ 初回のみ実行してください。すでに環境構築済みの場合は不要です。

2. サーバーの起動 (バックエンド)
   新しいターミナルを開き、以下のコマンドを実行します。
   ```bash
   node server/index.js
   ```

3. ゲームの起動 (フロントエンド)
   別のターミナルで以下のコマンドを実行します。
   ```bash
   npm run dev
   ```

4. ブラウザでアクセス
   `http://localhost:5173` を開きます。
   対戦するには、別のタブまたは別のウィンドウで同じURLを開いてください（2人揃うとゲームが始まります）。

## 操作方法
- マウス移動: パドルの操作
