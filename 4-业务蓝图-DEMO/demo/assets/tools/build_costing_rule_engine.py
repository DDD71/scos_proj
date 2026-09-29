#!/usr/bin/env python3
"""Build the demo rule-engine configuration from the current costing sample data."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "costing"
SCRIPTS = ROOT / "scripts" / "costing"


def pick(rows, key, value):
    return next(row for row in rows if row[key] == value)


def money(value):
    return f"{value:,.2f}"


def rule(
    rule_id,
    name,
    owner,
    frequency,
    summary,
    applies_when,
    parameters,
    formulas,
    pseudocode,
    validations,
    json_config,
    sample,
):
    return {
        "id": rule_id,
        "name": name,
        "owner": owner,
        "frequency": frequency,
        "enabled": True,
        "priority": int(rule_id.split("-")[1]),
        "severity": "阻断" if any(v["action"] == "BLOCK" for v in validations) else "告警",
        "summary": summary,
        "appliesWhen": applies_when,
        "parameters": parameters,
        "formulas": formulas,
        "pseudocode": pseudocode,
        "validations": validations,
        "jsonConfig": json_config,
        "sampleExecution": sample,
    }


def main():
    lineage = json.loads((DATA / "costing-lineage-data.json").read_text(encoding="utf-8"))
    costing = json.loads((DATA / "costing-batch-data-v3.json").read_text(encoding="utf-8"))

    incoming = pick(lineage["batches"], "id", "260810-001-DZJYM")
    f42 = pick(lineage["batches"], "id", "20260812-F42-0100")
    qc = pick(lineage["batches"], "id", "260812-Q01-01")
    finished = pick(lineage["batches"], "id", "260813-F01-01")
    relation = pick(lineage["relations"], "id", "REL-F55-89-001")
    direct = [x for x in costing["directDetails"] if x["batch"] == incoming["id"]]
    f42_direct_aux = [
        x for x in costing["directDetails"]
        if x["batch"] == f42["id"] and x["costSubcategory"] in {"酸碱及过滤辅料", "酶制剂及配方辅料"}
    ]
    f42_periodic_aux = [
        x for x in costing["poolAllocations"]
        if x["batch"] == f42["id"] and x["itemCode"] in {"CE016", "CE024", "CE025", "CE026"}
    ]
    pool = [x for x in costing["poolAllocations"] if x["batch"] == finished["id"]]
    batch_cost = pick(costing["batchCosts"], "batch", finished["id"])
    electricity = pick(pool, "itemCode", "CE030")

    common_status = {
        "status": "通过",
        "lastCheck": "2026-09-30 02:00",
        "ruleVersion": "RULESET-202608-V7",
    }

    engines = [
        {
            "id": "BATCH_DIVISION",
            "name": "批次划分",
            "description": "依据生效工艺路由和实际业务边界生成可追溯批次，不以固定层数替代真实工艺。",
            "version": "DIV-202608-V3",
            "inputSchema": [
                {"field": "event_time", "type": "datetime", "required": True, "description": "生产或物流事件时间"},
                {"field": "route_code", "type": "string", "required": True, "description": "产品对应的工艺路由"},
                {"field": "object_type", "type": "enum", "required": True, "description": "车辆、连续装置、实体罐、装车单等"},
                {"field": "material_code", "type": "string", "required": True, "description": "批次物料"},
                {"field": "device_or_tank", "type": "string", "required": True, "description": "设备、罐号或作业位置"},
                {"field": "start_time/end_time", "type": "datetime", "required": True, "description": "实际边界时间"},
                {"field": "measured_qty", "type": "decimal", "required": True, "description": "实测批次数量"},
            ],
            "outputSchema": [
                {"field": "batch_id", "type": "string", "description": "按对象类型生成的唯一批次号"},
                {"field": "route_version", "type": "string", "description": "命中的已发布路由版本"},
                {"field": "stage/order", "type": "string/int", "description": "路由节点和顺序"},
                {"field": "boundary_evidence", "type": "object", "description": "形成批次边界的原始记录"},
                {"field": "status", "type": "enum", "description": "已生成、已放行、已入库等"},
            ],
            "pipeline": [
                {"step": 1, "name": "匹配路由", "action": "按物料和事件时间匹配唯一已发布版本", "onFailure": "阻断批次生成"},
                {"step": 2, "name": "识别对象", "action": "识别车辆/设备窗口/实体罐/装车事件", "onFailure": "进入待确认队列"},
                {"step": 3, "name": "切分边界", "action": "按对象专属边界形成批次", "onFailure": "不允许自动合并"},
                {"step": 4, "name": "完整性校验", "action": "校验时间、数量、物料、设备和状态", "onFailure": "批次不发布"},
            ],
            "rules": [
                rule(
                    "DIV-001", "路由与版本有效性", "生产管理员", "每次批次生成前",
                    "按事件发生时点命中唯一已发布工艺路由，路由节点、对象类型和前后置关系必须完整。",
                    "event_time ∈ [route.valid_from, route.valid_to) AND route.status = 'PUBLISHED'",
                    [
                        {"name": "versionMatchMode", "value": "EVENT_TIME", "description": "按业务事件时间匹配版本"},
                        {"name": "allowedStatus", "value": ["PUBLISHED"], "description": "仅允许已发布路由"},
                        {"name": "matchCardinality", "value": 1, "description": "必须且只能命中一个版本"},
                    ],
                    [
                        {"name": "版本区间", "expression": "valid_from ≤ event_time < COALESCE(valid_to, +∞)", "explanation": "事件时间必须落在路由版本有效区间内。"},
                        {"name": "唯一命中", "expression": "COUNT(matched_route_version) = 1", "explanation": "0个或多个版本均视为配置异常。"},
                        {"name": "节点完整率", "expression": "completeness = configured_required_nodes / required_nodes = 100%", "explanation": "产品路线要求的节点和对象类型不可缺失。"},
                    ],
                    [
                        "routes = query(route_code, status='PUBLISHED')",
                        "matched = filter(routes, valid_from <= event_time < valid_to)",
                        "assert len(matched) == 1 else BLOCK('DIV_E001')",
                        "assert required_nodes ⊆ matched[0].nodes else BLOCK('DIV_E002')",
                        "return matched[0].version",
                    ],
                    [
                        {"condition": "matched_route_count = 0", "errorCode": "DIV_E001", "message": "未找到事件时点生效的已发布路由", "action": "BLOCK"},
                        {"condition": "matched_route_count > 1", "errorCode": "DIV_E002", "message": "生效区间重叠，无法唯一选择路由", "action": "BLOCK"},
                        {"condition": "required_node_missing", "errorCode": "DIV_E003", "message": "必经节点或批次对象类型缺失", "action": "BLOCK"},
                    ],
                    {"selector": {"key": ["route_code", "event_time"], "status": ["PUBLISHED"], "cardinality": "EXACTLY_ONE"}, "versionPolicy": "event_time", "publishGate": ["node_complete", "object_type_complete"]},
                    {"title": f"{incoming['id']} 路由命中", "input": {"eventTime": incoming["start"], "route": incoming["route"], "material": incoming["material"]}, "steps": [f"事件时间 {incoming['start']} 落在果葡糖浆产线当前发布版本有效区间", "唯一命中 ROUTE-FGS-202608-V3", "必经节点和对象类型完整"], "output": {"routeVersion": "ROUTE-FGS-202608-V3", "decision": "PASS"}, "evidence": incoming["source"]},
                ),
                rule(
                    "DIV-002", "按实际业务边界生成批次", "生产管理员", "事件触发+日终全量",
                    "针对入厂车辆、连续装置、实体罐和装车事件使用不同的边界函数，禁止按固定时长或固定层数粗切。",
                    "object_type IN ['INBOUND_TRIP','CONTINUOUS_WINDOW','PHYSICAL_TANK','LOADING_EVENT']",
                    [
                        {"name": "continuousGapMinutes", "value": 15, "description": "连续装置无流量超过该间隔则关闭窗口"},
                        {"name": "quantityTolerance", "value": 0.005, "description": "实测量校验容差0.5%"},
                        {"name": "timeZone", "value": "Asia/Shanghai", "description": "生产事件统一时区"},
                    ],
                    [
                        {"name": "连续窗口边界", "expression": "T = [first(flow>0), first(flow=0 sustained ≥ gap)]", "explanation": "按真实流量窗口切分，停流达到阈值才结束批次。"},
                        {"name": "实体罐边界", "expression": "B = (tank_id, fill_start, fill_end, product_code)", "explanation": "罐号、产品或进罐窗口任一变化即开启新批次。"},
                        {"name": "实测数量", "expression": "Q_batch = meter_end - meter_start OR weighbridge_net OR tank_level_delta", "explanation": "按对象类型选用可审计的主计量来源。"},
                    ],
                    [
                        "strategy = boundary_strategy[object_type]",
                        "segments = strategy.split(sorted(events))",
                        "for segment in segments:",
                        "  qty = primary_meter(segment) or approved_backup_meter(segment)",
                        "  assert start < end and qty > 0 else BLOCK('DIV_E011')",
                        "  emit batch_id, boundary, qty, source_event_ids",
                    ],
                    [
                        {"condition": "start_time >= end_time", "errorCode": "DIV_E011", "message": "批次时间边界无效", "action": "BLOCK"},
                        {"condition": "measured_qty <= 0", "errorCode": "DIV_E012", "message": "批次数量必须为正数", "action": "BLOCK"},
                        {"condition": "primary_meter_missing AND backup_not_approved", "errorCode": "DIV_W013", "message": "主计量缺失且备选计量未审批", "action": "WARN"},
                    ],
                    {"strategies": {"INBOUND_TRIP": ["arrival_date", "trip_no", "supplier_id"], "CONTINUOUS_WINDOW": ["device", "flow_on", "flow_off_15m"], "PHYSICAL_TANK": ["product", "tank_id", "fill_window"], "LOADING_EVENT": ["vehicle", "loading_order"]}, "quantityTolerance": 0.005},
                    {"title": f"{f42['id']} 连续窗口切分", "input": {"device": f42["device"], "start": f42["start"], "end": f42["end"], "meterQuantity": f42["qty"]}, "steps": ["检测到 FT120101 流量由0转正，开启窗口", "连续采集至 09:00 出料结束，关闭窗口", f"区间累计流量={f42['qty']}吨，数量为正且边界无重叠"], "output": {"batchId": f42["id"], "quantity": f42["qty"], "unit": f42["unit"], "decision": "PASS"}, "evidence": f42["source"]},
                ),
                rule(
                    "DIV-003", "QC与成品罐批次边界", "质量与储运", "每次生成+月结前",
                    "QC罐以独立进出料和质量状态形成批次；成品罐以产品、罐号和进罐窗口形成批次，禁止跨产品混批。",
                    "stage IN ['QC罐批次','成品罐批次']",
                    [
                        {"name": "qcReleaseRequired", "value": True, "description": "QC合格放行后才能转成品罐"},
                        {"name": "finishedTankProductConsistency", "value": True, "description": "同一成品罐窗口产品必须一致"},
                    ],
                    [
                        {"name": "QC批次键", "expression": "QC_KEY = qc_tank_id + inlet_window + quality_status", "explanation": "质量状态变化会关闭原QC批次并开启新批次。"},
                        {"name": "成品罐批次键", "expression": "FG_KEY = product_code + finished_tank_id + fill_window", "explanation": "成品、罐号或进罐窗口变化均重新分批。"},
                    ],
                    [
                        "if stage == 'QC': assert tank_id and quality_status",
                        "if transfer_to_finished: assert quality_status == 'RELEASED'",
                        "if stage == 'FINISHED': assert one(product_code per tank_window)",
                        "emit immutable boundary evidence",
                    ],
                    [
                        {"condition": "qc_transfer AND quality_status != 'RELEASED'", "errorCode": "DIV_E021", "message": "QC未放行批次不可转入成品罐", "action": "BLOCK"},
                        {"condition": "count(product_code per tank_window) > 1", "errorCode": "DIV_E022", "message": "成品罐窗口存在跨产品混批", "action": "BLOCK"},
                    ],
                    {"qc": {"key": ["tank_id", "inlet_window", "quality_status"], "transferGate": "RELEASED"}, "finished": {"key": ["product_code", "tank_id", "fill_window"], "mixedProduct": "DENY"}},
                    {"title": f"{finished['id']} 成品罐边界", "input": {"product": finished["material"], "tank": finished["device"], "fillWindow": [finished["start"], finished["end"]], "upstreamQc": qc["id"], "qcStatus": qc["status"]}, "steps": ["Q01质量状态=已放行", "F01窗口内产品仅果糖F55", "罐号、产品与进罐窗口组合唯一"], "output": {"batchId": finished["id"], "decision": "PASS"}, "evidence": finished["source"]},
                ),
            ],
        },
        {
            "id": "BATCH_RELATION",
            "name": "批次关联",
            "description": "时间重叠只用于候选筛选，实际关系数量来自流量、罐差、过磅或业务单据。",
            "version": "REL-202608-V4",
            "inputSchema": [
                {"field": "upstream_batch/downstream_batch", "type": "batch_ref", "required": True, "description": "相邻路由节点的上下游批次"},
                {"field": "transfer_start/end", "type": "datetime", "required": True, "description": "实际转移窗口"},
                {"field": "source_qty/received_qty", "type": "decimal", "required": True, "description": "转出与接收实测量"},
                {"field": "measurement_method", "type": "enum", "required": True, "description": "流量、罐差、过磅或单据"},
                {"field": "evidence_ids", "type": "array", "required": True, "description": "原始证据编号"},
            ],
            "outputSchema": [
                {"field": "relation_id", "type": "string", "description": "唯一关系编号"},
                {"field": "relation_qty", "type": "decimal", "description": "确认的关系数量"},
                {"field": "upstream_share/downstream_share", "type": "percent", "description": "分流和汇流比例"},
                {"field": "yield", "type": "percent", "description": "转化或转移收率"},
                {"field": "confidence/evidence", "type": "object", "description": "方法、置信度与证据"},
            ],
            "pipeline": [
                {"step": 1, "name": "候选筛选", "action": "按相邻路由和时间重叠生成候选对", "onFailure": "不生成候选"},
                {"step": 2, "name": "实测定量", "action": "按计量优先级确定关系数量", "onFailure": "进入待确认"},
                {"step": 3, "name": "多对多计算", "action": "计算上下游份额和收率", "onFailure": "阻断确认"},
                {"step": 4, "name": "业务约束", "action": "校验QC整罐、返工和禁止返流", "onFailure": "阻断发布"},
            ],
            "rules": [
                rule(
                    "REL-001", "时间候选与相邻路由", "数据管理员", "关系生成时",
                    "仅在相邻路由节点之间按时间交集产生候选；时间重叠不直接赋值关系数量。",
                    "route.isAdjacent(upstream.stage, downstream.stage) = true",
                    [
                        {"name": "minimumOverlapMinutes", "value": 1, "description": "候选关系最小时间交集"},
                        {"name": "timeOverlapQuantifies", "value": False, "description": "时间交集不得作为最终数量"},
                    ],
                    [
                        {"name": "交集起点", "expression": "t_s = max(u.start, d.start)", "explanation": "取上下游窗口较晚的开始时刻。"},
                        {"name": "交集终点", "expression": "t_e = min(u.end, d.end)", "explanation": "取上下游窗口较早的结束时刻。"},
                        {"name": "候选条件", "expression": "isCandidate = adjacent(u,d) ∧ (t_e - t_s ≥ 1 min)", "explanation": "只有相邻节点且存在有效交集才进入定量。"},
                    ],
                    [
                        "assert route.is_adjacent(upstream.stage, downstream.stage)",
                        "overlap_start = max(upstream.start, downstream.start)",
                        "overlap_end = min(upstream.end, downstream.end)",
                        "if overlap_end - overlap_start >= 1 minute: emit candidate",
                        "do not set relation_qty from overlap duration",
                    ],
                    [
                        {"condition": "NOT route_adjacent", "errorCode": "REL_E001", "message": "上下游不是相邻路由节点", "action": "BLOCK"},
                        {"condition": "overlap_minutes < 1", "errorCode": "REL_W002", "message": "无有效时间交集，不进入自动候选", "action": "WARN"},
                    ],
                    {"candidate": {"requireAdjacentRoute": True, "overlap": {"minMinutes": 1, "useForQuantity": False}}, "next": "REL-002"},
                    {"title": f"{relation['id']} 候选筛选", "input": {"upstream": relation["from"], "downstream": relation["to"], "upstreamWindow": [qc["start"], qc["end"]], "downstreamWindow": [finished["start"], finished["end"]]}, "steps": ["QC罐→成品罐是已发布路由中的相邻节点", "交集起点=max(2026-08-12 21:00, 2026-08-13 01:42)=2026-08-13 01:42", "交集终点=min(2026-08-13 03:42, 2026-08-13 17:37)=2026-08-13 03:42", "交集120分钟，仅确认为候选，不据此计算数量"], "output": {"candidate": True, "overlap": relation["overlap"]}, "evidence": relation["evidence"]},
                ),
                rule(
                    "REL-002", "多对多定量、份额与收率", "数据管理员", "关系生成时+日终",
                    "关系数量以实测转出/接收数据确认，并计算分流份额、汇流份额和收率；所有关系必须保留计量方法与证据。",
                    "candidate = true AND measurement_method IN approvedMethods",
                    [
                        {"name": "approvedMethods", "value": ["FLOW_METER", "TANK_DELTA", "WEIGHBRIDGE", "BUSINESS_DOCUMENT"], "description": "关系定量方法优先级"},
                        {"name": "massBalanceTolerance", "value": 0.005, "description": "数量守恒容差0.5%"},
                    ],
                    [
                        {"name": "上游分流份额", "expression": "P_u(i,j) = Q_source(i→j) / Q_available(i)", "explanation": "一个上游批次流向多个下游时，按转出端实测量计算分流比例。"},
                        {"name": "下游汇流份额", "expression": "P_d(i,j) = Q_received(i→j) / ΣₖQ_received(k→j)", "explanation": "一个下游批次接收多个上游时，按接收端实测量计算构成比例。"},
                        {"name": "关系收率", "expression": "Y(i,j) = Q_received(i→j) / Q_source(i→j)", "explanation": "按同一关系的接收量和转出量计算。"},
                        {"name": "上游守恒", "expression": "ΣⱼQ(i→j) ≤ Q_available(i) × (1 + ε)", "explanation": "ε为计量容差，超限阻断。"},
                    ],
                    [
                        "qty_source, qty_received = resolve_measurement(candidate, priority)",
                        "relation_qty = qty_received",
                        "upstream_share = qty_source / upstream.available_qty",
                        "downstream_share = qty_received / sum(received_qty to downstream)",
                        "yield_rate = qty_received / qty_source",
                        "assert sum(outgoing_qty) <= available_qty * (1 + tolerance)",
                        "persist method, evidence, confidence, rule_version",
                    ],
                    [
                        {"condition": "measurement_method NOT IN approvedMethods", "errorCode": "REL_E011", "message": "关系数量缺少认可的计量方法", "action": "BLOCK"},
                        {"condition": "sum_outgoing > available_qty*(1+tolerance)", "errorCode": "REL_E012", "message": "上游关系转出量超过可用量", "action": "BLOCK"},
                        {"condition": "evidence_ids IS EMPTY", "errorCode": "REL_E013", "message": "关系缺少原始证据", "action": "BLOCK"},
                    ],
                    {"quantity": {"source": "ACTUAL_MEASUREMENT", "priority": ["FLOW_METER", "TANK_DELTA", "WEIGHBRIDGE", "BUSINESS_DOCUMENT"]}, "ratios": ["UPSTREAM_SHARE", "DOWNSTREAM_SHARE", "YIELD"], "tolerance": 0.005},
                    {"title": f"{relation['id']} 关系定量", "input": {"upstreamAvailable": qc["qty"], "relationReceived": relation["qty"], "relationSource": round(relation["qty"] / 0.998, 3), "downstreamTotalReceived": finished["qty"]}, "steps": [f"上游份额={round(relation['qty']/0.998,3)}/{qc['qty']}≈100.0%", f"下游份额={relation['qty']}/{finished['qty']}≈12.5%", f"关系收率={relation['qty']}/{round(relation['qty']/0.998,3)}≈99.8%", f"输出与样例字段一致：{relation['upstreamShare']} / {relation['downstreamShare']} / {relation['yield']}"], "output": {"relationQuantity": relation["qty"], "upstreamShare": relation["upstreamShare"], "downstreamShare": relation["downstreamShare"], "yield": relation["yield"], "confidence": relation["confidence"], "decision": "PASS"}, "evidence": relation["evidence"]},
                ),
                rule(
                    "REL-003", "QC整罐、返工与禁止返流", "质量与储运", "关系生成时+月结前",
                    "QC合格批次按整罐作业转入一个成品罐；仅QC不合格批次允许沿已批准返工路由返回，成品罐不得返流。",
                    "upstream.stage = 'QC罐批次' OR upstream.stage = '成品罐批次'",
                    [
                        {"name": "qcWholeTank", "value": True, "description": "QC批次不得拆向多个成品罐"},
                        {"name": "reworkAllowedStatus", "value": ["QC_FAILED"], "description": "仅QC不合格允许返工"},
                        {"name": "finishedBackflow", "value": "DENY", "description": "成品罐禁止返流"},
                    ],
                    [
                        {"name": "整罐约束", "expression": "QC_RELEASED ⇒ COUNT(distinct finished_tank) = 1 ∧ P_u = 100% ± ε", "explanation": "QC合格批次必须整体流向一个成品罐。"},
                        {"name": "返工许可", "expression": "allow_rework = (stage = QC ∧ quality_status = FAILED ∧ approved_rework_route)", "explanation": "三项条件同时满足才允许返工。"},
                        {"name": "禁止返流", "expression": "stage = FINISHED_TANK ⇒ reverse_edge_count = 0", "explanation": "成品罐不能返回QC或生产节点。"},
                    ],
                    [
                        "if upstream.stage == 'QC' and status == 'RELEASED':",
                        "  assert distinct(downstream.finished_tank) == 1",
                        "  assert abs(upstream_share - 1) <= tolerance",
                        "if relation.is_reverse: assert upstream.stage == 'QC' and status == 'FAILED'",
                        "assert upstream.stage != 'FINISHED_TANK' for every reverse relation",
                    ],
                    [
                        {"condition": "released_qc_target_tanks != 1", "errorCode": "REL_E021", "message": "QC合格批次未整罐转入同一成品罐", "action": "BLOCK"},
                        {"condition": "reverse_relation AND NOT qc_failed", "errorCode": "REL_E022", "message": "非QC不合格批次禁止返工", "action": "BLOCK"},
                        {"condition": "finished_tank_backflow", "errorCode": "REL_E023", "message": "成品罐禁止返流至QC或生产节点", "action": "BLOCK"},
                    ],
                    {"qcReleased": {"split": "DENY", "targetFinishedTankCount": 1, "upstreamShare": "100%±0.5%"}, "rework": {"allow": "QC_FAILED_ONLY", "requireApprovedRoute": True}, "finishedTankBackflow": "DENY"},
                    {"title": f"{relation['id']} QC整罐校验", "input": {"qcBatch": qc["id"], "qualityStatus": qc["status"], "finishedBatch": finished["id"], "method": relation["method"], "upstreamShare": relation["upstreamShare"]}, "steps": ["QC批次状态=已放行", "目标成品罐批次数=1", "上游份额=100.0%，在0.5%容差内", "未发现成品罐返流关系"], "output": {"wholeTank": True, "backflow": False, "decision": "PASS"}, "evidence": relation["evidence"]},
                ),
            ],
        },
        {
            "id": "DIRECT_COST",
            "name": "批次直接成本计算",
            "description": "按可唯一映射至批次的原始业务记录归集成本，并通过批次关系逐层传递。",
            "version": "DIR-202608-V4",
            "inputSchema": [
                {"field": "source_system/document/line", "type": "string", "required": True, "description": "原始单据唯一定位"},
                {"field": "cost_element", "type": "string", "required": True, "description": "成本要素编码"},
                {"field": "batch_id/period", "type": "string", "required": True, "description": "目标批次和成本期间"},
                {"field": "quantity/unit_price/amount", "type": "decimal", "required": True, "description": "数量、单价和金额"},
            ],
            "outputSchema": [
                {"field": "direct_cost_detail", "type": "object", "description": "批次直接成本明细"},
                {"field": "batch_direct_total", "type": "decimal", "description": "批次直接成本合计"},
                {"field": "transferred_inbound_cost", "type": "decimal", "description": "按关系数量承接的上游成本"},
                {"field": "batch_total/unit_cost", "type": "decimal", "description": "批次总成本和单位成本"},
            ],
            "pipeline": [
                {"step": 1, "name": "幂等去重", "action": "生成唯一业务键", "onFailure": "拒绝重复过账"},
                {"step": 2, "name": "资格判定", "action": "判断是否可唯一直接计批", "onFailure": "进入候选费用池"},
                {"step": 3, "name": "金额计算", "action": "数量×单价并与源金额核对", "onFailure": "进入差异队列"},
                {"step": 4, "name": "逐层传递", "action": "按实际关系量传递上游成本", "onFailure": "阻断月结"},
            ],
            "rules": [
                rule(
                    "DIR-001", "唯一业务键与幂等归集", "成本会计", "每次归集时",
                    "源系统、单据、行号、成本要素、期间和批次构成唯一业务键，相同键不得重复过账。",
                    "source_record.status IN ['POSTED','SETTLED']",
                    [{"name": "uniqueKeyFields", "value": ["source_system", "document_no", "line_no", "cost_element", "period", "batch_id"], "description": "幂等业务键字段"}],
                    [
                        {"name": "唯一业务键", "expression": "UK = SHA256(source_system|document_no|line_no|cost_element|period|batch_id)", "explanation": "同一原始业务只允许形成一条有效成本明细。"},
                        {"name": "幂等约束", "expression": "COUNT(active_detail WHERE unique_key = UK) ≤ 1", "explanation": "重复接收只更新运行日志，不重复入账。"},
                    ],
                    [
                        "uk = sha256(join('|', uniqueKeyFields))",
                        "existing = find_active_detail(uk)",
                        "if existing and existing.payload_hash == payload_hash: return IDEMPOTENT_SKIP",
                        "if existing: BLOCK('DIR_E001')",
                        "insert direct_cost_detail with uk and source evidence",
                    ],
                    [
                        {"condition": "same_key_different_payload", "errorCode": "DIR_E001", "message": "相同业务键出现不同金额或数量", "action": "BLOCK"},
                        {"condition": "source_document_missing", "errorCode": "DIR_E002", "message": "缺少原始单据定位信息", "action": "BLOCK"},
                    ],
                    {"idempotency": {"algorithm": "SHA-256", "fields": ["source_system", "document_no", "line_no", "cost_element", "period", "batch_id"], "onSamePayload": "SKIP", "onConflict": "BLOCK"}},
                    {"title": f"{direct[0]['id']} 幂等键", "input": {"source": direct[0]["source"], "evidence": direct[0]["evidence"], "costElement": direct[0]["itemCode"], "period": "2026-08", "batch": incoming["id"]}, "steps": ["标准化源系统、凭证、成本要素、期间和批次", "生成唯一键 DIR-260810-001-DZJYM-CE001", "当前有效明细中仅存在1条"], "output": {"detailId": direct[0]["id"], "duplicate": False, "decision": "PASS"}, "evidence": direct[0]["evidence"]},
                ),
                rule(
                    "DIR-002", "直接计批资格与完整性", "成本会计", "每次归集时",
                    "非周期性辅料按批次领用或投加记录直接计批；树脂、活性炭等周期材料按寿命周期进入长周期材料池。其他成本仍需通过批次映射与字段完整性校验。",
                    "cost_catalog.directEligibility = true OR cost_element IN periodicAuxiliaryCodes",
                    [
                        {"name": "requiredFields", "value": ["batch_id", "period", "cost_element", "quantity", "unit", "unit_price", "amount", "evidence"], "description": "直接计批必填字段"},
                        {"name": "batchMatchCardinality", "value": 1, "description": "目标批次必须唯一"},
                        {"name": "directAuxiliarySubcategories", "value": ["酸碱及过滤辅料", "酶制剂及配方辅料"], "description": "默认直接计批的辅料类别"},
                        {"name": "periodicAuxiliaryCodes", "value": ["CE016", "CE024", "CE025", "CE026"], "description": "活性炭、树脂及循环材料周期费用池例外"},
                    ],
                    [
                        {"name": "辅料归集路径", "expression": "route(a) = PERIOD_POOL if a.code IN [CE016,CE024,CE025,CE026] else DIRECT_BATCH", "explanation": "周期性更换材料跨多个批次服务；其余辅料必须直接归集到实际领用或投加批次。"},
                        {"name": "完整率", "expression": "completeness = non_null(requiredFields) / COUNT(requiredFields)", "explanation": "完整率必须为100%。"},
                        {"name": "映射基数", "expression": "COUNT(matched_batch) = 1", "explanation": "无法唯一映射时不能直接计入任一批次。"},
                    ],
                    [
                        "if item.code in periodicAuxiliaryCodes: route LONG_CYCLE_POOL and stop",
                        "if item.subcategory in directAuxiliarySubcategories: assert route == DIRECT_COST",
                        "assert catalog[item].directEligibility",
                        "assert completeness(requiredFields) == 1",
                        "matched = match_batch(source_record)",
                        "if len(matched) == 1: route DIRECT_COST",
                        "else: route DATA_EXCEPTION_QUEUE with reason_code",
                    ],
                    [
                        {"condition": "non_periodic_auxiliary_routed_to_pool", "errorCode": "DIR_E010", "message": "非周期性辅料必须直接计入实际领用或投加批次", "action": "BLOCK"},
                        {"condition": "periodic_auxiliary_routed_to_direct", "errorCode": "DIR_E011", "message": "树脂或活性炭等周期材料不得直接计入单一批次", "action": "BLOCK"},
                        {"condition": "required_field_missing", "errorCode": "DIR_W012", "message": "直接成本字段不完整，进入数据异常待补充队列", "action": "WARN"},
                        {"condition": "matched_batch_count != 1", "errorCode": "DIR_W013", "message": "批次映射不唯一，进入数据异常待确认队列", "action": "WARN"},
                        {"condition": "period_is_locked AND source_not_approved", "errorCode": "DIR_E013", "message": "锁定期间新增成本未经审批", "action": "BLOCK"},
                    ],
                    {"classification": {"nonPeriodicAuxiliary": "DIRECT_BATCH", "periodicAuxiliaryCodes": ["CE016", "CE024", "CE025", "CE026"], "periodicTarget": "POOL_LONG_CYCLE"}, "directGate": {"requireCatalogEligibility": True, "requiredFieldsComplete": True, "batchCardinality": 1}, "onDataException": {"target": "DATA_EXCEPTION_QUEUE", "keepOriginalEvidence": True}},
                    {"title": f"{f42['id']} 辅料归集路径", "input": {"batch": f42["id"], "directAuxiliaries": [{"item": x["itemCode"], "name": x["costName"], "quantity": x["quantity"], "evidence": x["evidence"]} for x in f42_direct_aux], "periodicAuxiliaries": [{"item": x["itemCode"], "name": x["costName"], "pool": x["poolCode"], "amount": x["amount"]} for x in f42_periodic_aux]}, "steps": ["识别CE015硅藻土、CE017过滤材料及CE023其他辅料为非周期性辅料", "按批次领用或投加记录直接归集至F42中间品批次", "识别CE016活性炭、CE024/CE025树脂及CE026循环活性炭为周期材料", "周期材料进入POOL_LONG_CYCLE，并按寿命周期覆盖批次分摊"], "output": {"directAuxiliaryCount": len(f42_direct_aux), "periodicPoolCount": len(f42_periodic_aux), "invalidRoutingCount": 0, "decision": "PASS"}, "evidence": "过滤辅料领用记录+工序投加记录+长周期材料池分摊日志"},
                ),
                rule(
                    "DIR-003", "金额计算、成本传递与批次合计", "成本会计", "计算时+月结前",
                    "明细金额按数量乘单价计算；上游成本按实际关系量传递，下游批次叠加本批直接成本、费用池和调整形成总成本。正常损耗不冲减成本。",
                    "batch.status != 'CANCELLED'",
                    [
                        {"name": "currencyScale", "value": 2, "description": "金额保留2位小数"},
                        {"name": "quantityScale", "value": 4, "description": "数量最多保留4位小数"},
                        {"name": "normalLossTreatment", "value": "RETAIN_IN_BATCH_COST", "description": "正常损耗成本留在产出批次"},
                    ],
                    [
                        {"name": "直接成本明细", "expression": "C_detail = ROUND(Q × P, 2)", "explanation": "数量乘含税口径调整后的成本单价。"},
                        {"name": "关系传递成本", "expression": "C(i→j) = C_total(i) × Q(i→j) / Q_available(i)", "explanation": "成本沿实际关系数量传递，不按时间重叠分摊。"},
                        {"name": "批次总成本", "expression": "C_total(j) = ΣᵢC(i→j) + C_direct(j) + C_pool(j) + C_adjust(j)", "explanation": "下游接收上游成本后叠加本节点成本。"},
                        {"name": "单位成本", "expression": "UC(j) = C_total(j) / Q_output(j)", "explanation": "正常损耗不减少成本，只通过产出数量提高单位成本。"},
                    ],
                    [
                        "detail.amount = round(detail.quantity * detail.unit_price, 2)",
                        "direct_total = sum(detail.amount for batch)",
                        "inbound_cost = sum(upstream.total_cost * relation.qty / upstream.available_qty)",
                        "total_cost = inbound_cost + direct_total + pool_total + adjustment",
                        "unit_cost = total_cost / output_quantity",
                        "assert total_cost == sum(cost_components) else BLOCK('DIR_E023')",
                    ],
                    [
                        {"condition": "abs(source_amount-calculated_amount) > 0.01", "errorCode": "DIR_E021", "message": "源金额与数量乘单价不一致", "action": "BLOCK"},
                        {"condition": "output_quantity <= 0", "errorCode": "DIR_E022", "message": "产出数量不为正，无法计算单位成本", "action": "BLOCK"},
                        {"condition": "batch_total != component_sum", "errorCode": "DIR_E023", "message": "批次总成本与构成明细不平", "action": "BLOCK"},
                    ],
                    {"amount": "ROUND(quantity*unit_price,2)", "transfer": "upstream_total_cost*relation_qty/upstream_available_qty", "batchTotal": ["inbound_cost", "direct_cost", "pool_cost", "adjustment"], "normalLoss": "RETAIN_IN_BATCH_COST"},
                    {"title": "直接成本与成品批次总成本演算", "input": {"incomingBatch": incoming["id"], "incomingDetails": [{"name": x["costName"], "quantity": x["quantity"], "unitPrice": x["unitPrice"], "amount": x["amount"]} for x in direct], "finishedBatch": finished["id"], "finishedComponents": {"inbound": batch_cost["inboundCost"], "direct": batch_cost["directCost"], "pool": batch_cost["poolCost"], "adjustment": batch_cost["adjustment"], "quantity": batch_cost["quantity"]}}, "steps": [f"玉米淀粉采购价：470×2,680={money(direct[0]['amount'])}元", f"玉米淀粉运输价：470×48={money(direct[1]['amount'])}元", f"{finished['id']}总成本={money(batch_cost['inboundCost'])}+{money(batch_cost['directCost'])}+{money(batch_cost['poolCost'])}+0={money(batch_cost['totalCost'])}元", f"单位成本={money(batch_cost['totalCost'])}/{batch_cost['quantity']}={money(batch_cost['unitCost'])}元/吨"], "output": {"incomingDirectTotal": round(sum(x["amount"] for x in direct), 2), "finishedTotalCost": batch_cost["totalCost"], "finishedUnitCost": batch_cost["unitCost"], "decision": "PASS"}, "evidence": "直接成本明细+批次关系+费用池分摊日志"},
                ),
            ],
        },
        {
            "id": "POOL_ALLOCATION",
            "name": "费用池分摊",
            "description": "先确定受益范围和可用动因，再计算分摊率、批次金额、尾差与未分摊余额。",
            "version": "POOL-202608-V4",
            "inputSchema": [
                {"field": "pool_code/period_amount", "type": "string/decimal", "required": True, "description": "费用池及期间金额"},
                {"field": "benefit_scope", "type": "filter", "required": True, "description": "受益产线、阶段、物料或批次范围"},
                {"field": "primary_driver/backup_driver", "type": "driver_ref", "required": True, "description": "主备分摊动因"},
                {"field": "driver_quantity", "type": "decimal", "required": True, "description": "受益批次动因量"},
            ],
            "outputSchema": [
                {"field": "allocation_rate", "type": "decimal", "description": "费用池单位动因分摊率"},
                {"field": "batch_allocation", "type": "decimal", "description": "批次费用池分摊额"},
                {"field": "unallocated_balance", "type": "decimal", "description": "无法分摊的保留余额"},
                {"field": "reconciliation", "type": "object", "description": "费用池对账与尾差日志"},
            ],
            "pipeline": [
                {"step": 1, "name": "受益范围", "action": "按规则筛选受益批次", "onFailure": "保留未分摊余额"},
                {"step": 2, "name": "动因选择", "action": "主动态可用则使用，否则校验备选审批", "onFailure": "阻断分摊"},
                {"step": 3, "name": "分摊计算", "action": "计算分母、分摊率和批次金额", "onFailure": "阻断过账"},
                {"step": 4, "name": "尾差对账", "action": "尾差记入最大动因批次并保留日志", "onFailure": "阻断月结"},
            ],
            "rules": [
                rule(
                    "POOL-001", "受益范围与主备动因", "成本会计", "每次分摊前",
                    "先用版本化条件锁定受益批次，再优先使用实测主动因；主动因不可用时只有经审批才能切换备选动因。",
                    "pool.status = 'ACTIVE' AND batch.period = pool.period",
                    [
                        {"name": "driverPriority", "value": ["PRIMARY_MEASURED", "BACKUP_APPROVED"], "description": "动因选择顺序"},
                        {"name": "crossPeriodAllocation", "value": "DENY", "description": "禁止跨成本期间分摊"},
                    ],
                    [
                        {"name": "受益集合", "expression": "B_pool = {b | scope_filter(b)=true ∧ b.period=pool.period}", "explanation": "只有满足产线、阶段、物料和期间条件的批次受益。"},
                        {"name": "动因选择", "expression": "D = D_primary if available; else D_backup if approved; else NULL", "explanation": "不得静默切换备选动因。"},
                    ],
                    [
                        "beneficiaries = filter(batches, benefit_scope and same_period)",
                        "driver = primary_driver if completeness(primary_driver)==1 else None",
                        "if not driver and backup_driver.approved: driver = backup_driver",
                        "if not driver: BLOCK('POOL_E001')",
                        "persist beneficiary_snapshot and selected_driver_version",
                    ],
                    [
                        {"condition": "beneficiary_count = 0", "errorCode": "POOL_W001", "message": "当前费用池无受益批次，保留未分摊余额", "action": "WARN"},
                        {"condition": "primary_missing AND backup_not_approved", "errorCode": "POOL_E002", "message": "主动因缺失且备选动因未经审批", "action": "BLOCK"},
                        {"condition": "batch.period != pool.period", "errorCode": "POOL_E003", "message": "禁止跨期间分摊费用", "action": "BLOCK"},
                    ],
                    {"scope": {"samePeriod": True, "filters": ["line", "stage", "material", "batch_status"]}, "driver": {"priority": ["PRIMARY_MEASURED", "BACKUP_APPROVED"], "silentFallback": False}},
                    {"title": f"{electricity['poolCode']} 受益范围与动因", "input": {"pool": electricity["poolName"], "period": "2026-08", "sampleBatch": finished["id"], "stage": finished["stage"], "primaryDriver": electricity["driverName"]}, "steps": ["按2026-08、果葡糖浆产线和生产批次锁定受益集合", "分表实测电量完整，选择主动因", "未触发备选动因审批"], "output": {"selectedDriver": electricity["driverName"], "sampleBeneficiary": finished["id"], "decision": "PASS"}, "evidence": "公共电力费用池配置+电力分表"},
                ),
                rule(
                    "POOL-002", "分摊率、批次金额与尾差", "成本会计", "计算时+月结前",
                    "费用池金额按批次动因占比分摊；金额保留2位小数，舍入尾差一次性计入动因量最大的批次并留痕。",
                    "beneficiary_count > 0 AND driver_selected = true",
                    [
                        {"name": "amountScale", "value": 2, "description": "分摊金额精度"},
                        {"name": "residualPolicy", "value": "LARGEST_DRIVER", "description": "尾差归属最大动因批次"},
                    ],
                    [
                        {"name": "动因分母", "expression": "D_total = ΣᵦD_b", "explanation": "汇总受益批次的有效动因量。"},
                        {"name": "分摊率", "expression": "R_pool = C_pool / D_total", "explanation": "费用池金额除以动因总量。"},
                        {"name": "批次分摊额", "expression": "A_b = ROUND(R_pool × D_b, 2)", "explanation": "按批次动因量计算金额。"},
                        {"name": "舍入尾差", "expression": "residual = C_pool - ΣᵦA_b; A_argmax(D)+=residual", "explanation": "确保费用池金额与已分摊金额完全一致。"},
                    ],
                    [
                        "denominator = sum(driver_qty for beneficiaries)",
                        "rate = pool_amount / denominator",
                        "allocation[b] = round(rate * driver_qty[b], 2)",
                        "residual = round(pool_amount - sum(allocation), 2)",
                        "allocation[argmax(driver_qty)] += residual",
                        "persist rate, denominator, residual_batch and before/after values",
                    ],
                    [
                        {"condition": "denominator <= 0", "errorCode": "POOL_E011", "message": "动因分母不为正，禁止执行本规则", "action": "BLOCK"},
                        {"condition": "abs(pool_amount-sum_allocation) > 0.01", "errorCode": "POOL_E012", "message": "费用池分摊存在未处理尾差", "action": "BLOCK"},
                    ],
                    {"formula": {"denominator": "SUM(driver_qty)", "rate": "pool_amount/denominator", "allocation": "ROUND(rate*driver_qty,2)"}, "rounding": {"scale": 2, "residualTo": "MAX_DRIVER_BATCH", "audit": True}},
                    {"title": f"{finished['id']} 电力费用分摊", "input": {"pool": electricity["poolCode"], "batch": finished["id"], "driverQuantity": electricity["driverQuantity"], "allocationRate": electricity["allocationRate"]}, "steps": [f"样例批次动因量={electricity['driverQuantity']} {electricity['driverUnit']}", f"本期分摊率={electricity['allocationRate']}元/{electricity['driverUnit']}", f"批次分摊额=ROUND({electricity['driverQuantity']}×{electricity['allocationRate']},2)={money(electricity['amount'])}元", "费用池尾差已按最大动因批次规则处理"], "output": {"batchAllocation": electricity["amount"], "status": electricity["status"], "decision": "PASS"}, "evidence": "电力分表+费用池分摊日志"},
                ),
                rule(
                    "POOL-003", "零分母与备选动因处理", "成本会计", "计算时",
                    "动因分母为零时禁止平均分摊；仅允许切换经审批的备选动因，否则金额保留为未分摊余额或转独立成本对象。",
                    "D_total = 0",
                    [
                        {"name": "equalSplitOnZero", "value": False, "description": "禁止零分母平均分摊"},
                        {"name": "allowedFallback", "value": ["APPROVED_BACKUP_DRIVER", "UNALLOCATED_BALANCE", "INDEPENDENT_COST_OBJECT"], "description": "允许的处理路径"},
                    ],
                    [
                        {"name": "零分母判定", "expression": "D_total = ΣᵦD_b = 0", "explanation": "不能计算分摊率，不得将费用平均写入批次。"},
                        {"name": "余额保留", "expression": "unallocated_balance = C_pool when no approved fallback", "explanation": "费用池金额原值保留等待处理。"},
                    ],
                    [
                        "if denominator > 0: continue POOL-002",
                        "if backup_driver.approved and sum(backup_qty) > 0: switch_driver_with_audit()",
                        "elif independent_cost_object.approved: transfer_to_cost_object()",
                        "else: unallocated_balance = pool_amount",
                        "never equal_split beneficiaries",
                    ],
                    [
                        {"condition": "denominator=0 AND equal_split_attempted", "errorCode": "POOL_E021", "message": "零分母时禁止平均分摊", "action": "BLOCK"},
                        {"condition": "backup_driver_used_without_approval", "errorCode": "POOL_E022", "message": "备选动因未经审批", "action": "BLOCK"},
                    ],
                    {"onZeroDenominator": {"equalSplit": "DENY", "sequence": ["APPROVED_BACKUP_DRIVER", "APPROVED_INDEPENDENT_COST_OBJECT", "UNALLOCATED_BALANCE"], "requireAuditLog": True}},
                    {"title": "零分母保护性演算", "input": {"poolAmount": 125000, "primaryDriverTotal": 0, "backupApproved": False}, "steps": ["主动因总量=0，分摊率不可计算", "备选动因未审批，不允许切换", "禁止按受益批次数量平均分摊", "125,000.00元全部保留为未分摊余额"], "output": {"allocated": 0, "unallocatedBalance": 125000, "decision": "HOLD"}, "evidence": "规则保护性测试样例"},
                ),
                rule(
                    "POOL-004", "费用池对账与经营费用隔离", "财务BP", "每次分摊后+月结前",
                    "费用池金额必须等于已分摊金额与未分摊余额之和；销售、管理和财务期间费用不得回写生产批次。",
                    "allocation_run.status IN ['CALCULATED','POSTED']",
                    [
                        {"name": "reconciliationTolerance", "value": 0.01, "description": "费用池对账容差1分钱"},
                        {"name": "productionCostViews", "value": ["直接计批", "生产制造费用池"], "description": "允许进入生产批次的成本视图"},
                    ],
                    [
                        {"name": "费用池恒等式", "expression": "C_pool = ΣᵦA_b + unallocated_balance", "explanation": "每个费用池独立对账。"},
                        {"name": "全局对账", "expression": "ΣC_pool = Σall_allocations + Σunallocated", "explanation": "期间级汇总必须与费用池总账一致。"},
                        {"name": "成本视图隔离", "expression": "cost_view = OPERATING_PERIOD ⇒ batch_allocation = 0", "explanation": "经营期间费用留在独立成本对象。"},
                    ],
                    [
                        "for pool in period_pools:",
                        "  difference = pool.amount - sum(pool.allocations) - pool.unallocated",
                        "  assert abs(difference) <= 0.01 else BLOCK('POOL_E031')",
                        "for item in operating_period_items: assert item.batch_allocation == 0",
                        "lock run only when every pool reconciles",
                    ],
                    [
                        {"condition": "abs(reconciliation_difference) > 0.01", "errorCode": "POOL_E031", "message": "费用池金额与分摊结果不一致", "action": "BLOCK"},
                        {"condition": "operating_period_cost_written_to_batch", "errorCode": "POOL_E032", "message": "经营期间费用不得回写生产批次", "action": "BLOCK"},
                    ],
                    {"reconciliation": {"equation": "pool_amount=allocated+unallocated", "tolerance": 0.01, "scope": "EACH_POOL_AND_PERIOD_TOTAL"}, "operatingPeriodCost": {"batchWriteBack": "DENY", "target": "INDEPENDENT_COST_OBJECT"}},
                    {"title": "2026-08费用池全局对账", "input": {"poolCount": costing["stats"]["poolCount"], "poolAmount": costing["stats"]["manufacturingPoolTotal"], "allocated": costing["stats"]["allocatedPoolTotal"], "unallocated": 0, "operatingItems": costing["stats"]["operatingItems"]}, "steps": [f"制造费用池金额={money(costing['stats']['manufacturingPoolTotal'])}元", f"已分摊金额={money(costing['stats']['allocatedPoolTotal'])}元", "未分摊余额=0.00元", "差额=费用池金额-已分摊-未分摊=0.00元", f"{costing['stats']['operatingItems']}个经营期间费用项目均未写入生产批次"], "output": {"difference": costing["stats"]["poolReconciliationDifference"], "decision": "PASS"}, "evidence": "36个费用池+4,476条批次分摊明细"},
                ),
            ],
        },
    ]

    for engine in engines:
        for item in engine["rules"]:
            item.update(common_status)
            item["engineId"] = engine["id"]
            item["engine"] = engine["name"]
            item["engineVersion"] = engine["version"]

    config = {
        "meta": {
            "name": "SCOS批次成本计算规则引擎",
            "version": "RULESET-202608-V7",
            "period": lineage["meta"]["period"],
            "generatedAt": "2026-09-30 09:45",
            "source": ["批次和批次关联数据样例", "费用池清单_简化版", "通用生产线批次生成与上下游关联业务方案", "通用生产线批次成本计算业务方案"],
            "sampleCoverage": {
                "batches": lineage["stats"]["batches"],
                "relations": lineage["stats"]["relations"],
                "directDetails": costing["stats"]["directDetails"],
                "poolAllocations": costing["stats"]["poolAllocations"],
                "poolCount": costing["stats"]["poolCount"],
            },
            "executionOrder": ["BATCH_DIVISION", "BATCH_RELATION", "DIRECT_COST", "POOL_ALLOCATION"],
        },
        "engines": engines,
    }

    json_text = json.dumps(config, ensure_ascii=False, indent=2)
    (DATA / "costing-rule-engine-v1.json").write_text(json_text + "\n", encoding="utf-8")
    (SCRIPTS / "costing-rule-engine-v1.js").write_text(
        "window.COSTING_RULE_ENGINE_V1=" + json.dumps(config, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"generated 4 engines / {sum(len(e['rules']) for e in engines)} rules")


if __name__ == "__main__":
    main()
