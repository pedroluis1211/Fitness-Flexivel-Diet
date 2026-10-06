// settings.js — tela de Configurações (aberta como bottom sheet a partir do
// ícone de engrenagem). Metas, data final, tema, chave de API/modelo,
// export/import de dados e limpeza total.

import { el, openOverlay, toast, formatNumber } from './utils.js';
import { getConfig, updateConfig, exportJSON, importJSON, wipeAllData, storageUsageKB } from './store.js';
import { applyTheme, refreshCurrentTab } from './app.js';

export function openSettings() {
  openOverlay((close) => {
    const config = getConfig();
    const sheet = el('div', {}, [
      el('div', { class: 'sheet__header' }, [
        el('h3', { class: 'sheet__title' }, 'Configurações'),
        el('button', { class: 'icon-btn sheet__close', onclick: close }, '✕'),
      ]),
    ]);

    sheet.append(buildThemeGroup(config));
    sheet.append(buildGoalsGroup(config));
    sheet.append(buildDatesGroup(config));
    sheet.append(buildAIGroup(config));
    sheet.append(buildDataGroup(close));

    return sheet;
  }, { kind: 'sheet' });
}

function group(title, children) {
  return el('div', { class: 'settings-group' }, [
    el('div', { class: 'settings-group__title' }, title),
    ...children,
  ]);
}

function buildThemeGroup(config) {
  const options = [
    { value: 'auto', label: 'Automático' },
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Escuro' },
  ];
  const row = el('div', { class: 'settings-row-actions' });
  options.forEach((opt) => {
    const chip = el('button', {
      class: `chip ${config.theme === opt.value ? 'is-active' : ''}`,
      onclick: () => {
        const newConfig = updateConfig({ theme: opt.value });
        applyTheme(newConfig.theme);
        row.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
      },
    }, opt.label);
    row.append(chip);
  });
  return group('Aparência', [row]);
}

function buildGoalsGroup(config) {
  const waterInput = el('input', { type: 'number', value: config.waterGoalMl });
  const calInput = el('input', { type: 'number', value: config.calorieGoal });
  const proteinInput = el('input', { type: 'number', value: config.macroGoals.protein });
  const carbsInput = el('input', { type: 'number', value: config.macroGoals.carbs });
  const fatInput = el('input', { type: 'number', value: config.macroGoals.fat });

  const save = () => {
    updateConfig({
      waterGoalMl: parseInt(waterInput.value, 10) || config.waterGoalMl,
      calorieGoal: parseInt(calInput.value, 10) || config.calorieGoal,
      macroGoals: {
        protein: parseFloat(proteinInput.value) || 0,
        carbs: parseFloat(carbsInput.value) || 0,
        fat: parseFloat(fatInput.value) || 0,
      },
    });
    refreshCurrentTab();
  };
  [waterInput, calInput, proteinInput, carbsInput, fatInput].forEach((i) => i.addEventListener('change', save));

  return group('Metas diárias', [
    el('div', { class: 'field' }, [el('label', {}, 'Água (ml)'), waterInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Calorias (kcal)'), calInput]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Proteína (g)'), proteinInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Carboidrato (g)'), carbsInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Gordura (g)'), fatInput]),
    ]),
  ]);
}

function buildDatesGroup(config) {
  const startInput = el('input', { type: 'date', value: config.startDate });
  const endInput = el('input', { type: 'date', value: config.endDate });

  startInput.addEventListener('change', () => { updateConfig({ startDate: startInput.value }); refreshCurrentTab(); });
  endInput.addEventListener('change', () => { updateConfig({ endDate: endInput.value }); refreshCurrentTab(); });

  return group('Período até o Natal', [
    el('div', { class: 'field' }, [el('label', {}, 'Início do acompanhamento'), startInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Data final (padrão: Natal)'), endInput]),
  ]);
}

function buildAIGroup(config) {
  const keyInput = el('input', { type: 'password', value: config.apiKey, placeholder: 'sk-ant-...', autocomplete: 'off' });
  const modelInput = el('input', { type: 'text', value: config.apiModel, placeholder: 'claude-sonnet-4-5' });

  keyInput.addEventListener('change', () => updateConfig({ apiKey: keyInput.value.trim() }));
  modelInput.addEventListener('change', () => updateConfig({ apiModel: modelInput.value.trim() }));

  return group('IA da aba Refeições', [
    el('div', { class: 'field' }, [el('label', {}, 'Chave de API da Anthropic'), keyInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Modelo'), modelInput]),
    el('p', { class: 'api-help' },
      'A chave fica salva só neste navegador (localStorage), nunca é enviada a lugar nenhum além da própria Anthropic, e nunca é gravada em arquivo do projeto. Para obter uma chave, acesse console.anthropic.com.'),
  ]);
}

function buildDataGroup(closeSettings) {
  const usage = el('p', { class: 'api-help' }, `Espaço usado localmente: ~${formatNumber(storageUsageKB())} KB.`);
  const importInput = el('input', { type: 'file', accept: 'application/json', class: 'hidden' });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    if (!window.confirm('Importar vai substituir todos os dados atuais do app. Continuar?')) return;
    try {
      const text = await file.text();
      importJSON(text);
      toast('Dados importados com sucesso ✅');
      closeSettings();
      refreshCurrentTab();
    } catch (err) {
      toast('Arquivo inválido. Verifique se é um export deste app.', 'error');
    }
  });

  return group('Dados', [
    usage,
    el('div', { class: 'settings-row-actions' }, [
      el('button', { class: 'btn btn--secondary', onclick: downloadExport }, '⬇ Exportar JSON'),
      el('button', { class: 'btn btn--secondary', onclick: () => importInput.click() }, '⬆ Importar JSON'),
      importInput,
    ]),
    el('button', {
      class: 'btn btn--danger btn--block', style: 'margin-top: var(--sp-3)',
      onclick: () => {
        if (window.confirm('Isso apaga TODOS os dados do app (água, refeições, medições, hábitos). Essa ação não pode ser desfeita. Continuar?')) {
          wipeAllData();
          toast('Todos os dados foram apagados.');
          closeSettings();
          refreshCurrentTab();
        }
      },
    }, 'Apagar todos os dados'),
  ]);
}

function downloadExport() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `rumo-ao-natal-backup-${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Arquivo exportado 📦');
}
