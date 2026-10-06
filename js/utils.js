// utils.js — funções auxiliares usadas em todo o app.
// Mantidas sem dependências externas de propósito (app 100% offline).

/** Gera um ID curto e razoavelmente único (não precisa de criptografia aqui). */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Retorna a data de hoje no formato 'YYYY-MM-DD' (fuso horário local). */
export function todayISO() {
  return dateToISO(new Date());
}

/** Converte um objeto Date para 'YYYY-MM-DD' usando o fuso horário local. */
export function dateToISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converte 'YYYY-MM-DD' para um objeto Date à meia-noite local. */
export function isoToDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Diferença em dias inteiros entre duas datas ISO (b - a). */
export function diffDays(isoA, isoB) {
  const a = isoToDate(isoA);
  const b = isoToDate(isoB);
  const ms = b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

/** Soma/subtrai dias a uma data ISO, retornando nova data ISO. */
export function addDays(iso, days) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToISO(d);
}

/** Formata 'YYYY-MM-DD' como "5 de out" ou, se pedir ano, "5 de out de 2026". */
export function formatDatePt(iso, withYear = false) {
  const d = isoToDate(iso);
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const base = `${d.getDate()} de ${meses[d.getMonth()]}`;
  return withYear ? `${base} de ${d.getFullYear()}` : base;
}

/** Nome do dia da semana abreviado, ex: 'dom', 'seg'... */
export function weekdayShort(iso) {
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return dias[isoToDate(iso).getDay()];
}

/** Clamp simples. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Arredonda para 1 casa decimal, removendo zero desnecessário. */
export function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Formata número com separador de milhar pt-BR. */
export function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n);
}

/** Pequeno helper para criar elementos DOM com atributos e filhos. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Converte um File (imagem) para base64 (sem prefixo data:) e devolve também o mediaType. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // "data:image/jpeg;base64,...."
      const [header, data] = result.split(',');
      const mediaType = header.match(/data:(.*);base64/)?.[1] || file.type || 'image/jpeg';
      resolve({ data, mediaType });
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Redimensiona e comprime uma imagem (File ou base64 dataURL) usando canvas,
 * para não estourar o limite de espaço do localStorage.
 * Retorna um dataURL JPEG já comprimido.
 */
export function compressImage(file, maxDim = 1024, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao processar a imagem.'));
    };
    img.src = url;
  });
}

/** Debounce simples. */
export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Abre um overlay (bottom sheet no mobile ou dialog centralizado) no #overlay-root.
 * `buildContent(close)` deve devolver um elemento DOM (o conteúdo do sheet/dialog);
 * recebe `close` para poder fechar a si mesmo após uma ação (ex.: salvar).
 * Retorna a função `close`.
 */
export function openOverlay(buildContent, { kind = 'sheet' } = {}) {
  const root = document.getElementById('overlay-root');
  const overlay = el('div', { class: `overlay ${kind === 'dialog' ? 'overlay--center' : ''}` });

  function close() {
    overlay.classList.remove('is-open');
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', onKeydown);
  }
  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const inner = buildContent(close);
  inner.classList.add(kind === 'dialog' ? 'dialog' : 'sheet');
  overlay.append(inner);
  root.append(overlay);
  document.addEventListener('keydown', onKeydown);
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  return close;
}

/** Mostra um toast simples no rodapé da tela. */
export function toast(message, type = 'info') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const node = el('div', { class: `toast toast--${type}` }, message);
  host.append(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 250);
  }, 3200);
}
