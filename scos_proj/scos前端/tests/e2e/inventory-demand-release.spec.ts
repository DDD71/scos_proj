import { expect, test } from '@playwright/test'

test('成品补产需求发布后能在精益排程查看', async ({ page }) => {
  const businessDate = '2026-10-12'
  await page.goto('/inventory')
  const forecast = page.getByRole('region', { name: '库存预测', exact: true })
  const release = forecast.getByRole('region', { name: '待补产成品需求' })
  await release.getByRole('button', { name: '发布成品需求' }).click()
  const dialog = page.getByRole('dialog', { name: '发布成品需求' })
  await expect(dialog.getByText(/果糖F55（FG-F55）/)).toBeVisible()
  await expect(dialog.getByText(`演示业务基准日 ${businessDate}`, { exact: true })).toBeVisible()
  const firstDemand = dialog.locator('tbody tr').first()
  await expect(firstDemand).toBeVisible()
  const [startDate, availabilityDate, amount] = await firstDemand
    .getByRole('cell')
    .allTextContents()
  expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(startDate! > businessDate).toBe(true)
  expect(availabilityDate! > startDate!).toBe(true)
  expect(Number(amount?.replaceAll(',', ''))).toBeGreaterThan(0)

  await dialog.getByRole('button', { name: '确认发布' }).click()
  await expect(dialog).toBeHidden()
  await expect(release.getByRole('status')).toHaveText('已发布至精益排程')
  await expect(release.getByRole('button', { name: '发布成品需求' })).toBeDisabled()

  await release.getByRole('link', { name: '查看排程待办' }).click()
  await expect(page).toHaveURL(/\/scheduling\?demand=/)
  await page.reload()
  await expect(page.getByRole('heading', { name: '精益排程', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '业务基准日', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '发布操作时间', exact: true })).toBeVisible()
  const received = page.getByRole('row').filter({ hasText: availabilityDate! }).first()
  await expect(received.getByRole('cell', { name: businessDate, exact: true })).toBeVisible()
  await expect(received).toContainText(startDate!)
  await expect(received).toContainText(amount!)
  await expect(page.getByText('待排产', { exact: true }).first()).toBeVisible()

  await page.goto('/inventory')
  await expect(release.getByRole('button', { name: '发布成品需求' })).toBeDisabled()
})
