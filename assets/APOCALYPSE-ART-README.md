# 末世手绘游戏图集

工具：内置 `image_gen.imagegen`，两次新图生成，`transparent_background: true`。用户附件作为风格参考；透明 PNG 已复制进本工作树，不依赖工具默认输出目录。没有使用 API/CLI 或外部账号密钥。

## 环境图集

`apocalypse-environment.png`：4列×4行，按行从左到右：0砖住宅、1诊所、2便利店、3车库、4公寓、5水箱住宅、6沙袋哨所、7仓库、8绿树、9枯树、10锈车、11警车、12油桶木箱、13轮胎火堆、14墙体废墟、15沙袋路障。

提示词关键内容记录（节录）：

> Create a production-ready transparent PNG sprite atlas for an actual playable 2D game. It is a modern zombie apocalypse, drawn with the same visual vocabulary as classic Kingdom Rush: thick dark brown ink outlines, hand-painted warm ochre roofs, weathered earthy materials, olive grass, rounded clustered green tree crowns, charming detailed small-scale forms. The camera looks downward at roofs but also sees a straight-on front elevation, WITHOUT diagonal isometric rotation. Orthographic 2.5D. Exactly a square sheet of 4 equal columns and 4 equal rows, exactly 16 isolated complete objects, centered within their own cells, no overlap between cells, broad transparent gutters (at least 10% of each cell), no cast ground/background tiles. All architecture faces straight down toward the viewer.

逐格指定了上述16个物件；要求完整屋顶与前立面、旧化材质、清楚厚轮廓、细节可读，无像素画/写实摄影/中世纪魔法塔，无标签、网格、背景或水印，实际透明alpha。

## 人物图集

`apocalypse-characters.png`：3列×2行，按行从左到右：0幸存者正面、1背面、2普通感染者、3疾跑、4重型、5爆囊。

提示词关键内容记录（节录）：

> Create a transparent game character sprite sheet matching classic Kingdom Rush hand-painted cartoon art: strong dark brown ink outlines, warm earthy palette, lively detailed rounded forms, small figures with slightly oversized heads. Modern zombie apocalypse. Exactly a square sprite atlas with 3 equal columns and 2 equal rows, six isolated COMPLETE fully visible head-to-boot figures, centered in cells with wide transparent gutters and no overlap. Camera looks slightly downward, characters upright, front-facing as in a top-down game with visible faces.

逐格指定：橄榄帽、棕夹克、战术背心/背包、蓝灰裤幸存者与背面；绿皮破红衣普通僵尸；破赭黄连帽衫疾跑；蓝色工装大块重型；酒红破衣、膨胀腹部爆囊。要求无内置枪械（引擎独立绘制）、无露骨血腥、脚底完整、衣物补丁/口袋/磨损、清楚轮廓、暖色左上光、无背景/水印/文本，非3D/摄影/动漫/像素画。

图集只参与美术，不定义碰撞和技能字段。`art-assets.js` 按格透明边界确定源矩形；人物下部由代码绘制活动双腿。
