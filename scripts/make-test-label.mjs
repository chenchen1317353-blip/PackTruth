import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 生成一张「完全虚构」的食品包装营养标签图，用于测试 A。
 * 为什么不用 AI 生图：生图模型的文字经常糊掉或拼错，
 * 那样测试出的识别错误就无法区分「模型能力问题」和「图片本身有问题」。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public');

const FONT = "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC',sans-serif";

const nutrition = [
  ['能量', '2010 kJ', '24%'],
  ['蛋白质', '7.5 g', '13%'],
  ['脂肪', '18.2 g', '30%'],
  ['　— 反式脂肪酸', '0 g', '—'],
  ['碳水化合物', '68.0 g', '23%'],
  ['　— 糖', '12.4 g', '—'],
  ['钠', '320 mg', '16%'],
];

function svg() {
  const W = 900;
  const H = 1320;

  const rowH = 42;
  const tableTop = 660;
  const tableLeft = 90;
  const tableW = 720;
  const tableH = 62 + nutrition.length * rowH;
  const colX = [tableLeft + 22, tableLeft + 590 - 22, tableLeft + 720 - 22];
  const divider1 = tableLeft + 400;
  const divider2 = tableLeft + 590;

  const rows = nutrition
    .map((r, i) => {
      const y = tableTop + 58 + i * rowH;
      return `
      <line x1="${tableLeft}" y1="${y + rowH - 10}" x2="${tableLeft + tableW}" y2="${y + rowH - 10}" stroke="#d9d9d9" stroke-width="1"/>
      <text x="${colX[0]}" y="${y + 17}" font-family="${FONT}" font-size="25" fill="#1a1a1a">${r[0]}</text>
      <text x="${colX[1]}" y="${y + 17}" font-family="${FONT}" font-size="25" fill="#1a1a1a" text-anchor="end">${r[1]}</text>
      <text x="${colX[2]}" y="${y + 17}" font-family="${FONT}" font-size="25" fill="#1a1a1a" text-anchor="end">${r[2]}</text>`;
    })
    .join('');

  const claimsY = tableTop + tableH + 50;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#e8e8e8" stroke-width="2"/>

  <!-- 品牌 -->
  <text x="90" y="120" font-family="${FONT}" font-size="26" fill="#8a8a8a" letter-spacing="6">晨野 CHENYE</text>

  <!-- 产品名 -->
  <text x="90" y="200" font-family="${FONT}" font-size="58" font-weight="bold" fill="#1a1a1a">阳光谷物脆</text>
  <text x="90" y="248" font-family="${FONT}" font-size="26" fill="#5a5a5a">混合谷物早餐脆片 · 原味</text>

  <!-- 净含量 -->
  <text x="${W - 90}" y="200" font-family="${FONT}" font-size="30" fill="#1a1a1a" text-anchor="end">净含量 250g</text>

  <line x1="90" y1="290" x2="${W - 90}" y2="290" stroke="#1a1a1a" stroke-width="3"/>

  <!-- 配料表 -->
  <text x="90" y="352" font-family="${FONT}" font-size="32" font-weight="bold" fill="#1a1a1a">配料表</text>
  <text x="90" y="398" font-family="${FONT}" font-size="25" fill="#2b2b2b">小麦粉、白砂糖、植物油、麦芽糊精、食用盐、</text>
  <text x="90" y="438" font-family="${FONT}" font-size="25" fill="#2b2b2b">柠檬酸、黄原胶、维生素E。</text>
  <text x="90" y="486" font-family="${FONT}" font-size="21" fill="#6b6b6b">过敏原提示：本品含有小麦制品（麸质）。</text>

  <!-- 营养成分表 -->
  <text x="90" y="556" font-family="${FONT}" font-size="32" font-weight="bold" fill="#1a1a1a">营养成分表</text>
  <text x="90" y="598" font-family="${FONT}" font-size="22" fill="#5a5a5a">每 100 克（g）</text>

  <rect x="${tableLeft}" y="${tableTop}" width="${tableW}" height="${tableH}" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>
  <line x1="${tableLeft}" y1="${tableTop + 58}" x2="${tableLeft + tableW}" y2="${tableTop + 58}" stroke="#1a1a1a" stroke-width="2.5"/>
  <line x1="${divider1}" y1="${tableTop}" x2="${divider1}" y2="${tableTop + tableH}" stroke="#1a1a1a" stroke-width="1.5"/>
  <line x1="${divider2}" y1="${tableTop}" x2="${divider2}" y2="${tableTop + tableH}" stroke="#1a1a1a" stroke-width="1.5"/>

  <text x="${colX[0]}" y="${tableTop + 40}" font-family="${FONT}" font-size="24" font-weight="bold" fill="#1a1a1a">项目</text>
  <text x="${colX[1]}" y="${tableTop + 40}" font-family="${FONT}" font-size="24" font-weight="bold" fill="#1a1a1a" text-anchor="end">每100克</text>
  <text x="${colX[2]}" y="${tableTop + 40}" font-family="${FONT}" font-size="24" font-weight="bold" fill="#1a1a1a" text-anchor="end">NRV%</text>
  ${rows}

  <!-- 营养声称 -->
  <rect x="90" y="${claimsY}" width="240" height="60" rx="30" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>
  <text x="210" y="${claimsY + 41}" font-family="${FONT}" font-size="29" font-weight="bold" fill="#1a1a1a" text-anchor="middle">0 蔗糖</text>

  <rect x="356" y="${claimsY}" width="286" height="60" rx="30" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>
  <text x="499" y="${claimsY + 41}" font-family="${FONT}" font-size="29" font-weight="bold" fill="#1a1a1a" text-anchor="middle">0 反式脂肪</text>

  <!-- 底部说明 -->
  <line x1="90" y1="${H - 130}" x2="${W - 90}" y2="${H - 130}" stroke="#e0e0e0" stroke-width="1"/>
  <text x="90" y="${H - 92}" font-family="${FONT}" font-size="20" fill="#8a8a8a">本标签为 PackTruth 接口测试用虚构样品，不对应任何真实商品。</text>
  <text x="90" y="${H - 58}" font-family="${FONT}" font-size="20" fill="#8a8a8a">生产商：晨野食品（虚构）　产地：某某市（虚构）</text>
</svg>`;
}

await mkdir(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, 'test-label.png');

const info = await sharp(Buffer.from(svg())).png({ quality: 95 }).toFile(outPath);

console.log(`已生成：${outPath}`);
console.log(`尺寸：${info.width} x ${info.height}，大小：${(info.size / 1024).toFixed(1)} KB`);
