# 検索

[設計書の入口](../Architecture.md)に戻る。章・節番号は分割前の設計書から維持している。

<a id="section-3"></a>

## 3. 検索

要件定義書 10章（日本語の部分一致）・F-SRC-01・F-SRC-02 を、SQLite の LIKE で実現する。全文検索のインデックスは持たない。

<a id="section-3-1"></a>

### 3.1 キーワード

- 入力を空白（半角・全角）で区切り、すべての語を含むもの（AND）に当てる
- 各語は、対象の項目のどれかに部分一致すれば当たる（`LIKE '%語%' ESCAPE '\'`）。語に含まれる `%`・`_`・`\` はエスケープする
- 英字の大文字・小文字は区別しない（LIKE の既定。ASCII の範囲だけ）。全角・半角などの正規化はしない
- 1文字・2文字の語も、ほかの語と同じように当たる

<a id="section-3-2"></a>

### 3.2 対象の項目

| 対象 | 項目 |
|---|---|
| Task | title・description・result・blocked_reason・コメントの body |
| Document | title・content |

- Task は、Task 自体の項目か、そのコメントのどれかに当たれば結果に含める
- Task の項目とコメントは別々の SELECT で検索し、Task の ID でまとめる。コメントの条件を相関サブクエリ（EXISTS）にして Task の条件と OR でつなぐと、極端に遅くなる（計測では5分以上かかった）

<a id="section-3-3"></a>

### 3.3 絞り込み

- project / tag / actor / 状態 / 作成日時・更新日時の期間（F-SRC-02）は、キーワードの条件と同じ SQL の WHERE に AND で加える
- ただし、Document の project での絞り込み（その Project が参照している Document）は、Project の参照を持つ project モジュールの関数から Document の id の一覧を受け取り、その id で絞り込む。他のモジュールのテーブルを直接読まないため（[ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5)）
- read 権限を持たないリソース（Task / Document）は、結果に含めない（F-AUTH-07）

<a id="section-3-4"></a>

### 3.4 性能

- SQLite 3.45.1・インメモリの DB で、Task 3万件・コメント15万件（本文あわせて約5,000万文字、想定の規模より大幅に多い）を LIKE で全件走査すると、一番遅い場合でも Task が約80ms、コメントが約250msだった
- 検索の入口は、業務ロジックの search モジュールの1つの関数にまとめる。Task・コメントを読む SQL は task モジュール、Document を読む SQL は document モジュールの読み取りの関数に置く（[ソフトウェアの構成「モジュールをまたぐ参照」](Software.md#section-4-5)）。遅くなったら、これらの読み取りの関数の中だけで trigram の全文検索を足せる（REST API・MCP・search モジュールの入口は変わらない）

<a id="section-3-5"></a>

### 3.5 結果の並び順と返す単位

#### 返す単位

- Task と Document は1本のリストに混ぜず、それぞれの配列で返す。2つを貫く並び順の基準と件数の配分を決めずに済み、画面でも分けて見せられるため
- Task は、当たった場所がいくつあっても Task 1件につき結果1件にする。Task 自体のどの項目に当たったかと、当たったコメント（id・本文・投稿日時）を、その1件に添える
- Document も1件につき結果1件とし、title・content のどちらに当たったかを添える
- 当たった箇所の抜粋（スニペット）は返さない。Task の description・result・blocked_reason と Document の content は長くなりうるため、当たった項目の名前だけを返し、本文は `get_task`・`get_document`（画面では詳細の画面）で読む
- コメントだけは本文をそのまま返す。コメントは短く、過去の判断をコメントから確かめる用途（要件定義書 S-06）で、本文が見えないと次に何を開くか決められないため

Task の結果の形（MCP での例。項目名は [REST API「応答の形」](REST_API.md#section-7-6) のとおりキャメルケース）:

```
{
  id: "task:24",
  title: "承認フローの設計",
  status: "in_progress",
  updatedAt: "...",
  matchedFields: ["title"],
  matchedComments: [
    { id: "comment:101", body: "...", createdAt: "..." }
  ]
}
```

- この形は、Task の項目とコメントを別々の SELECT で検索して Task の ID でまとめる（[検索「対象の項目」](Search.md#section-3-2)）結果をそのまま表す

#### 並び順

- Task・Document とも、更新日時の新しい順（`ORDER BY updated_at DESC, id DESC`）で返す
- `matchedComments` は、Task のコメントと同じく id の順（投稿した順、[テーブル設計「Task」](Database.md#section-5-5)）に並べる
- 並び順は経路で変えない。REST API・MCP とも同じ順で返す

#### 件数の上限

- 既定で50件まで返し、呼び出し側が指定できる上限は200件とする。打ち切ったときは、当たった総数を添える
- `matchedComments` は Task ごとに最大5件。当たったコメントが多いときは新しい方から5件を選び、並べるときは id の順にする
- 上限を件数で持つ考え方は [MCP のツール「返す量の上限」](MCP.md#section-6-2) と同じ
