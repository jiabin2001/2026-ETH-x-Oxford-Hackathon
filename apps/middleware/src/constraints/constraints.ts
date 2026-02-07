import { ActionIntent, ConstraintCheckResult, ConstraintViolation, PortfolioPosition } from "@rpm/shared";

export type ConstraintContext = {
  positions: PortfolioPosition[];
  riskScore: number;
  // add: investor profile, jurisdiction, chain state, etc.
  dynamic: Record<string, unknown>;
};

function ok(): ConstraintCheckResult {
  return { ok: true, violations: [] };
}

function fail(...violations: ConstraintViolation[]): ConstraintCheckResult {
  return { ok: false, violations };
}

/**
 * Regulatory layer (MVP):
 * - investor whitelist / accreditation checks
 * - banned jurisdictions
 * - disclosure gating
 */
export function checkRegulatory(intent: ActionIntent, ctx: ConstraintContext): ConstraintCheckResult {
  if (intent.type === "REDEEM" && ctx.dynamic["investorAccredited"] !== true) {
    return fail({
      layer: "REGULATORY",
      code: "INVESTOR_NOT_ACCREDITED",
      message: "Investor must be accredited to redeem this instrument.",
      blocking: true,
    });
  }
  return ok();
}

/**
 * Risk layer (MVP):
 * - max position size per asset class
 * - concentration limits
 * - drawdown defensive mode
 */
export function checkRisk(intent: ActionIntent, ctx: ConstraintContext): ConstraintCheckResult {
  const defensive = ctx.dynamic["defensiveMode"] === true;
  if (defensive && (intent.type === "REBALANCE" || intent.type === "HEDGE")) {
    // allow hedges, but restrict rebalance aggressiveness (example)
    const maxTurnover = Number(ctx.dynamic["maxTurnover"] ?? 0.05);
    const turnover = Number(intent.params["turnover"] ?? 0);
    if (turnover > maxTurnover) {
      return fail({
        layer: "RISK",
        code: "DEFENSIVE_TURNOVER_LIMIT",
        message: `Turnover ${turnover} exceeds defensive max ${maxTurnover}.`,
        blocking: true,
        context: { turnover, maxTurnover },
      });
    }
  }
  return ok();
}

/**
 * Execution layer (MVP):
 * - slippage caps, venue allow-list, gas bounds
 */
export function checkExecution(intent: ActionIntent, ctx: ConstraintContext): ConstraintCheckResult {
  const slip = Number(intent.params["slippageBps"] ?? 0);
  const maxSlip = Number(ctx.dynamic["maxSlippageBps"] ?? 50);
  if (slip > maxSlip) {
    return fail({
      layer: "EXECUTION",
      code: "SLIPPAGE_TOO_HIGH",
      message: `Slippage ${slip} bps exceeds max ${maxSlip} bps.`,
      blocking: true,
      context: { slip, maxSlip },
    });
  }
  return ok();
}

/**
 * Operations layer (MVP):
 * - require escalation on CRITICAL conditions
 * - circuit breaker is handled on-chain (owner/multisig)
 */
export function checkOperations(intent: ActionIntent, ctx: ConstraintContext): ConstraintCheckResult {
  if (ctx.riskScore >= 90 && intent.type !== "PAUSE") {
    return fail({
      layer: "OPERATIONS",
      code: "ESCALATION_REQUIRED",
      message: "Risk score critical; only PAUSE allowed without human approval.",
      blocking: true,
      context: { riskScore: ctx.riskScore },
    });
  }
  return ok();
}

export function checkAll(intent: ActionIntent, ctx: ConstraintContext): ConstraintCheckResult {
  const results = [checkRegulatory(intent, ctx), checkRisk(intent, ctx), checkExecution(intent, ctx), checkOperations(intent, ctx)];
  const violations = results.flatMap(r => r.violations);
  return violations.length ? { ok: false, violations } : { ok: true, violations: [] };
}
