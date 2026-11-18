// Keyboard + mouse state. `pressed` is edge-triggered: a code appears there
// exactly once per physical keydown (e.repeat is ignored), which makes the
// pause toggle safe — one press can never toggle twice in a frame.
export function makeInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),
    mouse: { x: 0, y: 0, down: false, clicked: false },
    attach() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        input.keys.add(e.code);
        input.pressed.add(e.code);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => input.keys.delete(e.code));
      window.addEventListener('blur', () => input.keys.clear());
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        input.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
        input.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
      });
      canvas.addEventListener('mousedown', (e) => {
        input.mouse.down = true;
        input.mouse.clicked = true;
        const r = canvas.getBoundingClientRect();
        input.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
        input.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
      });
      window.addEventListener('mouseup', () => { input.mouse.down = false; });
    },
    down(code) { return input.keys.has(code); },
    wasPressed(code) { return input.pressed.has(code); },
    axis() {
      let x = 0, y = 0;
      if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
      if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
      if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) y -= 1;
      if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) y += 1;
      return { x, y };
    },
    endFrame() {
      input.pressed.clear();
      input.mouse.clicked = false;
    },
  };
  return input;
}
