import { expect, test } from '@playwright/test'

test('日度执行偏差按实际期末库存滚动并带入调整入口', async ({ page }) => {
  await page.goto('/inventory')
  await expect(page.getByRole('heading', { name: '库存优化', exact: true })).toBeVisible()
  const latest = page.getByRole('region', { name: '最新日度执行偏差', exact: true })
  await expect(latest).toContainText('2026-10-12')
  await expect(latest).toContainText('−40 吨')
  const overviewForecast = page.getByRole('region', { name: '库存预测', exact: true })
  await expect(overviewForecast).toContainText('按实际期末库存滚动')
  await page.getByRole('link', { name: '查看日度执行偏差', exact: true }).click()
  await expect(page).toHaveURL(
    (url) => url.pathname === '/inventory/plans' && url.searchParams.get('mode') === 'day',
  )

  const execution = page.getByRole('region', { name: '日度执行偏差', exact: true })
  const executionDate = execution.getByRole('combobox', { name: '执行日期', exact: true })
  await expect(executionDate).toHaveValue('2026-10-12')
  const expectedMetrics = [
    ['车间产出', '100 吨', '80 吨', '−20 吨'],
    ['可用入库', '100 吨', '80 吨', '−20 吨'],
    ['出货', '200 吨', '220 吨', '+20 吨'],
    ['期末可用库存', '500 吨', '460 吨', '−40 吨'],
  ] as const
  for (const [title, planned, actual, variance] of expectedMetrics) {
    const row = execution.getByRole('row').filter({ hasText: title })
    await expect(row.locator('td').nth(-3)).toHaveText(planned)
    await expect(row.locator('td').nth(-2)).toHaveText(actual)
    await expect(row.locator('td').nth(-1)).toHaveText(variance)
  }
  await expect(execution).toContainText(/460 吨.*2026-10-13|2026-10-13.*460 吨/)
  const rolling = page.getByRole('region', { name: '28 天库存滚动监控', exact: true })
  await expect(
    rolling.getByRole('columnheader', { name: '期初可用库存', exact: true }),
  ).toBeVisible()
  const nextDate = rolling.getByRole('row').filter({ hasText: '2026-10-13' })
  await expect(nextDate.getByRole('cell').nth(1)).toHaveText('460')

  await executionDate.selectOption('2026-10-11')
  await expect(execution.getByText('回传完整', { exact: true })).toBeVisible()
  await expect(
    execution.getByRole('row').filter({ hasText: '车间产出' }).locator('td').nth(-2),
  ).toHaveText('119 吨')
  await expect(
    execution.getByRole('row').filter({ hasText: '期末可用库存' }).locator('td').nth(-2),
  ).toHaveText('600 吨')
  await expect(executionDate.locator('option[value="2026-10-13"]')).toHaveCount(0)
  await expect(nextDate).not.toContainText('执行实绩')
  await executionDate.selectOption('2026-10-12')

  await execution.getByRole('link', { name: '调整补充计划', exact: true }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/inventory/plans' &&
      url.searchParams.get('mode') === 'week' &&
      url.searchParams.get('week') === '3' &&
      url.searchParams.get('rolling') === '1',
  )
  const week = page.getByRole('region', { name: '第 3 周日度明细', exact: true })
  const weekNextDate = week.getByRole('row').filter({ hasText: '2026-10-13' })
  await expect(weekNextDate.getByRole('cell').nth(1)).toHaveText('460')
  await expect(weekNextDate.getByRole('button', { name: '调整补充量' })).toBeEnabled()

  await page.goBack()
  await execution.getByRole('link', { name: '调整库存策略', exact: true }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/inventory/overview' &&
      url.searchParams.get('product') === 'FG-F55' &&
      url.searchParams.get('adjust') === '1' &&
      url.searchParams.get('date') === '2026-10-12',
  )
  const strategy = page.getByRole('region', { name: '库存策略调整', exact: true })
  await expect(strategy.getByRole('textbox', { name: '调整原因', exact: true })).toHaveValue(
    /2026-10-12 日度执行偏差.*期末可用库存 −40 吨/,
  )
  await strategy.getByRole('spinbutton', { name: '生产提前期（天）' }).fill('4')
  await strategy.getByRole('button', { name: '确认', exact: true }).click()
  await expect(overviewForecast).toContainText('策略 INV-POL-202610-FG-F55-V2')
  await expect(overviewForecast.getByRole('region', { name: '实际期末库存水位' })).toContainText(
    '460 吨',
  )
})

