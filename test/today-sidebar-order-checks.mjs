import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function checkTodayAndOrder(page, output) {
  const target = key => page.locator('.cm-preview .cm-sidebar-target[data-cm-order-key="' + key + '"]')
  await target('today').click()
  await page.locator('input[data-display-option=today-tokens]').check()
  await page.waitForFunction(() => window.current().sidebarTodayMetric === 'both')
  const actual = page.locator('#actual-sidebar [data-cm-display=today]')
  assert.equal(await actual.locator('[data-cm-today]').count(), 2)
  for (const part of ['today-cost', 'today-tokens']) assert.equal(await page.locator('.cm-preview .cm-sidebar-target[data-display-part="' + part + '"]').count(), 1)
  for (const width of [352, 280]) {
    await page.locator('#actual-sidebar').evaluate((node, width) => { node.style.width = width + 'px' }, width)
    assert.ok(await actual.evaluate(node => {
      const outer=node.getBoundingClientRect()
      return [...node.querySelectorAll('[data-cm-today]')].every(child => { const box=child.getBoundingClientRect();return box.right <= outer.right + 1 && box.left >= outer.left - 1 })
    }), 'today cost and tokens fit the sidebar')
  }
  await page.locator('#actual-sidebar').evaluate(node => { node.style.width = '352px' })
  await page.screenshot({ path: join(output, 'today-both-and-subitems.png'), fullPage: true })
  await page.locator('input[data-display-option=today-cost]').uncheck()
  await page.waitForFunction(() => window.current().sidebarTodayMetric === 'tokens')
  assert.equal(await actual.locator('[data-cm-today=cost]').count(), 0)
  await page.locator('input[data-display-option=today-cost]').check()
  await page.locator('input[data-display-option=today-tokens]').uncheck()
  await page.waitForFunction(() => window.current().sidebarTodayMetric === 'cost')

  await target('today').dragTo(target('balance'), { targetPosition: { x: 10, y: 2 } })
  await page.waitForFunction(() => window.current().sidebarOrder.indexOf('today') >= 0 && window.current().sidebarOrder.indexOf('today') < window.current().sidebarOrder.indexOf('balance'))
  await page.locator('#actual-sidebar').evaluate(node => { node.style.position='static';node.style.left='auto' })
  const handle = key => page.locator('#actual-sidebar .cm-order-handle[data-cm-order-key="' + key + '"]')
  await handle('balance').hover()
  await handle('balance').dragTo(actual, { targetPosition: { x: 20, y: 2 } })
  await page.waitForFunction(() => window.current().sidebarOrder.indexOf('balance') < window.current().sidebarOrder.indexOf('today'))
  await handle('balance').focus();await handle('balance').press('ArrowDown')
  await page.waitForFunction(() => window.current().sidebarOrder.indexOf('today') < window.current().sidebarOrder.indexOf('balance'))
  const before = await page.evaluate(() => window.current().sidebarOrder)
  await page.evaluate(() => { window.failSave = true })
  await handle('balance').press('ArrowUp')
  await page.getByRole('status').filter({ hasText: '保存失败' }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.current().sidebarOrder), before, 'failed sidebar save keeps the previous order')
  await page.evaluate(() => { window.failSave = false })
  await page.screenshot({ path: join(output, 'sidebar-drag-order.png'), fullPage: true })
  await page.evaluate(async () => {
    const patch={sidebarOrder:[],sidebarTodayMetric:'cost'}
    await window.saveConfig(patch);window.setConfig(patch);window.remount()
  })
  await page.getByRole('tab', { name: '显示', exact: true }).click()
  await page.locator('.cm-display').waitFor()
  await page.locator('#actual-sidebar').evaluate(node => { node.style.position='fixed';node.style.left='-2000px' })
}
