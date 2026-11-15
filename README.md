# PackTruth 食物真相

看懂包装，选择，心里有数。

PackTruth 是运行在电脑本地的食品包装解读与健康科普网页应用：上传包装图片，核对配料和营养信息，查看宣传语解释、营养换算和成分健康证据。

## 功能

- 图片选择、AI识别与人工修正，区分未标示与真实零值。
- 包装宣传语解读、食用量换算及复合配料展开。
- 具体成分的简明与深入解释，说明研究对象、剂量、适用条件和原始来源。
- 四个既有虚构演示：清柠气泡水、燕麦纤维饼干、原味发酵乳、山椒脆笋。
- 用户自带DeepSeek API Key（BYOK），保留预算限制、取消、超时和凭据隔离。

## 本地运行

推荐 Node.js 24 LTS、npm 和新版 Chrome/Edge。首次安装依赖需要互联网。

~~~sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
~~~

在电脑浏览器打开 http://127.0.0.1:5173/ ，终端按 Ctrl+C 关闭。端口占用时改用5174，并访问对应端口。前端与Express API由Vite挂载在同一端口，无需单独启动后端。

无Key时从首页选择体验样品；也可上传 public/test-label.png（合成标签）检查预览并跳过识别，手动填写信息。个人实拍样本不随仓库发布，开发对比工具的图片清单默认留空。

真实图片识别和联网健康研究需要互联网及有效DeepSeek Key。在网页“AI功能设置”中填写自己的Key，阅读费用提示；设置不会自动发起付费验证。Key只保存在当前页面内存，刷新需重填。无需将Key写入.env，不使用开发者凭据代付。联网调用由Key所属账户计费，取消不能撤销已发出的上游计费。

中文字体样式从外部CDN加载，网络不可用时回退系统字体；四个演示使用本地数据。打开原始科学文献链接需要互联网。项目未提供公网服务或独立手机端入口。

## 构建与免费测试

~~~sh
npm run build
npm run test:science
npm run test:healthanswer
node scripts/test-domain.mjs
node scripts/test-byok.mjs
~~~

build生成dist。npm run preview仅预览静态文件，不提供完整API；npm run server仅提供API。完整开发体验使用上述dev命令。

scripts中保留历史回归与研究工具，部分依赖未公开的运行记录，部分会调用付费API；不要批量执行所有脚本。test:api、test:recognize、vision:compare等需要单独了解费用和本机配置后再使用。测试替身与离线演示不代表真实联网验证。

## 目录

- src/：React界面、配料、营养、宣传语和健康证据领域逻辑。
- server/：Express API、BYOK、Search/Fetch/Chat编排、证据核验及预算控制。
- public/：图标、本地字体及合成标签。
- scripts/：逻辑回归、浏览器测试与开发工具。
- portable/：Windows本机托管入口源码，需要相应生产构建和打包后端，不是克隆后即可双击的程序。
- licenses/：字体原始许可证。

本仓库提供项目源码，不附Node运行时、依赖目录、个人参赛材料、真实密钥、私人照片、开发会话或历史付费日志。

## 科学与隐私边界

内容用于食品信息整理和科普，不作诊断、用药或个体治疗建议。高剂量、动物或特定人群研究必须保留其条件；名称、技术用途或ADI本身不能代替具体健康影响。不能保证所有成分都有完整人体研究，模型结果仍应结合原文核对。

上传图片和联网研究会将必要内容发送至上游服务，请勿上传含个人敏感信息的图片。提交问题或代码时不要包含Key、原始上传、个人资料或敏感日志。详见 SECURITY.md。

## 许可证

原创代码按MIT许可证发布，见 LICENSE。Inter、Space Grotesk与MiSans字体沿用各自原许可证；第三方依赖与科学原文不因本项目MIT许可证改变其版权或使用条件。字体协议见licenses，依赖版本与声明见package.json和package-lock.json。
