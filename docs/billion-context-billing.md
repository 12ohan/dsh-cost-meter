# billion-context request billing / 逐次请求计费

## English

The metering bridge supports **billion-context 0.1.181 or later** through a paired compatibility build. Release numbers are not an allowlist: the generator inspects the actual proxy and native transport contracts and automatically accepts unchanged interfaces, including later versions. Runtime hashes record provenance rather than block other releases. Original authorship and licenses are retained.

**0.1.180 and earlier:** an enabled plugin is detected through DSH's plugin manager, and a popup asks the user to upgrade to **0.1.181 or later**. Incompatible metering interfaces also produce a popup with **Community group** and **Open an issue** links. The group link opens this project's existing WeChat group section. Acknowledging a notice suppresses repeats for the same version and reason; a new problem can prompt again. A temporary transport failure alone is not classified as an interface change.

### What it records

- Every consumed upstream request, including compression, HTTP retries and additional model rounds.
- Uncached input, cache reads, cache writes, output and reasoning usage across OpenAI Chat Completions, Responses, Anthropic Messages and Google GenerateContent, including streams.
- Actual upstream origin/model, request identity, attempt, completion status, owning DSH conversation and active turn/step.
- Zero usage, missing usage, partial responses and missing prices remain distinct. Charges are not guessed from savings percentages, balance movement or estimated context size.

After durable proxy records are confirmed, those individual requests replace the corresponding ordinary DSH usage charge. Producer sequences and ledger receipts are committed together. Main/subagent totals, daily/week/all statistics, turn details and step views share these records and historical price versions. Inherited fork history is not charged again.

Main requests retain the configured DSH provider price. Internal models use their actual upstream/model. The bridge observes existing responses, preserves the request body and upstream credentials, and removes the private correlation header before forwarding to a model endpoint.

Prebuilt archives for the five verified versions are available in the [v1.8.27 release assets](https://github.com/Han-1413141/dsh-cost-meter/releases/tag/v1.8.27).

### Generate and install the matching archive

The generator automatically adapts supported interfaces without executing the original package. It does not rewrite the source archive. Build from the original package for the version being installed:

```powershell
npm pack billion-context --ignore-scripts
node scripts/build-billion-context-compat.mjs <original-billion-context.tgz> <local-output-directory>
```

The output version is `<upstream-version>-cost-meter.1` (for example, `0.1.197-cost-meter.1`). Install it alongside dsh-cost-meter 1.8.27 or later in the DSH profile already using billion-context, then fully restart the host. After updating the original plugin, generate and install a matching compatibility archive. A stock package without the metering bridge does not expose all internal calls merely because its version is newer.

The generator supports both observed native fetch implementations and optional summary helpers. Changed required contracts stop generation with feedback links. Runtime protocol mismatches or an unconnected bridge are surfaced in the popup; ordinary DSH billing remains available.

### Storage and verification

Only billing metadata is saved under `<ledger>.billion-context`: no prompts, returned text, tool payloads, request headers or credentials. Restore persisted receipts together with a ledger backup. Producer and host must share local files; remote proxies and missing historical records are outside this bridge's coverage.

Actual npm releases **0.1.181, 0.1.185, 0.1.190, 0.1.196 and 0.1.197** were verified with their native interceptor, retry and summary implementations. Checks cover four protocols, cache buckets, API/Plan, concurrent agents, replay, restart, cancellation, incomplete usage and storage failures. Future-version acceptance and changed-contract rejection use separate synthetic fixtures. Browser checks cover upgrade and compatibility notices, feedback links and dismissal. No paid model calls are made.

## 中文

### 支持范围与自动兼容

完整内部计费从 **billion-context 0.1.181** 起接入，需要配套计费兼容包。生成器检查代理请求、摘要重试和原生请求拦截的实际接口，**不再锁定 0.1.197 或固定文件校验值**。后续版本保留相同接口时自动通过检查并生成兼容包，原作者、许可证、原始版本及文件校验值继续保留。

检测到启用中的 **0.1.180 及更早版本**时，弹窗提示升级到 **0.1.181 或更新版本**。计费接口变化或兼容桥未连接时也会显示相应提醒，提供：

- **加入交流群**：跳转到本项目现有的[微信交流群入口](../README.zh-CN.md#交流与反馈)。
- **提交 issue**：打开本项目的问题反馈模板。

关闭后，同一版本、同一问题不会反复弹窗；出现新的兼容问题时重新提醒。临时超时或请求取消不被直接判为接口变化。反馈时请附 billion-context、费用插件和 DSH 的版本。

### 统计内容

逐次记录内部压缩、HTTP 重试和追加请求；支持 OpenAI Chat Completions、Responses、Anthropic Messages、Google GenerateContent 的 JSON 与流式回执。未缓存输入、缓存读写、输出和推理 Token 分开保存，保留实际上游、模型、重试次数、完成状态、会话和轮次／步骤。

代理用量成功写入后，逐次记录替换对应的普通 DSH 用量，避免双计。调用序号和账本凭据原子保存，防止重启、重复读取和并发导入再次收费。会话金额、子代理、日／周／全部统计、单轮和步骤明细共用记录，分叉继承的历史不重复计费，并沿用保存的历史价格版本。

主请求沿用 DSH 渠道配置价格；内部模型按实际上游和模型匹配。零用量、缺失用量、部分回执和未定价明确区分，不按节省比例、余额差或估算上下文补算费用。关联标识在转发模型端点前删除，不改变请求正文和上游凭据。

五个已验证版本的预编译兼容包见 [v1.8.27 发布附件](https://github.com/Han-1413141/dsh-cost-meter/releases/tag/v1.8.27)。

### 使用方法

先取得所用版本的原始 npm 包，再运行上面的生成命令。生成结果按原始版本命名为 `<原版本>-cost-meter.1`，与费用插件 1.8.27 或更新版本一起安装到已使用 billion-context 的 DSH Profile，然后完全重启宿主。

**升级原插件后，需要为新版本生成并安装对应兼容包。**生成器会自动判断接口兼容性；仅升级原版包不能获得完整内部调用记录。必需接口变化时停止生成并给出反馈入口，运行期间的协议不匹配或未连接状态通过弹窗提示。

计费数据保存在 `<ledger>.billion-context`，只含计费字段，不保存正文、工具内容、请求头或密钥。代理与宿主需要共享本地文件；远程代理及启用前缺失的内部记录无法通过此桥补齐。恢复账本时同时保留入账凭据。

### 验证

已用 **0.1.181、0.1.185、0.1.190、0.1.196、0.1.197** 的实际 npm 发布包验证原生拦截、摘要、重试、四种协议、API／Plan、并发子代理、历史回放、重启去重、取消、缺失回执和写入失败。未来版本自动接入与接口变化拒绝另用模拟代码验证；浏览器验证升级提醒、兼容提醒、群与 issue 链接及关闭去重。测试没有调用付费模型。