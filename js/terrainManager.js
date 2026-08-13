/**
 * Heightfield Terrain & 3D Shovel Modification Manager
 */
class TerrainManager {
    constructor(gridSize, worldSize) {
        this.gridSize = gridSize;
        this.worldSize = worldSize;
        this.terrainHeights = new Float32Array(gridSize * gridSize);
        this.resetHeights();
    }

    resetHeights() {
        const gridSize = this.gridSize;
        const worldSize = this.worldSize;

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const idx = i * gridSize + j;
                const x = (j / (gridSize - 1) - 0.5) * worldSize;
                const z = (i / (gridSize - 1) - 0.5) * worldSize;

                const riverCenter = Math.sin(z * 0.05) * 15;
                const distToRiver = Math.abs(x - riverCenter);

                let h = 0;
                if (distToRiver < 12) {
                    h = -3.5 + Math.pow(distToRiver / 12, 2) * 3.5;
                } else {
                    const mudDistance = distToRiver - 12;
                    h = Math.min(10, mudDistance * 0.35 + Math.sin(x * 0.2) * Math.cos(z * 0.2) * 1.5);
                }

                const slope = (z / worldSize) * -3;
                this.terrainHeights[idx] = h + slope;
            }
        }
    }

    applyTool(point, toolType, radius, strength, waterDepths, onParticleSpawn) {
        const gridSize = this.gridSize;
        const worldSize = this.worldSize;

        const gx = Math.round(((point.x + worldSize / 2) / worldSize) * (gridSize - 1));
        const gz = Math.round(((point.z + worldSize / 2) / worldSize) * (gridSize - 1));

        const radiusCells = Math.round(radius * (gridSize / worldSize) * 2.5);
        let terrainModified = false;

        for (let i = Math.max(0, gz - radiusCells); i <= Math.min(gridSize - 1, gz + radiusCells); i++) {
            for (let j = Math.max(0, gx - radiusCells); j <= Math.min(gridSize - 1, gx + radiusCells); j++) {
                const idx = i * gridSize + j;
                const cellX = (j / (gridSize - 1) - 0.5) * worldSize;
                const cellZ = (i / (gridSize - 1) - 0.5) * worldSize;

                const dist = Math.hypot(cellX - point.x, cellZ - point.z);
                if (dist <= radius) {
                    const factor = Math.cos((dist / radius) * (Math.PI / 2));

                    if (toolType === 'dig') {
                        this.terrainHeights[idx] -= strength * factor;
                        terrainModified = true;

                        if (Math.random() < 0.3 && onParticleSpawn) {
                            onParticleSpawn(cellX, this.terrainHeights[idx] + 0.5, cellZ);
                        }
                    } else if (toolType === 'dam') {
                        this.terrainHeights[idx] += strength * factor;
                        terrainModified = true;

                        if (this.terrainHeights[idx] > this.terrainHeights[idx] + waterDepths[idx] - 0.2) {
                            waterDepths[idx] *= 0.5;
                        }
                    } else if (toolType === 'spring') {
                        waterDepths[idx] = Math.min(5.0, waterDepths[idx] + 0.8 * factor);
                    } else if (toolType === 'smooth') {
                        let sumH = 0, count = 0;
                        for (let di = -1; di <= 1; di++) {
                            for (let dj = -1; dj <= 1; dj++) {
                                const ni = i + di, nj = j + dj;
                                if (ni >= 0 && ni < gridSize && nj >= 0 && nj < gridSize) {
                                    sumH += this.terrainHeights[ni * gridSize + nj];
                                    count++;
                                }
                            }
                        }
                        const avgH = sumH / count;
                        this.terrainHeights[idx] = THREE.MathUtils.lerp(this.terrainHeights[idx], avgH, 0.2 * factor);
                        terrainModified = true;
                    }
                }
            }
        }

        return terrainModified;
    }
}
