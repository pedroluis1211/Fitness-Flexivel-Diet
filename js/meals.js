// meals.js — aba "Refeições": refeições do dia, totais vs. metas, histórico
// por data e o chat com IA que identifica alimentos usando a TACO.

import {
  el, todayISO, addDays, formatDatePt, weekdayShort, round1,
  openOverlay, toast, compressImage,
} from './utils.js';
import { getConfig, addMeal, removeMeal, dayMealTotals, peekDay } from './store.js';
import { askFoodAnalysis, buildUserContent, AIError } from './ai.js';
import { refreshCurrentTab } from './app.js';

const MEAL_TYPES = [
  { key: 'cafe', label: 'Café da manhã' },
  { key: 'almoco', label: 'Almoço' },
  { key: 'lanche', label: 'Lanche' },
  { key: 'jantar', label: 'Jantar' },
  { key: 'outros', label: 'Outros' },
];

// Mantém a data selecionada entre re-renderizações da aba (mas volta para
// hoje sempre que o usuário sai e volta para a aba pelo menu inferior).
let selectedDate = todayISO();

export function renderRefeicoes(container) {
  container.append(buildDateNav());
  container.append(buildMacroSummary(selectedDate));
  MEAL_TYPES.forEach((tipo) => container.append(buildMealGroup(tipo, selectedDate)));
}

function rerender() {
  const view = document.getElementById('view');
  view.innerHTML = '';
  renderRefeicoes(view);
}

function buildDateNav() {
  const isToday = selectedDate === todayISO();
  const label = isToday ? 'Hoje' : `${weekdayShort(selectedDate)}, ${formatDatePt(selectedDate)}`;

  return el('div', { class: 'date-nav' }, [
    el('button', { class: 'icon-btn', 'aria-label': 'Dia anterior', onclick: () => { selectedDate = addDays(selectedDate, -1); rerender(); } }, '‹'),
    el('div', { style: 'display:flex; flex-direction:column; align-items:center; gap:2px;' }, [
      el('span', { class: 'date-nav__label' }, label),
      el('input', {
        type: 'date', value: selectedDate, style: 'border:none; background:none; color:var(--text-muted); font-size:var(--fs-xs); padding:0;',
        onchange: (e) => { if (e.target.value) { selectedDate = e.target.value; rerender(); } },
      }),
    ]),
    el('button', {
      class: 'icon-btn', 'aria-label': 'Próximo dia', disabled: isToday,
      onclick: () => { selectedDate = addDays(selectedDate, 1); rerender(); },
    }, '›'),
  ]);
}

function buildMacroSummary(iso) {
  const config = getConfig();
  const totals = dayMealTotals(iso);
  const macros = [
    { key: 'kcal', label: 'Calorias', value: totals.kcal, goal: config.calorieGoal, unit: ' kcal' },
    { key: 'protein', label: 'Proteína', value: totals.protein, goal: config.macroGoals.protein, unit: 'g' },
    { key: 'carbs', label: 'Carboidrato', value: totals.carbs, goal: config.macroGoals.carbs, unit: 'g' },
    { key: 'fat', label: 'Gordura', value: totals.fat, goal: config.macroGoals.fat, unit: 'g' },
  ];

  const bars = macros.map((m) => {
    const pct = m.goal > 0 ? Math.min(100, Math.round((m.value / m.goal) * 100)) : 0;
    const over = m.value > m.goal;
    return el('div', {}, [
      el('div', { class: 'macro-bar__top' }, [
        el('span', {}, m.label),
        el('span', { class: 'muted' }, `${Math.round(m.value)}${m.unit} / ${m.goal}${m.unit}`),
      ]),
      el('div', { class: 'macro-bar__track' }, [
        el('div', { class: `macro-bar__fill ${over ? 'over' : ''}`, style: `width:${pct}%` }),
      ]),
    ]);
  });

  return el('div', { class: 'card macro-summary' }, [
    el('h3', { class: 'mt-0' }, 'Total do dia'),
    ...bars,
  ]);
}

