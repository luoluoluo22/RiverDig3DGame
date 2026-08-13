/**
 * Hydraulic Flow Cellular Automata Physics Engine
 */
class HydraulicSimulation {
    constructor(gridSize, worldSize) {
        this.gridSize = gridSize;
        this.worldSize = worldSize;
        this.waterDepths = new Float32Array(gridSize * gridSize);
        this.flowVectors = new Array(gridSize * gridSize).fill(0).map(() => new THREE.Vector2());
    }

    step(terrainHeights, flowSpeedMultiplier, sourceRateMultiplier) {
        const gridSize = this.gridSize;
        const speed = 0.18 * flowSpeedMultiplier;
        const newWaterDepths = new Float32Array(this.waterDepths);

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

        // Downstream Outflow Drain (Bottom of Map Z = worldSize/2)
        for (let j = 0; j < gridSize; j++) {
            const idx = (gridSize - 1) * gridSize + j;
            newWaterDepths[idx] *= 0.5;
        }

        this.waterDepths.set(newWaterDepths);
    }

    resetWaterChannel(terrainHeights) {
        for (let i = 0; i < this.waterDepths.length; i++) {
            this.waterDepths[i] = 0;
        }
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const idx = i * this.gridSize + j;
                const x = (j / (this.gridSize - 1) - 0.5) * this.worldSize;
                const z = (i / (this.gridSize - 1) - 0.5) * this.worldSize;
                const riverCenter = Math.sin(z * 0.05) * 15;
                if (Math.abs(x - riverCenter) < 10) {
                    this.waterDepths[idx] = 1.8;
                }
            }
        }
    }
}
