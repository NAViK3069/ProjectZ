// Keyboard + mouse on desktop; two floating virtual sticks on touch screens
// (left half = move, right half = aim and fire).

const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F3', 'Tab']);
const STICK_RADIUS = 56;   // css px
const STICK_DEADZONE = 0.18;

class Stick {
  constructor() {
    this.id = null;
    this.ox = this.oy = this.x = this.y = 0;
  }

  get active() {
    return this.id !== null;
  }

  start(e) {
    this.id = e.pointerId;
    this.ox = this.x = e.clientX;
    this.oy = this.y = e.clientY;
  }

  move(e) {
    this.x = e.clientX;
    this.y = e.clientY;
    // let the base follow the thumb when it drags past the rim
    const dx = this.x - this.ox, dy = this.y - this.oy, d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      this.ox = this.x - (dx / d) * STICK_RADIUS;
      this.oy = this.y - (dy / d) * STICK_RADIUS;
    }
  }

  // null when not held; otherwise a direction with length 0..1
  vector() {
    if (!this.active) return null;
    const dx = this.x - this.ox, dy = this.y - this.oy, d = Math.hypot(dx, dy);
    const m = Math.min(1, d / STICK_RADIUS);
    if (m < STICK_DEADZONE) return { x: 0, y: 0 };
    return { x: (dx / d) * m, y: (dy / d) * m };
  }

  draw(ctx, dpr) {
    if (!this.active) return;
    const r = STICK_RADIUS * dpr;
    ctx.save();
    ctx.lineWidth = 3 * dpr;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath();
    ctx.arc(this.ox * dpr, this.oy * dpr, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.beginPath();
    ctx.arc(this.x * dpr, this.y * dpr, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();   // keys that went down since the last endFrame()
    this.wheel = 0;
    this.moveStick = new Stick();
    this.aimStick = new Stick();
    // mouse.active: the player has used the mouse, so it drives aiming
    this.mouse = { x: 0, y: 0, active: false, down: false };
    this.usingTouch = false;    // last input came from a touch screen

    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.usingTouch = false;
      this.keys.add(e.code);
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.moveStick.id = this.aimStick.id = null;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.trackMouse(e);
        if (e.button === 0) {
          this.mouse.down = true;
          this.pressed.add('Mouse0');
        }
        if (e.button === 2) this.pressed.add('Mouse2');
        return;
      }
      this.pressed.add('Touch');
      this.mouse.active = false;
      this.usingTouch = true;
      if (this.onTap?.(e.clientX, e.clientY)) return;   // on-screen buttons take the tap
      const stick = e.clientX < innerWidth / 2 ? this.moveStick : this.aimStick;
      if (stick.active) return;
      stick.start(e);
      canvas.setPointerCapture(e.pointerId);
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return this.trackMouse(e);
      for (const s of [this.moveStick, this.aimStick]) if (s.id === e.pointerId) s.move(e);
    });
    const release = (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) {
        this.mouse.down = false;
        this.pressed.add('Mouse0Up');
      }
      for (const s of [this.moveStick, this.aimStick]) if (s.id === e.pointerId) s.id = null;
    };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
  }

  trackMouse(e) {
    this.usingTouch = false;
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.active = true;
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  wasPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  // Call once at the end of each frame.
  endFrame() {
    this.pressed.clear();
    this.wheel = 0;
  }

  // Returns a direction with length 0..1.
  moveVector() {
    const v = this.moveStick.vector();
    if (v) return v;
    let x = 0, y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y -= 1;
    if (this.down('KeyS', 'ArrowDown')) y += 1;
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  // Touch aim stick direction, or null when it isn't held.
  aimVector() {
    return this.aimStick.vector();
  }

  drawSticks(ctx, dpr) {
    this.moveStick.draw(ctx, dpr);
    this.aimStick.draw(ctx, dpr);
  }
}
