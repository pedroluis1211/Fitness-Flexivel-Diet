// store.js — toda a persistência do app vive aqui.
// Um único objeto é salvo no localStorage sob STORAGE_KEY.
// Nenhum outro módulo deve chamar localStorage diretamente: tudo passa por cá.

import { uid, todayISO } from './utils.js';

const STORAGE_KEY = 'fitness-tracker:v1';

/** Estrutura padrão usada na primeira execução do app. */
function defaultState() {
  return {
    config: {
      waterGoalMl: 2500,
      calorieGoal: 2200,
      macroGoals: { protein: 150, carbs: 220, fat: 70 }, // gramas/dia
      endDate: '2026-12-24', // Natal
      startDate: todayISO(), // usado para "início vs. atual" se não houver medição anterior
      apiKey: '',
      apiModel: 'claude-sonnet-4-5',
      theme: 'auto', // 'auto' | 'light' | 'dark'
    },
    days: {
      // '2026-10-05': { water: [], meals: { cafe:[], almoco:[], lanche:[], jantar:[], outros:[] }, habits: {} }
    },
    habits: [
      // { id, name, createdAt, archived }
    ],
    measurements: [
      // { id, date, weight, bodyFat, measures:{...}, photo, note }
    ],
  };
}

function emptyDay() {
  return {
    water: [],
    meals: { cafe: [], almoco: [], lanche: [], jantar: [], outros: [] },
    habits: {},
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // merge raso com defaults para tolerar versões antigas / campos novos
    const base = defaultState();
    return {
      config: { ...base.config, ...(parsed.config || {}) , macroGoals: { ...base.config.macroGoals, ...(parsed.config?.macroGoals || {}) } },
      days: parsed.days || {},
      habits: parsed.habits || [],
      measurements: parsed.measurements || [],
    };
  } catch (err) {
    console.error('Erro ao carregar dados salvos, iniciando do zero.', err);
    return defaultState();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Erro ao salvar dados (localStorage cheio?)', err);
    import('./utils.js').then(({ toast }) =>
      toast('Não foi possível salvar: armazenamento local cheio. Tente remover fotos antigas.', 'error')
    );
  }
}

/** Garante que o dia existe na estrutura e devolve a referência mutável dele. */
export function getDay(iso) {
  if (!state.days[iso]) state.days[iso] = emptyDay();
  // tolera dias criados em versões antigas sem alguma chave
  const day = state.days[iso];
  if (!day.water) day.water = [];
  if (!day.meals) day.meals = { cafe: [], almoco: [], lanche: [], jantar: [], outros: [] };
  if (!day.habits) day.habits = {};
  return day;
}

/** Lê o dia sem criá-lo (para navegação de histórico, retorna null se vazio). */
export function peekDay(iso) {
  return state.days[iso] || null;
}

export function getConfig() {
  return state.config;
}

export function updateConfig(patch) {
  state.config = { ...state.config, ...patch };
  persist();
  return state.config;
}

// ---------- Água ----------

export function addWater(iso, ml) {
  const day = getDay(iso);
  day.water.push({ id: uid(), ml, time: new Date().toISOString() });
  persist();
  return day.water;
}

export function undoLastWater(iso) {
  const day = getDay(iso);
  day.water.pop();
  persist();
  return day.water;
}

export function waterTotal(iso) {
  const day = peekDay(iso);
  if (!day) return 0;
  return day.water.reduce((sum, w) => sum + w.ml, 0);
}

// ---------- Refeições ----------

export function addMeal(iso, tipo, meal) {
  const day = getDay(iso);
  if (!day.meals[tipo]) day.meals[tipo] = [];
  const entry = { id: uid(), time: new Date().toISOString(), ...meal };
  day.meals[tipo].push(entry);
  persist();
  return entry;
}

export function removeMeal(iso, tipo, mealId) {
  const day = getDay(iso);
  day.meals[tipo] = (day.meals[tipo] || []).filter((m) => m.id !== mealId);
  persist();
}

export function dayMealTotals(iso) {
  const day = peekDay(iso);
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  if (!day) return totals;
  for (const tipo of Object.keys(day.meals)) {
    for (const meal of day.meals[tipo]) {
      totals.kcal += meal.totals?.kcal || 0;
      totals.protein += meal.totals?.protein || 0;
      totals.carbs += meal.totals?.carbs || 0;
      totals.fat += meal.totals?.fat || 0;
    }
  }
  return totals;
}

/** Lista as datas (ISO) que têm pelo menos uma refeição registrada, mais recente primeiro. */
export function datesWithMeals() {
  return Object.keys(state.days)
    .filter((iso) => Object.values(state.days[iso].meals || {}).some((arr) => arr.length > 0))
    .sort((a, b) => (a < b ? 1 : -1));
}

// ---------- Hábitos / Checklist ----------

export function addHabit(name) {
  const habit = { id: uid(), name, createdAt: todayISO(), archived: false };
  state.habits.push(habit);
  persist();
  return habit;
}

export function updateHabit(id, patch) {
  const h = state.habits.find((h) => h.id === id);
  if (h) Object.assign(h, patch);
  persist();
  return h;
}

export function removeHabit(id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  // remove também as marcações desse hábito em todos os dias
  for (const iso of Object.keys(state.days)) {
    delete state.days[iso].habits?.[id];
  }
  persist();
}

export function getHabits({ includeArchived = false } = {}) {
  return state.habits.filter((h) => includeArchived || !h.archived);
}

export function toggleHabit(iso, habitId) {
  const day = getDay(iso);
  day.habits[habitId] = !day.habits[habitId];
  persist();
  return day.habits[habitId];
}

export function isHabitDone(iso, habitId) {
  return !!peekDay(iso)?.habits?.[habitId];
}

// ---------- Medições / Progresso ----------

export function addMeasurement(entry) {
  const m = { id: uid(), ...entry };
  state.measurements.push(m);
  state.measurements.sort((a, b) => (a.date < b.date ? -1 : 1));
  persist();
  return m;
}

export function removeMeasurement(id) {
  state.measurements = state.measurements.filter((m) => m.id !== id);
  persist();
}

export function getMeasurements() {
  return [...state.measurements].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- Export / Import ----------

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object') throw new Error('Arquivo inválido.');
  const base = defaultState();
  state = {
    config: { ...base.config, ...(parsed.config || {}) },
    days: parsed.days || {},
    habits: parsed.habits || [],
    measurements: parsed.measurements || [],
  };
  persist();
}

export function wipeAllData() {
  state = defaultState();
  persist();
}

/** Estimativa grosseira do espaço usado, em KB, para avisar o usuário. */
export function storageUsageKB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    return Math.round((raw.length * 2) / 1024); // UTF-16 ~2 bytes/char
  } catch {
    return 0;
  }
}
