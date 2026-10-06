// Plano (Free / Premium) e limites.
// ATENÇÃO: o app roda inteiro no navegador do usuário, então qualquer trava feita aqui é apenas organização
// da interface e pode ser contornada. Para cobrar de verdade, o plano precisa ser validado por um servidor
// (login + pagamento). Veja docs/PREMIUM.md.
export const PLANS = {
    free: { label: 'Gratuito', provider: 'local', cloudSync: false },
    premium: { label: 'Premium', provider: 'local', cloudSync: true }   // 'cloud' entra aqui quando existir
};
export const getPlan = () => {
    try { const p = localStorage.getItem('zeralog_plan'); return PLANS[p] ? p : 'free'; } catch (e) { return 'free'; }
};
export const planInfo = () => PLANS[getPlan()];
export const can = feature => !!planInfo()[feature];
