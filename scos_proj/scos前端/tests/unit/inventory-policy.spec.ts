import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyPublishedInventoryPolicies,
  confirmInventoryPolicy,
  readInventoryPolicyVersions,
} from '../../src/modules/inventory/mocks/inventory-policy.mock'
import { getMockInventorySnapshot } from '../../src/modules/inventory/mocks/inventory-snapshot.mock'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
})

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const snapshot = getMockInventorySnapshot()
  const product = snapshot.products.find(({ code }) => code === 'FG-F55')!
  return {
    snapshot,
    product,
    workflowKey: `scos:inventory-policy:${snapshot.plant}:${snapshot.month}:${product.code}`,
    read: () =>
      readInventoryPolicyVersions(snapshot, product.code, product.policy, snapshot.strategyVersion),
  }
}

describe('成品库存策略版本', () => {
  it('旧版已发布策略继续生效，切回初始版使用原始参数', () => {
    const { snapshot, product, workflowKey, read } = fixture()
    const published = {
      version: 'INV-POL-202610-FG-F55-V4',
      revision: 4,
      parameters: { ...product.policy, leadDays: product.policy.leadDays + 2 },
      reason: '产线检修',
      publishedAt: '2026-09-29T08:00:00.000Z',
    }
    storage.set(workflowKey, JSON.stringify({ published }))

    const state = read()
    expect(state.activeVersion).toBe(published.version)
    expect(state.versions).toContainEqual(published)
    const activeSnapshot = applyPublishedInventoryPolicies(snapshot)
    expect(activeSnapshot.products[0]).toMatchObject({
      policy: published.parameters,
      policyVersion: published.version,
    })

    confirmInventoryPolicy(
      snapshot,
      product.code,
      state,
      { parameters: product.policy, reason: '' },
      snapshot.strategyVersion,
    )
    expect(applyPublishedInventoryPolicies(activeSnapshot).products[0]).toMatchObject({
      policy: product.policy,
      policyVersion: snapshot.strategyVersion,
    })
    expect(read().versions.map(({ version }) => version)).toEqual([
      snapshot.strategyVersion,
      published.version,
    ])
  })

  it('迁移旧版未确认参数时保留为待编辑内容，确认后才生效', () => {
    const { snapshot, product, workflowKey, read } = fixture()
    const draft = { parameters: { ...product.policy, leadDays: 4 }, reason: '补货周期调整' }
    const review = { parameters: { ...product.policy, leadDays: 5 }, reason: '补货周期延长' }
    storage.set(workflowKey, JSON.stringify({ draft, review }))

    const state = read()
    expect(state.legacyDraft).toEqual(review)
    expect(applyPublishedInventoryPolicies(snapshot).products[0]?.policy).toEqual(product.policy)

    confirmInventoryPolicy(snapshot, product.code, state, review)
    const migrated = read()
    expect(migrated.legacyDraft).toBeUndefined()
    expect(
      migrated.versions.find(({ version }) => version === migrated.activeVersion),
    ).toMatchObject(review)
    expect(applyPublishedInventoryPolicies(snapshot).products[0]?.policy).toEqual(review.parameters)
  })

  it('复用已确认版本和重复确认不会新增版本，参数有变化时继续递增', () => {
    const { snapshot, product, read } = fixture()
    const first = { parameters: { ...product.policy, leadDays: 4 }, reason: '' }
    const baseline = { parameters: product.policy, reason: '' }

    const saved = confirmInventoryPolicy(snapshot, product.code, read(), first)
    expect(saved.activeVersion).toBe('INV-POL-202610-FG-F55-V2')
    const repeated = confirmInventoryPolicy(snapshot, product.code, read(), first)
    expect(repeated).toEqual(saved)

    confirmInventoryPolicy(snapshot, product.code, read(), baseline, snapshot.strategyVersion)
    const restored = confirmInventoryPolicy(
      snapshot,
      product.code,
      read(),
      first,
      saved.activeVersion,
    )
    expect(restored).toEqual(saved)

    confirmInventoryPolicy(snapshot, product.code, read(), baseline, snapshot.strategyVersion)
    const next = confirmInventoryPolicy(snapshot, product.code, read(), {
      parameters: { ...product.policy, leadDays: 5 },
      reason: '',
    })
    expect(next.activeVersion).toBe('INV-POL-202610-FG-F55-V3')
    expect(next.versions).toHaveLength(3)
  })
})
