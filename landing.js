// Safe Location landing page (/welcome): scroll reveals and the living product previews.
// The page is complete without this file; it only adds motion. Nothing here talks to the server.
"use strict";

(() => {
  // Without the Safe Location server (for example on a static host), offer only what works: tracking.
  if (window.SAFE_LOCATION_CONFIG && window.SAFE_LOCATION_CONFIG.sync === false) {
    document.querySelectorAll("[data-needs-server]").forEach((node) => { node.hidden = true; });
    document.querySelectorAll("[data-device-only]").forEach((node) => { node.hidden = false; });
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    // Show the finished state: the route drawn and the pin at its end.
    document.querySelectorAll(".mock-map svg").forEach((svg) => {
      try { svg.pauseAnimations(); svg.setCurrentTime(6.3); } catch { /* SVG animation not supported */ }
    });
    return;
  }

  document.documentElement.classList.add("motion");

  // Sections ease in once as they scroll into view.
  const targets = document.querySelectorAll("[data-reveal], [data-steps]");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    targets.forEach((target) => observer.observe(target));
  } else {
    targets.forEach((target) => target.classList.add("is-in"));
  }

  // The tracker preview cycles through real states the product shows: recording, offline with points
  // waiting on the phone, then back online with everything uploaded.
  const band = document.querySelector(".mock-band");
  const bandText = document.querySelector(".mock-band-text");
  const conn = document.querySelector(".mock-conn");
  const backup = document.querySelector(".mock-backup");
  const count = document.querySelector(".mock-count");
  const age = document.querySelector(".mock-age");
  const states = [
    { tone: "calm", text: "Trip to Lekki: recording every 1 minute", conn: "Online", backup: "All uploaded", warn: false },
    { tone: "attention", text: "Trip to Lekki: offline, points wait on this phone", conn: "Offline", backup: "3 waiting", warn: true },
    { tone: "calm", text: "Back online: 3 points uploaded", conn: "Online", backup: "All uploaded", warn: false }
  ];
  const setReadout = (node, text, warn) => {
    node.classList.toggle("is-warn", warn);
    node.lastChild.textContent = text;
  };
  let stateIndex = 0;
  let secondsLeft = 42;
  let ageSeconds = 3;
  let tick = 0;

  const sosSeconds = document.querySelector(".sos-mock-seconds");
  let sos = 5;

  setInterval(() => {
    if (document.hidden) return;
    tick += 1;

    secondsLeft = secondsLeft <= 0 ? 59 : secondsLeft - 1;
    ageSeconds = secondsLeft === 59 ? 0 : ageSeconds + 1; // a new reading resets the age
    if (count) count.textContent = `0:${String(secondsLeft).padStart(2, "0")}`;
    if (age) age.textContent = String(ageSeconds);

    if (band && tick % 4 === 0) {
      stateIndex = (stateIndex + 1) % states.length;
      const state = states[stateIndex];
      band.dataset.tone = state.tone;
      bandText.textContent = state.text;
      bandText.classList.remove("is-swapping");
      void bandText.offsetWidth; // restart the swap animation
      bandText.classList.add("is-swapping");
      setReadout(conn, state.conn, state.warn);
      setReadout(backup, state.backup, state.warn);
    }

    if (sosSeconds) {
      sos = sos <= 1 ? 5 : sos - 1;
      sosSeconds.textContent = String(sos);
    }
  }, 1000);
})();
