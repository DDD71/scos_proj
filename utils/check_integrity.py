#!/usr/bin/env python3
"""HTML 演示文件静态完整性检查。

对重构后的驾驶舱 demo 与 F42 库存演示做只读断言，验证：
1. JS 括号配平（正确处理字符串/模板字符串/注释）
2. HTML 标签配平
3. 数据变量声明唯一性（data.js 里声明恰 1 次，主脚本 0 次）
4. 无 mule.page 脚手架残留、无猴子补丁别名残留
5. 加载顺序正确（data.js 在 echarts 之后、主脚本之前）

用法：python3 check_integrity.py
退出码 0 = 全部通过，1 = 存在失败项。
"""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DEMO_HTML = ROOT / "2-业务蓝图-draft/驾驶舱模块/驾驶舱/demo/index.html"
DEMO_DATA = ROOT / "2-业务蓝图-draft/驾驶舱模块/驾驶舱/demo/data.js"
F42_HTML = ROOT / "2-业务蓝图-draft/库存优化模块/F42_库存优化计划演示.html"
F42_DATA = ROOT / "2-业务蓝图-draft/库存优化模块/data.js"

# 抽取到 data.js 的数据变量（demo）
DEMO_DATA_VARS = [
    "PT", "PB", "BO", "INV_PRODUCTS", "DASH_ALERTS", "ALERT_ROOT",
    "SANDBOX_METRICS", "SANDBOX_SCENARIOS",
    "SANDBOX_PRODUCT_CASES", "SANDBOX_MATERIAL_CASES",
]
# 抽取到 data.js 的数据变量（F42）
F42_DATA_VARS = ["baseDate", "dates", "defaults", "plans"]


def extract_inline_scripts(html: str) -> list[str]:
    """提取所有内联 <script>...</script> 内容（排除带 src 的）。"""
    return re.findall(r"<script>(.*?)</script>", html, re.S)


def check_js_balance(src: str, label: str) -> list[str]:
    """检查一段 JS 的 (){}[] 括号配平，返回错误列表（空表示通过）。"""
    stack = []  # (char, is_template_expr)
    pairs = {")": "(", "}": "{", "]": "["}
    in_str = None  # None | "'" | '"' | '`'
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if in_str in ("'", '"'):
            if c == "\\":
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif in_str == "`":
            if c == "\\":
                i += 2
                continue
            if c == "`":
                in_str = None
            elif c == "$" and i + 1 < n and src[i + 1] == "{":
                stack.append(("{", True))
                in_str = None
                i += 2
                continue
        else:
            if c in "'\"`":
                in_str = c
            elif c == "/" and i + 1 < n and src[i + 1] == "/":
                while i < n and src[i] != "\n":
                    i += 1
                continue
            elif c == "/" and i + 1 < n and src[i + 1] == "*":
                i += 2
                while i + 1 < n and not (src[i] == "*" and src[i + 1] == "/"):
                    i += 1
                i += 1
                continue
            elif c in "({[":
                stack.append((c, False))
            elif c in ")}]":
                if not stack or stack[-1][0] != pairs[c]:
                    return [f"{label} 括号不匹配：pos {i} 遇到 {c!r}，栈顶为 {stack[-1] if stack else None}"]
                if stack.pop()[1]:
                    in_str = "`"  # ${...} 结束，恢复模板字符串模式
        i += 1
    if stack:
        return [f"{label} 存在未闭合括号：{stack[-3:]}"]
    return []


