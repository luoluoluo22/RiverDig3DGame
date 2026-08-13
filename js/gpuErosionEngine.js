/**
 * GPErosionEngine - WebGL / GPGPU Water Flow & Hydraulic Erosion Engine
 * Built using Three.js GPUComputationRenderer
 */
class GPErosionEngine {
    constructor(gridSize, worldSize, renderer) {
        this.gridSize = gridSize;
        this.worldSize = worldSize;
        this.renderer = renderer;

        const GPUComp = window.GPUComputationRenderer || (typeof THREE !== 'undefined' ? THREE.GPUComputationRenderer : null);
        if (!GPUComp) {
            console.warn("GPUComputationRenderer is not defined. Falling back to CPU simulation.");
            this.isSupported = false;
            return;
        }

        this.isSupported = true;
        this.gpuCompute = new GPUComp(gridSize, gridSize, renderer);

        // Check Float Texture Support
        if (renderer.capabilities.isWebGL2 === false) {
            this.gpuCompute.setDataType(THREE.HalfFloatType);
        } else {
            this.gpuCompute.setDataType(THREE.FloatType);
        }

        this.initTextures();
        this.initShaders();
    }

    initTextures() {
        this.dtTerrain = this.gpuCompute.createTexture();
        this.dtWater = this.gpuCompute.createTexture();

        const terrainArray = this.dtTerrain.image.data;
        const waterArray = this.dtWater.image.data;

        // 5 Puddles Definition
        const puddles = [
            { x: -50, z: -40, radius: 15, depth: 3.8 },
            { x: 45, z: -30, radius: 13, depth: 3.5 },
            { x: -45, z: 25, radius: 16, depth: 4.0 },
            { x: 40, z: 35, radius: 14, depth: 3.6 },
            { x: 35, z: -2, radius: 11, depth: 3.2 }
        ];

        this.puddleIndices = [];

        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const idx = (i * this.gridSize + j) * 4;
                const cellIdx = i * this.gridSize + j;
                const x = (j / (this.gridSize - 1) - 0.5) * this.worldSize;
                const z = (i / (this.gridSize - 1) - 0.5) * this.worldSize;

                const riverCenter = Math.sin(z * 0.04) * 22;
                const distToRiver = Math.abs(x - riverCenter);

                let h = 0;
                if (distToRiver < 14) {
                    h = -4.0 + Math.pow(distToRiver / 14, 2) * 4.0;
                } else {
                    const mudDistance = distToRiver - 14;
                    h = Math.min(12, mudDistance * 0.3 + Math.sin(x * 0.15) * Math.cos(z * 0.15) * 2.0);
                }

                let isPuddleCell = false;
                for (let p of puddles) {
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
                    this.puddleIndices.push(cellIdx);
                }

                const slope = (z / this.worldSize) * -4;
                const finalHeight = h + slope;

                // Terrain Texture: R = Height, G = Sediment, B = Puddle Flag, A = Unused
                terrainArray[idx + 0] = finalHeight;
                terrainArray[idx + 1] = 0.0;
                terrainArray[idx + 2] = isPuddleCell ? 1.0 : 0.0;
                terrainArray[idx + 3] = 1.0;

                // Water Texture: R = Water Depth, G = Velocity X, B = Velocity Z, A = Unused
                let wDepth = 0.0;
                if (Math.abs(x - riverCenter) < 12) {
                    wDepth = 2.0;
                }
                if (isPuddleCell) {
                    wDepth = 2.6;
                }

                waterArray[idx + 0] = wDepth;
                waterArray[idx + 1] = 0.0;
                waterArray[idx + 2] = 0.0;
                waterArray[idx + 3] = 1.0;
            }
        }
    }

    initShaders() {
        // Shader 1: Water Flow & Hydraulic Potential Simulation Shader
        const waterShader = `
            uniform float flowSpeedMultiplier;
            uniform float sourceRateMultiplier;

            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec2 texel = 1.0 / resolution;

                vec4 currentWater = texture2D(textureWater, uv);
                vec4 currentTerrain = texture2D(textureTerrain, uv);

                float depth = currentWater.r;
                float height = currentTerrain.r;
                float totalHead = height + depth;

                vec2 vel = currentWater.gb;

                // Upstream Source Inflow (Top Z edge: v near 0)
                if (sourceRateMultiplier > 0.0 && uv.y < 0.05 && uv.x > 0.35 && uv.x < 0.65) {
                    depth = min(4.0, depth + 0.12 * sourceRateMultiplier);
                }

                // Downstream Outflow Drain (Bottom 4 rows)
                if (uv.y > 0.95) {
                    depth *= 0.1;
                }

                if (depth > 0.01) {
                    // Sample 4 neighbors
                    vec4 wLeft  = texture2D(textureWater, uv + vec2(-texel.x, 0.0));
                    vec4 hLeft  = texture2D(textureTerrain, uv + vec2(-texel.x, 0.0));
                    
                    vec4 wRight = texture2D(textureWater, uv + vec2(texel.x, 0.0));
                    vec4 hRight = texture2D(textureTerrain, uv + vec2(texel.x, 0.0));
                    
                    vec4 wDown  = texture2D(textureWater, uv + vec2(0.0, -texel.y));
                    vec4 hDown  = texture2D(textureTerrain, uv + vec2(0.0, -texel.y));
                    
                    vec4 wUp    = texture2D(textureWater, uv + vec2(0.0, texel.y));
                    vec4 hUp    = texture2D(textureTerrain, uv + vec2(0.0, texel.y));

                    float pLeft  = hLeft.r  + wLeft.r;
                    float pRight = hRight.r + wRight.r;
                    float pDown  = hDown.r  + wDown.r;
                    float pUp    = hUp.r    + wUp.r;

                    float dL = max(0.0, totalHead - pLeft);
                    float dR = max(0.0, totalHead - pRight);
                    float dD = max(0.0, totalHead - pDown);
                    float dU = max(0.0, totalHead - pUp);

                    float speed = 0.22 * flowSpeedMultiplier;
                    float outflow = (dL + dR + dD + dU) * 0.2 * speed;
                    outflow = min(depth * 0.3, outflow);

                    depth = max(0.0, depth - outflow);

                    // Compute Flow Velocity Vector
                    vel.x = (pRight - pLeft) * 0.5;
                    vel.y = (pUp - pDown) * 0.5;
                } else {
                    vel = vec2(0.0);
                }

                depth = clamp(depth, 0.0, 5.0);
                gl_FragColor = vec4(depth, vel.x, vel.y, 1.0);
            }
        `;

        // Shader 2: Hydraulic Erosion & Soil Deposition Shader
        const erosionShader = `
            uniform float erosionRate;
            uniform float depositionRate;

            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec4 terrain = texture2D(textureTerrain, uv);
                vec4 water = texture2D(textureWater, uv);

                float height = terrain.r;
                float sediment = terrain.g;
                float isPuddle = terrain.b;

                float depth = water.r;
                vec2 vel = water.gb;
                float speed = length(vel);

                if (depth > 0.05) {
                    // High velocity causes soil erosion (digs river deeper)
                    if (speed > 0.15) {
                        float erodeAmount = (speed - 0.15) * 0.008 * erosionRate;
                        height = clamp(height - erodeAmount, -10.0, 15.0);
                        sediment += erodeAmount;
                    } 
                    // Low velocity causes sediment deposition (builds delta mud)
                    else if (speed < 0.05 && sediment > 0.01) {
                        float depositAmount = (0.05 - speed) * 0.01 * depositionRate;
                        height = clamp(height + depositAmount, -10.0, 15.0);
                        sediment -= depositAmount;
                    }
                }

                height = clamp(height, -10.0, 15.0);
                gl_FragColor = vec4(height, max(0.0, sediment), isPuddle, 1.0);
            }
        `;

        this.waterVariable = this.gpuCompute.addVariable("textureWater", waterShader, this.dtWater);
        this.terrainVariable = this.gpuCompute.addVariable("textureTerrain", erosionShader, this.dtTerrain);

        this.gpuCompute.setVariableDependencies(this.waterVariable, [this.waterVariable, this.terrainVariable]);
        this.gpuCompute.setVariableDependencies(this.terrainVariable, [this.terrainVariable, this.waterVariable]);

        this.waterUniforms = this.waterVariable.material.uniforms;
        this.waterUniforms["flowSpeedMultiplier"] = { value: 1.0 };
        this.waterUniforms["sourceRateMultiplier"] = { value: 1.0 };

        this.terrainUniforms = this.terrainVariable.material.uniforms;
        this.terrainUniforms["erosionRate"] = { value: 1.0 };
        this.terrainUniforms["depositionRate"] = { value: 1.0 };

        const error = this.gpuCompute.init();
        if (error !== null) {
            console.error("GPErosionEngine initialization error, falling back to CPU:", error);
            this.isSupported = false;
        }
    }

    step(flowSpeedMultiplier = 1.0, sourceRateMultiplier = 1.0) {
        if (!this.isSupported) return;
        this.waterUniforms["flowSpeedMultiplier"].value = flowSpeedMultiplier;
        this.waterUniforms["sourceRateMultiplier"].value = sourceRateMultiplier;

        this.gpuCompute.compute();
    }

    getTerrainTexture() {
        if (!this.isSupported) return null;
        return this.gpuCompute.getCurrentRenderTarget(this.terrainVariable).texture;
    }

    getWaterTexture() {
        if (!this.isSupported) return null;
        return this.gpuCompute.getCurrentRenderTarget(this.waterVariable).texture;
    }

    readbackData(hydraulicSim, terrainManager) {
        if (!this.isSupported) return;
        if (!this.readBufferTerrain) {
            this.readBufferTerrain = new Float32Array(this.gridSize * this.gridSize * 4);
            this.readBufferWater = new Float32Array(this.gridSize * this.gridSize * 4);
        }

        const rtTerrain = this.gpuCompute.getCurrentRenderTarget(this.terrainVariable);
        const rtWater = this.gpuCompute.getCurrentRenderTarget(this.waterVariable);

        this.renderer.readRenderTargetPixels(rtTerrain, 0, 0, this.gridSize, this.gridSize, this.readBufferTerrain);
        this.renderer.readRenderTargetPixels(rtWater, 0, 0, this.gridSize, this.gridSize, this.readBufferWater);

        for (let i = 0; i < this.gridSize * this.gridSize; i++) {
            const h = this.readBufferTerrain[i * 4 + 0];
            const w = this.readBufferWater[i * 4 + 0];
            if (!isNaN(h) && isFinite(h)) {
                terrainManager.terrainHeights[i] = Math.max(-10.0, Math.min(15.0, h));
            }
            if (!isNaN(w) && isFinite(w)) {
                hydraulicSim.waterDepths[i] = Math.max(0.0, Math.min(5.0, w));
            }
        }
    }

    syncFromCPU(terrainManager, hydraulicSim) {
        if (!this.isSupported) return;
        const tData = this.dtTerrain.image.data;
        const wData = this.dtWater.image.data;

        for (let i = 0; i < this.gridSize * this.gridSize; i++) {
            tData[i * 4 + 0] = terrainManager.terrainHeights[i];
            wData[i * 4 + 0] = hydraulicSim.waterDepths[i];
        }

        this.dtTerrain.needsUpdate = true;
        this.dtWater.needsUpdate = true;
    }
}
