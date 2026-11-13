export interface ModuleSection {
  key: string
  path: string
  title: string
  description: string
}

export interface BusinessModule {
  id: string
  title: string
  description: string
  group: '决策中心' | '分析与追溯' | '系统与协同'
  sections: readonly ModuleSection[]
}
