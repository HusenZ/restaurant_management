// Plain module (not "use client") so the server layout can inline the script string.
export const THEME_KEY = "dineos:theme";

/** Runs in <head> before first paint (see layout.tsx). Keep in sync with applyTheme(). */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;
