/**
 * Main 3D Game Loop & Scene Controller
 */
class RiverGame {
    constructor() {
        this.GRID_SIZE = 90;
        this.WORLD_SIZE = 180;

        this.activeTool = 'dig';
        this.brushRadius = 4.0;
        this.brushStrength = 0.35;
        this.flowSpeedMultiplier = 1.0;
        this.sourceRateMultiplier = 1.0;

        this.isMouseDown = false;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.raycasterHitPoint = null;

        this.ducks = [];
        this.dirtParticles = [];

        this.keys = { w: false, a: false, s: false, d: false };
        this.debugPuddleMode = false;
        this.showMarkerLabel = false;
        
        this.soundManager = new SoundManager();

        this.initEngine();
    }

    initEngine() {
        this.initSharedResources();
        this.hydraulicSim = new HydraulicSimulation(this.GRID_SIZE, this.WORLD_SIZE);
        this.terrainManager = new TerrainManager(this.GRID_SIZE, this.WORLD_SIZE);

        this.hydraulicSim.resetWaterChannel(this.terrainManager.terrainHeights, this.terrainManager.puddleIndices);

        this.initThreeScene();
        this.createTerrainMesh();
        this.createWaterMesh();
        this.createBrushIndicator();
        this.create3DShovel();

        this.uiController = new UIController(this);
        this.setupPointerEvents();

        setTimeout(() => {
            const loader = document.getElementById('loader');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 500);
            }
        }, 500);
        this.initPostProcessing();
        this.animate();
    }

    initPostProcessing() {
        const renderScene = new THREE.RenderPass(this.scene, this.camera);
        const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        // 大幅降低辉光强度并提高阈值，解决曝光过度
        bloomPass.threshold = 0.8;
        bloomPass.strength = 0.25;
        bloomPass.radius = 0.5;

        this.composer = new THREE.EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(bloomPass);
    }

    initSharedResources() {
        // Dirt Particles
        this.sharedDirtGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        this.sharedDirtMat = new THREE.MeshBasicMaterial({ color: 0x5c4331 });

        // Ducks
        this.duckBodyGeom = new THREE.SphereGeometry(0.8, 12, 12);
        this.duckBodyGeom.scale(1, 0.8, 1.2);
        this.duckHeadGeom = new THREE.SphereGeometry(0.5, 10, 10);
        this.duckBeakGeom = new THREE.ConeGeometry(0.2, 0.4, 8);
        this.duckBeakGeom.rotateX(Math.PI / 2);
        this.duckMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
        this.duckBeakMat = new THREE.MeshStandardMaterial({ color: 0xf97316 });
    }

    initThreeScene() {
        const container = document.getElementById('canvas-container');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1e293b); // Dawn/dusk dark blue
        this.scene.fog = new THREE.FogExp2(0x1e293b, 0.006);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 65, 80);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2.1;
        this.controls.minDistance = 20;
        this.controls.maxDistance = 150;
        this.controls.target.set(0, 0, 0);

        // 鼠标配置：允许按住 Shift/Space + 左键、右键或中键旋转视角
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.ROTATE
        };

        // Lighting
        const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.4);
        this.scene.add(hemiLight);

        const sunLight = new THREE.DirectionalLight(0xffedd5, 0.9);
        sunLight.position.set(50, 80, 40);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far = 200;
        sunLight.shadow.camera.left = -70;
        sunLight.shadow.camera.right = 70;
        sunLight.shadow.camera.top = 70;
        sunLight.shadow.camera.bottom = -70;
        this.scene.add(sunLight);

        const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.3);
        fillLight.position.set(-50, 40, -40);
        this.scene.add(fillLight);
    }

    createTerrainMesh() {
        const geometry = new THREE.PlaneGeometry(this.WORLD_SIZE, this.WORLD_SIZE, this.GRID_SIZE - 1, this.GRID_SIZE - 1);
        geometry.rotateX(-Math.PI / 2);

        const count = geometry.attributes.position.count;
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.05,
            flatShading: true
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = true;
        this.scene.add(this.terrainMesh);
        
        this.updateTerrainGeometry();
    }

    updateTerrainGeometry() {
        const posAttr = this.terrainMesh.geometry.attributes.position;
        const colorAttr = this.terrainMesh.geometry.attributes.color;
        
        for (let i = 0; i < posAttr.count; i++) {
            const h = this.terrainManager.terrainHeights[i];
            posAttr.setY(i, h);
            
            // Stylized height-based vertex colors
            let r, g, b;
            if (h < -2.0) {
                // Deep wet dirt (darker)
                r = 0.22; g = 0.16; b = 0.12;
            } else if (h < 2.0) {
                // Mud
                const t = (h + 2.0) / 4.0;
                r = THREE.MathUtils.lerp(0.22, 0.40, t);
                g = THREE.MathUtils.lerp(0.16, 0.28, t);
                b = THREE.MathUtils.lerp(0.12, 0.18, t);
            } else {
                // High ground (grass / light dirt)
                const t = Math.min(1.0, (h - 2.0) / 6.0);
                r = THREE.MathUtils.lerp(0.40, 0.45, t);
                g = THREE.MathUtils.lerp(0.28, 0.42, t);
                b = THREE.MathUtils.lerp(0.18, 0.25, t);
            }
            
            // Add subtle noise
            const noise = (Math.random() - 0.5) * 0.03;
            colorAttr.setXYZ(i, r + noise, g + noise, b + noise);
        }
        
        this.terrainMesh.geometry.attributes.position.needsUpdate = true;
        this.terrainMesh.geometry.attributes.color.needsUpdate = true;
        this.terrainMesh.geometry.computeVertexNormals();
    }

    generateWaterNormalTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(256, 256);
        const data = imgData.data;

        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const u = (x / 256) * Math.PI * 8;
                const v = (y / 256) * Math.PI * 8;

                const dhdu = Math.cos(u) * 0.4 + Math.cos(u * 2 + v) * 0.2;
                const dhdv = Math.sin(v) * 0.4 + Math.sin(v * 2 + u) * 0.2;

                let nx = -dhdu;
                let ny = -dhdv;
                let nz = 1.0;
                const len = Math.hypot(nx, ny, nz);
                nx /= len; ny /= len; nz /= len;

                const r = Math.floor((nx * 0.5 + 0.5) * 255);
                const g = Math.floor((ny * 0.5 + 0.5) * 255);
                const b = Math.floor((nz * 0.5 + 0.5) * 255);

                const idx = (y * 256 + x) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 10);
        return texture;
    }

    createWaterMesh() {
        const geometry = new THREE.PlaneGeometry(this.WORLD_SIZE, this.WORLD_SIZE, this.GRID_SIZE - 1, this.GRID_SIZE - 1);
        geometry.rotateX(-Math.PI / 2);

        // 为顶点绑定 Color 属性，用于实现“浅水浅蓝清澈，深水深湛浓郁”的深浅变色效果
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.waterNormalTexture = this.generateWaterNormalTexture();

        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            vertexColors: true,
            emissive: 0x001a33,
            roughness: 0.05,
            metalness: 0.1,
            normalMap: this.waterNormalTexture,
            normalScale: new THREE.Vector2(0.6, 0.6),
            transmission: 0.9,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.9,
            ior: 1.333,
            side: THREE.DoubleSide
        });

        this.waterMesh = new THREE.Mesh(geometry, material);
        this.waterMesh.position.y = 0.05;
        this.scene.add(this.waterMesh);

        this.createDownstreamMarkers();
        this.updateWaterMeshGeometry();
    }

    createUpstreamMarkers() {
        this.upstreamGroup = new THREE.Group();

        // 上游水源入口光环与涌泉标记 (Z 负方向, 即 Z = -worldSize/2 + 4)
        const sourceZ = -this.WORLD_SIZE / 2 + 4;
        const ringGeom = new THREE.RingGeometry(2.0, 4.5, 32);
        ringGeom.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.set(0, 0.25, sourceZ);
        this.upstreamGroup.add(ring);
        this.upstreamRing = ring;

        const pillarGeom = new THREE.CylinderGeometry(0.4, 1.0, 3.0, 16);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x0369a1,
            roughness: 0.2,
            transparent: true,
            opacity: 0.8
        });
        const pillar = new THREE.Mesh(pillarGeom, pillarMat);
        pillar.position.set(0, 1.5, sourceZ);
        this.upstreamGroup.add(pillar);

        this.scene.add(this.upstreamGroup);
    }

    createDownstreamMarkers() {
        this.downstreamGroup = new THREE.Group();

        // 下游出口泄洪漩涡标记 (Z 正方向, 即 Z = +worldSize/2 - 4)
        const drainZ = this.WORLD_SIZE / 2 - 4;

        // 泄洪出口下沉警示圈
        const ringGeom = new THREE.RingGeometry(3.0, 6.0, 32);
        ringGeom.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xf97316, // 鲜明橙色指示下游排水口
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.65
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.set(0, 0.15, drainZ);
        this.downstreamGroup.add(ring);
        this.downstreamRing = ring;

        // 下游漩涡纹理环
        const vortexGeom = new THREE.RingGeometry(0.5, 2.5, 32);
        vortexGeom.rotateX(-Math.PI / 2);
        const vortexMat = new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        const vortex = new THREE.Mesh(vortexGeom, vortexMat);
        vortex.position.set(0, 0.2, drainZ);
        this.downstreamGroup.add(vortex);
        this.downstreamVortex = vortex;

        this.scene.add(this.downstreamGroup);
    }

    updateWaterMeshGeometry() {
        const posAttr = this.waterMesh.geometry.attributes.position;
        const colorAttr = this.waterMesh.geometry.attributes.color;
        const waterDepths = this.hydraulicSim.waterDepths;
        const terrainHeights = this.terrainManager.terrainHeights;
        const time = Date.now() * 0.003;
        const gridSize = this.GRID_SIZE;
        const worldSize = this.WORLD_SIZE;

        for (let i = 0; i < posAttr.count; i++) {
            const depth = waterDepths[i];
            const groundY = terrainHeights[i];

            if (depth > 0.02) {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const x = (col / (gridSize - 1) - 0.5) * worldSize;
                const z = (row / (gridSize - 1) - 0.5) * worldSize;

                // 3D 动态波浪起伏
                const wave = (Math.sin(x * 0.4 + time * 3.0) + Math.cos(z * 0.5 - time * 4.0)) * 0.07 * Math.min(1.0, depth);
                posAttr.setY(i, groundY + depth + wave);

                // 根据水深动态计算颜色渐变或积水高亮
                let r, g, b;
                
                if (this.debugPuddleMode && this.terrainManager.puddleIndices.includes(i)) {
                    r = 0.95;
                    g = 0.15;
                    b = 0.15;
                } else {
                    const t = Math.min(1.0, Math.max(0.0, (depth - 0.1) / 2.2));
                    r = THREE.MathUtils.lerp(0.28, 0.01, t);
                    g = THREE.MathUtils.lerp(0.68, 0.12, t);
                    b = THREE.MathUtils.lerp(0.98, 0.42, t);
                }

                colorAttr.setXYZ(i, r, g, b);
            } else {
                posAttr.setY(i, groundY - 0.5);
                colorAttr.setXYZ(i, 0.0, 0.5, 0.8);
            }
        }

        this.waterMesh.geometry.attributes.position.needsUpdate = true;
        this.waterMesh.geometry.attributes.color.needsUpdate = true;
        // Optimization: Removed computeVertexNormals() because we rely on the normal map for lighting details.
    }

    createBrushIndicator() {
        const geom = new THREE.RingGeometry(0.8, 1.0, 32);
        geom.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        this.brushIndicator = new THREE.Mesh(geom, mat);
        this.brushIndicator.visible = false;
        this.scene.add(this.brushIndicator);
    }

    create3DShovel() {
        this.shovelGroup = new THREE.Group();

        const handleGeom = new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
        const handle = new THREE.Mesh(handleGeom, handleMat);
        handle.position.y = 1.75;
        this.shovelGroup.add(handle);

        const bladeGeom = new THREE.BoxGeometry(0.9, 1.1, 0.1);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
        const blade = new THREE.Mesh(bladeGeom, bladeMat);
        blade.position.y = 0.4;
        blade.rotation.x = 0.3;
        this.shovelGroup.add(blade);

        this.shovelGroup.rotation.z = -0.4;
        this.shovelGroup.rotation.x = 0.3;
        this.shovelGroup.visible = false;
        this.scene.add(this.shovelGroup);
    }

    setupPointerEvents() {
        const container = document.getElementById('canvas-container');

        // 屏蔽画布上的默认右键上下文菜单
        container.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // WASD
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = true;
        });
        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
        });

        const btnDebug = document.getElementById('btn-debug-puddle');
        if (btnDebug) {
            btnDebug.addEventListener('click', (e) => {
                this.debugPuddleMode = !this.debugPuddleMode;
                if (this.debugPuddleMode) {
                    e.target.classList.add('active');
                } else {
                    e.target.classList.remove('active');
                }
            });
        }

        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
            btnMute.addEventListener('click', (e) => {
                if (!this.soundManager) return;
                this.soundManager.isMuted = !this.soundManager.isMuted;
                const icon = document.getElementById('mute-icon');
                if (this.soundManager.isMuted) {
                    icon.innerText = '🔇';
                    btnMute.style.background = 'rgba(239, 68, 68, 0.3)';
                } else {
                    icon.innerText = '🔊';
                    btnMute.style.background = '';
                }
            });
        }

        container.addEventListener('pointerdown', (e) => {
            if (this.soundManager) {
                this.soundManager.init();
            }

            // 如果按下了 Shift 键、Alt 键、或者使用的是中键(button 1) / 右键(button 2) -> 用于 3D 视角旋转
            if (e.shiftKey || e.altKey || e.button === 1 || e.button === 2) {
                this.isMouseDown = false;
                this.controls.enabled = true;
                return;
            }

            // 纯鼠标左键：使用工具（铲土/筑坝/放鸭等），锁定视角不晃动
            if (e.button === 0) {
                this.isMouseDown = true;
                this.controls.enabled = false;
                
                if (this.checkMarkerClick(e)) {
                    this.showMarkerLabel = !this.showMarkerLabel;
                    return; // Prevent tool usage on marker click
                }
                
                this.updateRaycast(e);

                if (this.activeTool === 'duck' && this.raycasterHitPoint) {
                    this.spawnDuckAt(this.raycasterHitPoint);
                } else if (this.raycasterHitPoint) {
                    this.applyCurrentTool(this.raycasterHitPoint);
                }
            }
        });

        container.addEventListener('pointermove', (e) => {
            if (e.shiftKey || e.altKey) {
                this.isMouseDown = false;
                this.controls.enabled = true;
                return;
            }

            this.updateRaycast(e);
            if (this.isMouseDown && this.activeTool !== 'duck' && this.raycasterHitPoint) {
                this.applyCurrentTool(this.raycasterHitPoint);
            }
        });

        window.addEventListener('pointerup', () => {
            this.isMouseDown = false;
            this.controls.enabled = true; // 松开按键后恢复视角控制
        });
    }

    applyCurrentTool(point) {
        const modified = this.terrainManager.applyTool(
            point,
            this.activeTool,
            this.brushRadius,
            this.brushStrength,
            this.hydraulicSim.waterDepths,
            (x, y, z) => this.spawnDirtParticle(x, y, z)
        );

        if (this.soundManager) {
            switch (this.activeTool) {
                case 'dig': if (modified) this.soundManager.playDig(); break;
                case 'dam': if (modified) this.soundManager.playDam(); break;
                case 'spring': this.soundManager.playSpring(); break;
                case 'smooth': if (modified) this.soundManager.playSmooth(); break;
            }
        }

        if (modified) {
            this.updateTerrainGeometry();
        }
    }

    spawnDirtParticle(x, y, z) {
        const p = new THREE.Mesh(this.sharedDirtGeom, this.sharedDirtMat);
        p.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
        p.userData.vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            Math.random() * 0.4 + 0.2,
            (Math.random() - 0.5) * 0.3
        );
        p.userData.life = 30;
        this.scene.add(p);
        this.dirtParticles.push(p);
    }

    updateDirtParticles() {
        for (let i = this.dirtParticles.length - 1; i >= 0; i--) {
            const p = this.dirtParticles[i];
            p.position.add(p.userData.vel);
            p.userData.vel.y -= 0.03;
            p.userData.life--;
            if (p.userData.life <= 0) {
                this.scene.remove(p);
                this.dirtParticles.splice(i, 1);
            }
        }
    }

    spawnDuckAt(point) {
        const duckGroup = new THREE.Group();

        const body = new THREE.Mesh(this.duckBodyGeom, this.duckMat);
        body.position.y = 0.5;
        duckGroup.add(body);

        const head = new THREE.Mesh(this.duckHeadGeom, this.duckMat);
        head.position.set(0, 1.1, 0.5);
        duckGroup.add(head);

        const beak = new THREE.Mesh(this.duckBeakGeom, this.duckBeakMat);
        beak.position.set(0, 1.05, 0.95);
        duckGroup.add(beak);

        duckGroup.position.copy(point);
        this.scene.add(duckGroup);
        this.ducks.push(duckGroup);
        
        if (this.soundManager) {
            this.soundManager.playDuck();
        }
    }

    updateDucksPhysics() {
        for (let duck of this.ducks) {
            const gx = Math.round(((duck.position.x + this.WORLD_SIZE / 2) / this.WORLD_SIZE) * (this.GRID_SIZE - 1));
            const gz = Math.round(((duck.position.z + this.WORLD_SIZE / 2) / this.WORLD_SIZE) * (this.GRID_SIZE - 1));

            if (gx >= 0 && gx < this.GRID_SIZE && gz >= 0 && gz < this.GRID_SIZE) {
                const idx = gz * this.GRID_SIZE + gx;
                const d = this.hydraulicSim.waterDepths[idx];
                const h = this.terrainManager.terrainHeights[idx];

                const targetY = h + Math.max(0, d);
                duck.position.y = THREE.MathUtils.lerp(duck.position.y, targetY, 0.1);

                if (d > 0.1) {
                    const flow = this.hydraulicSim.flowVectors[idx];
                    duck.position.x += flow.x * 0.12 * this.flowSpeedMultiplier;
                    duck.position.z += flow.y * 0.12 * this.flowSpeedMultiplier;

                    if (flow.lengthSq() > 0.01) {
                        const angle = Math.atan2(flow.x, flow.y);
                        duck.rotation.y = THREE.MathUtils.lerp(duck.rotation.y, angle, 0.1);
                    }
                }
            }
        }
    }

    checkMarkerClick(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (this.downstreamGroup) {
            const intersects = this.raycaster.intersectObject(this.downstreamGroup, true);
            if (intersects.length > 0) return true;
        }
        return false;
    }

    updateRaycast(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.terrainMesh);

        if (intersects.length > 0) {
            this.raycasterHitPoint = intersects[0].point;

            this.brushIndicator.position.copy(this.raycasterHitPoint);
            this.brushIndicator.position.y += 0.1;
            this.brushIndicator.scale.set(this.brushRadius, 1, this.brushRadius);
            this.brushIndicator.visible = true;

            this.shovelGroup.position.copy(this.raycasterHitPoint);
            this.shovelGroup.visible = true;

            if (this.isMouseDown && this.activeTool === 'dig') {
                this.shovelGroup.rotation.x = 0.6 + Math.sin(Date.now() * 0.02) * 0.2;
            } else {
                this.shovelGroup.rotation.x = 0.3;
            }
        } else {
            this.raycasterHitPoint = null;
            this.brushIndicator.visible = false;
            this.shovelGroup.visible = false;
        }
    }

    resetAllData() {
        this.terrainManager.resetHeights();
        this.hydraulicSim.resetWaterChannel(this.terrainManager.terrainHeights, this.terrainManager.puddleIndices);

        this.updateTerrainGeometry();

        for (let duck of this.ducks) {
            this.scene.remove(duck);
        }
        this.ducks.length = 0;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.hydraulicSim.step(
            this.terrainManager.terrainHeights,
            this.flowSpeedMultiplier,
            this.sourceRateMultiplier
        );

        // 法线贴图 UV 顺流偏移（沿 Z 轴向下游滑动）
        if (this.waterNormalTexture) {
            this.waterNormalTexture.offset.y += 0.0018 * this.flowSpeedMultiplier;
            this.waterNormalTexture.offset.x += Math.sin(Date.now() * 0.001) * 0.0003;
        }

        // 上游涌泉标记呼吸动画 (已移除, 保留安全检查)
        if (this.upstreamRing) {
            const scale = 1.0 + Math.sin(Date.now() * 0.004) * 0.15;
            this.upstreamRing.scale.set(scale, scale, 1);
            this.upstreamRing.rotation.z += 0.01;
        }

        // 下游泄洪漩涡动画
        if (this.downstreamVortex) {
            this.downstreamVortex.rotation.z -= 0.03;
        }
        if (this.downstreamRing) {
            const pulse = 1.0 + Math.cos(Date.now() * 0.005) * 0.12;
            this.downstreamRing.scale.set(pulse, pulse, 1);
        }

        // Marker Label Positioning
        const label = document.getElementById('marker-label');
        if (this.showMarkerLabel && this.downstreamRing && label) {
            label.classList.remove('hidden');
            const pos = new THREE.Vector3();
            this.downstreamRing.getWorldPosition(pos);
            pos.project(this.camera);
            const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (pos.y * -0.5 + 0.5) * window.innerHeight;
            label.style.left = `${x}px`;
            label.style.top = `${y}px`;
        } else if (label) {
            label.classList.add('hidden');
        }

        // WASD Camera Panning
        if (this.keys.w || this.keys.a || this.keys.s || this.keys.d) {
            const panSpeed = 0.6;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            forward.y = 0;
            forward.normalize();
            const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

            const moveVec = new THREE.Vector3();
            if (this.keys.w) moveVec.add(forward);
            if (this.keys.s) moveVec.sub(forward);
            if (this.keys.a) moveVec.sub(right);
            if (this.keys.d) moveVec.add(right);
            
            if (moveVec.lengthSq() > 0) {
                moveVec.normalize().multiplyScalar(panSpeed);
                this.camera.position.add(moveVec);
                this.controls.target.add(moveVec);
            }
        }

        this.updateWaterMeshGeometry();
        this.updateDucksPhysics();
        this.updateDirtParticles();

        let totalWater = 0, minY = 999;
        const waterDepths = this.hydraulicSim.waterDepths;
        const terrainHeights = this.terrainManager.terrainHeights;
        for (let i = 0; i < waterDepths.length; i++) {
            if (waterDepths[i] > 0.05) totalWater++;
            if (terrainHeights[i] < minY) minY = terrainHeights[i];
        }

        // 坑洼排水百分比与 HUD Stats 同步
        const puddlePct = this.hydraulicSim.getPuddleWaterPercentage();
        this.uiController.updateDrainageProgress(puddlePct);

        this.uiController.updateStats(totalWater, this.ducks.length, minY, this.flowSpeedMultiplier);
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Start Game Instance on DOM Load
window.addEventListener('DOMContentLoaded', () => {
    window.game = new RiverGame();
});
