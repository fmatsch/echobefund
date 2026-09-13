// 17-Segment-Bullseye (AHA) für regionale Wandbewegungsstörungen.
// Klick: nächster Zustand, Rechtsklick: zurück auf normal.
(function () {
  const { SEGMENTS, WMA_STATES } = window.EchoSchema;
  const NS = 'http://www.w3.org/2000/svg';
  const C = 120;
  // Ringe: [innerer Radius, äußerer Radius, Mittelwinkel je Segment (math., 90° = oben), Spannweite]
  const RINGS = [
    { from: 0, r0: 82, r1: 114, centers: [90, 150, 210, 270, 330, 30], span: 60 },  // basal 1–6
    { from: 6, r0: 52, r1: 82, centers: [90, 150, 210, 270, 330, 30], span: 60 },   // mittventrikulär 7–12
    { from: 12, r0: 22, r1: 52, centers: [90, 180, 270, 0], span: 90 },              // apikal 13–16
  ];

  const pt = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [C + r * Math.cos(a), C - r * Math.sin(a)];
  };

  function sectorPath(r0, r1, a1, a2) {
    const [x1, y1] = pt(r1, a1), [x2, y2] = pt(r1, a2), [x3, y3] = pt(r0, a2), [x4, y4] = pt(r0, a1);
    return `M${x1},${y1} A${r1},${r1} 0 0 0 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 1 ${x4},${y4} Z`;
  }

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  function render(container, getSegments, onChange) {
    container.textContent = '';
    container.classList.add('wma');
    const svg = el('svg', { viewBox: '0 0 240 240', role: 'img', 'aria-label': '17-Segment-Modell' });
    const shapes = [];

    const addShape = (shape, idx, labelPt) => {
      const title = el('title', {});
      shape.appendChild(title);
      shape.addEventListener('click', () => cycle(idx, 1));
      shape.addEventListener('contextmenu', (e) => { e.preventDefault(); set(idx, 'normal'); });
      svg.appendChild(shape);
      const num = el('text', { x: labelPt[0], y: labelPt[1] + 3, 'text-anchor': 'middle', class: 'seg-num' });
      num.textContent = idx + 1;
      svg.appendChild(num);
      shapes[idx] = { shape, title };
    };

    for (const ring of RINGS) {
      ring.centers.forEach((c, i) => {
        const idx = ring.from + i;
        const shape = el('path', { d: sectorPath(ring.r0, ring.r1, c - ring.span / 2, c + ring.span / 2) });
        addShape(shape, idx, pt((ring.r0 + ring.r1) / 2, c));
      });
    }
    addShape(el('circle', { cx: C, cy: C, r: 22 }), 16, [C, C]);

    for (const [txt, x, y] of [['anterior', 120, 4], ['inferior', 120, 240], ['septal', 2, 123], ['lateral', 238, 123]]) {
      const t = el('text', { x, y, 'text-anchor': x < 20 ? 'start' : x > 220 ? 'end' : 'middle' });
      t.textContent = txt;
      svg.appendChild(t);
    }

    const legend = document.createElement('div');
    legend.className = 'wma-legend';
    for (const s of WMA_STATES) {
      const span = document.createElement('span');
      span.className = `st-${s}`;
      span.textContent = s;
      legend.appendChild(span);
    }
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Klick: nächster Zustand · Rechtsklick: normal';
    legend.appendChild(hint);

    container.append(svg, legend);

    function set(idx, state) {
      const segs = { ...getSegments() };
      if (state === 'normal') delete segs[idx];
      else segs[idx] = state;
      onChange(segs);
      update();
    }
    function cycle(idx) {
      const cur = getSegments()[idx] || 'normal';
      set(idx, WMA_STATES[(WMA_STATES.indexOf(cur) + 1) % WMA_STATES.length]);
    }
    function update() {
      const segs = getSegments();
      shapes.forEach(({ shape, title }, idx) => {
        const state = segs[idx] || 'normal';
        shape.setAttribute('class', `st-${state}`);
        title.textContent = `${idx + 1}: ${SEGMENTS[idx]} – ${state}`;
      });
    }
    update();
    return { update };
  }

  window.EchoBullseye = { render };
})();
