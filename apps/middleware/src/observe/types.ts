import { DataPoint, PortfolioPosition } from "@rpm/shared";

export type ObservationFrame = {
  data: DataPoint[];
  positions: PortfolioPosition[];
  // add more: open orders, liabilities, AUM, etc.
};
