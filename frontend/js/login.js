// login.js
async function handleLogin(event) {
    event.preventDefault(); // Stop form from refreshing

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        alert("Please enter both username and password");
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
            throw new Error(data.detail || 'Login failed');
        }

        // ✅ Build one consistent object for all pages to use
        const formObj = {
            token: data.access_token,          // primary field expected by manage_adminexams.js
            access_token: data.access_token,   // fallback for any other page
            id: data.id,
            role: data.role?.toLowerCase(),
            username
        };

        // ✅ Save to localStorage
        localStorage.setItem('formObj', JSON.stringify(formObj));

        // ✅ Role-based navigation
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
                alert('Invalid user role');
                localStorage.removeItem('formObj'); // clean up bad data
        }

    } catch (error) {
        console.error('❌ Login error:', error);
        alert('Login failed: ' + error.message);
    }
}
