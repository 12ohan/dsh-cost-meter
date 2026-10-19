# v1.9.10

## 中文

### Windows 账本锁启动优化与版本兼容

感谢 [@Oct1AtJoe](https://github.com/Oct1AtJoe) 在 [PR #327](https://github.com/Han-1413141/dsh-cost-meter/pull/327) 定位同步 PowerShell 启动造成的阻塞，并提供原始优化实现。

- 无锁竞争时，Windows 直接使用 Node 启动时固定的毫秒时间写入锁身份，不启动 PowerShell。仅在确实需要判断旧版原生锁或其他进程身份时查询原生启动时间，并缓存查询结果。
- 修正第一处兼容问题：毫秒锁身份使用 v2 元数据，与旧版 ticks 身份区分。旧版遇到仍活跃的新版持有者时继续等待，不会误删锁后同时写账本。
- 修正第二处兼容问题：比较前将 Windows ticks 换算成毫秒，能够识别 PID 已被其他进程复用的旧锁，不再因为单位不同一律拒绝回收。仅当旧启动时间明确早于当前进程且超过两秒误差范围时回收；原生 ticks 之间仍精确比较。
- 未知版本、损坏或未写完的身份、无法读取原生身份等情况，不会仅因锁文件较旧而删除活动锁。保留空文件旧锁、死亡进程和 Linux 原生身份的既有处理。
- 此次仅调整锁元数据，账本数据格式和历史金额不变，不触发费用重算。

验证覆盖冻结的 v1.9.9 锁读写器与当前实现、真实 Windows 新旧持有进程和竞争进程、仍活跃但文件时间较旧的锁、文件时间较新的 PID 复用旧锁、当前 PID 的原生身份、死亡进程回收，以及启动零 PowerShell 调用和查询失败。

启动时间依据：[Node.js `performance.timeOrigin`](https://nodejs.org/api/perf_hooks.html#performancetimeorigin)。

更新后完全退出 DSH（包括托盘）再打开。

## English

Thanks to [@Oct1AtJoe](https://github.com/Oct1AtJoe) for identifying blocking PowerShell startup and contributing the original optimization in [PR #327](https://github.com/Han-1413141/dsh-cost-meter/pull/327).

- Uncontended Windows ledger writes use Node's fixed startup origin without launching PowerShell. Native identities are queried lazily for older native locks or other processes and cached.
- Millisecond identities use v2 lock metadata. Older readers preserve live new locks instead of confusing milliseconds with native ticks and allowing concurrent writers.
- Native ticks are normalized before comparison with milliseconds, allowing recovery after PID reuse. Estimated times must be more than two seconds earlier than the current birth; native-to-native comparisons retain exact precision.
- Unknown or incomplete identities and failed OS queries preserve live locks. Existing empty-file, dead-process and Linux handling remain supported.
- Ledger data formats and historical amounts stay unchanged; no repricing is triggered.

Regression coverage includes frozen v1.9.9 readers/writers, actual Windows old/new process exclusion, live locks with old file times, reused PIDs with recent file times, native self identities, dead holders, failed probes and zero PowerShell calls on normal owner creation.

Fully quit DSH, including its tray process, and reopen after updating.
