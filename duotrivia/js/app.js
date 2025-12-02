// app.js
// Inicializa la interfaz y conecta eventos con la clase Chatbot.

import { Chatbot } from './chatbot.js';
import { SimpleCharts } from './charts.js';

class App {
    constructor() {
        this.logEl = document.getElementById('chat-log');
        this.formEl = document.getElementById('chat-form');
        this.inputEl = document.getElementById('user-input');

        // Panel stats
        this.scoreEl = document.getElementById('stat-score');
        this.streakEl = document.getElementById('stat-streak');
        this.totalEl = document.getElementById('stat-total');
        this.accEl = document.getElementById('stat-accuracy');

        this.bot = new Chatbot(this.updateStats.bind(this));

        // Charts
        this.charts = new SimpleCharts();
        this.modalEl = document.getElementById('charts-modal');
        this.btnOpenCharts = document.getElementById('btn-open-charts');
        this.btnCloseCharts = document.getElementById('btn-close-charts');
        this.barCanvas = document.getElementById('barChart');
        this.pieCanvas = document.getElementById('pieChart');
        this.lineCanvas = document.getElementById('lineChart');
        this.kpiAccEl = document.getElementById('kpi-accuracy');
        this.kpiTrendEl = document.getElementById('kpi-trend');
        this.datasetPanel = document.getElementById('datasetPanel');
        this.dataset = null;
        this.categoryChart = null; // Chart.js instance
        this._stats = { score: 0, streak: 0, total: 0, correct: 0 };
        this._lastAcc = 0;
        this.accuracySeries = [];

        this._wireEvents();
        this._intro();
    }

