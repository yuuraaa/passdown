# Web UI

[設計書の入口](../Architecture.md)に戻る。章・節番号は分割前の設計書から維持している。

<a id="section-8"></a>

## 8. Web UI

<a id="section-8-1"></a>

### 8.1 画面とルーティング

Web UI は、リソースの一覧・詳細・作成に URL を持たせる。項目の編集は詳細画面の中で行い、編集だけの URL は持たない。URL を持たせることで、再読み込み・ブラウザの戻る／進む・詳細画面への直接のリンクで同じ場所を復元できるようにする。

| パス | 画面 |
|---|---|
| `/login` | ログイン |
| `/inbox` | Inbox Item の一覧と取り込み |
| `/inbox/:id` | Inbox Item の詳細・編集・変換・archive・Activity |
| `/projects` | Project の一覧 |
| `/projects/new` | Project の作成 |
| `/projects/:id/overview` | Project の概要・instructions・関連リポジトリと操作 |
| `/projects/:id/tasks` | Project に属する Task |
| `/projects/:id/documents` | Project が参照する Document |
| `/projects/:id/activity` | Project の Activity |
| `/tasks` | 全 Project を横断する Task の一覧 |
| `/tasks/new` | Task の作成 |
| `/tasks/:id` | Task の詳細・コメント・Activityと操作 |
| `/documents` | Document の一覧 |
| `/documents/new` | Document の作成 |
| `/documents/:id` | Document の本文・タグ・参照元・Activityと操作 |
| `/search` | Task・Document の検索 |
| `/settings/agents` | agent Actor の一覧。既定は active、削除済みを含める切り替えを持つ |
| `/settings/agents/new` | agent Actor の作成と最初の権限設定 |
| `/settings/agents/:id` | agent Actor の名前変更・削除・権限・トークン・Activity。archived は状態を表示して読み取り専用 |

