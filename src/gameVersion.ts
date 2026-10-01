export interface GameVersion {
  /** Identifies the client build running in the page, such as the hash in a bundler's entry file name; changes with every deploy. */
  bundle: string | null;
  /** The version the target's server reports. */
  version: string | null;
}

// Every target states its version somewhere different, if anywhere: a version
// endpoint, a response header the page keeps in localStorage, a global, the
// hash in its entry script's name. Nothing about a new target says where, so
// both stay null and the title bar says "unknown" until this hook knows. Read
// what the page already has before asking the server: a poll of your own is
// traffic the target did not send.
export function useGameVersion(): GameVersion {
  return { bundle: null, version: null };
}
