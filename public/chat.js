document.addEventListener('DOMContentLoaded', () => {
  // DOM элементы
  const messagesContainer = document.getElementById('messagesContainer');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const searchInput = document.getElementById('searchInput');
  const conversationsList = document.getElementById('conversationsList');
  const chatHeader = document.getElementById('chatHeader');
  const emptyChat = document.getElementById('emptyChat');
  const activeChat = document.getElementById('activeChat');
  const newChatBtn = document.getElementById('newChatBtn');
  const startNewChat = document.getElementById('startNewChat');
  const currentUsername = document.getElementById('currentUsername');
  const userAvatar = document.getElementById('userAvatar');
  const partnerAvatar = document.getElementById('partnerAvatar');
  const backToChats = document.getElementById('backToChats');
  const userStatus = document.getElementById('userStatus');
  const chatStatus = document.getElementById('chatStatus');
  const typingIndicator = document.getElementById('typingIndicator');
  
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('user_id');
  const username = localStorage.getItem('username');
  const avatarColor = localStorage.getItem('avatarColor');
  
  let currentConversationId = null;
  let currentParticipant = null;
  let ws = null;
  let typingTimeout = null;
  
  if (!token || !userId || !username) {
    showNotification('Please login first', 'error');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
    return;
  }
  
  // Инициализация WebSocket
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    ws = new WebSocket(`${protocol}//${host}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      // Аутентификация
      ws.send(JSON.stringify({ 
        type: 'auth', 
        token 
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'newMessage':
          if (data.conversationId === currentConversationId) {
            addMessageToUI(data.message);
            loadConversations();
          }
          break;
          
        case 'typing':
          if (data.conversationId === currentConversationId && data.userId !== userId) {
            showTypingIndicator(data.isTyping);
          }
          break;
          
        case 'onlineStatus':
          updateOnlineStatus(data.onlineUsers);
          break;
          
        case 'messageRead':
          if (data.conversationId === currentConversationId) {
            markMessageAsRead(data.messageId);
          }
          break;
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      showNotification('Connection error. Trying to reconnect...', 'error');
      setTimeout(initWebSocket, 3000);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      showNotification('Connection lost. Reconnecting...', 'error');
      setTimeout(initWebSocket, 3000);
    };
  }
  
  // Установка информации о пользователе
  currentUsername.textContent = username;
  userAvatar.innerHTML = username.charAt(0).toUpperCase();
  if (avatarColor) {
    userAvatar.style.backgroundColor = avatarColor;
  }
  userStatus.textContent = 'Online';
  
  // Начальное состояние UI
  emptyChat.classList.remove('hidden');
  activeChat.classList.add('hidden');
  
  // Загрузка чатов
  async function loadConversations() {
    try {
      const response = await fetch('/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const conversations = await response.json();
        renderConversations(conversations);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      showNotification('Failed to load conversations', 'error');
    }
  }
  
  // Отображение чатов
  function renderConversations(conversations) {
    conversationsList.innerHTML = '';
    
    if (conversations.length === 0) {
      conversationsList.innerHTML = '<div class="empty-conversations">No conversations yet</div>';
      return;
    }
    
    conversations.forEach(conv => {
      const convElement = document.createElement('div');
      convElement.className = 'conversation-item';
      convElement.dataset.conversationId = conv.id;
      
      // Стиль аватара
      const avatarStyle = `background-color: ${conv.participant.avatarColor};`;
      const onlineStatus = conv.participant.isOnline ? 'online' : 'offline';
      
      convElement.innerHTML = `
        <div class="conversation-avatar ${onlineStatus}" style="${avatarStyle}">
          ${conv.participant.username.charAt(0).toUpperCase()}
        </div>
        <div class="conversation-info">
          <div class="participant">${conv.participant.username}</div>
          <div class="last-message">${conv.lastMessage ? conv.lastMessage.text : 'Start a conversation'}</div>
        </div>
        ${conv.unreadCount > 0 ? `<div class="unread-badge">${conv.unreadCount}</div>` : ''}
      `;
      
      convElement.addEventListener('click', () => {
        selectConversation(conv.id, conv.participant);
        document.body.classList.remove('chat-list-visible');
        document.body.classList.add('chat-visible');
      });
      
      conversationsList.appendChild(convElement);
    });
  }
  
  // Выбор чата
  function selectConversation(conversationId, participant) {
    currentConversationId = conversationId;
    currentParticipant = participant;
    
    // Обновление UI
    chatHeader.textContent = participant.username;
    chatStatus.textContent = participant.isOnline ? 'Online' : 'Offline';
    chatStatus.className = participant.isOnline ? 'online' : 'offline';
    partnerAvatar.innerHTML = participant.username.charAt(0).toUpperCase();
    partnerAvatar.style.backgroundColor = participant.avatarColor;
    emptyChat.classList.add('hidden');
    activeChat.classList.remove('hidden');
    
    // Подсветка выбранного чата
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.conversationId === conversationId) {
        item.classList.add('active');
      }
    });
    
    // Загрузка сообщений
    loadMessages();
  }
  
  // Поиск пользователей
  searchInput.addEventListener('input', debounce(searchUsers, 300));
  
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  async function searchUsers() {
    const query = searchInput.value.trim();
    if (!query || query.length < 2) {
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    
    try {
      const response = await fetch(`/users/search?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const users = await response.json();
        renderSearchResults(users);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      showNotification('Failed to search users', 'error');
    }
  }
  
  // Отображение результатов поиска
  function renderSearchResults(users) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';
    
    if (users.length === 0) {
      searchResults.innerHTML = '<div class="no-results">No users found</div>';
      return;
    }
    
    users.forEach(user => {
      const userElement = document.createElement('div');
      userElement.className = 'conversation-item';
      
      // Стиль аватара
      const avatarStyle = `background-color: ${user.avatarColor};`;
      const onlineStatus = user.isOnline ? 'online' : 'offline';
      
      userElement.innerHTML = `
        <div class="conversation-avatar ${onlineStatus}" style="${avatarStyle}">
          ${user.username.charAt(0).toUpperCase()}
        </div>
        <div class="conversation-info">
          <div class="participant">${user.username}</div>
        </div>
      `;
      
      userElement.addEventListener('click', () => {
        createConversation(user.id, user.username, user.avatarColor);
        searchInput.value = '';
        searchResults.innerHTML = '';
      });
      
      searchResults.appendChild(userElement);
    });
  }
  
  // Создание чата
  async function createConversation(userId, username, avatarColor) {
    try {
      const response = await fetch('/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ participantId: userId })
      });
      
      if (response.ok) {
        const data = await response.json();
        selectConversation(data.conversationId, {
          id: data.participant.id,
          username: username,
          avatarColor: avatarColor,
          isOnline: data.participant.isOnline
        });
        loadConversations();
        showNotification(`Conversation with ${username} started`, 'success');
        document.body.classList.remove('chat-list-visible');
        document.body.classList.add('chat-visible');
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      showNotification('Failed to create conversation', 'error');
    }
  }
  
  // Загрузка сообщений
  async function loadMessages() {
    if (!currentConversationId) return;
    
    try {
      const response = await fetch(`/messages/${currentConversationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const messages = await response.json();
        displayMessages(messages);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      showNotification('Failed to load messages', 'error');
    }
  }
  
  // Отображение сообщений
  function displayMessages(messages) {
    messagesContainer.innerHTML = '';
    typingIndicator.classList.add('hidden');
    
    if (messages.length === 0) {
      messagesContainer.innerHTML = `
        <div class="no-messages">
          <i class="fas fa-comment-alt"></i>
          <p>No messages yet. Say hello to start the conversation!</p>
        </div>
      `;
      return;
    }
    
    messages.forEach(msg => {
      addMessageToUI(msg);
    });
    
    // Прокрутка вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Добавление сообщения в UI
  function addMessageToUI(msg) {
    const messageElement = document.createElement('div');
    const isSent = msg.senderId === userId;
    
    messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
    messageElement.dataset.messageId = msg.id;
    
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
      ${msg.text}
      <div class="message-time">
        ${time}
        ${isSent ? `<span class="message-status">${msg.read ? '✓✓' : '✓'}</span>` : ''}
      </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Пометить сообщение как прочитанное
  function markMessageAsRead(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
      const statusElement = messageElement.querySelector('.message-status');
      if (statusElement) {
        statusElement.textContent = '✓✓';
      }
    }
  }
  
  // Отправка сообщения
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentConversationId) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'sendMessage',
        conversationId: currentConversationId,
        text
      }));
      
      // Сброс индикатора набора
      sendTypingStatus(false);
      messageInput.value = '';
    } else {
      showNotification('Connection lost. Message not sent.', 'error');
    }
  }
  
  // Обновление онлайн-статуса
  function updateOnlineStatus(onlineUsers) {
    // Обновить статус в списке чатов
    document.querySelectorAll('.conversation-item').forEach(item => {
      const conversationId = item.dataset.conversationId;
      if (!conversationId) return;
      
      const conversation = conversations[conversationId];
      if (!conversation) return;
      
      const participantId = conversation.participants.find(id => id !== userId);
      const isOnline = onlineUsers.includes(participantId);
      
      const avatar = item.querySelector('.conversation-avatar');
      if (avatar) {
        avatar.classList.toggle('online', isOnline);
        avatar.classList.toggle('offline', !isOnline);
      }
    });
    
    // Обновить статус в активном чате
    if (currentParticipant) {
      const isOnline = onlineUsers.includes(currentParticipant.id);
      chatStatus.textContent = isOnline ? 'Online' : 'Offline';
      chatStatus.className = isOnline ? 'online' : 'offline';
    }
  }
  
  // Индикатор набора сообщения
  function showTypingIndicator(isTyping) {
    if (isTyping) {
      typingIndicator.textContent = `${currentParticipant.username} is typing...`;
      typingIndicator.classList.remove('hidden');
    } else {
      typingIndicator.classList.add('hidden');
    }
  }
  
  // Отправка статуса набора
  function sendTypingStatus(isTyping) {
    if (ws && ws.readyState === WebSocket.OPEN && currentConversationId) {
      ws.send(JSON.stringify({
        type: 'typing',
        conversationId: currentConversationId,
        isTyping
      }));
    }
  }
  
  // Обработчики событий
  sendBtn.addEventListener('click', sendMessage);
  
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  
  messageInput.addEventListener('input', () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    
    sendTypingStatus(true);
    
    typingTimeout = setTimeout(() => {
      sendTypingStatus(false);
      typingTimeout = null;
    }, 3000);
  });
  
  newChatBtn.addEventListener('click', () => {
    searchInput.value = '';
    document.getElementById('searchResults').innerHTML = '';
    searchInput.focus();
  });
  
  startNewChat.addEventListener('click', () => {
    searchInput.focus();
  });
  
  backToChats.addEventListener('click', () => {
    document.body.classList.remove('chat-visible');
    document.body.classList.add('chat-list-visible');
  });
  
  // Инициализация
  initWebSocket();
  loadConversations();
  document.body.classList.add('chat-list-visible');
});

// Показ уведомления
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}