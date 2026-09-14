import { appData } from './store.js';

export function getAverageRGB(imgSrc, callback) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 50; canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);
        try {
            const data = ctx.getImageData(0, 0, 50, 50).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i+3] < 255) continue; 
                r += data[i]; g += data[i+1]; b += data[i+2]; count++;
            }
            if (count === 0) { callback({ r: 76, g: 175, b: 80 }); return; }
            callback({ r: Math.floor(r / count), g: Math.floor(g / count), b: Math.floor(b / count) });
        } catch (e) { callback({ r: 76, g: 175, b: 80 }); }
    };
    img.onerror = () => callback({ r: 76, g: 175, b: 80 });
    img.src = imgSrc;
}

export function openCardGenerator(gameId) {
    const game = appData.games.find(g => g.id === gameId);
    if(!game) return;

    const wrapper = document.getElementById('export-card-wrapper');
    wrapper.style.setProperty('--dynamic-color', 'var(--accent-finished)');
    wrapper.style.setProperty('--dynamic-text', 'white');

    const bgLayer = document.getElementById('card-bg-layer');
    if (game.image) {
        bgLayer.style.display = 'block';
        getAverageRGB(game.image, (color) => {
            const rgbString = `rgb(${color.r}, ${color.g}, ${color.b})`;
            const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
            const textColor = luminance > 140 ? '#000000' : '#ffffff';
            wrapper.style.setProperty('--dynamic-color', rgbString);
            wrapper.style.setProperty('--dynamic-text', textColor);
        });

        const imgBlur = new Image();
        imgBlur.crossOrigin = "Anonymous";
        imgBlur.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 100; canvas.height = 100;
            ctx.filter = 'blur(8px)'; 
            ctx.drawImage(imgBlur, -10, -10, 120, 120);
            bgLayer.style.backgroundImage = `url(${canvas.toDataURL('image/jpeg', 0.8)})`;
        };
        imgBlur.src = game.image;
    } else {
        bgLayer.style.backgroundImage = 'none';
        bgLayer.style.display = 'none';
    }

    document.getElementById('card-title').innerText = game.title;
    const platObj = appData.platforms.find(p => p.name === game.platform) || { icon: '🎮', name: game.platform };
    document.getElementById('card-platform').innerHTML = `<span style="display:flex; align-items:center; gap:6px;">${platObj.icon} <span>${platObj.name}</span></span>`;
    
    const cat = appData.categories.find(c => c.id === game.catId);
    document.getElementById('card-cat').innerHTML = cat ? `📂 ${cat.name}` : '';

    let ratingText = game.userRating ? `🌟 ${game.userRating}/10` : '✔️ Zerado';
    if (game.is100) ratingText += ' 💎 100%';
    document.getElementById('card-rating-badge').innerText = ratingText;

    const portableBadge = game.isPortable ? '<div style="margin-top: 10px; color: var(--accent-playing); font-weight: bold; font-size: 0.95em;">🎒 Selo Anywhere Gamer: Ideal para Portáteis</div>' : '';
    document.getElementById('card-date').innerHTML = (game.dateFinished ? `Finalizado em: ${game.dateFinished}` : '') + portableBadge;

    const reviewEl = document.getElementById('card-review');
    if (game.review && game.review.trim() !== '') {
        reviewEl.innerText = `"${game.review}"`;
        reviewEl.style.display = 'block';
    } else {
        reviewEl.style.display = 'none';
    }

    document.getElementById('card-img-preview').innerHTML = game.image ? `<img src="${game.image}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">` : `🎮`;
    document.getElementById('modal-card-generator').showModal();
}

export function downloadCard(triggerToast) {
    const cardElement = document.getElementById('export-card-wrapper');
    html2canvas(cardElement, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim(),
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `ZeraLog_Card_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        if(triggerToast) triggerToast('Imagem salva!');
    });
}
