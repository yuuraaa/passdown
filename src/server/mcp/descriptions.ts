/**
 * MCP のツールの説明。エージェントが読んで、いつ・どう使うかが分かる文にする。
 * routes に 'mcp' を含む操作には必ず説明を書く（無ければ登録のときにエラーになる）。
 */
export const toolDescriptions: Record<string, string> = {
  capture_inbox_item:
    '整理すると Project / Task / Document のいずれかになりうる思いつきを Inbox に入れる。どれにもならない単なるメモは入れない。',
  list_inbox_items: 'Inbox Item を状態で絞り込んで一覧する。既定では未整理の Item を返す。',
  update_inbox_item: 'untriaged の Inbox Item の本文を更新する。更新前に読み、version を渡す。',
  convert_inbox_item:
    'untriaged の Inbox Item を Project / Task / Document に変換する。変換先の作成項目を指定し、Item は整理済みになる。',
  archive_inbox_item:
    '基準に合わない untriaged の Inbox Item を archive する。archive は取り消せない。',
  list_projects: 'Project を状態で絞り込んで一覧する。',
  create_project:
    'Project を作る。概要、エージェント向け instructions、関連リポジトリ、文脈として参照する Document を必要に応じて指定する。',
  update_project:
    'active な Project の項目と参照 Document を更新する。更新前に読み、version を渡す。状態は変更できない。',
  get_project_context:
    'Project の概要・instructions、終わっていない Task、参照する active Document を作業文脈として取得する。詳細は個別のツールで読む。',
  list_actors: 'Task の担当に指定できる Actor の名前と種別を返す。権限やトークンは返さない。',
  create_task:
    'Task を作る。何をするか（description）と何を満たせば完了か（acceptanceCriteria）を書き、必要なら担当・親 Task・Project を指定する。作った Task は todo になる。',
  start_task:
    '担当の todo の Task に着手し、in_progress にする。親 Task が todo なら、親も自動で in_progress になる。',
  list_tasks:
    'Task を状態・Project・担当で絞り込んで一覧する。過去の Task の経緯を探すときにも使う。',
  list_actionable_tasks:
    '自分が担当する todo のうち、子 Task を持たない着手可能な Task を優先度順で返す。',
  get_task: 'Task の本文、コメント、親子関係、参照 Document を読む。作業の再開前に必ず使う。',
  update_task:
    '終わっていない Task の項目、担当、親、Project、参照 Document を更新する。更新前に読み、version を渡す。状態は変更できない。',
  add_task_comment: 'Task にコメントを追加する。コメントだけでは状態を変更しない。',
  block_task: '作業を続けられない in_progress の Task を、理由とともに blocked にする。',
  request_task_review: '完了した in_progress の Task に成果を記録して review に出す。',
  return_task_to_todo:
    'blocked の回答または review の差し戻し理由をコメントに残し、Task を todo に戻す。',
  get_document: 'Document の本文・タグを読む。作業の文脈として必要な資料を確認するときに使う。',
  create_document:
    '作業の文脈になる Markdown 資料を作る。タグを付ける前に既存のタグを確認し、同じ意味の別表記を増やさない。',
  update_document:
    'active な Document のタイトル・本文・タグを更新する。更新前に読み、返された version を渡す。タグは既存の表記に揃える。',
  archive_document:
    '不要になった active な Document を archive する。archive は取り消せず、以後その Document は更新できない。',
  search:
    'Task（コメントを含む）と Document を横断して検索する。キーワードは空白で区切り、すべての語に部分一致するものを返す。Project・タグ・Actor・状態・日時でも絞り込める。',
}

/** Document を作成・更新するエージェントに、表記を揃えるための既存タグを示す。 */
export function descriptionWithDocumentTags(name: string, tags: readonly string[]): string {
  const description = toolDescriptions[name]
  if (!description) {
    throw new Error(`MCP のツールの説明がありません: ${name}`)
  }
  if (name !== 'create_document' && name !== 'update_document') {
    return description
  }
  const existing = tags.length === 0 ? 'なし' : tags.join('、')
  return `${description}\n既存のタグ: ${existing}`
}
