import { sample, SAMPLES } from './core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const IDS = ['copper', 'aluminum'];
const PLOT = { left: 34, right: 248, top: 17, bottom: 127, maxEnergyJ: 340 };
let nextChartId = 0;

/** A read-only view of the same bounded teaching calculation used by the samples. */
export function createComparisonView(host) {
  if (!host || typeof host.replaceChildren !== 'function' || !host.ownerDocument) {
    throw new TypeError('铜铝对照图需要一个 DOM 容器');
  }
  const document = host.ownerDocument;
  const chartId = `materials-comparison-${++nextChartId}`;
  const initialTemperatureC = SAMPLES.copper.initialTemperatureC;
  const limitTemperatureC = SAMPLES.copper.limitTemperatureC;
  const x = energy => PLOT.left + energy / PLOT.maxEnergyJ * (PLOT.right - PLOT.left);
  const y = temperature => PLOT.bottom - (temperature - initialTemperatureC) /
    (limitTemperatureC - initialTemperatureC) * (PLOT.bottom - PLOT.top);
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svgElement = (tag, attributes = {}, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const figure = element('figure', 'materials-comparison-view');
  const svg = svgElement('svg', {
    viewBox: '0 0 260 168', role: 'img',
    'aria-labelledby': `${chartId}-title`, 'aria-describedby': `${chartId}-description`,
    class: 'materials-comparison-view__chart',
  });
  const title = svgElement('title', { id: `${chartId}-title` });
  const description = svgElement('desc', { id: `${chartId}-description` });
  svg.append(title, description);

  const grid = svgElement('g', { class: 'materials-comparison-view__grid', 'aria-hidden': 'true' });
  for (const temperature of [25, 40, 60]) {
    grid.append(svgElement('line', { x1: PLOT.left, x2: PLOT.right, y1: y(temperature), y2: y(temperature) }));
    grid.append(svgElement('text', { x: PLOT.left - 6, y: y(temperature) + 3, 'text-anchor': 'end' }, String(temperature)));
  }
  for (const energy of [0, 100, 200, 300, 340]) {
    grid.append(svgElement('line', { x1: x(energy), x2: x(energy), y1: PLOT.top, y2: PLOT.bottom }));
    grid.append(svgElement('text', {
      x: x(energy), y: PLOT.bottom + 14,
      'text-anchor': energy === 340 ? 'end' : energy === 0 ? 'start' : 'middle',
    }, String(energy)));
  }
  grid.append(svgElement('text', { x: 7, y: 10 }, '°C'));
  grid.append(svgElement('text', { x: 141, y: 161, 'text-anchor': 'middle' }, '累计吸收热量 Q（J）'));
  svg.append(grid);

  const curves = svgElement('g', { 'aria-hidden': 'true' });
  const points = {};
  for (const id of IDS) {
    const spec = SAMPLES[id];
    const start = sample(id, 0), end = sample(id, spec.maxEnergyJ);
    const materialClass = `materials-comparison-view__${id}`;
    curves.append(svgElement('path', {
      d: `M ${x(0)} ${y(start.temperatureC)} L ${x(end.energyJ)} ${y(end.temperatureC)}`,
      class: `materials-comparison-view__curve ${materialClass}`,
    }));
    const point = svgElement(id === 'copper' ? 'circle' : 'rect', {
      class: `materials-comparison-view__point ${materialClass}`,
      ...(id === 'copper' ? { r: 3.7 } : { width: 8.6, height: 8.6, rx: .6 }),
    });
    const pointTitle = svgElement('title');
    point.append(pointTitle);
    points[id] = { point, title: pointTitle };
  }
  svg.append(curves);
  // Drawing the circle last keeps both shapes visible when the samples share a point.
  svg.append(points.aluminum.point, points.copper.point);
  figure.append(svg);

  const readings = element('div', 'materials-comparison-view__readings');
  const values = {};
  for (const id of IDS) {
    const row = element('div', `materials-comparison-view__reading materials-comparison-view__${id}`);
    row.append(element('span', 'materials-comparison-view__legend', `${SAMPLES[id].name}${id === 'copper' ? ' · 圆点' : ' · 方点'}`));
    values[id] = element('span', 'materials-comparison-view__value');
    row.append(values[id]);
    readings.append(row);
  }
  figure.append(readings, element('figcaption', 'materials-comparison-view__caption',
    '两份金属均为10 g、从25°C开始。曲线止于60°C，对照按所选热量提前停止。教学计算，非实测；冰不在此图中。'));
  host.replaceChildren(figure);

  function update({ energies }) {
    // Validate both inputs before updating any DOM; the view never changes the supplied state.
    const readings = Object.fromEntries(IDS.map(id => [id, sample(id, energies[id])]));
    const summary = [];
    for (const id of IDS) {
      const reading = readings[id], name = SAMPLES[id].name;
      const text = `${reading.temperatureC.toFixed(1)}°C · ${reading.energyJ.toFixed(1)} J`;
      values[id].textContent = text;
      points[id].title.textContent = `${name}：${text}`;
      if (id === 'copper') {
        points[id].point.setAttribute('cx', x(reading.energyJ));
        points[id].point.setAttribute('cy', y(reading.temperatureC));
      } else {
        points[id].point.setAttribute('x', x(reading.energyJ) - 4.3);
        points[id].point.setAttribute('y', y(reading.temperatureC) - 4.3);
      }
      summary.push(`${name}累计吸收 ${reading.energyJ.toFixed(1)} J，温度 ${reading.temperatureC.toFixed(1)}°C`);
    }
    title.textContent = `铜铝吸热与温升教学对照。${summary.join('；')}。`;
    description.textContent = '横轴为每份样品各自累计吸收的热量，范围 0 至 340 J；纵轴为温度，范围 25 至 60°C。' +
      `铜实线止于 ${SAMPLES.copper.maxEnergyJ.toFixed(1)} J，铝虚线止于 ${SAMPLES.aluminum.maxEnergyJ.toFixed(1)} J，均不外推超过 60°C。` +
      '铜圆点和铝方点表示当前状态。相同热量下铜的温升更大；只有两点横坐标相同时，才表示同热量对照。图为理想教学计算，非实测，冰不在图中。';
  }

  update({ energies: { copper: 0, aluminum: 0 } });
  return { update };
}
