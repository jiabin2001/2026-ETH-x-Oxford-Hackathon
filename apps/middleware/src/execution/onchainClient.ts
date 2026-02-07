/**
 * Onchain client (MVP stub).
 * Replace with ethers/viem or flare-tx-sdk calls to:
 * - read constraints from ConstraintStore
 * - push approved actions to TransactionQueue
 * - execute via ExecutionRouter
 */
export class OnchainClient {
  async getDynamicConstraints(): Promise<Record<string, unknown>> {
    // e.g. read from on-chain ConstraintStore (soft constraints)
    return {
      maxSlippageBps: 50,
      maxTurnover: 0.05,
      defensiveMode: false,
      investorAccredited: true,
    };
  }

  async submitAction(intent: any): Promise<{ txHash: string }> {
    // queue action; in production this requires orchestrator approvals
    return { txHash: "0xDEMO_TX_HASH" };
  }
}
