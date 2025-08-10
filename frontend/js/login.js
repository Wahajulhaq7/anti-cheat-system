async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('http://localhost:8000/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        console.log('Login response:', data); // Debug logging

        if (response.ok) {
            // Store user data in localStorage
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('role', data.role.toLowerCase());
            localStorage.setItem('username', username);
            localStorage.setItem('user_id', data.id);

            // Redirect based on role
            switch(data.role.toLowerCase()) {
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
                    console.error('Unknown role:', data.role);
                    alert('Invalid user role');
            }
        } else {
            throw new Error(data.detail || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    }
}