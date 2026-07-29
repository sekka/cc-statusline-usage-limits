# fetcher 契約バージョン検出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fetcher が書く cache レコードに契約バージョンを持たせ、renderer が古い fetcher を検出して statusline に表示する。

**Architecture:** fetcher (`limits-fetch.entry.ts`) が `CONTRACT_VERSION = 2` を全レコードに書き込む。renderer (`statusline.mjs`) は cache.json を生パースして `contractVersion` を読み、期待値より小さければ黄色の警告行を出す。値の表示は変更しない。

**Tech Stack:** Bun (test runner + bundler)、Node ESM、TypeScript entry → 生成 `.mjs`

## Global Constraints

- `scripts/limits-fetch.mjs` は生成物。`scripts/limits-fetch.entry.ts` を編集し `bun run generate:limits-fetch` で再生成する。`.mjs` を直接編集しない
- `bun run check:limits-fetch` が生成物と entry の同期を検証する。コミット前に必ず通す
- `scripts/sync.sh` を変更しない (TASK-4 の判断を維持)
- fetcher の資格情報の読み取り経路と送信先を変更しない
- コメントは現状のコードを理解するのに必要なものだけ。履歴コメント禁止
- テストコマンドは `bun test` (package.json の `test` = `bun test scripts/*.test.ts`)
- 契約は追加のみで変更する。フィールドの削除や意味の変更を行う場合に版を上げる

---

### Task 1: fetcher が契約バージョンを書く

**Files:**

- Modify: `scripts/limits-fetch.entry.ts:71-91` (`successRecord` / `failureRecord`)
- Regenerate: `scripts/limits-fetch.mjs`
- Test: `scripts/limits-fetch.test.ts`

**Interfaces:**

- Consumes: なし
- Produces: `CONTRACT_VERSION: number` (値 `2`) を `scripts/limits-fetch.entry.ts` から export。`successRecord(data: unknown, now?: number)` と `failureRecord(existing: any, failure: FailureInfo, now?: number)` の戻り値に `contractVersion: number` を追加。Task 2 はこの値と同じ数値を renderer 側の期待値に持つ

- [ ] **Step 1: 失敗するテストを書く**

`scripts/limits-fetch.test.ts` の `describe("limits-fetch.mjs", ...)` 内に追加する。
既存 import 行 (`from "./limits-fetch.mjs"`) に `CONTRACT_VERSION` を足すこと。

```ts
test("CONTRACT_VERSION は 2", () => {
  expect(CONTRACT_VERSION).toBe(2);
});

test("success record は contractVersion を含む", () => {
  expect(successRecord({ five_hour: null }, 100)).toMatchObject({
    contractVersion: 2,
    timestamp: 100,
    lastAttempt: 100,
    consecutiveFailures: 0,
    lastError: null,
  });
});

test("failure record は contractVersion を含む", () => {
  expect(failureRecord({ timestamp: 50 }, { type: "http_error", status: 500 }, 100)).toMatchObject({
    contractVersion: 2,
    timestamp: 50,
    lastAttempt: 100,
    consecutiveFailures: 1,
  });
});

test("既存レコードの古い contractVersion は現在値で上書きする", () => {
  expect(
    failureRecord({ timestamp: 50, contractVersion: 1 }, { type: "network" }, 100),
  ).toMatchObject({ contractVersion: 2 });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認する**

Run: `bun test scripts/limits-fetch.test.ts`
Expected: FAIL。`CONTRACT_VERSION` が export されていないためインポートエラー、または `undefined` との比較で失敗する。実際の出力を記録する。

- [ ] **Step 3: 最小の実装を書く**

`scripts/limits-fetch.entry.ts` の `successRecord` の直前に定数を置き、両レコードに足す。

```ts
export const CONTRACT_VERSION = 2;

