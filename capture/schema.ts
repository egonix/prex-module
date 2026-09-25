import { MODULE } from "../shared/module.ts";

// How prex should read this target's traffic (prex: GameSchemaDeclarationSchema
// in packages/protocol/mod.ts). Optional, but it is what makes the activity
// store useful: retention per message type, and which fields of a state
// message are absolute values, per-tick increments, or meaningful only by
// their absence.
//
// `game` must equal the session's --game, or prex rejects the whole
// declaration. Using MODULE for both makes that automatic.
export const SCHEMA = {
  game: MODULE,
  version: 1,
  messages: [
    // Once the target's message types are known. For example, a chatty
    // per-tick state message kept briefly, whose full-state variant is the
    // one WITHOUT a `delta` flag:
    //
    // {
    //   match: { kind: "ws", type: "tick" },
    //   anchorWhen: { absent: "delta" },
    //   fields: { level: ["hp", "gold"], event: ["xpGained"], sporadic: ["drop"] },
    //   retention: "48h",
    // },

    // HTTP bodies are where a site's own credentials turn up (a sign-in, a
    // token refresh), so they are kept for less time than everything else.
    { match: { kind: "http" }, retention: "7d" },
  ],
  defaultRetention: "30d",
};
