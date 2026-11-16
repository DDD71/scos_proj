import { expect, test } from '@playwright/test'
import type { RequisitionExecutionPlan } from '../../src/modules/requisition/model/execution'

test('从要货概览制定周计划，保存、继续编辑并删除草稿', async ({ page }) => {
  await page.goto('/requisition')
  await expect(page.getByRole('heading', { name: '要货概览' })).toBeVisible()
  const menu = page.getByRole('menuitem', { name: '要货计划', exact: true })
  await expect(menu.getByRole('menuitem')).toHaveText(['要货概览', '已签约供应商', '下达与执行'])
  await expect(page.getByLabel('计划周', { exact: true })).toHaveValue('2026-10-05')
  await expect(page.getByRole('heading', { name: '原料库存与耗用推演' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '辅料与包材' })).toBeVisible()
  await expect(page.getByRole('button', { name: '液化酶', exact: true })).toBeVisible()

  const weeklyPlanCard = page.getByRole('region', { name: '周度要货计划', exact: true })
  const createPlan = weeklyPlanCard.getByRole('link', { name: '新建周度要货计划' })
  await createPlan.click()
  await expect(page).toHaveURL(/\/requisition\/planning\?week=2026-10-05/)
  await expect(menu.getByRole('menuitem', { name: '要货概览' })).toHaveClass(/is-active/)
  const basis = page.getByRole('region', { name: '要货依据', exact: true })
  await expect(basis.getByText('生产计划原料需求', { exact: true })).toBeVisible()
  await expect(basis.getByText('2,960 吨', { exact: true })).toBeVisible()
  await expect(basis.getByText(/APS\s*已发布日度原材料需求/)).toBeVisible()
  await expect(basis.getByText('需求缺口', { exact: true })).toBeVisible()
  await expect(basis.getByText('1,325 吨', { exact: true })).toBeVisible()
  await expect(basis.getByText('最早缺口 2026-10-08 · 15 吨', { exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '预期要货量', exact: true })).toHaveValue(
    /^1325(?:\.0+)?$/,
  )
  await expect(basis.getByText('可安排供应商', { exact: true })).toBeVisible()
  await expect(basis.getByText('4 家', { exact: true })).toBeVisible()
  await expect(basis.getByText('原料仓库上限', { exact: true })).toBeVisible()
  await expect(basis.getByText('2,600 吨', { exact: true })).toBeVisible()
  await expect(basis.getByText('来源 WMS 库存快照')).toBeVisible()
  const supplyConditions = basis.getByText('供应商供货条件', { exact: true })
  const candidate = basis.getByRole('cell', { name: '京粮龙江生物工程有限公司', exact: true })
  await expect(candidate).toBeHidden()
  await supplyConditions.click()
  await expect(candidate).toBeVisible()
  await supplyConditions.click()
  await expect(candidate).toBeHidden()
  await expect(page.getByRole('spinbutton', { name: /仓容上限|仓库上限/ })).toHaveCount(0)
  const projection = page.getByRole('region', { name: '每日需求与原料库存推演' })
  await expect(projection.getByText(/WMS「可用数量」推演.*WMS「在库量」/)).toBeVisible()
  await expect(projection.getByRole('columnheader', { name: '累计生产缺口' })).toBeVisible()
  await expect(projection.getByRole('columnheader', { name: '预计入库峰值' })).toBeVisible()
  await expect(projection.getByRole('columnheader', { name: /安全库存/ })).toHaveCount(0)
  const projectionRows = projection.getByRole('row').filter({ has: page.getByRole('cell') })
  await expect(projectionRows).toHaveCount(7)
  await expect(projectionRows.first().getByRole('cell').first()).toHaveText('2026-10-05')
  await expect(projectionRows.last().getByRole('cell').first()).toHaveText('2026-10-11')

  const result = page.getByRole('region', { name: '供应商要货计划', exact: true })
  const ungenerated = result.getByText('可生成要货建议，也可直接新增到货批次。', {
    exact: true,
  })
  await expect(ungenerated).toBeVisible()
  await expect(result.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '已有到货', exact: true })).toHaveCount(0)

  await expect(
    basis
      .or(result)
      .or(projection)
      .getByRole('heading', {
        name: /^(要货依据|供应商要货计划|每日需求与原料库存推演)$/,
      }),
  ).toHaveText(['要货依据', '供应商要货计划', '每日需求与原料库存推演'])

  const generate = page.getByRole('button', { name: '生成要货建议' })
  await generate.click()
  await expect(result).toContainText(/建议由\s*京粮龙江生物工程有限公司\s*供货/)
  await expect(result.getByText('方案说明', { exact: true })).toBeVisible()
  await expect(result).toContainText('优先供货订单能覆盖本周全部缺口，由一家供应商供货。')
  await expect(result).toContainText('2026-10-08 缺 15 吨、2026-10-10 缺 70 吨')
  await expect(result).toContainText('预计全周生产需求已覆盖')
  await expect(result).toContainText(/预计最高入库占用\s*1,210 吨\s*\/\s*上限\s*2,600 吨/)
  const supplierPlan = result.getByRole('region', { name: '京粮龙江生物工程有限公司', exact: true })
  await expect(supplierPlan).toContainText(/供货顺序第\s*1/)
  await expect(supplierPlan).toContainText(/可安排余量\s*3,000 吨/)
  await expect(supplierPlan).toContainText(/日可供量\s*800 吨/)
  await expect(supplierPlan).toContainText(/至少需要\s*2\s*个到货日/)
  await expect(
    supplierPlan.getByText('本周要货合计 1,325 吨 · 2 批', { exact: true }),
  ).toBeVisible()
  await expect(basis.getByText('1,325 吨', { exact: true })).toBeVisible()
  const suggestionRows = supplierPlan.getByRole('row').filter({ has: page.getByRole('cell') })
  const edited = suggestionRows.filter({ hasText: '526 吨' })
  await expect(suggestionRows).toHaveCount(2)
  await expect(suggestionRows.getByRole('cell', { name: /^2026-10-/ })).toHaveText([
    '2026-10-08',
    '2026-10-10',
  ])
  await expect(suggestionRows.getByRole('cell', { name: /^\d+ 吨$/ })).toHaveText([
    '800 吨',
    '525 吨',
  ])
  await expect(
    projectionRows
      .filter({ has: page.getByRole('cell', { name: '2026-10-08', exact: true }) })
      .getByRole('cell', { name: /^1,210(?: 吨)?$/ }),
  ).toBeVisible()
  const fixedArrivalColumn = 3
  await expect(projection.getByRole('columnheader').nth(fixedArrivalColumn)).toHaveText('固定到货')
  for (const [date, amount] of [
    ['2026-10-06', '400'],
    ['2026-10-08', '300'],
  ] as const) {
    const row = projectionRows.filter({ has: page.getByRole('cell', { name: date, exact: true }) })
    await expect(row.getByRole('cell').nth(fixedArrivalColumn)).toHaveText(amount)
  }

  await suggestionRows.last().getByRole('button', { name: '调整到货' }).click()
  const edit = page.getByRole('dialog', { name: '调整到货建议' })
  await edit.getByLabel('计划到货日期').fill('2026-10-12')
  await edit.getByRole('button', { name: '保存调整' }).click()
  await expect(edit.getByText('计划到货日期须在本周内。')).toBeVisible()
  await edit.getByLabel('计划到货日期').fill('2026-10-10')
  const amount = edit.getByRole('spinbutton', { name: '计划到货量' })
  await amount.fill('526')
  await amount.press('Tab')
  await edit.getByRole('button', { name: '保存调整' }).click()
  await expect(edit).toBeHidden()
  await expect(edited).toBeVisible()
  await expect(
    supplierPlan.getByText('本周要货合计 1,326 吨 · 2 批', { exact: true }),
  ).toBeVisible()
  await expect(result.getByText('超出目标 1 吨', { exact: true })).toBeVisible()
  await edited.getByRole('button', { name: '锁定', exact: true }).click()
  await generate.click()
  await expect(edited.getByRole('button', { name: '解锁', exact: true })).toBeVisible()
  await expect(
    supplierPlan.getByText('本周要货合计 1,325 吨 · 2 批', { exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('已保存本地草稿。', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回要货概览' }).click()
  await expect(page.getByLabel('计划周', { exact: true })).toHaveValue('2026-10-05')
  await expect(page.getByRole('link', { name: '继续制定周度要货计划' })).toHaveCount(0)
  await expect(createPlan).toBeVisible()
  const drafts = weeklyPlanCard.getByRole('region', { name: '本地草稿', exact: true })
  const draft = drafts.getByRole('row').filter({ hasText: '2026-10-05' })
  await expect(draft).toContainText('玉米淀粉')

  const material = page.getByRole('combobox', { name: '物料', exact: true })
  await material.selectOption('PK-WB-301')
  await expect(createPlan).toBeVisible()
  await expect(draft).toBeVisible()
  await material.selectOption('RM-CORN-STARCH')

  await createPlan.click()
  await expect(page).toHaveURL(/[?&]mode=new(?:&|$)/)
  await expect(projection).toBeVisible()
  await expect(ungenerated).toBeVisible()
  await expect(supplierPlan).toHaveCount(0)
  await page.getByRole('link', { name: '返回要货概览' }).click()
  await page.evaluate(() => {
    const key = 'scos.requisition.draft.2026-10-05.RM-CORN-STARCH'
    const saved = JSON.parse(sessionStorage.getItem(key)!)
    sessionStorage.setItem(key, JSON.stringify({ ...saved, warehouseCapacity: 400 }))
  })
  await draft.getByRole('link', { name: '继续编辑', exact: true }).click()
  await expect(page.getByText('已载入本地草稿。', { exact: true })).toBeVisible()
  await expect(basis.getByText('2,600 吨', { exact: true })).toBeVisible()
  await expect(result.getByText('方案说明', { exact: true })).toBeVisible()
  await expect(supplierPlan).toContainText(/供货顺序第\s*1/)
  await expect(edited.getByRole('button', { name: '解锁', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '删除草稿', exact: true }).click()
  await page
    .getByRole('tooltip')
    .filter({ hasText: '删除本周该物料的草稿？' })
    .getByRole('button', { name: '确认删除', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '要货概览' })).toBeVisible()
  await expect(draft).toHaveCount(0)
  await expect(createPlan).toBeVisible()

  await createPlan.click()
  await generate.click()
  await page.getByRole('button', { name: '保存草稿' }).click()
  await page.getByRole('link', { name: '返回要货概览' }).click()
  const deleteFromOverview = draft.getByRole('button', { name: '删除', exact: true })
  const overviewConfirmation = page.getByRole('tooltip').filter({ hasText: '删除这份要货草稿？' })
  await deleteFromOverview.click()
  await overviewConfirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(draft).toBeVisible()

  await deleteFromOverview.click()
  await overviewConfirmation.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(draft).toHaveCount(0)
  await expect(createPlan).toBeVisible()
})

test('人工调整供货顺序和批次后，草稿恢复修改后的方案', async ({ page }) => {
  await page.goto('/requisition')
  await page.getByRole('link', { name: '新建周度要货计划' }).click()

  const jingliang = '京粮龙江生物工程有限公司'
  const longfeng = '黑龙江龙凤玉米开发有限公司'
  const basis = page.getByRole('region', { name: '要货依据', exact: true })
  const result = page.getByRole('region', { name: '供应商要货计划', exact: true })
  const generate = page.getByRole('button', { name: '生成要货建议', exact: true })
  const jingliangPlan = result.getByRole('region', { name: jingliang, exact: true })
  const longfengPlan = result.getByRole('region', { name: longfeng, exact: true })

  await generate.click()
  await expect(jingliangPlan).toContainText('本周要货合计 1,325 吨 · 2 批')
  await result.getByRole('button', { name: '调整供货顺序', exact: true }).click()
  const moveLongfengUp = basis.getByRole('button', { name: `上移 ${longfeng}`, exact: true })
  await moveLongfengUp.click()
  await expect(page.getByText(/供货顺序已调整/).first()).toBeVisible()
  await expect(jingliangPlan).toBeVisible()
  await generate.click()
  await expect(jingliangPlan).toHaveCount(0)
  await expect(longfengPlan).toContainText(/供货顺序第\s*1/)
  await expect(longfengPlan.getByRole('cell', { name: /^\d+ 吨$/ })).toHaveText([
    '700 吨',
    '625 吨',
  ])

  const firstArrival = longfengPlan.getByRole('row').filter({
    has: page.getByRole('cell', { name: '2026-10-08', exact: true }),
  })
  await firstArrival.getByRole('button', { name: '调整到货', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '调整到货建议', exact: true })
  const supplierOrder = edit.getByRole('combobox', { name: '供货供应商 / 采购订单', exact: true })
  await expect(supplierOrder).toBeVisible()
  await supplierOrder.selectOption({ label: `${jingliang} · PO-202609-001` })
  const quantity = edit.getByRole('spinbutton', { name: '计划到货量', exact: true })
  await quantity.fill('710')
  await quantity.press('Tab')
  await edit.getByRole('button', { name: '保存调整', exact: true }).click()
  await expect(edit).toBeHidden()

  await expect(jingliangPlan.getByRole('cell', { name: '2026-10-08', exact: true })).toBeVisible()
  await expect(
    jingliangPlan.getByRole('cell', { name: 'PO-202609-001', exact: true }),
  ).toBeVisible()
  await expect(jingliangPlan.getByRole('cell', { name: '710 吨', exact: true })).toBeVisible()
  await expect(longfengPlan.getByRole('cell', { name: '625 吨', exact: true })).toBeVisible()
  await page.getByLabel('调整原因').fill('供应商已确认可按调整后的批次供货。')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('已保存本地草稿。', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回要货概览' }).click()
  await page.getByRole('link', { name: '继续编辑', exact: true }).click()

  await expect(page.getByText('已载入本地草稿。', { exact: true })).toBeVisible()
  await expect(page.getByLabel('调整原因')).toHaveValue('供应商已确认可按调整后的批次供货。')
  await expect(longfengPlan).toContainText(/供货顺序第\s*1/)
  await expect(longfengPlan.getByRole('cell', { name: '625 吨', exact: true })).toBeVisible()
  await expect(jingliangPlan).toContainText(/供货顺序第\s*2/)
  await expect(jingliangPlan.getByRole('cell', { name: '710 吨', exact: true })).toBeVisible()
  await expect(result.getByRole('button', { name: '确认并前往下达', exact: true })).toBeEnabled()
})

test('本周没有需求缺口也可直接新增批次，超过仓库上限时拒绝加入', async ({ page }) => {
  const priorPlan: RequisitionExecutionPlan = {
    id: 'REQPLN-PREVIOUS-WEEK',
    plant: '中粮太仓工厂',
    source: {
      weekStart: '2026-09-28',
      materialCode: 'RM-CORN-STARCH',
      demandVersion: 'TEST-DMD',
      inventoryVersion: 'TEST-WMS',
      conditionVersion: 'TEST-CONDITIONS',
      warehouseCapacity: 2600,
      confirmedAt: '2026-10-01T08:00:00+08:00',
    },
    rows: (
      [
        ['2026-10-02', '2026-10-05', 800],
        ['2026-10-04', '2026-10-07', 525],
      ] as const
    ).map(([plannedDate, estimatedArrivalDate, plannedQuantity], index) => ({
      id: `REQPLN-PREVIOUS-WEEK-${index + 1}`,
      contractId: 'HT-YM-260801',
      orderId: 'PO-202609-001',
      supplierName: '京粮龙江生物工程有限公司',
      materialName: '玉米淀粉',
      unit: '吨',
      plannedDate,
      estimatedArrivalDate,
      plannedQuantity,
      releaseStatus: '已下达',
    })),
  }
  await page.addInitScript((plan) => {
    const key = 'scos.mock.requisition.published-plans'
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify([plan]))
  }, priorPlan)
  await page.goto('/requisition')
  await page.getByRole('link', { name: '新建周度要货计划' }).click()

  const basis = page.getByRole('region', { name: '要货依据', exact: true })
  await expect(basis.getByText('0 吨', { exact: true })).toBeVisible()
  const result = page.getByRole('region', { name: '供应商要货计划', exact: true })
  const add = result.getByRole('button', { name: '新增到货批次', exact: true })
  const dialog = page.getByRole('dialog', { name: '新增到货批次', exact: true })

  async function addArrival(supplier: string, date: string, amount: string) {
    await add.click()
    await dialog.getByRole('combobox', { name: '供货供应商 / 采购订单' }).selectOption({
      label: supplier,
    })
    await dialog.getByLabel('计划到货日期').fill(date)
    const quantity = dialog.getByRole('spinbutton', { name: '计划到货量' })
    await quantity.fill(amount)
    await quantity.press('Tab')
    await dialog.getByRole('button', { name: '加入方案' }).click()
  }

  await addArrival('黑龙江龙凤玉米开发有限公司 · PO-202609-002', '2026-10-06', '700')
  await expect(dialog).toBeHidden()
  await expect(result.getByRole('cell', { name: '700 吨', exact: true })).toBeVisible()
  const saveDraft = page.getByRole('button', { name: '保存草稿', exact: true })
  const publish = result.getByRole('button', { name: '确认并前往下达', exact: true })
  await expect(saveDraft).toBeEnabled()
  await expect(publish).toBeEnabled()

  await addArrival('黑龙江昊天玉米开发有限公司 · PO-202609-003', '2026-10-05', '300')
  await expect(dialog.getByText(/超过仓容上限/)).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await saveDraft.click()
  await expect(page.getByText('已保存本地草稿。', { exact: true })).toBeVisible()

  await publish.click()
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/requisition\/execution\?planId=REQPLN-20261005/)
  const execution = page.getByRole('region', { name: '计划执行明细' })
  await expect(execution.getByRole('row', { name: /黑龙江龙凤.*2026-10-06 700 吨/ })).toBeVisible()
})

test('确认周要货计划后模拟下达，零缺口时可按预期要货量生成同周补充计划', async ({ page }) => {
  await page.goto('/requisition')
  await page.getByRole('link', { name: '新建周度要货计划' }).click()
  await page.getByRole('button', { name: '生成要货建议' }).click()
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('已保存本地草稿。', { exact: true })).toBeVisible()

  const result = page.getByRole('region', { name: '供应商要货计划', exact: true })
  await result.getByRole('button', { name: '确认并前往下达', exact: true }).click()
  await page
    .getByRole('tooltip')
    .filter({ hasText: '确认并发布当前要货计划？' })
    .getByRole('button', { name: '确认发布', exact: true })
    .click()
  await expect(page).toHaveURL(/\/requisition\/execution\?planId=[^&]+/)
  const publishedId = new URL(page.url()).searchParams.get('planId') ?? ''
  const publishedPlan = page.getByRole('combobox', { name: '已发布计划', exact: true })
  await expect(publishedPlan).toHaveValue(publishedId)
  await expect(page.getByText(/WMS 库存快照.*仓库上限 2,600 吨/)).toBeVisible()

  const metrics = page.getByLabel('要货执行概况')
  const execution = page.getByRole('region', { name: '计划执行明细', exact: true })
  const rows = execution.getByRole('row').filter({ has: page.getByRole('cell') })
  const pending = execution.getByText('待下达', { exact: true })
  const dispatched = execution.getByText('已下达', { exact: true })
  const receipts = execution.getByText(/^DEMO-/)
  await expect(metrics.getByText('1,325 吨', { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(2)
  await expect(rows.getByRole('cell', { name: /^京粮龙江生物工程有限公司/ })).toHaveCount(2)
  await expect(pending).toHaveCount(2)

  const simulateDispatch = page.getByRole('button', { name: '模拟下达', exact: true })
  await simulateDispatch.click()
  await expect(dispatched).toHaveCount(2)
  await expect(receipts).toHaveCount(2)
  await expect(pending).toHaveCount(0)
  await expect(simulateDispatch).toBeDisabled()

  await page.reload()
  await expect(publishedPlan).toHaveValue(publishedId)
  await expect(dispatched).toHaveCount(2)
  await expect(receipts).toHaveCount(2)
  await expect(simulateDispatch).toBeDisabled()

  await page.getByRole('menuitem', { name: '要货概览', exact: true }).click()
  await expect(page.getByRole('region', { name: '本地草稿', exact: true })).toHaveCount(0)
  const newPlan = page.getByRole('link', { name: '补充要货', exact: true })
  await expect(newPlan).toBeVisible()
  await page.getByRole('link', { name: '查看下达与执行', exact: true }).click()
  await expect(publishedPlan).toHaveValue(publishedId)
  await expect(dispatched).toHaveCount(2)

  await page.getByRole('link', { name: '返回要货概览' }).click()
  await newPlan.click()
  const basis = page.getByRole('region', { name: '要货依据', exact: true })
  await expect(basis.getByText('0 吨', { exact: true })).toBeVisible()
  const expectedQuantity = page.getByRole('spinbutton', { name: '预期要货量', exact: true })
  await expect(expectedQuantity).toHaveValue(/^0(?:\.0+)?$/)
  await expectedQuantity.fill('300')
  await expectedQuantity.press('Tab')
  await page.getByRole('button', { name: '生成要货建议', exact: true }).click()
  await expect(result.getByText('本周要货合计 300 吨 · 1 批', { exact: true })).toBeVisible()
  await expect(result).toContainText(/预期要货量\s*300 吨\s*已安排\s*300 吨/)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('已保存本地草稿。', { exact: true })).toBeVisible()
  await page.reload()
  await expect(expectedQuantity).toHaveValue(/^300(?:\.0+)?$/)
  await expect(result.getByText('本周要货合计 300 吨 · 1 批', { exact: true })).toBeVisible()
  await result.getByRole('button', { name: '确认并前往下达', exact: true }).click()
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/requisition\/execution\?planId=.*-V2$/)
  await expect(rows).toHaveCount(1)
  await expect(rows.getByRole('cell', { name: /2026-10-\d\d 300 吨/ })).toBeVisible()
  await expect(page.getByText(/预期要货量\s*300 吨/)).toBeVisible()
  await publishedPlan.selectOption(publishedId)
  await expect(dispatched).toHaveCount(2)
})

test('在途延期后滚动更新未锁定批次，校验收货并发布', async ({ page }) => {
  await page.goto('/requisition/overview')
  await page.getByRole('link', { name: '新建周度要货计划' }).click()
  await page.getByRole('button', { name: '生成要货建议' }).click()

  const result = page.getByRole('region', { name: '供应商要货计划' })
  const rowOn = (date: string) =>
    result.getByRole('row').filter({ has: page.getByRole('cell', { name: date, exact: true }) })
  const laterBatch = rowOn('2026-10-10')
  await laterBatch.getByRole('button', { name: '锁定', exact: true }).click()
  await page.getByRole('button', { name: '模拟在途延期' }).click()
  await expect(page.getByText(/预计到厂 2026-10-09/)).toBeVisible()
  await expect(result).toContainText('2026-10-07 仍有 290 吨生产缺口')
  await expect(result.getByRole('button', { name: '确认并前往下达' })).toBeDisabled()

  await page.getByRole('button', { name: '滚动更新建议' }).click()
  const earlierBatch = rowOn('2026-10-07')
  await expect(earlierBatch).toContainText('800 吨')
  await expect(laterBatch).toContainText('525 吨')
  await expect(laterBatch.getByRole('button', { name: '解锁', exact: true })).toBeVisible()
  await expect(result).toContainText('2026-10-08 → 2026-10-07')
  await expect(result).toContainText('预计全周生产需求已覆盖')

  await result.getByRole('button', { name: '新增到货批次' }).click()
  const add = page.getByRole('dialog', { name: '新增到货批次' })
  await add
    .getByRole('combobox')
    .selectOption({ label: '黑龙江龙凤玉米开发有限公司 · PO-202609-002' })
  await add.getByLabel('计划到货日期').fill('2026-10-09')
  await add.getByRole('spinbutton', { name: '计划到货量' }).fill('300')
  await add.getByRole('button', { name: '加入方案' }).click()
  await expect(rowOn('2026-10-09')).toContainText('300 吨')

  await earlierBatch.getByRole('button', { name: '调整到货' }).click()
  const edit = page.getByRole('dialog', { name: '调整到货建议' })
  await edit.getByLabel('计划到货日期').fill('2026-10-09')
  await edit.getByRole('button', { name: '保存调整' }).click()
  await expect(edit).toContainText('超过日收货上限')
  await edit.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '滚动更新建议' }).click()
  await expect(rowOn('2026-10-09')).toHaveCount(0)

  await result.getByRole('button', { name: '确认并前往下达' }).click()
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('region', { name: '计划执行明细' })).toContainText('2026-10-07')
})

