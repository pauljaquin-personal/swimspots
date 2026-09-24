const THEMES = new Set(["current", "coastal", "editorial", "utility", "planner"]);

function initialTheme() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("theme");
  if (THEMES.has(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem("swimspots:design-theme");
    if (THEMES.has(saved)) return saved;
  } catch {}
  return "current";
}

function applyTheme(theme, { updateUrl = false } = {}) {
  if (!THEMES.has(theme)) theme = "current";
  document.body.dataset.theme = theme;
  document.querySelectorAll("[data-design-theme]").forEach((button) => {
    const active = button.dataset.designTheme === theme;
    button.setAttribute("aria-pressed", String(active));
  });
  try {
    localStorage.setItem("swimspots:design-theme", theme);
  } catch {}
  if (updateUrl) {
    const url = new URL(location.href);
    if (theme === "current") url.searchParams.delete("theme");
    else url.searchParams.set("theme", theme);
    history.replaceState(null, "", url);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const theme = initialTheme();
  applyTheme(theme);
  document.querySelectorAll("[data-design-theme]").forEach((button) => {
    button.addEventListener("click", () =>
      applyTheme(button.dataset.designTheme, { updateUrl: true }),
    );
  });
});
