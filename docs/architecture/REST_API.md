# REST API

[設計書の入口](../Architecture.md)に戻る。章・節番号は分割前の設計書から維持している。

<a id="section-7"></a>

## 7. REST API

Web UI 専用の経路（[全体構成](../Architecture.md#section-1)）。ログインのセッションだけを受け付け、Hono RPC で型付きで呼ぶ（[技術スタック「フロントエンド: React の SPA」](Technology.md#section-2-4)）。

<a id="section-7-1"></a>

### 7.1 パス

- REST API は `/api`、MCP は `/mcp`。どちらにも版（`/api/v1` 等）を入れない
- `/api`・`/mcp` 以外のパスは、Web UI の静的ファイルを返し、当たらなければ `index.html` を返す（SPA のため）
- 版を入れないのは、クライアントが自分でホストする Web UI 1つだけで、サーバーと同じビルドから同時に配られる（[ソフトウェアの構成「リポジトリの構成」](Software.md#section-4-8)）ため。版を分けて並走させる場面が要件にない。MCP はプロトコル側で版を持つ（[技術スタック「MCP: 公式 SDK v2 をステートレスで使う」](Technology.md#section-2-3)）

<a id="section-7-2"></a>

### 7.2 経路の決まり

| 種類 | メソッドとパス |
|---|---|
| 一覧・取得 | `GET /api/<リソース>`・`GET /api/<リソース>/:id` |
| 作成 | `POST /api/<リソース>` |
| 項目の更新 | `PATCH /api/<リソース>/:id` |
| 状態を変える操作 | `POST /api/<リソース>/:id/<動詞>` |

- 起点の操作（[ソフトウェアの構成「権限の確認と Activity の記録」](Software.md#section-4-9)）1つに経路1つを当てる。`routes` に `'web'` を含む操作がすべて登録されていることをテストで確かめる（[ソフトウェアの構成「権限の確認と Activity の記録」](Software.md#section-4-9) のテスト）
- **状態を変える操作を `PATCH` に含めない**。要件定義書 8.1 の「状態は状態ごとの専用の操作でだけ変える」を経路にそのまま出し、`PATCH` で状態を書き換えて専用の操作の確認（review に出すときの result 必須など）を迂回できないようにするため
- 動詞は、MCP のツール名から対象を除いたものを kebab-case で書く（`request_task_review` → `request-review`）。MCP にないもの（承認・cancel 等）も同じ形にする
- `DELETE` はセッションの削除（ログアウト）にだけ使う。完全削除の機能を持たないため、archive・cancel・トークンの失効は `POST` の操作にする
- id は数値をそのまま使う（[テーブル設計「全テーブル共通の決まり」](Database.md#section-5-1)）。`<種類>:<id>` の形は使わない。パスの語が種類を表すため
- 一覧の絞り込み・ページングはクエリ文字列、それ以外の入力は JSON の本文で受け取る
- 経路の層で入力を検証し、操作の関数の先頭でもう一度検証する（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）

<a id="section-7-3"></a>

### 7.3 経路の一覧

#### セッション

| メソッドとパス | 対応する操作 |
|---|---|
| `POST /api/session` | ログイン |
| `DELETE /api/session` | ログアウト |
| `GET /api/session` | 今ログインしている Actor を返す |

#### Inbox

| メソッドとパス | 対応する操作 |
|---|---|
| `GET /api/inbox-items` | `list_inbox_items` |
| `POST /api/inbox-items` | `capture_inbox_item` |
| `GET /api/inbox-items/:id` | Inbox Item を1件取得（Inbox Item 画面） |
| `PATCH /api/inbox-items/:id` | `update_inbox_item` |
| `POST /api/inbox-items/:id/convert` | `convert_inbox_item` |
| `POST /api/inbox-items/:id/archive` | `archive_inbox_item` |
| `GET /api/inbox-items/:id/activities` | Inbox Item の Activity（変換先をたどる。要件定義書 6.5。Web UI だけ） |

#### Project

| メソッドとパス | 対応する操作 |
|---|---|
| `GET /api/projects` | `list_projects` |
| `POST /api/projects` | `create_project` |
| `GET /api/projects/:id` | Project を1件取得（Project 画面） |
| `PATCH /api/projects/:id` | `update_project`（項目・参照する Document の更新） |
| `GET /api/projects/:id/context` | `get_project_context` |
| `GET /api/projects/:id/activities` | Project の Activity（要件定義書 F-PRJ-03。Web UI だけ） |
| `POST /api/projects/:id/complete` | Project を done にする（Web UI だけ） |
| `POST /api/projects/:id/archive` | Project を archive する（Web UI だけ） |

#### Task

| メソッドとパス | 対応する操作 |
|---|---|
| `GET /api/tasks` | `list_tasks` |
| `GET /api/tasks/actionable` | `list_actionable_tasks` |
| `POST /api/tasks` | `create_task` |
| `GET /api/tasks/:id` | `get_task` |
| `PATCH /api/tasks/:id` | `update_task`（項目・親・所属 Project・参照する Document の更新） |
| `GET /api/tasks/:id/activities` | Task の Activity（Web UI だけ） |
| `POST /api/tasks/:id/comments` | `add_task_comment` |
| `POST /api/tasks/:id/start` | `start_task` |
| `POST /api/tasks/:id/block` | `block_task` |
| `POST /api/tasks/:id/request-review` | `request_task_review` |
| `POST /api/tasks/:id/return-to-todo` | `return_task_to_todo` |
| `POST /api/tasks/:id/approve` | 承認（Web UI だけ） |
| `POST /api/tasks/:id/cancel` | cancel する（Web UI だけ） |

- `GET /api/tasks/actionable` を `GET /api/tasks` のクエリにしないのは、絞り込みの条件（自分が担当・todo・子 Task を持たない）と並び順（priority の高い順、[ソフトウェアの構成「一覧の並び順」](Software.md#section-4-10)）が固定で、呼び出し側が指定するものではないため。id は数値のため `:id` と取り違えることはない（経路は `actionable` を先に置く）

#### Document

| メソッドとパス | 対応する操作 |
|---|---|
| `GET /api/documents` | Document の一覧（Documents 画面） |
| `POST /api/documents` | `create_document` |
| `GET /api/documents/:id` | `get_document` |
| `PATCH /api/documents/:id` | `update_document`（項目・タグの更新） |
| `POST /api/documents/:id/archive` | `archive_document` |
| `GET /api/documents/:id/references` | 参照元の Task・Project（要件定義書 F-DOC-04） |
| `GET /api/documents/:id/activities` | Document の Activity（Web UI だけ） |
| `GET /api/document-tags` | 既存のタグの一覧（要件定義書 F-DOC-02） |

- Document の参照の追加・削除に専用の経路を置かない。`update_task`・`update_project` の中で、`version` を受け取って行う（[テーブル設計「Document の参照」](Database.md#section-5-7)）ため

#### Actor・トークン・Activity

| メソッドとパス | 対応する操作 |
|---|---|
| `GET /api/actors` | `list_actors`。`includeArchived=true` の場合は Web 専用の `list_actor_directory` を呼び、履歴表示用の削除済みを含む一覧を返す |
| `GET /api/actors/:id` | agent Actor の詳細（Web UI だけ） |
| `POST /api/actors` | agent Actor の作成（Web UI だけ） |
| `PATCH /api/actors/:id` | agent Actor の名前変更（Web UI だけ）。入力は `name` |
| `PATCH /api/actors/:id/permissions` | 権限の設定（Web UI だけ） |
| `POST /api/actors/:id/archive` | `archive_agent_actor`（Web UI だけ）。入力は `unassignTasks: boolean`（既定 false） |
| `GET /api/actors/:id/activities` | agent Actor の Activity（要件定義書 F-ACT-02。Web UI だけ） |
| `GET /api/actors/:id/tokens` | トークンの一覧（Web UI だけ） |
| `POST /api/actors/:id/tokens` | トークンの発行（Web UI だけ） |
| `POST /api/tokens/:id/revoke` | トークンの失効（Web UI だけ） |

- 権限の設定を `PATCH /api/actors/:id` にまとめず、`/permissions` に分ける。Actor の項目の更新とは操作も Activity の event_type（`actor.permissions_changed`、[テーブル設計「Activity」](Database.md#section-5-9)）も別のため
- `GET /api/actors/:id` は agent Actor の `id`・`name`・`actorType`・`status`・4リソースの `permissions` と `unfinishedTaskCount` を返す。Settings の詳細画面が現在の状態と権限、削除時の担当解除件数を確認するために使う。Token の値・一覧と Activity は含めず、それぞれ専用の既存経路で取得する。archived も読み取れる。human Actor を指定した場合は agent 専用操作として拒否し、MCP には公開しない
- `POST /api/actors/:id/archive` は、確認に同意していない未完了 Task があれば `not_allowed`（409）で拒否する。確認後に Task が割り当てられたため拒否された場合は、UI が件数を再取得し、未割当への変更に同意するか再確認する

#### 検索

| メソッドとパス | 対応する操作 |
|---|---|
| `GET /api/search` | `search`（[検索](Search.md#section-3)） |

<a id="section-7-4"></a>

### 7.4 一覧のページング

- 一覧はクエリの `limit`・`offset` で切り出す。`limit` の既定は50、上限は200。検索（[検索「結果の並び順と返す単位」](Search.md#section-3-5)）と同じ値にする
- 応答の基本は `{ items, total }` の形にし、`total` に `limit` で切る前の（絞り込み後の）総件数を入れる。`list_tasks` は状態別件数の `statusCounts` も返す（[Web UI「Task の一覧」](Web_UI.md#section-8-2)）
- 並び順は [ソフトウェアの構成「一覧の並び順」](Software.md#section-4-10) のとおり一覧ごとに決まっていて、呼び出し側は指定できない。id の昇順が基本で、追加は必ず末尾に入るため、読んでいる途中に行が増えても `offset` がずれない
- 総件数を必ず返すのは、打ち切ったかどうかを呼び出し側が判断できるようにするため。Task の状態ごとの件数は、選んだ状態に左右されない `statusCounts` で返す（[Web UI「Task の一覧」](Web_UI.md#section-8-2)）
- MCP の一覧のツール（`list_tasks` 等）も同じ既定・上限にする。同じ操作の関数を通る（[ソフトウェアの構成「層」](Software.md#section-4-1)）ため、経路で値を変えない
- 例外は3つ。`get_task` のコメント（全件を必ず含める。要件定義書 8.2）、`get_project_context`（件数の上限は [MCP のツール「返す量の上限」](MCP.md#section-6-2)）、`search`（返す単位は [検索「結果の並び順と返す単位」](Search.md#section-3-5)）
- カーソル方式は採らない。並び順が id の昇順で固定のため `offset` でずれず、任意のページに飛べて総件数も1回で得られる形の方が、画面の作りが単純になる

<a id="section-7-5"></a>

### 7.5 楽観ロックの version

- `version` は JSON の本文で受け取る。応答には、更新後のリソース全体（新しい `version` を含む）を返す
- `version` を必須にするのは、項目を更新する4つの操作（`update_task`・`update_project`・`update_document`・`update_inbox_item`）だけ
- 状態を変える操作（`start_task`・`block_task`・`request_task_review`・`return_task_to_todo`・承認・cancel・Project の done / archive・`archive_document`・`archive_inbox_item`）は `version` を要求しない。二重に実行されても、状態遷移の判定（[ソフトウェアの構成「操作の関数は「読む → 判定する → 書く」で書く」](Software.md#section-4-2)）が「操作できない」で弾くため（例: 先に start されていれば todo ではないので弾かれる）。要求すると、MCP のツールの必須の入力が増え、エージェントが読み直す回数も増える
- これらの操作も、行を更新するときに `version` を1足す（[テーブル設計「全テーブル共通の決まり」](Database.md#section-5-1)）。`version` を持って項目を更新しようとした側は、その後の更新で競合になる
- コメントの投稿は `version` を上げない（[テーブル設計「Task」](Database.md#section-5-5)）
- `version` を HTTP の `If-Match` / `ETag` で受け渡す形は採らない。`version` が入力のスキーマ（`inputs.ts`）の外に出て、REST API と MCP でスキーマが二重になり（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7) に反する）、Hono RPC の型にも乗らないため

<a id="section-7-6"></a>

### 7.6 応答の形

- 応答は常に JSON。1件を返す操作はリソースそのもの、一覧の基本は `{ items, total }`（[REST API「一覧のページング」](REST_API.md#section-7-4)）。`list_tasks` だけは `statusCounts` も返す（[Web UI「Task の一覧」](Web_UI.md#section-8-2)）
- JSON の項目名はキャメルケース（`acceptanceCriteria`・`updatedAt`）にする。MCP のツールの入力・結果、Activity の before / after も同じ。Drizzle の TypeScript 側・zod のスキーマ・Hono RPC の型とそのまま一致し、境界で名前を変換する層が要らないため。REST API と MCP は同じ入力のスキーマを使う（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）ため、両方が同じ書き方になる
- 何も返さない操作（ログアウト等）も `204` ではなく `200` と JSON で返す。Hono RPC の型と TanStack Query の扱いを1つに揃えるため
- エラーは `{ error: { type, message } }` の形にする。`type` は [ソフトウェアの構成「エラーの扱い」](Software.md#section-4-6) のエラーの種類と1対1に対応する

| `type` | HTTP ステータス | [ソフトウェアの構成「エラーの扱い」](Software.md#section-4-6) の種類 |
|---|---|---|
| `invalid_input` | 400 | 入力が不正 |
| `unauthorized` | 401 | （経路の層だけ）ログインしていない・セッションの期限切れ |
| `forbidden` | 403 | 権限がない |
| `not_found` | 404 | 見つからない |
| `not_allowed` | 409 | 操作できない |
| `conflict` | 409 | 競合（楽観ロック） |
| `internal` | 500 | 想定外 |

- `unauthorized` は業務のエラー（[ソフトウェアの構成「エラーの扱い」](Software.md#section-4-6)）ではなく、経路の層の認証で返す。MCP でトークンが無い・無効なときも、SDK に渡す前に 401 と同じ形の JSON を返す
- 「操作できない」と「競合」はどちらも 409 のため、`type` で見分ける（[ソフトウェアの構成「エラーの扱い」](Software.md#section-4-6) の「競合と分かる印」）。Web UI は `conflict` のときだけ読み直して再実行を促す
- `message` は、人間が読んで次に何をすればよいか分かる文にする（[ソフトウェアの構成「エラーの扱い」](Software.md#section-4-6)）。`internal` のときは詳細を入れず、ログに残す
- 経路の層の `zValidator` の既定の 400 の応答は使わず、この形に揃える（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）
