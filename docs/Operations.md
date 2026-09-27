# 本番環境の起動手順

Docker Compose で Passdown を起動する手順。コマンドはリポジトリのルートで実行する。

## 初回起動

1. `docker/.env.example` を `docker/.env` にコピーし、MCP クライアントが接続に使う実際のホスト名に書き換える。`PASSDOWN_MCP_ALLOWED_HOSTS` は必須で、カンマ区切りで複数指定できる。接続に使わないホスト名は含めない。

   ```sh
   cp docker/.env.example docker/.env
   ```

   `passdown.example.internal` は記入例なので、実際の接続先に置き換える。ホスト名または IP アドレスだけを指定し、ポート番号は含めない。

2. Compose の設定を確認し、イメージをビルドして起動する。

   ```sh
   docker compose -f docker/compose.prod.yaml config -q
   docker compose -f docker/compose.prod.yaml up -d --build
   docker compose -f docker/compose.prod.yaml logs passdown
   ```

   サーバーは起動時に未適用のマイグレーションを適用し、成功してからポート 3000 で待ち受ける。失敗した場合はサーバーを開始しないため、ログで原因を確認する。

3. 初回のオーナーアカウントを対話的に作成する。

   ```sh
   docker compose -f docker/compose.prod.yaml exec passdown passdown account create
   ```

   ログイン名、表示名、パスワードを入力する。パスワードを忘れた場合は `passdown account reset-password` を同じ方法で実行する。

4. ブラウザで `http://<ホスト>:<公開ポート>/login` を開いてログインする。Web UI の Settings で agent Actor とトークンを作成し、内部ネットワークのエージェントから `http://<ホスト>:<公開ポート>/mcp` に Bearer トークンで接続する。`<公開ポート>` は `PASSDOWN_PORT` の値（未設定なら 3000）。

## 設定とデータ

- `PASSDOWN_MCP_ALLOWED_HOSTS` は 必須。未設定または空なら起動しない。
- `docker/.env.example` には本番 Compose で変更できる設定を列挙している。必要な項目だけ `docker/.env` でコメントを外して設定する。バックアップの保持世代・間隔、保存先、起動モードも変更できる。
- `PASSDOWN_PORT` は Compose ではホスト側の公開ポートを変える（既定は 3000）。コンテナ内の `PASSDOWN_HOST=0.0.0.0` と `PASSDOWN_PORT=3000` は固定する。
- `PASSDOWN_DATA_DIR` は named volume のコンテナ内マウント先を変える（既定は `/data`）。DB とバックアップの保存先を省略すると、そのマウント先の `passdown.sqlite3` と `backups` を使う。個別に `PASSDOWN_DB_PATH` や `PASSDOWN_BACKUP_DIR` を指定する場合も、データが named volume に残るようマウント先の中を指定する。
- マウント先を変えたら `docker compose -f docker/compose.prod.yaml up -d --build` でイメージを再ビルドしてからコンテナを再作成する。named volume の名前は変わらない。

## 更新と停止

イメージを更新したら、次のコマンドで再ビルドして起動する。マイグレーションは起動時に適用される。

```sh
docker compose -f docker/compose.prod.yaml up -d --build
```

停止するときは次を実行する。`down` は named volume を削除しない。

```sh
docker compose -f docker/compose.prod.yaml down
```

バックアップと復元の操作は[バックアップからの復元手順書](Backup_Operations.md)を参照する。
