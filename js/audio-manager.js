// AudioManager: simple WebAudio-based sounds and optional external audio mapping.
(function (global) {
    class AudioManager {
        constructor(mapping = {}) {
            this.mapping = mapping; // eventName -> url (optional)
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                this.ctx = null;
                console.warn('WebAudio not supported', e);
            }

            // Resume on first user gesture (some browsers block audio until then)
            this._boundResume = this._resumeOnFirstGesture.bind(this);
            document.addEventListener('click', this._boundResume, { once: true, capture: true });
        }

        _resumeOnFirstGesture() {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(e => console.warn('Audio resume failed', e));
            }
        }

        // Play a short tone using oscillator
        _playTone(freq = 440, type = 'sine', duration = 0.12, gain = 0.12, when = 0) {
            if (!this.ctx) return;
            const t0 = this.ctx.currentTime + when;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t0);
            g.gain.setValueAtTime(gain, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
            osc.connect(g);
            g.connect(this.ctx.destination);
            osc.start(t0);
            osc.stop(t0 + duration + 0.02);
        }

        // Simple chime sequence
        _playChime() {
            this._playTone(880, 'sine', 0.08, 0.08, 0);
            this._playTone(1100, 'sine', 0.06, 0.06, 0.06);
        }

        play(eventName) {
            // If mapping contains external url, try to play it with Audio element
            const url = this.mapping[eventName];
            if (url) {
                const a = new Audio(url);
                a.volume = 0.9;
                a.play().catch(e => console.warn('Audio element play failed', e));
                return;
            }

            // Built-in tones
            switch (eventName) {
                case 'click': this._playTone(1200, 'square', 0.05, 0.06); break;
                case 'correct': this._playChime(); break;
                case 'incorrect': this._playTone(200, 'sawtooth', 0.12, 0.18); break;
                case 'points': this._playTone(1400, 'triangle', 0.08, 0.06); break;
                // Quick tick used for countdown when time is low
                case 'time_tick': this._playTone(1200, 'sine', 0.04, 0.05); break;
                // More urgent pattern for the last seconds
                case 'time_last':
                    this._playTone(1200, 'square', 0.06, 0.08, 0);
                    this._playTone(1600, 'square', 0.04, 0.06, 0.06);
                    break;
                // General warning (fallback tone if no external file provided)
                case 'time_warning': this._playTone(800, 'sawtooth', 0.08, 0.09); break;
                case 'cancel': this._playTone(400, 'sine', 0.06, 0.06); break;
                default: this._playTone(800, 'sine', 0.04, 0.04); break;
            }
        }

        destroy() {
            try { document.removeEventListener('click', this._boundResume, { capture: true }); } catch (e) { }
            if (this.ctx) try { this.ctx.close(); } catch (e) { }
        }
    }

    global.AudioManager = AudioManager;
})(window);
