export interface ProcurementFuturesCandle {
  tradeDate: string
  open: number
  close: number
  low: number
  high: number
}

export interface ProcurementFuturesContract {
  contractCode: string
  deliveryMonth?: string
  currency: string
  unit: string
}

export interface ProcurementFuturesMarket extends ProcurementFuturesContract {
  candles: ProcurementFuturesCandle[]
  source?: { label: string; url: string }
}