class TagBalancer(HTMLParser):
    """HTML 标签配平检查器（仅追踪需要配对的容器标签）。"""

    VOID = {"meta", "link", "img", "br", "hr", "input", "source", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass  # 自闭合，忽略

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if not self.stack:
            self.errors.append(f"多余的闭合标签 </{tag}>")
            return
        if self.stack[-1] == tag:
            self.stack.pop()
        else:
            # 容错：跳过中间不匹配的（HTML 容忍度），仅报告未闭合的
            if tag in self.stack:
                while self.stack and self.stack[-1] != tag:
                    self.errors.append(f"标签 <{self.stack[-1]}> 未闭合")
                    self.stack.pop()
                self.stack.pop()
            else:
                self.errors.append(f"不匹配的闭合标签 </{tag}>（栈顶 <{self.stack[-1]}>）")

    def result(self):
        for t in reversed(self.stack):
            self.errors.append(f"标签 <{t}> 未闭合")
        return self.errors


def check_html_balance(html: str, label: str) -> list[str]:
    p = TagBalancer()
    p.feed(html)
    p.close()
    return [f"{label}: {e}" for e in p.result()]


def decl_count(src: str, var: str) -> int:
    """统计 src 里 var 的顶层声明次数（const/let/var NAME 后跟 = { [）。"""
    return len(re.findall(rf"(?:^|[;\n])\s*(?:const|let|var)\s+{re.escape(var)}\s*[={{\[]", src))


def main() -> int:
    errors: list[str] = []

    demo_html = DEMO_HTML.read_text(encoding="utf-8")
    demo_data = DEMO_DATA.read_text(encoding="utf-8")
    f42_html = F42_HTML.read_text(encoding="utf-8")
    f42_data = F42_DATA.read_text(encoding="utf-8")

    # 1. JS 括号配平
    for label, src in [("demo/data.js", demo_data), ("F42/data.js", f42_data)]:
        errors += check_js_balance(src, label)
    for label, html in [("demo/index.html", demo_html), ("F42", f42_html)]:
        for si, s in enumerate(extract_inline_scripts(html)):
            errors += check_js_balance(s, f"{label} script{si}")

    # 2. HTML 标签配平
    errors += check_html_balance(demo_html, "demo/index.html")
    errors += check_html_balance(f42_html, "F42")

    # 3. 数据变量声明唯一性
    for var in DEMO_DATA_VARS:
        if decl_count(demo_data, var) != 1:
            errors.append(f"demo/data.js 里 {var} 声明次数 != 1（实为 {decl_count(demo_data, var)}）")
        if decl_count(demo_html, var) != 0:
            errors.append(f"demo/index.html 里仍残留 {var} 的声明")
    for var in F42_DATA_VARS:
        if decl_count(f42_data, var) != 1:
            errors.append(f"F42/data.js 里 {var} 声明次数 != 1（实为 {decl_count(f42_data, var)}）")
        if decl_count(f42_html, var) != 0:
            errors.append(f"F42 里仍残留 {var} 的声明")

    # 4. 无残留检查
    scaffold_markers = ["__mr", "__md", "mulepage", "mulerun", "canonical", "og:"]
    for marker in scaffold_markers:
        if marker in demo_html:
            errors.append(f"demo/index.html 残留脚手架标记 {marker!r}")
    alias_names = [
        "renderInventoryBase", "renderInventoryShortageBase",
        "renderInventoryRevisionBase", "renderChartLegacy", "renderDemandRevisionBase",
    ]
    for alias in alias_names:
        if alias in f42_html:
            errors.append(f"F42 残留猴子补丁别名 {alias!r}")

    # 5. 加载顺序
    demo_scripts = re.findall(r'<script[^>]*src="([^"]*)"[^>]*>', demo_html)
    if "data.js" not in demo_scripts:
        errors.append("demo/index.html 未引用 data.js")
    elif demo_scripts.index("data.js") <= demo_scripts.index("assets/echarts.min.js"):
        errors.append("demo/index.html 的 data.js 未排在 echarts.min.js 之后")
    if "data.js" not in f42_html:
        errors.append("F42 未引用 data.js")
    else:
        main_script_pos = f42_html.find("<script>")
        data_script_pos = f42_html.find('<script src="data.js">')
        if main_script_pos < 0 or data_script_pos < 0 or data_script_pos > main_script_pos:
            errors.append("F42 的 data.js 未排在主 <script> 之前")

    if errors:
        for e in errors:
            print(f"[FAIL] {e}", file=sys.stderr)
        print(f"\n共 {len(errors)} 项失败", file=sys.stderr)
        return 1
    print("所有完整性检查通过 ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
