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
        this.puddleIndices = [];

        // 5处分布在主河道两侧不同海拔的坑洼关卡定义
        this.puddles = [
            { x: -50, z: -40, radius: 15, depth: 3.8 }, // 左上高山堰塞湖
            { x: 45, z: -30, radius: 13, depth: 3.5 },  // 右上泥坑
            { x: -45, z: 25, radius: 16, depth: 4.0 },  // 左下死水洼地
            { x: 40, z: 35, radius: 14, depth: 3.6 },   // 右下阶梯坑洼
            { x: 35, z: -2, radius: 11, depth: 3.2 }    // 中右死水池
        ];

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const idx = i * gridSize + j;
                const x = (j / (gridSize - 1) - 0.5) * worldSize;
                const z = (i / (gridSize - 1) - 0.5) * worldSize;

                const riverCenter = Math.sin(z * 0.04) * 22;
                const distToRiver = Math.abs(x - riverCenter);

                let h = 0;
                if (distToRiver < 14) {
                    h = -4.0 + Math.pow(distToRiver / 14, 2) * 4.0;
                } else {
                    const mudDistance = distToRiver - 14;
                    h = Math.min(12, mudDistance * 0.3 + Math.sin(x * 0.15) * Math.cos(z * 0.15) * 2.0);
                }

                // 坑洼高程挖坑计算
                let isPuddleCell = false;
                for (let p of this.puddles) {
                    const distToPuddle = Math.hypot(x - p.x, z - p.z);
                    if (distToPuddle < p.radius) {
                        const factor = Math.cos((distToPuddle / p.radius) * (Math.PI / 2));
                        h -= p.depth * factor;
                        if (distToPuddle < p.radius * 0.85) {
                            isPuddleCell = true;
                        }
                    }
                }

                if (isPuddleCell) {
                    this.puddleIndices.push(idx);
                }

                const slope = (z / worldSize) * -4;
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
        const factorMult = (Math.PI / 2) / radius;
        let terrainModified = false;

        for (let i = Math.max(0, gz - radiusCells); i <= Math.min(gridSize - 1, gz + radiusCells); i++) {
            for (let j = Math.max(0, gx - radiusCells); j <= Math.min(gridSize - 1, gx + radiusCells); j++) {
                const idx = i * gridSize + j;
                const cellX = (j / (gridSize - 1) - 0.5) * worldSize;
                const cellZ = (i / (gridSize - 1) - 0.5) * worldSize;

                const dist = Math.hypot(cellX - point.x, cellZ - point.z);
                if (dist <= radius) {
                    const factor = Math.cos(dist * factorMult);

                    if (toolType === 'dig') {
                        this.terrainHeights[idx] = Math.max(-10.0, this.terrainHeights[idx] - strength * factor);
                        terrainModified = true;

                        if (Math.random() < 0.3 && onParticleSpawn) {
                            onParticleSpawn(cellX, this.terrainHeights[idx] + 0.5, cellZ);
                        }
                    } else if (toolType === 'dam') {
                        this.terrainHeights[idx] = Math.min(15.0, this.terrainHeights[idx] + strength * factor);
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
