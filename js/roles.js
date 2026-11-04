// Definição das roles e permissões de menu
const ROLE_MENUS = {
    'admin': [
        { label: 'Página inicial', url: 'home.html', icon: 'fas fa-home' },
        { label: 'Estoque', url: 'estoque.html', icon: 'fas fa-boxes' },
        { label: 'Compras', url: 'compras.html', icon: 'fas fa-shopping-cart' },
        { label: 'Comercial', url: 'comercial.html', icon: 'fas fa-chart-line' },
        { label: 'Financeiro', url: 'financeiro.html', icon: 'fas fa-money-bill-wave' },
        { label: 'Faturamento', url: 'faturamento.html', icon: 'fas fa-file-invoice' },
        { label: 'Folha', url: 'folha.html', icon: 'fas fa-users' },
        { label: 'PCP', url: 'pcp.html', icon: 'fas fa-industry' }
    ],
    'compras': [
        { label: 'Página inicial', url: 'home.html', icon: 'fas fa-home' },
        { label: 'Compras', url: 'compras.html', icon: 'fas fa-shopping-cart' },
        { label: 'Estoque', url: 'estoque.html', icon: 'fas fa-boxes' }
    ],
    'financeiro': [
        { label: 'Página inicial', url: 'home.html', icon: 'fas fa-home' },
        { label: 'Financeiro', url: 'financeiro.html', icon: 'fas fa-money-bill-wave' },
        { label: 'Faturamento', url: 'faturamento.html', icon: 'fas fa-file-invoice' }
    ],
    'pcp': [
        { label: 'Página inicial', url: 'home.html', icon: 'fas fa-home' },
        { label: 'PCP', url: 'pcp.html', icon: 'fas fa-industry' },
        { label: 'Estoque', url: 'estoque.html', icon: 'fas fa-boxes' }
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
    const userEmailSpan = document.getElementById('user-email');
    if(userEmailSpan) userEmailSpan.innerText = email;
    
    // Simplificação para fins de demonstração (Idealmente, isso vem de uma tabela de perfis)
    let userRole = 'admin'; 
    if (email.includes('compras')) userRole = 'compras';
    if (email.includes('finance')) userRole = 'financeiro';
    if (email.includes('pcp')) userRole = 'pcp';

    const menus = ROLE_MENUS[userRole] || ROLE_MENUS['admin'];
    
    // Verifica se é a estrutura antiga (ul#menu-items) ou a nova (ul.sidebar-menu)
    const oldMenuList = document.getElementById('menu-items');
    const newMenuList = document.querySelector('.sidebar-menu');
    
    if (oldMenuList) {
        oldMenuList.innerHTML = '';
        menus.forEach(menu => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = menu.url;
            a.innerHTML = `<i class="${menu.icon || 'fas fa-circle'}" style="margin-right:8px;"></i> ${menu.label}`;
            
            if (window.location.pathname.includes(menu.url)) {
                a.classList.add('active');
                a.style.fontWeight = 'bold';
                a.style.color = '#3498db';
            }
            
            li.appendChild(a);
            oldMenuList.appendChild(li);
        });
    }

    // Para o financeiro novo, injetamos links absolutos em vez de abas
    if (newMenuList && window.location.pathname.includes('financeiro.html')) {
        // Limpa apenas a parte inicial para não matar as abas do financeiro
        const firstLi = newMenuList.querySelector('li');
        if(firstLi) {
             const homeLink = document.createElement('a');
             homeLink.href = 'home.html';
             homeLink.innerHTML = '<i class="fas fa-home"></i> Voltar ao ERP Principal';
             homeLink.style.color = '#e6c84c';
             firstLi.innerHTML = '';
             firstLi.appendChild(homeLink);
        }
    }

    // Logout Genérico
    const logoutBtn = document.getElementById('logout-btn') || document.querySelector('.btn-outline');
    if (logoutBtn) {
        // Se for o botão do financeiro (sem id), adicionamos listener
        if(!logoutBtn.id) {
             logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault(); // Evita o onclick hardcoded do html
                await supabase.auth.signOut();
                window.location.href = 'index.html';
            });
        } else {
            logoutBtn.addEventListener('click', async () => {
                await supabase.auth.signOut();
                window.location.href = 'index.html';
            });
        }
    }
});