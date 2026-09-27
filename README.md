# passdown

passdown は、人間と AI エージェントが Task を通じて、同じデータと文脈を共有して作業するためのタスク協働基盤です。オーナーは Web UI、エージェントは MCP を使って同じ Task を扱えます。変更は Actor と Activity に記録され、誰が・いつ・何を変えたかを確認できます。

現在は要件定義 v1 とアーキテクチャ設計に基づいて実装を進めています。

## 主な機能

- Inbox に思いつきを取り込み、Project・Task・Document に整理
- Project に作業の目的と指示、関連する Task・Document をまとめる
- Task の担当、親子関係、状態、コメント、レビューを管理
- エージェントが MCP から担当 Task と作業の文脈を取得し、進捗と結果を記録
- Web UI でエージェントの権限と API トークンを管理
- SQLite への保存とバックアップ

機能の範囲と利用シナリオは[要件定義書 v1](docs/Requirements.md)を参照してください。

## 起動方法

Docker と Docker Compose が必要です。以下のコマンドはリポジトリのルートで実行します。

1. 設定ファイルを作成し、`PASSDOWN_MCP_ALLOWED_HOSTS` を実際に MCP クライアントが接続するホスト名または IP アドレスに変更します。値にはポート番号を含めません。

   ```sh
   cp docker/.env.example docker/.env
   ```

2. イメージをビルドして起動します。

   ```sh
   docker compose -f docker/compose.prod.yaml up -d --build
   ```

3. オーナーアカウントを対話形式で作成します。

   ```sh
   docker compose -f docker/compose.prod.yaml exec passdown passdown account create
   ```

4. `http://<ホスト>:<公開ポート>/login` を開いてログインします。公開ポートは既定で `3000`、`PASSDOWN_PORT` で変更できます。エージェント用の Actor とトークンは Web UI の Settings で作成し、MCP クライアントから `http://<ホスト>:<公開ポート>/mcp` に Bearer トークンで接続します。

起動設定、更新、停止については[本番環境の起動手順](docs/Operations.md)、バックアップと復元については[バックアップからの復元手順書](docs/Backup_Operations.md)を参照してください。

## 開発

開発作業はコンテナ内で行います。初回は次の順に実行します。

```sh
docker compose -f docker/compose.dev.yaml build
docker compose -f docker/compose.dev.yaml run --rm --no-deps passdown npm ci
docker compose -f docker/compose.dev.yaml up -d
```

初めてログインするときは、オーナーアカウントを作成します。

```sh
docker compose -f docker/compose.dev.yaml exec passdown passdown account create
```

Web UI は `http://localhost:5173`、サーバーは `http://localhost:3100` で起動します。サーバーの公開ポートは `PASSDOWN_DEV_PORT`、Web UI の公開ポートは `PASSDOWN_WEB_PORT` で変更できます。開発環境の DB とバックアップは `data/` に保存されます。

検証コマンドもコンテナ内で実行します。

```sh
docker compose -f docker/compose.dev.yaml exec passdown npm run typecheck
docker compose -f docker/compose.dev.yaml exec passdown npm run lint
docker compose -f docker/compose.dev.yaml exec passdown npm test
```

## ドキュメント

- [要件定義書 v1](docs/Requirements.md) — 目的、利用シナリオ、機能の範囲
- [アーキテクチャ設計書](docs/Architecture.md) — 構成と設計判断
- [本番環境の起動手順](docs/Operations.md) — 設定、起動、更新、停止
- [バックアップからの復元手順書](docs/Backup_Operations.md) — バックアップと復元

## ライセンス

[MIT License](LICENSE)
