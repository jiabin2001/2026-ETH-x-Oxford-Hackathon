import { ObservationFrame } from "./types.js";
import { observeOnchain } from "./onchainObserver.js";
import { observeFdc } from "../fdc/fdcAdapter.js";
import type { DataPoint, PortfolioPosition } from "@rpm/shared";

function extractNavUsd(data: DataPoint[], key: string): number | null {
  const point = data.find((d) => d.key === key);
  if (!point) return null;
  const value = point.value as any;
  if (value && typeof value.nav === "number") return value.nav;
  if (value && typeof value.nav_usd_e6 === "number") return value.nav_usd_e6 / 1_000_000;
  const parsed = Number(value?.nav ?? value?.nav_usd_e6);
  return Number.isFinite(parsed) ? parsed : null;
}

function applyNavToPositions(positions: PortfolioPosition[], navUsd: number | null): PortfolioPosition[] {
  if (navUsd == null || !Number.isFinite(navUsd)) return positions;
  return positions.map((p) => {
    if (p.symbol !== "tBILL") return p;
    const qty = Number(p.quantity);
    if (!Number.isFinite(qty)) return p;
    const currentPrice = Number(p.price);
    const hasMarketPrice = Number.isFinite(currentPrice) && currentPrice > 0;
    if (hasMarketPrice) return p;
    const price = navUsd;
    const value = qty * navUsd;
    return {
      ...p,
      price: price.toFixed(6),
      value: value.toFixed(6),
    };
  });
}

export async function observe(): Promise<ObservationFrame> {
  const onchain = await observeOnchain();
  const fdc = await observeFdc();
  const navUsd = extractNavUsd(fdc, "fdc:nav:tBILL");
  return {
    data: [...onchain.data, ...fdc],
    positions: applyNavToPositions(onchain.positions, navUsd),
  };
}
