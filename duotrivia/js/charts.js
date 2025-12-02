// charts.js
// Módulo simple para renderizar gráficas (barras y pastel) en Canvas 2D sin dependencias.

export class SimpleCharts {
    drawLine(canvas, { series = [] } = {}) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        this._bg(ctx, w, h);

        const padding = 40;
        const chartW = w - padding * 2;
        const chartH = h - padding * 2;
        const originX = padding;
        const originY = h - padding;

        // Axes (0-100%)
        ctx.strokeStyle = '#223341';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + chartW, originY);
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX, originY - chartH);
        ctx.stroke();

        // Grid + labels
        ctx.font = '12px Segoe UI, system-ui, sans-serif';
        ctx.fillStyle = '#9bb3c4';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let p = 0; p <= 100; p += 20) {
            const y = originY - (p / 100) * chartH;
            ctx.strokeStyle = 'rgba(34,51,65,0.35)';
            ctx.beginPath();
            ctx.moveTo(originX, y + 0.5);
            ctx.lineTo(originX + chartW, y + 0.5);
            ctx.stroke();
            ctx.fillText(p + '%', originX - 8, y);
        }

        if (!series || series.length === 0) return;

        const n = series.length;
        const stepX = n > 1 ? chartW / (n - 1) : 0;

        // Line
        ctx.beginPath();
        series.forEach((v, i) => {
            const x = originX + i * stepX;
            const y = originY - (Math.max(0, Math.min(100, v)) / 100) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#00e0ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Points
        ctx.fillStyle = 'rgba(0,224,255,0.28)';
        series.forEach((v, i) => {
            const x = originX + i * stepX;
            const y = originY - (Math.max(0, Math.min(100, v)) / 100) * chartH;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    drawBars(canvas, { correct = 0, incorrect = 0 } = {}) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background grid
        this._bg(ctx, w, h);

        const padding = 40;
        const chartW = w - padding * 2;
        const chartH = h - padding * 2;
        const maxVal = Math.max(1, correct, incorrect);

        const barW = Math.min(140, chartW / 3);
        const gap = (chartW - barW * 2) / 3;

        const bars = [
            { label: 'Correctas', value: correct, color: '#3ddc97' },
            { label: 'Incorrectas', value: incorrect, color: '#ff3860' }
        ];

        ctx.font = '14px Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        bars.forEach((b, i) => {
            const x = padding + gap + i * (barW + gap) + barW / 2;
            const barH = (b.value / maxVal) * chartH;
            const yTop = h - padding - barH;

            // Bar
            this._roundedRect(ctx, x - barW / 2, yTop, barW, barH, 10);
            ctx.fillStyle = this._rgba(b.color, 0.25);
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = this._rgba(b.color, 0.6);
            ctx.stroke();

            // Value
            ctx.fillStyle = '#d8e6f0';
            ctx.fillText(String(b.value), x, yTop - 6);

            // Label
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#9bb3c4';
            ctx.fillText(b.label, x, h - padding + 10);
            ctx.textBaseline = 'bottom';
        });
    }

    drawPie(canvas, { correct = 0, incorrect = 0 } = {}) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        this._bg(ctx, w, h);

        const total = Math.max(0, correct + incorrect);
        const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.32;
        const slices = [
            { label: 'Correctas', value: correct, color: '#3ddc97' },
            { label: 'Incorrectas', value: incorrect, color: '#ff3860' }
        ];

        let start = -Math.PI / 2;
        ctx.lineWidth = 1;
        slices.forEach(s => {
            const frac = total > 0 ? s.value / total : 0;
            const end = start + frac * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, start, end);
            ctx.closePath();
            ctx.fillStyle = this._rgba(s.color, 0.25);
            ctx.fill();
            ctx.strokeStyle = this._rgba(s.color, 0.6);
            ctx.stroke();
            start = end;
        });

        // Legend
        const legendX = 16, legendY = 16;
        ctx.font = '14px Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        slices.forEach((s, i) => {
            const y = legendY + i * 22;
            ctx.fillStyle = this._rgba(s.color, 0.6);
            ctx.fillRect(legendX, y - 6, 14, 14);
            ctx.fillStyle = '#cfe4f2';
            const percent = total > 0 ? Math.round((s.value / total) * 100) : 0;
            ctx.fillText(`${s.label}: ${s.value} (${percent}%)`, legendX + 20, y);
        });
    }

    _bg(ctx, w, h) {
        ctx.save();
        ctx.fillStyle = '#0d141a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#17222b';
        ctx.lineWidth = 1;
        for (let y = 0; y <= h; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(w, y + 0.5);
            ctx.stroke();
        }
        ctx.restore();
    }

    _rgba(hex, a) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
    }

    _roundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
}
