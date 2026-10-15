# billion-context request billing / 逐次请求计费

## English

This local integration pairs dsh-cost-meter with **billion-context 0.1.197-cost-meter.1**, a compatibility build of the published 0.1.197 package. It has not been published to npm. The build script checks both original runtime checksums, preserves the upstream license and authorship, and adds its base commit to the package metadata.

### What it records

- Each consumed upstream request, including internal compression, HTTP retries and additional model rounds.
- Provider-reported uncached input, cache reads, cache writes, output and reasoning usage across OpenAI Chat Completions, Responses, Anthropic Messages and Google GenerateContent, including streaming responses.
- Actual upstream origin and model, request identity, retry attempt, completion status, owning DSH conversation and active turn/step.
- Successful zero usage, missing usage and partial responses remain distinct. Missing prices remain unpriced. No amount is inferred from savings percentages, balance changes or estimated context size.

The integration observes the existing response as billion-context consumes it. It does not change the upstream URL, API key, proxy, model, prompt, returned text or the usage used by DSH for context management. A short local health check confirms the metering protocol before attaching a correlation header. The proxy removes that header before forwarding a request.

### One charge per real request

The native adapter links the proxy request to the current DSH billing stream. After durable proxy records are confirmed, dsh-cost-meter accounts those individual requests and suppresses the ordinary host usage charge for that stream. Producer sequences and ledger receipts are committed together, preventing duplicate charges after restarts, concurrent hosts or repeated imports.

Ledger totals, the conversation badge, daily/week/all statistics, turn details and step views share these records. Subagent calls retain their own conversation identity and follow the existing inclusion setting. Replay excludes the linked original usage, and inherited fork history is not billed again.

Main model requests retain the DSH provider's configured pricing. Internal models are resolved from their actual upstream and model; configure a price or Plan assignment when the catalog has no matching entry. Unknown charges are disclosed rather than treated as free.

### Local installation

Use the paired local preview archives. For a DSH profile that already uses billion-context, replace its package with `billion-context-0.1.197-cost-meter.1.tgz` and install the matching dsh-cost-meter preview, then fully restart the host. Keep the original npm package for rollback. This task does not install or enable billion-context on a profile that did not already use it.

Developers can reproduce the third-party archive without installing or executing it:

```powershell
node scripts/build-billion-context-compat.mjs <original-billion-context-0.1.197.tgz> <local-output-directory>
```

The original build is pinned to [commit 3aeddc1](https://github.com/ranxianglei/billion-context/tree/3aeddc160864ca774e54817559d6984310e2a9ab). Unknown versions fail the checksum gate instead of receiving an approximate patch. A later upstream update can remove this compatibility build; the UI reports a missing bridge and ordinary DSH billing continues.

### Storage and limits

Only sanitized billing fields are retained under `<ledger>.billion-context`. No prompt, response content, tool payload, request header or credential is stored. Imports read bounded newline-delimited records incrementally. The ledger's persisted receipts are essential to deduplication; restore them together with a ledger backup.

The producer and host share local files, so a remote proxy is not covered by this build. Missing historical records cannot be reconstructed. A provider that omits usage, an interrupted response or a storage failure can leave unknown charges; the fee view identifies incomplete coverage. Unsupported proxies and failed durable writes retain ordinary host accounting, while available partial usage remains explicitly marked.

Verification uses local synthetic HTTP services, including the exact pinned billion-context retry and summary functions. It covers four protocols, cache buckets, compression, retries, API/Plan separation, concurrent subagents, replay equality, restart receipts, cancellation, missing usage, downgrade and storage failure. No paid model request is made.

## 中文

本地接入需要配套使用 dsh-cost-meter 预览包和 **billion-context 0.1.197-cost-meter.1**。后者基于官方 0.1.197 发布包生成，保留原作者与许可证，并记录原始提交和运行文件校验值；尚未发布 npm。

### 统计内容

- 逐次采集真实上游请求，包含内部压缩、HTTP 重试和追加模型轮次。
- 支持 OpenAI Chat Completions、Responses、Anthropic Messages、Google GenerateContent 的 JSON 和流式用量。
- 分开记录未缓存输入、缓存读取、缓存写入、输出和推理 Token，保留实际上游、模型、重试次数、完成状态、DSH 会话及当前轮次／步骤。
- 主模型沿用 DSH 渠道的配置价格；内部模型按实际上游与模型匹配价格。缺少价格或套餐归属时需要配置，不按节省比例、余额差或上下文估算补算费用。

接入只观察原有响应，不改上游地址、代理、模型、提示词、密钥、返回文本和 DSH 用于管理上下文的用量。发送关联标识前只查询本地代理的健康接口；关联标识会在代理转发上游前删除。

### 去重与界面

确认代理记录写入后，每次真实请求独立入账，原来那条 DSH 投影用量不再重复收费。调用序号和入账凭据在同一笔账本事务中保存，重启、重复读取和多进程导入均不会重复入账。

会话金额、日／周／全部统计、单轮费用及步骤明细共用记录；子代理保留原会话归属，按既有开关汇总。回放会排除已经替换的原用量，分叉继承的历史不再次收费。调用明细标注 billion-context、实际上游、重试次数及不完整回执。

### 使用与边界

已经使用 billion-context 的目标环境需要安装两个配套的本地包，然后完全退出并重启 DSH；原版包保留用于回退。本任务不会给原本未使用 billion-context 的本机环境新增或启用代理插件。

计费记录位于 `<ledger>.billion-context`，只保留计费字段，不保存对话正文、工具内容、请求头或凭据。账本中的入账凭据需要与账本一起备份和恢复。

这个版本要求代理与 DSH 共享本地文件，暂不覆盖远程代理。启用前未保存的内部调用不能补齐；厂商未上报用量、流中断和存储失败会明确标出。旧代理或写入失败时保留普通 DSH 记账，不将未知费用当作免费。

测试使用本地模拟接口及精确版本的 billion-context 重试、摘要实现，覆盖四种协议、缓存桶、压缩、重试、API／Plan、并发子代理、回放一致、重启去重、取消、缺失回执、降级和写入失败，没有调用付费模型。
