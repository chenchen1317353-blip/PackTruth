/**
 * 权威来源域名白名单。
 *
 * 为什么必须在程序里做：提示词里写"请只使用权威网站"完全不可靠，
 * 模型完全可以引用一个看起来很像的域名。真正的把关必须在代码里。
 *
 * 校验规则：hostname 必须等于白名单域名，或者是它的子域名。
 * 关键点：`who.int.example.com` 的 hostname 以 `.example.com` 结尾，
 * 用 `endsWith('.who.int')` 判定会返回 false，因此拦得住这类伪装。
 *
 * V5.1 调整（2026-11-01）：
 * 1. 移除 `gov.cn` 整域放行 —— 它覆盖全部中央和地方政府站点，
 *    地方科普页、转载页都会漏进来，等于把"权威"这件事交给运气。
 *    改为只放行具体部委域名（nhc / samr）。
 * 2. 修正 `chinanutri.cn` → `cnsoc.org`。前者未经核实，
 *    中国营养学会官网实际是 cnsoc.org（已打开确认）。
 *    这一条正好说明"按机构名猜域名"有多容易错。
 * 3. 每条域名都附 verifiedHow，记录是怎么核实的，便于以后复查。
 */

/** 已核实的权威来源域名（2026-11-01 核对） */
export const ALLOWED_DOMAINS = [
  // ---------------- 中国官方（只放具体机构，不放 gov.cn 整域） ----------------
  {
    domain: 'nhc.gov.cn',
    org: '国家卫生健康委员会',
    tier: 'official',
    verifiedHow: '官网域名，GB 28050 标准原文 PDF 即由该域提供',
  },
  {
    domain: 'samr.gov.cn',
    org: '国家市场监督管理总局',
    tier: 'official',
    verifiedHow: '官网域名',
  },
  {
    domain: 'cfsa.net.cn',
    org: '国家食品安全风险评估中心（CFSA）',
    tier: 'official',
    verifiedHow: '含标准查询子域 gb2760.cfsa.net.cn，GB 2760-2024 官方查询系统',
  },
  {
    domain: 'cnsoc.org',
    org: '中国营养学会（Chinese Nutrition Society）',
    tier: 'official',
    verifiedHow: '官网首页已打开确认；注意不是此前误记的 chinanutri.cn',
  },

  // ---------------- 国际组织 ----------------
  {
    domain: 'who.int',
    org: '世界卫生组织（WHO）',
    tier: 'international',
    verifiedHow: 'Fact sheet 页面已抓取核对',
  },
  {
    domain: 'fao.org',
    org: '联合国粮食及农业组织（FAO）',
    tier: 'international',
    verifiedHow: '官网域名',
  },
  {
    domain: 'codexalimentarius.org',
    org: '国际食品法典委员会（Codex）',
    tier: 'international',
    verifiedHow: 'Codex 官方站点域名',
  },
  {
    domain: 'efsa.europa.eu',
    org: '欧洲食品安全局（EFSA）',
    tier: 'international',
    verifiedHow: 'EU 官方机构域名（europa.eu 子域）',
  },
  {
    domain: 'efsa.onlinelibrary.wiley.com',
    org: 'EFSA Journal（EFSA 官方期刊，Wiley 托管）',
    tier: 'international',
    verifiedHow:
      'EFSA 科学意见全文的官方出版地址；efsa.europa.eu 的 “Full article” 链接指向该域。已核对 sucralose 2026 与 glutamates 2017 两篇全文页。',
  },
  {
    // JECFA 毒理学专论（WHO Food Additives Series）的官方镜像。
    // INS 635 的验收案例就卡在这里：人工能打开 inchem.org，程序却把它当白名单外。
    domain: 'inchem.org',
    org: 'IPCS INCHEM（WHO / ILO / UNEP 国际化学品安全规划）',
    tier: 'international',
    verifiedHow:
      'WHO Food Additives Series 原始专论的公开镜像；已逐字核对 v32je06（INS 635 联合评估）的人体观察与评价章节。',
  },
  {
    domain: 'ntp.niehs.nih.gov',
    org: '美国国家毒理学计划（NTP）',
    tier: 'official',
    verifiedHow: '美国卫生与公众服务部 NTP 官方报告站',
  },
  {
    domain: 'epa.gov',
    org: '美国环境保护署（EPA）',
    tier: 'official',
    verifiedHow: 'IRIS 等官方毒理学评估数据库域名',
  },
  {
    domain: 'fda.gov',
    org: '美国食品药品监督管理局（FDA）',
    tier: 'official',
    verifiedHow:
      '官网域名；本次核对的页面：亚硫酸盐召回公告（含「部分哮喘患者」「亚硫酸盐敏感人群」原文）、甜味剂 ADI 说明页',
  },

  // ---------------- 文献库 ----------------
  {
    domain: 'pubmed.ncbi.nlm.nih.gov',
    org: 'PubMed',
    tier: 'literature',
    verifiedHow: 'NLM 官方文献检索站',
  },
  {
    domain: 'ncbi.nlm.nih.gov',
    org: 'NCBI',
    tier: 'literature',
    verifiedHow: 'NLM 官方站点',
  },
];

