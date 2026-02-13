function cerrarSesion() {
    localStorage.removeItem('isLogged');
    // .replace impide que el usuario regrese a esta página dándole "atrás"
    window.location.replace('/login');
}

// Verificar sesión (Corregido: minúscula obligatoria)
function verificarSesion() {
    if (localStorage.getItem('isLogged') !== 'true') {
        window.location.href = '/login.html';
    }
}

// Solo ejecutar el código de envío si estamos en la página de login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, pass })
            });

            const data = await res.json();
            
            if (data.success) {
    localStorage.setItem('isLogged', 'true');
    
    // Animación de salida
    document.body.style.filter = 'blur(20px)';
    document.body.style.opacity = '0';
    document.body.style.transition = 'all 0.8s ease';
    
    // REDIRECCIÓN FORZADA (Prueba con la ruta completa)
    setTimeout(() => {
        window.location.href = '/index.html'; 
    }, 800);
            } else {
                const err = document.getElementById('errorMsg');
                if (err) {
                    err.style.opacity = '1';
                    setTimeout(() => err.style.opacity = '0', 3000);
                }
            }
        } catch (err) { 
    console.error("DETALLE DEL ERROR:", err); 
    alert("No se pudo conectar con el servidor. ¿Encendiste el Node?");
}
    });
}