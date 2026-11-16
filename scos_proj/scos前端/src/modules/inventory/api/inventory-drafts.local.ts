export function readInventoryDraft(key: string): Record<string, number> | undefined {
  const saved = key ? sessionStorage.getItem(key) : null
  return saved ? JSON.parse(saved) : undefined
}

export function saveInventoryDraft(key: string, quantities: Record<string, number>) {
  sessionStorage.setItem(key, JSON.stringify(quantities))
}
