import { expect, test } from '@playwright/test'

test('保留两套采购方案，并仅模拟下发所选方案', async ({ page }) => {
  await page.goto('/procurement/plans/new?month=2026-11')
  await page.getByRole('button', { name: '确认需求并设置求解参数' }).click()
  await expect(page.getByRole('heading', { name: '制定采购方案', exact: true })).toBeVisible()

  const rate = page.getByRole('spinbutton', { name: '年化资金成本率（%）', exact: true })
  const solve = page.getByRole('button', { name: '开始求解', exact: true })
  const save = page.getByRole('button', { name: '保存方案', exact: true })
  const version1 = page.getByRole('radio', { name: '选择方案 V1', exact: true })
  const version2 = page.getByRole('radio', { name: '选择方案 V2', exact: true })
  const version1Row = page.getByRole('row').filter({ has: version1 })
  const version2Row = page.getByRole('row').filter({ has: version2 })
  const dispatch = page.getByRole('button', { name: '下发', exact: true })
  const receipt = page.getByText('已模拟下发至 E采')

  for (const [fundingRate, savedVersion] of [
    ['0', version1],
    ['5', version2],
  ] as const) {
    await rate.fill(fundingRate)
    await rate.press('Tab')
    await solve.click()
    await save.click()
    await expect(savedVersion).toBeVisible()
  }
  await expect(version1Row.getByRole('cell').nth(4)).toHaveText('0%')
  await expect(version2Row.getByRole('cell').nth(4)).toHaveText('5%')

  await version1.check()
  await expect(page.getByRole('heading', { name: '采购方案 V1', exact: true })).toBeVisible()
  await dispatch.click()
  await page.getByRole('button', { name: '确认下发', exact: true }).click()
  await expect(receipt).toBeVisible()

  await page.reload()
  await expect(version1).toBeChecked()
  await expect(page.getByRole('heading', { name: '采购方案 V1', exact: true })).toBeVisible()
  await expect(receipt).toBeVisible()
  await expect(dispatch).toHaveCount(0)
  await expect(version2Row.getByText('待下发')).toBeVisible()

  await page.getByRole('button', { name: '返回列表', exact: true }).click()
  await page.getByRole('link', { name: '继续制定', exact: true }).click()
  await expect(version1).toBeChecked()
  await expect(receipt).toBeVisible()

  await version2.check()
  await expect(page.getByRole('heading', { name: '采购方案 V2', exact: true })).toBeVisible()
  await expect(dispatch).toBeEnabled()
})

test('采购方案可按原料与日期筛选草稿与历史', async ({ page }) => {
  await page.addInitScript(() => {
    const draft = {
      plant: '中粮太仓工厂',
      unit: '吨',
      demandNote: '',
      supplierCodes: [],
      supplierReview: '',
      costNote: '',
      reviewNote: '',
    }
    sessionStorage.setItem(
      'scos.procurement.drafts',
      JSON.stringify([
        {
          ...draft,
          id: 'date-filter-october',
          month: '2026-10',
          createdOn: '2026-09-29',
          materialCode: 'RM-CORN-STARCH',
        },
        {
          ...draft,
          id: 'date-filter-september',
          month: '2026-09',
          createdOn: '2026-08-29',
          materialCode: 'MOCK-GL',
        },
        {
          ...draft,
          id: 'date-filter-legacy',
          month: '2026-09',
          materialCode: 'TEST-LEGACY',
        },
      ]),
    )
  })
  await page.goto('/procurement/plans')

  const drafts = page.getByRole('region', { name: '本地草稿', exact: true })
  const history = page.getByRole('region', { name: '历史采购方案', exact: true })
  const material = page.getByLabel('原料', { exact: true })
  const octoberDraft = drafts.getByText('RM-CORN-STARCH', { exact: true })
  const septemberDraft = drafts.getByText('MOCK-GL', { exact: true })
  const legacyDraft = drafts.getByText('TEST-LEGACY', { exact: true })
  const octoberPlan = history.getByText('PUR-202610-V1', { exact: true })
  const septemberPlan = history.getByText('PUR-202609-V2', { exact: true })
  const archivedPlan = history.getByText('MOCK-202609-02', { exact: true })
  const otherMaterialPlan = history.getByText('MOCK-202609-01', { exact: true })
  const otherMonthPlan = history.getByText('MOCK-202608-02', { exact: true })

  await expect(material).toHaveValue('RM-CORN-STARCH')
  for (const item of [octoberDraft, octoberPlan, septemberPlan]) {
    await expect(item).toBeVisible()
  }
  for (const item of [septemberDraft, legacyDraft, archivedPlan]) {
    await expect(item).toHaveCount(0)
  }

  await material.selectOption('')
  for (const item of [
    octoberDraft,
    septemberDraft,
    legacyDraft,
    octoberPlan,
    septemberPlan,
    archivedPlan,
  ]) {
    await expect(item).toBeVisible()
  }

  await page.getByRole('radio', { name: '按月', exact: true }).check()
  await page.getByLabel('方案月份', { exact: true }).fill('2026-09')
  await expect(octoberDraft).toHaveCount(0)
  await expect(octoberPlan).toHaveCount(0)
  for (const item of [septemberDraft, legacyDraft, septemberPlan, archivedPlan]) {
    await expect(item).toBeVisible()
  }

  await material.selectOption('MOCK-GL')
  for (const item of [septemberDraft, archivedPlan]) {
    await expect(item).toBeVisible()
  }
  for (const item of [legacyDraft, septemberPlan, otherMaterialPlan, otherMonthPlan]) {
    await expect(item).toHaveCount(0)
  }
  await page.getByRole('button', { name: '清除日期', exact: true }).click()
  await expect(material).toHaveValue('MOCK-GL')
  await expect(otherMonthPlan).toBeVisible()
  await expect(otherMaterialPlan).toHaveCount(0)

  await material.selectOption('')
  await page.getByRole('radio', { name: '日期范围', exact: true }).check()
  await page.getByLabel('开始日期', { exact: true }).fill('2026-09-29')
  await page.getByLabel('结束日期', { exact: true }).fill('2026-09-29')
  await expect(octoberDraft).toBeVisible()
  await expect(octoberPlan).toBeVisible()
  for (const item of [septemberDraft, legacyDraft, septemberPlan, archivedPlan]) {
    await expect(item).toHaveCount(0)
  }

  await page.getByRole('button', { name: '清除日期', exact: true }).click()
  for (const item of [
    octoberDraft,
    septemberDraft,
    legacyDraft,
    octoberPlan,
    septemberPlan,
    archivedPlan,
  ]) {
    await expect(item).toBeVisible()
  }
})
