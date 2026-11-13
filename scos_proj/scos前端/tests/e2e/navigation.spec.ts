import { expect, test } from '@playwright/test'

test('可以从驾驶舱进入业务页，刷新及返回保持正确页面', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '供应链驾驶舱', exact: true })).toBeVisible()
  await expect(page.getByText('暂无数据快照').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
  await page.getByRole('link', { name: /库存优化.*让库存水位/ }).click()
  await expect(page).toHaveURL(/\/inventory\/overview$/)
  await page.getByRole('link', { name: '库存策略', exact: true }).click()
  await expect(page).toHaveURL(/\/inventory\/strategy$/)
  await page.reload()
  await expect(page.getByRole('heading', { name: '库存策略', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: '库存总览', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('模块入口可直接访问，未知地址提供返回路径', async ({ page }) => {
  const cases = [
    ['/sandbox', '沙盘推演'],
    ['/procurement/plans', '采购方案管理'],
    ['/requisition/planning', '日度要货计划'],
    ['/costing/multidim', '多维成本和盈利分析'],
    ['/traceability/query', '全程批次追溯'],
    ['/traceability/impact', '质量影响分析'],
    ['/system/jobs', '任务中心'],
    ['/integrations/production', '生产计划协同'],
  ] as const
  for (const [path, title] of cases) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await page.goto('/integrations/trace')
  await expect(page).toHaveURL(/\/traceability\/query$/)
  await expect(page.getByRole('heading', { name: '全程批次追溯', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: '质量影响分析', exact: true }).click()
  await expect(page).toHaveURL(/\/traceability\/impact$/)
  await page.goto('/does-not-exist')
  await expect(page.getByText('页面不存在', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '返回驾驶舱' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('窄屏可以打开导航并跳转', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await page.getByRole('button', { name: '导航', exact: true }).click()
  await page.getByRole('menuitem', { name: '沙盘推演', exact: true }).click()
  await expect(page.getByRole('heading', { name: '沙盘推演', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导航', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})
