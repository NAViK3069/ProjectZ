// Draws the world straight onto the screen canvas at an integer zoom.
// Art pixels always land on whole device pixels (crisp), but positions can
// move in 1/scale steps so movement and the camera stay smooth.

export class Renderer {
  // fit: 'round' (nearest zoom) or 'floor' (never zoom in past showing viewWidth x viewHeight -
  // a slightly bigger window, e.g. fullscreen, doesn't jump to a narrower view)
  constructor(canvas, { viewHeight = 270, viewWidth = 360, fit = 'round' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.viewHeight = viewHeight;
    this.viewWidth = viewWidth;
    this.fit = fit;
    this.camera = { x: 0, y: 0 };
    this.shake = { x: 0, y: 0 };   // short camera kick (recoil etc), decays on its own
    this.left = 0;
    this.top = 0;
    this.snap = (v) => Math.round(v * this.scale) / this.scale;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.width = Math.round(innerWidth * this.dpr);
    this.height = Math.round(innerHeight * this.dpr);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.scale = Math.max(2, Math[this.fit === 'floor' ? 'floor' : 'round'](Math.min(this.height / this.viewHeight, this.width / this.viewWidth)));
    this.viewW = this.width / this.scale;
    this.viewH = this.height / this.scale;
    this.vignette = null;
  }

  kick(dx, dy) {
    this.shake.x += dx;
    this.shake.y += dy;
  }

  update(dt) {
    const k = Math.exp(-18 * dt);
    this.shake.x *= k;
    this.shake.y *= k;
  }

  // CSS pixel position on screen -> world position (as of the last frame).
  screenToWorld(cssX, cssY) {
    return {
      x: this.left + (cssX * this.dpr) / this.scale,
      y: this.top + (cssY * this.dpr) / this.scale,
    };
  }

  beginWorld() {
    const s = this.scale;
    this.left = this.camera.x + this.shake.x - this.viewW / 2;
    this.top = this.camera.y + this.shake.y - this.viewH / 2;
    this.ctx.setTransform(s, 0, 0, s, -Math.round(this.left * s), -Math.round(this.top * s));
    this.ctx.imageSmoothingEnabled = false;
  }

  beginScreen() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(color) {
    this.beginScreen();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawVignette() {
    const { ctx, width: w, height: h } = this;
    if (!this.vignette) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, 'rgba(10, 6, 18, 0)');
      g.addColorStop(1, 'rgba(10, 6, 18, 0.55)');
      this.vignette = g;
    }
    this.beginScreen();
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, w, h);
  }
}
