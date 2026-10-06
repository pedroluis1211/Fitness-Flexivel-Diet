// charts.js — gráfico de linha simples, desenhado à mão em SVG.
// Sem bibliotecas externas: mantém o app leve e 100% offline.

import { el, formatDatePt, round1 } from './utils.js';

/**
 * Constrói um elemento <div> contendo um gráfico de linha em SVG.
 * @param {Array<{date:string, value:number}>} points dados ordenados por data (ISO)
 * @param {object} opts { color, height, unit }
 */
export function lineChart(points, opts = {}) {
  const { height = 180, unit = '' } = opts;
  const width = 320; // viewBox lógico; o SVG escala 100% via CSS

  if (!points || points.length === 0) {
    return el('div', { class: 'chart-empty' }, 'Sem dados suficientes ainda. Registre pelo menos duas medições.');
  }
  if (points.length === 1) {
    return el('div', { class: 'chart-empty' }, `Só há um registro até agora: ${round1(points[0].value)}${unit} em ${formatDatePt(points[0].date)}. Registre outro para ver a evolução.`);
  }

  const padding = { top: 18, right: 14, bottom: 22, left: 14 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (minY === maxY) { minY -= 1; maxY += 1; } // evita divisão por zero numa linha reta
  // uma margem de respiro de 10% no topo/base
  const span = maxY - minY;
  minY -= span * 0.1;
  maxY += span * 0.1;

  const scaleX = (i) => padding.left + (i / (points.length - 1)) * innerW;
  const scaleY = (v) => padding.top + innerH - ((v - minY) / (maxY - minY)) * innerH;

  const linePoints = points.map((p, i) => `${scaleX(i).toFixed(1)},${scaleY(p.value).toFixed(1)}`);
  const pathD = 'M ' + linePoints.join(' L ');
  const areaD = `${pathD} L ${scaleX(points.length - 1).toFixed(1)},${(height - padding.bottom).toFixed(1)} L ${scaleX(0).toFixed(1)},${(height - padding.bottom).toFixed(1)} Z`;

  const dots = points.map((p, i) => {
    const isEdge = i === 0 || i === points.length - 1;
    return `<circle cx="${scaleX(i).toFixed(1)}" cy="${scaleY(p.value).toFixed(1)}" r="${isEdge ? 3.5 : 2.5}" fill="var(--accent)" />`;
  }).join('');

  const firstLabel = formatDatePt(points[0].date);
  const lastLabel = formatDatePt(points[points.length - 1].date);

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Gráfico de evolução">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#chartFill)" stroke="none" />
      <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      <text x="${padding.left}" y="${height - 4}" font-size="9" fill="var(--text-muted)">${firstLabel}</text>
      <text x="${width - padding.right}" y="${height - 4}" font-size="9" fill="var(--text-muted)" text-anchor="end">${lastLabel}</text>
      <text x="${padding.left}" y="${padding.top - 4}" font-size="10" fill="var(--text)" font-weight="700">${round1(Math.max(...values))}${unit}</text>
    </svg>`;

  const wrap = el('div', { class: 'chart-wrap', html: svg });
  return wrap;
}