const DOMAIN_SET = ALLOWED_DOMAINS.map((d) => d.domain.toLowerCase());
const ACADEMIC_DOMAINS = ['onlinelibrary.wiley.com', 'sciencedirect.com', 'springer.com', 'link.springer.com', 'nature.com', 'bmj.com', 'thelancet.com', 'jamanetwork.com', 'academic.oup.com', 'cambridge.org', 'frontiersin.org', 'plos.org', 'mdpi.com', 'europepmc.org', 'doi.org', 'bfr.bund.de', 'foodstandards.gov.au', 'canada.ca'];

/**
 * 判断 URL 是否来自白名单域名。
 * @returns {{ allowed: boolean, reason: string, org: string|null, domain: string|null, tier: string|null }}
 */
export function checkUrlAllowed(rawUrl) {
  const deny = (reason) => ({ allowed: false, reason, org: null, domain: null, tier: null });

  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return deny('URL 为空');
  }

  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return deny('URL 格式不合法');
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    return deny(`不支持的协议：${u.protocol}`);
  }
  if (u.username || u.password) {
    return deny('URL 不能包含用户名或密码');
  }

  // 拒绝内网/环回/链路本地地址：防止被诱导抓取内部服务
  if (isPrivateHost(u.hostname)) {
    return deny(`不允许抓取内网或本机地址：${u.hostname}`);
  }
  if (u.port && !['80', '443'].includes(u.port)) return deny('不允许非标准网页端口');

  const host = u.hostname.toLowerCase().replace(/\.$/, ''); // 去掉尾点，防 `who.int.` 绕过

  // 逐条精确比对：等于白名单域名，或是其子域名
  for (const entry of ALLOWED_DOMAINS) {
    const d = entry.domain.toLowerCase();
    if (host === d || host.endsWith(`.${d}`)) {
      return { allowed: true, reason: null, org: entry.org, domain: d, tier: entry.tier };
    }
  }

  // 额外防一层：形如 who.int.example.com 的伪装
  const looksLikeSpoof = DOMAIN_SET.some((d) => host.includes(d) && !(host === d || host.endsWith(`.${d}`)));
  if (!looksLikeSpoof && (ACADEMIC_DOMAINS.some(d => host === d || host.endsWith(`.${d}`)) || /\.(edu|ac\.uk|edu\.cn|ac\.jp|gov|go\.jp|gov\.au|gov\.uk|govt\.nz|europa\.eu)$/.test(host))) {
    return { allowed: true, reason: null, org: host, domain: host, tier: 'literature' };
  }
  return deny(looksLikeSpoof ? `疑似伪装域名：${host}` : `域名不在白名单：${host}`);
}

/** 内网 / 环回 / 保留地址判定 */
function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  // Public scholarly hosts are DNS names; reject all literal IPs and local suffixes.
  if (h.includes(':') || /^[\d.]+$/.test(h) || !h.includes('.') || /\.(local|internal|lan|home|test|invalid)$/.test(h)) return true;

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** 给前端/日志用：白名单清单 */
export function listAllowedDomains() {
  return ALLOWED_DOMAINS.map((d) => ({ ...d }));
}

/**
 * 生成 site: 查询片段时用的域名列表（按优先级排序）。
 * 顺序即优先级：中文标准机构优先，文献库最后。
 * 查询总长受 128 字符限制，编排层会按这个顺序贪心装填。
 */
export function getSearchSitePriority() {
  return ['nhc.gov.cn', 'cfsa.net.cn', 'who.int', 'fao.org', 'pubmed.ncbi.nlm.nih.gov'];
}

/**
 * 健康评估专项检索的站点优先级（V2.3 验收修复）。
 *
 * JECFA 的评估文档在 who.int / fao.org，EFSA 的意见在 efsa.europa.eu，
 * 毒理与人群研究在 PubMed。国内标准机构排最后 —— 它们主要提供使用条件，
 * 不是健康评估结论。顺序只影响 128 字符预算内先装哪几个站点。
 */
export function getHealthSitePriority() {
  return [
    'who.int',
    'fao.org',
    'inchem.org',
    'efsa.europa.eu',
    'fda.gov',
    'pubmed.ncbi.nlm.nih.gov',
    'cfsa.net.cn',
    'nhc.gov.cn',
  ];
}

/**
 * 检测文本里是否包含典型的提示词注入片段。
 * 不是为了拦截（拦不干净），而是为了在结果里标注"这份网页内容含可疑指令"。
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|above)/i,
  /忽略(以上|之前|前面)(的)?(所有)?(指令|提示|要求)/,
  /system\s*prompt/i,
  /you\s+are\s+now\s+/i,
  /(?:^|\n)\s*(system|assistant|user)\s*[:：]/i,
];

export function detectInjection(text) {
  const s = String(text || '');
  const hits = [];
  for (const re of INJECTION_PATTERNS) {
    const m = s.match(re);
    if (m) hits.push(m[0].slice(0, 60));
  }
  return { suspicious: hits.length > 0, hits };
}
