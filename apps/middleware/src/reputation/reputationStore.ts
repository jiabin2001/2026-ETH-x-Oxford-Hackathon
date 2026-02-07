import { ConsensusSummary } from "@rpm/shared";

type AgentReputation = {
  score: number; // 0..1
  samples: number;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export class ReputationStore {
  private reps = new Map<string, AgentReputation>();

  getScore(agent: string): number {
    return this.reps.get(agent)?.score ?? 0.5;
  }

  getEffectiveWeight(baseWeight: number, agent: string): number {
    const score = this.getScore(agent);
    const multiplier = 0.5 + score; // 0.5x .. 1.5x
    return baseWeight * multiplier;
  }

  applyConsensus(consensus: ConsensusSummary) {
    const adjust = (agent: string, delta: number) => {
      const current = this.reps.get(agent) ?? { score: 0.5, samples: 0 };
      const next = clamp01(current.score + delta);
      this.reps.set(agent, { score: next, samples: current.samples + 1 });
    };

    const rewardSupport = (agents: string[]) => agents.forEach(a => adjust(a, 0.02));
    const rewardOppose = (agents: string[]) => agents.forEach(a => adjust(a, 0.02));
    const penalizeSupport = (agents: string[]) => agents.forEach(a => adjust(a, -0.02));
    const penalizeOppose = (agents: string[]) => agents.forEach(a => adjust(a, -0.02));

    const all = [...consensus.approved, ...consensus.denied, ...consensus.escalated];
    for (const entry of all) {
      if (entry.status === "APPROVED") {
        rewardSupport(entry.supportAgents);
        penalizeOppose(entry.opposeAgents);
      } else if (entry.status === "DENIED") {
        rewardOppose(entry.opposeAgents);
        penalizeSupport(entry.supportAgents);
      }
    }
  }
}
