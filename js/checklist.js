// checklist.js — aba "Checklist": hábitos diários (CRUD), heatmap de
// consistência até 24/12, streak atual/melhor e % de aderência.

import { el, todayISO, diffDays, addDays, formatDatePt, openOverlay, toast } from './utils.js';
import {
  getHabits, addHabit, updateHabit, removeHabit,
  isHabitDone, toggleHabit, peekDay, getConfig,
} from './store.js';
import { refreshCurrentTab } from './app.js';

export function renderChecklist(container) {
  const config = getConfig();
  const today = todayISO();
  const habits = getHabits();

  container.append(buildStreakRow(habits, today));
  container.append(buildOverallProgress(habits, config, today));
  container.append(buildHeatmap(habits, config, today));
  container.append(buildHabitList(habits, today));
}

// ---------- Cálculos de consistência ----------

/** Um dia é "concluído" se existe ao menos 1 hábito e todos foram marcados. */
function isDayComplete(habits, iso) {
  if (habits.length === 0) return false;
  return habits.every((h) => isHabitDone(iso, h.id));
}

/** Fração de hábitos concluídos num dia (0 a 1), para o heatmap. */
function dayCompletionRatio(habits, iso) {
  if (habits.length === 0) return 0;
  const done = habits.filter((h) => isHabitDone(iso, h.id)).length;
  return done / habits.length;
}