test('从已下达延期进入滚动计划并登记未解决缺口', async ({ page }) => {
  await page.goto('/requisition/execution?planId=REQPLN-20260929-V1&rowId=REQEXE-003')
  const detail = page.getByRole('dialog', { name: '要货执行详情' })
  await detail.getByRole('button', { name: '模拟新的延期反馈' }).click()
  await expect(detail.getByRole('region', { name: '异常影响' })).toContainText(
    '2026-10-07 预计缺料 290 吨',
  )
  await detail.getByRole('link', { name: '进入滚动调整' }).click()
  await expect(page.getByRole('region', { name: '滚动调整依据' })).toBeVisible()
  await page.getByRole('spinbutton', { name: '预期要货量' }).fill('0')
  await page.getByRole('button', { name: '滚动更新建议', exact: true }).click()
  await page.getByRole('button', { name: '发起协调', exact: true }).click()
  const coordination = page.getByRole('dialog', { name: '要货异常协调' })
  await coordination.getByLabel('协调方向').selectOption('仓储物流协调')
  await coordination.getByLabel('责任人').fill('仓储值班员')
  await coordination.getByLabel('处理意见或结果').fill('协调提前卸货窗口，等待确认。')
  await coordination.getByRole('button', { name: '保存协调记录' }).click()
  await expect(coordination.getByRole('button', { name: '复核关闭' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(coordination).toBeHidden()
  await page.getByRole('link', { name: '返回要货概览' }).click()
  const tasks = page.getByRole('region', { name: '每日要货待办' })
  await expect(tasks).toContainText('仓储值班员 · 协调中')
  await tasks.getByRole('button', { name: '复核协调结果' }).click()
  await coordination.getByRole('link', { name: '进入周计划重新评估' }).click()
  await page.getByRole('button', { name: '滚动更新建议', exact: true }).click()
  const result = page.getByRole('region', { name: '供应商要货计划' })
  await result.getByRole('button', { name: '确认并前往下达' }).click()
  await page.getByRole('button', { name: '确认发布' }).click()
  await page.getByRole('link', { name: '返回要货概览' }).click()
  await tasks.getByRole('button', { name: '复核协调结果' }).click()
  await coordination.getByRole('button', { name: '复核关闭' }).click()
  await expect(coordination).toContainText('风险已复核关闭。')
})

test('由质检反馈核对可投料量和占仓量', async ({ page }) => {
  await page.goto('/requisition/execution?planId=REQPLN-20260929-V1&rowId=REQEXE-004')
  const detail = page.getByRole('dialog', { name: '要货执行详情' })
  await detail.getByRole('button', { name: '模拟部分质检冻结' }).click()
  await expect(detail).toContainText('暂不可投料 60 吨')
  await detail.getByRole('link', { name: '进入滚动调整' }).click()
  const projection = page.getByRole('region', { name: '每日需求与原料库存推演' })
  await expect(projection.getByRole('columnheader', { name: '固定到货可投料量' })).toBeVisible()
  await expect(projection.getByRole('columnheader', { name: '不可用占仓' })).toBeVisible()
  const day = projection
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '2026-10-08', exact: true }) })
  await expect(day.getByRole('cell', { name: '240', exact: true })).toBeVisible()
  await expect(day.getByRole('cell', { name: '60', exact: true })).toBeVisible()
})

