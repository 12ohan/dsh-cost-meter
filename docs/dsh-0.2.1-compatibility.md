# DSH 兼容性：最低 0.2.0（目标 0.2.1-rc.1）

## 中文

本轮把插件的最低兼容要求从 DSH `0.1.x` 提升到 **0.2.0**，适配目标为 npm `next` 标签的 **0.2.1-rc.1**。日常计费、价格、历史金额与界面布局不变。

### 声明口径

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `engines.dsh` | `>=0.2.0-rc.1 <0.3.0-0` | **宿主准入唯一有效字段**：安装、更新与启动加载都按它判定；存在时 `peerDependencies` 被完全忽略 |
| `dsh.compatibility.dsh` | `>=0.2.0-rc.1 <0.3.0-0` | DSH STORE 商城口径，宿主不读 |
| `dshhub.compatibility.dsh` | `>=0.2.0-rc.1 <0.3.0-0` | 同上 |
| `dsh.compatibility.dshReleases` | 只保留 0.2.x 逐版本记录 | 仅商城逐版本证据，宿主不读 |
| `peerDependencies` | `>=0.2.0-rc.1 <0.3.0-0 \|\| >=0.2.1-0 <0.3.0-0` | 宿主模块契约（两个 `@deepseek-ai/dsh-*` 包） |
| `engines.node` | `>=20` | 不变 |

三点必须一起看：

- **真正生效的闸门是 `engines.dsh`。** 只改 `dsh.compatibility.dsh` 不会改变任何行为——宿主闭包里没有读取该字段的代码。旧版声明只有 `engines.node`，等于没有下限。
- **范围必须同时带 prerelease 下限与上界。** `>=0.2.0` 会拒绝 `0.2.0-rc.1` / `0.2.0-rc.2`，却放行 `0.3.0`；`>=0.2.0-rc.1 <0.3.0-0` 接受 `0.2.0-rc.1`、`0.2.0-rc.2`、`0.2.1-alpha.5`、`0.2.1-rc.1`，拒绝全部 `0.1.x`（含此前被放行的 `0.1.5-alpha.1`）与 `0.3.0`。
- **peer 的第二段 `|| >=0.2.1-0 <0.3.0-0` 是有意保留的，不要“优化”掉。** 宿主判定强制 `includePrerelease`，只用第一段就够了；但标准 npm 默认语义下第一段会拒绝 `0.2.1-rc.1`，第二段负责让清单在 npm/pnpm 工具链眼里自洽。

### 运行时影响面

插件只 import 两个宿主包：`@deepseek-ai/dsh-credentials` 的 `credentialRef()` 与 `@deepseek-ai/dsh-home-paths` 的 `resolveDshHome()`；客户端只 `require` `@deepseek-ai/dsh-client-ui-primitives` 的 `Tooltip`。三者在 0.2.1-rc.1 下签名与导出均无破坏性变化。0.2.1-rc.1 相对上一版移除的 11 个 `@deepseek-ai/*` 包（含 `dsh-invariants`）本插件 0 引用；前端 `--dsw-*` 设计令牌无消失项。

### 与 0.1.x 的关系

`0.1.x` 已不在声明范围内：范围下界是 `0.2.0-rc.1`，宿主准入会直接拒绝这一档旧版本（含此前实测的 `0.1.5-alpha.1`）。此前针对 `0.1.2-rc.1`、`0.1.3-alpha.2`、`0.1.5-alpha.1` 的安装与启动检查保留为历史记录（见[宿主兼容验证](host-compatibility.md)与 [CHANGELOG](../CHANGELOG.md)），不代表当前支持。

### 验证范围与边界

宿主准入判定与运行时导入面已按真实 0.2.1-rc.1 宿主逐项核对；已完成的宿主验证记录见[宿主兼容验证](host-compatibility.md)。没有覆盖 DSH Desktop 整个桌面外壳、真实付费请求，以及其他第三方插件的账单查询。

## English

This round raises the plugin's minimum host requirement from DSH `0.1.x` to **0.2.0**, targeting the npm `next` release **0.2.1-rc.1**. Daily billing, pricing, historical amounts and UI layout are unchanged.

- `engines.dsh` (`>=0.2.0-rc.1 <0.3.0-0`) is the only field the host reads when admitting a plugin, and when it is present `peerDependencies` is ignored entirely. `dsh.compatibility.*`, `dshhub.compatibility.*` and `dsh.compatibility.dshReleases` are store-facing metadata that do not affect host behaviour; before this round the plugin declared no `dsh` floor at all.
- The range needs both a prerelease floor and an upper bound: `>=0.2.0` rejects `0.2.0-rc.1`/`0.2.0-rc.2` yet admits `0.3.0`, while `>=0.2.0-rc.1 <0.3.0-0` accepts `0.2.0-rc.1`, `0.2.0-rc.2`, `0.2.1-alpha.5` and `0.2.1-rc.1` and rejects all `0.1.x` (including `0.1.5-alpha.1`, which the previous range let through) and `0.3.0`.
- The second peer alternative `>=0.2.1-0 <0.3.0-0` is intentional and should not be removed: the host evaluates with `includePrerelease`, so the first alternative alone satisfies it, but standard npm semantics would otherwise reject `0.2.1-rc.1`.
- Runtime surface: the plugin imports only `credentialRef()` from `@deepseek-ai/dsh-credentials`, `resolveDshHome()` from `@deepseek-ai/dsh-home-paths` and `Tooltip` from `@deepseek-ai/dsh-client-ui-primitives`; all three keep their signatures and exports in 0.2.1-rc.1. None of the 11 `@deepseek-ai/*` packages dropped from the host closure are referenced, and no `--dsw-*` design token disappeared.
- DSH `0.1.x` is no longer supported. Earlier 0.1.x install/startup checks remain historical records in the [host compatibility record](host-compatibility.md) and the changelog.
- Host admission and the runtime import surface were checked against the real 0.2.1-rc.1 host; verified host records are in the [host compatibility record](host-compatibility.md). The DSH Desktop shell, real billable requests and third-party billing queries are not covered.
