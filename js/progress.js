// progress.js — aba "Progresso": registro de peso/medidas/fotos, gráficos
// de evolução e comparação "início vs. atual".

import { el, todayISO, formatDatePt, round1, openOverlay, toast, compressImage } from './utils.js';
import { getMeasurements, addMeasurement, removeMeasurement } from './store.js';
import { lineChart } from './charts.js';
import { refreshCurrentTab } from './app.js';

const MEASURE_FIELDS = [
  { key: 'waist', label: 'Cintura (cm)' },
  { key: 'hip', label: 'Quadril (cm)' },
  { key: 'chest', label: 'Peito (cm)' },
  { key: 'arm', label: 'Braço (cm)' },
  { key: 'thigh', label: 'Coxa (cm)' },
];

export function renderProgresso(container) {
  const measurements = getMeasurements();

  container.append(buildCompareCard(measurements));
  container.append(buildChartsSection(measurements));
  container.append(buildHistorySection(measurements));

  const fab = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top: var(--sp-5)', onclick: () => openMeasurementSheet() }, '+ Registrar medição de hoje');
  container.append(fab);
}

function buildCompareCard(measurements) {
  if (measurements.length === 0) {
    return el('div', { class: 'card empty-state' }, [
      el('p', {}, 'Ainda sem registros. Adicione sua primeira medição para começar a comparar sua evolução.'),
    ]);
  }
  const first = measurements[0];
  const last = measurements[measurements.length - 1];
  const deltaWeight = (last.weight ?? null) !== null && (first.weight ?? null) !== null
    ? round1(last.weight - first.weight) : null;

  const card = el('div', { class: 'card' }, [
    el('h3', { class: 'mt-0' }, 'Início vs. agora'),
    el('div', { class: 'compare-row', style: 'margin-top: var(--sp-3)' }, [
      el('div', { class: 'compare-col' }, [
        el('div', { class: 'compare-col__label' }, formatDatePt(first.date)),
        el('div', { class: 'compare-col__value' }, first.weight != null ? `${round1(first.weight)}kg` : '—'),
      ]),
      el('span', { class: 'compare-arrow' }, '→'),
      el('div', { class: 'compare-col' }, [
        el('div', { class: 'compare-col__label' }, formatDatePt(last.date)),
        el('div', { class: 'compare-col__value' }, last.weight != null ? `${round1(last.weight)}kg` : '—'),
      ]),
    ]),
    deltaWeight !== null ? el('div', {
      class: `compare-delta ${deltaWeight <= 0 ? 'is-positive' : 'is-negative'}`,
    }, `${deltaWeight > 0 ? '+' : ''}${deltaWeight} kg desde o início`) : null,
  ]);
  return card;
}

function buildChartsSection(measurements) {
  const wrap = el('div', {}, [el('h2', { class: 'section-title' }, 'Evolução')]);

  const weightPoints = measurements.filter((m) => m.weight != null).map((m) => ({ date: m.date, value: m.weight }));
  const fatPoints = measurements.filter((m) => m.bodyFat != null).map((m) => ({ date: m.date, value: m.bodyFat }));

  wrap.append(el('div', { class: 'card' }, [
    el('h3', { class: 'mt-0' }, 'Peso (kg)'),
    lineChart(weightPoints, { unit: 'kg' }),
  ]));

  if (fatPoints.length > 0) {
    wrap.append(el('div', { class: 'card' }, [
      el('h3', { class: 'mt-0' }, '% de gordura corporal'),
      lineChart(fatPoints, { unit: '%' }),
    ]));
  }

  return wrap;
}

function buildHistorySection(measurements) {
  const wrap = el('div', {}, [el('h2', { class: 'section-title' }, 'Histórico')]);

  if (measurements.length === 0) {
    wrap.append(el('div', { class: 'card empty-state' }, [el('p', {}, 'Nenhum registro ainda.')]));
    return wrap;
  }

  const list = el('div', { class: 'measure-list' });
  [...measurements].reverse().forEach((m) => {
    const parts = [];
    if (m.weight != null) parts.push(`${round1(m.weight)} kg`);
    if (m.bodyFat != null) parts.push(`${round1(m.bodyFat)}% gordura`);
    MEASURE_FIELDS.forEach((f) => { if (m.measures?.[f.key] != null) parts.push(`${f.label.split(' ')[0]} ${m.measures[f.key]}cm`); });

    const row = el('div', {
      class: 'measure-row', style: 'cursor:pointer',
      onclick: () => openMeasurementDetail(m),
    }, [
      el('div', { style: 'display:flex; align-items:center;' }, [
        m.photo ? el('img', { class: 'measure-row__thumb', src: m.photo, alt: '' }) : null,
        el('div', {}, [
          el('div', { class: 'measure-row__date' }, formatDatePt(m.date, true)),
          el('div', { class: 'measure-row__detail' }, parts.join(' · ') || 'Sem medidas'),
        ]),
      ]),
    ]);
    list.append(row);
  });
  wrap.append(list);
  return wrap;
}

