// 1. Wait for HTML to load, then attach listener
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

async function handleLogin(event) {
    event.preventDefault(); // Stop page reload

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorBox = document.getElementById('login-error-box');

    // 2. Clear previous errors and hide box
    if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.innerHTML = '';
    }

    // 3. Client-side validation
    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    try {
        const response = await fetch('http://localhost:8000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        console.log('🔍 Login response:', data);

        if (!response.ok) {
            // If 401/403, it's usually wrong credentials
            if (response.status === 401 || response.status === 403) {
                throw new Error("Wrong credentials"); 
            }
            throw new Error(data.detail || 'Login failed');
        }

        // 4. Success: Save data
        const formObj = {
            token: data.access_token,
            access_token: data.access_token,
            id: data.id,
            role: data.role?.toLowerCase(),
            username
        };

        // Save as object
        localStorage.setItem('formObj', JSON.stringify(formObj));
        
        // ✅ FIX: Save standalone keys so Student Page can find the ID
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('role', data.role?.toLowerCase());
        localStorage.setItem('username', username);     
        localStorage.setItem('user_id', data.id); // Saved twice to be safe

        // 5. Success: Redirect
        switch (formObj.role) {
            case 'admin':
                window.location.href = 'dashboard.html';
                break;
            case 'invigilator':
                window.location.href = 'invigilator.html'; 
                break;
            case 'student':
                window.location.href = 'student.html';
                break;
            default:
                showError('Invalid user role detected');
                localStorage.clear();
        }

    } catch (error) {
        console.error('❌ Login error:', error);
        
        // 6. Show Error in Red Box
        if (error.message.includes("Wrong credentials")) {
            showError('Wrong credentials');
        } else {
            showError(error.message);
        }
    }
}

// Helper function to show the red box
function showError(message) {
    const errorBox = document.getElementById('login-error-box');
    if (errorBox) {
        errorBox.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${message}</span>`;
        errorBox.style.display = 'flex'; // Shows the box
    } else {
        alert(message); // Fallback if HTML is missing the box
    }
}