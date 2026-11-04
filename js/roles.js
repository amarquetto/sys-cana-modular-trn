
// Definição das roles e permissões
const ROLE_MENUS = {
    'admin': [
        { label: 'Página inicial', url: 'home.html' },
        { label: 'Estoque', url: 'estoque.html' },
        { label: 'Compras', url: 'compras.html' },
        { label: 'Comercial', url: 'comercial.html' },
        { label: 'Financeiro', url: 'financeiro.html' },
        { label: 'Faturamento', url: 'faturamento.html' },
        { label: 'Folha', url: 'folha.html' },
        { label: 'PCP', url: 'pcp.html' }
    ],
    'compras': [
        { label: 'Página inicial', url: 'home.html' },
        { label: 'Compras', url: 'compras.html' },
        { label: 'Estoque', url: 'estoque.html' }
    ],
    'financeiro': [
        { label: 'Página inicial', url: 'home.html' },
        { label: 'Financeiro', url: 'financeiro.html' },
        { label: 'Faturamento', url: 'faturamento.html' }
    ],
    'pcp': [
        { label: 'Página inicial', url: 'home.html' },
        { label: 'PCP', url: 'pcp.html' },
        { label: 'Estoque', url: 'estoque.html' }
    ]
};

document.addEventListener('DOMContentLoaded', async () => {
    // Aborta se estiver na tela de login para não dar erro
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') return;

    if (!window.supabase) {
        console.error("Supabase não carregado.");
        return;
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
            window.location.href = 'index.html';
            return;
        }

        const email = user.email;
        const userEmailSpan = document.getElementById('user-email');
        if(userEmailSpan) userEmailSpan.innerText = email;

        // Regra simples para definir a role baseada no e-mail
        let userRole = 'admin'; 
        if (email.includes('compras')) userRole = 'compras';
        if (email.includes('finance')) userRole = 'financeiro';
        if (email.includes('pcp')) userRole = 'pcp';

        const menus = ROLE_MENUS[userRole] || ROLE_MENUS['admin'];
        
        // 1. Trata o menu antigo (ul#menu-items) das telas originais
        const oldMenuList = document.getElementById('menu-items');
        if (oldMenuList) {
            oldMenuList.innerHTML = ''; // Limpa menu carregando
            menus.forEach(menu => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = menu.url;
                a.innerText = menu.label;
                
                if (window.location.pathname.includes(menu.url)) {
                    a.classList.add('active');
                }
                
                li.appendChild(a);
                oldMenuList.appendChild(li);
            });
        }

        // 2. Trata o menu novo exclusivo da tela do Financeiro (ul.sidebar-menu)
        const newMenuList = document.querySelector('.sidebar-menu');
        if (newMenuList && window.location.pathname.includes('financeiro.html')) {
            const firstLi = newMenuList.querySelector('li');
            if(firstLi) {
                firstLi.innerHTML = '<a href="home.html" style="color: #e6c84c; border-left: none;"><i class="fas fa-home" style="margin-right:8px;"></i> Voltar ao ERP Principal</a>';
            }
        }

        // 3. Configura Logout Universal (Pega qualquer botão de sair)
        const logoutBtns = document.querySelectorAll('#logout-btn, .btn-outline');
        logoutBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await supabase.auth.signOut();
                window.location.href = 'index.html';
            });
        });

    } catch(err) {
        console.error("Erro na validação do usuário:", err);
        window.location.href = 'index.html';
    }
});
    