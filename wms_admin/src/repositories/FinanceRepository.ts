import type {
  FinanceOverview,
  RefundSettlementRequest,
  RefundSettlementResponse,
} from '../domain/finance';

export interface FinanceRepository {
  getOverview(): Promise<FinanceOverview>;
  refundSettlement(input: RefundSettlementRequest): Promise<RefundSettlementResponse>;
}
