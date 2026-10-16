# v1.8.31

## 中文

价格设置分为“模型定价”“参考价格表”“同步与规则”。默认打开模型定价，按渠道和模型显示卡片，可搜索已使用的模型，并选择自动匹配、价格表、自定义价格或本地零费用。

自定义价格以完整宽度显示，输入、缓存读取、输出单价并列，币种单独标明。沿用原有统一与独立倍率操作，下方分项显示乘倍率后的实际单价；更多计费项按需展开。长模型名自动换行，深浅色沿用 DSH 主题，窄窗口自动调整列数。

首屏只渲染 24 个模型，搜索覆盖完整列表，可继续展开其余模型。价格表按厂商展开，同步和历史重算仅在打开相应分区后加载。搜索和切换分区不写入配置。

本次只调整设置界面，既有单价、倍率、计费与历史费用规则保持一致。

## English

Pricing settings now have three sections: Model pricing, Price tables, and Sync & rules. The default model view uses channel/model cards with a local filter and a clear price-source selector.

Custom-price fields use the full card width. Currency, input, cache and output rates are clearly separated; shared/per-rate multipliers reuse the existing controls, with individual effective-price previews. Long names wrap, narrow layouts adapt, and colors follow DSH theme tokens.

Only 24 model cards render initially. Search covers the full list and more results can be expanded. Catalog groups and sync/history controls mount on demand. Searching and navigating never save configuration. Billing and recorded historical amounts retain their existing behavior.
