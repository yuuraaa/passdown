# MCP のツール

[設計書の入口](../Architecture.md)に戻る。章・節番号は分割前の設計書から維持している。

<a id="section-6"></a>

## 6. MCP のツール

<a id="section-6-1"></a>

### 6.1 ツール名

名前は `動詞_対象` の snake_case にする。要件定義書 8.2 の仮の名前を基本そのまま使い、対象が名前に出ていないものだけ直した。

| 分類 | ツール |
|---|---|
| 文脈取得 | `get_project_context` |
| Inbox | `capture_inbox_item` / `list_inbox_items` / `update_inbox_item` / `convert_inbox_item` / `archive_inbox_item` |
| Project | `list_projects` / `create_project` / `update_project` |
| Task | `list_actionable_tasks` / `list_tasks` / `get_task` / `create_task` / `update_task` |
| Actor | `list_actors` |
| Task 作業 | `start_task` / `block_task` / `request_task_review` / `add_task_comment` / `return_task_to_todo` |
| Document | `get_document` / `create_document` / `update_document` / `archive_document` |
| 検索 | `search` |

- `capture_inbox`・`list_inbox` は、対象を `inbox_item` に揃えた。`request_review`・`add_comment`・`return_to_todo` は、対象（Task）を名前に足した
- `search` だけは対象を付けない。Task と Document にまたがるため
- `passdown_` のような接頭辞は付けない。ツールはサーバー単位で区別され、名前が長いとその分エージェントのコンテキストを使うため
- ツールは、リクエストのたびに権限に合うものだけを登録する（[技術スタック「MCP: 公式 SDK v2 をステートレスで使う」](Technology.md#section-2-3)）

<a id="section-6-2"></a>

### 6.2 返す量の上限

要件定義書 8.3 の「`get_project_context` の返却量に上限を設け、詳細は個別ツールで取りに行く」を、次のように決める。

- 上限は件数で持つ。長い本文はそもそも返さない
- `description`・`instructions` は全文返す。オーナーが書く短い文章で、途中で切ると意味が壊れるため
- 終わっていない Task は、id・title・status・priority・担当だけを返す。description・result は返さない。priority の高い順、同じなら作成の古い順（着手する順、要件定義書 S-02・S-03）に並べ、50件まで
- Project が参照する active な Document は、id・title・タグだけを返す。content は返さない。50件まで
- 上限で打ち切ったときは、打ち切ったことと残りの件数を添える。詳細は `get_task`・`get_document` で取りに行く

文字数やトークン数で切る形は採らない。量の大半は本文で、本文を返さないと決めれば残るのは件数だけで足りる。文字数で切ると、途中で切れた本文が混ざり、何件返るかも呼ぶ前に分からないため。
