(function () {
  // Определяем адрес сервера бота — при реальном встраивании на сайт вуза
  // это будет полный адрес вида https://bot.mirea-consultant.ru
  const API_BASE = window.MIREA_WIDGET_API || '';

  let sessionId = localStorage.getItem('mireaWidgetSessionId');
  if (!sessionId) {
    sessionId = 'widget_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    localStorage.setItem('mireaWidgetSessionId', sessionId);
  }

  // --- Стили виджета (внедряются вместе со скриптом, сайту ничего добавлять не нужно) ---
  const style = document.createElement('style');
  style.textContent = `
    #mirea-widget-button {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 60px; height: 60px; border-radius: 50%;
      background: #1a3c8a; color: white; border: none; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25); font-size: 26px;
      display: flex; align-items: center; justify-content: center;
    }
    #mirea-widget-window {
      position: fixed; bottom: 96px; right: 24px; z-index: 9999;
      width: 340px; height: 480px; background: white; border-radius: 14px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.2); display: none;
      flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    #mirea-widget-window.open { display: flex; }
    #mirea-widget-header {
      background: #1a3c8a; color: white; padding: 14px 16px; font-weight: 600; font-size: 14px;
    }
    #mirea-widget-messages {
      flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px;
    }
    .mirea-msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; }
    .mirea-msg.user { align-self: flex-end; background: #1a3c8a; color: white; border-bottom-right-radius: 3px; }
    .mirea-msg.bot { align-self: flex-start; background: #eef0f4; color: #222; border-bottom-left-radius: 3px; }
    #mirea-widget-inputRow { display: flex; padding: 10px; border-top: 1px solid #eee; gap: 6px; }
    #mirea-widget-input { flex: 1; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; }
    #mirea-widget-send { padding: 0 14px; background: #1a3c8a; color: white; border: none; border-radius: 6px; cursor: pointer; }
  `;
  document.head.appendChild(style);

  // --- Разметка виджета ---
  const button = document.createElement('button');
  button.id = 'mirea-widget-button';
  button.innerHTML = '💬';

  const chatWindow = document.createElement('div');
  chatWindow.id = 'mirea-widget-window';
  chatWindow.innerHTML = `
    <div id="mirea-widget-header">Консультант приёмной комиссии РТУ МИРЭА</div>
    <div id="mirea-widget-messages"></div>
    <div id="mirea-widget-inputRow">
      <input id="mirea-widget-input" type="text" placeholder="Задайте вопрос...">
      <button id="mirea-widget-send">→</button>
    </div>
  `;

  document.body.appendChild(button);
  document.body.appendChild(chatWindow);

  const messagesEl = chatWindow.querySelector('#mirea-widget-messages');
  const inputEl = chatWindow.querySelector('#mirea-widget-input');
  const sendBtn = chatWindow.querySelector('#mirea-widget-send');

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'mirea-msg ' + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  let opened = false;
  button.onclick = () => {
    opened = !opened;
    chatWindow.classList.toggle('open', opened);
    if (opened && messagesEl.children.length === 0) {
      addMessage('bot', 'Здравствуйте! Спросите меня о поступлении в РТУ МИРЭА.');
    }
  };

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    addMessage('user', text);
    inputEl.value = '';

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'mirea-msg bot';
    loadingDiv.textContent = 'Печатает...';
    messagesEl.appendChild(loadingDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const res = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      loadingDiv.remove();
      addMessage('bot', data.answer || 'Произошла ошибка, попробуйте снова.');
    } catch (err) {
      loadingDiv.remove();
      addMessage('bot', 'Не удалось связаться с сервером.');
    }
  }

  sendBtn.onclick = send;
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
})();