export function successRecord(data: unknown, now = Date.now()) {
  return {
    contractVersion: CONTRACT_VERSION,
    timestamp: now,
    lastAttempt: now,
    consecutiveFailures: 0,
    lastError: null,
    data,
  };
}
```

`failureRecord` の戻り値オブジェクトの先頭に同じ行を足す。

```ts
return {
  contractVersion: CONTRACT_VERSION,
  timestamp: existing?.timestamp,
  lastAttempt: now,
  consecutiveFailures,
  lastError: { ...failure, at: now },
  data: existing?.data,
};
```

`existing?.contractVersion` は読まない。常に現在の `CONTRACT_VERSION` を書く。

- [ ] **Step 4: 生成物を再生成する**

Run: `bun run generate:limits-fetch`
続けて Run: `bun run check:limits-fetch`
Expected: どちらも exit 0。`check` が落ちる場合は生成が反映されていない。

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `bun test`
Expected: PASS。既存テストも全て通ること。実際の出力を記録する。

- [ ] **Step 6: コミット**

```bash
git add scripts/limits-fetch.entry.ts scripts/limits-fetch.mjs scripts/limits-fetch.test.ts
git commit -m "feat: fetcher が書くレコードに契約バージョンを含める"
```

---

### Task 2: renderer が版ずれを検出して表示する

**Files:**

- Modify: `scripts/statusline.mjs` (定数追加、`readFetcherContract` 追加、`renderStatusline` の表示分岐、`main`)
- Test: `scripts/statusline.test.ts`

**Interfaces:**

- Consumes: Task 1 の `CONTRACT_VERSION = 2`。renderer 側は独立した定数 `EXPECTED_FETCHER_CONTRACT = 2` として同じ数値を持つ (renderer は fetcher を import しない)
- Produces: `readFetcherContract(cacheFile?: string): number | null` を export。`renderStatusline(input, options)` の `options` に `fetcherContractStale: boolean` を追加

**設計上の注意:** 既存の `readCache` は `!record.data` のとき `null` を返す (`statusline.mjs:59-74`)。一度も成功していない fetcher のレコードには `data` キーが無いため、`readCache` 経由では検出できない。`readFetcherContract` は `parseCache` を通さず生 JSON をパースする。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/statusline.test.ts` の import に `readFetcherContract` を足し、`describe` 内に追加する。

```ts
test("契約バージョンが一致すれば警告を出さない", () => {
  expect(
    renderStatusline(
      { model: { display_name: "Sonnet 4.5" } },
      { color: false, now: 2000000000000, fetcherContractStale: false },
    ),
  ).toBe("Sonnet 4.5");
});

test("契約バージョンが古ければ警告を出す", () => {
  expect(
    renderStatusline(
      { model: { display_name: "Sonnet 4.5" } },
      { color: false, now: 2000000000000, fetcherContractStale: true },
    ),
  ).toBe("Sonnet 4.5 fetcher が古い → /statusline-limits:install");
});

test("readFetcherContract は contractVersion を返す", async () => {
  const dir = join(tmpdir(), `contract-${process.pid}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const cacheFile = join(dir, "cache.json");
  await writeFile(cacheFile, JSON.stringify({ contractVersion: 2, timestamp: 1, data: {} }));
  expect(readFetcherContract(cacheFile)).toBe(2);
  await rm(dir, { recursive: true, force: true });
});

