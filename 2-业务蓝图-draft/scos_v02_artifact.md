# SCOS v0.2 第三、四章编制契约

## Reference

- 源文档：`/Users/duanqiyao/Desktop/project/蓝图设计/3-业务蓝图-终态/SCOS_中粮太仓项目研发模块蓝图方案v0.1.docx`
- SHA-256：`466d9be41e5821c8b75c6a92071e8dacde04b15dac7afe0985a45d230e9d8cfe`
- 渲染页数：52页；分节数：2。
- 证据：`/tmp/scos_blueprint_v02/reference-render`、`/tmp/scos_blueprint_v02/template-style-evidence.json`，并已执行 section/style/field/heading 审计。

## Page system

- 两节均为A4竖版（8.27 x 11.69 in）。
- 第1节边距：左/右1.25 in，上0.54 in，下1.00 in。
- 第2节边距：左/右1.25 in，上0.00 in，下1.00 in；首页不同。
- 正文页面固定保留中粮和中控页眉图形、页脚 PAGE/NUMPAGES 字段。

## Typography and components

- 保留源文档样式集，不引入新的样式系统。
- Heading 1/2/3 分别继承源文档的章、节、小节视觉角色；正文使用 Normal/Body Text。
- 源文档主要字体为宋体/宋体-简，标题少量使用黑体；新增内容继承相同东亚字体设定。
- 表格继承源文档网格表样式，表头灰底、字段型清单和对比矩阵使用明确列宽、自动行高和重复表头。
- 不删除或重建封面、页眉页脚、第一/二章流程图和第五至八章内容。

## Content flow and slot map

- `word/document.xml` 中 body child 176 为第三章标题“SCOS驾驶舱场景推演功能应用场景说明书”。
- body child 232 为第四章标题“SCOS技术蓝图交付物”。
- body child 299 为第五章标题“SCOS集成接口规范”。
- 允许重写范围：body child `[176, sectPr)`；其中原PLM/AI配方、PLM字段映射、数字化工艺包、PLM接口、PLM智能化场景、PLM非功能响应和PLM交付物内容必须移除。
- 第三章新内容：总体说明、驾驶舱态势监测、预警联动、沙盘推演、采购优化、成品库存优化、精益排程、成本核算、追溯、验收及待确认项。
- 第四章新内容：技术原则、总体架构、数据流、数据域/实体、模型服务、数据发布与版本、安全运维与非功能、待确认项。
- 第五至八章同步改写为SCOS接口清单、智能化场景及验收覆盖率、非功能需求响应表和SCOS蓝图交付物清单，以消除原文档中的PLM残留和章节冲突。
- 正文表述以“已有资料能支撑的方案”为主；排程约束、成本分摊、批次编码、基础设施等未知事实显式标为“待确认”。

## Package preservation

- 基线包共56个 parts。
- 主要保留件的 SHA-256：`styles.xml=ff0c...014b`，`numbering.xml=94d5...2955d1`，`header2.xml=d2c6...fb567`，`footer3.xml=f849...8f0ec`，`footer4.xml=9fd3...41bc8`。
- 可编辑 parts：`word/document.xml`；`word/settings.xml` 仅允许新增/更新 `w:updateFields=true`。
- 保留 parts：所有 media、header/footer、styles、numbering、theme、comments/customXml、relationships 和 content-types，除非 python-docx 为新表格必要生成引用。

## Fidelity gates

- 源文档在交付后仍必须与基线 SHA-256 一致。
- 第一/二章文本和嵌入图像不发生超出分页连锁的变化；第五至八章允许按SCOS范围完整改写。
- 新增标题必须使用 Heading 1/2/3，以便 Word 更新目录。
- 所有表格不设固定行高，必须能自动换行，表头重复，字号不低于8 pt。
- 渲染后逐页检查第三/四章的表格截断、标题孤行、空白页和页眉页脚。当前 LibreOffice 渲染环境对中文字形显示有缺失，因此同时执行文本、OOXML、表格几何和包完整性检查。
