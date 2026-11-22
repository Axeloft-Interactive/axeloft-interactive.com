/**
 * Pixel Grid Background Effect
 * Renders an animated pixel-grid with glowing text and interactive electrons.
 * Supports optional logo rendering with anti-aliasing and nested grid modes.
 */

const SandboxGrid = (() => {
  // ── Mutable Config ─────────────────────────────────────────────────────
  let config = {
    STEP_LENGTH: 2,
    CELL_SIZE: 3,
    BORDER_WIDTH: 1,
    MAX_FONT_SIZE: 500,
    MAX_ELECTRONS: 2500,      // Higher limit to ensure large logo illumination remains bright
    CELL_DISTANCE: 4,
    CELL_REPAINT_INTERVAL: [250, 550],
    RANDOM_SPAWN_INTERVAL: [300, 600],
    BG_COLOR: "#0f1318",
    BORDER_COLOR: "#171e27",
    CELL_HIGHLIGHT: "#00b4d8",
    ELECTRON_COLOR: "#00b4d8",
    FONT_COLOR: "#90e0ef",
    FONT_FAMILY: "Inter, Helvetica, Arial, sans-serif",

    // Logo options
    logoSrc: null,            // URL to SVG/PNG logo (null = no logo)
    logoAntiAlias: false,     // true = use alpha for cell brightness
    logoGridSize: null,       // e.g. 2 = logo uses CELL_SIZE/2 nested grid (null = same grid)
    logoGridTransition: false, // true = smooth blend at logo grid boundary
    logoScale: 0.42,          // Default size of logo relative to container height
    logoCenterYRatio: 0.28,   // Center Y position of logo (ratio of height)
    LOGO_COLOR: null,         // Hex color for the logo, or null/default to randomly pick Cyan/Amber
    LOGO_HOVER_COLOR: "#ff007f", // Hover target color (defaults to pink to match text)
    logoColorStatic: false,   // Disable color cycling and hover target coloring
    subText: null,            // Subtitle text to render in grid
    subTextUnderline: false,  // Underline subtitle text
    shapeElement: "hero"      // Element (or id) that bounds text + logo layout (missing = whole container)
  };

  const ACTIVE_ELECTRONS = [];
  const PINNED_CELLS = [];
  let _ghostRect = null;

  let MOVE_TRAILS = [];
  let END_POINTS_OFFSET = [];

  // Pointer position and interaction state for dynamic logo updates
  let _pointerX = -99999;
  let _pointerY = -99999;
  let _pointerActive = false;
  let _currentLogoScale = 1.0;
  let _currentLogoRgb = null;
  let _wasHovered = false; // Tracks hover state to cycle colors on mouse exit

  function updateDerivedConfig() {
    config.CELL_DISTANCE = config.CELL_SIZE + config.BORDER_WIDTH;
    MOVE_TRAILS = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
    ].map(([x, y]) => [x * config.CELL_DISTANCE, y * config.CELL_DISTANCE]);
    END_POINTS_OFFSET = [
      [0, 0], [0, 1], [1, 0], [1, 1],
    ].map(([x, y]) => [
      x * config.CELL_DISTANCE - config.BORDER_WIDTH / 2,
      y * config.CELL_DISTANCE - config.BORDER_WIDTH / 2,
    ]);
  }
  updateDerivedConfig();

  // ── Helpers ────────────────────────────────────────────────────────────
  // ── Shape layout box ───────────────────────────────────────────────────
  // Region (relative to the container) where text + logo are laid out.
  let _shapeBox = null;

  function resolveShapeElement() {
    const el = config.shapeElement;
    if (!el) return null;
    if (typeof el === "string") return document.getElementById(el);
    return el;
  }

  function computeShapeBox() {
    const container = _shapeLayer ? _shapeLayer.container : null;
    let box = {
      x: 0,
      y: 0,
      width: container ? container.clientWidth : 0,
      height: container ? container.clientHeight : 0,
    };
    const el = resolveShapeElement();
    if (el && container && el !== container) {
      const cr = container.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      box = {
        x: Math.round(er.left - cr.left),
        y: Math.round(er.top - cr.top),
        width: Math.round(er.width),
        height: Math.round(er.height),
      };
    }
    _shapeBox = box;
    return box;
  }

  function getShapeBox() {
    return _shapeBox || computeShapeBox();
  }

  function getLogoCenter() {
    const b = getShapeBox();
    return {
      x: b.x + b.width / 2,
      y: b.y + b.height * config.logoCenterYRatio,
    };
  }

  function getLogoSize() {
    if (!_logoOriginalW || !_logoOriginalH) return { logoW: 0, logoH: 0 };
    const b = getShapeBox();
    const aspect = _logoOriginalW / _logoOriginalH;
    let logoW = b.height * config.logoScale * aspect;
    if (logoW > b.width * 0.35) logoW = b.width * 0.35;
    return { logoW, logoH: logoW / aspect };
  }

  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function debounce(fn, ms) {
    let id;
    return function (...args) {
      clearTimeout(id);
      id = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ── ScopedCanvas ───────────────────────────────────────────────────────
  class ScopedCanvas {
    constructor(container, disableScale = false) {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("2D canvas context not available");
      this.canvas = canvas;
      this.context = context;
      this.disableScale = disableScale;
      this.width = 0;
      this.height = 0;
      this.realWidth = 0;
      this.realHeight = 0;
      this.container = container;
      this._resizeHandlers = [];
      this._boundResize = debounce(() => this._handleResize(), 100);
      this.adjust();
      window.addEventListener("resize", this._boundResize);
    }

    adjust() {
      const { canvas, context, disableScale, container } = this;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const DPR = disableScale ? 1 : window.devicePixelRatio || 1;
      this.width = w;
      this.height = h;
      this.realWidth = canvas.width = w * DPR;
      this.realHeight = canvas.height = h * DPR;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(DPR, DPR);
    }

    clear() { this.context.clearRect(0, 0, this.width, this.height); }

    blendBackground(bgSource) {
      return this.paint((ctx, layer) => {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(0, 0, layer.width, layer.height);
        ctx.globalCompositeOperation = "lighten";
        ctx.drawImage(bgSource, 0, 0, layer.realWidth, layer.realHeight, 0, 0, layer.width, layer.height);
      });
    }

    paint(fn) {
      if (!fn) return;
      this.context.save();
      fn(this.context, this);
      this.context.restore();
      return this;
    }

    repaint(fn) {
      if (!fn) return;
      this.clear();
      return this.paint(fn);
    }

    onResize(fn) { if (fn) this._resizeHandlers.push(fn); }

    _handleResize() {
      if (!this._resizeHandlers.length) return;
      this.adjust();
      this._resizeHandlers.forEach((h) => h(this.context, this));
    }

    renderIntoView() {
      this.canvas.style.position = "absolute";
      this.canvas.style.left = "0";
      this.canvas.style.top = "0";
      this.canvas.style.pointerEvents = "none";
      this.container.appendChild(this.canvas);
    }

    remove() {
      try {
        window.removeEventListener("resize", this._boundResize);
        this.container.removeChild(this.canvas);
      } catch {}
    }
  }

  // ── Electron ───────────────────────────────────────────────────────────
  class Electron {
    constructor(x = 0, y = 0, { lifeTime = 3000, speed = config.STEP_LENGTH, color = config.ELECTRON_COLOR, isLogo = false, isRandom = false, logoCenter = null } = {}) {
      this.lifeTime = lifeTime;
      this.expireAt = Date.now() + lifeTime;
      this.speed = speed;
      this.color = color;
      this.radius = 1.2;
      this.isLogo = isLogo;
      this.isRandom = isRandom;
      this.logoCenter = logoCenter;
      this.current = [x, y];
      this.visited = {};
      this.destination = this._randomPath();
      this._setDest(this.destination);
    }

    _randomPath() {
      const [x, y] = this.current;
      const t = MOVE_TRAILS[Math.floor(Math.random() * MOVE_TRAILS.length)];
      return [x + t[0], y + t[1]];
    }

    _setDest(d) { this.destination = d; this.visited[d.join(",")] = true; }

    next() {
      const { speed, current } = this;
      let dest = this.destination;
      if (Math.abs(current[0] - dest[0]) <= speed / 2 && Math.abs(current[1] - dest[1]) <= speed / 2) {
        dest = this._randomPath();
        let tries = 1;
        while (this.visited[dest.join(",")] && tries <= 4) { dest = this._randomPath(); tries++; }
        this._setDest(dest);
      }
      const dx = dest[0] - current[0];
      const dy = dest[1] - current[1];
      if (dx) current[0] += (dx / Math.abs(dx)) * speed;
      if (dy) current[1] += (dy / Math.abs(dy)) * speed;
      return [current[0], current[1]];
    }
  }

  // ── Glow sprite cache ─────────────────────────────────────────────────
  const GLOW_SPRITES = new Map();

  function getGlowSprite(color, radius) {
    const key = `${color}_${radius}`;
    if (GLOW_SPRITES.has(key)) return GLOW_SPRITES.get(key);
    const blur = radius * 5;
    const size = Math.ceil((radius + blur * 2) * 2);
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur;
    ctx.beginPath(); ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2); ctx.fill();
    const sprite = { canvas: c, offset: size / 2 };
    GLOW_SPRITES.set(key, sprite);
    return sprite;
  }

  // ── Cell ───────────────────────────────────────────────────────────────
  class Cell {
    constructor(row = 0, col = 0, {
      electronCount = 1 + Math.floor(Math.random() * 4),
      background = config.ELECTRON_COLOR,
      forceElectrons = false,
      electronOptions = {},
      cellSize = config.CELL_SIZE,
      cellDistance = config.CELL_DISTANCE,
    } = {}) {
      this.background = background;
      this.electronOptions = electronOptions;
      this.forceElectrons = forceElectrons;
      this.electronCount = Math.min(electronCount, 4);
      this.cellSize = cellSize;
      this.cellDistance = cellDistance;
      this.startY = row * cellDistance;
      this.startX = col * cellDistance;
      this.isLogo = false;
      this.alpha = 1;
      this.expireAt = Number.MAX_SAFE_INTEGER;
      this.nextUpdate = undefined;
    }

    delay(ms = 0) { this.pin(ms * 1.5); this.nextUpdate = Date.now() + ms; }

    pin(lifeTime = Number.MAX_SAFE_INTEGER) {
      this.expireAt = Date.now() + lifeTime;
      PINNED_CELLS.push(this);
    }

    scheduleUpdate(t1 = config.CELL_REPAINT_INTERVAL[0], t2 = config.CELL_REPAINT_INTERVAL[1]) {
      this.nextUpdate = Date.now() + t1 + Math.floor(Math.random() * (t2 - t1 + 1));
    }

    paintNextTo(layer) {
      if (this.nextUpdate && Date.now() < this.nextUpdate) return;
      this.scheduleUpdate();
      this._createElectrons();
      layer.paint((ctx) => {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = this.background;
        ctx.fillRect(this.startX, this.startY, this.cellSize, this.cellSize);
      });
    }

    _createElectrons() {
      if (!this.electronCount) return;
      const eps = [...END_POINTS_OFFSET];
      const max = this.forceElectrons
        ? this.electronCount
        : Math.min(this.electronCount, config.MAX_ELECTRONS - ACTIVE_ELECTRONS.length);

      const { x: logoCenterX, y: logoCenterY } = getLogoCenter();

      for (let i = 0; i < max; i++) {
        if (eps.length === 0) break;
        const idx = Math.floor(Math.random() * eps.length);
        const [ox, oy] = eps.splice(idx, 1)[0];

        let spawnX, spawnY;
        let eOpts = { ...this.electronOptions };

        if (this.isLogo) {
          eOpts.isLogo = true;
          eOpts.logoCenter = [logoCenterX, logoCenterY];
          // Spawn in local coordinates
          spawnX = this.baseOffsetX + ox;
          spawnY = this.baseOffsetY + oy;
        } else {
          spawnX = this.startX + ox;
          spawnY = this.startY + oy;
        }

        ACTIVE_ELECTRONS.push(new Electron(spawnX, spawnY, eOpts));
      }
    }
  }

  // ── Drawing helpers ────────────────────────────────────────────────────
  function drawElectronsBatch(layer) {
    const now = Date.now();
    let wi = 0;

    const { x: logoCenterX, y: logoCenterY } = getLogoCenter();

    layer.paint((ctx) => {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < ACTIVE_ELECTRONS.length; i++) {
        const e = ACTIVE_ELECTRONS[i];
        if (now >= e.expireAt) continue;

        const [localX, localY] = e.next();
        let x, y;
        let color = e.color;

        if (e.isLogo && e.logoCenter) {
          // Project to scaled screen coordinates
          x = logoCenterX + localX * _currentLogoScale;
          y = logoCenterY + localY * _currentLogoScale;
          
          if (_currentLogoRgb) {
            const r = Math.round(_currentLogoRgb.r);
            const g = Math.round(_currentLogoRgb.g);
            const b = Math.round(_currentLogoRgb.b);
            color = `rgb(${r},${g},${b})`;
          }
        } else {
          x = localX;
          y = localY;
          if (e.isRandom && _currentLogoRgb) {
            const r = Math.round(_currentLogoRgb.r);
            const g = Math.round(_currentLogoRgb.g);
            const b = Math.round(_currentLogoRgb.b);
            color = `rgb(${r},${g},${b})`;
          }
        }

        const alpha = Math.max(0, e.expireAt - now) / e.lifeTime;
        const { canvas: sp, offset } = getGlowSprite(color, e.radius);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sp, x - offset, y - offset);
        ACTIVE_ELECTRONS[wi++] = e;
      }
    });
    ACTIVE_ELECTRONS.length = wi;
  }

  function drawGhostRect(ctx) {
    if (!_ghostRect) return;
    const c1 = getCellCoords(_ghostRect.x1, _ghostRect.y1);
    const c2 = getCellCoords(_ghostRect.x2, _ghostRect.y2);
    const minRow = Math.min(c1.row, c2.row);
    const maxRow = Math.max(c1.row, c2.row);
    const minCol = Math.min(c1.col, c2.col);
    const maxCol = Math.max(c1.col, c2.col);

    ctx.save();
    
    let color = _ghostRect.colorHex;
    if (color === "rainbow") {
      color = config.LOGO_COLOR || "#00f0ff";
    }
    const rgb = hexToRgb(color);

    if (_ghostRect.type === 'paint') {
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`;
    } else {
      ctx.fillStyle = "rgba(255, 60, 60, 0.2)";
      ctx.strokeStyle = "rgba(255, 60, 60, 0.75)";
    }

    for (let r = minRow; r <= maxRow; r++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * config.CELL_DISTANCE;
        const y = r * config.CELL_DISTANCE;
        ctx.fillRect(x, y, config.CELL_SIZE, config.CELL_SIZE);
      }
    }

    const bx1 = minCol * config.CELL_DISTANCE - config.BORDER_WIDTH / 2;
    const by1 = minRow * config.CELL_DISTANCE - config.BORDER_WIDTH / 2;
    const bx2 = (maxCol + 1) * config.CELL_DISTANCE - config.BORDER_WIDTH / 2;
    const by2 = (maxRow + 1) * config.CELL_DISTANCE - config.BORDER_WIDTH / 2;

    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);

    ctx.restore();
  }

  // ── Grid drawing ───────────────────────────────────────────────────────
  function drawGrid(bgLayer) {
    bgLayer.paint((ctx, { width, height }) => {
      ctx.fillStyle = config.BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      let useNested = config.logoSrc && config.logoGridSize && config.logoGridSize > 1 && _logoOriginalW;
      
      const { x: logoCenterX, y: logoCenterY } = getLogoCenter();
      const { logoW, logoH } = useNested ? getLogoSize() : { logoW: 0, logoH: 0 };

      // Draw large grid
      const cvsL = document.createElement("canvas");
      cvsL.width = width; cvsL.height = height;
      const ctxL = cvsL.getContext("2d");
      ctxL.fillStyle = config.BORDER_COLOR;
      for (let h = config.CELL_SIZE; h < height; h += config.CELL_DISTANCE)
        ctxL.fillRect(0, h, width, config.BORDER_WIDTH);
      for (let w = config.CELL_SIZE; w < width; w += config.CELL_DISTANCE)
        ctxL.fillRect(w, 0, config.BORDER_WIDTH, height);

      if (!useNested) {
        ctx.drawImage(cvsL, 0, 0);
        return;
      }

      const maxScale = 1.35;
      const pad = config.logoGridTransition ? config.CELL_DISTANCE * 6 : config.CELL_DISTANCE * 2;
      const boxW = logoW * maxScale + pad * 2;
      const boxH = logoH * maxScale + pad * 2;
      const radius = Math.max(boxW, boxH) / 2;

      // Erase large grid in the center
      const grad = ctxL.createRadialGradient(logoCenterX, logoCenterY, radius * 0.4, logoCenterX, logoCenterY, radius);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctxL.globalCompositeOperation = "destination-out";
      ctxL.fillStyle = grad;
      ctxL.fillRect(logoCenterX - radius, logoCenterY - radius, radius * 2, radius * 2);
      ctx.drawImage(cvsL, 0, 0);

      // Draw small grid
      const cvsS = document.createElement("canvas");
      cvsS.width = width; cvsS.height = height;
      const ctxS = cvsS.getContext("2d");
      ctxS.fillStyle = config.BORDER_COLOR;
      
      const logoCellSize = Math.max(1, Math.round(config.CELL_SIZE / config.logoGridSize));
      const logoBorderWidth = Math.max(1, Math.round(config.BORDER_WIDTH / config.logoGridSize));
      const logoCellDist = logoCellSize + logoBorderWidth;

      const x1 = logoCenterX - radius;
      const y1 = logoCenterY - radius;
      const x2 = logoCenterX + radius;
      const y2 = logoCenterY + radius;

      for (let y = Math.floor(y1); y <= y2; y += logoCellDist) {
        if (y >= 0 && y <= height) ctxS.fillRect(Math.max(0, x1), y, Math.min(width, x2) - Math.max(0, x1), logoBorderWidth);
      }
      for (let x = Math.floor(x1); x <= x2; x += logoCellDist) {
        if (x >= 0 && x <= width) ctxS.fillRect(x, Math.max(0, y1), logoBorderWidth, Math.min(height, y2) - Math.max(0, y1));
      }

      // Mask small grid to only show in center
      ctxS.globalCompositeOperation = "destination-in";
      ctxS.fillStyle = grad;
      ctxS.fillRect(logoCenterX - radius, logoCenterY - radius, radius * 2, radius * 2);

      ctx.drawImage(cvsS, 0, 0);
    });
  }

  function createRandomCell(mainLayer, opts = {}) {
    if (config.disableRandomSpawn) return;
    if (ACTIVE_ELECTRONS.length >= config.MAX_ELECTRONS) return;
    const { width, height } = mainLayer;
    const cell = new Cell(
      Math.floor(Math.random() * (height / config.CELL_DISTANCE + 1)),
      Math.floor(Math.random() * (width / config.CELL_DISTANCE + 1)),
      { background: "transparent", ...opts, electronOptions: { ...(opts.electronOptions || {}), isRandom: true } }
    );
    cell.paintNextTo(mainLayer);
  }

  // Helper for sandbox: get cell coordinates from pixel coordinates
  function getCellCoords(px, py) {
    return {
      row: Math.floor(py / config.CELL_DISTANCE),
      col: Math.floor(px / config.CELL_DISTANCE)
    };
  }

  function eraseAt(px, py, radiusCells) {
    const coords = getCellCoords(px, py);
    const newPinned = [];
    for (let c of PINNED_CELLS) {
      const dr = c.startY / config.CELL_DISTANCE - coords.row;
      const dc = c.startX / config.CELL_DISTANCE - coords.col;
      if (dr*dr + dc*dc > radiusCells*radiusCells) {
        newPinned.push(c);
      }
    }
    PINNED_CELLS.length = 0;
    PINNED_CELLS.push(...newPinned);
  }

  function paintAt(px, py, radiusCells, colorHex, alpha, electronCount) {
    const coords = getCellCoords(px, py);
    
    for (let r = -radiusCells; r <= radiusCells; r++) {
      for (let c = -radiusCells; c <= radiusCells; c++) {
        if (r*r + c*c <= radiusCells*radiusCells) {
          const row = coords.row + r;
          const col = coords.col + c;
          
          // Remove existing cell at this position if any
          const existingIdx = PINNED_CELLS.findIndex(cell => 
            Math.abs(cell.startX - col * config.CELL_DISTANCE) < 0.1 && 
            Math.abs(cell.startY - row * config.CELL_DISTANCE) < 0.1
          );
          if (existingIdx !== -1) PINNED_CELLS.splice(existingIdx, 1);
          
          const isRainbow = colorHex === "rainbow";
          const resolvedColor = isRainbow ? (config.LOGO_COLOR || "#00f0ff") : colorHex;
          const rgb = hexToRgb(resolvedColor);
          const bg = alpha < 1 ? `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})` : resolvedColor;
          
          const cell = new Cell(row, col, {
            background: bg,
            electronCount: electronCount,
            electronOptions: { speed: 2, color: bg, lifeTime: 300 + randomInt(0, 200) },
            cellSize: config.CELL_SIZE,
            cellDistance: config.CELL_DISTANCE
          });
          cell.isRainbow = isRainbow;
          cell.alpha = alpha;
          cell.pin();
        }
      }
    }
  }

  function paintRect(px1, py1, px2, py2, colorHex, alpha, electronCount) {
    const c1 = getCellCoords(px1, py1);
    const c2 = getCellCoords(px2, py2);
    
    const minRow = Math.min(c1.row, c2.row);
    const maxRow = Math.max(c1.row, c2.row);
    const minCol = Math.min(c1.col, c2.col);
    const maxCol = Math.max(c1.col, c2.col);
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const existingIdx = PINNED_CELLS.findIndex(cell => 
          Math.abs(cell.startX - col * config.CELL_DISTANCE) < 0.1 && 
          Math.abs(cell.startY - row * config.CELL_DISTANCE) < 0.1
        );
        if (existingIdx !== -1) PINNED_CELLS.splice(existingIdx, 1);
        
        const isRainbow = colorHex === "rainbow";
        const resolvedColor = isRainbow ? (config.LOGO_COLOR || "#00f0ff") : colorHex;
        const rgb = hexToRgb(resolvedColor);
        const bg = alpha < 1 ? `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})` : resolvedColor;
        
        let elCount = 0;
        if (typeof electronCount === "function") {
          elCount = electronCount();
        } else if (typeof electronCount === "number") {
          elCount = electronCount;
        }

        const cell = new Cell(row, col, {
          background: bg,
          electronCount: elCount,
          electronOptions: { speed: 2, color: bg, lifeTime: 300 + randomInt(0, 200) },
          cellSize: config.CELL_SIZE,
          cellDistance: config.CELL_DISTANCE
        });
        cell.isRainbow = isRainbow;
        cell.alpha = alpha;
        cell.pin();
      }
    }
  }

  function eraseRect(px1, py1, px2, py2) {
    const c1 = getCellCoords(px1, py1);
    const c2 = getCellCoords(px2, py2);
    
    const minRow = Math.min(c1.row, c2.row);
    const maxRow = Math.max(c1.row, c2.row);
    const minCol = Math.min(c1.col, c2.col);
    const maxCol = Math.max(c1.col, c2.col);
    
    const newPinned = [];
    for (let c of PINNED_CELLS) {
      const r = Math.round(c.startY / config.CELL_DISTANCE);
      const col = Math.round(c.startX / config.CELL_DISTANCE);
      if (r >= minRow && r <= maxRow && col >= minCol && col <= maxCol) {
        // Erased
      } else {
        newPinned.push(c);
      }
    }
    PINNED_CELLS.length = 0;
    PINNED_CELLS.push(...newPinned);
  }

  function setGhostRect(rect) {
    _ghostRect = rect;
  }

  function exportState() {
    return JSON.stringify({
      config: {
        CELL_SIZE: config.CELL_SIZE,
        BORDER_WIDTH: config.BORDER_WIDTH
      },
      cells: PINNED_CELLS.map(c => ({
        row: Math.round(c.startY / config.CELL_DISTANCE),
        col: Math.round(c.startX / config.CELL_DISTANCE),
        background: c.background,
        alpha: c.alpha,
        electronCount: c.electronCount,
        isLogo: c.isLogo,
        baseOffsetX: c.baseOffsetX,
        baseOffsetY: c.baseOffsetY
      }))
    });
  }

  function importState(jsonStr) {
    try {
      const state = JSON.parse(jsonStr);
      if (state.config) {
        config.CELL_SIZE = state.config.CELL_SIZE;
        config.BORDER_WIDTH = state.config.BORDER_WIDTH;
        updateDerivedConfig();
      }
      PINNED_CELLS.length = 0;
      ACTIVE_ELECTRONS.length = 0;
      if (_mainLayer) _mainLayer.clear();
      
      state.cells.forEach(c => {
        const cell = new Cell(c.row, c.col, {
          background: c.background,
          electronCount: c.electronCount,
          electronOptions: { speed: 2, color: c.background, lifeTime: 300 + randomInt(0, 200) },
          cellSize: config.CELL_SIZE,
          cellDistance: config.CELL_DISTANCE
        });
        cell.alpha = c.alpha || 1;
        if (c.isLogo) {
          cell.isLogo = true;
          cell.baseOffsetX = c.baseOffsetX;
          cell.baseOffsetY = c.baseOffsetY;
        }
        cell.pin();
      });
    } catch(e) {
      console.error("Failed to import state", e);
    }
  }
  
  function clearAll() {
    PINNED_CELLS.length = 0;
    ACTIVE_ELECTRONS.length = 0;
    if (_mainLayer) _mainLayer.clear();
  }

  function getContainer() {
    return _mainLayer ? _mainLayer.container : null;
  }

  function compactAndPaint(list, mainLayer) {
    const now = Date.now();
    let wi = 0;
    for (let i = 0; i < list.length; i++) {
      if (now >= list[i].expireAt) continue;
      
      if (list[i].isLogo && list[i].alpha <= 0.05) {
        list[wi++] = list[i];
        continue;
      }

      list[i].paintNextTo(mainLayer);
      list[wi++] = list[i];
    }
    list.length = wi;
  }

  // ── Pointer interaction ────────────────────────────────────────────────
  function handlePointer(container, mainLayer) {
    let lastCell = null;
    let touchRecords = {};

    function isSameCell(i, j) {
      const same = lastCell && i === lastCell[0] && j === lastCell[1];
      lastCell = [i, j];
      return same;
    }

    function print(isMove, point) {
      const rect = container.getBoundingClientRect();
      const cx = point.clientX - rect.left;
      const cy = point.clientY - rect.top;

      // Track coordinates globally for logo interactions
      _pointerX = cx;
      _pointerY = cy;
      _pointerActive = true;

      // Ignore points outside the grid (e.g. when the grid only covers part of the page)
      if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return;

      const i = Math.floor(cy / config.CELL_DISTANCE);
      const j = Math.floor(cx / config.CELL_DISTANCE);
      if (isMove && isSameCell(i, j)) return;
      
      let hoverColor = config.CELL_HIGHLIGHT;
      if (config.logoSrc && _shapeLayer) {
        const { x: logoCenterX, y: logoCenterY } = getLogoCenter();
        const dx = cx - logoCenterX;
        const dy = cy - logoCenterY;
        if (Math.sqrt(dx*dx + dy*dy) < 250) {
          hoverColor = config.LOGO_COLOR || hoverColor;
        }
      }

      const cell = new Cell(i, j, {
        background: hoverColor,
        forceElectrons: true,
        electronCount: isMove ? 2 : 4,
        electronOptions: { speed: 3, lifeTime: isMove ? 500 : 1000, color: hoverColor },
      });
      cell.paintNextTo(mainLayer);
    }

    const handlers = {
      touchend(e) {
        if (!(e instanceof TouchEvent)) { touchRecords = {}; return; }
        Array.from(e.changedTouches).forEach(({ identifier }) => { delete touchRecords[identifier]; });
        _pointerActive = false;
      },
      mouseout(e) {
        // Pointer left the browser window entirely
        if (!e.relatedTarget) _pointerActive = false;
      }
    };

    ["mousedown", "touchstart", "mousemove", "touchmove"].forEach((name) => {
      const isMove = /move/.test(name);
      const isTouch = /touch/.test(name);
      handlers[name] = (event) => {
        if (isTouch) {
          if (!(event instanceof TouchEvent)) return;
          Array.from(event.touches)
            .filter(({ identifier, clientX, clientY }) => {
              const rec = touchRecords[identifier];
              touchRecords[identifier] = { clientX, clientY };
              return !rec || clientX !== rec.clientX || clientY !== rec.clientY;
            })
            .forEach((t) => print(isMove, t));
          return;
        }
        if (!(event instanceof MouseEvent)) return;
        print(isMove, event);
      };
    });

    // Listen on the window so the effect works everywhere on the page,
    // even when the grid sits behind other content.
    const evtNames = Object.keys(handlers);
    evtNames.forEach((n) => window.addEventListener(n, handlers[n], { passive: true }));
    return () => evtNames.forEach((n) => window.removeEventListener(n, handlers[n]));
  }

  // ── Colour helpers for anti-aliasing ──────────────────────────────────
  function blendColor(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ── Shape rendering (text + optional logo) ─────────────────────────────
  function renderShapeToLayer(shapeLayer, text, logoImg) {
    const box = getShapeBox();
    const { width, height } = box;
    const isMobile = width < 768;
    const hasLogo = !!logoImg;

    // Compute layout regions using custom logo ratios
    const textCenterY = hasLogo ? (config.subText ? height * 0.62 : height * 0.68) : height / 2;

    shapeLayer.repaint((ctx) => {
      // Lay out in shape-box local coordinates
      ctx.translate(box.x, box.y);
      ctx.fillStyle = config.FONT_COLOR || "#ff007f";
      // ── Draw text ──
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = isMobile ? "4px" : "12px";

      if (isMobile && text === "Axeloft Interactive") {
        const lines = ["Axeloft", "Interactive"];
        ctx.font = `bold ${config.MAX_FONT_SIZE}px ${config.FONT_FAMILY}`;
        const maxMw = Math.max(
          ctx.measureText(lines[0]).width || 1,
          ctx.measureText(lines[1]).width || 1
        );
        const scale = width / maxMw;
        const fontSize = Math.min(config.MAX_FONT_SIZE, config.MAX_FONT_SIZE * scale * 0.75);
        ctx.font = `bold ${fontSize}px ${config.FONT_FAMILY}`;
        const lineSpacing = fontSize * 1.15;
        const baseY = hasLogo ? textCenterY : height / 2;
        ctx.fillText(lines[0], width / 2, baseY - lineSpacing / 2);
        ctx.fillText(lines[1], width / 2, baseY + lineSpacing / 2);
      } else {
        ctx.font = `bold ${config.MAX_FONT_SIZE}px ${config.FONT_FAMILY}`;
        const mw = ctx.measureText(text).width || 1;
        const scale = width / mw;
        const fontSize = Math.min(config.MAX_FONT_SIZE, config.MAX_FONT_SIZE * scale * 0.8);
        ctx.font = `bold ${fontSize}px ${config.FONT_FAMILY}`;
        ctx.fillText(text, width / 2, textCenterY);
      }

      if (config.subText) {
        ctx.save();
        ctx.font = `bold ${config.MAX_FONT_SIZE}px ${config.FONT_FAMILY}`;
        const smw = ctx.measureText(config.subText).width || 1;
        const sscale = width / smw;
        const subFontSize = Math.min(config.MAX_FONT_SIZE * 0.5, config.MAX_FONT_SIZE * sscale * 0.5);
        ctx.font = `bold ${subFontSize}px ${config.FONT_FAMILY}`;
        ctx.letterSpacing = isMobile ? "2px" : "6px";
        
        const subTextY = height * 0.78;
        ctx.fillText(config.subText, width / 2, subTextY);
        
        if (config.subTextUnderline) {
          const textWidth = ctx.measureText(config.subText).width;
          const startX = (width - textWidth) / 2;
          const endX = startX + textWidth;
          const lineY = subTextY + subFontSize * 0.7;
          
          ctx.strokeStyle = "#ffb700";
          ctx.lineWidth = Math.max(2, subFontSize * 0.08);
          ctx.beginPath();
          ctx.moveTo(startX, lineY);
          ctx.lineTo(endX, lineY);
          ctx.stroke();
        }
        ctx.restore();
      }
    });
  }

  function getShapeMatrix(shapeLayer, text, logoImg) {
    const { width, height } = shapeLayer;
    const useAA = config.logoAntiAlias;

    // Render everything to the shape layer
    renderShapeToLayer(shapeLayer, text, logoImg);

    const CD = config.CELL_DISTANCE;
    const box = getShapeBox();

    // Only sample the rows covered by the shape box (aligned to the grid)
    const y0 = Math.max(0, Math.floor(box.y / CD) * CD);
    const y1 = Math.min(height, box.y + box.height);
    if (y1 <= y0 || width <= 0) return [];

    const pixels = shapeLayer.context.getImageData(0, y0, width, y1 - y0).data;
    const cells = []; // Each entry: { row, col, alpha, cellSize, cellDistance, isLogo, color }

    // Sample at the normal grid
    for (let y = y0; y < y1; y += CD) {
      for (let x = 0; x < width; x += CD) {
        const idx = (x + (y - y0) * width) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const alpha = pixels[idx + 3] / 255;
        if (alpha <= 0) continue;

        cells.push({
          row: Math.floor(y / CD),
          col: Math.floor(x / CD),
          alpha: useAA ? alpha : 1,
          cellSize: config.CELL_SIZE,
          cellDistance: CD,
          isLogo: false, // Ensure text cells are not marked as logo
          color: rgbToHex(r, g, b)
        });
      }
    }

    return cells;
  }

  function printShape(shapeLayer, text, logoImg, clear = true) {
    if (clear) PINNED_CELLS.length = 0;
    const cells = getShapeMatrix(shapeLayer, text, logoImg);
    const useAA = config.logoAntiAlias;

    const { x: logoCenterX, y: logoCenterY } = getLogoCenter();

    if (logoImg && _logoOriginalW) {
      const { width, height } = shapeLayer;
      const { logoW, logoH } = getLogoSize();

      const maxScale = 1.35;
      const pad = config.logoGridTransition ? config.CELL_DISTANCE * 3 : 0;
      const boxW = logoW * maxScale + pad * 2;
      const boxH = logoH * maxScale + pad * 2;
      
      const x1 = logoCenterX - boxW / 2;
      const y1 = logoCenterY - boxH / 2;
      const x2 = logoCenterX + boxW / 2;
      const y2 = logoCenterY + boxH / 2;
      
      const useNestedGrid = config.logoGridSize != null && config.logoGridSize > 0;
      const logoCellSize = useNestedGrid ? Math.max(1, Math.round(config.CELL_SIZE / config.logoGridSize)) : config.CELL_SIZE;
      const logoBorderWidth = useNestedGrid ? Math.max(1, Math.round(config.BORDER_WIDTH / config.logoGridSize)) : config.BORDER_WIDTH;
      const logoCellDist = logoCellSize + logoBorderWidth;

      for (let y = Math.max(0, Math.floor(y1)); y < Math.min(height, y2); y += logoCellDist) {
        for (let x = Math.max(0, Math.floor(x1)); x < Math.min(width, x2); x += logoCellDist) {
           cells.push({
             row: y, // pixel coordinate
             col: x,
             alpha: 0,
             cellSize: logoCellSize,
             cellDistance: logoCellDist,
             isPixelCoord: true,
             isLogo: true
           });
        }
      }
    }

    const shuffledCells = shuffle(cells);

    shuffledCells.forEach((c) => {
      const activeColor = c.isLogo && config.LOGO_COLOR ? config.LOGO_COLOR : (c.color || config.FONT_COLOR);
      const rgb = hexToRgb(activeColor);

      const bg = useAA && c.alpha < 1
        ? `rgba(${rgb.r},${rgb.g},${rgb.b},${c.alpha})`
        : activeColor;

      const eColor = useAA && c.alpha < 1
        ? `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, c.alpha * 1.5)})`
        : activeColor;

      let row, col;
      if (c.isPixelCoord) {
        row = c.row;
        col = c.col;
      } else {
        row = c.row;
        col = c.col;
      }

      const cellDist = c.isPixelCoord ? 1 : c.cellDistance;
      const startX = col * cellDist;
      const startY = row * cellDist;

      const cell = new Cell(row, col, {
        background: bg,
        electronCount: c.isLogo ? 0 : (Math.random() > 0.9 ? 1 : 0),
        electronOptions: { speed: 2, color: eColor, lifeTime: 300 + randomInt(0, 200) },
        cellSize: c.cellSize,
        cellDistance: c.cellDistance,
      });

      if (c.isPixelCoord) {
        cell.startX = col;
        cell.startY = row;
      }

      if (c.isLogo) {
        cell.isLogo = true;
        cell.baseOffsetX = cell.startX - logoCenterX;
        cell.baseOffsetY = cell.startY - logoCenterY;
        cell.baseBackground = bg;
        cell.alpha = 0;
        cell.wasActive = false;
      } else {
        cell.alpha = c.alpha;
      }

      cell.scheduleUpdate(200);
      cell.pin();
    });
  }

  // ── Dynamic logo interaction update ───────────────────────────────────
  function updateLogoInteractions() {
    if (!_shapeLayer) return;
    const { x: logoCenterX, y: logoCenterY } = getLogoCenter();

    let targetScale = 1.0;
    let targetColorHex = config.LOGO_COLOR || config.FONT_COLOR;
    let isCurrentlyHovered = false;

    if (_pointerActive && config.logoSrc) {
      const dx = _pointerX - logoCenterX;
      const dy = _pointerY - logoCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const radius = 250;
      if (distance < radius) {
        isCurrentlyHovered = true;
        const t = 1.0 - distance / radius; // 0 (far) to 1 (close)
        targetScale = 1.0 + 0.35 * t; // scale up to 1.35x
        if (!config.logoColorStatic) {
          targetColorHex = config.LOGO_HOVER_COLOR || "#ff007f"; // Hover target (Pink)
        }
      }
    }

    // Toggle color loadout on mouse exit / leave:
    if (_wasHovered && !isCurrentlyHovered && !config.logoColorStatic) {
      if (config.LOGO_COLOR === "#00f0ff") {
        config.LOGO_COLOR = "#ffb700"; // Switch from Cyan to Amber
      } else {
        config.LOGO_COLOR = "#00f0ff"; // Switch from Amber to Cyan
      }
      
      const container = document.getElementById("hero");
      if (container) container.dispatchEvent(new CustomEvent('logo-color-switch'));
    }
    _wasHovered = isCurrentlyHovered;

    // Slow and smooth interpolation values (0.03 for gradual transitions)
    _currentLogoScale += (targetScale - _currentLogoScale) * 0.03;
    
    const targetRgb = hexToRgb(targetColorHex);
    if (!_currentLogoRgb) {
      _currentLogoRgb = { ...targetRgb };
    } else {
      _currentLogoRgb.r += (targetRgb.r - _currentLogoRgb.r) * 0.03;
      _currentLogoRgb.g += (targetRgb.g - _currentLogoRgb.g) * 0.03;
      _currentLogoRgb.b += (targetRgb.b - _currentLogoRgb.b) * 0.03;
    }

    const r = Math.round(_currentLogoRgb.r);
    const g = Math.round(_currentLogoRgb.g);
    const b = Math.round(_currentLogoRgb.b);

    const useAA = config.logoAntiAlias;
    const { logoW, logoH } = getLogoSize();

    PINNED_CELLS.forEach((cell) => {
      if (cell.isLogo) {
        if (!_logoImageData) return;
        
        const unscaledOffsetX = cell.baseOffsetX / _currentLogoScale;
        const unscaledOffsetY = cell.baseOffsetY / _currentLogoScale;
        
        const imgX = Math.floor((unscaledOffsetX + logoW / 2) / logoW * _logoOriginalW);
        const imgY = Math.floor((unscaledOffsetY + logoH / 2) / logoH * _logoOriginalH);

        let alpha = 0;
        if (imgX >= 0 && imgX < _logoOriginalW && imgY >= 0 && imgY < _logoOriginalH) {
          const idx = (imgY * _logoOriginalW + imgX) * 4 + 3;
          alpha = _logoImageData[idx] / 255;
        }

        if (config.logoGridTransition && alpha > 0) {
          const pad = config.CELL_DISTANCE * 3;
          const scaledLogoW = logoW * _currentLogoScale;
          const scaledLogoH = logoH * _currentLogoScale;
          const ix1 = logoCenterX - scaledLogoW / 2;
          const ix2 = logoCenterX + scaledLogoW / 2;
          const iy1 = logoCenterY - scaledLogoH / 2;
          const iy2 = logoCenterY + scaledLogoH / 2;

          let edgeDist = Math.min(
            cell.startX - ix1, ix2 - cell.startX,
            cell.startY - iy1, iy2 - cell.startY
          );

          if (edgeDist < 0) {
            const t = Math.max(0, 1 + edgeDist / pad);
            alpha *= t;
          }
        }

        cell.alpha = alpha;

        if (alpha > 0.05) {
          cell.background = useAA && alpha < 1
            ? `rgba(${r},${g},${b},${alpha})`
            : `rgb(${r},${g},${b})`;
            
          if (!cell.wasActive) {
            cell.wasActive = true;
            cell.electronCount = Math.random() > 0.95 ? 1 : 0;
            // Also color the electron with the current animated logo color!
            cell.electronOptions.color = cell.background;
          }
        } else {
          cell.background = "transparent";
          cell.electronCount = 0;
          cell.wasActive = false;
        }
      } else if (cell.isRainbow) {
        if (_currentLogoRgb) {
          const rr = Math.round(_currentLogoRgb.r);
          const gg = Math.round(_currentLogoRgb.g);
          const bb = Math.round(_currentLogoRgb.b);
          cell.background = `rgb(${rr},${gg},${bb})`;
        } else {
          cell.background = config.LOGO_COLOR || "#00f0ff";
        }
        cell.electronOptions.color = cell.background;
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────
  let _renderFrameId;
  let _unbindPointer;
  let _bgLayer, _mainLayer, _shapeLayer;
  let _isAlive = false;
  let _lastText = "";
  let _logoImg = null;
  let _logoOriginalW = 0;
  let _logoOriginalH = 0;
  let _logoImageData = null;
  let _nextRandomAt = 0;
  let _observer = null;
  let _isVisible = true;

  async function init(container, text = "Axeloft", options = {}) {
    if (_isAlive) return;

    config = { ...config, ...options };
    
    // Randomize logo color loadout between Cyan (#00f0ff) and Amber (#ffb700) if not specified
    if (config.LOGO_COLOR === null) {
      config.LOGO_COLOR = Math.random() > 0.5 ? "#00f0ff" : "#ffb700";
    }

    updateDerivedConfig();

    // Reset interactions
    _currentLogoScale = 1.0;
    _currentLogoRgb = null;
    _wasHovered = false;

    if (config.logoSrc) {
      try {
        _logoImg = await loadImage(config.logoSrc);
        _logoOriginalW = _logoImg.naturalWidth;
        _logoOriginalH = _logoImg.naturalHeight;
        if (_logoOriginalW > 0 && _logoOriginalH > 0) {
          const off = document.createElement("canvas");
          off.width = _logoOriginalW;
          off.height = _logoOriginalH;
          const octx = off.getContext("2d", { willReadFrequently: true });
          octx.drawImage(_logoImg, 0, 0);
          _logoImageData = octx.getImageData(0, 0, _logoOriginalW, _logoOriginalH).data;
        }
      } catch (e) {
        console.warn("PixelGrid: Failed to load logo:", e);
        _logoImg = null;
      }
    }

    const cs = getComputedStyle(container);
    if (cs.position === "static") container.style.position = "relative";

    _bgLayer = new ScopedCanvas(container);
    _mainLayer = new ScopedCanvas(container);
    _shapeLayer = new ScopedCanvas(container, true);

    function updateBackLinkPosition() {
      const backLink = document.getElementById("back-link");
      if (backLink && _shapeLayer) {
        const width = _shapeLayer.width;
        const height = _shapeLayer.height;
        const isMobile = width < 768;
        
        const tempCtx = _shapeLayer.context;
        tempCtx.save();
        tempCtx.font = `bold ${config.MAX_FONT_SIZE}px ${config.FONT_FAMILY}`;
        const subText = config.subText || "Back to homepage";
        const smw = tempCtx.measureText(subText).width || 1;
        const sscale = width / smw;
        const subFontSize = Math.min(config.MAX_FONT_SIZE * 0.5, config.MAX_FONT_SIZE * sscale * 0.5);
        tempCtx.restore();
        
        backLink.style.fontSize = `${subFontSize}px`;
        backLink.style.letterSpacing = isMobile ? "2px" : "6px";
        backLink.style.top = `${height * 0.78}px`;
      }
    }

    // bg layer's resize handler runs first, so refresh the shape box there
    _bgLayer.onResize(() => {
      computeShapeBox();
      drawGrid(_bgLayer);
    });
    _mainLayer.onResize(() => {
      prepaint();
      if (_lastText) printShape(_shapeLayer, _lastText, _logoImg);
      updateBackLinkPosition();
    });
    _shapeLayer.onResize(() => {
      if (_lastText) printShape(_shapeLayer, _lastText, _logoImg);
    });

    _mainLayer.renderIntoView();
    prepaint();

    _lastText = text;
    computeShapeBox();
    printShape(_shapeLayer, text, _logoImg);
    updateBackLinkPosition();

    function renderLoop() {
      if (!_isAlive || !_isVisible) return;
      // Apply mouse distance logic
      updateLogoInteractions();

      _mainLayer.blendBackground(_bgLayer.canvas);
      compactAndPaint(PINNED_CELLS, _mainLayer);
      if (_ghostRect) {
        _mainLayer.paint((ctx) => {
          drawGhostRect(ctx);
        });
      }
      drawElectronsBatch(_mainLayer);

      const now = Date.now();
      if (now >= _nextRandomAt) {
        _nextRandomAt = now + config.RANDOM_SPAWN_INTERVAL[0] +
          Math.floor(Math.random() * (config.RANDOM_SPAWN_INTERVAL[1] - config.RANDOM_SPAWN_INTERVAL[0] + 1));
        createRandomCell(_mainLayer);
      }

      _renderFrameId = requestAnimationFrame(renderLoop);
    }
    _isAlive = true;

    _observer = new IntersectionObserver((entries) => {
      _isVisible = entries[0].isIntersecting;
      if (_isVisible && _isAlive) {
        if (_renderFrameId !== undefined) cancelAnimationFrame(_renderFrameId);
        _renderFrameId = requestAnimationFrame(renderLoop);
      }
    });
    _observer.observe(container);

    _unbindPointer = handlePointer(container, _mainLayer);

    function prepaint() {
      drawGrid(_bgLayer);
      _mainLayer.paint((ctx, { width, height }) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
      });
      _mainLayer.blendBackground(_bgLayer.canvas);
    }
  }

  function destroy() {
    if (!_isAlive) return;
    if (_renderFrameId !== undefined) cancelAnimationFrame(_renderFrameId);
    if (_observer) _observer.disconnect();
    _unbindPointer?.();
    _bgLayer.remove();
    _mainLayer.remove();
    _shapeLayer.remove();
    ACTIVE_ELECTRONS.length = 0;
    PINNED_CELLS.length = 0;
    GLOW_SPRITES.clear();
    _isAlive = false;
    _logoImg = null;
    _shapeBox = null;
  }

  return { init, destroy, paintAt, eraseAt, paintRect, eraseRect, setGhostRect, exportState, importState, clearAll, printShape, getContainer, getConfig: () => config, addShape: (t, img) => { if(_shapeLayer) printShape(_shapeLayer, t, img, false); } };
})();

window.SandboxGrid = SandboxGrid;
window.PixelGrid = SandboxGrid;
