export function getLiquidMaterialProfile(thickness: number, radius = 0) {
  const amount = Math.min(1, Math.max(0, thickness / 100));
  return {
    radius: Math.max(0, radius),
    // 过渡区域以实际圆角为基准，最厚材质完全取消边缘过渡。
    edgeWidth: Math.max(0, radius) * (1 - amount),
    // 上下分别内收圆角的 35%，不再把控件总高度作为收缩量的基准。
    centerInset: Math.max(0, radius) * 0.35 * (1 - amount),
    curlDepth: 16 - amount * 10,
    curlStrength: 1 - amount,
  };
}

// 越过上下边界时反向取样，连续镜像补齐，而不是重复边界像素或留下透明条带。
function reflectPosition(position: number) {
  const period = ((position % 2) + 2) % 2;
  return period <= 1 ? period : 2 - period;
}

function getColumnGeometry(
  x: number,
  width: number,
  height: number,
  profile: ReturnType<typeof getLiquidMaterialProfile>,
) {
  const cornerWidth = Math.min(profile.edgeWidth, width / 2);
  const distance = Math.min(x, width - x);
  const t = cornerWidth > 0 ? Math.min(1, Math.max(0, distance / cornerWidth)) : 1;
  // 从边缘直接缓出，去掉边缘侧的缓入段。
  const cornerEnvelope = cornerWidth > 0 ? (1 - t) ** 3 : 0;
  // 按每列可见的圆角轮廓定位卷曲带，避免圆形、胶囊形把矩形四角的效果裁掉。
  const radius = Math.min(profile.radius, width / 2, height / 2);
  const cornerOffset = Math.max(0, radius - distance);
  const top = radius - Math.sqrt(Math.max(0, radius * radius - cornerOffset * cornerOffset));
  const bottom = height - top;
  const span = bottom - top;
  // 沿横向缓出进入中央收缩，局部收缩最多占半跨度的 48%，避免圆形端点退化。
  const inset = Math.min(profile.centerInset * (1 - cornerEnvelope), span * 0.24);
  const stretch = span > 0 ? 1 - (inset * 2) / span : 1;
  return {
    stretch,
    curl: cornerEnvelope * profile.curlStrength,
    direction: x < width / 2 ? -1 : 1,
    top,
    bottom,
    depth: Math.min(profile.curlDepth, (bottom - top) * 0.22),
  };
}

function samplePosition(
  x: number,
  y: number,
  width: number,
  height: number,
  column: ReturnType<typeof getColumnGeometry>,
) {
  const span = column.bottom - column.top;
  // 圆角外侧本来就不可见；零跨度的圆形端点保持原坐标，避免除零。
  if (span <= 0 || y < column.top || y > column.bottom) return { x, y };
  // feDisplacementMap 使用反向取样，仅中央列缩小，左右边缘维持原比例。
  let sourceY = height * 0.5 + (y - height * 0.5) / column.stretch;
  const edge = Math.min(1, Math.min(y - column.top, column.bottom - y) / column.depth);
  const smooth = edge * edge * edge * (edge * (edge * 6 - 15) + 10);
  // 回卷在上下边界处归零，并把边界取样拉回原位置；弯折峰值留在紧贴边缘的窄带内。
  sourceY = y + (sourceY - y) * (1 - column.curl * (1 - smooth ** 3));
  const roll = Math.sin(Math.PI * edge) ** 3 * column.curl;
  const sourceX = x + column.direction * column.depth * 0.85 * roll;
  sourceY += (y < height / 2 ? -1 : 1) * column.depth * 1.15 * roll;
  return {
    x: reflectPosition(sourceX / width) * width,
    y: column.top + reflectPosition((sourceY - column.top) / span) * span,
  };
}

export function getLiquidSourcePosition(
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  radius = 0,
) {
  return samplePosition(
    x,
    y,
    width,
    height,
    getColumnGeometry(x, width, height, getLiquidMaterialProfile(thickness, radius)),
  );
}

export function createLiquidMaterialMap(
  width: number,
  height: number,
  thickness: number,
  radius = 0,
) {
  const mapWidth = Math.max(2, Math.min(1024, Math.ceil(width)));
  const mapHeight = Math.max(2, Math.min(1024, Math.ceil(height)));
  const pixels = new Uint8ClampedArray(mapWidth * mapHeight * 4);
  const scale = height;
  const profile = getLiquidMaterialProfile(thickness, radius);
  const columns = Array.from({ length: mapWidth }, (_, x) =>
    getColumnGeometry(((x + 0.5) / mapWidth) * width, width, height, profile),
  );

  for (let y = 0; y < mapHeight; y += 1) {
    const outputY = ((y + 0.5) / mapHeight) * height;
    for (let x = 0; x < mapWidth; x += 1) {
      const outputX = ((x + 0.5) / mapWidth) * width;
      const source = samplePosition(outputX, outputY, width, height, columns[x]!);
      const offset = (y * mapWidth + x) * 4;
      // 配合 feFuncR/G 校准 128 为精确的 0.5，中央不产生意外漂移。
      pixels[offset] = Math.round(128 + ((source.x - outputX) / scale) * 254);
      pixels[offset + 1] = Math.round(128 + ((source.y - outputY) / scale) * 254);
      pixels[offset + 2] = 128;
      pixels[offset + 3] = 255;
    }
  }

  return { pixels, mapWidth, mapHeight, scale };
}
