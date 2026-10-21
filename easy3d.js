// Easy 3D - a tiny dependency-free 3D engine for Gandi IDE / Scratch.
// Draws flat-shaded shapes on a 2D canvas, so it needs no libraries.
(function (Scratch) {
  'use strict';

  // ---------- tiny vector math ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  function norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  const rad = d => (d * Math.PI) / 180;
  const num = v => Number(v) || 0;

  function rotate(v, r) {
    let [x, y, z] = v;
    let c = Math.cos(rad(r[0])), s = Math.sin(rad(r[0]));
    [y, z] = [y * c - z * s, y * s + z * c]; // around X
    c = Math.cos(rad(r[1])); s = Math.sin(rad(r[1]));
    [x, z] = [x * c + z * s, -x * s + z * c]; // around Y
    c = Math.cos(rad(r[2])); s = Math.sin(rad(r[2]));
    [x, y] = [x * c - y * s, x * s + y * c]; // around Z
    return [x, y, z];
  }

  function parseColor(hex) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return Number.isNaN(n) ? [200, 200, 200] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ---------- shapes (unit size, centered on origin) ----------
  const SHAPES = {
    cube: {
      v: [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],
      f: [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]]
    },
    pyramid: {
      v: [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,.5,0]],
      f: [[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]]
    },
    plane: {
      v: [[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5]],
      f: [[0,1,2,3]]
    }
  };

  // ---------- scene state ----------
  const objects = new Map();
  const cam = { pos: [0, 1.5, -6], target: [0, 0, 0], fov: 60 };
  const LIGHT = norm([0.4, 0.8, -0.5]);
  let bg = '#1a1a2e';
  let canvas = null;
  let ctx = null;
  let rafId = 0;

  function ensureCanvas(w, h) {
    try {
      if (typeof document === 'undefined') return false;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.cssText =
          'position:fixed;right:12px;bottom:12px;z-index:99999;' +
          'border:2px solid #4C97FF;border-radius:6px;pointer-events:none;';
        canvas.width = 480;
        canvas.height = 360;
        ctx = canvas.getContext('2d');
        if (!ctx) { canvas = null; return false; }
      }
      if (w && h) { canvas.width = w; canvas.height = h; }
      if (!canvas.isConnected) document.body.appendChild(canvas);
      return true;
    } catch (e) {
      return false;
    }
  }

  function render() {
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // camera basis
    const f = norm(sub(cam.target, cam.pos));
    let r = cross(f, [0, 1, 0]);
    if (Math.hypot(r[0], r[1], r[2]) < 1e-6) r = [1, 0, 0];
    r = norm(r);
    const u = cross(r, f);
    const focal = (H / 2) / Math.tan(rad(cam.fov / 2));

    const toCam = p => {
      const d = sub(p, cam.pos);
      return [dot(d, r), dot(d, u), dot(d, f)];
    };

    const polys = [];
    for (const o of objects.values()) {
      const shape = SHAPES[o.shape];
      const world = shape.v.map(v => {
        const s = rotate([v[0] * o.size, v[1] * o.size, v[2] * o.size], o.rot);
        return [s[0] + o.pos[0], s[1] + o.pos[1], s[2] + o.pos[2]];
      });
      const cv = world.map(toCam);
      for (const face of shape.f) {
        if (face.some(i => cv[i][2] < 0.1)) continue; // behind camera
        let n = norm(cross(sub(world[face[1]], world[face[0]]), sub(world[face[2]], world[face[0]])));
        const center = face.reduce((a, i) => [a[0] + world[i][0], a[1] + world[i][1], a[2] + world[i][2]], [0, 0, 0])
          .map(x => x / face.length);
        if (dot(n, sub(center, cam.pos)) > 0) n = [-n[0], -n[1], -n[2]]; // face the camera
        const b = 0.3 + 0.7 * Math.max(0, dot(n, LIGHT));
        const depth = face.reduce((a, i) => a + cv[i][2], 0) / face.length;
        polys.push({
          depth,
          color: `rgb(${Math.round(o.color[0] * b)},${Math.round(o.color[1] * b)},${Math.round(o.color[2] * b)})`,
          pts: face.map(i => [W / 2 + (cv[i][0] / cv[i][2]) * focal, H / 2 - (cv[i][1] / cv[i][2]) * focal])
        });
      }
    }

    polys.sort((a, b) => b.depth - a.depth); // painter's algorithm: far to near
    for (const p of polys) {
      ctx.beginPath();
      ctx.moveTo(p.pts[0][0], p.pts[0][1]);
      for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
    }
  }

  function loop() {
    render();
    rafId = requestAnimationFrame(loop);
  }

  const getObj = name => objects.get(String(name));

  class Easy3D {
    getInfo() {
      const xyz = d => ({
        X: { type: Scratch.ArgumentType.NUMBER, defaultValue: d[0] },
        Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: d[1] },
        Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: d[2] }
      });
      const NAME = { type: Scratch.ArgumentType.STRING, defaultValue: 'box' };
      return {
        id: 'easy3d',
        name: 'Easy 3D',
        color1: '#7B5CFF',
        blocks: [
          {
            opcode: 'showView',
            blockType: Scratch.BlockType.COMMAND,
            text: 'show 3D view [W] by [H]',
            arguments: {
              W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 480 },
              H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 360 }
            }
          },
          { opcode: 'hideView', blockType: Scratch.BlockType.COMMAND, text: 'hide 3D view' },
          { opcode: 'available', blockType: Scratch.BlockType.BOOLEAN, text: '3D view available?' },
          '---',
          {
            opcode: 'addShape',
            blockType: Scratch.BlockType.COMMAND,
            text: 'add [SHAPE] named [NAME]',
            arguments: {
              SHAPE: { type: Scratch.ArgumentType.STRING, menu: 'shapes', defaultValue: 'cube' },
              NAME
            }
          },
          {
            opcode: 'setPos',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set [NAME] position x [X] y [Y] z [Z]',
            arguments: { NAME, ...xyz([0, 0, 0]) }
          },
          {
            opcode: 'setRot',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set [NAME] rotation x [X] y [Y] z [Z]',
            arguments: { NAME, ...xyz([0, 0, 0]) }
          },
          {
            opcode: 'turn',
            blockType: Scratch.BlockType.COMMAND,
            text: 'turn [NAME] by x [X] y [Y] z [Z]',
            arguments: { NAME, ...xyz([0, 1, 0]) }
          },
          {
            opcode: 'setSize',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set [NAME] size to [SIZE]',
            arguments: { NAME, SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
          },
          {
            opcode: 'setColor',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set [NAME] color to [COLOR]',
            arguments: { NAME, COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ff6644' } }
          },
          { opcode: 'removeObj', blockType: Scratch.BlockType.COMMAND, text: 'remove [NAME]', arguments: { NAME } },
          { opcode: 'clearAll', blockType: Scratch.BlockType.COMMAND, text: 'remove all shapes' },
          '---',
          {
            opcode: 'camPos',
            blockType: Scratch.BlockType.COMMAND,
            text: 'move camera to x [X] y [Y] z [Z]',
            arguments: xyz([0, 1.5, -6])
          },
          {
            opcode: 'camLook',
            blockType: Scratch.BlockType.COMMAND,
            text: 'point camera at x [X] y [Y] z [Z]',
            arguments: xyz([0, 0, 0])
          },
          {
            opcode: 'setBg',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set 3D background to [COLOR]',
            arguments: { COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#1a1a2e' } }
          },
          '---',
          { opcode: 'renderNow', blockType: Scratch.BlockType.COMMAND, text: 'render 3D' },
          {
            opcode: 'auto',
            blockType: Scratch.BlockType.COMMAND,
            text: 'turn auto render [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'onoff', defaultValue: 'on' } }
          }
        ],
        menus: {
          shapes: { acceptReporters: true, items: Object.keys(SHAPES) },
          onoff: { acceptReporters: false, items: ['on', 'off'] }
        }
      };
    }

    showView(a) {
      if (ensureCanvas(Math.max(64, num(a.W)), Math.max(64, num(a.H)))) render();
    }
    hideView() {
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    available() {
      return ensureCanvas();
    }

    addShape(a) {
      const shape = SHAPES[a.SHAPE] ? a.SHAPE : 'cube';
      objects.set(String(a.NAME), { shape, pos: [0, 0, 0], rot: [0, 0, 0], size: 1, color: [255, 102, 68] });
    }
    setPos(a) { const o = getObj(a.NAME); if (o) o.pos = [num(a.X), num(a.Y), num(a.Z)]; }
    setRot(a) { const o = getObj(a.NAME); if (o) o.rot = [num(a.X), num(a.Y), num(a.Z)]; }
    turn(a) {
      const o = getObj(a.NAME);
      if (o) o.rot = [o.rot[0] + num(a.X), o.rot[1] + num(a.Y), o.rot[2] + num(a.Z)];
    }
    setSize(a) { const o = getObj(a.NAME); if (o) o.size = num(a.SIZE); }
    setColor(a) { const o = getObj(a.NAME); if (o) o.color = parseColor(a.COLOR); }
    removeObj(a) { objects.delete(String(a.NAME)); }
    clearAll() { objects.clear(); }

    camPos(a) { cam.pos = [num(a.X), num(a.Y), num(a.Z)]; }
    camLook(a) { cam.target = [num(a.X), num(a.Y), num(a.Z)]; }
    setBg(a) { bg = String(a.COLOR); }

    renderNow() { render(); }
    auto(a) {
      if (a.STATE === 'on') {
        if (!rafId && typeof requestAnimationFrame !== 'undefined') loop();
      } else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
  }

  Scratch.extensions.register(new Easy3D());
})(Scratch);
