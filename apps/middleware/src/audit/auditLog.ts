import fs from "node:fs";
import { Decision, Signal } from "@rpm/shared";
import { nowIso } from "../util/time.js";

export class AuditLog {
  constructor(private path: string) {}

  append(obj: unknown) {
    const line = JSON.stringify({ ts: nowIso(), ...obj });
    fs.appendFileSync(this.path, line + "\n", "utf-8");
  }

  signal(signal: Signal) {
    this.append({ type: "signal", signal });
  }

  decision(decision: Decision) {
    this.append({ type: "decision", decision });
  }

  error(err: unknown) {
    this.append({ type: "error", error: String(err) });
  }
}