function buildMealGroup(tipo, iso) {
  const day = peekDay(iso);
  const items = day?.meals?.[tipo.key] || [];
  const kcalTotal = items.reduce((s, m) => s + (m.totals?.kcal || 0), 0);

  const group = el('div', { class: 'meal-group' }, [
    el('div', { class: 'meal-group__header' }, [
      el('span', { class: 'meal-group__title' }, tipo.label),
      items.length > 0 ? el('span', { class: 'meal-group__kcal' }, `${Math.round(kcalTotal)} kcal`) : null,
    ]),
  ]);

  items.forEach((meal) => {
    const names = (meal.items || []).map((i) => i.name).join(', ');
    group.append(el('div', { class: 'meal-item' }, [
      el('div', {}, [
        el('div', { class: 'meal-item__desc' }, meal.description || names || 'Refeição'),
        el('div', { class: 'meal-item__meta' }, names && meal.description ? names : ''),
      ]),
      el('div', { style: 'display:flex; align-items:center; gap:10px;' }, [
        el('span', { class: 'meal-item__kcal' }, `${Math.round(meal.totals?.kcal || 0)} kcal`),
        el('button', {
          class: 'icon-btn', style: 'width:32px;height:32px;', 'aria-label': 'Remover',
          onclick: () => {
            if (window.confirm('Remover esta refeição?')) {
              removeMeal(iso, tipo.key, meal.id);
              rerender();
            }
          },
        }, '✕'),
      ]),
    ]));
  });

  group.append(el('button', {
    class: 'meal-add-btn',
    onclick: () => openMealChat(tipo, iso),
  }, `+ Adicionar ${tipo.label.toLowerCase()}`));

  return group;
}

// ---------------------------------------------------------------------------
// Chat com IA
// ---------------------------------------------------------------------------

function openMealChat(tipo, iso) {
  // Estado local da conversa: histórico no formato aceito pela API da Anthropic.
  const apiMessages = [];
  let pendingImage = null; // { data, mediaType } prontos para enviar à API
  let lastStructured = null; // último resultado estruturado (itens + totais) recebido
  let lastUserText = ''; // guarda a última descrição digitada, para salvar como texto da refeição
  let isSending = false;
  let activePreview = null; // referência ao cartão de confirmação mais recente no DOM

  openOverlay((close) => {
    const log = el('div', { class: 'chat-log' });
    const textInput = el('textarea', { placeholder: 'Descreva o que você comeu (ex.: "2 ovos fritos e uma fatia de pão integral")…' });
    const fileInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' });
    const photoPreview = el('div', { class: 'chat-photo-preview hidden' });
    const sendBtn = el('button', { class: 'btn btn--primary', onclick: handleSend }, 'Enviar');

    function addBubble(role, contentNode) {
      const bubble = el('div', { class: `chat-bubble chat-bubble--${role}` }, []);
      if (typeof contentNode === 'string') bubble.textContent = contentNode;
      else bubble.append(contentNode);
      log.append(bubble);
      log.scrollTop = log.scrollHeight;
      return bubble;
    }

    function addTyping() {
      const t = el('div', { class: 'chat-typing', id: 'typing-indicator' }, [el('span'), el('span'), el('span')]);
      log.append(t);
      log.scrollTop = log.scrollHeight;
      return t;
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file, 1024, 0.8);
        const [header, data] = dataUrl.split(',');
        pendingImage = { data, mediaType: 'image/jpeg', preview: dataUrl };
        photoPreview.classList.remove('hidden');
        photoPreview.innerHTML = '';
        photoPreview.append(el('img', { src: dataUrl }), el('span', {}, 'Foto pronta para enviar'));
      } catch (err) {
        toast('Não foi possível processar a foto.', 'error');
      }
    });

    async function handleSend() {
      const text = textInput.value.trim();
      if (!text && !pendingImage) {
        toast('Escreva uma descrição ou anexe uma foto.', 'error');
        return;
      }
      if (isSending) return;
      isSending = true;
      sendBtn.setAttribute('disabled', '');

      // Bolha do usuário
      const userBubbleContent = el('div', {}, [
        pendingImage ? el('img', { src: pendingImage.preview, alt: '' }) : null,
        text ? el('span', {}, text) : null,
      ]);
      addBubble('user', userBubbleContent);

      apiMessages.push({ role: 'user', content: buildUserContent({ text, image: pendingImage }) });
      if (text) lastUserText = text;

      textInput.value = '';
      const imageSent = pendingImage;
      pendingImage = null;
      photoPreview.classList.add('hidden');
      photoPreview.innerHTML = '';

      const typing = addTyping();

      try {
        const { text: aiText, structured } = await askFoodAnalysis(apiMessages);
        typing.remove();
        apiMessages.push({ role: 'assistant', content: aiText + (structured ? '\n\n(bloco JSON omitido do histórico exibido)' : '') });

        const aiNode = el('div', {}, [el('span', {}, aiText || 'Não entendi, pode descrever de outra forma?')]);
        addBubble('ai', aiNode);

        if (structured && structured.items?.length > 0) {
          lastStructured = structured;
          if (activePreview) activePreview.remove(); // uma correção substitui o cartão anterior
          activePreview = buildFoodPreview(structured, { onConfirm: () => confirmSave(close, tipo, iso, lastUserText, structured) });
          log.append(activePreview);
        } else if (!structured) {
          addBubble('system', 'A IA não devolveu os dados no formato esperado. Você pode pedir "pode recalcular e me dar os totais?" para tentar de novo.');
        }
      } catch (err) {
        typing.remove();
        const message = err instanceof AIError ? err.message : 'Ocorreu um erro inesperado ao falar com a IA.';
        addBubble('system', message);
        toast(message, 'error');
      } finally {
        isSending = false;
        sendBtn.removeAttribute('disabled');
        log.scrollTop = log.scrollHeight;
      }
    }

    const sheet = el('div', {}, [
      el('div', { class: 'sheet__header' }, [
        el('h3', { class: 'sheet__title' }, `${tipo.label} · ${formatDatePt(iso)}`),
        el('button', { class: 'icon-btn sheet__close', onclick: close }, '✕'),
      ]),
      el('p', { class: 'muted', style: 'font-size: var(--fs-xs); margin-bottom: 8px;' },
        'Descreva ou envie uma foto da refeição. A IA calcula com base na tabela TACO e só salva depois da sua confirmação.'),
      log,
      photoPreview,
      el('div', { class: 'chat-input-row' }, [
        el('button', { class: 'icon-btn', 'aria-label': 'Anexar foto', onclick: () => fileInput.click() }, '📷'),
        fileInput,
        textInput,
        sendBtn,
      ]),
    ]);
    return sheet;
  }, { kind: 'sheet' });
}

