import { ObservationFrame } from "../observe/types.js";
import { Signal } from "@rpm/shared";

export interface Agent {
  name: string;
  run(frame: ObservationFrame): Promise<Signal[]>;
}
