# 🌊 3D 铲泥改道与水流物理模拟游戏 (RiverDig3DGame)

一个基于 **Three.js** 与 **浅水流体力学 (Shallow Water Equations)** 的 Web 3D 模拟游戏。

## 🎮 核心玩法

1. **铲土开渠 (Dig Mud)**：在两侧泥土坡上使用铲子拖拽开凿新的河道或人工渠，上游的河水会顺着新沟渠实时漫入并改道！
2. **堆土筑坝 (Build Dam)**：在河道中堆砌泥巴拦截水流，形成水坝或堰塞湖。
3. **放小黄鸭 (Put Duck)**：放入漂浮的小黄鸭，小黄鸭会根据浅水物理流速矢量在人造河道中自然漂流向下游。
4. **山泉喷放与平整**：增加新山泉水眼，或平整坡面泥地。

## 🛠️ 技术特点

- **WebGL / Three.js 渲染**：高品质 Soft Shadows、物理材质 (PBR)、光环拾取与粒子飞溅。
- **高程网格泥土变形 (Heightfield Terrain)**：实时高程图计算与动态法线重算。
- **元胞自动机流体力学 (Cellular Flow Engine)**：根据压强差与势能差实时演算水流分配。

## 🚀 启动运行

```bash
npm start
```

访问：`http://localhost:8085`
