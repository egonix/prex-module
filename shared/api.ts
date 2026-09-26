// window.<MODULE>: what the capture module exposes in the page, and what the
// HUD and a browser console read.
//
// One definition for both halves. The capture module implements it and the
// HUD imports it, so the two cannot drift apart the way a copy does.
import { MODULE } from "./module.ts";
import type { CaptureLogEntry } from "../capture/lib/capture.ts";
import type { ScriptMatch } from "../capture/lib/discover.ts";
import type { Saved } from "../capture/lib/store.ts";

export type { CaptureLogEntry, ScriptMatch, Saved };

export interface ModuleApi {
  /**
   * Newest first, capped. Every entry carries a stable `key`: use that, never
   * the array index, because every capture shifts the whole buffer by one.
   */
  log: CaptureLogEntry[];
  pause(): void;
  resume(): void;
  isPaused(): boolean;

  /** Reads a global by name, including top-level let/const that are not on window. */
  readGlobal(name: string): unknown;
  /** Hooks a global dispatch function as a better incoming-message source (see capture/lib/capture.ts). */
  hookNamedDispatch(name: string): boolean;
  /** The page's fetch as it was before any hook: for requests that should not be captured. */
  nativeFetch: typeof fetch;

  /** Greps the page's own same-origin scripts; the pattern's first capture group becomes each key. */
  discover(pattern: string | RegExp): Promise<ScriptMatch[]>;

  /** Named entries kept in the page's localStorage across reloads. `save` is false if storage refused it or the key holds data it does not recognise. */
  save(name: string, data: unknown, note?: string): boolean;
  load(name: string): Saved | undefined;
  list(): Record<string, Saved>;
  remove(name: string): void;
}

export function getApi(): ModuleApi | undefined {
  return (window as unknown as Record<string, ModuleApi | undefined>)[MODULE];
}
