import { expect, test } from '@playwright/test'

test('侧栏按指定顺序进入六个模块，刷新及返回保持正确页面', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')

  const modules = [
    ['驾驶舱', '/dashboard', '供应链驾驶舱', '态势总览'],
    ['采购优化', '/procurement/plans', '采购方案', '采购方案'],
    ['要货计划', '/requisition/overview', '要货概览', '要货概览'],
    ['成品库存优化', '/inventory/overview', '库存优化', '库存优化'],
    ['成本核算分析', '/costing/lineage', '批次划分'],
    ['精益排程', '/scheduling'],
  ] as const
  const nav = page.getByRole('navigation', { name: '业务模块导航' })
  const primaryItems = nav.locator('[role="menubar"] > [role="menuitem"]')
  await expect(primaryItems).toHaveCount(modules.length)
  for (const [index, [title, path, heading = title, section]] of modules.entries()) {
    const menuItem = primaryItems.nth(index)
    await expect(menuItem).toHaveAccessibleName(title)
    if (section) {
      if ((await menuItem.getAttribute('aria-expanded')) !== 'true')
        await menuItem.getByText(title, { exact: true }).click()
      await menuItem.getByRole('menuitem', { name: section, exact: true }).click()
    } else {
      await menuItem.click()
    }
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(menuItem).toHaveClass(/is-active/)
  }
  await page.screenshot({ path: testInfo.outputPath('scheduling.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: '精益排程', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: '批次划分', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('沙盘推演位于驾驶舱子菜单，刷新后保持展开和高亮', async ({ page }) => {
  await page.goto('/dashboard')
  const navigation = page.getByRole('navigation', { name: '业务模块导航' })
  const dashboard = navigation.getByRole('menuitem', { name: '驾驶舱', exact: true })
  const overview = dashboard.getByRole('menuitem', { name: '态势总览', exact: true })
  const sandbox = dashboard.getByRole('menuitem', { name: '沙盘推演', exact: true })
  await expect(overview).toHaveClass(/is-active/)
  await sandbox.click()
  await expect(page).toHaveURL('/sandbox')
  await expect(sandbox).toHaveClass(/is-active/)
  await page.reload()
  await expect(dashboard).toHaveAttribute('aria-expanded', 'true')
  await expect(sandbox).toHaveClass(/is-active/)
  await overview.click()
  await expect(page).toHaveURL('/dashboard')
  await expect(overview).toHaveClass(/is-active/)
})

test('采购子菜单切换页面并高亮当前入口', async ({ page }) => {
  await page.goto('/procurement/plans/new')
  const procurement = page.getByRole('menuitem', { name: '采购优化', exact: true })
  await expect(procurement).toHaveAttribute('aria-expanded', 'true')
  await expect(procurement.getByRole('menuitem')).toHaveText(['采购方案', '供应商资料', '执行情况'])
  await expect(procurement.getByRole('menuitem', { name: '采购方案' })).toHaveClass(/is-active/)

  for (const [title, path] of [
    ['供应商资料', '/procurement/suppliers'],
    ['执行情况', '/procurement/execution'],
  ] as const) {
    const menuItem = procurement.getByRole('menuitem', { name: title })
    await menuItem.click()
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(menuItem).toHaveClass(/is-active/)
  }
  await page.reload()
  await expect(procurement.getByRole('menuitem', { name: '执行情况' })).toHaveClass(/is-active/)
})

test('模块入口可直接访问，未知地址提供返回路径', async ({ page }) => {
  const cases = [
    ['/sandbox', '沙盘推演'],
    ['/procurement/plans', '采购方案'],
    ['/requisition/planning', '周要货计划'],
    ['/costing/multidim', '多维成本和利润分析'],
    ['/traceability/query', '全程追溯协同'],
    ['/traceability/impact', '全程追溯协同'],
    ['/system/jobs', '任务中心'],
    ['/integrations/production', '生产计划协同'],
  ] as const
  for (const [path, title] of cases) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await page.goto('/integrations/trace')
  await expect(page).toHaveURL(/\/costing\/traceability$/)
  await expect(page.getByRole('heading', { name: '全程追溯协同', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: '质量影响与协同', exact: true }).click()
  await expect(page).toHaveURL(/\/costing\/traceability\?tab=impact$/)
  await expect(page.getByRole('heading', { name: '质量异常', exact: true })).toBeVisible()
  await page.goto('/does-not-exist')
  await expect(page.getByText('页面不存在', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '返回驾驶舱' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('窄屏可以打开导航并跳转', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  const navToggle = page.getByRole('button', { name: '导航', exact: true })
  await navToggle.click()
  const procurement = page.getByRole('menuitem', { name: '采购优化', exact: true })
  await procurement.getByText('采购优化', { exact: true }).click()
  await expect(navToggle).toHaveAttribute('aria-expanded', 'true')
  await procurement.getByRole('menuitem', { name: '采购方案' }).click()
  await expect(page.getByRole('heading', { name: '采购方案', exact: true })).toBeVisible()
  await expect(navToggle).toHaveAttribute('aria-expanded', 'false')
})
