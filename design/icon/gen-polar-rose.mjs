// 玫瑰线（r = cos 5θ，五瓣）：点太多，用脚本算，别手抄坐标
import { writeFileSync } from "node:fs";

const C = 256;
const R = 150;
const N = 540;
const pts = [];
for (let i = 0; i <= N; i++) {
  const th = (i / N) * Math.PI * 2;
  // 0.62 + 0.38·cos：真玫瑰线的圆润版，花瓣不扎到圆心（否则 16px 会糊成星号）
  const r = R * (0.62 + 0.38 * Math.cos(5 * th));
  const x = C + r * Math.cos(th);
  const y = C + r * Math.sin(th);
  pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
}
const d = `M${pts.join(" L")}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="五瓣玫瑰线">
  <defs>
    <clipPath id="sq10"><rect width="512" height="512" rx="114"/></clipPath>
  </defs>
  <g clip-path="url(#sq10)">
    <rect width="512" height="512" fill="#FDFBF7"/>

    <!-- 淡淡的极坐标轴：不画这个就只是花纹 -->
    <g stroke="#E6EDF5" stroke-width="5" stroke-linecap="round">
      <path d="M66 256 H446"/>
      <path d="M256 66 V446"/>
      <path d="M121 121 L391 391"/>
      <path d="M391 121 L121 391"/>
    </g>

    <!-- 极坐标玫瑰线：既是数据图，也是默认主题的名字 -->
    <path d="${d}" fill="none" stroke="#E05F79" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>

    <!-- 圆心：原点 -->
    <circle cx="256" cy="256" r="12" fill="#515A85"/>
  </g>
</svg>
`;

writeFileSync(new URL("10-polar-rose.svg", import.meta.url), svg, "utf8");
console.log("wrote 10-polar-rose.svg");
