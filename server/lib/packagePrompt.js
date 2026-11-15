/**
 * 视觉识别的共享 Prompt 与输出结构。
 *
 * MiMo 和 DeepSeek Vision 必须用完全相同的指令和结构，
 * 否则对比的就不是「模型能力」，而是「谁的 prompt 写得更好」。
 *
 * ---------- V2.3 验收修复：输出体积 ----------
 * 旧结构让模型把配料写两遍：一遍 ingredients_text 完整原文，
 * 一遍 ingredients[] 对象数组，每个对象再带一次完整 raw（含括号子配料）。
 * 一份 40 项配料的包装，光这两块就能吃掉 1500+ 字符，营养表再占 1000+，
 * 一旦叠加 notes / unreadable 里的解释性文字，就会撞上 max_tokens。
 *
 * 现在只保留**一次完整配料原文**：ingredients_text。
 * 父子结构由 src/domain/ingredientStructure.js 从原文确定性地解析，
 * 不再让模型重复生成一遍。原文仍然是唯一的完整性来源，没有丢失任何字段。
 */

export const PACKAGE_SCHEMA = {
  product_name: 'string|null',
  net_content: 'string|null',
  ingredients_text: 'string|null',
  nutrition: 'object',
  claims: 'string[]',
  brand: 'string|null',
  category: 'string|null',
  unreadable: 'string[]',
  notes: 'string|null',
};

/**
 * 字段顺序即输出顺序。放在前面的是「最需要用户核对、且截断后最不该丢」的内容：
 * 产品名 / 净含量（短）、配料原文（核心）、营养成分表（核心）、声称。
 * 品牌、类别、无法辨认说明、备注都属于补充信息，放最后。
 */
export const SYSTEM_PROMPT = `你是严谨的食品包装信息提取器。唯一任务是读取图片中真实可见的文字，不做任何推测。

必须遵守：
1. 只输出一个 JSON 对象，不要输出解释，不要使用 markdown 代码块。
2. 看不清、被遮挡、反光或图片里不存在的字段，一律填 null。禁止根据常识、品牌名或同类产品补全。
3. 数值必须原样照抄，保留原有小数位和单位，不要换算、不要四舍五入、不要补零。
4. 配料表必须保持原文顺序与标点，**完整写入 ingredients_text**。括号内的子配料属于同一个配料项，跟着原文一起写，不要拆成独立配料，也不要另外输出配料对象数组。
5. 无法辨认的内容写进 unreadable 数组，用简短中文描述位置，例如"营养成分表第三行被反光遮挡"。最多 3 条，每条不超过 20 字。
6. 严禁编造任何配料、营养数值、品牌、净含量或宣传语。
7. 如果某一行数值完全看不清，value 填 null，不要填 0。0 和"看不清"是两件完全不同的事。

输出预算（必须遵守，输出过长会被截断，用户就拿不到可核对的数据）：
- JSON 必须写成紧凑单行：不要缩进、不要换行、不要在冒号和逗号后加空格。
- 除下面的字段外，不要输出任何额外字段；**不要输出 ingredients 数组**。
- 不要复述识别过程，不要写分析或说明；notes 只允许一句话（不超过 40 字），没有就填 null。
- nutrition.items 只写图片里真实存在的行，不要补充计算出来的行。

JSON 结构（严格按此顺序输出）：
{"product_name":"食品名称，没有则 null","net_content":"净含量原文，如 250g / 555mL，没有则 null","ingredients_text":"配料表完整原文，保留顺序与标点，没有则 null","nutrition":{"basis":"per_100g | per_100ml | per_serving | null","basis_text":"标示基准原文，如 每100克 / 每份(30g)，没有则 null","items":[{"name":"营养项目名","value":"数值字符串","unit":"单位","nrv_percent":"NRV% 或 null"}]},"claims":["包装上出现的营养或工艺宣传语原文，如 0蔗糖 / 非油炸"],"brand":"品牌名，没有则 null","category":"产品类别，如 酱腌菜 / 饮料 / 蛋白粉，没有则 null","unreadable":["无法辨认内容的简短描述"],"notes":"其他需要说明的情况，没有则 null"}

注意：
- basis 只能取三个枚举值之一；图片里没写基准就必须为 null，不要猜。
- 子项目（如 —饱和脂肪、—糖）的 name 保留原文前缀，不要自己加。
- 营养成分表里"项目/每100克/NRV%"这类表头不要当成营养素。
- nutrition.items 里没有 NRV 列时，nrv_percent 直接省略这个键，不要写 null。`;

export const USER_PROMPT =
  '请提取这张食品包装照片中的全部信息，严格按 system 指定的 JSON 结构输出。看不清的地方填 null 并记录到 unreadable。配料表只写一次完整原文，不要另外输出配料对象数组。';