test('禁运待复核与正式生效分开，受阻批次可撤回', async ({ page }) => {
  await page.goto('/requisition/conditions')
  const suppliers = page.getByRole('region', { name: '已签约供应商' })
  const supplier = suppliers.getByRole('row').filter({ hasText: '内蒙古玉王生物科技有限公司' })
  await supplier.getByRole('button', { name: '禁运管理' }).click()
  const restriction = page.getByRole('dialog', { name: '供应商禁运与解除' })
  await restriction.getByLabel('申请原因').fill('质量复查期间暂停新增到货。')
  await restriction.getByRole('button', { name: '提交申请' }).click()
  await expect(restriction.getByText(/待复核/, { exact: false }).first()).toBeVisible()
  await restriction.getByRole('button', { name: '复核确认禁运' }).click()
  await expect(restriction).toContainText('禁运已确认')
  await restriction.getByRole('link', { name: /2026-10-10.*300 吨/ }).click()
  const detail = page.getByRole('dialog', { name: '要货执行详情' })
  await expect(detail).toContainText('供应商在计划到厂日处于禁运范围')
  await detail.getByRole('button', { name: '撤回待下达批次' }).click()
  await expect(detail).toContainText('已撤回')
  await expect(detail.getByRole('link', { name: '进入滚动调整' })).toBeVisible()
  await page.goto('/requisition/conditions')
  await supplier.getByRole('button', { name: '禁运管理' }).click()
  await expect(restriction.getByLabel('申请类型')).toHaveValue('解除')
  await restriction.getByLabel('申请原因').fill('供应商复查通过，可以恢复供货。')
  await restriction.getByRole('button', { name: '提交申请' }).click()
  await restriction.getByRole('button', { name: '复核确认解除' }).click()
  await expect(restriction).toContainText('解除已确认')
  await expect(supplier).not.toContainText('暂停安排')
})

