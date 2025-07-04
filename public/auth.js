// Show notification
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

// Login form
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  
  if (!username || !password) {
    showNotification('Please fill all fields', 'error');
    return;
  }
  
  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user_id', data.user.id);
      localStorage.setItem('username', data.user.username);
      localStorage.setItem('avatarColor', data.user.avatarColor);
      window.location.href = 'chat.html';
    } else {
      showNotification(data.error || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showNotification('Server error', 'error');
  }
});

// Registration form
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  const confirmPassword = document.getElementById('confirmPassword').value.trim();
  
  if (!username || !password || !confirmPassword) {
    showNotification('Please fill all fields', 'error');
    return;
  }
  
  if (password !== confirmPassword) {
    showNotification('Passwords do not match', 'error');
    return;
  }
  
  if (password.length < 6) {
    showNotification('Password must be at least 6 characters', 'error');
    return;
  }
  
  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showNotification('Registration successful! Please login.', 'success');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1500);
    } else {
      showNotification(data.error || 'Registration failed', 'error');
    }
  } catch (error) {
    console.error('Registration error:', error);
    showNotification('Server error', 'error');
  }
});