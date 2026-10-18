# OpenDesign billing and quota / 计费与额度

## English

This release addresses [#274](https://github.com/Han-1413141/dsh-cost-meter/issues/274), requested by @playgithub. It adds an OpenDesign price channel and read-only workspace quota queries; it is included in version 1.8.27. It does not install OpenDesign, create an account or change a model route.

The quota query also implements the Bearer-only fallback discovered by @yunjuanhuakai in the [#274 follow-up comments](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236591566): on accounts whose usage route rejects a Control Key, the plugin retries the `billing/preflight` endpoint with the same credential. @codeforker654's [401 report](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236228870) is the reproduction behind the fallback.

### Conversation costs

- The offline catalog contains 35 token-priced models checked on **2026-10-15**, from the [official public API](https://amr-api.open-design.ai/api/v1/public/model-prices). Prices are **USD per 1M tokens**, with cache read/write rates and long-context tiers where provided. The long tier applies to the entire request only above its input threshold, including cached input.
- Provider IDs `opendesign`, `open-design`, `open-design-api` and `amr-link.open-design.ai`, including DSH's `llm-` prefix, use this separate catalog. A custom price under the original alias takes priority. Other provider IDs can use the existing explicit price mapping and plan-assignment controls.
- OpenDesign prices never serve as fallback prices for another provider. Unknown OpenDesign models stay unpriced; the plugin does not borrow a direct-vendor price.
- **Settings → Cost → Prices → Sync official prices** also refreshes the public OpenDesign catalog. A used/enabled OpenDesign channel refreshes at startup and hourly. No key or model request is needed. User-edited prices and removed models stay intact. Saved price versions preserve existing details when rates change; recalculation is explicit and retains the original amounts. A historical price version that was never captured cannot be reconstructed.

OpenDesign uses shared subscription allowances and can fall back to its wallet; see its [model-credit rules](https://open-design.ai/model-credits/). Calls default to **Plan-equivalent cost**, which is not a subscription payment or a cash bill. Set wallet-funded calls to **API** in the billing-classification controls, or assign individual models explicitly. DSH's standard usage response does not identify each request's funding source, account-specific discount, image charge or automatic top-up. Those amounts are not invented from the list price or balance movement.

### Quota queries

1. Open **Settings → Cost → Quotas**, find **OpenDesign**, and expand its settings.
2. Enter the exact **workspace ID** from your OpenDesign Cloud workspace.
3. Configure a **Control Key** in the credential editor, or supply `OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY` to the DSH host. An inference key from the Cloud API Keys page is a different credential and cannot be used for this query. The existing OpenDesign/Vela login keeps control credentials in its own profile; the plugin does not read or rewrite that profile automatically.
4. Enable the card and refresh. Select its location to also show it in the sidebar or quota strip.

The host issues only these authenticated GET requests to the fixed official HTTPS origin:

```text
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/billing/coding-plan-usage   # primary window query
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/billing/preflight            # Bearer-only fallback, only after a 401/403
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/wallet/balance               # wallet, read independently
```

#### Endpoint permissions, Bearer-only fallback and 401 troubleshooting

- The usage endpoint is not always scoped to a Control Key: for some plans/accounts it only accepts a **browser session cookie**, so a Control Key can return `401`/`403` for `billing/coding-plan-usage` while `/billing/preflight`, `/wallet/balance` and other API endpoints still answer `200` with the same key. The plugin never sends a browser cookie. It first queries the usage route with `Authorization: Bearer ...`; when that route answers `401`/`403`, it retries `billing/preflight` once with the same header. `preflight` returns the identical window packet nested under `codingPlan`, so the same parser and percentage rules apply.
- A `200`, a malformed body or any other HTTP status on the primary route never triggers the fallback. The wallet route is read independently and in parallel: when only one side is rejected, the other value is still displayed, the rejected side is omitted rather than fabricated as zero, and its cause (credential rejected / no subscription / invalid response / network) is kept in the refresh trace. Only when both sides fail does the card show an error state.
- A successful fallback keeps the standard `{ windows, endpoint }` answer, with `endpoint` naming the route that actually answered. A fallback response that is itself rejected, malformed or unreachable is reported as the window side's failure cause, not as a wallet failure.
- `preflight` also carries `workspaceMemberId` and `balanceUsd`. The member is checked against the wallet member; `balanceUsd` is only used as the displayed balance when `/wallet/balance` cannot be read, and never adds to or replaces a readable wallet value.
- The workspace ID must be the `workspaceId` field of `items[]` from `GET https://amr-api.open-design.ai/api/v1/workspaces`. It is **not** `profiles.prod.user.id` from `~/.amr/config.json`: that user id authenticates but scopes the request to the wrong resource, and the server replies `403 workspace_billing_scope_forbidden`.
- Troubleshooting a `401`/`403` on the quota endpoint:
  1. Confirm the stored credential is a **Control Key**, not an inference API key from the Cloud API Keys page.
  2. Call `GET /api/v1/workspaces` with the same credential and copy the exact `items[].workspaceId`.
  3. If `/workspaces` succeeds but `/billing/coding-plan-usage` returns `401`/`403`, the automatic `preflight` fallback normally covers this account and needs no browser session. If `preflight` also returns `401`/`403` for the same key, that account does not expose a Control-Key window read; log in to the OpenDesign Cloud console to check usage there. The wallet endpoint may still be readable, and is shown on its own.
  4. Verify the key and workspace belong to the same account and that the key was not rotated or revoked.

Quota and wallet responses must match the requested workspace. The wallet must identify its member; if the quota response provides a member identity, both must match. A preflight response that omits the redundant outer `workspaceId` is accepted only after the requested workspace has scoped the request; a body naming a different workspace is rejected. Credentials are never forwarded through a redirect and no cookie is attached. They use the existing DSH credential store and are excluded from the ledger and client snapshot.

Each returned allowance window has its own used percentage and reset time. Simultaneous windows are not added together or called unlimited. Wallet credit remains a separate USD-equivalent value, including a real zero. Quota and wallet are fetched independently, so a failure on one side keeps the other side visible; an `eligible: false` / empty-window answer (from the primary route or the fallback) is reported as **no active subscription** instead of a credential failure. Invalid, unauthorized or missing responses never fabricate a zero allowance; when both sides fail, the card shows an error/unavailable state. The workspace setting is kept across restarts and invalidates the previous query when changed.

### Evidence and limits

The public catalog was fetched without authentication. The authenticated adapter, the Bearer-only `billing/preflight` fallback and bilingual settings were verified with synthetic responses, including large credit counts, zero balances, mismatched identities, authorization failures on either side, a preflight-shaped `codingPlan` body, and price-refresh persistence. **No live account query or paid model request was made.** Production Control Key permissions and response availability still require a configured account.

Endpoint provenance: the official Cloud bundles `cloud-root-B21Emo2w.js` and `pricing-refund-policy-BDFJHl33.js` served on 2026-10-15; the [workspace-wallet contract](https://github.com/nexu-io/open-design/blob/7abd6fc2b11987c3940eb4ffc461478ff37c0b33/packages/contracts/src/api/collab.ts) and [Vela billing adapter](https://github.com/nexu-io/open-design/blob/7abd6fc2b11987c3940eb4ffc461478ff37c0b33/apps/daemon/src/integrations/vela-billing.ts) at the inspected commit. The exact `billing/preflight` shape (`codingPlan`-nested windows, `workspaceMemberId`, `balanceUsd`) comes from @yunjuanhuakai's [#274 comment](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236591566); the 401 reproduction and attached report come from @codeforker654's [comment](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236228870). The [official guide](https://open-design.ai/zh/model-credits/) explicitly lists DSH as a supported API client; the issue has a usable integration request. Its short promotional wording alone does not establish advertising or spam.

## 中文

本版本实现了 @playgithub 在 [#274](https://github.com/Han-1413141/dsh-cost-meter/issues/274) 提出的接入需求，随 1.8.27 发布。同时落实 #274 后续评论中 @yunjuanhuakai 发现的纯 Bearer 回退端点（[评论](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236591566)），并以 @codeforker654 的 [401 复现报告](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236228870) 为验证案例。不会安装 OpenDesign、注册账户或改变模型路由。

### 会话计费

- 从[官方公开价表](https://amr-api.open-design.ai/api/v1/public/model-prices)加入 **35 个模型**，核对日期为 **2026-10-15**。单位为 **美元／百万 Token**，包含已公布的缓存读取、缓存写入和长上下文价格。超过输入阈值后，整次请求使用长档，输入阈值包含缓存输入。
- `opendesign`、`open-design`、`open-design-api`、`amr-link.open-design.ai` 及其 `llm-` 前缀使用独立目录；原渠道中手工配置的价格优先。其他自定义名称可通过既有价格映射和套餐归属入口关联。
- 未收录的 OpenDesign 模型标为未定价，不借用直连厂商价格；其他渠道也不会使用 OpenDesign 价作为兜底。
- **设置 → 费用 → 价格 → 同步官方价格**会同步公开目录。已使用或开启 OpenDesign 时，启动和每小时也会刷新；不需要密钥，不调用模型。自定义价格、取消挂载和已保存价格版本的历史明细保留。历史重算需要主动确认并保留原金额；未保存过的历史价格版本无法还原。

OpenDesign 的 API 与客户端共用套餐，套餐用尽后可以继续扣钱包，详见[官方额度规则](https://open-design.ai/zh/model-credits/)。因此默认计入 **Plan 等值费用**，不把额度当成现金支出。钱包付款可在计费分类中设为 **API**，也可逐模型配置。DSH 的标准用量回执没有逐次扣款来源、账户折扣、图片费用或自动充值金额，这些金额不会通过公开单价或余额变化猜算。

### 额度查询

1. 在 **设置 → 费用 → 额度**找到并展开 **OpenDesign**。
2. 填入 OpenDesign Cloud 中对应的**工作区 ID**。
3. 在凭据编辑器中配置 **Control Key**，或向 DSH 宿主提供 `OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY`。Cloud API Keys 页生成的推理密钥与查询凭据不同，不能混用。已有 OpenDesign／Vela 登录将控制端凭据保存在其自身配置中，本插件不会自动读取或修改那个配置。
4. 开启并刷新，可选择在侧栏或额度横条显示。

查询只访问以下固定官方 HTTPS GET 端点，并在凭据／工作区校验之后才发起：

```text
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/billing/coding-plan-usage   # 优先窗口端点
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/billing/preflight            # 纯 Bearer 回退，仅在 401／403 后尝试一次
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/wallet/balance               # 钱包端点，独立读取
```

#### 端点权限、Bearer 回退与 401 排查

- 用量端点并非总是接受 Control Key：部分套餐／账户只接受**浏览器会话 Cookie**，因此同一个 Control Key 可能在 `billing/coding-plan-usage` 返回 `401`／`403`，而 `/billing/preflight`、`/wallet/balance` 等其它端点仍返回 `200`。插件从不发送浏览器 Cookie：先以 `Authorization: Bearer ...` 查询用量端点；若返回 `401`／`403`，再用同一请求头重试一次 `billing/preflight`。后者把同样的窗口数据嵌套在 `codingPlan` 下，解析与百分比规则完全一致。
- 主端点返回 `200`、响应格式错误或其它 HTTP 状态时都不会触发回退。钱包端点独立并行读取：只有一侧失败时仍显示另一侧数值，失败侧留空而不是编造为零，失败原因（凭据被拒／无订阅／响应无效／网络失败）保留在刷新记录中；两侧都失败才显示错误状态。
- 回退成功仍返回标准 `{ windows, endpoint }`，`endpoint` 指向实际返回数据的端点。回退端点本身被拒、格式错误或网络失败时，记为窗口侧失败原因，而不是钱包失败。
- `preflight` 同时返回 `workspaceMemberId` 与 `balanceUsd`。成员身份会与钱包成员核对；`balanceUsd` 只在 `/wallet/balance` 不可读时作为显示余额的兜底，不会与可读的钱包金额相加或覆盖它。
- 工作区 ID 必须取 `GET https://amr-api.open-design.ai/api/v1/workspaces` 返回的 `items[].workspaceId`；**不能**使用 `~/.amr/config.json` 里的 `profiles.prod.user.id`。后者虽然能通过认证，却会把请求指向错误的资源范围，服务端返回 `403 workspace_billing_scope_forbidden`。
- 额度端点返回 `401`／`403` 时的排查步骤：
  1. 确认保存的是 **Control Key**，不是 Cloud API Keys 页生成的推理密钥。
  2. 用同一凭据调用 `GET /api/v1/workspaces`，复制准确的 `items[].workspaceId`。
  3. 若 `/workspaces` 成功而 `/billing/coding-plan-usage` 返回 `401`／`403`，自动 `preflight` 回退通常已覆盖该账户，不需要浏览器会话。若同一凭据在 `preflight` 也返回 `401`／`403`，说明该账户没有开放 Control Key 的窗口读取；请登录 OpenDesign Cloud 控制台查看用量。钱包端点可能仍可读取，会单独显示。
  4. 核对密钥与工作区属于同一账户，并确认密钥未被轮换或撤销。

查询只访问上文列出的固定官方 HTTPS GET 端点；核对工作区，钱包必须提供成员身份，额度响应提供成员身份时再核对二者一致。回退响应省略外层冗余 `workspaceId` 时，在已由请求范围校验工作区的前提下仍接受；若响应指向不同工作区则拒绝。凭据由 DSH 凭据库管理，不回显、不写入账本，不跟随重定向，也不附带浏览器 Cookie。

所有实际返回的窗口分别显示已用百分比和重置时间，不相加、不标成无限。钱包作为独立的美元等值额度显示，真实零余额保留。额度与钱包独立查询：一侧失败时另一侧仍照常显示；`eligible: false`／空窗口回执（无论来自主端点还是回退端点）会明确报告为**无生效订阅**，不再与凭据失效混为一谈。认证失败、缺失回执或身份不匹配不显示虚构的零额度，两侧都失败时才显示错误／不可用状态。工作区配置跨重启保留，改变后清理原查询缓存。

公开价表已经直接读取；认证查询、Bearer-only `preflight` 回退与中英文设置使用模拟数据验证，覆盖大整数、零余额、串工作区／成员、单侧认证失败、preflight 形状的 `codingPlan` 回执、价格持久化等情况。**没有真实账户验证，没有调用付费模型。**真实账户的 Control Key 权限与服务端响应需要在配置后核对。

端点来源：官方 Cloud bundle `cloud-root-B21Emo2w.js` 与 `pricing-refund-policy-BDFJHl33.js`（2026-10-15 读取）；[工作区钱包契约](https://github.com/nexu-io/open-design/blob/7abd6fc2b11987c3940eb4ffc461478ff37c0b33/packages/contracts/src/api/collab.ts)与 [Vela 计费适配器](https://github.com/nexu-io/open-design/blob/7abd6fc2b11987c3940eb4ffc461478ff37c0b33/apps/daemon/src/integrations/vela-billing.ts)（上述 commit）。`billing/preflight` 的准确回执形状（`codingPlan` 内嵌窗口、`workspaceMemberId`、`balanceUsd`）来自 @yunjuanhuakai 的 [#274 评论](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236591566)；401 复现与附件来自 @codeforker654 的 [评论](https://github.com/Han-1413141/dsh-cost-meter/issues/274#issuecomment-6236228870)。官方明确支持 DSH，说明这条 issue 有可执行的接入需求；仅凭“便宜、可能流行”的一句话，不能认定为广告。
