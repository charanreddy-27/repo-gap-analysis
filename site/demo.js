/* ============================================================
   repogap — interactive demo
   Two pieces:
     1. Hero terminal replays a real analyze session, line by line.
     2. Guard playground runs the ACTUAL rules from src/guard.ts so a
        visitor can try to break the read-only rail and watch it refuse.
   Both are progressive enhancement: with JS off or reduced motion on,
   the hero content is already in the DOM and the playground hides.
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. hero replay ---------- */

  var hero = document.getElementById("hero-term");
  if (hero && !reduceMotion) {
    var lines = Array.prototype.slice.call(hero.querySelectorAll(".ln"));
    var replay = document.getElementById("hero-replay");

    var revealAll = function () {
      lines.forEach(function (line) { line.classList.add("is-in"); });
    };

    var failsafe = null;

    var play = function () {
      if (failsafe) clearTimeout(failsafe);
      lines.forEach(function (line) {
        line.classList.remove("is-in");
      });
      // Force reflow so removing and re-adding the class restarts the reveal.
      void hero.offsetWidth;
      lines.forEach(function (line, i) {
        setTimeout(function () {
          line.classList.add("is-in");
        }, i * 28);
      });
      // Content must never stay hidden. Whatever happens to the timers — a
      // backgrounded tab throttling them, an interrupted reveal — everything
      // is visible shortly after play() is called.
      failsafe = setTimeout(revealAll, lines.length * 28 + 600);
    };

    hero.classList.add("is-animated");

    // Only play once the terminal is actually on screen.
    if ("IntersectionObserver" in window) {
      var seen = false;
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && !seen) {
              seen = true;
              play();
              io.disconnect();
            }
          });
        },
        { threshold: 0.25 }
      );
      io.observe(hero);
    } else {
      play();
    }

    // If the observer never fires (never scrolled into view, unsupported
    // behaviour, headless capture), show the session anyway.
    setTimeout(revealAll, 2500);

    if (replay) {
      replay.hidden = false;
      replay.addEventListener("click", play);
    }
  }

  /* ---------- 2. guard playground ---------- */

  var form = document.getElementById("guard-form");
  if (!form) return;

  var input = document.getElementById("guard-input");
  var out = document.getElementById("guard-out");
  var playground = document.getElementById("guard-playground");
  if (playground) playground.hidden = false;

  var REPORT = "GAP_ANALYSIS.md";

  /* These are ported verbatim from src/guard.ts — the demo enforces the same
     rules the CLI does, so what you see here is what the tool actually does. */
  var READ_ONLY_BASH = [
    /^git\s+(log|status|show|diff|ls-files|branch|remote|describe|shortlog|rev-parse|config\s+--get)\b/,
    /^(ls|dir|cat|head|tail|wc|find|stat|file|tree|du)\b/,
    /^(node|npm|npx|python|python3|go|cargo|java)\s+(-v|--version)\b/,
    /^npm\s+(ls|list|view|outdated)\b/,
    /^(echo|pwd|which|where|basename|dirname|sort|uniq|grep|rg)\b/
  ];

  var ALWAYS_DENIED_BASH = [
    { pattern: /\bgit\s+push\b/, why: "pushing is the user's call, not the agent's" },
    { pattern: /\bgit\s+reset\s+--hard\b/, why: "discards uncommitted work" },
    { pattern: /\bgit\s+clean\s+-[a-z]*f/, why: "deletes untracked files" },
    { pattern: /\brm\s+-[a-z]*[rf]/, why: "recursive or forced delete" },
    { pattern: /\b(shutdown|reboot|mkfs|dd)\b/, why: "destructive system command" },
    { pattern: /\bcurl\b[^|]*\|\s*(sh|bash)/, why: "pipes remote content into a shell" },
    { pattern: /\bnpm\s+publish\b/, why: "publishes outward" }
  ];

  var splitCommand = function (command) {
    return command
      .split(/&&|\|\||;|\|/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  };

  var checkAlwaysDenied = function (command) {
    for (var i = 0; i < ALWAYS_DENIED_BASH.length; i++) {
      if (ALWAYS_DENIED_BASH[i].pattern.test(command)) return ALWAYS_DENIED_BASH[i].why;
    }
    return null;
  };

  /**
   * Mirrors analysisGuard() from src/guard.ts.
   * Returns { tool, ok, why, segment } for rendering.
   */
  var evaluate = function (raw) {
    var line = raw.trim();
    if (!line) return null;

    // Write/Edit tool calls, expressed as `write <path>` / `edit <path>`.
    var write = /^(write|edit)\s+(\S+)$/i.exec(line);
    if (write) {
      var tool = write[1].toLowerCase() === "edit" ? "Edit" : "Write";
      var target = write[2].replace(/^\.\//, "");
      if (target === REPORT) {
        return { tool: tool, ok: true, why: "the report is the one writable path", target: target };
      }
      return {
        tool: tool,
        ok: false,
        why: "Phase 1 is read-only. The only writable file is " + REPORT + ".",
        target: target
      };
    }

    // Everything else is treated as a Bash call.
    var destructive = checkAlwaysDenied(line);
    if (destructive) {
      return { tool: "Bash", ok: false, why: destructive, target: line };
    }

    var segments = splitCommand(line);
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var permitted = READ_ONLY_BASH.some(function (p) { return p.test(seg); });
      if (!permitted) {
        return {
          tool: "Bash",
          ok: false,
          why: "not a read-only command: " + seg,
          target: line,
          segment: segments.length > 1 ? i + 1 : 0
        };
      }
    }
    return { tool: "Bash", ok: true, why: "read-only, permitted", target: line };
  };

  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  var render = function (line, verdict) {
    var row = document.createElement("div");
    row.className = "g-row";

    var seg = verdict.segment
      ? ' <span class="dim">(segment ' + verdict.segment + ")</span>"
      : "";

    row.innerHTML =
      '<div class="g-cmd"><span class="g-prompt">$</span> ' + esc(line) + "</div>" +
      '<div class="' + (verdict.ok ? "g-allow" : "g-deny") + '">' +
      (verdict.ok ? "✓ allowed" : "⛔ denied") +
      ' <span class="dim">— ' + esc(verdict.why) + "</span>" + seg +
      "</div>";

    out.appendChild(row);
    out.scrollTop = out.scrollHeight;
  };

  var run = function (line) {
    var verdict = evaluate(line);
    if (!verdict) return;
    render(line, verdict);
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var value = input.value;
    if (!value.trim()) return;
    run(value);
    input.value = "";
    input.focus();
  });

  // Suggestion chips — real <button>s, so keyboard works with no extra handlers.
  Array.prototype.forEach.call(document.querySelectorAll("[data-try]"), function (chip) {
    chip.addEventListener("click", function () {
      var cmd = chip.getAttribute("data-try");
      input.value = cmd;
      run(cmd);
      input.value = "";
      input.focus();
    });
  });

  var clear = document.getElementById("guard-clear");
  if (clear) {
    clear.addEventListener("click", function () {
      out.innerHTML = "";
      input.focus();
    });
  }

  // Seed with the case that actually exercises segment-splitting — `npm install`
  // is not on the always-denied list, so only the per-segment allowlist stops it.
  run("ls && npm install left-pad");
})();
