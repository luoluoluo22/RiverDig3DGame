/**
 * Hydraulic Flow Cellular Automata Physics Engine
 */
class HydraulicSimulation {
    constructor(gridSize, worldSize) {
        this.gridSize = gridSize;
        this.worldSize = worldSize;
        this.waterDepths = new Float32Array(gridSize * gridSize);
        this.nextWaterDepths = new Float32Array(gridSize * gridSize);
        this.flowVectors = new Array(gridSize * gridSize).fill(0).map(() => new THREE.Vector2());
    }

    step(terrainHeights, flowSpeedMultiplier, sourceRateMultiplier) {
        const gridSize = this.gridSize;
        const speed = 0.18 * flowSpeedMultiplier;
        
        // Zero-allocation Double Buffering
        this.nextWaterDepths.set(this.waterDepths);
        const newWaterDepths = this.nextWaterDepths;

        // Upstream Source Inflow (Top of River Z = -worldSize/2)
        if (sourceRateMultiplier > 0) {
            const sourceInflow = 0.15 * sourceRateMultiplier;
            for (let j = 20; j <= 40; j++) {
                const idx = 2 * gridSize + j;
                this.waterDepths[idx] = Math.min(4.0, this.waterDepths[idx] + sourceInflow);
            }
        }

        // Cellular Automata Potential Difference Outflow Calculation
        for (let i = 1; i < gridSize - 1; i++) {
            for (let j = 1; j < gridSize - 1; j++) {
                const idx = i * gridSize + j;
                const d = this.waterDepths[idx];

                if (d <= 0.01) continue;

                const h = terrainHeights[idx];
                const totalP = h + d; // Hydraulic head potential

                const neighbors = [
                    (i - 1) * gridSize + j,
                    (i + 1) * gridSize + j,
                    i * gridSize + (j - 1),
                    i * gridSize + (j + 1)
                ];

                let totalOutflow = 0;
                let flowVecX = 0;
                let flowVecZ = 0;

                for (let nIdx of neighbors) {
                    const nD = this.waterDepths[nIdx];
                    const nH = terrainHeights[nIdx];
                    const nTotalP = nH + nD;

                    const diff = totalP - nTotalP;
                    if (diff > 0.01) {
                        let outflow = Math.min(d * 0.25, diff * 0.3) * speed;
                        newWaterDepths[nIdx] += outflow;
                        totalOutflow += outflow;

                        const ni = Math.floor(nIdx / gridSize);
                        const nj = nIdx % gridSize;
                        flowVecZ += (ni - i) * outflow;
                        flowVecX += (nj - j) * outflow;
                    }
                }

                newWaterDepths[idx] = Math.max(0, newWaterDepths[idx] - totalOutflow);
                this.flowVectors[idx].set(flowVecX, flowVecZ).normalize();
            }
        }

        // Downstream Outflow Drain (Bottom of Map, cover the last 4 rows to encompass the marker area)
        for (let i = gridSize - 4; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const idx = i * gridSize + j;
                newWaterDepths[idx] *= 0.1; // Drain effectively
            }
        }

        // Swap buffers instead of copying
        const temp = this.waterDepths;
        this.waterDepths = newWaterDepths;
        this.nextWaterDepths = temp;
    }

    resetWaterChannel(terrainHeights, puddleIndices = []) {
        this.puddleIndices = puddleIndices;
        for (let i = 0; i < this.waterDepths.length; i++) {
            this.waterDepths[i] = 0;
        }

        // 1. 填充主河道初始水深
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const idx = i * this.gridSize + j;
                const x = (j / (this.gridSize - 1) - 0.5) * this.worldSize;
                const z = (i / (this.gridSize - 1) - 0.5) * this.worldSize;
                const riverCenter = Math.sin(z * 0.04) * 22;
                if (Math.abs(x - riverCenter) < 12) {
                    this.waterDepths[idx] = 2.0;
                }
            }
        }

        // 2. 填充两侧 5 处坑洼死水池积水
        for (let idx of this.puddleIndices) {
            this.waterDepths[idx] = 2.6;
        }

        // 计算初始坑洼积水总量
        this.initialPuddleWater = 0;
        for (let idx of this.puddleIndices) {
            this.initialPuddleWater += this.waterDepths[idx];
        }
        if (this.initialPuddleWater <= 0) this.initialPuddleWater = 1;
    }

    getPuddleWaterPercentage() {
        if (!this.puddleIndices || this.puddleIndices.length === 0) return 0;

        let currentWater = 0;
        for (let idx of this.puddleIndices) {
            if (this.waterDepths[idx] > 0.05) {
                currentWater += this.waterDepths[idx];
            }
        }

        const pct = Math.round((currentWater / this.initialPuddleWater) * 100);
        return Math.max(0, Math.min(100, pct));
    }
}