    _wireEvents() {
        this.formEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = (this.inputEl.value || '').trim();
            if (!text) return;
            this._renderUser(text);
            this.inputEl.value = '';

            const reply = await this.bot.processUserMessage(text);
            this._renderReply(reply);
        });

        // Delegación de clic para opciones en tarjetas.
        this.logEl.addEventListener('click', (e) => {
            const btn = e.target.closest('button.option-btn');
            if (!btn) return;
            const index = Number(btn.getAttribute('data-index'));
            // Deshabilitar todas las opciones inmediatamente
            const card = btn.closest('.trivia-card');
            if (card) {
                card.querySelectorAll('.option-btn').forEach(b => {
                    b.classList.add('disabled');
                });
            }
            const feedback = this.bot.handleAnswer(index);
            // Marcar correctas/incorrectas
            if (card) {
                const corr = Number(card.getAttribute('data-correct-index'));
                card.querySelectorAll('.option-btn').forEach(b => {
                    const i = Number(b.getAttribute('data-index'));
                    if (i === corr) b.classList.add('correct');
                    else if (i === index) b.classList.add('wrong');
                });
            }
            this._renderReply(feedback);
        });

        // Charts open/close
        if (this.btnOpenCharts) this.btnOpenCharts.onclick = () => this._openCharts();
        if (this.btnCloseCharts) this.btnCloseCharts.onclick = () => this._closeCharts();

        // Tabs switching
        document.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-btn');
            if (!tab) return;
            const container = tab.closest('.modal-content');
            if (!container) return;
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-target');
            const nodes = container.querySelectorAll('.chart-area > *');
            nodes.forEach(n => n.classList.add('hidden'));
            const show = container.querySelector(target);
            if (show) {
                show.classList.remove('hidden');
                if (target === '#datasetPanel') this._initDatasetPanel();
            }
        });

        // Redraw on resize (cheap)
        window.addEventListener('resize', () => {
            if (!this.modalEl || this.modalEl.classList.contains('hidden')) return;
            this._drawCharts();
        });
    }

    _intro() {
        this._renderReply({ type: 'text', from: 'DuoTrivia', text: 'Hola, soy DuoTrivia. Escribe "jugar" para comenzar o "ayuda" para ver comandos.' });
    }

    updateStats({ score, streak, total, correct }) {
        this._stats = { score, streak, total, correct };
        this.scoreEl.textContent = score;
        this.streakEl.textContent = streak;
        this.totalEl.textContent = total;
        const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
        this.accEl.textContent = acc + '%';

        // KPI update
        if (this.kpiAccEl) this.kpiAccEl.textContent = acc + '%';
        if (this.kpiTrendEl) {
            let trend = '—';
            if (total > 0) {
                if (acc > this._lastAcc) trend = '↑ Mejorando';
                else if (acc < this._lastAcc) trend = '↓ Empeoró';
                else trend = '→ Sin cambio';
            }
            this.kpiTrendEl.textContent = trend;
        }
        this._lastAcc = acc;

        // Line series
        if (total > (this.accuracySeries.length)) {
            this.accuracySeries.push(acc);
        } else if (total === 0) {
            this.accuracySeries = [];
        }

        // Live update if modal open
        if (this.modalEl && !this.modalEl.classList.contains('hidden')) this._drawCharts();
    }

    _renderUser(text) {
        const el = document.createElement('div');
        el.className = 'message user';
        el.textContent = text;
        this.logEl.appendChild(el);
        this._scrollBottom();
    }

    _renderReply(reply) {
        if (!reply) return;
        if (reply.type === 'text') {
            const el = document.createElement('div');
            el.className = 'message bot';
            el.textContent = reply.text;
            this.logEl.appendChild(el);
        } else if (reply.type === 'card') {
            const wrap = document.createElement('div');
            wrap.className = 'message bot';
            wrap.innerHTML = reply.html;
            this.logEl.appendChild(wrap);
        }
        this._scrollBottom();
    }

    _scrollBottom() {
        requestAnimationFrame(() => {
            this.logEl.scrollTop = this.logEl.scrollHeight;
        });
    }

    _openCharts() {
        if (!this.modalEl) return;
        this.modalEl.classList.remove('hidden');
        this._drawCharts();
    }

    _closeCharts() {
        if (!this.modalEl) return;
        this.modalEl.classList.add('hidden');
    }

    _drawCharts() {
        const correct = this._stats.correct || 0;
        const incorrect = Math.max(0, (this._stats.total || 0) - correct);
        if (this.barCanvas) this.charts.drawBars(this.barCanvas, { correct, incorrect });
        if (this.pieCanvas) this.charts.drawPie(this.pieCanvas, { correct, incorrect });
        if (this.lineCanvas) this.charts.drawLine(this.lineCanvas, { series: this.accuracySeries });
    }

    async _initDatasetPanel() {
        try {
            // Lazy-load Chart.js
            await this._ensureChartJs();
            // Load dataset once
            if (!this.dataset) {
                const res = await fetch('duotrivia/cultura2.json');
                this.dataset = await res.json();
                if (!this.dataset || !Array.isArray(this.dataset.questions)) {
                    throw new Error('Estructura JSON inválida: se espera { questions: [...] }');
                }
            }

            const questions = this.dataset.questions;
            // Build difficulty counts (easy, medium, hard)
            const diffCounts = { easy: 0, medium: 0, hard: 0 };
            questions.forEach(q => {
                const d = (q.difficulty || '').toLowerCase();
                if (d === 'easy') diffCounts.easy++;
                else if (d === 'medium') diffCounts.medium++;
                else if (d === 'hard') diffCounts.hard++;
            });

            const labels = ['Fácil', 'Media', 'Difícil'];
            const values = [diffCounts.easy, diffCounts.medium, diffCounts.hard];

            const ctx = document.getElementById('category-chart').getContext('2d');
            if (this.categoryChart) {
                this.categoryChart.destroy();
            }
            this.categoryChart = new window.Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Preguntas por Dificultad',
                        data: values,
                        backgroundColor: ['#4e73df', '#1cc88a', '#e74a3b'],
                        borderColor: ['#2e59d9', '#17a673', '#d94a35'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } }
                }
            });

            // Filter by difficulty
            const select = document.getElementById('difficulty-filter');
            const list = document.getElementById('questions-list');
            const renderList = () => {
                const diff = select.value;
                const filtered = questions.filter(q => (q.difficulty === diff));
                list.innerHTML = '';
                filtered.forEach(item => {
                    const li = document.createElement('li');
                    const correctText = Array.isArray(item.options) && typeof item.correct_answer === 'number'
                        ? item.options[item.correct_answer]
                        : (item.correct || 'N/A');
                    li.textContent = `Pregunta: ${item.question} | Correcta: ${correctText}`;
                    list.appendChild(li);
                });
            };
            if (!select._wired) {
                select.addEventListener('change', renderList);
                select._wired = true;
            }
            renderList();
        } catch (e) {
            console.warn('Dataset panel error:', e);
        }
    }

    _ensureChartJs() {
        if (window.Chart) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            s.onload = () => resolve();
            s.onerror = (e) => reject(e);
            document.head.appendChild(s);
        });
    }
}

// Iniciar
new App();
