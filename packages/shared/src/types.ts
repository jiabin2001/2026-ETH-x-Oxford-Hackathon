export type ChainId = number;

export type DataPoint<T = unknown> = {
  key: string;
  value: T;
  observedAt: string;       // ISO
  source: string;           // e.g. "FDC:JsonApi", "onchain:UniswapV2", "issuer:report"
  confidence: number;       // 0..1
  conflictKeys?: string[];  // keys this datapoint conflicts with
  meta?: Record<string, unknown>;
};

export type PortfolioPosition = {
  assetId: string;          // token address or internal id
  symbol: string;
  quantity: string;         // decimal string to avoid float issues
  price: string;            // decimal string (quote currency)
  value: string;            // quantity*price
  chainId?: ChainId;
  tags?: string[];          // e.g. ["rwa", "treasury", "real-estate"]
};

export type EvidenceItem = {
  source: string;           // e.g. "FDC", "oracle", "portfolio", "model", "rules"
  ref?: string;             // optional pointer (id/url/hash)
  detail?: string;          // short text citation
};

export type RiskMetric = {
  name: "VaR_95_1d" | "VaR_99_1d" | "MaxDrawdown" | "LiquidityStress" | "CreditScore" | "Concentration";
  value: number;
  unit?: string;
  horizon?: string;
  explanation: string;
  inputs?: Record<string, unknown>;
};

export type Signal = {
  agent: string;
  kind: "OBSERVATION" | "RISK" | "COMPLIANCE" | "STRATEGY" | "EXECUTION";
  severity: "INFO" | "WARN" | "HIGH" | "CRITICAL";
  summary: string;
  details: Record<string, unknown>;
  metrics?: RiskMetric[];
  recommendations?: ActionIntent[];
  veto?: boolean;                 // compliance veto
  confidence: number;             // 0..1
  riskScore?: number;             // 0..100 (agent perspective)
  reasons?: string[];             // key reasons in bullets
  evidence?: EvidenceItem[];      // proof/sources
  constraintsTouched?: string[];  // rule or constraint IDs
  stance?: "SUPPORT" | "OPPOSE" | "NEUTRAL";
  createdAt: string;              // ISO
};

export type ActionType =
  | "REBALANCE"
  | "HEDGE"
  | "REDEEM"
  | "PAUSE"
  | "UNPAUSE"
  | "UPDATE_CONSTRAINTS";

export type ActionIntent = {
  type: ActionType;
  reason: string;
  // bounded parameters — validated by constraint engine + (for some) on-chain
  params: Record<string, unknown>;
  // optional target chain/venue routing info
  route?: {
    chainId: ChainId;
    venue?: string;
  };
  proposalSource?: string;        // agent or subsystem
};

export type ActionConsensus = {
  intent: ActionIntent;
  supportWeight: number;
  opposeWeight: number;
  supportAgents: string[];
  opposeAgents: string[];
  status: "APPROVED" | "DENIED" | "ESCALATE";
  reasons: string[];
};

export type ConsensusSummary = {
  thresholdWeight: number;
  totalWeight: number;
  approved: ActionConsensus[];
  denied: ActionConsensus[];
  escalated: ActionConsensus[];
};

export type Decision = {
  decisionId: string;
  createdAt: string;
  riskScore: number;               // 0..100 (portfolio-level)
  riskMetrics?: RiskMetric[];
  rationale: string;
  signals: Signal[];
  approvedActions: ActionIntent[];
  deniedActions: { intent: ActionIntent; reason: string }[];
  escalationRequired: boolean;
  escalationReasons?: string[];
  consensus?: ConsensusSummary;
  agentWeights?: Record<string, number>;
};

export type ConstraintViolation = {
  layer: "REGULATORY" | "RISK" | "EXECUTION" | "OPERATIONS";
  code: string;
  message: string;
  blocking: boolean;
  context?: Record<string, unknown>;
};

export type ConstraintCheckResult = {
  ok: boolean;
  violations: ConstraintViolation[];
};

export type ConsensusRule = {
  thresholdWeight: number;  // e.g. 0.67
  vetoAgents?: string[];    // e.g. ["ComplianceAgent"]
};