function openMeasurementDetail(m) {
  openOverlay((close) => {
    const dialog = el('div', {}, [
      el('div', { class: 'sheet__header' }, [
        el('h3', { class: 'sheet__title' }, formatDatePt(m.date, true)),
        el('button', { class: 'icon-btn sheet__close', onclick: close }, '✕'),
      ]),
      m.photo ? el('img', { src: m.photo, style: 'border-radius:16px; margin-bottom:16px; width:100%;' }) : null,
      el('div', { class: 'card' }, [
        m.weight != null ? el('p', {}, `Peso: ${round1(m.weight)} kg`) : null,
        m.bodyFat != null ? el('p', {}, `Gordura corporal: ${round1(m.bodyFat)}%`) : null,
        ...MEASURE_FIELDS.filter((f) => m.measures?.[f.key] != null).map((f) => el('p', {}, `${f.label}: ${m.measures[f.key]} cm`)),
        m.note ? el('p', { class: 'muted', style: 'margin-top:8px' }, m.note) : null,
      ]),
      el('button', {
        class: 'btn btn--danger btn--block', style: 'margin-top:16px',
        onclick: () => {
          if (window.confirm('Remover este registro?')) {
            removeMeasurement(m.id);
            close();
            refreshCurrentTab();
          }
        },
      }, 'Remover registro'),
    ]);
    return dialog;
  }, { kind: 'sheet' });
}

function openMeasurementSheet() {
  let photoDataUrl = null;

  openOverlay((close) => {
    const dateInput = el('input', { type: 'date', value: todayISO() });
    const weightInput = el('input', { type: 'number', step: '0.1', placeholder: 'ex.: 78.4', inputmode: 'decimal' });
    const fatInput = el('input', { type: 'number', step: '0.1', placeholder: 'opcional', inputmode: 'decimal' });
    const noteInput = el('textarea', { placeholder: 'Como você está se sentindo? (opcional)' });
    const photoInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment' });
    const photoPreview = el('div', { class: 'chat-photo-preview hidden' });

    const measureInputs = {};
    const measureFieldsEl = MEASURE_FIELDS.map((f) => {
      const input = el('input', { type: 'number', step: '0.1', placeholder: '—', inputmode: 'decimal' });
      measureInputs[f.key] = input;
      return el('div', { class: 'field' }, [el('label', {}, f.label), input]);
    });

    photoInput.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      try {
        photoDataUrl = await compressImage(file, 1024, 0.75);
        photoPreview.classList.remove('hidden');
        photoPreview.innerHTML = '';
        photoPreview.append(el('img', { src: photoDataUrl }), el('span', {}, file.name));
      } catch (err) {
        toast('Não foi possível processar a foto.', 'error');
      }
    });

    const dialog = el('div', {}, [
      el('div', { class: 'sheet__header' }, [
        el('h3', { class: 'sheet__title' }, 'Nova medição'),
        el('button', { class: 'icon-btn sheet__close', onclick: close }, '✕'),
      ]),
      el('div', { class: 'field' }, [el('label', {}, 'Data'), dateInput]),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', {}, 'Peso (kg)'), weightInput]),
        el('div', { class: 'field' }, [el('label', {}, '% gordura (opcional)'), fatInput]),
      ]),
      el('h3', { style: 'margin: var(--sp-4) 0 var(--sp-2);' }, 'Medidas (opcionais)'),
      ...measureFieldsEl,
      el('div', { class: 'field' }, [
        el('label', {}, 'Foto de evolução (opcional)'),
        photoInput,
        photoPreview,
      ]),
      el('div', { class: 'field' }, [el('label', {}, 'Anotações'), noteInput]),
      el('button', {
        class: 'btn btn--primary btn--block',
        onclick: () => {
          const weight = weightInput.value ? parseFloat(weightInput.value) : null;
          const bodyFat = fatInput.value ? parseFloat(fatInput.value) : null;
          if (weight == null && bodyFat == null) {
            toast('Informe ao menos o peso ou o % de gordura.', 'error');
            return;
          }
          const measures = {};
          for (const f of MEASURE_FIELDS) {
            const v = measureInputs[f.key].value;
            if (v) measures[f.key] = parseFloat(v);
          }
          addMeasurement({
            date: dateInput.value || todayISO(),
            weight, bodyFat,
            measures,
            note: noteInput.value.trim(),
            photo: photoDataUrl,
          });
          toast('Medição registrada 📈');
          close();
          refreshCurrentTab();
        },
      }, 'Salvar medição'),
    ]);
    return dialog;
  }, { kind: 'sheet' });
}
