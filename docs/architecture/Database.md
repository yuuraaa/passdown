# テーブル設計

[設計書の入口](../Architecture.md)に戻る。章・節番号は分割前の設計書から維持している。

<a id="section-5"></a>

## 5. テーブル設計

<a id="section-5-1"></a>

### 5.1 全テーブル共通の決まり

#### id

- 主キーは、テーブルごとの連番の整数（`INTEGER PRIMARY KEY AUTOINCREMENT`）にする。テーブルをまたいで重ならない連番にはしない
- AUTOINCREMENT を付け、消した行の id を再利用させない。完全削除の機能は持たないが、DB を直接操作して消した場合（要件定義書 10章）に、Activity などが別の行を指さないようにするため
- id だけではどのテーブルの行か決まらないため、テーブルをまたいで行を指すとき（Activity の対象など）は、種類と id の組で持つ
- 画面・MCP で行を指すときは、`<種類>:<id>` の形で書く（`task:24`・`project:3`・`document:7`・`inbox_item:12`・`actor:5`・`token:2`）。種類の語は `entity_type`・`event_type` と同じものを使う（[テーブル設計「Activity」](Database.md#section-5-9)）
  - コメント・result・Document の本文の中で他の行を指すとき、id だけでは種類が決まらないため。コロンは URL・Markdown・GitHub の記法と衝突しない
- MCP は、この形の文字列で id を受け取り、結果にもこの形で返す。受け取った文字列は、入力のスキーマ（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）で種類と数値に分解し、そのツールが期待する種類でなければ弾く
  - id はテーブルごとの連番のため、種類を取り違えても別の行が実在してしまう。弾かなければ、黙って違うものを返す
  - 結果に出てくる表記と、次のツールに渡す値が同じ形になり、本文に書かれた `task:24` もそのまま渡せる
- 業務ロジックの層と REST API は、数値の id をそのまま使う。`<種類>:<id>` の形にするのは、MCP の層と画面の表示だけ。REST API は経路（パス）で、Web UI は型で種類が決まっているため、変換を境界の1か所に閉じる
- 入力のスキーマ（`inputs.ts`）では、他の行を指す id を数値のまま、zod の meta で種類を付けて書く（`entityId('task')`）。MCP の層は、ツールを登録するときにスキーマをたどり、種類の付いた項目を「`task:<数値>` の形の文字列を受け取って数値に変える」項目に置き換える。REST API と MCP で同じスキーマを使う（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）まま、ツールの入力の説明（JSON Schema）にも `^task:[1-9][0-9]*$` の形が載る
- 結果の id は、MCP の層が項目名で変える。`id` の種類は起点の操作の `entity`（[ソフトウェアの構成「権限の確認と Activity の記録」](Software.md#section-4-9)）で決め、`projectId`・`parentId`・`assigneeId`・`createdBy` 等は項目名と種類の対応表で決める。一覧の `items` は `id` と同じ種類として扱う。他のリソースを入れ子で返す操作を足すときは、入れ子の項目名と種類の対応を足す
- 業務のエラーの文（[ソフトウェアの構成「エラーの扱い」](Software.md#section-4-6)）では、行を `<種類>:<id>` の形で書く。REST API・MCP のどちらでも読み手に種類が分かるようにするため
- Web UI の URL は `/tasks/24` の形にする。パスの語が種類を表すため、重ねて書かない
- 例外として、対応だけを表すテーブル（`document_tags` 等）は id を持たず、対応する列の組を複合主キーにする。行が他から id で指されることがなく、重複を主キーで防げるため

#### 日時

- TEXT で、`2026-09-15T14:44:35.007+09:00` の固定の形式（ミリ秒は3桁、オフセットは +09:00）で保存する（[技術スタック「データストア: SQLite」](Technology.md#section-2-1)）
- 桁数とオフセットを固定し、文字列の比較で並べ替え・期間の絞り込みができるようにする
- 日時の文字列を作る関数を1つにし、Drizzle のカスタム型を通して読み書きする。形式が1つでもずれると、並び順が壊れるため
- 日時が同じ行の並び順は、id で決める

#### version

- 楽観ロックの対象（Task・Project・Document・Inbox Item）のテーブルだけが、`version INTEGER NOT NULL DEFAULT 1` を持つ
- 行を更新するたびに1足す。更新は `WHERE id = ? AND version = ?` で行う（[ソフトウェアの構成「操作の関数は「読む → 判定する → 書く」で書く」](Software.md#section-4-2)）
- updated_at を版数の代わりに使わない。同じミリ秒の中の2回の更新で、競合を見逃すため

#### 列挙値

- status・priority などの列挙値は TEXT で保存し、CHECK 制約で許す値を限る。バグや DB の直接操作で、想定外の値が入らないようにするため
- CHECK に使う値は、`inputs.ts` に置いた列挙値の定数を `schema.ts` から import して使い、二重に書かない（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）
- 値を変えると、SQLite ではテーブルの作り直しになる（SQL は drizzle-kit が生成する）

#### 空にできる文章

- 空にできる文章の列（Project の description・instructions 等）は `NOT NULL DEFAULT ''` にし、空は空文字で表す。NULL を許すと、空を表す値が NULL と空文字の2つになり、検索・表示のたびに両方を考える必要があるため
- 入力として必須かどうかは、入力のスキーマで決める（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）。DB では縛らない

#### 外部キー

- 接続のたびに `PRAGMA foreign_keys = ON` を設定する。SQLite は既定で外部キーを検査しないため
- ON DELETE は指定しない（NO ACTION）。完全削除の機能を持たないため、連鎖して消える経路を作らない

#### 命名

- テーブル名は複数形のスネークケース（`tasks`・`task_comments`）、列名はスネークケース（`created_at`）にする
- TypeScript 側はキャメルケースで書き、Drizzle の `casing: 'snake_case'` で変換する

<a id="section-5-2"></a>

### 5.2 Actor

持ち主は auth モジュール。

```
actors
  id             INTEGER PK AUTOINCREMENT
  actor_type     TEXT NOT NULL  CHECK (human / agent)
  name           TEXT NOT NULL
  status         TEXT NOT NULL DEFAULT 'active' CHECK (active / archived)
  perm_project   TEXT NOT NULL  CHECK (none / read / readwrite)
  perm_task      TEXT NOT NULL  CHECK (none / read / readwrite)
  perm_document  TEXT NOT NULL  CHECK (none / read / readwrite)
  perm_inbox     TEXT NOT NULL  CHECK (none / read / readwrite)

human_credentials
  actor_id       INTEGER PK  FK → actors.id
  login_name     TEXT NOT NULL  UNIQUE
  password_hash  TEXT NOT NULL
```

- human と agent を1つのテーブル `actors` で持つ。Actor を参照する列（作成者・担当・Activity の actor 等）は、すべて `actors.id` の1列で参照する（要件定義書 6.1「すべての記録で同じ形式で参照できる」）
- ログインの情報（ログイン名・パスワードのハッシュ）は `human_credentials` に分ける。Drizzle の `select()` は既定ですべての列を読むため、`actors` に置くと、担当の一覧などで読んだ Actor にハッシュが混ざり、応答に出るおそれがあるため
- ログインは、ログイン名とパスワードで行う。ログイン名は表示名（`actors.name`）と分け、表示名を変えてもログイン名が変わらないようにする
- `name` は active の Actor 間で重複させない。担当を名前で選び、エージェントも `list_actors` の結果を名前で見分けるため。archived の名前は、新しい agent Actor の作成や active の agent Actor の名前変更で再利用できる。human は常に active のため、human の名前との重複も引き続き禁止する
- テーブル再構築を含むマイグレーションでは、適用中だけ外部キー検査を無効化し、SQL・Drizzle の適用履歴の更新・`foreign_key_check` を同一トランザクションで行う。整合性が崩れた場合は全体をロールバックし、成功・失敗のどちらでも外部キー検査を再度有効化する
- DB では `CREATE UNIQUE INDEX actors_active_name_unique ON actors(name) WHERE status = 'active'` の部分一意インデックスで保証する。マイグレーションで従来の `actors.name` の全行対象の UNIQUE 制約を外し、このインデックスに置き換える。既存の Actor の id と他テーブルからの参照は維持する
- human の行の数は制限しない。人間ユーザーはオーナー1人だけ（要件定義書 2.1）だが、human が複数いると動かない作りにしないため。コードでも「human は1人」を前提にしない（例: human の Actor を1件だけ読んで使う）
- CLI でのアカウントの作成は、human がすでにいても拒まない（human の人数を確かめない）。「オーナー1人」は使い方の前提で、システムの制約にはしない。アカウントの作成・パスワードの再設定は、ログイン名を指定して行う
- アカウントの作成・再設定は、`passdown account create` と `passdown account reset-password` で行う。Compose では `docker compose exec -it passdown passdown …`、k0s では `kubectl exec -it deployment/passdown -- passdown …` と実行する。前置きは実行環境の違いであり、CLI の契約には含めない
- アカウント操作の CLI は TTY 専用の対話形式とする。作成ではログイン名・任意の表示名・パスワード・確認用パスワードを、再設定ではログイン名・新しいパスワード・確認用パスワードを順に受け付ける。表示名が空ならログイン名を使う。パスワードは引数・環境変数・標準出力に出さず、不一致・中断・入力不正では書き込まない
- CLI の実装は `src/cli/`、起動用ラッパーは `bin/passdown` に置く。開発・本番のコンテナイメージは `bin/` を `PATH` に含める。アカウント操作の CLI は DB 初期化と auth モジュールの `index.ts` の公開関数だけを使い、schema・operations を含むモジュール内部には依存しない
- auth モジュールの CLI 専用関数は `defineOperation` を使わない。作成では human Actor（4リソースすべて `readwrite`）と credential を同一トランザクションで追加し、再設定では指定 Actor のハッシュ更新と全セッションの削除を同一トランザクションで行う。ハッシュ化はトランザクション外で非同期に済ませ、どちらも Activity を作らない
- 権限は、リソース（Project / Task / Document / Inbox）ごとの列で持つ。リソースは4つで固定のため
- human の行にも、4つとも readwrite を入れる。権限の確認で Actor の種類によって分岐しないため（要件定義書 設計原則4）。承認と Actor・トークンの操作は、権限ではなく経路で制限する（[全体構成](../Architecture.md#section-1)）ため、そのための列は持たない
- created_at は持たない。agent Actor を作った日時は Activity に残るため
- version は持たない。楽観ロックの対象（要件定義書 10章）ではないため

- agent の名前は Settings の詳細画面で変更できる。Actor の id・権限・トークン・既存の参照は変えない。`actor.renamed` に変更前後の名前を記録し、画面での Actor 表示は現在の名前を使う。human の名前変更と MCP からの名前変更は公開しない
- agent の削除は `status = archived` にする論理削除とし、UI の操作名は「削除」にする。復元は持たない。human は常に active とし、削除対象にはできない。既存の Actor はマイグレーションで active にする。削除後は同じ名前の新しい agent Actor を別の id で作成でき、古い Actor のトークン・権限・担当を引き継がない
- archived の Actor・Token・Activity と、Task の作成者・コメント作成者・完了済み Task の担当等の参照は削除しない。削除日時は `actor.archived` の Activity に残し、専用の日時列は持たない
- archived の名前変更・権限変更・トークン発行・再削除を拒否する。トークン認証では Token が未失効でも Actor が archived なら拒否する。担当割当の検証では存在確認に加えて active を確認し、履歴の存在確認では archived を許す
- 削除の起点操作 `archive_agent_actor` は auth が持つ。Task の未完了担当件数の取得と未割当への変更は task の公開関数を呼び、auth から task のテーブルを直接操作しない。未完了の対象判定は task の判定関数が持つ
- 削除入力の `unassignTasks` は既定 false とする。担当する未完了 Task があって false なら変更せず拒否する。true なら該当 Task の `assignee_id` を NULL にし、`updated_at` を更新して `version` を上げる。Task の状態・本文・親子関係は変えず、done / cancelled の担当は維持する
- 削除・未完了 Task の担当解除・有効な全 Token の失効・各 Activity の記録は同一トランザクションで行う。失効済み Token の日時は変更しない。確認画面の表示後に担当 Task が増減しても、削除時に読み直して判定する。新規割当と削除はトランザクション内で active の確認を行い、削除後に担当が残る競合を防ぐ
- `list_actors` は Web・MCP ともに active の担当候補だけを返す。履歴表示用には Web 専用の `list_actor_directory` を用意し、削除済みを含む id・name・actorType・status を返す。Web の履歴・作成者・担当表示はこの一覧を使い、担当を選ぶ候補は active に絞る。検索の Actor フィルタでは archived も選べる
- MCP の取得結果では、Task・コメント等の Actor の id による参照を維持し、その結果から参照されている Actor の補足情報（id・name・actorType・status）を添える。archived も解決し、名前は現在の名前を使う。同名の active の Actor で代用しない。補足するのは、権限による絞り込み後の取得結果から参照されている Actor だけとし、権限・トークンの情報は含めない。担当候補の `list_actors` と Web 専用の `list_actor_directory` の公開範囲は変えず、MCP に履歴用の Actor 一覧ツールは追加しない

<a id="section-5-3"></a>

### 5.3 Token・ログインのセッション

持ち主は auth モジュール。

```
tokens
  id          INTEGER PK AUTOINCREMENT
  actor_id    INTEGER NOT NULL  FK → actors.id
  token_hash  TEXT NOT NULL  UNIQUE
  issued_at   TEXT NOT NULL
  revoked_at  TEXT

sessions
  id            INTEGER PK AUTOINCREMENT
  actor_id      INTEGER NOT NULL  FK → actors.id
  session_hash  TEXT NOT NULL  UNIQUE
  created_at    TEXT NOT NULL
  expires_at    TEXT NOT NULL
```

#### Token

- トークンの値はサーバーが暗号学的な乱数で作り、SHA-256 のハッシュを `token_hash` に保存する。MCP のリクエストのたびに、受け取ったトークンをハッシュにして `token_hash` のインデックスで引く
  - 推測できない乱数のため、速いハッシュで足りる。bcrypt・argon2 のようにソルトの付く遅いハッシュは、ハッシュの値で行を引けないため使わない
- `issued_at` は発行した日時で、同じ agent Actor の有効なトークンのどれが古いかを見分けるために使う（要件定義書 S-07）
- `revoked_at` は失効させた日時。NULL なら有効、日時が入っていれば無効とする。有効かどうかの列を別に持たない（失効したかと、いつ失効したかを1つの列で表し、食い違わないようにするため）。失効の取り消しは持たない
- 名前（用途）・最後に使った日時・トークンの一部（見分ける手がかり）は持たない。使う場面がシナリオにないため（要件定義書 6.1）
- トークンが agent Actor にだけ付くことは、他のテーブルにまたがり CHECK 制約で書けないため、判定の関数で確かめる

#### ログインのセッション

- セッションは DB の `sessions` に持つ。Cookie（`passdown_session`）にはランダムなセッション ID を入れ、DB には SHA-256 のハッシュを保存する
  - ログアウト・パスワードの再設定のときに、サーバーの側でセッションを確実に無効にでき、コンテナを再起動してもログインが切れないため
- ログアウトしたとき・期限が切れたときは、行を消す。セッションは Activity に記録する変更の対象ではない一時的な認証の情報で、要件定義書 設計原則7（消さない）の対象の業務のデータではないため。期限切れの行は、ログインの処理のときにまとめて消す（v1 は自動処理を持たないため）
- 有効期限は、使うたびに延ばす（無操作が14日続いたら切れる）。何日使っても必ず切れる絶対の上限は設けない
  - 期限を設けるのは、外出先の端末に残ったログインをいつまでも使えるようにしないため（要件定義書 F-AUTH-01）。日常的に使っている端末で切れると、オーナー1人の運用では困る場面の方が多い
  - 延ばすのは、残りの期間が半分（7日）を切ったときだけにする。認証のたびに `expires_at` を書き換えると、読み取りだけのリクエストでも SQLite の1本しかない書き込みを使うため

#### パスワードのハッシュ

- 人間のパスワードは、`node:crypto` の scrypt でハッシュにして `human_credentials.password_hash` に保存する。追加の依存を増やさずに、メモリを使うハッシュにできるため
- ハッシュごとに乱数のソルトを作り、方式・パラメーター・ソルト・ハッシュを1つの文字列にまとめて保存する（`scrypt$N$r$p$<salt>$<hash>`）。後でパラメーターを上げても、古い行をそのまま検証できるようにするため
- 照合は非同期の scrypt で行い、DB のトランザクションの外で行う。トランザクションの途中に await を挟まないため（[技術スタック「テーブルの定義・SQL: Drizzle ORM」](Technology.md#section-2-5)・[ソフトウェアの構成「操作の関数は「読む → 判定する → 書く」で書く」](Software.md#section-4-2)）
- ハッシュの比較は `timingSafeEqual` で行う
- パラメーターは `N=131072, r=8, p=1, keylen=32, maxmem=192 MiB` とする。開発コンテナの Node 24 で各5回測定した中央値は約288msだった。N を上げるとメモリも増えるため、`maxmem` をあわせて指定する（Node の既定の上限では足りない）

#### 総当たり対策

- ログインの失敗の記録は、プロセスのメモリに持ち、テーブルは作らない。プロセスは1つ（[全体構成](../Architecture.md#section-1)）のため
- 数える単位はログイン名にする。接続元のアドレスは数えない。外部からのアクセスは前段のリバースプロキシを通り（要件定義書 10章）、本当の接続元を使うには転送されたヘッダーを信じる設定が要る一方、内部ネットワークからは直接届くため、2つの経路で意味の違う値を数えることになるため
- 失敗が続いたときは、応答を遅らせる。締め出しはしない。連続の失敗の回数に応じて待ち時間を伸ばし、上限を設ける。ログインに成功したら、そのログイン名の記録を消す
  - オーナー1人（要件定義書 2.1）のため、ログイン名を単位に締め出すと、攻撃者がわざと失敗させるだけでオーナーが入れなくなる。遅らせるだけなら、正しいパスワードを知っている側は待つだけで入れる
  - 待ち時間の具体の値は実装のときに決める
- 失敗の記録は、最後の失敗から一定の時間が過ぎたら消す。記録の件数にも上限を設け、超えたら古いものから消す。存在しないログイン名でも記録するため、際限なく増えないようにするため
- ログインが失敗したときの応答は、ログイン名が存在するかどうかで変えない。メッセージも、遅らせ方も同じにする
- ログインの成功・失敗は Activity に記録しない。業務のデータの変更ではないため（要件定義書 6.6）

<a id="section-5-4"></a>

### 5.4 Project

持ち主は project モジュール。

```
projects
  id            INTEGER PK AUTOINCREMENT
  name          TEXT NOT NULL
  description   TEXT NOT NULL DEFAULT ''
  status        TEXT NOT NULL  CHECK (active / done / archived)
  instructions  TEXT NOT NULL DEFAULT ''
  repositories  TEXT NOT NULL DEFAULT '[]'
```

（`version` は [テーブル設計「全テーブル共通の決まり」](Database.md#section-5-1) のとおり持つ）

- `repositories` は、文字列の JSON 配列で持つ。表示してエージェントに渡すだけで、リポジトリで検索・絞り込みをしないため。Project の項目の更新で、配列ごと置き換える。配列の形は入力のスキーマで確かめ、中身が URL の形かは縛らない（要件定義書 6.2「URL 等の記録のみ」）
- `name` は UNIQUE にしない。done / archived の Project の作業が後から必要になったとき、同じ名前で新しい Project を作ることがあるため（要件定義書 S-09）。同じ名前の Project は状態で見分ける
- created_at・updated_at は持たない。要件定義書 6.2 になく、Project は検索・期間での絞り込みの対象でもないため。作成・変更の日時は Activity に残る。一覧は id の順に並べる

<a id="section-5-5"></a>

### 5.5 Task

持ち主は task モジュール。

```
tasks
  id                   INTEGER PK AUTOINCREMENT
  title                TEXT NOT NULL
  description          TEXT NOT NULL DEFAULT ''
  acceptance_criteria  TEXT NOT NULL DEFAULT ''
  status               TEXT NOT NULL  CHECK (todo / in_progress / blocked / review / done / cancelled)
  priority             TEXT NOT NULL DEFAULT 'normal'  CHECK (high / normal / low)
  project_id           INTEGER  FK → projects.id
  parent_id            INTEGER  FK → tasks.id
  assignee_id          INTEGER  FK → actors.id
  result               TEXT NOT NULL DEFAULT ''
  blocked_reason       TEXT NOT NULL DEFAULT ''
  links                TEXT NOT NULL DEFAULT '[]'
  created_by           INTEGER NOT NULL  FK → actors.id
  created_at           TEXT NOT NULL
  updated_at           TEXT NOT NULL

task_comments
  id          INTEGER PK AUTOINCREMENT
  task_id     INTEGER NOT NULL  FK → tasks.id
  body        TEXT NOT NULL
  created_by  INTEGER NOT NULL  FK → actors.id
  created_at  TEXT NOT NULL
```

（`tasks` は [テーブル設計「全テーブル共通の決まり」](Database.md#section-5-1) のとおり `version` を持つ）

- `project_id`・`parent_id`・`assignee_id` は、NULL なら、それぞれ Project に属さない・最上位・担当なしを表す
- `blocked_reason` は、todo に戻したときに空文字にする（要件定義書 6.3）
- `links` は、`repositories`（[テーブル設計「Project」](Database.md#section-5-4)）と同じく文字列の JSON 配列で持つ。記録するだけで、同期も検索もしないため。URL を足すときは、Task の更新の中で配列に足す
- priority は TEXT のため、高い順の並べ替えは `ORDER BY CASE priority WHEN 'high' THEN 0 ...` で書く。これは何を読むかの並び順で、判定ではない（[ソフトウェアの構成「操作の関数は「読む → 判定する → 書く」で書く」](Software.md#section-4-2)）

#### 親子

- 親子は `parent_id` だけで持つ。子孫・祖先は再帰の SQL（`WITH RECURSIVE`）で読む。親の付け替えが1列の更新で済み、Task の規模と階層の深さでは再帰の SQL で足りるため
- 再帰の SQL は子孫・祖先を読むことにだけ使う。cancel の対象・連動の対象・循環するかは、読んだ結果を判定の関数に渡して決める（[ソフトウェアの構成「操作の関数は「読む → 判定する → 書く」で書く」](Software.md#section-4-2)）
- 子 Task が in_progress になったときの連動は、祖先を近い順にたどり、todo の祖先を in_progress にする。todo でない祖先（in_progress・blocked）に当たったら、そこで止める。その祖先は状態が変わらず、そこから上へ連動するきっかけがないため

#### project_id

- すべての Task が `project_id` を持つ。最上位の Task の Project を変えるときは、子孫の `project_id` もあわせて更新する（どれを変えるかは判定の関数が返す。[ソフトウェアの構成「操作の関数は「読む → 判定する → 書く」で書く」](Software.md#section-4-2)）
- 子孫の Project を親から求める形にしないのは、Project での絞り込み（一覧・検索・Project の文脈の取得）が `WHERE project_id = ?` で済むため

#### コメント

- コメントを足したときは、Task の `updated_at` だけを更新し、`version` は上げない。コメントは Task の項目を変えない別の行の追加で、上げるとエージェントが作業中にコメントを書くたびに次の更新が競合になるため。コメントを添えて状態を変える操作（todo に戻す等）は、状態の変更で `version` が上がる
- `task_comments` は `updated_at`・`version` を持たない。コメントは編集・削除できないため（要件定義書 6.3）
- コメントは id の順（投稿した順）に並べ、順番の列は持たない。`created_at` はアプリが渡す現在の日時（[ソフトウェアの構成「層」](Software.md#section-4-1)）で、サーバーの時計が巻き戻ると投稿した順と逆になりうるため、並べ替えに使わない（表示・期間での絞り込みに使う）

<a id="section-5-6"></a>

### 5.6 Document

持ち主は document モジュール。

```
documents
  id          INTEGER PK AUTOINCREMENT
  title       TEXT NOT NULL
  content     TEXT NOT NULL DEFAULT ''
  status      TEXT NOT NULL  CHECK (active / archived)
  created_by  INTEGER NOT NULL  FK → actors.id
  updated_by  INTEGER NOT NULL  FK → actors.id
  created_at  TEXT NOT NULL
  updated_at  TEXT NOT NULL

document_tags
  document_id  INTEGER NOT NULL  FK → documents.id
  tag          TEXT NOT NULL
  PRIMARY KEY (document_id, tag)
```

（`documents` は [テーブル設計「全テーブル共通の決まり」](Database.md#section-5-1) のとおり `version` を持つ。`document_tags.tag` にインデックスを張る）

- `title` は UNIQUE にしない。archived の Document は戻せず、必要になったら内容を写して同じタイトルで新しく作ることがあるため（要件定義書 6.4）。同じタイトルの Document は状態で見分ける
- archive した日時の列は持たない。Activity に残るため
- `updated_by`・`updated_at` は、Document 自体を変えたとき（内容・タグの更新、archive）に更新する。Task・Project からの参照の追加・削除では、Document の行を変えない

#### タグ

- タグは `document_tags` に、1つの Document の1つのタグを1行で持つ。`tag` には書き方を揃えた後の値（[ソフトウェアの構成「入力の検証」](Software.md#section-4-7)）を保存する
- タグの一覧のテーブルは持たない。タグは名前以外の情報を持たず、どの Document からも外されたタグが既存のタグの候補（要件定義書 F-DOC-02）から自然に消えるようにするため（一覧のテーブルに持つと、使われなくなったタグが候補に残り続ける）
- タグを JSON 配列の列にしない。タグは既存のタグの一覧の取り出しと、検索での絞り込みで、それだけで読まれるため（表示するだけの `repositories`・`links` と違う）
- Document の更新（`version` 付き）の中で、その Document の `document_tags` の行を入れ替える
- 既存のタグの一覧は `document_tags` だけから読む。archived の Document のタグも候補に含める（要件定義書 F-DOC-02）ため、`documents` と結合しない

<a id="section-5-7"></a>

### 5.7 Document の参照

`task_documents` の持ち主は task モジュール、`project_documents` の持ち主は project モジュール。

```
task_documents
  task_id      INTEGER NOT NULL  FK → tasks.id
  document_id  INTEGER NOT NULL  FK → documents.id
  PRIMARY KEY (task_id, document_id)

project_documents
  project_id   INTEGER NOT NULL  FK → projects.id
  document_id  INTEGER NOT NULL  FK → documents.id
  PRIMARY KEY (project_id, document_id)
```

- 参照のテーブルは Task 用と Project 用に分け、参照する側のモジュールが持つ。参照を足す・外せるか（done / cancelled の Task、done / archived の Project には足せない）の判定と、Activity の記録（Task・Project の変更として記録する。要件定義書 6.6）が、参照する側のモジュールで閉じるため
- 参照元の種類と id の2列で持つ1つのテーブルにしない。外部キーを張れず、持ち主のモジュールも1つに決まらないため
- Document の参照元（要件定義書 F-DOC-04）は、document モジュールが task・project の読み取りの関数を呼んで読む（[ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5)）
- 参照を足す・外すときは、Task・Project の `version` を上げ、Task は `updated_at` も更新する。参照の追加・削除は、`version` を受け取る項目の更新（`update_task`・`update_project`。要件定義書 8.2）で行うため。`version` を受け取らない操作で足すコメント（[テーブル設計「Task」](Database.md#section-5-5)）とは扱いが違う
- 並び順の列は持たず、Document の id の順で返す。参照の順番を決める場面が要件にないため
- archived の Document への参照は行を残し、読むときに除く（Project の文脈・MCP の `get_task` から除き、Web UI の Task 画面では archived と分かる表示で残す。要件定義書 6.4）

<a id="section-5-8"></a>

### 5.8 Inbox Item

持ち主は inbox モジュール。

```
inbox_items
  id          INTEGER PK AUTOINCREMENT
  content     TEXT NOT NULL
  status      TEXT NOT NULL  CHECK (untriaged / triaged / archived)
  created_by  INTEGER NOT NULL  FK → actors.id
```

（[テーブル設計「全テーブル共通の決まり」](Database.md#section-5-1) のとおり `version` を持つ）

- 変換先の列は持たない。変換先は Activity の `inbox.converted` から読む（要件定義書 6.5）
- `content` に既定値を付けない。入れるときに必ず本文があるため（空でないことは入力のスキーマで確かめる）
- created_at・updated_at は持たない。要件定義書 6.5 になく、Inbox は検索・期間での絞り込みの対象でもないため。入れた日時・変えた日時は Activity に残り、入れた順は id で分かる。一覧の並び順は [ソフトウェアの構成「一覧の並び順」](Software.md#section-4-10) のとおり id の昇順（入れた順）

<a id="section-5-9"></a>

### 5.9 Activity

持ち主は activity モジュール。各モジュールは、activity の「Activity を記録する」関数を呼んで記録する（[ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5)）。

```
activities
  id           INTEGER PK AUTOINCREMENT
  event_type   TEXT NOT NULL  CHECK (task.created / task.status_changed / inbox.converted …)
  entity_type  TEXT NOT NULL  CHECK (actor / token / project / task / document / inbox_item)
  entity_id    INTEGER NOT NULL
  project_id   INTEGER  FK → projects.id
  actor_id     INTEGER NOT NULL  FK → actors.id
  source       TEXT NOT NULL  CHECK (web / mcp)
  before       TEXT NOT NULL DEFAULT '{}'
  after        TEXT NOT NULL DEFAULT '{}'
  occurred_at  TEXT NOT NULL
```

- Activity は足すだけで変えないため、`version`・`updated_at` を持たない。並び順は id の順（[テーブル設計「Task」](Database.md#section-5-5) のコメントと同じ理由）
- event_type の一覧は下の「event_type」。自動で起きた変更（親 Task の連動、まとめての cancel）は、直接の操作とは別の event_type にする（[ソフトウェアの構成「権限の確認と Activity の記録」](Software.md#section-4-9)）
- 対象は `entity_type` と `entity_id` の組で持つ。対象のテーブルが種類ごとに違うため、`entity_id` に外部キーは張らない（完全削除の機能を持たないため、指す先が消えることはない）
- 自動で起きる変更（親 Task の連動、子孫・Project の Task の cancel、子孫の Project の変更）は、対象の Task ごとに1行を書き、Actor と経路は起点の操作のものにする（要件定義書 設計原則3）。1つの操作から出た行をまとめる列は持たない。使う場面が要件にないため

#### event_type

`<対象>.<出来事>` の形にする。対象は `entity_type` と同じ語を使う。

| 対象 | event_type | 起こる操作 |
|---|---|---|
| actor | `actor.created` | agent Actor の作成 |
| | `actor.renamed` | agent Actor の名前変更 |
| | `actor.archived` | agent Actor の論理削除 |
| | `actor.permissions_changed` | 権限の設定 |
| token | `token.issued` | トークンの発行 |
| | `token.revoked` | トークンの失効 |
| project | `project.created` | Project の作成 |
| | `project.updated` | 項目の更新 |
| | `project.document_linked` / `project.document_unlinked` | 参照する Document の追加・削除 |
| | `project.completed` | done にする |
| | `project.archived` | archive する |
| task | `task.created` | Task の作成（Inbox からの変換を含む） |
| | `task.updated` | title・description・acceptance_criteria・priority・links の更新 |
| | `task.assignee_changed` | 担当の変更 |
| | `task.parent_changed` | 親の変更（付ける・付け替える・外す） |
| | `task.moved` | 所属 Project の変更 |
| | `task.document_linked` / `task.document_unlinked` | 参照する Document の追加・削除 |
| | `task.started` | todo → in_progress |
| | `task.blocked` | blocked にする |
| | `task.review_requested` | review に出す |
| | `task.approved` | review → done（承認） |
| | `task.returned_to_todo` | blocked / review → todo（差し戻しを含む） |
| | `task.cancelled` | cancel する |
| | `task.commented` | コメントの投稿 |
| | `task.auto_started` | 子 Task が in_progress になったときの、親の自動の in_progress |
| | `task.auto_cancelled` | 親 Task の cancel・Project の archive に伴う、子孫・Project の Task の cancel |
| | `task.auto_assignee_changed` | agent Actor の論理削除に伴う、未完了 Task の担当解除 |
| | `task.auto_moved` | 最上位の Task の Project を変えたときの、子孫の追随 |
| document | `document.created` | Document の作成 |
| | `document.updated` | 項目・タグの更新 |
| | `document.archived` | archive する |
| inbox_item | `inbox_item.captured` | Inbox に入れる |
| | `inbox_item.updated` | 本文の変更 |
| | `inbox_item.converted` | Project / Task / Document への変換 |
| | `inbox_item.archived` | archive する |

- 状態の変更は遷移ごとに分ける。承認（`task.approved`）と差し戻し（`task.returned_to_todo`）を別の値にし、画面で何が起きたかを event_type だけで読めるようにするため。状態は専用の操作でだけ変える（要件定義書 8.1）ため、操作と値がそのまま対応する
- 項目の更新は `task.updated`・`project.updated`・`document.updated` にまとめ、関係の変更（担当・親・Project・Document の参照）だけを分ける。関係の変更は経緯としての意味が違い、自動で追随する分（`task.auto_moved`）があり、Document の参照は別のテーブルの変更のため
- 自動で起きた変更は、対応する直接の操作の値に `auto_` を付ける。どの操作に対応するかが名前で分かるようにするため
- 1回の操作で種類の違う変更が起きたときは、種類ごとに行を分けて書く（例: 1回の更新で本文と担当が変われば `task.updated` と `task.assignee_changed` の2行、コメントを添えて todo に戻せば `task.commented` と `task.returned_to_todo` の2行）。各行の before / after には、その行が表す項目だけを入れる
- Inbox Item の変換は、Inbox Item に `inbox_item.converted`、変換先に `task.created` 等を書く
- `task.commented` の対象は Task にする（`entity_type = 'task'`、`entity_id` は Task の id）。コメントは Task に含まれる（要件定義書 F-AUTH-03）ため、コメントを対象の種類にしない。after にコメントの id と本文を入れる
- CLI での操作（アカウントの作成・パスワードの再設定）は記録しない。記録する Actor がなく、`source` の値（web / mcp）にも当たらないため。要件定義書 F-ACT-01 が記録の対象にするのは agent Actor とトークンの操作で、human のアカウントの作成は含まれない
- ログインの成功・失敗、セッションの作成・削除、マイグレーションの適用は記録しない。業務のデータの変更ではないため（要件定義書 6.6）

#### before / after

- JSON で、変わった項目だけを入れる。変わった項目の変更前の値を before に、変更後の値を after に入れる（例: `before: {"status":"blocked","blockedReason":"…"}`、`after: {"status":"todo","blockedReason":""}`。項目名は [REST API「応答の形」](REST_API.md#section-7-6) のとおりキャメルケース）。画面で何が変わったかがそのまま分かり、「回答済み」「差し戻し済み」の判定も before の status を読むだけで済むため
- 作成の記録は、before を `{}` にし、after に作成した項目を入れる
- description・content などの長い文章も、変わったときは変更前後の全文を入れる。Document の版の履歴を持たない（要件定義書 5.2）ため、これが唯一の変更の記録になる
- トークン・パスワード・セッションのハッシュは入れない

#### 対象ごとの引き方

- Task・Document・Inbox Item・Project の画面では、`(entity_type, entity_id)` で引く
- トークンの記録は、`entity_type = 'token'`、`entity_id` をトークンの id にする。agent Actor の画面（要件定義書 F-ACT-02）では、activity の起点操作が auth モジュールの公開関数でその Actor のトークンの id の一覧を読み、Actor の id とあわせて引く（[ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5)）
- Task・Document・Inbox Item は作成時の Activity が必ずあり、完全削除もしないため、対象の Activity が0件なら対象も存在しないとして「見つからない」にする。Project 単位の Activity も Project 自身の作成時の記録を必ず含むため、0件なら同じ扱いにする。Actor は auth モジュールの公開関数で存在を確かめる

#### project_id

- Project の画面の Activity（要件定義書 F-PRJ-03）は、`project_id` で引く
- Task の記録には、記録した時点（変更の後）の Task の Project を入れる。Project の変更そのものの記録（参照する Document の追加・削除を含む）には、その Project を入れる。Document・Inbox Item・Actor・トークンの記録は NULL にする（要件定義書 6.6）
- Task を別の Project に移したときの記録は、移動先の Project に載り、移動元の Project の id は before に残る。移動元の Project の Activity の一覧には載らない。移動は付け間違いを直すときなどに限られ、Task の画面には経緯がすべて残るため、`project_id` の1列で引く単純さを優先する

<a id="section-5-10"></a>

### 5.10 インデックス

関係をたどって読む列（親子・所属・参照元など）にだけインデックスを張る。状態・日時での絞り込みや並べ替えのためのインデックスは、遅いと分かってから足す。

- 想定の規模では、状態などでの絞り込みはインデックスがなくても足りる（[検索「性能」](Search.md#section-3-4) の計測では、Task 3万件の全件の走査で約80ms）。どの条件の組み合わせが遅くなるかは、使ってみないと分からないため
- 関係をたどる読み取り（Task のコメント、子孫の再帰の SQL、Document の参照元など）は、1回の操作で何度も行うことがあるため、最初から張る。SQLite は外部キーの列にインデックスを自動で張らない

| テーブル | インデックス | 使う読み取り |
|---|---|---|
| `tasks` | `parent_id` | 子 Task・子孫の再帰の SQL |
| `tasks` | `project_id` | Project の Task、archive のときのまとめての cancel |
| `tasks` | `assignee_id` | 担当の todo（`list_actionable_tasks`） |
| `task_comments` | `task_id` | Task のコメント |
| `task_documents` | `document_id` | Document の参照元（要件定義書 F-DOC-04）。`task_id` での引き方は主キーで足りる |
| `project_documents` | `document_id` | Document の参照元。`project_id` での引き方は主キーで足りる |
| `document_tags` | `tag` | タグでの絞り込み。`document_id` での引き方は主キーで足りる |
| `tokens` | `actor_id` | agent Actor のトークンの一覧 |
| `sessions` | `actor_id` | パスワードの再設定のときに、その Actor のセッションを消す |
| `activities` | `(entity_type, entity_id)` | エンティティの画面、「回答済み」「差し戻し済み」の判定 |
| `activities` | `project_id` | Project の画面の Activity |

- UNIQUE 制約（`human_credentials.login_name`・`tokens.token_hash`・`sessions.session_hash`）には、インデックスが自動で張られる。トークン・セッションの照合はこれを使う。`actors.name` は active の行だけを対象とする部分一意インデックスを明示的に張る（[テーブル設計「Actor」](Database.md#section-5-2)）
- SQLite はインデックスに rowid（id）を含めて持つため、`activities` を対象で絞った後の id の順の並べ替えも、インデックスの中で済む
- キーワード検索（`LIKE '%語%'`）はインデックスを使えないため、検索のためのインデックスは張らない（[検索「性能」](Search.md#section-3-4)）
