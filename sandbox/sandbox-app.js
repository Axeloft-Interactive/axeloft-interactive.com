(function() {
  const hero = document.getElementById("hero");
  if (!hero) return;

  // UI Elements
  const sizeInput = document.getElementById("brush-size");
  
  if (typeof window._sandboxCurrentColor === "undefined") {
    window._sandboxCurrentColor = "#ff007f";
    window._sandboxUseRainbow = false;
  }

  document.querySelectorAll(".color-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const c = btn.getAttribute("data-color");
      if (c === "rainbow") {
        window._sandboxUseRainbow = true;
      } else {
        window._sandboxUseRainbow = false;
        window._sandboxCurrentColor = c;
      }
    });
  });

  // Attach global listeners only once
  if (!window._sandboxGlobalListenersAttached) {
    window._sandboxGlobalListenersAttached = true;
    
    window._sandboxHistory = [];
    window._sandboxHistoryIndex = -1;
    
    window._sandboxPushHistory = function() {
      if (!window.SandboxGrid) return;
      const state = SandboxGrid.exportState();
      if (window._sandboxHistoryIndex < window._sandboxHistory.length - 1) {
        window._sandboxHistory = window._sandboxHistory.slice(0, window._sandboxHistoryIndex + 1);
      }
      window._sandboxHistory.push(state);
      if (window._sandboxHistory.length > 50) window._sandboxHistory.shift();
      window._sandboxHistoryIndex = window._sandboxHistory.length - 1;
    };
    
    window._sandboxUndo = function() {
      if (window._sandboxHistoryIndex > 0) {
        window._sandboxHistoryIndex--;
        SandboxGrid.importState(window._sandboxHistory[window._sandboxHistoryIndex]);
      }
    };
    
    window._sandboxRedo = function() {
      if (window._sandboxHistoryIndex < window._sandboxHistory.length - 1) {
        window._sandboxHistoryIndex++;
        SandboxGrid.importState(window._sandboxHistory[window._sandboxHistoryIndex]);
      }
    };
    
    setTimeout(window._sandboxPushHistory, 500);
    
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) window._sandboxRedo();
          else window._sandboxUndo();
        }
      }
    });
    
    let isPainting = false;
    let isErasing = false;
    let lastX = null;
    let lastY = null;
    let hasDrawn = false;

  hero.addEventListener("contextmenu", e => e.preventDefault());

  hero.addEventListener("mousedown", (e) => {
    const ui = document.getElementById("sandbox-ui");
    if (ui) {
      if (e.button === 0) isPainting = true;
      if (e.button === 2) isErasing = true;
      const rect = hero.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
      handleDraw(lastX, lastY);
    }
  });

  hero.addEventListener("mousemove", (e) => {
    if (isPainting || isErasing) {
      const rect = hero.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      
      // Interpolate line
      const dist = Math.hypot(px - lastX, py - lastY);
      const steps = Math.max(1, Math.ceil(dist / 5)); // step every 5 pixels
      
      for(let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ix = lastX + (px - lastX) * t;
        const iy = lastY + (py - lastY) * t;
        handleDraw(ix, iy);
      }
      
      lastX = px;
      lastY = py;
    }
  });

  window.addEventListener("mouseup", () => {
    if ((isPainting || isErasing) && hasDrawn) {
      window._sandboxPushHistory();
    }
    isPainting = false;
    isErasing = false;
    lastX = null;
    lastY = null;
    hasDrawn = false;
  });

    function handleDraw(px, py) {
      hasDrawn = true;
      const currentSizeInput = document.getElementById("brush-size");
      let radius = 1;
      if (currentSizeInput) radius = parseInt(currentSizeInput.value);
      
      // always 10% chance to emit
      let elCount = Math.random() < 0.1 ? 1 : 0;
      
      if (isErasing) {
        SandboxGrid.eraseAt(px, py, radius);
      } else if (isPainting) {
        let drawColor = window._sandboxUseRainbow ? "rainbow" : window._sandboxCurrentColor;
        SandboxGrid.paintAt(px, py, radius, drawColor, 1, elCount);
      }
    }
  } // End of global listeners

  // Draggable UI (attached per UI instance)
  const uiPanel = document.getElementById("sandbox-ui");
  const header = document.getElementById("sandbox-ui-header");
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = uiPanel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
  });

  window.addEventListener("mousemove", (e) => {
    if (isDragging && uiPanel) {
      uiPanel.style.right = "auto";
      uiPanel.style.top = (e.clientY - dragOffsetY) + "px";
      uiPanel.style.left = (e.clientX - dragOffsetX) + "px";
      uiPanel.style.transform = "none";
    }
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  document.getElementById("close-sandbox-btn")?.addEventListener("click", () => {
    uiPanel.style.transform = ''; // clear inline transform if dragged
    uiPanel.classList.add("hidden");
    setTimeout(() => {
      uiPanel.remove();
      const openBtn = document.getElementById("open-sandbox-btn") || Array.from(document.querySelectorAll("button")).find(b => b.innerText === "Open Sandbox");
      if (openBtn) openBtn.style.display = "block";
    }, 300);
  });

  document.getElementById("reset-btn")?.addEventListener("click", () => {
    SandboxGrid.clearAll();
    const img = new Image();
    img.onload = () => {
      SandboxGrid.addShape("Axeloft Interactive", img);
      window._sandboxPushHistory();
    };
    img.src = "/logo.svg";
  });

  const sizeSlider = document.getElementById("brush-size");
  const sizeSpan = document.getElementById("size-val");
  function updateSlider() {
    if (!sizeSlider || !sizeSpan) return;
    const val = parseInt(sizeSlider.value);
    const min = parseInt(sizeSlider.min) || 1;
    const max = parseInt(sizeSlider.max) || 3;
    const percent = (val - min) / (max - min);
    const thumbWidth = 20;
    const center = thumbWidth / 2 + percent * (sizeSlider.clientWidth - thumbWidth);
    sizeSpan.innerText = val;
    sizeSpan.style.left = center + "px";
  }
  sizeSlider?.addEventListener("input", updateSlider);
  // Initial position update
  setTimeout(updateSlider, 50);

  document.getElementById("sandbox-text")?.addEventListener("change", (e) => {
    const text = e.target.value;
    if (text !== undefined) {
      SandboxGrid.clearAll();
      const img = new Image();
      img.onload = () => {
        SandboxGrid.addShape(text, img);
        window._sandboxPushHistory();
      };
      img.src = "/logo.svg";
    }
  });

})();
