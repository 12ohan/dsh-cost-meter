import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function checkSidebarUpdates(page, output) {
  await page.setViewportSize({width:1100,height:1000})
  await page.evaluate(async () => {
    await window.configure({ locale: 'zh' })
    window.setFixtureState({ codexCompat: { installed: true, enabled: true, version: 'synthetic', usage: {} } })
    window.remount()
  })
  await page.getByRole('tab', { name: '显示', exact: true }).click()
  const geometry = await page.locator('.cm-tabs>.cm-tab').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(), css = getComputedStyle(node)
    return { text: node.textContent, middle: box.top + box.height / 2, left: css.paddingLeft, right: css.paddingRight, height: box.height }
  }))
  assert.ok(geometry.some(row => row.text === 'Codex'))
  assert.ok(geometry.every(row => row.middle === geometry[0].middle && row.left === row.right && row.height === geometry[0].height), 'Codex and every peer tab share center, padding and height')
  await page.getByRole('tab', { name: '侧栏', exact: true }).click()
  await page.evaluate(async () => {
    window.setFixtureState({ codexCompat: undefined, balance: { status: 'ok', totalBalance: 4.98, grantedBalance: 0, toppedUpBalance: 4.98, currency: 'CNY' }, today: { input: 16400000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, cost: 1.23, apiCost: 1.23 } })
    await window.configure({ sidebarSummaryPromptSeen: false, sidebar: true, hideTodayCost: false, hideOfficialBalance: false, hideBudget: true, sidebarModels: { enabled: false }, codexQuotaEnabled: false, balance: { display: 'both' }, peakEnabled: true, peakNotice: true })
    localStorage.removeItem('dsh-cost-meter:sidebar-summary-intro-v1')
    window.showSummaryGuide()
  })
  const guide = page.getByRole('dialog', { name: '新增合并侧栏样式' })
  await guide.waitFor({ state: 'visible' })
  await guide.getByRole('button', { name: '使用合并卡片', exact: true }).click()
  await guide.waitFor({ state: 'detached' })
  await page.waitForFunction(() => window.current().sidebarStyle === 'summary' && window.current().sidebarSummaryPromptSeen)
  assert.equal(await page.evaluate(() => window.current().sidebarTodayMetric), 'both')
  await page.evaluate(() => { window.disposeSummaryGuide(); window.showSummaryGuide() })
  assert.equal(await guide.count(), 0, 'introduction is not repeated after acknowledgement')
  const sidebar = page.locator('#actual-sidebar')
  await sidebar.evaluate(node => { node.style.position = 'static'; node.style.left = 'auto' })
  for (const width of [352, 280, 220]) {
    await sidebar.evaluate((node, width) => { node.style.width = width + 'px' }, width)
    await page.waitForTimeout(30)
    const fits = await sidebar.evaluate(node => {
      const outer = node.getBoundingClientRect()
      return [...node.querySelectorAll('[data-cm-today],.cm-peak-progress-time')].every(value => { const box = value.getBoundingClientRect(); return box.left >= outer.left - 1 && box.right <= outer.right + 1 })
    })
    assert.equal(fits, true, 'summary tokens, amount and switch time fit at ' + width + 'px')
  }
  await sidebar.evaluate(node => { node.style.width = '280px' })
  const summary = sidebar.locator('.cm-footer-stack.summary')
  assert.equal(await summary.locator('[data-cm-display=today]').count(), 1)
  assert.equal(await summary.locator('[data-cm-display=balance]').count(), 1)
  await summary.locator('.variant-summary').waitFor()
  await summary.screenshot({ path: join(output, 'sidebar-combined-card.png') })
  const preference = page.getByRole('switch', { name: '弹出 billion-context 计费兼容提醒', exact: true })
  await preference.uncheck()
  await page.waitForFunction(() => window.current().billionContextNoticeEnabled === false)
  await page.evaluate(() => window.disposeSummaryGuide())
  return { combinedCard: true, introductionOnce: true, narrowWidths: [352, 280, 220], codexTabAlignment: true, notificationSetting: true }
}
