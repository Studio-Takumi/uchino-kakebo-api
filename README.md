# uchino-kakebo-api

ウチの家計簿へ支出を一括追加するための API（AWS API Gateway + Lambda、バックエンドは Supabase）。
スクショから起こした支出を `POST /expenses` で流し込むのが用途。仕様は [`doc/api-spec.md`](./doc/api-spec.md)。

## 構成

```
uchino-kakebo-api/
├─ template.yaml           # SAM: API Gateway(REST, x-api-key) + Lambda 1本
├─ package.json
├─ tsconfig.json
├─ env.example.json        # sam local 用の env（コピーして env.json に）
├─ samconfig.example.toml  # sam deploy 用の設定（コピーして samconfig.toml に）
├─ doc/
│  └─ api-spec.md          # API 仕様（v1）
└─ src/
   ├─ handler.ts           # ルーター（METHOD + resource で dispatch）
   ├─ types.ts             # DB 準拠の型
   ├─ lib/
   │  ├─ response.ts       # JSON / error レスポンスヘルパ
   │  └─ supabase.ts       # service_role クライアント & USER_ID
   └─ routes/              # 各エンドポイント（現状スタブ）
      ├─ getMethods.ts
      ├─ getCategories.ts
      ├─ getExpenses.ts
      └─ postExpenses.ts
```

- Lambda は **1本**。API Gateway の4ルートを全て同じ関数に向け、`handler.ts` が内部で振り分ける。
- ビルドは SAM の esbuild（`template.yaml` の `Metadata`）。Docker 不要でビルド可能。

## 前提ツール（deploy する人＝要インストール）

このリポジトリのあるマシンには現状 **AWS CLI / SAM CLI / Docker は未インストール**。deploy まで進めるには：

| ツール | 用途 | 必須 |
| --- | --- | --- |
| Node.js 20+ | ビルド | ✅ |
| AWS CLI v2 | 認証・鍵取得 | ✅ |
| AWS SAM CLI | build / deploy | ✅ |
| Docker | `sam local`（ローカル実行）だけ必要 | 任意 |

macOS（Homebrew）例:

```bash
brew install awscli aws-sam-cli
```

AWS 認証情報の設定（**この操作は本人が行う。鍵はチャットに貼らない**）:

```bash
aws configure
```

- IAM ユーザー/ロールは CloudFormation / Lambda / API Gateway / IAM / S3 / CloudWatch Logs への権限が必要。個人アカウントなら `AdministratorAccess` が手っ取り早い。
- リージョンは `ap-northeast-1`（東京）想定（`samconfig.example.toml` の既定）。

## セットアップ

```bash
cd uchino-kakebo-api
npm install
cp samconfig.example.toml samconfig.toml   # 値を埋める（Supabase URL / service_role / user_id）
cp env.example.json env.json               # ローカル実行する場合のみ
```

`samconfig.toml` と `env.json` は `.gitignore` 済み（秘密情報を含むため）。

## デプロイ

```bash
npm run build        # = sam build（esbuild で TS をバンドル）
npm run deploy       # = sam deploy（samconfig.toml のパラメータを使用）
# 初回だけ対話設定したい場合: npm run deploy:guided
```

デプロイ後、出力の `ApiBaseUrl` が API のベース URL。

### API キーの取り出し

`x-api-key` の値は SAM が生成する。デプロイ後に取得:

```bash
# スタックの API キー ID を調べて値ごと表示
aws apigateway get-api-keys --include-values \
  --query "items[?contains(name, 'uchino-kakebo-api')].{name:name,value:value}"
```

この値を呼び出し側（MCP）の env に設定する。

## ローカル実行（任意 / Docker 必要）

```bash
npm run local        # = sam local start-api --env-vars env.json
curl -H "x-api-key: dummy" http://127.0.0.1:3000/methods   # 現状は 501 が返る
```

## 動作確認（deploy 後・スタブ状態）

```bash
curl -H "x-api-key: <KEY>" "<ApiBaseUrl>/methods"
# => {"error":{"code":"NOT_IMPLEMENTED","message":"GET /methods is not implemented yet"}}
```

ここまで通れば「API Gateway → Lambda → ルーティング → レスポンス」の配線はOK。あとは各ルートの実装を入れるだけ。

## テスト

2層構成:

- **単体（DB不要・即実行）** … `tests/expensesQuery.test.ts`。`GET /expenses` のクエリ検証ロジック（`src/routes/expensesQuery.ts`）を純粋関数として検証。
- **統合（ローカルSupabase必要）** … `tests/getExpenses.int.test.ts`。実際の Postgres + PostgREST に対してハンドラを叩き、クエリの組み合わせ（日付/金額範囲・タイトル部分一致・ワイルドカードのエスケープ・null末尾ソート・limit）を検証。`RUN_DB_TESTS=1` のときだけ実行され、未設定なら自動スキップ。

```bash
npm test          # 単体のみ（統合は自動スキップ）
npm run test:db   # 統合も実行（要ローカルSupabase）
```

### 統合テストの前提（Docker + Supabase CLI）

```bash
brew install --cask docker      # Docker Desktop（起動しておく）
brew install supabase/tap/supabase
```

```bash
cd uchino-kakebo-api
supabase start          # ローカルに Postgres + PostgREST を起動
supabase db reset       # supabase/migrations + supabase/seed.sql を適用
npm run test:db
```

- スキーマは `supabase/migrations/0001_init.sql`、シードは `supabase/seed.sql`（本番テーブルを再現。**ローカル専用**。本番には適用しない）。
- 統合テストはローカルの既定値（URL `http://127.0.0.1:54321` / demo service_role キー / seed の `USER_ID`）を使用。異なる場合は環境変数で上書き可。

## 次のステップ（未着手）

1. 各 `src/routes/*.ts` の実装（`doc/api-spec.md` 準拠。各ファイルの TODO コメント参照）
2. import 用の core モジュール（名前→id 解決 / dedupe / 採番）
3. その core を包む MCP サーバ（`list_methods` / `list_categories` / `recent_expenses` / `preview_import` / `commit_import`）
