document.addEventListener('DOMContentLoaded', async () => {
    // A variável supabase é injetada globalmente via core.js/config.js
    if (!window.supabase) {
        console.error("Supabase client not initialized.");
        return;
    }

    try {
        const { data: notas, error } = await supabase
            .from('notas_fiscais')
            .select('*');

        if (error) throw error;

        // Atualizar Cards
        let totalFaturado = 0;
        let pendentes = 0;
        
        const tbody = document.getElementById('nfs-table-body');
        tbody.innerHTML = ''; // Limpar loading
        
        const clientesMap = {};

        notas.forEach(nf => {
            // Cards calc
            totalFaturado += Number(nf.valor);
            if (nf.status === 'Emitida') pendentes++;
            
            // Graph prep (agrupar por cliente)
            if (clientesMap[nf.cliente]) {
                clientesMap[nf.cliente] += Number(nf.valor);
            } else {
                clientesMap[nf.cliente] = Number(nf.valor);
            }

            // Popula tabela
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px; border: 1px solid #ddd;">${nf.numero_nf}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${nf.cliente}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${Number(nf.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">
                    <span style="padding: 4px 8px; border-radius: 4px; background-color: ${nf.status === 'Paga' ? '#d4edda' : '#fff3cd'}; color: ${nf.status === 'Paga' ? '#155724' : '#856404'}">
                        ${nf.status}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('total-faturado').innerText = totalFaturado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('nfs-pendentes').innerText = pendentes;

        // Renderizar Gráfico
        const labels = Object.keys(clientesMap);
        const data = Object.values(clientesMap);

        const ctx = document.getElementById('faturamentoChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Faturamento por Cliente (R$)',
                    data: data,
                    backgroundColor: 'rgba(46, 204, 113, 0.6)',
                    borderColor: 'rgba(39, 174, 96, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

    } catch (err) {
        console.error("Erro ao carregar faturamento:", err);
        document.getElementById('nfs-table-body').innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Erro ao carregar dados. Verifique a tabela no Supabase.</td></tr>`;
    }
});