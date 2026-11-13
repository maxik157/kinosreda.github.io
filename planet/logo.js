// Match the drawer's profile-selected font and per-glyph wordmark metrics.
const families = [
  "Train One",
  "Rubik Wet Paint",
  "Rubik Moonrocks",
  "Rubik Microbe",
  "Rubik Puddles",
  "Stick",
  "Press Start 2P",
  "Reggae One",
  "Dela Gothic One",
  "Amatic SC",
  "Underdog",
  "Stalinist One",
  "Lobster",
  "Kablammo",
  "Comforter",
  "Pacifico",
  "Ruslan Display",
  "Caveat",
  "Rampart One",
  "Rubik Scribble",
];
export function installLogo(signal) {
  const wordmark = document.getElementById("planet-wordmark");
  const metrics = document.createElement("canvas").getContext("2d");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  document.head.append(link);
  let generation = 0;
  async function apply(choice) {
    const request = ++generation;
    const family = families.includes(choice) ? choice : "Rubik Wet Paint";
    document.documentElement.style.setProperty("--logo-font", `"${family}"`);
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 4000);
      link.onload = link.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
      link.href =
        "https://fonts.googleapis.com/css2?family=" +
        encodeURIComponent(family).replace(/%20/g, "+") +
        "&display=swap";
    });
    try {
      await document.fonts.load(`64px "${family}"`, "КИНОСРЕДА");
    } catch {}
    if (signal.aborted || generation !== request || !metrics) return;
    metrics.font = `400 64px "${family}", Comfortaa, sans-serif`;
    const word = "КИНОСРЕДА",
      bounds = metrics.measureText(word);
    const sx =
      180 / (bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight);
    if (!Number.isFinite(sx)) return;
    wordmark.replaceChildren(
      ...Array.from(word, (letter, index) => {
        const glyph = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        const ink = metrics.measureText(letter),
          sy =
            26 / (ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent);
        const x =
          (metrics.measureText(word.slice(0, index)).width +
            bounds.actualBoundingBoxLeft) *
          sx;
        glyph.textContent = letter;
        glyph.setAttribute(
          "transform",
          `matrix(${sx} 0 0 ${sy} ${x} ${ink.actualBoundingBoxAscent * sy})`,
        );
        return glyph;
      }),
    );
    wordmark.classList.add("ready");
  }
  let choice;
  try {
    choice = localStorage.getItem("logoFontFamily");
  } catch {}
  apply(choice);
  window.addEventListener(
    "storage",
    (event) => {
      if (event.key === "logoFontFamily") apply(event.newValue);
    },
    { signal },
  );
}
