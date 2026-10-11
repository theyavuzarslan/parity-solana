/** Shared by the server layout (boot script) and the client theme store. */
export const THEME_KEY = "parity-theme";

/** Inline <head> script: set data-theme from localStorage before first paint. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="solana"){document.documentElement.dataset.theme="solana"}}catch(e){}`;
