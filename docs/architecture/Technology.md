# 技術スタック

[設計書の入口](../Architecture.md)に戻る。章・節番号は分割前の設計書から維持している。

<a id="section-2"></a>

## 2. 技術スタック

| 領域 | 採用 |
|---|---|
| 言語 | TypeScript（Node.js） |
| Web フレームワーク | Hono |
| データストア | SQLite |
| SQLite ドライバー | better-sqlite3 |
| テーブルの定義・SQL | Drizzle ORM（drizzle-kit） |
| MCP | 公式 TypeScript SDK v2（`@modelcontextprotocol/server`、`@modelcontextprotocol/hono`） |
| フロントエンド | React の SPA（Vite でビルド） |
| REST API の呼び出し | Hono RPC（`hono/client`） |
| サーバーのデータの取得・更新 | TanStack Query |
| ルーティング（Web UI） | React Router |
| スタイル | Tailwind CSS |
| Markdown の表示 | react-markdown ＋ remark-gfm |

<a id="section-2-1"></a>

### 2.1 データストア: SQLite

- 要件定義書 10章の「軽量運用を優先」「1コンテナで動かす」「高負荷は想定しない」に合わせる。アプリに組み込むため、DB のプロセスを別に動かさない
- バックアップは DB のファイル単位で行える。テストはインメモリ DB で速く分離できる
- 書き込みは同時に1つに限られるが、人間1人＋エージェント数体の規模では、楽観ロックと短いトランザクションで足りる
- 日本語の部分一致検索は、全文検索を使わず LIKE で実現する（[検索](Search.md#section-3)）
- SQLite は日時・JSON の型が緩いため、日時の形式（JST（+09:00）の ISO8601）はアプリ側で統一する

<a id="section-2-2"></a>

### 2.2 バックエンド: TypeScript（Node.js）、Hono、better-sqlite3

- MCP の公式 SDK の中で TypeScript 版が基準の実装で、最も成熟している
- 業務ロジック・REST API・MCP・Web UI を1つの言語で揃え、入力の検証（zod）と型を共有する。状態を変えるときの必須の入力などを「Web UI・MCP で同じルールにする」（要件定義書 6.3）ため
- Hono は軽量で、MCP SDK に公式のアダプタがある
- better-sqlite3 は SQLite を同梱していて、新しい版の SQLite を使える。同期的に動くため、途中に await が入らず、親 Task の連動や子孫のまとめての cancel を1つのトランザクションに収めやすい

<a id="section-2-3"></a>

### 2.3 MCP: 公式 SDK v2 をステートレスで使う

- `createMcpHandler` を使い、セッションを持たずに、リクエストのたびにサーバーを作る
- ツールは、リクエストのたびに、認証した agent Actor の権限に合うものだけを登録する。これで、権限外のツールを表示しない（F-AUTH-04）。権限を変えると、次のリクエストから反映される
  - 登録するツールが1つもない Actor には、SDK が tools の機能自体を宣言しないため、`tools/list` はエラーになる。表示するツールがないことに変わりはないため、問題にしない
- ツールの説明は MCP の層（`mcp/descriptions.ts`）に、操作の名前ごとに書く。`routes` に `'mcp'` を含む操作に説明がなければ、登録のときにエラーにする
- `create_document`・`update_document` の説明文には、ツールを登録するときに document モジュールの関数で既存のタグの一覧を読んで入れる（要件定義書 F-DOC-02）。エージェントが既存のタグを見てから付けられるようにするため
- SDK はトークンを検証しないため、SDK の手前に置いた自前のミドルウェアで Bearer トークンを検証し、Actor を `authInfo`（`extra.actor`）として SDK に渡す。トークンが無い・無効なら、SDK に渡さずに 401 を返す
- 認証は MCP のリクエストごとに行う。Actor の削除前に認証が成功したリクエストは、業務操作の開始前にその Actor が削除されても実行を許す。業務操作の開始時に Actor の active を再確認する処理は追加しない。削除後に届いた次のリクエストは認証で拒否する。例えば、タスク更新のリクエストの認証後に Actor が削除された場合、その更新は許可するが、その後のタスク読み取りのリクエストは拒否する。認証の許可を次のリクエストに引き継がない
- プロトコルは 2026-07-28 版と 2025 年版の両方を受ける（SDK の既定）
  - 2025 年版のクライアントがサーバーからの通知用のストリーム（GET）を開こうとすると 405 を返すが、passdown には通知を送る要件がないため問題にしない
- `createMcpHonoApp` の `allowedHosts`・`allowedOrigins` を必ず設定する。既定の `127.0.0.1` バインドなら Host・Origin を localhost 系で検証するが、コンテナでは `0.0.0.0` にバインドするためこの既定が外れる（[技術スタック「コンテナとデプロイ」](Technology.md#section-2-9)）
- MCP を別のプロセス・ポートには分けない

<a id="section-2-4"></a>

### 2.4 フロントエンド: React の SPA

- Vite でビルドした静的ファイルを、バックエンドの Hono から配信する
- REST API は Web UI 専用で、ログインした人間だけが使う。検索エンジン向けの描画や初回表示の速さは要らないため、SSR は使わない
- REST API は Hono RPC で呼び、サーバーのルートと zod の検証から推論した型をそのまま使う
- サーバーのデータの取得・更新は TanStack Query で揃える（更新後の再取得、読み込み中・エラー・楽観ロックの競合の扱い）
- すべての画面を PC とスマホの幅で使えるようにする（要件定義書 9.2）。スタイルは Tailwind CSS で書く
- Document の Markdown は react-markdown ＋ remark-gfm で表示する。生の HTML は描画しない

<a id="section-2-5"></a>

### 2.5 テーブルの定義・SQL: Drizzle ORM

- テーブルの定義は Drizzle の TypeScript（`sqliteTable`）で書き、SQL の `CREATE TABLE` は手で書かない。クエリも Drizzle の書き方で書く
- better-sqlite3 と組み、クエリもトランザクションも同期で使う（`db.transaction((tx) => { ... })` に同期の関数を渡す）。途中に await を挟まない
- 検索の `LIKE ... ESCAPE '\'` のように Drizzle の関数で書けない部分だけ、Drizzle の `sql` テンプレートで書く。値は必ずテンプレートの埋め込み（パラメータ）で渡し、文字列の連結で SQL を組み立てない
- テーブル同士の関係から関連をまとめて取る機能（relational queries）は、同じモジュールのテーブルの間でだけ使う（[ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5)）
- 使う版は 0.45 系（安定版）。v1 系を採らない理由は [技術スタック「開発環境の道具」](Technology.md#section-2-8)

<a id="section-2-6"></a>

### 2.6 マイグレーション

スキーマの変更は、drizzle-kit が生成した SQL を、通常モードでのプロセス起動時に適用する。復元待機モードでは DB を開かず、マイグレーションも実行しない。

```
通常起動 → DB ファイルのコピーを残す → 未適用のマイグレーションを適用 → サーバーを開始
                                     失敗 → ログを出して異常終了（サーバーは開始しない）
```

- 適用はプロセスの起動処理で行い、成功したときだけサーバーを開始する。失敗したまま古いスキーマで動かさないため
- 適用の前に、SQLite のファイルを日時付きでコピーして残す。SQLite では列挙値の変更などがテーブルの作り直しになり（[テーブル設計「全テーブル共通の決まり」](Database.md#section-5-1)）、失敗や想定外の結果のときに、変更の直前の断面から戻せるようにするため。置き場所と残す数は [技術スタック「バックアップと復元」](Technology.md#section-2-7) のとおり
  - コピーは日次のバックアップ（[技術スタック「バックアップと復元」](Technology.md#section-2-7)）と同じく SQLite のオンラインバックアップ API（better-sqlite3 の `db.backup()`）で取る。前回のプロセスの `-wal` に残った変更も含めた、一貫した断面になるため。非同期のコピーが完了してからマイグレーションを適用する
  - コピーを残すのは、未適用のマイグレーションがあり、かつ DB にテーブルがあるときだけ。起動のたびに残すと、世代の上限（5）で変更の直前の断面が押し出されるため。初回の起動（空の DB）は戻す先がないため残さない
- 適用はマイグレーションごとではなく、未適用のものをまとめて1つのトランザクションで行う。Drizzle の生成SQLと適用履歴形式を使い、テーブル再構築時の外部キー検査もコミット前に行う（[テーブル設計「Actor」](Database.md#section-5-2)）。途中で失敗したら、どれも適用されない
- 適用済みかどうかは drizzle-kit の管理テーブルが持つ。適用の記録は Activity に書かない。業務のデータの変更ではないため（要件定義書 6.6）
- プロセスは1つのため（[全体構成](../Architecture.md#section-1)）、適用が同時に走ることはない。排他の仕組みは持たない
- 実装の間は、マイグレーションの SQL を作らず `drizzle-kit push` でスキーマを当て、開発用の DB は必要になったら作り直す。マイグレーションの置き場所（`drizzle/`）がなければ、起動処理は適用を飛ばす。v1 を出す時点のスキーマから最初のマイグレーション（`0000`）を1本だけ生成し、以降は変更のたびに生成してリポジトリに入れる
  - 設計が動く間は、途中の差分の SQL を残しても読み返す相手がいない。守るべきデータが入るのは v1 を出した後のため

<a id="section-2-7"></a>

### 2.7 バックアップと復元

要件定義書 10章の「DB の日次バックアップをアプリ内で自動作成し、復元手順を持つ」を満たす。

- アプリのプロセスの中で、SQLite のオンラインバックアップ API（better-sqlite3 の `db.backup()`）を使って DB を1つのファイルに書き出す。動かしたまま一貫した断面を取れ、`-wal`・`-shm` を一緒にコピーする必要がない。コピーを分割して進められるため、実行中のリクエストを長時間止めずに済む
- 前回の日次バックアップから24時間以上経過したかを、リクエスト時に確認する。確認は既定で1時間に1回までとし、バックアップがなければ最初のリクエストで作る。固定時刻の定期実行は行わず、プロセスの停止中やリクエストがない間は作成しない。再開後のリクエストで条件を満たせば作成する
- 置き場所は `/data/backups`（DB と同じデータ領域の中。[技術スタック「コンテナとデプロイ」](Technology.md#section-2-9)）。ファイル名は `passdown-<日時>.sqlite3`
- マイグレーションの前に残すコピー（[技術スタック「マイグレーション」](Technology.md#section-2-6)）も同じディレクトリに置き、`before-migration-<日時>.sqlite3` の名前にする
- 残す数は、日次を14世代、マイグレーションの前を5世代とする。超えたら古いものから消す
- 復元では既存 Deployment の通常 Pod を完全に停止し、同じデータ領域をマウントした復元待機 Pod に入れ替える。待機 Pod で運用者が `passdown backup list` と `passdown backup restore <日時ID>` を一度だけ実行し、待機 Pod の終了を確認してから通常起動に戻す。一時的な別 Deployment・Job・Pod は作らない。通常 Pod と待機 Pod が重ならない切り替え方、GitOps による再適用への対応はデプロイ構成に合わせて決める。通常のローリング更新で DB を触る Pod を重ねない。手順は [バックアップからの復元手順書](../Backup_Operations.md) に書く
- `backup restore` はバックアップを復元先と同じディレクトリの一時ファイルにコピーし、そのコピーを SQLite の読み取り専用接続で `quick_check` する。検査後に現在の DB と存在する `-wal`・`-shm` を退避し、検査済みコピーを配置する。復元先 DB への接続は開かない。通常起動に戻した際、未適用のマイグレーションは自動で当たる
- 別のマシンへの転送・暗号化は持たない。外部への送信の経路を作らない方針（要件定義書 10章）のため、ボリュームごとの保全は運用に任せる
- バックアップの実行は Activity に記録しない。業務のデータの変更ではないため（要件定義書 6.6）

<a id="section-2-8"></a>

### 2.8 開発環境の道具

| 道具 | 採用 |
|---|---|
| パッケージマネージャー | npm |
| Drizzle の版 | 0.45 系（`drizzle-orm` 0.45.2 / `drizzle-kit` 0.31.10） |
| lint | ESLint ＋ typescript-eslint ＋ eslint-plugin-boundaries |
| 整形 | Biome の formatter |
| テスト | Vitest |
| 開発時のサーバーの起動 | tsx（`npm run dev:server`） |
| TypeScript の版 | 6.0 系 |
| Node の版 | 22 以上（better-sqlite3 13 の `engines` が `node >= 22`。コンテナで使う版は別途決める） |

#### パッケージマネージャー: npm

- サーバーと Web UI は1つのパッケージ（[ソフトウェアの構成「リポジトリの構成」](Software.md#section-4-8)）のため、ワークスペースが要らない。Node に同梱で、コンテナのビルドに手順を足さずに済む
- `bun install`（ランタイムは Node のまま）にすればインストールとスクリプトの起動は速くなる。ただし、パッケージマネージャーの入れ替えは lockfile を作り直すだけで、コードは変わらない。コンテナのビルドの時間が実際に苦になったときに、測って乗り換える
- ランタイムを bun にすることは採らない。`bun:sqlite` を使うことになり、better-sqlite3 を選んだ理由（同期で動くため、親 Task の連動やまとめての cancel を1つのトランザクションに収めやすい。[技術スタック「バックエンド: TypeScript（Node.js）、Hono、better-sqlite3」](Technology.md#section-2-2)）を検証し直すことになる。得られるのは起動の速さだが、常駐するプロセスは1つ（[全体構成](../Architecture.md#section-1)）で起動は1日に数回のため効かない

#### Drizzle の版: 0.45 系

- 2026-09-16 の時点で、`latest` は 0.45.2（2026-03-27 公開）。v1 系は `1.0.0-beta.1` が 2025-11-03、`1.0.0-rc.1` が 2026-04-30、`rc.4` が 2026-06-27 と、約10か月 beta / RC が続いていて GA していない
- drizzle-kit はマイグレーションを生成する道具で、v1 を出した後は守るべきデータが入る（[技術スタック「マイグレーション」](Technology.md#section-2-6)）。生成の道具は枯れている方を採る
- v1 が GA したら移行を検討する。クエリは操作の関数の中にあり（[ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5)）、テーブルの定義は各モジュールの `schema.ts` に閉じている（D-94）ため、影響の範囲を特定できる

#### lint: ESLint ＋ eslint-plugin-boundaries

lint で守る規則は、次の5つと、[ソフトウェアの構成「モジュール」](Software.md#section-4-4)「lint で検査すること」のすべて。`eslint-plugin-boundaries` は、パスを「要素の種類」として宣言し、種類どうしの許可・禁止を表で書けるため、これらをそのまま設定に落とせる。

| 守る規則 | 出典 |
|---|---|
| 操作の関数から他のモジュールの `schema.ts` を import しない | [ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5) |
| モジュールの外からは `index.ts` だけを import する | D-102 |
| 経路の層から DB を読み書きしない | [ソフトウェアの構成「層」](Software.md#section-4-1) |
| Web UI にサーバーの実行コードを含めない（`inputs.ts` だけ例外） | [ソフトウェアの構成「リポジトリの構成」](Software.md#section-4-8)・D-101 |
| `inputs.ts` は zod と他の `inputs.ts` しか import しない | [ソフトウェアの構成「入力の検証」](Software.md#section-4-7) |

- 整形は Biome の formatter に任せ、規則の検査（ESLint）と分ける
- Biome だけ・oxlint だけで検査する形は採らない。境界の検査を `noRestrictedImports` と glob の `overrides` の積み上げで書くことになり、モジュールが増えるたびに設定を足すことになる。速さは、この規模のコード量では選定の材料にならない
- 要素の種類（`boundaries/elements`）はフォルダ単位、モジュールの中のファイルの役割（`boundaries/files` の `index`・`inputs`・`schema`・`operations`・`rules`）はファイル単位で宣言し、`boundaries/dependencies` の policy で組み合わせる
- 相対 import を `.ts` のファイルまで解決させるため、`eslint-import-resolver-typescript` を入れる。解決できない import は検査されずに素通りするため、`boundaries/no-unknown-dependencies` を有効にして気づけるようにする
- 要素の種類は `module`（`modules/*`）・`db`・`route`（`http/`・`mcp/`）・`core`・`testing`・`app`（`src/server` 直下のファイル）・`web`。`app` は、ほかのどれにも当たらないものだけが当たるよう、最後に宣言する
- 同じ要素の中の import も検査する（`checkInternals`）。同じモジュールの中の import は許可したうえで、「判定の関数から操作の関数を import しない」「`inputs.ts` は zod と `inputs.ts` だけ」を同じモジュールの中にも効かせるため
- policy は後ろのものが前のものを上書きする。制限を許可より後ろに置く
- テストのファイル（`*.test.ts`）だけは、結果を確かめるために DB（`db/`・Drizzle・他のモジュールの `schema.ts`）を直接読み、アプリ全体（`app`）を組み立ててよい。テストの土台（`testing/`）はテストのファイルと `app` からだけ使える
- try / catch と `withoutPermissionCheck` の検査は、import ではないため、`no-restricted-syntax` で書く。`createTask['withoutPermissionCheck']` の書き方も検出する

#### 開発時のサーバーの起動: tsx

- サーバー側の相対 import は `.js` を付けて書く（`moduleResolution: nodenext`）。Node の型の除去（type stripping）は `.js` を `.ts` に読み替えないため、開発時は tsx で直接起動する
- 本番のビルドの方法は、本番用のコンテナイメージを作るときに決める

#### better-sqlite3 のインストール

- better-sqlite3 13 は主な環境向けのビルド済みバイナリをパッケージに同梱していて、インストール時のスクリプトは要らない
- `package.json` の `allowScripts` で better-sqlite3 のスクリプトを許可しない。許可すると、`binding.gyp` があるため npm が既定で `node-gyp rebuild` を走らせ、Python の無いイメージ（`node:24-bookworm-slim`）では失敗する

#### テスト: Vitest

- Web UI のビルドに Vite を使う（[技術スタック「フロントエンド: React の SPA」](Technology.md#section-2-4)）ため、変換の設定を1つに揃えられる
- DB を使わない判定のテスト・インメモリ SQLite の操作のテスト・将来の React のテストを、1つのランナーで回せる（[ソフトウェアの構成「テスト」](Software.md#section-4-3)）

#### TypeScript の版: 6.0 系

- 2026-09-16 の時点で `latest` は 7.0.2 だが、typescript-eslint 8.70 の peer が `typescript >=4.8.4 <6.1.0` で TS 7 に対応していない
- lint による境界の検査が開発の土台の肝（上の5つの規則）のため、typescript-eslint が対応済みの最新を採る
- typescript-eslint が TS 7 に対応したら上げる

<a id="section-2-9"></a>

### 2.9 コンテナとデプロイ

1つのコンテナで動かす（要件定義書 10章）。

#### ファイルの置き場所

コンテナの中の `/data`（本番 Compose では `PASSDOWN_DATA_DIR` で変更可）に、DB とバックアップをまとめて置く。開発環境ではホストの `./data` をバインドマウントし、本番 Compose では named volume を使う。k0s では PVC を使う。

```
/data/passdown.sqlite3
/data/backups/passdown-<日時>.sqlite3
/data/backups/before-migration-<日時>.sqlite3
```

- DB とバックアップを同じ場所に置く（[技術スタック「バックアップと復元」](Technology.md#section-2-7)）。1つのマウントで両方が守られる
- 復元は同じデータ領域をマウントしたコンテナ内で CLI を実行する（[技術スタック「バックアップと復元」](Technology.md#section-2-7)）。本番 Compose の named volume と k0s の PVC でも、ホストから直接ファイルを差し替える必要はない
- コンテナは非 root で動かす。開発環境ではバインドマウントに書き込めるよう、ホストのユーザーと UID・GID を合わせる。本番環境のデータ領域にも実行ユーザーの書き込み権限を与える

#### 環境変数

接頭辞は `PASSDOWN_`。起動時に1か所で読んで検証し、足りなければサーバーを開始せずに異常終了する（マイグレーションと同じ。[技術スタック「マイグレーション」](Technology.md#section-2-6)）。

| 変数 | 既定 |
|---|---|
| `PASSDOWN_START_MODE` | `server`（`restore_wait` も指定可能） |
| `PASSDOWN_DB_PATH` | `/data/passdown.sqlite3` |
| `PASSDOWN_BACKUP_DIR` | `/data/backups` |
| `PASSDOWN_HOST` | `0.0.0.0` |
| `PASSDOWN_PORT` | `3000` |
| `PASSDOWN_MCP_ALLOWED_HOSTS` | **既定なし（必須）** |
| `PASSDOWN_BACKUP_KEEP_DAILY` | `14` |
| `PASSDOWN_BACKUP_KEEP_MIGRATION` | `5` |
| `PASSDOWN_BACKUP_INTERVAL_MS` | `86400000`（24時間） |
| `PASSDOWN_CHECK_INTERVAL_MS` | `3600000`（1時間） |

- `PASSDOWN_START_MODE` は起動時に `server`（既定）または `restore_wait` から選び、不正な値は起動失敗とする。`src/server/main.ts` で DB 初期化前に分岐する。`restore_wait` ではプロセスをシグナルで終了できる状態で維持し、DB 接続・マイグレーション・HTTP/MCP サーバー・自動バックアップを開始しない。復元は自動実行せず、運用者が待機 Pod で CLI を実行する。通常サーバー用の設定（`PASSDOWN_MCP_ALLOWED_HOSTS` など）は待機モードでは検証しない
- 待機 Pod では Service からトラフィックを流さず、HTTP を前提とする liveness probe で再起動させない。同じ `/data` をマウントし、`PASSDOWN_DB_PATH`・`PASSDOWN_BACKUP_DIR` と書き込み権限を維持する
- バックアップの世代と経過時間・確認間隔は設定で変えられるようにする（[技術スタック「バックアップと復元」](Technology.md#section-2-7) の値は既定）。セルフホストで、置ける容量やアクセス頻度が運用ごとに違うため
- ログインの有効期限（[テーブル設計「Token・ログインのセッション」](Database.md#section-5-3)）は設定にしない。決めた値に理由があり、運用で変える場面がないため

#### ポートとリバースプロキシ

- コンテナの中では `0.0.0.0:3000` で待ち受ける
- 本番はホストの LAN に公開する（`3000:3000`）。要件定義書 10章のとおり、内部ネットワークのエージェントが MCP を直接使うため、前段のリバースプロキシの後ろに隠すだけでは足りない
- 外部ネットワークからは、前段の認証付きリバースプロキシを通す。プロキシが同じホストにあるなら `127.0.0.1:3000` に流す
- 開発も本番と同じくホストの LAN に公開する。スマホの幅での確認（要件定義書 9.2）や、他の端末で動かすエージェントから触るため。ホスト側のポートは、同じマシンで動く他のものと衝突しないよう変えられる（`PASSDOWN_DEV_PORT`、既定は 3100）
- `X-Forwarded-*` は信じない。転送されたヘッダを信頼する設定は入れない（D-121 のとおり、接続元のアドレスは数えない）

#### Node の版

- Node 24、イメージは `node:24-bookworm-slim`
  - 24 は現在の Active LTS（2025-10-28 開始、EOL 2028-04-30）。better-sqlite3 13 の `engines`（`node >= 22`）を満たす
  - 26 は Active LTS の開始が 2026-10-28 のため、v1 を出す頃に LTS になっていれば上げる
- alpine は使わない。better-sqlite3 のビルド済みバイナリは glibc 向けで、musl ではソースからのビルドが要るため

#### MCP で許可するホスト名

- `PASSDOWN_MCP_ALLOWED_HOSTS`（カンマ区切り）を必須にし、`createMcpHonoApp` の `allowedHosts` と `allowedOrigins` の両方に同じ値を渡す
- 必須にするのは、コンテナでは `0.0.0.0` にバインドするため SDK の既定の検証（127.0.0.1 バインドのときの Host・Origin の検証）が外れ、既定値を持たせると検証が緩いまま気づかず運用できてしまうため
- 値は運用者が内部で使うホスト名（例: `passdown.local,192.168.1.10`）。ホスト名だけを見てポートは見ない。開発でも、ホストの LAN に公開するため、他の端末のブラウザから触るならその名前・IP を足す
- `Origin` ヘッダの無いリクエストは通るため、ブラウザの外で動く MCP クライアント（エージェント）は影響を受けない。弾けるのはブラウザからの DNS リバインディング
