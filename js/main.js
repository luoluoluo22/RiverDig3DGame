/**
 * Main 3D Game Loop & Scene Controller
 */
class RiverGame {
    constructor() {
        this.GRID_SIZE = 70;
        this.WORLD_SIZE = 120;

        this.activeTool = 'dig';
        this.brushRadius = 3.0;
        this.brushStrength = 0.3;
        this.flowSpeedMultiplier = 1.0;
        this.sourceRateMultiplier = 1.0;

        this.isMouseDown = false;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.raycasterHitPoint = null;

        this.ducks = [];
        this.dirtParticles = [];

        this.initEngine();
    }

    initEngine() {
        this.hydraulicSim = new HydraulicSimulation(this.GRID_SIZE, this.WORLD_SIZE);
        this.terrainManager = new TerrainManager(this.GRID_SIZE, this.WORLD_SIZE);

        this.hydraulicSim.resetWaterChannel(this.terrainManager.terrainHeights);

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

        this.animate();
    }

    initThreeScene() {
        const container = document.getElementById('canvas-container');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);
        this.scene.fog = new THREE.FogExp2(0x0f172a, 0.007);

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

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.75);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffedd5, 1.2);
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

        const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
        fillLight.position.set(-50, 40, -40);
        this.scene.add(fillLight);
    }

    createTerrainMesh() {
        const geometry = new THREE.PlaneGeometry(this.WORLD_SIZE, this.WORLD_SIZE, this.GRID_SIZE - 1, this.GRID_SIZE - 1);
        geometry.rotateX(-Math.PI / 2);

        const posAttr = geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            posAttr.setY(i, this.terrainManager.terrainHeights[i]);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4a3525';
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 4000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const r = Math.random() * 4 + 1;
            ctx.fillStyle = Math.random() > 0.5 ? '#362417' : '#5c4331';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(6, 6);

        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.85,
            metalness: 0.1,
            flatShading: true
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = true;
        this.scene.add(this.terrainMesh);
    }

    createWaterMesh() {
        const geometry = new THREE.PlaneGeometry(this.WORLD_SIZE, this.WORLD_SIZE, this.GRID_SIZE - 1, this.GRID_SIZE - 1);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshPhysicalMaterial({
            color: 0x0099ff,
            emissive: 0x002244,
            roughness: 0.1,
            metalness: 0.1,
            transmission: 0.75,
            transparent: true,
            opacity: 0.85,
            ior: 1.333,
            side: THREE.DoubleSide
        });

        this.waterMesh = new THREE.Mesh(geometry, material);
        this.waterMesh.position.y = 0.05;
        this.scene.add(this.waterMesh);

        this.updateWaterMeshGeometry();
    }

    updateWaterMeshGeometry() {
        const posAttr = this.waterMesh.geometry.attributes.position;
        const waterDepths = this.hydraulicSim.waterDepths;
        const terrainHeights = this.terrainManager.terrainHeights;

        for (let i = 0; i < posAttr.count; i++) {
            const depth = waterDepths[i];
            const groundY = terrainHeights[i];

            if (depth > 0.02) {
                posAttr.setY(i, groundY + depth);
            } else {
                posAttr.setY(i, groundY - 0.5);
            }
        }

        this.waterMesh.geometry.attributes.position.needsUpdate = true;
        this.waterMesh.geometry.computeVertexNormals();
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

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        container.addEventListener('pointerdown', (e) => {
            if (e.button === 0) {
                this.isMouseDown = true;
                this.updateRaycast(e);
                if (this.activeTool === 'duck' && this.raycasterHitPoint) {
                    this.spawnDuckAt(this.raycasterHitPoint);
                } else if (this.raycasterHitPoint) {
                    this.applyCurrentTool(this.raycasterHitPoint);
                }
            }
        });

        container.addEventListener('pointermove', (e) => {
            this.updateRaycast(e);
            if (this.isMouseDown && this.activeTool !== 'duck' && this.raycasterHitPoint) {
                this.applyCurrentTool(this.raycasterHitPoint);
            }
        });

        window.addEventListener('pointerup', () => {
            this.isMouseDown = false;
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

        if (modified) {
            const posAttr = this.terrainMesh.geometry.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                posAttr.setY(i, this.terrainManager.terrainHeights[i]);
            }
            this.terrainMesh.geometry.attributes.position.needsUpdate = true;
            this.terrainMesh.geometry.computeVertexNormals();
        }
    }

    spawnDirtParticle(x, y, z) {
        const pGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x5c4331 });
        const p = new THREE.Mesh(pGeom, pMat);
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

        const bodyGeom = new THREE.SphereGeometry(0.8, 12, 12);
        bodyGeom.scale(1, 0.8, 1.2);
        const duckMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
        const body = new THREE.Mesh(bodyGeom, duckMat);
        body.position.y = 0.5;
        duckGroup.add(body);

        const headGeom = new THREE.SphereGeometry(0.5, 10, 10);
        const head = new THREE.Mesh(headGeom, duckMat);
        head.position.set(0, 1.1, 0.5);
        duckGroup.add(head);

        const beakGeom = new THREE.ConeGeometry(0.2, 0.4, 8);
        beakGeom.rotateX(Math.PI / 2);
        const beakMat = new THREE.MeshStandardMaterial({ color: 0xf97316 });
        const beak = new THREE.Mesh(beakGeom, beakMat);
        beak.position.set(0, 1.05, 0.95);
        duckGroup.add(beak);

        duckGroup.position.copy(point);
        this.scene.add(duckGroup);
        this.ducks.push(duckGroup);
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
        this.hydraulicSim.resetWaterChannel(this.terrainManager.terrainHeights);

        const posAttr = this.terrainMesh.geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            posAttr.setY(i, this.terrainManager.terrainHeights[i]);
        }
        this.terrainMesh.geometry.attributes.position.needsUpdate = true;
        this.terrainMesh.geometry.computeVertexNormals();

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

        this.uiController.updateStats(totalWater, this.ducks.length, minY, this.flowSpeedMultiplier);
        this.renderer.render(this.scene, this.camera);
    }
}

// Start Game Instance on DOM Load
window.addEventListener('DOMContentLoaded', () => {
    window.game = new RiverGame();
});
