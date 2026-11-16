import type { SandboxHistory } from '../model/types'
const key = 'scos.sandbox.history.v1'
export function readHistory(): SandboxHistory {
  const saved = localStorage.getItem(key)
  return saved ? (JSON.parse(saved) as SandboxHistory) : { runs: [], evaluations: [] }
}

export function writeHistory(history: SandboxHistory) {
  localStorage.setItem(key, JSON.stringify(history))
}