test('下达回执丢失时可核对已接单结果', async ({ page }) => {
  await page.goto('/requisition/execution?planId=REQPLN-20260929-V1')
  await page.getByRole('button', { name: '模拟下达', exact: true }).click()
  const failure = page.getByRole('row').filter({ hasText: '下达失败' })
  await failure.getByRole('button', { name: '详情', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '要货执行详情' })
  await detail.getByRole('button', { name: '核对外部回执' }).click()
  await expect(detail).toContainText('已核对外部回执 DEMO-REQEXE-007')
  await expect(failure).toHaveCount(0)
})

test('WMS 仓库上限缺失时提示补充数据并暂停求解', async ({ page }) => {
  await page.goto('/requisition')
  await page.getByRole('combobox', { name: '物料', exact: true }).selectOption('RM-ENZ-101')
  await page.getByRole('link', { name: '新建周度要货计划' }).click()

  const basis = page.getByRole('region', { name: '要货依据', exact: true })
  const result = page.getByRole('region', { name: '供应商要货计划', exact: true })
  await expect(basis.getByText('辅料仓库上限', { exact: true })).toBeVisible()
  await expect(basis.getByText('WMS 仓库上限待补充', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '生成要货建议' })).toBeDisabled()
  await expect(result.getByRole('table')).toHaveCount(0)
  await expect(result.getByRole('button', { name: '确认并前往下达', exact: true })).toHaveCount(0)
})