test("readFetcherContract は版印なしのレコードで 0 を返す", async () => {
  const dir = join(tmpdir(), `contract-${process.pid}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const cacheFile = join(dir, "cache.json");
  await writeFile(cacheFile, JSON.stringify({ timestamp: 1, lastAttempt: 2 }));
  expect(readFetcherContract(cacheFile)).toBe(0);
  await rm(dir, { recursive: true, force: true });
});

test("readFetcherContract は cache.json が無ければ null を返す", () => {
  expect(readFetcherContract(join(tmpdir(), "no-such-cache-file.json"))).toBeNull();
});
```

- [ ] **Step 2: テストを実行して落ちることを確認する**

Run: `bun test scripts/statusline.test.ts`
Expected: FAIL。`readFetcherContract` が未 export、`fetcherContractStale` が無視されて警告行が出ない。実際の出力を記録する。

- [ ] **Step 3: 最小の実装を書く**

`statusline.mjs` の定数群 (`CACHE_MAX_AGE_MS` の近く、25行目付近) に追加する。

```js
const EXPECTED_FETCHER_CONTRACT = 2;
```

`readCache` の直後に追加する。

```js
export function readFetcherContract(cacheFile = defaultCacheFile()) {
  let raw;
  try {
    raw = readFileSync(cacheFile, "utf8");
  } catch {
    return null;
  }
  try {
    const record = JSON.parse(raw);
    if (record === null || typeof record !== "object") return null;
    const version = Number(record.contractVersion);
    return Number.isFinite(version) ? version : 0;
  } catch {
    return null;
  }
}
```

`renderStatusline` の `extendedReapprovalRequired` ブロック (`statusline.mjs:313-315`) の直後に追加する。

```js
if (options.fetcherContractStale) {
  parts.push(color("fetcher が古い → /statusline-limits:install", "yellow", renderOptions));
}
```

`main()` を書き換える。

```js
const contract = readFetcherContract();
const fetcherContractStale = contract !== null && contract < EXPECTED_FETCHER_CONTRACT;
process.stdout.write(
  `${renderStatusline(input, { cache, extendedReapprovalRequired, fetcherContractStale })}\n`,
);
```

`contract === null` (cache.json 無し) と `contract > EXPECTED_FETCHER_CONTRACT` (fetcher の方が新しい) はどちらも警告しない。

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `bun test`
Expected: PASS。既存テストも全て通ること。実際の出力を記録する。

- [ ] **Step 5: 実挙動を確認する**

Run:

```sh
TMP=$(mktemp -d) && mkdir -p "$TMP/.claude/statusline-limits" && \
printf '{"timestamp":1,"lastAttempt":%s,"data":{"five_hour":{"percent":10}}}' "$(node -e 'process.stdout.write(String(Date.now()))')" > "$TMP/.claude/statusline-limits/cache.json" && \
echo '{"model":{"display_name":"X"}}' | HOME="$TMP" NO_COLOR=1 node scripts/statusline.mjs; rm -rf "$TMP"
```

Expected: 出力に `fetcher が古い → /statusline-limits:install` が含まれる。
同じ手順で cache.json に `"contractVersion":2` を足した場合、その行が出ないことも確認する。

- [ ] **Step 6: コミット**

```bash
git add scripts/statusline.mjs scripts/statusline.test.ts
git commit -m "feat: renderer が fetcher の契約バージョンずれを検出して表示する"
```

---

## Self-Review

**1. Spec coverage**

| spec の要求                                                  | 実装するタスク                                            |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `CONTRACT_VERSION = 2` を fetcher に定義、両レコードに含める | Task 1 Step 3                                             |
| `EXPECTED_FETCHER_CONTRACT = 2` を renderer に持つ           | Task 2 Step 3                                             |
| 検出条件 `(contractVersion ?? 0) < EXPECTED`                 | Task 2 Step 3 (`readFetcherContract` が欠落時 `0` を返す) |
| cache.json 無し → 警告しない                                 | Task 2 Step 3 (`contract === null`)、Step 1 のテスト      |
| fetcher の方が新しい → 警告しない                            | Task 2 Step 3 (`<` 比較のみ)                              |
| TASK-12 と同じ経路で表示                                     | Task 2 Step 3                                             |
| 値の扱いを変えない                                           | どのタスクも `mergeLimitItems` / `cacheLimits` に触れない |
| renderer 側テスト4ケース                                     | Task 2 Step 1 (一致・欠落・cache 無し・表示分岐)          |
| fetcher 側テスト3ケース                                      | Task 1 Step 1 (4ケース書いている)                         |
| `sync.sh` 不変                                               | Global Constraints                                        |

spec の「版印が期待より新しい → 警告なし」は Task 2 Step 3 の `<` 比較で満たされるが、
専用のユニットテストは置いていない。`readFetcherContract` が数値を素通しすることは
Step 1 の1つ目のテストで固定済みで、比較は `main()` の1行のため。ここは実装者の判断で
テストを足してよい。

**2. Placeholder scan** — 「TBD」「適切に」「同様に」の類は無し。全コードブロックが実物。

**3. Type consistency** — `CONTRACT_VERSION` (Task 1 export) と `EXPECTED_FETCHER_CONTRACT`
(Task 2 のローカル定数) は別の識別子で、意図的に独立させている。renderer は fetcher を
import しないため。両方 `2`。`readFetcherContract` の戻り値は `number | null` で、
Task 2 Step 3 の `contract !== null && contract < ...` と整合する。

## リリース時の副作用

これをリリースすると、古い fetcher を持つ全環境で即座に警告が出る。設計どおりの意図した
動作。解消は各自の `/statusline-limits:install` 実行 (TASK-4 が定めた導線)。
