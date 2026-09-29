// 《一刀999》几何工具：确定性随机、贝塞尔采样与路径计算。
// 纯函数模块，可被单元测试直接引用。

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function cubicPoint(startX, startY, control1X, control1Y, control2X, control2Y, endX, endY, t) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * startX + 3 * inverse ** 2 * t * control1X + 3 * inverse * t ** 2 * control2X + t ** 3 * endX,
    y: inverse ** 3 * startY + 3 * inverse ** 2 * t * control1Y + 3 * inverse * t ** 2 * control2Y + t ** 3 * endY
  };
}

export function distanceToPath(point, path) {
  if (!path?.length) return Infinity;
  let best = Infinity;
  const segments = [
    [0, 2, 4, 6],
    [6, 8, 10, 12]
  ];
  segments.forEach(([start, control1, control2, end]) => {
    if (path[end] === undefined) return;
    for (let step = 0; step <= 24; step += 1) {
      const sample = cubicPoint(
        path[start],
        path[start + 1],
        path[control1],
        path[control1 + 1],
        path[control2],
        path[control2 + 1],
        path[end],
        path[end + 1],
        step / 24
      );
      best = Math.min(best, Math.hypot(point.x - sample.x, point.y - sample.y));
    }
  });
  return best;
}

export function pathLength(path) {
  if (!path?.length) return 0;
  let length = 0;
  const segments = [
    [0, 2, 4, 6],
    [6, 8, 10, 12]
  ];
  segments.forEach(([start, control1, control2, end]) => {
    if (path[end] === undefined) return;
    let previous = { x: path[start], y: path[start + 1] };
    for (let step = 1; step <= 24; step += 1) {
      const current = cubicPoint(
        path[start],
        path[start + 1],
        path[control1],
        path[control1 + 1],
        path[control2],
        path[control2 + 1],
        path[end],
        path[end + 1],
        step / 24
      );
      length += Math.hypot(current.x - previous.x, current.y - previous.y);
      previous = current;
    }
  });
  return Math.round(length);
}

export function pointOnPath(path, progress) {
  if (!path?.length) return { x: 0, y: 0 };
  const normalized = Math.max(0, Math.min(1, progress));
  // 单段路径（8 个数值）没有第二段控制点，按整条曲线采样；否则 progress > .5 会读到 undefined 并产生 NaN。
  if (path[12] === undefined) return cubicPoint(path[0], path[1], path[2], path[3], path[4], path[5], path[6], path[7], normalized);
  const segment = normalized <= 0.5 ? [0, 2, 4, 6, normalized * 2] : [6, 8, 10, 12, (normalized - 0.5) * 2];
  return cubicPoint(
    path[segment[0]],
    path[segment[0] + 1],
    path[segment[1]],
    path[segment[1] + 1],
    path[segment[2]],
    path[segment[2] + 1],
    path[segment[3]],
    path[segment[3] + 1],
    segment[4]
  );
}

export function routePoint(path, progress, lateral = 0) {
  const point = pointOnPath(path, progress);
  const before = pointOnPath(path, Math.max(0, progress - 0.012));
  const after = pointOnPath(path, Math.min(1, progress + 0.012));
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: point.x - (dy / length) * lateral, y: point.y + (dx / length) * lateral };
}
