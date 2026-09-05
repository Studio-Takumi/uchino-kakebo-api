# ウチの家計簿 追加API 仕様（v1）

スクショ（PayPay / Suica 等）から起こした支出を、家計簿の Supabase に**一括追加**するための API。
読み取り・分類・重複除外は呼び出し側（MCP / Claude）が担い、この API は「引ける・足せる」だけの薄い canonical 層に徹する。

## スコープ

- `GET /methods` / `GET /categories` / `GET /expenses` / `POST /expenses` の4本
- 追加のみ。**編集・削除はスコープ外**
- 単一ユーザー前提（`user_id` はサーバが env から注入）

## 認証・前提

- **クライアント→API**: `x-api-key` ヘッダ（API Gateway の API キー＋Usage Plan）。呼び出し側はこのキーだけを持つ。
- **API→Supabase**: Lambda env に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `USER_ID`。service_role は RLS をバイパスするため、全クエリで `user_id = USER_ID` を明示する。
- クライアントは `user_id` を送受信しない。
- 形式は JSON。`date` = `YYYY-MM-DD`、timestamp = ISO8601。

## 共通エラー形式

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ { "index": 3, "field": "category_id", "message": "..." } ] } }
```

| status | code | 意味 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 入力不正（POST は原子的に全件拒否） |
| 400 | `BAD_REQUEST` | クエリ/ボディの形式不正 |
| 403 | (API Gateway) | `x-api-key` 不正・欠落 |
| 404 | `NOT_FOUND` | ルート無し |
| 500 | `INTERNAL_ERROR` | 想定外 |

---

## GET /methods

支払方法一覧（`priority` 昇順）。

**200**
```json
[
  { "method_id": "uuid", "method": "PayPay", "color": "red", "priority": 1 },
  { "method_id": "uuid", "method": "Suica",  "color": "sky", "priority": 2 }
]
```

## GET /categories

カテゴリ一覧（`priority` 昇順）。デフォルト絵文字・デフォルト支払方法・収支フラグ込み。

**200**
```json
[
  { "category_id": "uuid", "category": "食費", "color": "orange",
    "priority": 1, "emoji": "🍚", "method_id": "uuid", "is_income": false }
]
```

## GET /expenses

支出取得。「dedupe 用の期間取得」と「分類学習用の直近取得」を兼ねる。

**クエリパラメータ（すべて任意）**

| param | 説明 | 既定 |
| --- | --- | --- |
| `from` | `date >= from`（含む、`YYYY-MM-DD`） | なし |
| `to` | `date <= to`（含む、`YYYY-MM-DD`） | なし |
| `min` | `expenses >= min`（整数・0以上・含む） | なし |
| `max` | `expenses <= max`（整数・0以上・含む） | なし |
| `title` | タイトルの部分一致（大文字小文字無視、`ilike`） | なし |
| `method_id` | 支払方法で絞る | なし |
| `category_id` | カテゴリで絞る | なし |
| `order` | `<date\|expenses>.<asc\|desc>` | `date.desc` |
| `limit` | 最大件数（上限 1000） | 200 |

- `order` の許可カラムは `date` / `expenses` のみ（allowlist）。`expenses` 指定時は同額の並びを安定させるため `date` 降順を第2キーにする。
- `min > max` は 400。

**用途例**
- dedupe: `GET /expenses?from=2026-09-01&to=2026-09-30`
- 分類学習: `GET /expenses?order=date.desc&limit=200`

**200**: `expenses` 行の配列（`user_id` は省略可）。
```json
[
  { "id": "uuid", "date": "2026-09-14", "expenses": 480, "title": "セブン-イレブン",
    "emoji": "🍙", "method_id": "uuid", "category_id": "uuid", "comment": "",
    "created_time": "2026-09-30T13:00:00.000Z", "last_edited_time": "2026-09-30T13:00:00.000Z" }
]
```

## POST /expenses

支出の一括追加。ボディは**素の配列**。

**リクエスト**
```json
[
  {
    "date": "2026-09-14",
    "expenses": 480,
    "title": "セブン-イレブン",
    "method_id": "uuid",
    "category_id": "uuid",
    "emoji": "🍙",
    "comment": "created by claude at 2026/09/06"
  }
]
```

**サーバが生成／注入**（クライアント値は使わない）
- `id`（uuidv7、リクエストに `id` が来ても無視）
- `user_id`（env）
- `created_time` = now
- `last_edited_time` = now

**バリデーション（各要素）**

| field | ルール |
| --- | --- |
| `expenses` | 整数 かつ ≥ 0 |
| `date` | `YYYY-MM-DD` として妥当 |
| `title` | 空でない文字列 |
| `method_id` | そのユーザーに実在 |
| `category_id` | そのユーザーに実在 |
| `emoji` | 任意。省略時はカテゴリのデフォルト emoji で補完 |
| `comment` | 任意。省略時 `""` |

**原子性**: オールオアナッシング。1件でも不正なら何も入れず 400 ＋各要素のエラー。
**冪等性**: 持たない（同一内容の再送はそのまま重複登録される）。重複防止は呼び出し側が `GET /expenses` と突合して行う。運用上の事故った再送は手動削除で対応。

**201**
```json
{
  "inserted": 12,
  "items": [
    { "id": "uuid", "date": "2026-09-14", "expenses": 480, "title": "セブン-イレブン",
      "emoji": "🍙", "method_id": "uuid", "category_id": "uuid",
      "comment": "created by claude at 2026/09/06",
      "created_time": "2026-09-30T13:00:00.000Z", "last_edited_time": "2026-09-30T13:00:00.000Z" }
  ]
}
```

**400（例）**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "2 of 13 items are invalid; nothing was inserted.",
    "details": [
      { "index": 3, "field": "category_id", "message": "category_id not found for user" },
      { "index": 7, "field": "expenses", "message": "must be an integer >= 0" }
    ]
  }
}
```

---

## 役割分担

| ステップ | 担い手 |
| --- | --- |
| 実データ参照（分類・dedupe の材料） | `GET /methods` `GET /categories` `GET /expenses` |
| OCR・名前→id 解決・分類・emoji 判断・前入力の混入除外 | 呼び出し側（MCP / Claude） |
| 投入 | `POST /expenses`（配列・原子的・server 採番） |

API は dedupe と冪等性を**持たない**。知能は呼び出し側に寄せる。

## DB スキーマ（参考・変更しない）

- `expenses(user_id, id PK, created_time, last_edited_time, title, emoji, expenses int, comment, date, method_id, category_id)`
- `methods(user_id, method_id PK, method, color, priority)`
- `categories(user_id, category_id PK, category, color, priority, emoji, method_id, is_income)`