test('要货概览展示 WMS 原料库存、生产缺口和固定到货明细', async ({ page }) => {
  await page.goto('/requisition')

  const metrics = page.getByLabel('周度要货指标')
  const stockCard = metrics.getByText('可用原料库存', { exact: true }).locator('..')
  await expect(stockCard.getByText('1,950 吨', { exact: true })).toBeVisible()
  await expect(stockCard.getByText('来源 WMS 库存查询 · 2026-09-29 08:00')).toBeVisible()
  await expect(metrics.getByText('本周生产耗用', { exact: true })).toBeVisible()
  await expect(metrics.getByText('2,960 吨', { exact: true })).toBeVisible()
  const gapCard = metrics.getByText('生产缺口', { exact: true }).locator('..')
  await expect(gapCard.getByText('15 吨', { exact: true })).toBeVisible()
  await expect(gapCard.getByText(/最早缺口日期 2026-10-08/)).toBeVisible()

  await expect(metrics.getByText('在途原料', { exact: true })).toBeVisible()
  const fixedArrivals = metrics.getByRole('button', { name: '查看在途原料明细' })
  await expect(fixedArrivals).toHaveText('700 吨')
  await fixedArrivals.click()

  const details = page.getByRole('dialog', { name: '固定到货明细' })
  const arrival = details.getByRole('row').filter({ hasText: 'FIX-003' })
  await expect(details).toBeVisible()
  await expect(arrival.getByRole('cell', { name: 'PO-202609-003 / —', exact: true })).toBeVisible()
  await expect(arrival.getByRole('cell').filter({ hasText: /^2026-10-0[56]$/ })).toHaveText([
    '2026-10-05',
    '2026-10-06',
  ])

  await page.keyboard.press('Escape')
  await expect(details).toBeHidden()
  const projection = page.getByRole('region', { name: /库存与耗用推演/ })
  await expect(projection.getByRole('heading', { name: '原料库存与耗用推演' })).toBeVisible()
  const depleted = projection
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '2026-10-08', exact: true }) })
  const covered = projection
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '2026-10-05', exact: true }) })
  await expect(depleted.getByRole('cell', { name: '异常', exact: true })).toBeVisible()
  await expect(covered.getByRole('cell', { name: '正常', exact: true })).toBeVisible()

  await page.getByRole('combobox', { name: '物料', exact: true }).selectOption('PK-WB-301')
  await expect(projection.getByRole('heading', { name: '包材库存与耗用推演' })).toBeVisible()
  await expect(projection.getByText(/PK-WB-301 · 包材 · 单位 万条/)).toBeVisible()
  await expect(gapCard.getByText('0 万条', { exact: true })).toBeVisible()
})
