import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'

/**
 * 設計書 2.8 の5つの規則を eslint-plugin-boundaries で機械的に守る。
 *
 * 要素の種類（boundaries/elements）はフォルダ単位、モジュールの中のファイルの役割
 * （boundaries/files）はファイル単位で宣言する。モジュール名は capture（family）で
 * 取り、「同じモジュールかどうか」を policy の中で比較できるようにする。
 *
 * 同じ要素の中の import は既定で検査されない（checkInternals: false）ため、
 * 例えば task/operations.ts → task/schema.ts は対象外になる。
 * 後ろの policy が前の policy を上書きする。
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'drizzle/**', 'node_modules/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      // 相対 import を .ts のファイルまで解決させる。解決できないと、その import は
      // 検査されずに素通りしてしまう（boundaries/no-unknown-dependencies で気づけるようにもする）
      'import/resolver': {
        typescript: {
          project: ['tsconfig.server.json', 'tsconfig.web.json'],
          noWarnOnMultipleProjects: true,
        },
      },
      'boundaries/elements': [
        // 業務ロジックの層。モジュール名を family として取る（設計書 4.4）
        {
          type: 'module',
          pattern: 'src/server/modules/*',
          capture: ['family'],
          partialMatch: false,
        },
        // DB への接続・マイグレーション
        { type: 'db', pattern: 'src/server/db', partialMatch: false },
        // 経路の層（設計書 4.1）
        { type: 'route', pattern: 'src/server/http', partialMatch: false },
        { type: 'route', pattern: 'src/server/mcp', partialMatch: false },
        // Web UI
        { type: 'web', pattern: 'src/web', partialMatch: false },
      ],
      'boundaries/files': [
        { category: 'index', pattern: 'src/server/modules/*/index.ts' },
        { category: 'inputs', pattern: 'src/server/modules/*/inputs.ts' },
        { category: 'schema', pattern: 'src/server/modules/*/schema.ts' },
        { category: 'operations', pattern: 'src/server/modules/*/operations.ts' },
        { category: 'operations', pattern: 'src/server/modules/*/operations/**/*.ts' },
        { category: 'rules', pattern: 'src/server/modules/*/rules.ts' },
        { category: 'rules', pattern: 'src/server/modules/*/rules/**/*.ts' },
      ],
    },
    rules: {
      // 解決できない import があると境界の検査が素通りするため、必ず気づけるようにする
      'boundaries/no-unknown-dependencies': ['error', { require: 'element' }],
      'boundaries/no-unknown-files': 'off',

      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          // 外部パッケージと Node の組み込みも検査の対象にする（規則3・規則5）
          checkAllOrigins: true,
          message:
            '設計書 4.4・4.5 の境界に反する import です（{{from.element.type}} → {{to.element.type}}）',
          policies: [
            // 外部パッケージと Node の組み込みは、既定では誰が使ってもよい。
            // 制限は後ろの policy で個別に足す
            {
              allow: { to: { module: { origin: ['external', 'core'] } } },
            },

            // 規則2: モジュールの外からは index.ts だけを import する（設計書 4.5・D-102）。
            // 規則1（操作の関数から他のモジュールの schema.ts を import しない）も、
            // index.ts 以外を許可しないことで同時に守られる
            {
              from: { element: { type: 'module' } },
              disallow: { to: { element: { type: 'module' } } },
              message:
                'モジュールの外から import してよいのは index.ts だけです（設計書 4.5・D-102）',
            },
            {
              from: { element: { type: 'module' } },
              allow: { to: { element: { type: 'module' }, file: { categories: 'index' } } },
            },
            // 規則2の例外: schema.ts は外部キーの参照のため、他のモジュールの
            // schema.ts を import してよい（設計書 4.5）
            {
              from: { element: { type: 'module' }, file: { categories: 'schema' } },
              allow: { to: { element: { type: 'module' }, file: { categories: 'schema' } } },
            },

            // 規則5: inputs.ts が import してよいのは zod と、他のモジュールの
            // inputs.ts だけ（設計書 4.7）。ブラウザでも動かすため
            {
              from: { element: { type: 'module' }, file: { categories: 'inputs' } },
              disallow: { to: { element: { type: '*' } } },
              message:
                'inputs.ts はブラウザで動かすため、import してよいのは zod と他のモジュールの inputs.ts だけです（設計書 4.7）',
            },
            {
              from: { element: { type: 'module' }, file: { categories: 'inputs' } },
              disallow: { to: { module: { origin: ['external', 'core'], source: '!zod' } } },
              message:
                'inputs.ts はブラウザで動かすため、zod 以外の外部パッケージを import しないでください（設計書 4.7）',
            },
            {
              from: { element: { type: 'module' }, file: { categories: 'inputs' } },
              allow: { to: { element: { type: 'module' }, file: { categories: 'inputs' } } },
            },

            // db/ は業務ロジックの層から import しない。接続は ctx.db で受け取る（設計書 4.4）
            {
              from: { element: { type: 'module' } },
              disallow: { to: { element: { type: 'db' } } },
              message: 'DB の接続は import せず ctx.db を使ってください（設計書 4.2・4.4）',
            },

            // 経路の層から使ってよいのは modules/*/index.ts だけ（設計書 4.4）
            {
              from: { element: { type: 'route' } },
              disallow: { to: { element: { type: 'module' } } },
              message:
                '経路の層から import してよいのは modules/*/index.ts だけです（設計書 4.4・4.5）',
            },
            {
              from: { element: { type: 'route' } },
              allow: { to: { element: { type: 'module' }, file: { categories: 'index' } } },
            },
            // 規則3: 経路の層から DB を読み書きしない（設計書 4.1）。
            // db/・他モジュールの schema.ts・SQLite のドライバー・Drizzle のすべてを塞ぐ
            {
              from: { element: { type: 'route' } },
              disallow: [
                { to: { element: { type: 'db' } } },
                { to: { element: { type: 'module' }, file: { categories: 'schema' } } },
                { to: { module: { source: ['drizzle-orm', 'better-sqlite3'] } } },
              ],
              message: '経路の層から DB を読み書きしないでください（設計書 4.1）',
            },

            // 規則4: Web UI にサーバーの実行コードを含めない（設計書 4.8・D-101）。
            // 実行時に import してよいのは modules/*/inputs.ts だけで、
            // それ以外のサーバーのコードは import type でだけ参照してよい
            {
              from: { element: { type: 'web' } },
              disallow: { to: { element: { type: '*' } } },
              message:
                'Web UI から実行時に import してよいサーバーのコードは modules/*/inputs.ts だけです。ほかは import type を使ってください（設計書 4.7・4.8）',
            },
            {
              from: { element: { type: 'web' } },
              allow: { to: { element: { type: 'module' }, file: { categories: 'inputs' } } },
            },
            {
              from: { element: { type: 'web' } },
              dependency: { kind: 'type' },
              allow: { to: { element: { type: '*' } } },
            },
          ],
        },
      ],
    },
  },
  // 設定ファイルは型情報つきの検査の対象にしない
  {
    files: ['*.{js,ts}'],
    ...tseslint.configs.disableTypeChecked,
  },
)
