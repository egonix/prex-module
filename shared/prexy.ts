// The part of prexy's contract (prex: prexy/core.ts) a game module uses.
//
// Declared here rather than imported, so this project builds on its own and
// not only beside a prex server checkout. 
// 
// Keep in mind when prexy's public surface changes, change this to match.
// (Better use prexy/games/<game> to build this prex module like default/minimal)
// Keep it to what a module actually calls.

export interface GameModule {
  name: string;
  init(agent: PrexyAgent): void | Promise<void>;
}

export interface PrexyAgent {
  /** True while the control connection to prex is open. */
  readonly connected: boolean;
  /** A named event: shown in prex's log and, with the activity store on, stored. */
  event(name: string, data: unknown): void;
  console(level: "log" | "warn" | "error", args: unknown[]): void;
  send(message: unknown): void;
  /** A unique, stable key for one log entry. */
  nextActivityKey(): string;
  /** Hands the agent this module's capture log, which prex reads back through it. */
  registerCaptureLog(log: unknown[]): void;
  loadModule(url: string): Promise<unknown>;
  /** Re-imports this session's capture module from /prexy/games/<game>.js. */
  reload(): Promise<void>;
}

// prexy marks its own control socket with this, so capture hooks can skip it.
// Without the check every event a module emits travels over that socket, gets
// captured as outgoing WebSocket traffic, gets emitted, and loops.
//
// Symbol.for() uses the page-wide registry, which is what makes the marker
// visible across separately built bundles: the key string is the contract,
// not this constant.
export const PREXY_CONTROL_SOCKET = Symbol.for("prexy-control-socket");