function buildFoodPreview(structured, { onConfirm }) {
  const preview = el('div', { class: 'food-preview' }, [
    ...structured.items.map((item) => el('div', { class: 'food-preview__item' }, [
      el('div', {}, [
        el('div', { class: 'food-preview__name' }, item.name),
        el('div', { class: 'food-preview__sub' }, `${item.grams} g · P ${round1(item.protein)}g · C ${round1(item.carbs)}g · G ${round1(item.fat)}g`),
      ]),
      el('div', { style: 'text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px;' }, [
        el('span', {}, `${Math.round(item.kcal)} kcal`),
        el('span', { class: `food-preview__badge ${item.source === 'estimado' ? 'is-estimate' : ''}` }, item.source === 'estimado' ? 'estimado' : 'TACO'),
      ]),
    ])),
    el('div', { class: 'food-preview__totals' }, [
      el('span', {}, 'Total'),
      el('span', {}, `${Math.round(structured.totals.kcal)} kcal · P ${round1(structured.totals.protein)}g · C ${round1(structured.totals.carbs)}g · G ${round1(structured.totals.fat)}g`),
    ]),
    el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:12px', onclick: onConfirm }, '✓ Confirmar e salvar'),
    el('p', { class: 'muted', style: 'font-size: var(--fs-xs); margin-top:8px; text-align:center;' }, 'Algo errado? Descreva a correção no chat (ex.: "era 150g de arroz") antes de confirmar.'),
  ]);
  return preview;
}

function confirmSave(close, tipo, iso, description, structured) {
  if (!structured) {
    toast('Nada para salvar ainda.', 'error');
    return;
  }
  addMeal(iso, tipo.key, {
    description: description || '',
    items: structured.items,
    totals: structured.totals,
  });
  toast('Refeição salva ✅');
  close();
  refreshCurrentTab();
}
