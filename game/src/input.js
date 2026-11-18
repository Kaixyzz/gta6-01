// input.js — keyboard and mouse state for SOLARA BAY.
// Tracks held keys, edge-triggered presses (consumed once per frame), and the
// mouse position in screen and world coordinates.

export class Input {
  constructor(canvas, onGesture) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this._gesture = onGesture || (() => {});

    window.addEventListener('keydown', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(k);
      this.keys.add(k);
      this._gesture();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
      this._gesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
  }

  // True while the key is held (case-insensitive single letters).
  held(...names) {
    return names.some((n) => this.keys.has(n));
  }

  // True only on the frame the key went down.
  wasPressed(...names) {
    return names.some((n) => this.pressed.has(n));
  }

  // Movement axes from WASD / arrows: -1, 0 or 1 each.
  axes() {
    let x = 0;
    let y = 0;
    if (this.held('a', 'ArrowLeft')) x -= 1;
    if (this.held('d', 'ArrowRight')) x += 1;
    if (this.held('w', 'ArrowUp')) y -= 1;
    if (this.held('s', 'ArrowDown')) y += 1;
    return { x, y };
  }

  // Call at the end of each frame: edge triggers live for one frame only.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
