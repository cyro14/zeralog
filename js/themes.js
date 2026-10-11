// Temas: as variáveis de cor ficam em style.css (html[data-theme="..."]);
// aqui ficam só os dados para o seletor visual e a troca de tema.
export const THEMES = [
    { id: 'gog', name: 'Padrão', bg: '#0d0d13', card: '#17171f', text: '#e8e6f0', dots: ['#b366f0', '#8a5cf0', '#c792ea'] },
    { id: 'dark', name: 'Escuro', bg: '#121212', card: '#1e1e1e', text: '#ffffff', dots: ['#2196f3', '#4caf50', '#b388ff'] },
    { id: 'amoled', name: 'Preto Total', bg: '#000000', card: '#0c0c0c', text: '#f2f2f2', dots: ['#3ea6ff', '#3ddc84', '#b794ff'] },
    { id: 'light', name: 'Claro', bg: '#f4f5f7', card: '#ffffff', text: '#1a1d23', dots: ['#1565c0', '#2e7d32', '#6f42c1'] },
    { id: 'sepia', name: 'Papel', bg: '#f3ead7', card: '#fbf6e9', text: '#3b2f1e', dots: ['#2b6a8a', '#55743a', '#8a5a2b'] },
    { id: 'ocean', name: 'Oceano', bg: '#0a1520', card: '#102233', text: '#e6f1fb', dots: ['#4aa8ff', '#2ec4a6', '#a29bfe'] },
    { id: 'forest', name: 'Floresta', bg: '#0e1a13', card: '#15271d', text: '#e8f3ea', dots: ['#4fc3c9', '#6fcf7c', '#b39ddb'] },
    { id: 'sunset', name: 'Pôr do Sol', bg: '#180f1f', card: '#261633', text: '#fdf0e6', dots: ['#ff8a5c', '#6bd68f', '#e05c8a'] },
    { id: 'nord', name: 'Nord', bg: '#2e3440', card: '#3b4252', text: '#eceff4', dots: ['#88c0d0', '#a3be8c', '#b48ead'] },
    { id: 'dracula', name: 'Drácula', bg: '#1e1f29', card: '#282a36', text: '#f8f8f2', dots: ['#8be9fd', '#50fa7b', '#ff79c6'] },
    { id: 'pink', name: 'Rosa Pastel', bg: '#fff4f8', card: '#ffffff', text: '#4a2c3a', dots: ['#d94b87', '#3e9c78', '#8e5bd1'] },
    { id: 'gameboy', name: 'Game Boy', bg: '#0f380f', card: '#1b4a1b', text: '#d7efb4', dots: ['#7ec8a4', '#b5d334', '#d9e68a'] },
    { id: 'contrast', name: 'Alto Contraste', bg: '#000000', card: '#000000', text: '#ffffff', dots: ['#4fc3f7', '#00e676', '#ffea00'] }
];

export const DEFAULT_THEME = 'gog';
export const currentTheme = () => {
    const saved = localStorage.getItem('zeralog_theme') || DEFAULT_THEME;
    return THEMES.some(t => t.id === saved) ? saved : DEFAULT_THEME;
};

export function applyTheme(id) {
    const theme = THEMES.find(t => t.id === id) ? id : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('zeralog_theme', theme); } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEMES.find(t => t.id === theme).bg);
    document.querySelectorAll('.theme-swatch').forEach(b => {
        const on = b.dataset.theme === theme;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
    });
}

export function renderThemePicker() {
    const grid = document.getElementById('theme-grid');
    if (!grid) return;
    const cur = currentTheme();
    grid.innerHTML = THEMES.map(t => `
        <button type="button" role="radio" class="theme-swatch ${t.id === cur ? 'active' : ''}" aria-checked="${t.id === cur}" data-theme="${t.id}" onclick="changeTheme('${t.id}')">
            <span class="theme-prev" style="background:${t.bg}">
                <span class="theme-prev-card" style="background:${t.card}; color:${t.text}">Aa</span>
                <span class="theme-prev-dots">${t.dots.map(c => `<i style="background:${c}"></i>`).join('')}</span>
            </span>
            <span class="theme-name">${t.name}</span>
        </button>`).join('');
}
