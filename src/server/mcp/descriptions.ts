/**
 * MCP のツールの説明。エージェントが読んで、いつ・どう使うかが分かる文にする。
 * routes に 'mcp' を含む操作には必ず説明を書く（無ければ登録のときにエラーになる）。
 */
export const toolDescriptions: Record<string, string> = {
  list_actors: 'Task の担当に指定できる Actor の名前と種別を返す。権限やトークンは返さない。',
  create_task:
    'Task を作る。何をするか（description）と何を満たせば完了か（acceptanceCriteria）を書き、必要なら担当・親 Task・Project を指定する。作った Task は todo になる。',
  start_task:
    '担当の todo の Task に着手し、in_progress にする。親 Task が todo なら、親も自動で in_progress になる。',
  get_document: 'Document の本文・タグを読む。作業の文脈として必要な資料を確認するときに使う。',
  create_document:
    '作業の文脈になる Markdown 資料を作る。タグを付ける前に既存のタグを確認し、同じ意味の別表記を増やさない。',
  update_document:
    'active な Document のタイトル・本文・タグを更新する。更新前に読み、返された version を渡す。タグは既存の表記に揃える。',
  archive_document:
    '不要になった active な Document を archive する。archive は取り消せず、以後その Document は更新できない。',
}
