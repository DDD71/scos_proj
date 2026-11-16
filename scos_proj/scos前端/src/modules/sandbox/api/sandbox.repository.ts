import { http } from '@/shared/api/http'
import { env } from '@/shared/config/env'
import { computeContract } from '../domain/contract'
import type {
  SandboxBaseline,
  SandboxContext,
  SandboxEvaluation,
  SandboxHistory,
  SandboxInput,
  SandboxRun,
  SandboxRunProgress,
} from '../model/types'

const path = '/v1/sandbox'
const isMock = env.dataSource === 'mock'
const mockCalculation = {
  supply: '计算到货变化对原料库存的影响',
  demand: '计算订单变化对交付和成品库存的影响',
  production: '计算产能变化对产量和成品库存的影响',
  contract: '计算合同交付、生产成本和利润',
}

const newId = (prefix: string) =>
  `${prefix}-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`

interface SandboxJob {
  id: string
  status: '排队中' | '运行中' | '成功' | '部分完成' | '不可行' | '失败' | '已取消'
  result?: SandboxRun
  reason?: string
}

function waitForNextCheck(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export const sandboxRepository = {
  async baselines(context: SandboxContext): Promise<SandboxBaseline[]> {
    if (isMock) {
      const { loadMockBaseline } = await import('../mocks/baseline.mock')
      const baseline = await loadMockBaseline()
      if (context.snapshot && context.snapshot !== baseline.time)
        throw new Error('指定快照已不可用。可返回预警刷新，或切换到最新基线重新配置。')
      return [baseline]
    }
    const { data } = await http.get<SandboxBaseline[]>(`${path}/baselines`, { params: context })
    return data
  },

  async run(
    baseline: SandboxBaseline,
    input: SandboxInput,
    eventId: string | undefined,
    signal: AbortSignal,
    progress: (state: SandboxRunProgress) => void,
  ): Promise<SandboxRun> {
    if (!isMock) {
      // 待联调。沙盘运行与正式业务写接口独立。
      const { data } = await http.post<SandboxJob>(`${path}/runs`, {
        baselineId: baseline.id,
        modelVersion: baseline.modelVersion,
        scenarioVersion: 'V1',
        input,
        eventId,
      })
      let job = data
      const jobPath = `${path}/runs/${encodeURIComponent(data.id)}`
      try {
        while (job.status === '排队中' || job.status === '运行中') {
          progress({
            status: job.status,
            message: job.status === '排队中' ? '已提交，等待开始推演' : '正在计算推演结果',
          })
          await waitForNextCheck(1000, signal)
          const response = await http.get<SandboxJob>(jobPath, { signal })
          job = response.data
        }
        signal.throwIfAborted()
        if (job.result) return job.result
        throw new Error(job.reason ?? `推演任务${job.status}，请检查基线或调整参数重试。`)
      } catch (cause) {
        if (signal.aborted && (job.status === '排队中' || job.status === '运行中'))
          await http.post(`${jobPath}/cancel`)
        throw cause
      }
    }
    // 给演示中的各计算阶段留出可见时间，沿用同一个取消信号。
    progress({ status: '运行中', message: '准备基线和推演条件', percent: 20 })
    await waitForNextCheck(320, signal)
    progress({ status: '运行中', message: mockCalculation[input.kind], percent: 55 })
    await waitForNextCheck(480, signal)
    const result =
      input.kind === 'contract'
        ? computeContract(baseline, input)
        : (await import('../domain/daily')).computeDaily(baseline, input)
    signal.throwIfAborted()
    progress({ status: '运行中', message: '整理推演结果', percent: 90 })
    await waitForNextCheck(260, signal)
    return {
      ...result,
      id: newId('RUN'),
      scenarioVersion: 'V1',
      createdAt: new Date().toISOString(),
      baselineId: baseline.id,
      baselineTime: baseline.time,
      baselineVersions: baseline.versions,
      modelVersion: baseline.modelVersion,
      eventId,
      input,
    }
  },

  async history(): Promise<SandboxHistory> {
    if (isMock) return (await import('../mocks/sandbox-history.mock')).readHistory()
    const { data } = await http.get<SandboxHistory>(`${path}/history`)
    return data
  },

  async save(name: string, run: SandboxRun) {
    if (!isMock) {
      await http.post(`${path}/scenarios`, { runId: run.id, name })
      return
    }
    const { readHistory, writeHistory } = await import('../mocks/sandbox-history.mock')
    const history = readHistory()
    if (history.runs.some((item) => item.run.id === run.id)) return
    history.runs.unshift({ name, run })
    writeHistory(history)
  },

  async requestEvaluation(input: Omit<SandboxEvaluation, 'id' | 'status'>) {
    if (!isMock) {
      await http.post(`${path}/evaluations`, input)
      return
    }
    const { readHistory, writeHistory } = await import('../mocks/sandbox-history.mock')
    const history = readHistory()
    if (input.decision === '不采纳') {
      if (
        history.evaluations.some((item) => item.runId === input.runId && item.decision === '不采纳')
      )
        throw new Error('该方案已记录不采纳结论。')
      history.evaluations.unshift({ ...input, id: newId('DEC'), status: '已归档' })
      writeHistory(history)
      return
    }
    if (
      history.evaluations.some(
        (item) =>
          item.runId === input.runId &&
          item.department === input.department &&
          item.status !== '退回',
      )
    )
      throw new Error('该方案已向此业务模块发起评估。')
    history.evaluations.unshift({ ...input, id: newId('EVAL'), status: '待受理' })
    writeHistory(history)
  },

  async updateEvaluation(id: string, status: SandboxEvaluation['status'], feedback: string) {
    if (!isMock) {
      await http.patch(`${path}/evaluations/${encodeURIComponent(id)}`, { status, feedback })
      return
    }
    const { readHistory, writeHistory } = await import('../mocks/sandbox-history.mock')
    const history = readHistory()
    const task = history.evaluations.find((item) => item.id === id)
    if (!task) throw new Error('该评估任务不存在。')
    if (
      !(task.status === '待受理' && (status === '已受理' || status === '退回')) &&
      !(task.status === '已受理' && status === '已反馈')
    )
      throw new Error('当前任务状态不支持此操作。')
    task.status = status
    task.feedback = feedback
    writeHistory(history)
  },
}
