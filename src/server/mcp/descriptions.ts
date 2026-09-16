/**
 * MCP のツールの説明。エージェントが読んで、いつ・どう使うかが分かる文にする。
 * routes に 'mcp' を含む操作には必ず説明を書く（無ければ登録のときにエラーになる）。
 */
export const toolDescriptions: Record<string, string> = {
  create_task:
    'Task を作る。何をするか（description）と何を満たせば完了か（acceptanceCriteria）を書き、必要なら担当・親 Task・Project を指定する。作った Task は todo になる。',
  start_task:
    '担当の todo の Task に着手し、in_progress にする。親 Task が todo なら、親も自動で in_progress になる。',
}
