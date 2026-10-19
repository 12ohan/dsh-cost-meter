# v1.9.13

## 中文

### Ollama Cloud 使用自己的峰谷时段

Ollama Cloud 的 DeepSeek V4.1 Flash 与 V4 Pro 和 DeepSeek 官方同价，但峰谷日历不同：**周一至周五 12:00（含）至 18:00（不含）UTC 为峰时；其余时段与整个 UTC 周末为谷价；不适用中国法定假日**（[Ollama 价格页](https://registry.ollama.com/pricing)，2026-10-19 核对）。DeepSeek 官方仍为北京时间工作日 01:00–04:00、06:00–10:00 UTC 峰时，周末与法定假日全天谷价（[DeepSeek 价格页](https://api-docs.deepseek.com/quick_start/pricing/)）。

`ollama-cloud` 没有独立价格表，会自动匹配 DeepSeek 主表并沿用官方时段。因此此前：

- DeepSeek 工作日的 01:00–04:00、06:00–10:00 UTC，Ollama Cloud 调用按峰价入账，**多记一倍**；
- 周一至周五 12:00–18:00 UTC（包括中国法定假日）按谷价入账，**少记一半**；
- 其余时段两边都是谷价，金额正确。

本次修复：

- 仅当渠道为 `ollama-cloud`（含 `llm-ollama-cloud`），模型为 `deepseek-v4.1-flash` 或 `deepseek-v4-pro`，且解析结果为 DeepSeek 峰谷计费时，在解析出的价格副本上标记 Ollama 日历。共享价格表不被修改；计费模式仍为 `deepseek-peak`，仍属 API 计费并受峰谷开关控制。
- 更新后的调用在宿主实时计费、会话日志重算和浏览器会话投影中使用同一规则。“自定义价格”和“本地模型”覆盖照旧生效；把这两个 Ollama Cloud 模型改指其他 DeepSeek 主表条目时，仍按 Ollama 日历计时。
- 峰谷开关关闭、调用时间无效或缺少峰／谷档位时使用基础价。沿用此前修复的兼容规则：2026-08-31 00:00 UTC 之前的 Ollama Cloud 调用按当时的基础价计费。该日期来自原修复，当前价格页并未说明 Ollama 峰谷定价的开始日期。
- 单价、缓存价、汇率与价格历史不变；DeepSeek 官方、OpenCode Go、本地 `ollama`、其他 Ollama Cloud 模型及其他渠道的行为不变。
- 冻结的历史价格版本记录各自的日历策略（`prices.ollamaPeak`）。v1.9.12 及更早写入的版本没有该字段，读取时记为 `false`，继续按 DeepSeek 时段回放；更新后保存的版本记为 `true`。没有保存价格历史（或价格历史无法使用）的旧账本，以其保存的价格表补建的初始版本同样记为 `false`；只有全新账本从一开始就使用 Ollama 日历。更新后首次加载账本会记录一个新价格版本，此后的调用使用 Ollama 日历。
- 峰谷状态指示与切换提醒仍只显示 DeepSeek 官方时段，不反映 Ollama Cloud 的日历。
- 新增 `test/ollama-cloud-pricing.mjs` 与价格页样本：覆盖两种模型在 11:59:59.999、12:00、17:59:59.999、18:00 UTC 的边界、周末、2026-10-01 13:00 UTC、美元／人民币价表、渠道别名、覆盖设置、峰谷开关、兼容日期、缺失档位及其他渠道；并分别执行源码和已构建 `lib/client.js` 中的实际会话投影，与宿主计费逐项比对。新增 `test/ollama-cloud-upgrade.mjs`：使用 v1.9.12 代码生成的账本（`test/fixtures/ollama-cloud-upgrade-1.9.12/`），并以同一账本去掉价格历史、或价格历史无法使用的副本重复验证：升级后加载、自动重算、调用明细与会话投影均保留原金额，新调用按 Ollama 日历计费，单模型重算按原汇率改用新日历，重启后结果不变；全新账本（含首次启动补录的调用）直接使用 Ollama 日历。

### 构建

主客户端超出 DSH STORE 单文件上限前只剩 145 字节。CSS 词组打包改为每轮按当前打包文本重新计数，选择实测节省最多的词组；构建继续逐字节校验解包后的样式与 esbuild 输出一致，界面与样式不变。`lib/client.js` 为 261,996 字节，低于 262,144 字节上限。

### 历史费用

**已入账的费用不会自动改变。** 更新前的调用在加载、自动重算、调用明细和会话投影中都保持原金额与原时段规则。需要修正以前的 Ollama Cloud 费用时：更新并完全重启 DSH，在 **费用 → 价格 → 同步与规则 → 历史费用** 中选择 `ollama-cloud:deepseek-v4.1-flash`（使用过 Pro 时再选择 `ollama-cloud:deepseek-v4-pro`），点击“重算此模型的历史费用”并确认。只有所选渠道模型的旧调用改按 Ollama 日历，并沿用每次调用原来的汇率；同一会话的其他模型和其他渠道不变，重启后保持重算结果。重算前会备份账本，原金额与价格版本继续保留，日志不完整的会话不改。

更新后完全退出 DSH（包括托盘）再打开。

## English

### Ollama Cloud uses its own peak calendar

Ollama Cloud sells DeepSeek V4.1 Flash and V4 Pro at DeepSeek official's rates, on a different calendar: **Monday–Friday from 12:00 (inclusive) to 18:00 (exclusive) UTC is peak; every other hour and the whole UTC weekend are off-peak; Chinese public holidays do not apply** ([Ollama pricing](https://registry.ollama.com/pricing), checked 2026-10-19). DeepSeek official keeps 01:00–04:00 and 06:00–10:00 UTC on Beijing working days, with weekends and public holidays off-peak ([DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)).

`ollama-cloud` has no price table of its own and auto-matches the DeepSeek main table, so it inherited DeepSeek's calendar. As a result:

- calls during DeepSeek's working-day 01:00–04:00 and 06:00–10:00 UTC windows were recorded at **twice** the published rate;
- calls between 12:00 and 18:00 UTC Monday–Friday, including Chinese holidays, were recorded at **half** the published rate;
- all other hours are off-peak on both calendars and were correct.

This release:

- marks Ollama's calendar on a copy of the resolved price only for the `ollama-cloud` channel (including `llm-ollama-cloud`), the `deepseek-v4.1-flash` and `deepseek-v4-pro` models, and DeepSeek peak billing. Shared price tables are not modified. `billingMode` stays `deepseek-peak`, so the calls remain API-classified and follow the peak pricing switch;
- applies the same rule to calls made after the update in live host billing, session-log recalculation and the browser conversation projection. Custom-price and local-model overrides still apply; mapping either Ollama Cloud model to another DeepSeek table entry keeps Ollama's calendar;
- uses the base rate when peak pricing is disabled, the call time is invalid or a peak/off-peak tier is missing. It keeps the earlier fix's compatibility rule: Ollama Cloud calls before 2026-08-31 00:00 UTC use the base rate of that time. The date comes from the original fix; the current pricing page does not state when Ollama's peak pricing began;
- leaves unit rates, cache pricing, currency conversion, price history and every other channel unchanged, including DeepSeek official, OpenCode Go, local `ollama` and other Ollama Cloud models;
- records the calendar policy in each frozen historical price version (`prices.ollamaPeak`). Versions written by v1.9.12 and earlier have no such field, load as `false` and keep replaying with DeepSeek's windows; versions saved after the update store `true`. A ledger with no saved price history (or an unusable one) gets its initial version from its saved price table with the same `false` policy; only a brand-new ledger starts on Ollama's calendar. The first ledger load after the update records a new price version, and later calls use Ollama's calendar;
- leaves the peak status indicator and switch alerts on DeepSeek official's windows; they do not show Ollama Cloud's calendar;
- adds `test/ollama-cloud-pricing.mjs` and a pricing-page fixture. It covers both models at 11:59:59.999, 12:00, 17:59:59.999 and 18:00 UTC, weekends, 2026-10-01 13:00 UTC, USD/CNY tables, channel aliases, overrides, the peak switch, the compatibility date, missing tiers and other channels. It runs the actual conversation projection from both the source and the built `lib/client.js` and compares each result with host billing. `test/ollama-cloud-upgrade.mjs` loads a ledger produced by the v1.9.12 code (`test/fixtures/ollama-cloud-upgrade-1.9.12/`), and copies of it without price history or with an unusable one, and checks that loading, automatic recalculation, call details and the conversation projection keep the recorded amounts; that new calls use Ollama's calendar; that model recalculation moves old calls to the new calendar at their original exchange rates; and that a restart keeps the result. A brand-new ledger, including calls backfilled on first start, uses Ollama's calendar.

### Build

The main client was 145 bytes below the DSH STORE per-file bound. CSS phrase packing now re-counts candidates in the packed text each round and takes the largest measured saving. The build still checks that the unpacked stylesheet matches esbuild's output byte for byte; the UI and styles are unchanged. `lib/client.js` is 261,996 bytes, below the 262,144-byte bound.

### Recorded history

**Recorded amounts do not change automatically.** Calls made before the update keep their amounts and calendar on load, automatic recalculation, call details and the conversation projection. To correct earlier Ollama Cloud amounts, update and fully restart DSH, open **Cost → Pricing → Sync & rules → Historical pricing**, select `ollama-cloud:deepseek-v4.1-flash` (and `ollama-cloud:deepseek-v4-pro` if used), click “Recalculate this model” and confirm. Only the selected channel/model's earlier calls move to Ollama's calendar, at each call's original exchange rate; other models in the same session and other channels are unchanged, and the result survives a restart. A ledger backup is made first, original amounts and price versions are retained, and sessions with incomplete logs are left unchanged.

Fully quit DSH, including its tray process, and reopen after updating.
