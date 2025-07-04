const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const WebSocket = require('ws');
const ngrok = require('ngrok');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = 8080;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// База данных в памяти
const users = [];
const conversations = {};
const onlineUsers = new Set();

// JWT secret
const JWT_SECRET = 'telegram_clone_secret_123';

// Регистрация пользователя
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (users.some(user => user.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      avatarColor: getRandomColor()
    };
    
    users.push(newUser);
    res.status(201).json({ 
      message: 'User created successfully',
      user: { 
        id: newUser.id, 
        username: newUser.username, 
        avatarColor: newUser.avatarColor 
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Вход пользователя
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const user = users.find(user => user.username === username);
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        avatarColor: user.avatarColor 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Middleware аутентификации
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
}

// Поиск пользователей
app.get('/users/search', authenticateToken, (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const results = users
      .filter(user => 
        user.username.toLowerCase().includes(query.toLowerCase()) && 
        user.id !== req.user.id
      )
      .map(user => ({ 
        id: user.id, 
        username: user.username,
        avatarColor: user.avatarColor,
        isOnline: onlineUsers.has(user.id)
      }));
    
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Создание чата
app.post('/conversations', authenticateToken, (req, res) => {
  try {
    const { participantId } = req.body;
    const currentUserId = req.user.id;
    
    if (!participantId) {
      return res.status(400).json({ error: 'Participant ID is required' });
    }
    
    const participant = users.find(u => u.id === participantId);
    if (!participant) return res.status(404).json({ error: 'User not found' });
    
    // Проверка существующего чата
    const existingConversation = Object.values(conversations).find(conv => 
      conv.participants.includes(currentUserId) && 
      conv.participants.includes(participantId)
    );
    
    if (existingConversation) {
      return res.json({ 
        conversationId: existingConversation.id,
        participant: { 
          id: participant.id, 
          username: participant.username,
          avatarColor: participant.avatarColor,
          isOnline: onlineUsers.has(participant.id)
        }
      });
    }
    
    // Создание нового чата
    const conversationId = Date.now().toString();
    conversations[conversationId] = {
      id: conversationId,
      participants: [currentUserId, participantId],
      messages: [],
      createdAt: new Date()
    };
    
    res.status(201).json({ 
      conversationId,
      participant: { 
        id: participant.id, 
        username: participant.username,
        avatarColor: participant.avatarColor,
        isOnline: onlineUsers.has(participant.id)
      }
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Получение чатов
app.get('/conversations', authenticateToken, (req, res) => {
  try {
    const userConversations = Object.values(conversations)
      .filter(conv => conv.participants.includes(req.user.id))
      .map(conv => {
        const participantId = conv.participants.find(id => id !== req.user.id);
        const participant = users.find(u => u.id === participantId);
        return {
          id: conv.id,
          participant: { 
            id: participant.id, 
            username: participant.username,
            avatarColor: participant.avatarColor,
            isOnline: onlineUsers.has(participant.id)
          },
          lastMessage: conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null,
          unreadCount: conv.messages.filter(m => !m.read && m.senderId !== req.user.id).length
        };
      })
      .sort((a, b) => {
        const aDate = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(0);
        const bDate = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(0);
        return bDate - aDate;
      });
    
    res.json(userConversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Получение сообщений
app.get('/messages/:conversationId', authenticateToken, (req, res) => {
  try {
    const conversation = conversations[req.params.conversationId];
    
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Пометить сообщения как прочитанные
    conversation.messages.forEach(msg => {
      if (msg.senderId !== req.user.id && !msg.read) {
        msg.read = true;
        // Уведомить отправителя о прочтении
        broadcast({
          type: 'messageRead',
          messageId: msg.id,
          conversationId: conversation.id
        });
      }
    });
    
    res.json(conversation.messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Веб-сокет соединения
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'auth':
          // Аутентификация пользователя
          jwt.verify(data.token, JWT_SECRET, (err, user) => {
            if (err) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
              return;
            }
            
            ws.userId = user.id;
            onlineUsers.add(user.id);
            
            // Уведомить всех о изменении статуса
            broadcastOnlineStatus();
            
            ws.send(JSON.stringify({ 
              type: 'authSuccess', 
              userId: user.id 
            }));
          });
          break;
          
        case 'sendMessage':
          // Отправка сообщения
          if (!ws.userId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
            return;
          }
          
          const { conversationId, text } = data;
          const conversation = conversations[conversationId];
          
          if (!conversation || !conversation.participants.includes(ws.userId)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Conversation not found' }));
            return;
          }
          
          const newMessage = {
            id: Date.now().toString(),
            senderId: ws.userId,
            text,
            timestamp: new Date(),
            read: false
          };
          
          conversation.messages.push(newMessage);
          
          // Отправить сообщение всем участникам чата
          broadcastToConversation(conversationId, {
            type: 'newMessage',
            conversationId,
            message: newMessage
          });
          break;
          
        case 'typing':
          // Уведомление о наборе сообщения
          if (!ws.userId) return;
          
          const { conversationId: typingConvId, isTyping } = data;
          broadcastToConversation(typingConvId, {
            type: 'typing',
            conversationId: typingConvId,
            userId: ws.userId,
            isTyping
          }, ws.userId);
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (ws.userId) {
      onlineUsers.delete(ws.userId);
      broadcastOnlineStatus();
    }
  });
});

// Вспомогательные функции
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function broadcastToConversation(conversationId, data, excludeUserId = null) {
  const conversation = conversations[conversationId];
  if (!conversation) return;
  
  wss.clients.forEach(client => {
    if (
      client.readyState === WebSocket.OPEN && 
      conversation.participants.includes(client.userId) &&
      client.userId !== excludeUserId
    ) {
      client.send(JSON.stringify(data));
    }
  });
}

function broadcastOnlineStatus() {
  const onlineList = Array.from(onlineUsers);
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'onlineStatus',
        onlineUsers: onlineList
      }));
    }
  });
}

function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F78FB3', '#778BEB', '#F8A5C2', '#63CDDA', '#CF6A87'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Запуск сервера и ngrok
server.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  
  try {
    // Запуск ngrok
    const url = await ngrok.connect({
      proto: 'http',
      addr: port,
      region: 'us'
    });
    
    console.log(`Ngrok tunnel created: ${url}`);
    console.log('Share this URL to access from anywhere:');
    console.log(`  ${url}/index.html`);
  } catch (error) {
    console.error('Ngrok error:', error);
    console.log('You can still use locally: http://localhost:8080');
  }
});