// Theme toggle. The inline script in <head> applies the saved choice before
// first paint; this only handles the click.
(function () {
  var toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", function () {
    var root = document.documentElement;
    var explicit = root.getAttribute("data-theme");
    var current =
      explicit ||
      (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    var next = current === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("repogap-theme", next);
    } catch (e) {
      // private mode — the toggle still works for this page view
    }
  });
})();