test('月度计划可回看累计和每日执行偏差、系统结论及跟踪任务', async ({ page }) => {
  await page.goto('/inventory/plans?mode=month&product=FG-F55')
  await expect(page.getByRole('combobox', { name: '执行月份', exact: true })).toHaveValue('2026-09')
  await expect(page.getByRole('table', { name: '月度计划与实际', exact: true })).toBeVisible()
  const verdict = page.getByRole('region', { name: '月度总评', exact: true })
  await expect(verdict).toHaveCount(0)
  await page.getByRole('link', { name: '查看月度执行复盘', exact: true }).click()
  await expect(page.getByRole('heading', { name: '库存健康度', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '成品', exact: true })).toHaveValue('FG-F55')
  await expect(page.getByRole('combobox', { name: '评价月份', exact: true })).toHaveValue('2026-09')

  const monthly = page.getByRole('table', { name: '月度计划与实际', exact: true })
  const monthlyMetrics = [
    ['车间产出', '13,385 吨', '13,365 吨', '−20 吨', '29 天'],
    ['可用入库', '13,745 吨', '13,725 吨', '−20 吨', '30 天'],
    ['出货', '11,985 吨', '12,039 吨', '+54 吨', '30 天'],
    ['月末可用库存', '2,200 吨', '2,126 吨', '−74 吨', '月末当日'],
  ] as const
  for (const [
    metric,
    expectedPlan,
    expectedActual,
    expectedVariance,
    comparedDates,
  ] of monthlyMetrics) {
    const row = monthly
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: metric, exact: true }) })
    const cells = row.getByRole('cell')
    await expect(cells.nth(0)).toHaveText(expectedPlan)
    await expect(cells.nth(1)).toHaveText(expectedActual)
    await expect(cells.nth(2)).toHaveText(expectedVariance)
    await expect(cells.nth(3)).toHaveText(comparedDates)
  }
  const alerts = page.getByRole('heading', { name: '预警结论', exact: true })
  await expect(alerts).toBeVisible()
  await expect(verdict).toBeVisible()
  await expect
    .poll(async () => (await verdict.boundingBox())!.y < (await alerts.boundingBox())!.y)
    .toBe(true)
  await expect(page.getByText('实际期末库存低于安全库存', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '策略建议', exact: true })).toBeVisible()
  await expect(page.getByText('建议复核库存策略', { exact: true })).toBeVisible()
  const tracking = page.getByRole('region', { name: '跟踪任务', exact: true })
  const missingDataTask = tracking
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: '跟踪未回传的日度实绩', exact: true }) })
  const daily = page.getByRole('table', { name: '每日计划与实际', exact: true })
  await expect(daily).toBeHidden()
  await missingDataTask.getByRole('button', { name: '查看涉及日期', exact: true }).click()
  const missingDay = daily.getByRole('row').filter({ hasText: '2026-09-07' })
  await expect(missingDay).toBeFocused()
  await expect(missingDay.getByRole('cell').nth(1)).toHaveText('待回传')
  const delayedReceiptDay = daily.getByRole('row').filter({ hasText: '2026-09-15' })
  const delayedReceipt = delayedReceiptDay.getByRole('cell')
  await expect(delayedReceipt.nth(1)).toHaveText('400 吨')
  await expect(delayedReceipt.nth(4)).toHaveText('345 吨')
  await expect(delayedReceipt.nth(5)).toHaveText('−45 吨')
  await verdict.getByRole('button', { name: '查看总评依据', exact: true }).click()
  await expect(delayedReceiptDay).toBeFocused()

  await page.getByRole('link', { name: '查看日度执行偏差', exact: true }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/inventory/plans' &&
      url.searchParams.get('mode') === 'day' &&
      url.searchParams.get('product') === 'FG-F55',
  )
  await expect(page.getByRole('region', { name: '日度执行偏差', exact: true })).toBeVisible()
})
