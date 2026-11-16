import type { InventorySnapshot, InventoryPolicyParameters } from '../model/types'
import type {
  StrategyPeriod,
  InventoryPolicyVersions,
  InventoryPolicyScenario,
  LegacyPolicyWorkflow,
} from '../model/inventory-policy'
import { sameInventoryPolicyParameters } from '../domain/policy-parameters'
function storageKey(period: StrategyPeriod, productCode: string) {
  return `scos:inventory-policy:${period.plant}:${period.month}:${productCode}`
}

function readStorage<T>(key: string): T | null {
  try {
    const saved = localStorage.getItem(key)
    return saved ? (JSON.parse(saved) as T) : null
  } catch {
    return null
  }
}

function readSavedPolicy(period: StrategyPeriod, productCode: string) {
  return readStorage<InventoryPolicyVersions | LegacyPolicyWorkflow>(
    storageKey(period, productCode),
  )
}

export function readInventoryPolicyVersions(
  period: StrategyPeriod,
  productCode: string,
  baseline: InventoryPolicyParameters,
  baselineVersion: string,
): InventoryPolicyVersions {
  const source = { version: baselineVersion, parameters: { ...baseline }, reason: '' }
  const saved = readSavedPolicy(period, productCode)
  if (saved && 'versions' in saved) {
    return saved.versions.some(({ version }) => version === baselineVersion)
      ? saved
      : { ...saved, versions: [source, ...saved.versions] }
  }

  const published = saved?.published
  const oldDraft = saved?.review ?? saved?.draft
  const olderParameters =
    !oldDraft && !published
      ? readStorage<InventoryPolicyParameters>(
          `scos:inventory-strategy:${period.plant}:${productCode}`,
        )
      : null
  return {
    versions: published ? [source, published] : [source],
    activeVersion: published?.version ?? baselineVersion,
    legacyDraft:
      oldDraft ?? (olderParameters ? { parameters: olderParameters, reason: '' } : undefined),
  }
}

export function confirmInventoryPolicy(
  period: StrategyPeriod,
  productCode: string,
  state: InventoryPolicyVersions,
  scenario: InventoryPolicyScenario,
  selectedVersion = state.activeVersion,
): InventoryPolicyVersions {
  const saved = readSavedPolicy(period, productCode)
  const versions =
    saved && 'versions' in saved
      ? [
          ...new Map(
            [...state.versions, ...saved.versions].map((item) => [item.version, item]),
          ).values(),
        ]
      : state.versions
  const selected = versions.find(({ version }) => version === selectedVersion)
  const reason = scenario.reason.trim()
  const matchesSelected =
    selected && sameInventoryPolicyParameters(scenario.parameters, selected.parameters)

  const prefix = `INV-POL-${period.month.replaceAll('-', '')}-${productCode}-V`
  const revision =
    versions.reduce(
      (last, { version }) =>
        version.startsWith(prefix)
          ? Math.max(last, Number(version.slice(prefix.length)) || 1)
          : last,
      1,
    ) + 1
  const confirmed = matchesSelected
    ? { ...selected, reason }
    : {
        version: `${prefix}${revision}`,
        parameters: { ...scenario.parameters },
        reason,
        publishedAt: new Date().toISOString(),
      }
  const next = {
    versions: matchesSelected
      ? versions.map((item) => (item.version === confirmed.version ? confirmed : item))
      : [...versions, confirmed],
    activeVersion: confirmed.version,
  }
  localStorage.setItem(storageKey(period, productCode), JSON.stringify(next))
  return next
}

export function applyPublishedInventoryPolicies(snapshot: InventorySnapshot): InventorySnapshot {
  return {
    ...snapshot,
    products: snapshot.products.map((product) => {
      const baseline = product.policyBaseline ?? {
        version: product.policyVersion ?? snapshot.strategyVersion,
        parameters: product.policy,
      }
      const { versions, activeVersion } = readInventoryPolicyVersions(
        snapshot,
        product.code,
        baseline.parameters,
        baseline.version,
      )
      const active = versions.find(({ version }) => version === activeVersion)
      if (!active) return product
      return {
        ...product,
        policyBaseline: baseline,
        policy: { ...active.parameters },
        policyVersion: active.version,
      }
    }),
  }
}
