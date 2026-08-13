/**
 * HUD Control & UI Event Handler
 */
class UIController {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.initUIEvents();
    }

    initUIEvents() {
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                this.game.activeTool = target.getAttribute('data-tool');
            });
        });

        // Radius slider
        const radiusSlider = document.getElementById('brush-radius');
        radiusSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.game.brushRadius = val;
            document.getElementById('radius-val').innerText = val.toFixed(1);
            if (this.game.brushIndicator) {
                this.game.brushIndicator.scale.set(val, 1, val);
            }
        });

        // Strength slider
        const strengthSlider = document.getElementById('brush-strength');
        strengthSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.game.brushStrength = val;
            document.getElementById('strength-val').innerText = val.toFixed(2);
        });

        // Flow Speed slider
        const speedSlider = document.getElementById('flow-speed');
        speedSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.game.flowSpeedMultiplier = val;
            document.getElementById('speed-val').innerText = val.toFixed(1) + 'x';
        });

        // Source Rate slider
        const sourceSlider = document.getElementById('source-rate');
        sourceSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.game.sourceRateMultiplier = val;
            document.getElementById('source-val').innerText = val.toFixed(1) + 'x';
        });

        // Action Buttons
        document.getElementById('btn-reset-water').addEventListener('click', () => {
            this.game.hydraulicSim.resetWaterChannel(this.game.terrainManager.terrainHeights, this.game.terrainManager.puddleIndices);
        });

        document.getElementById('btn-reset-all').addEventListener('click', () => {
            this.game.resetAllData();
            this.hideVictoryModal();
        });

        document.getElementById('btn-restart-victory').addEventListener('click', () => {
            this.game.resetAllData();
            this.hideVictoryModal();
        });
    }

    updateStats(totalWater, duckCount, minY, flowSpeed) {
        document.getElementById('stat-water').innerText = totalWater;
        document.getElementById('stat-ducks').innerText = duckCount;
        document.getElementById('stat-miny').innerText = minY.toFixed(1) + 'm';
        document.getElementById('stat-flow').innerText = (1.2 * flowSpeed).toFixed(1) + 'm/s';
    }

    updateDrainageProgress(pct) {
        const pctEl = document.getElementById('puddle-percentage');
        const fillEl = document.getElementById('progress-bar-fill');
        const statusEl = document.getElementById('drainage-status-text');

        if (pctEl) pctEl.innerText = pct;
        if (fillEl) fillEl.style.height = pct + '%';

        if (statusEl) {
            if (pct > 70) {
                statusEl.innerText = '坑洼高水位！开渠引水入河';
            } else if (pct > 30) {
                statusEl.innerText = '水位急速下降中...';
            } else if (pct > 0) {
                statusEl.innerText = '即将完全干涸！';
            } else {
                statusEl.innerText = '🏆 积水归 0%！通关！';
            }
        }

        if (pct === 0 && !this.victoryShown) {
            this.showVictoryModal();
        }
    }

    showVictoryModal() {
        this.victoryShown = true;
        const modal = document.getElementById('victory-modal');
        if (modal) modal.classList.remove('hidden');
    }

    hideVictoryModal() {
        this.victoryShown = false;
        const modal = document.getElementById('victory-modal');
        if (modal) modal.classList.add('hidden');
    }
}
