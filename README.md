# CoreColumn 地质钻芯编录与柱状图编辑器

基于 SvelteKit、TypeScript、Vite、Skeleton 和 Svelte 5 runes 构建。柱状图、深度标尺和
多孔对比均使用 SVG，钻芯照片由浏览器 Canvas 生成，不需要外部图片或后端服务。

## 功能

- 按深度区间录入岩性、颜色、结构、蚀变、矿化和描述
- 拖动区间边界并校验连续、无重叠、无空段
- 共享深度坐标的标尺、缩放和平移
- Canvas 生成的钻芯照片缩略图与区间联动
- 多钻孔并排对比和手动地层连线
- 修改一个钻孔后对比图实时同步
- 撤销重做、结构化 JSON 导出和打印柱状图

## 运行

```bash
export PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH"
corepack pnpm install
corepack pnpm build
corepack pnpm dev
```

