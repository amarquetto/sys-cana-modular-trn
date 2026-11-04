// Definição das roles e permissões de menu
const ROLE_MENUS = {
    'admin': [
        { label: 'Início', url: 'home.html' },
        { label: 'Estoque', url: 'estoque.html' },
        { label: 'Compras', url: 'compras.html' },
        { label: 'Comercial', url: 'comercial.html' },
        { label: 'Financeiro', url: 'financeiro.html' },
        { label: 'Faturamento', url: 'faturamento.html' },
        { label: 'Folha', url: 'folha.html' },
        { label: 'PCP', url: 'pcp.html' }
    ],
    'compras': [
        { label: 'Início', url: 'home.html' },
        { label: 'Compras', url: 'compras.html' },
        { label: 'Estoque', url: 'estoque.html' }
    ],
    'financeiro': [
        { label: 'Início', url: 'home.html' },
        { label: 'Financeiro', url: 'financeiro.html' },
        { label: 'Faturamento', url: 'faturamento.html' }
    ],
    'pcp': [
        { label: 'Início', url: 'home.html' },
        { label: 'PCP', url: 'pcp.html' },
        { label: 'Estoque', url: 'estoque.html' }
    ]
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabase) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const email = user.email;
    document.getElementById('user-email').innerText = email;
    
    // Simplificação para fins de demonstração (Idealmente, isso vem de uma tabela de perfis)
    let userRole = 'admin'; 
    if (email.includes('compras')) userRole = 'compras';
    if (email.includes('finance')) userRole = 'financeiro';
    if (email.includes('pcp')) userRole = 'pcp';

    const menus = ROLE_MENUS[userRole] || ROLE_MENUS['admin'];
    const menuList = document.getElementById('menu-items');
    
    if (menuList) {
        menus.forEach(menu => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = menu.url;
            a.innerText = menu.label;
            
            // Highlight current page
            if (window.location.pathname.includes(menu.url)) {
                a.classList.add('active');
                a.style.fontWeight = 'bold';
                a.style.color = '#3498db';
            }
            
            li.appendChild(a);
            menuList.appendChild(li);
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        });
    }
});