- `/` は `/tasks`、`/projects/:id` は `/projects/:id/overview`、`/settings` は `/settings/agents` へ移す
- Project 詳細だけは、共通の Project 見出しと操作を残して Overview / Tasks / Documents / Activity を子ルートで切り替える。どのタブを開いているかを URL で復元するため
- Task 詳細は、本文・親子・参照 Document・コメント・Activityを1画面に置く。Project のような子ルートには分けない
- 短い確認や入力だけで終わる操作はダイアログで行う。ただし、Task のコメントと todo へ戻す操作は[Web UI「Task のコメントと todo へ戻す操作」](Web_UI.md#section-8-3)のとおり詳細画面内で行う
- ログインしていなければ `/login` へ移し、ログイン後は元の URL があればそこへ、なければ `/tasks` へ移す

<a id="section-8-2"></a>

### 8.2 Task の一覧

#### 状態の絞り込みと件数

状態は件数付きのフィルターチップで常に全種類を表示し、複数を選べるようにする。

```
[Todo 12] [進行中 3] [Blocked 2] [Review 4] [Done 38] [Cancelled 6]
```

- 既定は todo / in_progress / blocked / review を選び、done / cancelled は選ばない（要件定義書 9.2）
- done / cancelled が未選択でも、その件数は表示する
- Project・担当者等のほかの絞り込みは件数にも反映し、状態の絞り込みだけを無視して全状態を数える
- `list_tasks` の `total` は選択した状態を含むすべての絞り込み後・ページング前の件数、`statusCounts` は上の規則で数えた状態別件数とする

`list_tasks` の結果は、通常の一覧の形（[REST API「一覧のページング」](REST_API.md#section-7-4)）に `statusCounts` を加える。

```json
{
  "items": [],
  "total": 21,
  "statusCounts": {
    "todo": 12,
    "inProgress": 3,
    "blocked": 2,
    "review": 4,
    "done": 38,
    "cancelled": 6
  }
}
```

この結果は REST API と MCP で共有する。MCP には状態別件数が必須ではないが、6個の数値であり、実際にコンテキスト量が問題になったときに分離を検討する。

#### 一覧のTaskに加える情報

`list_tasks` の各 Task には、ページングや状態の絞り込みに左右されず一覧を描画するため、次の派生情報を加える。いずれも REST API と MCP で共有する。

| 項目 | 値 | 表示 |
|---|---|---|
| `allChildrenFinished` | 直接の子 Task が1件以上あり、そのすべてが done / cancelled なら `true`。子がない、または終わっていない子があれば `false` | `true` で親が todo / in_progress / blocked のときだけ `✓ 子Task完了` |
| `returnedFrom` | 最後の状態変更が blocked → todo なら `blocked`、review → todo なら `review`、それ以外は `null` | `blocked` は `回答済み`、`review` は `差し戻し済み` を Todo の横に表示 |

- `allChildrenFinished` は直接の子だけで判定する。子 Task 自身が、その子をすべて終えないと review / done になれないため、直接の子がすべて終わっていれば配下も終わっている
- `returnedFrom` は Activity の最後の状態変更の before / after から求め、画面文言ではなく戻る前の状態を返す
- `allChildrenFinished` と `returnedFrom` は、MCP でも親 Task が次へ進めるか、todo になった経緯は何かを判断する材料になる
- `✓ 子Task完了`、`回答済み`、`差し戻し済み` は文字を伴うバッジにし、色だけで区別しない

#### 最後に変更された日時

todo / in_progress / blocked / review の Task は、一覧に `最終更新 3日前` のような相対時間を表示する。期限や異常を表す警告ではなく、Task 本体の `updated_at` が古いという事実だけを示す。

- 1分未満は `たった今`、1時間未満は分、24時間未満は時間、それ以降は日を単位にする
- 画面を開いている間も、表示する相対時間を定期的に更新する
- Task 詳細では状態にかかわらず、作成日時・更新日時を正確な JST の日時でも表示する
- コメントの投稿でも Task 本体の `updated_at` を更新する。この値はセッションの heartbeat や最後の Activity の日時ではない
- done / cancelled は既定で一覧に出ず、放置に気づく対象でもないため、一覧では相対時間を表示しない

<a id="section-8-3"></a>

### 8.3 Task のコメントと todo へ戻す操作

Task 詳細には、コメントの入力欄を初めから表示し、同じ入力をコメントだけの投稿と todo へ戻す操作で共有する。

| Task の状態 | 表示する操作 |
|---|---|
| todo / in_progress | `コメントのみ投稿` |
| blocked | `コメントのみ投稿`、`回答して todo に戻す` |
| review | `コメントのみ投稿`、`差し戻す` |
| done / cancelled | 入力欄を表示しない（読み取りだけ） |

- `コメントのみ投稿` は `add_task_comment`、状態別のボタンは `return_task_to_todo` を1回だけ呼ぶ
- `return_task_to_todo` は、コメントの追加と状態変更を同じトランザクションで行う（要件定義書 F-TSK-09）
- 前後の空白を除いた本文が空なら、同じ入力欄を使うすべてのボタンを無効にする。入力のスキーマも空の本文を受け付けない
- 送信中は二重送信を防ぐため、同じ入力欄のすべてのボタンを無効にする
- コメントの投稿で暗黙に状態を変えない。状態を変えるボタンは結果が分かる文言にする
- 成功したら Task 本体・コメント・Activity・Task 一覧の TanStack Query のキャッシュを無効化して再取得する

<a id="section-8-4"></a>

### 8.4 Actor の表示

- archived の Actor も名前と種別アイコンで表示し、「削除済み」を添える。同名の Actor を再作成しても、参照は Actor の id で解決し、古い履歴を新しい Actor の表示に置き換えない。削除済みの一覧に同名が複数ある場合は Actor の id も添えて区別する。Actor の参照を名前不明や human の表示に置き換えない
- Settings の削除確認ダイアログには、全トークンの失効・履歴の保持・取り消し不可を表示する。担当する未完了 Task がある場合は件数と「未完了タスクを未割当に変更する」のチェック項目（既定は未選択）を表示し、選択するまで削除ボタンを無効にする。キャンセルでは何も変更しない。削除成功後は通常のエージェント一覧へ戻る
- 名前変更・削除の検証はコンテナ内で行う。業務テストでは履歴と完了済み Task の参照保持、全トークンの失効、同意の有無、担当解除の Activity・版数更新、削除後の変更・再割当拒否、トランザクションのロールバックを確認する。HTTP・MCP では経路制限と担当候補からの除外を確認する。開発コンテナを起動し Chrome Devtools MCP で名前変更・削除確認・削除済みの閲覧を PC とスマホ幅で確認する

作成者・更新者・担当者・コメント・Activity は、人物／ロボットの種別アイコンと Actor 名を組み合わせた共通の表示部品を使う。

```
[人物アイコン] オーナー
[ロボットアイコン] Codex
[ロボットアイコン] Claude Code
```

- human / agent はアイコンで、各 agent は Actor 名で区別する。`agent` の文字ラベルは付けない
- 色を補助に使ってよいが、色だけで種別を区別しない
- Activity では、Actor の表示とは別に `Web` / `MCP` の経路も文字付きで表示する
- アイコンだけにせず、Actor 名を常に併記する

<a id="section-8-5"></a>

### 8.5 PC とスマホの幅

同じルート・データ・React コンポーネントを使い、Tailwind の `md`（768px）を主な切り替え点として配置を変える。PC用とスマホ用に機能の異なる画面を二重に作らない。

| 対象 | PC | スマホ |
|---|---|---|
| 主なナビゲーション | 左のサイドバーに Inbox / Projects / Tasks / Documents / Settings | 下部ナビゲーションに同じ5項目 |
| 検索 | サイドバーの上部から `/search` を開く | ヘッダーから `/search` を開く |
| 一覧 | 1件の項目を横方向にも並べる | 1件を複数行に組み替える |
| 状態フィルター | チップを横に並べる | チップを横スクロールできるようにする |
| Project のタブ | 横に並べる | 横スクロールできるようにする |
| フォーム | 関連する短い項目は2列にできる | 1列にする |
| ダイアログ | 画面の中央 | 画面幅いっぱい |

- スマホでも項目や操作をなくさない。一覧に収まらない詳細は、そのリソースの詳細画面で読めるようにする
- 横スクロールを前提にした表は作らず、一覧の1件を縦方向に組み替える。状態のチップとProjectのタブだけは横スクロールを許す
- hover でしか現れない操作を作らず、タップする場所は44px程度を確保する
- グローバルナビゲーションは `AppShell` の共通部品に閉じる。実装時に実際のスマホ幅で確認し、5項目が窮屈であれば、設計書と判断記録を更新したうえでハンバーガーメニュー等へ変更できる。主要5画面へ到達できること、現在地が分かること、すべての操作を使えることは変えない
