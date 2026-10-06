// today.js — aba "Hoje": contagem regressiva até o Natal, resumo do dia
// (água, calorias, checklist) e o widget de registro de água.

import { el, todayISO, diffDays, clamp, formatDatePt, round1, toast } from './utils.js';
import {
  getConfig, addWater, undoLastWater, waterTotal, getDay,
  dayMealTotals, getHabits, isHabitDone, toggleHabit,
} from './store.js';

export function renderHoje(container) {
  const config = getConfig();
  const today = todayISO();
  const day = getDay(today);

  container.append(buildCountdown(config, today));
  container.append(buildStatRow(config, today));
  container.append(buildWaterCard(config, today));
  container.append(buildChecklistPreview(today));
}

function buildCountdown(config, today) {
  const diasRestantes = Math.max(0, diffDays(today, config.endDate));
  const totalPeriodo = Math.max(1, diffDays(config.startDate, config.endDate));
  const passado = clamp(diffDays(config.startDate, today), 0, totalPeriodo);
  const pct = clamp(Math.round((passado / totalPeriodo) * 100), 0, 100);

  const hero = el('div', { class: 'hero' }, [
    el('div', { class: 'hero__ring', style: `--pct:${pct}` }, [
      el('div', { class: 'hero__ring-inner' }, [
        el('span', { class: 'hero__number' }, diasRestantes === 0 ? '🎄' : String(diasRestantes)),
        el('span', { class: 'hero__label' }, diasRestantes === 0 ? 'É Natal!' : diasRestantes === 1 ? 'dia até o Natal' : 'dias até o Natal'),
      ]),
    ]),
    el('p', { class: 'hero__date' }, `Você já avançou ${pct}% do caminho até ${formatDatePt(config.endDate, true)}`),
  ]);
  return hero;
}

function buildStatRow(config, today) {
  const water = waterTotal(today);
  const meals = dayMealTotals(today);
  const habits = getHabits();
  const doneCount = habits.filter((h) => isHabitDone(today, h.id)).length;

  return el('div', { class: 'stat-row' }, [
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat__value' }, `${round1(water / 1000)}L`),
      el('div', { class: 'stat__label' }, `de ${round1(config.waterGoalMl / 1000)}L`),
    ]),
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat__value' }, Math.round(meals.kcal)),
      el('div', { class: 'stat__label' }, `de ${config.calorieGoal} kcal`),
    ]),
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat__value' }, `${doneCount}/${habits.length}`),
      el('div', { class: 'stat__label' }, 'hábitos hoje'),
    ]),
  ]);
}

function buildWaterCard(config, today) {
  const card = el('div', { class: 'card water-card', id: 'water-card' });
  renderWaterCardContent(card, config, today);
  return card;
}

function renderWaterCardContent(card, config, today) {
  card.innerHTML = '';
  const total = waterTotal(today);
  const pct = clamp(Math.round((total / config.waterGoalMl) * 100), 0, 100);

  const glass = el('div', { class: 'water-glass' }, [
    el('div', { class: 'water-glass__fill', style: `--fill:${pct}%` }),
  ]);

  const info = el('div', { class: 'water-info' }, [
    el('div', { class: 'water-info__title' }, 'Água do dia'),
    el('div', { class: 'water-info__amount' }, `${total} ml de ${config.waterGoalMl} ml (${pct}%)`),
    el('div', { class: 'water-actions' }, [
      quickButton(200, card, config, today),
      quickButton(300, card, config, today),
      quickButton(500, card, config, today),
      el('button', {
        class: 'chip',
        onclick: () => promptCustomWater(card, config, today),
      }, '+ outro'),
      el('button', {
        class: 'chip',
        onclick: () => {
          const day = getDay(today);
          if (day.water.length === 0) {
            toast('Nenhum registro de água hoje ainda.');
            return;
          }
          undoLastWater(today);
          renderWaterCardContent(card, config, today);
          refreshStats();
        },
      }, '↺ desfazer'),
      el('button', {
        class: 'chip',
        onclick: () => editWaterGoal(card, today),
      }, '🎯 meta'),
    ]),
  ]);

  card.append(glass, info);
}

function quickButton(ml, card, config, today) {
  return el('button', {
    class: 'chip',
    onclick: () => {
      addWater(today, ml);
      renderWaterCardContent(card, config, today);
      refreshStats();
      toast(`+${ml} ml registrados 💧`);
    },
  }, `+${ml} ml`);
}

function promptCustomWater(card, config, today) {
  const value = window.prompt('Quantos ml deseja registrar?', '250');
  if (!value) return;
  const ml = parseInt(value, 10);
  if (!ml || ml <= 0) {
    toast('Digite um número válido de ml.', 'error');
    return;
  }
  addWater(today, ml);
  renderWaterCardContent(card, config, today);
  refreshStats();
  toast(`+${ml} ml registrados 💧`);
}

function editWaterGoal(card, today) {
  const config = getConfig();
  const value = window.prompt('Nova meta diária de água (ml):', String(config.waterGoalMl));
  if (!value) return;
  const ml = parseInt(value, 10);
  if (!ml || ml <= 0) {
    toast('Digite um número válido de ml.', 'error');
    return;
  }
  import('./store.js').then(({ updateConfig }) => {
    const newConfig = updateConfig({ waterGoalMl: ml });
    renderWaterCardContent(card, newConfig, today);
    refreshStats();
  });
}

function buildChecklistPreview(today) {
  const habits = getHabits();
  const wrap = el('div', {}, [el('h2', { class: 'section-title' }, 'Checklist de hoje')]);

  if (habits.length === 0) {
    wrap.append(el('div', { class: 'card empty-state' }, [
      el('p', {}, 'Nenhum hábito cadastrado ainda. Crie seus hábitos na aba Checklist.'),
    ]));
    return wrap;
  }

  const rows = el('div', { class: 'card checklist-mini' });
  habits.forEach((h) => {
    const done = isHabitDone(today, h.id);
    const row = el('label', { class: `checklist-mini__row ${done ? 'is-done' : ''}` }, [
      el('input', {
        type: 'checkbox',
        checked: done,
        onchange: () => {
          toggleHabit(today, h.id);
          refreshStats();
          row.classList.toggle('is-done');
        },
      }),
      el('span', {}, h.name),
    ]);
    rows.append(row);
  });
  wrap.append(rows);
  return wrap;
}

/** Re-renderiza só a linha de estatísticas (sem recriar a tela toda), para feedback rápido. */
function refreshStats() {
  const statRow = document.querySelector('.view .stat-row');
  if (!statRow) return;
  const config = getConfig();
  const today = todayISO();
  statRow.replaceWith(buildStatRow(config, today));
}
