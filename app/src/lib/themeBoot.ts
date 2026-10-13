/** Shared by the server layout (boot script) and the client theme store. */
export const THEME_KEY = "parity-theme";

/** Inline <head> script. The app ships the Ticket theme only: clear any earlier "solana" choice. */
export const THEME_BOOT = `try{localStorage.removeItem("${THEME_KEY}");delete document.documentElement.dataset.theme}catch(e){}`;