function computeStreaks(habits, today) {
  if (habits.length === 0) return { current: 0, best: 0 };

  // streak atual: conta dias completos voltando a partir de hoje (ou ontem,
  // se hoje ainda não foi totalmente concluído — assim não "quebra" no meio do dia)
  let current = 0;
  let cursor = isDayComplete(habits, today) ? today : addDays(today, -1);
  while (isDayComplete(habits, cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // melhor streak: percorre do início registrado até hoje
  const earliestHabit = habits.reduce((min, h) => (h.createdAt < min ? h.createdAt : min), today);
  let best = 0;
  let run = 0;
  let iter = earliestHabit;
  const limit = today;
  let guard = 0;
  while (iter <= limit && guard < 3660) {
    if (isDayComplete(habits, iter)) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    iter = addDays(iter, 1);
    guard++;
  }
  return { current, best };
}

function adherence(habits, startIso, endIso) {
  if (habits.length === 0) return 0;
  let possible = 0;
  let done = 0;
  let iter = startIso;
  let guard = 0;
  while (iter <= endIso && guard < 3660) {
    for (const h of habits) {
      if (iter < h.createdAt) continue; // hábito ainda não existia nesse dia
      possible++;
      if (isHabitDone(iter, h.id)) done++;
    }
    iter = addDays(iter, 1);
    guard++;
  }
  return possible === 0 ? 0 : Math.round((done / possible) * 100);
}

// ---------- UI ----------

function buildStreakRow(habits, today) {
  const { current, best } = computeStreaks(habits, today);
  const weekAdh = adherence(habits, addDays(today, -6), today);

  return el('div', { class: 'card streak-row' }, [
    el('div', { class: 'streak-card' }, [
      el('div', { class: 'streak-card__value' }, String(current)),
      el('div', { class: 'streak-card__label' }, current === 1 ? 'dia seguido' : 'dias seguidos'),
    ]),
    el('div', { class: 'streak-card' }, [
      el('div', { class: 'streak-card__value' }, String(best)),
      el('div', { class: 'streak-card__label' }, 'melhor streak'),
    ]),
    el('div', { class: 'streak-card' }, [
      el('div', { class: 'streak-card__value' }, `${weekAdh}%`),
      el('div', { class: 'streak-card__label' }, 'semana'),
    ]),
  ]);
}

function buildOverallProgress(habits, config, today) {
  const start = config.startDate;
  const end = config.endDate;
  const totalDias = diffDays(start, end) + 1;
  const diasPassados = Math.min(diffDays(start, today) + 1, totalDias);

  let diasConcluidos = 0;
  let iter = start;
  let guard = 0;
  const until = today < end ? today : end;
  while (iter <= until && guard < 3660) {
    if (isDayComplete(habits, iter)) diasConcluidos++;
    iter = addDays(iter, 1);
    guard++;
  }
  const totalAdh = adherence(habits, start, today < end ? today : end);
  const pctDias = totalDias === 0 ? 0 : Math.round((diasConcluidos / totalDias) * 100);

  return el('div', { class: 'card' }, [
    el('div', { class: 'flex-between' }, [
      el('h3', {}, 'Rumo ao Natal'),
      el('span', { class: 'muted' }, `${totalAdh}% de aderência`),
    ]),
    el('div', { class: 'progress-total' }, [
      el('div', { class: 'flex-between' }, [
        el('span', { class: 'muted', style: 'font-size: var(--fs-sm)' }, `${diasConcluidos} de ${totalDias} dias concluídos`),
        el('span', { class: 'muted', style: 'font-size: var(--fs-sm)' }, `${diasPassados}/${totalDias} dias passados`),
      ]),
      el('div', { class: 'progress-total__bar' }, [
        el('div', { class: 'progress-total__fill', style: `width:${pctDias}%` }),
      ]),
    ]),
  ]);
}

function buildHeatmap(habits, config, today) {
  const wrap = el('div', {}, [el('h2', { class: 'section-title' }, 'Consistência até o Natal')]);
  const card = el('div', { class: 'card' });

  if (habits.length === 0) {
    card.append(el('p', { class: 'muted', style: 'font-size: var(--fs-sm)' },
      'Cadastre hábitos para ver seu mapa de consistência aqui.'));
    wrap.append(card);
    return wrap;
  }

  const grid = el('div', { class: 'heatmap' });
  let iter = config.startDate;
  let guard = 0;
  while (iter <= config.endDate && guard < 3660) {
    let level = 'future';
    if (iter <= today) {
      const ratio = dayCompletionRatio(habits, iter);
      level = ratio === 0 ? '0' : ratio < 0.5 ? '1' : ratio < 1 ? '2' : '3';
    }
    grid.append(el('div', {
      class: 'heatmap__cell',
      'data-level': level,
      title: `${formatDatePt(iter)}`,
    }));
    iter = addDays(iter, 1);
    guard++;
  }
  card.append(grid);
  card.append(el('div', { class: 'heatmap-legend' }, [
    'menos',
    el('span', { class: 'heatmap-legend__cell', style: 'background:var(--ring-track)' }),
    el('span', { class: 'heatmap-legend__cell', style: 'background:color-mix(in srgb, var(--accent) 30%, var(--ring-track))' }),
    el('span', { class: 'heatmap-legend__cell', style: 'background:color-mix(in srgb, var(--accent) 60%, var(--ring-track))' }),
    el('span', { class: 'heatmap-legend__cell', style: 'background:var(--accent)' }),
    'mais',
  ]));
  wrap.append(card);
  return wrap;
}

function buildHabitList(habits, today) {
  const wrap = el('div', {}, [
    el('div', { class: 'flex-between', style: 'margin: var(--sp-6) 0 var(--sp-3)' }, [
      el('h2', { class: 'section-title mt-0' }, 'Seus hábitos'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openHabitDialog() }, '+ novo hábito'),
    ]),
  ]);

  if (habits.length === 0) {
    wrap.append(el('div', { class: 'card empty-state' }, [
      el('p', {}, 'Nenhum hábito ainda. Crie o primeiro para começar a acompanhar sua consistência.'),
      el('button', { class: 'btn btn--primary', style: 'margin-top:12px', onclick: () => openHabitDialog() }, 'Criar hábito'),
    ]));
    return wrap;
  }

  habits.forEach((h) => {
    const done = isHabitDone(today, h.id);
    const row = el('div', { class: 'habit-row' }, [
      el('button', {
        class: `habit-row__check ${done ? 'is-done' : ''}`,
        'aria-label': `Marcar ${h.name}`,
        onclick: () => {
          toggleHabit(today, h.id);
          refreshCurrentTab();
        },
      }, done ? '✓' : ''),
      el('span', { class: 'habit-row__name' }, h.name),
      el('button', {
        class: 'habit-row__edit',
        'aria-label': 'Editar hábito',
        onclick: () => openHabitDialog(h),
      }, '✎'),
    ]);
    wrap.append(row);
  });

  return wrap;
}

function openHabitDialog(habit) {
  openOverlay((close) => {
    const input = el('input', {
      type: 'text', value: habit?.name || '', placeholder: 'Ex.: Treinar 30 min',
      maxlength: 60,
    });
    const dialog = el('div', {}, [
      el('div', { class: 'dialog__header' }, [
        el('h3', { class: 'dialog__title' }, habit ? 'Editar hábito' : 'Novo hábito'),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Nome do hábito'),
        input,
      ]),
      el('div', { class: 'settings-row-actions' }, [
        el('button', {
          class: 'btn btn--primary btn--block',
          onclick: () => {
            const name = input.value.trim();
            if (!name) { toast('Digite um nome para o hábito.', 'error'); return; }
            if (habit) updateHabit(habit.id, { name });
            else addHabit(name);
            close();
            refreshCurrentTab();
          },
        }, 'Salvar'),
        habit ? el('button', {
          class: 'btn btn--danger btn--block',
          onclick: () => {
            if (window.confirm(`Remover o hábito "${habit.name}"? Isso apaga o histórico dele.`)) {
              removeHabit(habit.id);
              close();
              refreshCurrentTab();
            }
          },
        }, 'Remover hábito') : null,
      ]),
    ]);
    setTimeout(() => input.focus(), 50);
    return dialog;
  }, { kind: 'dialog' });
}
