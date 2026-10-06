# Rumo ao Natal 🎄 — acompanhamento físico

App web mobile-first, sem build step (HTML + CSS + JS puro), para acompanhar água, refeições (com IA usando a TACO), progresso físico e hábitos até **24/12/2026**. Funciona como PWA instalável e offline (o chat de IA precisa de internet).

## Por que preciso de um servidor local?

O app usa módulos JavaScript (`<script type="module">`) e um service worker (para funcionar offline). Por regra de segurança dos navegadores, **isso não funciona abrindo o `index.html` direto com duplo clique** (protocolo `file://`). É preciso servir os arquivos por `http://localhost` ou HTTPS. É simples e não precisa instalar nada além do que você já deve ter no computador.

## 1. Rodar localmente

Escolha uma das opções (todas fazem a mesma coisa: servir a pasta na porta 8000):

**Python** (já vem instalado no Mac/Linux; no Windows instale em python.org):
```bash
cd caminho/para/fitness-tracker
python3 -m http.server 8000
```

**Node.js** (se preferir):
```bash
npx serve -l 8000
```

**VS Code**: instale a extensão "Live Server" e clique em "Go Live".

Depois, abra **http://localhost:8000** no navegador do computador.

## 2. Abrir no celular (mesma rede Wi-Fi)

1. Garanta que o celular e o computador estão na **mesma rede Wi-Fi**.
2. Descubra o IP local do computador:
   - Mac/Linux: `ifconfig | grep "inet "` (ou `ip a`)
   - Windows: `ipconfig` (campo "Endereço IPv4")
   - Vai ser algo como `192.168.0.42`.
3. Com o servidor do passo 1 rodando, abra no navegador do celular:
   `http://SEU-IP:8000` (ex.: `http://192.168.0.42:8000`).
4. No Android (Chrome) ou iPhone (Safari), use o menu do navegador → **"Adicionar à tela de início"** para instalar o app como PWA.
5. Depois de instalado uma vez com internet, o app abre offline normalmente (menos o chat de IA, que precisa de conexão).

## 3. Publicar de graça (para acessar de qualquer lugar, com HTTPS)

Publicar facilita o acesso pelo celular sem depender do Wi-Fi e sem o computador ligado.

### Opção A — GitHub Pages
1. Crie um repositório no GitHub e suba todos os arquivos desta pasta.
2. Vá em **Settings → Pages**, em "Source" escolha a branch `main` e a pasta `/root`.
3. Em alguns minutos o app estará em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

### Opção B — Netlify
1. Crie uma conta grátis em netlify.com.
2. Arraste a pasta inteira do projeto para a área "Deploy manually" do painel da Netlify (ou conecte o repositório do GitHub).
3. Pronto — você recebe uma URL `https://algumnome.netlify.app`.

Depois de publicado, acesse a URL pelo celular e instale como PWA do mesmo jeito do passo 2.4.

## Configurar a IA do chat de Refeições

1. Abra o app → ícone de engrenagem (⚙) no topo → seção **"IA da aba Refeições"**.
2. Cole sua chave de API da Anthropic (crie uma em console.anthropic.com) e, se quiser, o nome do modelo (padrão: `claude-sonnet-4-5`).
3. A chave fica salva **só no localStorage do seu navegador** — nunca é gravada em nenhum arquivo do projeto nem enviada a qualquer lugar além da própria Anthropic.
4. Sem chave configurada (ou sem internet), o restante do app continua funcionando normalmente; só o chat de identificação de alimentos fica indisponível.

## Dados e backup

- Tudo fica salvo no `localStorage` do navegador (por aparelho/navegador).
- Em **Configurações → Dados**, use **Exportar JSON** para baixar um backup e **Importar JSON** para restaurar em outro aparelho/navegador.
- **Apagar todos os dados** remove tudo permanentemente — use com cuidado.

## Estrutura do projeto

```
index.html        → casca do app (barra superior, abas, navegação)
styles.css        → design system e estilos (tema claro/escuro automático)
manifest.json     → metadados da PWA
sw.js             → service worker (cache offline)
icons/            → ícone do app (SVG + PNG)
js/
  app.js          → inicialização e navegação entre abas
  store.js        → toda a persistência (localStorage)
  utils.js        → helpers de data, DOM, imagem, overlays, toasts
  settings.js     → tela de Configurações
  today.js        → aba Hoje (contagem regressiva, água, resumo)
  meals.js        → aba Refeições (chat com IA, histórico, metas)
  ai.js           → chamada à API da Anthropic + prompt da TACO
  progress.js     → aba Progresso (peso, medidas, fotos, comparação)
  charts.js       → gráfico de linha em SVG, sem dependências
  checklist.js    → aba Checklist (hábitos, heatmap, streaks)
```

Código comentado em português para facilitar ajustes. Nenhuma dependência externa além da chamada direta à API da Anthropic no chat de Refeições.
