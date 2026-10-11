import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/zihaoguo/Desktop/中控/scos_proj/2-业务蓝图-draft/汇报文档/20260924汇报';
const outDir = path.join(root, 'SCOS_V20260923_第一页优化素材');

function dataUri(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${fs.readFileSync(file).toString('base64')}`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const bg = dataUri(path.join(root, '.codex-build-scos-3slides/original-wave-bg.png'));
const mark = dataUri(path.join(root, '.codex-build-scos-3slides/original-blue-mark.png'));
const imgs = {
  inventory: dataUri(path.join(outDir, '概念图/01_库存优化.png')),
  procurement: dataUri(path.join(outDir, '概念图/02_采购优化.png')),
  calloff: dataUri(path.join(outDir, '概念图/03_要货计划.png')),
  cost: dataUri(path.join(outDir, '概念图/04_成本分摊.png')),
  cockpit: dataUri(path.join(outDir, '概念图/05_经营驾驶舱.png')),
};

const factoryColors = { '融氏': '#16C7FF', '成都': '#FFD24A', '武汉': '#17D78B' };

const categories = [
  {
    title: '订单', badge: '订', x: 40, y: 160,
    rows: [
      ['融氏', '销售6人；审批3至5天', '复杂订单生成超过1小时'],
      ['成都', '业务量增至3倍，人员未增', '合同审批最长17天'],
      ['武汉', '销售约8人；微信群接单', '合同与SAP重复录入'],
    ],
  },
  {
    title: '库存', badge: '库', x: 40, y: 290,
    rows: [
      ['融氏', 'SAP与台账并行', '安全库存和效期靠人工'],
      ['成都', '入库未自动化', '批次、库位、多地点线下管理'],
      ['武汉', 'SAP手工入库', '安全库存、效期、FIFO线下'],
    ],
  },
  {
    title: '采购', badge: '采', x: 40, y: 420,
    rows: [
      ['融氏', '2人；人工计划与到货安排', '微信通知供应商'],
      ['成都', '3人；淀粉线下询价', '发货表人工跟踪'],
      ['武汉', '3人；船运提前15至20天', '微信和Excel跟踪'],
    ],
  },
  {
    title: '经营', badge: '经', x: 40, y: 550,
    rows: [
      ['融氏', '费用按月分摊', '报表加经验判断，无驾驶舱'],
      ['成都', '成本按月归集', 'SAP导出Excel分析'],
      ['武汉', '财务6人', 'SAP二次加工，无驾驶舱'],
    ],
  },
];

function categoryCard(c) {
  const cellX = [c.x + 118, c.x + 388, c.x + 658];
  return `
    <g>
      <rect x="${c.x}" y="${c.y}" width="935" height="116" rx="16" fill="#101925" fill-opacity="0.94" stroke="#34506A" stroke-width="1.5"/>
      <rect x="${c.x}" y="${c.y}" width="7" height="116" rx="3" fill="#12BFF1"/>
      <text x="${c.x + 25}" y="${c.y + 68}" class="cat">${c.title}</text>
      ${c.rows.map((r, i) => {
        const x = cellX[i];
        const color = factoryColors[r[0]];
        return `
          <rect x="${x}" y="${c.y + 12}" width="260" height="92" rx="11" fill="#0B1723" stroke="${color}" stroke-opacity="0.42"/>
          <rect x="${x + 13}" y="${c.y + 21}" width="62" height="27" rx="7" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-opacity="0.7"/>
          <text x="${x + 44}" y="${c.y + 41}" text-anchor="middle" class="factory" fill="${color}">${r[0]}</text>
          <text x="${x + 13}" y="${c.y + 69}" class="row">${esc(r[1])}</text>
          <text x="${x + 13}" y="${c.y + 92}" class="row muted">${esc(r[2])}</text>
        `;
      }).join('')}
    </g>`;
}

const pains = [
  ['人工录入', '多套表格反复录入，耗时且易错'],
  ['线下协同', '微信、电话和Excel推动，状态难追踪'],
  ['链路断点', '系统间数据未贯通，需要人工接续'],
  ['经验决策', '计划和判断依赖个人经验'],
  ['异常滞后', '风险发现晚，处置依赖人工催办'],
  ['指标分散', '口径与报表分散，缺少统一视图'],
];

function painCards() {
  return pains.map((p, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * 320;
    const y = 750 + row * 112;
    return `
      <g>
        <rect x="${x}" y="${y}" width="305" height="94" rx="13" fill="#0D1E30" fill-opacity="0.96" stroke="#2E5F82"/>
        <circle cx="${x + 28}" cy="${y + 28}" r="14" fill="#133D5A" stroke="#4FD9FF"/>
        <rect x="${x + 22}" y="${y + 22}" width="12" height="12" rx="2" fill="none" stroke="#E8F6FF" stroke-width="2"/>
        <text x="${x + 52}" y="${y + 34}" class="painTitle">${p[0]}</text>
        <text x="${x + 20}" y="${y + 69}" class="painBody">${p[1]}</text>
      </g>`;
  }).join('');
}

const modules = [
  {
    key: 'inventory', title: '库存优化', x: 1045, y: 170,
    f1: '动态库存策略、4周补货建议', f2: '日度库存风险监控', solve: '解决：库存计划缺失、效期靠人工', accent: '#17C8F4'
  },
  {
    key: 'procurement', title: '采购优化', x: 1615, y: 170,
    f1: '优化供方、数量、交期与成本', f2: '自动形成采购建议', solve: '解决：线下询价、人工编制计划', accent: '#FFD24A'
  },
  {
    key: 'calloff', title: '要货计划', x: 1045, y: 720,
    f1: '合同、库存、在途生成日度计划', f2: '缺口预警并推送执行', solve: '解决：微信通知、到货人工跟踪', accent: '#17D78B'
  },
  {
    key: 'cost', title: '成本分摊', x: 1615, y: 720,
    f1: '月度规则分摊与多维分析', f2: '批次异常定位与溯源', solve: '解决：Excel加工、异常难追溯', accent: '#B47CFF'
  },
];

function moduleCard(m, i) {
  const clip = `clipM${i}`;
  return `
    <g>
      <defs><clipPath id="${clip}"><rect x="${m.x + 10}" y="${m.y + 10}" width="230" height="104" rx="11"/></clipPath></defs>
      <rect x="${m.x}" y="${m.y}" width="250" height="260" rx="18" fill="#0A1827" fill-opacity="0.98" stroke="${m.accent}" stroke-width="2"/>
      <image href="${imgs[m.key]}" x="${m.x + 10}" y="${m.y + 10}" width="230" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>
      <rect x="${m.x + 10}" y="${m.y + 10}" width="230" height="104" rx="11" fill="url(#photoFade)"/>
      <text x="${m.x + 18}" y="${m.y + 142}" class="moduleTitle" fill="${m.accent}">${m.title}</text>
      <text x="${m.x + 18}" y="${m.y + 172}" class="moduleBody">${m.f1}</text>
      <text x="${m.x + 18}" y="${m.y + 197}" class="moduleBody">${m.f2}</text>
      <rect x="${m.x + 14}" y="${m.y + 214}" width="222" height="34" rx="8" fill="${m.accent}" fill-opacity="0.10"/>
      <text x="${m.x + 24}" y="${m.y + 237}" class="solve">${m.solve}</text>
    </g>`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="splitLine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19C7F4" stop-opacity="0"/><stop offset="0.5" stop-color="#19C7F4"/><stop offset="1" stop-color="#19C7F4" stop-opacity="0"/></linearGradient>
    <linearGradient id="photoFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#07131E" stop-opacity="0"/><stop offset="1" stop-color="#07131E" stop-opacity="0.88"/></linearGradient>
    <linearGradient id="centerGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0E76E8"/><stop offset="1" stop-color="#13C8D9"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      text{font-family:'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif}
      .title{font-size:44px;font-weight:700;fill:#FFF000}.subtitle{font-size:30px;font-weight:600;fill:#F2F7FA}
      .section{font-size:29px;font-weight:700;fill:#FFFFFF}.sectionFuture{font-size:29px;font-weight:700;fill:#FFD64A}
      .cat{font-size:28px;font-weight:700;fill:#FFFFFF}.hint{font-size:16px;fill:#7891A7}
      .factory{font-size:17px;font-weight:700}.row{font-size:16px;fill:#E0EAF1}.muted{fill:#9EB4C4}.common{font-size:25px;font-weight:700;fill:#FF6A56}
      .painTitle{font-size:21px;font-weight:700;fill:#F3F7FA}.painBody{font-size:15px;fill:#AFC2D2}
      .moduleTitle{font-size:25px;font-weight:700}.moduleBody{font-size:16px;fill:#E5EEF5}.solve{font-size:14px;font-weight:600;fill:#F2F7FA}
      .cockpitTitle{font-size:27px;font-weight:700;fill:#FFFFFF}.cockpitBody{font-size:17px;fill:#E5F1F7}.cockpitSolve{font-size:14px;font-weight:600;fill:#CFF6FF}
    </style>
  </defs>
  <rect width="1920" height="1080" fill="#02060B"/>
  <image href="${bg}" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" opacity="0.56"/>
  <rect width="1920" height="1080" fill="#02070D" opacity="0.66"/>
  <ellipse cx="1450" cy="560" rx="470" ry="460" fill="#063A55" opacity="0.18"/>
  <ellipse cx="500" cy="540" rx="580" ry="460" fill="#0A1C38" opacity="0.24"/>

  <image href="${mark}" x="42" y="12" width="76" height="70" preserveAspectRatio="xMidYMid meet" opacity="0.95"/>
  <text x="88" y="66" class="title">行业现状与未来蓝图对比</text>
  <text x="650" y="66" class="subtitle">— 01  现状诊断与SCOS协同蓝图</text>
  <line x1="45" y1="97" x2="1875" y2="97" stroke="#4B535A" stroke-width="1"/>

  <text x="42" y="140" class="section">现状｜三厂业务链路</text>
  <text x="1045" y="140" class="sectionFuture">未来｜模型驱动、人工决策、统一经营</text>
  <line x1="1018" y1="120" x2="1018" y2="1025" stroke="url(#splitLine)" stroke-width="2"/>
  <path d="M985 125 L1002 142 L985 159 M1000 125 L1017 142 L1000 159" fill="none" stroke="#FFD42A" stroke-width="4"/>

  ${categories.map(categoryCard).join('')}
  <text x="40" y="725" class="common">总体共性问题</text>
  ${painCards()}

  ${modules.map(moduleCard).join('')}

  <g>
    <defs><clipPath id="clipCockpit"><rect x="1332" y="452" width="246" height="108" rx="13"/></clipPath></defs>
    <rect x="1320" y="440" width="270" height="270" rx="24" fill="#071928" stroke="#5BE0FF" stroke-width="3" filter="url(#glow)"/>
    <image href="${imgs.cockpit}" x="1332" y="452" width="246" height="108" preserveAspectRatio="xMidYMid slice" clip-path="url(#clipCockpit)"/>
    <rect x="1332" y="452" width="246" height="108" rx="13" fill="url(#photoFade)"/>
    <rect x="1365" y="546" width="180" height="36" rx="18" fill="url(#centerGlow)"/>
    <text x="1455" y="572" text-anchor="middle" class="cockpitTitle">经营驾驶舱</text>
    <text x="1455" y="613" text-anchor="middle" class="cockpitBody">全指标汇聚、异常钻取</text>
    <text x="1455" y="639" text-anchor="middle" class="cockpitBody">人工复核形成决策闭环</text>
    <rect x="1334" y="660" width="242" height="34" rx="9" fill="#5BE0FF" fill-opacity="0.10" stroke="#5BE0FF" stroke-opacity="0.55"/>
    <text x="1455" y="682" text-anchor="middle" class="cockpitSolve">解决：指标分散、经验判断、异常滞后</text>
  </g>

  <!-- 四个业务模块与经营驾驶舱连接；首尾严格落在卡片边框上 -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1260 430 L1370 440" stroke="#5BE0FF" stroke-width="5"/>
    <path d="M1650 430 L1540 440" stroke="#5BE0FF" stroke-width="5"/>
    <path d="M1260 720 L1370 710" stroke="#5BE0FF" stroke-width="5"/>
    <path d="M1650 720 L1540 710" stroke="#5BE0FF" stroke-width="5"/>
  </g>

  <rect x="1060" y="990" width="790" height="52" rx="13" fill="#0B2232" stroke="#1BAED5" stroke-opacity="0.8"/>
  <text x="1455" y="1023" text-anchor="middle" font-family="PingFang SC" font-size="19" font-weight="600" fill="#DFF7FF">系统自动生成建议　　业务人员复核调整　　审批后发布执行</text>
</svg>`;

fs.writeFileSync(path.join(outDir, '第一页优化缩略图.svg'), svg);
console.log(path.join(outDir, '第一页优化缩略图.svg'));
