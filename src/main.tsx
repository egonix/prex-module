// The HUD: a window mounted into the page, inside its own Shadow DOM so the
// page's styles and these cannot touch each other. Loaded with the
// bookmarklet's --module <url> or window.__prexy.loadModule(url). It reads the
// capture module's window.<MODULE> and shows nothing useful without it.
import { render } from "preact";
import { MODULE } from "../shared/module.ts";
import type { GameModule, PrexyAgent } from "../shared/prexy.ts";
import { Window } from "./Window.tsx";
import { STYLES } from "./styles.ts";

const HOST_ID = `prex-${MODULE}-hud-root`;
const UNMOUNT = `__prex_${MODULE}_hud_unmount`;

function mount(agent: PrexyAgent): void {
  // loadModule() imports a fresh module instance on every reload, so nothing
  // module-scoped survives to reach the previous one; `window` does, and the
  // handle has to live there. Preact runs a component's cleanup (clearing its
  // intervals) only when it is unmounted through render(null, ...). Removing the
  // old DOM node instead leaves the intervals of every earlier reload running
  // on a detached tree that nothing can see.
  const w = window as unknown as Record<string, (() => void) | undefined>;
  w[UNMOUNT]?.();
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;
  shadow.appendChild(style);

  const root = document.createElement("div");
  shadow.appendChild(root);

  render(<Window agent={agent} />, root);
  w[UNMOUNT] = () => {
    render(null, root);
    host.remove();
  };
}

const hud: GameModule = {
  name: `${MODULE}-hud`,
  init: mount,
};

export default hud;
