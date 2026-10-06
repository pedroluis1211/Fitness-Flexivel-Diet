// app.js — ponto de entrada. Liga a navegação por abas, registra o service
// worker (PWA/offline) e abre a tela de Configurações.

import { renderHoje } from './today.js';
import { renderRefeicoes } from './meals.js';
import { renderProgresso } from './progress.js';
import { renderChecklist } from './checklist.js';
import { openSettings } from './settings.js';

const view = document.getElementById('view');
const topbarTitle = document.getElementById('topbar-title');
const tabButtons = document.querySelectorAll('.bottomnav__item');

const TABS = {
  hoje: { title: 'Hoje', render: renderHoje },
  refeicoes: { title: 'Refeições', render: renderRefeicoes },
  progresso: { title: 'Progresso', render: renderProgresso },
  checklist: { title: 'Checklist', render: renderChecklist },
};

let currentTab = 'hoje';

/** Troca de aba e re-renderiza o conteúdo. Exportada para uso por outros módulos
 * (ex.: um botão "ver checklist" dentro da aba Hoje). */
export function goToTab(tabId) {
  if (!TABS[tabId]) return;
  currentTab = tabId;
  topbarTitle.textContent = TABS[tabId].title;
  tabButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tabId));
  view.innerHTML = '';
  view.classList.remove('fade-in');
  void view.offsetWidth; // força reflow para reiniciar a animação
  view.classList.add('fade-in');
  TABS[tabId].render(view);
}

/** Permite que um módulo peça para re-renderizar a aba atual (ex.: após salvar algo). */
export function refreshCurrentTab() {
  goToTab(currentTab);
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => goToTab(btn.dataset.tab));
});

document.getElementById('btn-settings').addEventListener('click', openSettings);

// ---- Tema claro/escuro ----
// 'auto' segue o sistema (prefers-color-scheme, já tratado via CSS);
// 'light'/'dark' força o tema através do atributo data-theme no <html>.
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
import('./store.js').then(({ getConfig }) => applyTheme(getConfig().theme));
export { applyTheme };

// ---- Inicialização ----
goToTab('hoje');

// ---- Service worker (PWA / offline) ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker não registrado:', err);
    });
  });
}
