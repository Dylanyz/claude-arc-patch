// Set initial theme mode based on system preference
(function () {
  const isDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  document.documentElement.setAttribute(
    "data-mode",
    isDark ? "dark" : "light",
  );
  // Listen for system theme changes
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      document.documentElement.setAttribute(
        "data-mode",
        e.matches ? "dark" : "light",
      );
    });
})();
