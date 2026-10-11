#!/usr/bin/env python3
"""构建多维成本分析的订单、关系及对账样例数据。"""

from __future__ import annotations

import json
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BATCH_FILE = ROOT / "data" / "costing" / "costing-batch-data-v3.json"
LINEAGE_FILE = ROOT / "data" / "costing" / "costing-lineage-data.json"
JSON_OUT = ROOT / "data" / "costing" / "costing-multidim-data-v4.json"
JS_OUT = ROOT / "scripts" / "costing" / "costing-multidim-data-v4.js"


def d(value: object) -> Decimal:
    return Decimal(str(value or 0))


def money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def split_amount(total: Decimal, weights: list[Decimal]) -> list[Decimal]:
    denominator = sum(weights)
    if not weights or denominator == 0:
        return []
    result: list[Decimal] = []
    assigned = Decimal("0")
    for index, weight in enumerate(weights):
        if index == len(weights) - 1:
            amount = total - assigned
        else:
            amount = (total * weight / denominator).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            assigned += amount
        result.append(amount)
    return result


def main() -> None:
    batch_data = json.loads(BATCH_FILE.read_text(encoding="utf-8"))
    lineage_data = json.loads(LINEAGE_FILE.read_text(encoding="utf-8"))
    batch_index = {row["batch"]: row for row in batch_data["batchCosts"]}
    details_by_batch: dict[str, list[dict]] = defaultdict(list)
    local_categories_by_batch: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: Decimal("0")))
    transfer_amount_by_relation: dict[tuple[str, str], Decimal] = {}
    for detail in batch_data["batchCostDetails"]:
        details_by_batch[detail["batch"]].append(detail)
        if detail["component"] == "上游成本转入":
            relation_id = str(detail.get("source") or "").split(" · ", 1)[0]
            transfer_amount_by_relation[(detail["batch"], relation_id)] = d(detail["amount"])
        else:
            local_categories_by_batch[detail["batch"]][detail["costCategory"]] += d(detail["amount"])
    finished = sorted(
        (row for row in batch_data["batchCosts"] if row["stage"] == "成品罐批次"),
        key=lambda row: (row["line"], row["material"], row["batch"]),
    )
    qc_relations: dict[str, list[dict]] = defaultdict(list)
    incoming_relations: dict[str, list[dict]] = defaultdict(list)
    for relation in lineage_data["relations"]:
        incoming_relations[relation["to"]].append(relation)
        if relation["layer"] == "QC罐→成品罐":
            qc_relations[relation["to"]].append(relation)

    category_cache: dict[str, dict[str, Decimal]] = {}
    resolving: set[str] = set()

    def resolved_cost_categories(batch_id: str) -> dict[str, Decimal]:
        """沿谱系展开上游成本，返回真实成本类别而非“上游成本转入”。"""
        if batch_id in category_cache:
            return category_cache[batch_id]
        if batch_id in resolving:
            raise ValueError(f"批次谱系存在循环：{batch_id}")
        resolving.add(batch_id)
        categories: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for category, amount in local_categories_by_batch[batch_id].items():
            categories[category] += amount
        for relation in sorted(incoming_relations[batch_id], key=lambda row: row["id"]):
            upstream_id = relation["from"]
            upstream_categories = resolved_cost_categories(upstream_id)
            transfer_total = transfer_amount_by_relation.get((batch_id, relation["id"]))
            if transfer_total is None:
                upstream = batch_index[upstream_id]
                transfer_total = d(upstream["totalCost"]) * d(relation["qty"]) / d(upstream["quantity"])
                transfer_total = Decimal(str(money(transfer_total)))
            names = sorted(upstream_categories)
            allocations = split_amount(transfer_total, [upstream_categories[name] for name in names])
            for name, amount in zip(names, allocations):
                categories[name] += amount
        adjustment = d(batch_index[batch_id].get("adjustment"))
        if adjustment:
            categories["审批调整"] += adjustment
        expected = d(batch_index[batch_id]["totalCost"])
        actual = sum(categories.values())
        difference = expected - actual
        if abs(difference) <= Decimal("0.05") and categories:
            largest = max(categories, key=lambda key: abs(categories[key]))
            categories[largest] += difference
        elif abs(difference) > Decimal("0.05"):
            raise ValueError(f"{batch_id} 成本类别递归展开后与批次总成本不一致：{actual} != {expected}")
        if "上游成本转入" in categories:
            raise ValueError(f"{batch_id} 仍包含非成本类别“上游成本转入”")
        resolving.remove(batch_id)
        category_cache[batch_id] = dict(categories)
        return category_cache[batch_id]

    supplier_cycle = ["德州金玉米", "吉林长龙生化", "齐齐哈尔龙凤"]
    sku_codes = {
        "果糖F55": "F55",
        "麦芽糖低DE": "ML",
        "麦芽糖中DE": "MM",
        "麦芽糖高DE": "MH",
    }
    sku_counts: dict[str, int] = defaultdict(int)
    production_orders: list[dict] = []
    production_batch_relations: list[dict] = []

    for order_index, final_batch in enumerate(finished, start=1):
        sku = final_batch["material"]
        sku_counts[sku] += 1
        order_id = f"MO-2608-{sku_codes[sku]}-{sku_counts[sku]:02d}"
        sources = sorted(qc_relations[final_batch["batch"]], key=lambda row: row["from"])
        if len(sources) < 2:
            raise ValueError(f"{final_batch['batch']} 未形成一对多QC批次关系")
        supplier = supplier_cycle[(order_index - 1) % len(supplier_cycle)]
        cost_categories = resolved_cost_categories(final_batch["batch"])
        category_total = sum(cost_categories.values())
        if abs(category_total - d(final_batch["totalCost"])) > Decimal("0.05"):
            raise ValueError(f"{final_batch['batch']} 成本类别合计与批次总成本不一致")
        order = {
            "id": order_id,
            "sku": sku,
            "productCategory": final_batch["productCategory"],
            "line": final_batch["line"],
            "supplier": supplier,
            "plannedQty": final_batch["quantity"],
            "completedQty": final_batch["quantity"],
            "unit": final_batch["unit"],
            "settlementBatch": final_batch["batch"],
            "batchCount": len(sources),
            "upstreamCost": final_batch["inboundCost"],
            "directCost": final_batch["directCost"],
            "poolCost": final_batch["poolCost"],
            "adjustment": final_batch["adjustment"],
            "productionCost": final_batch["totalCost"],
            "unitProductionCost": final_batch["unitCost"],
            "costCategories": {key: money(value) for key, value in sorted(cost_categories.items())},
            "status": "已结算",
            "costVersion": batch_data["meta"]["costVersion"],
        }
        production_orders.append(order)

        weights = [d(row["qty"]) for row in sources]
        component_splits = {
            key: split_amount(d(order[key]), weights)
            for key in ("upstreamCost", "directCost", "poolCost", "adjustment", "productionCost")
        }
        category_splits = {
            category: split_amount(amount, weights)
            for category, amount in cost_categories.items()
        }
        for relation_index, relation in enumerate(sources):
            source_batch = batch_index[relation["from"]]
            relation_categories = {
                category: amounts[relation_index]
                for category, amounts in sorted(category_splits.items())
            }
            category_difference = component_splits["productionCost"][relation_index] - sum(relation_categories.values())
            if relation_categories and category_difference:
                largest_category = max(relation_categories, key=lambda key: abs(relation_categories[key]))
                relation_categories[largest_category] += category_difference
            production_batch_relations.append(
                {
                    "id": f"MOB-{order_index:02d}-{relation_index + 1:02d}",
                    "productionOrder": order_id,
                    "batch": relation["from"],
                    "batchStage": source_batch["stage"],
                    "batchMaterial": source_batch["material"],
                    "settlementBatch": final_batch["batch"],
                    "quantity": relation["qty"],
                    "unit": relation["unit"],
                    "upstreamCost": money(component_splits["upstreamCost"][relation_index]),
                    "directCost": money(component_splits["directCost"][relation_index]),
                    "poolCost": money(component_splits["poolCost"][relation_index]),
                    "adjustment": money(component_splits["adjustment"][relation_index]),
                    "recognizedProductionCost": money(component_splits["productionCost"][relation_index]),
                    "costCategories": {category: money(amount) for category, amount in relation_categories.items()},
                    "lineageRelation": relation["id"],
                    "evidence": relation["evidence"],
                    "costVersion": batch_data["meta"]["costVersion"],
                }
            )

    groups = [
        {
            "id": "SO-2608-001",
            "productionOrders": [production_orders[0]["id"], production_orders[1]["id"]],
            "customer": "华东饮料集团",
            "region": "华东",
            "channel": "直销",
            "date": "2026-08-27",
            "deliveryRate": Decimal("72"),
            "serviceRate": Decimal("0.006"),
        },
        {
            "id": "SO-2608-002",
            "productionOrders": [production_orders[2]["id"], production_orders[3]["id"]],
            "customer": "岭南配料",
            "region": "华南",
            "channel": "大客户",
            "date": "2026-08-28",
            "deliveryRate": Decimal("108"),
            "serviceRate": Decimal("0.010"),
        },
        {
            "id": "SO-2608-003",
            "productionOrders": [production_orders[4]["id"], production_orders[5]["id"]],
            "customer": "华中乳业",
            "region": "华中",
            "channel": "直销",
            "date": "2026-08-29",
            "deliveryRate": Decimal("86"),
            "serviceRate": Decimal("0.007"),
        },
        {
            "id": "SO-2608-004",
            "productionOrders": [production_orders[6]["id"], production_orders[7]["id"], production_orders[8]["id"]],
            "customer": "江南食品",
            "region": "华东",
            "channel": "经销",
            "date": "2026-08-31",
            "deliveryRate": Decimal("78"),
            "serviceRate": Decimal("0.008"),
        },
    ]
    production_index = {row["id"]: row for row in production_orders}
    prices = {"果糖F55": Decimal("4480"), "麦芽糖低DE": Decimal("4550"), "麦芽糖中DE": Decimal("4590"), "麦芽糖高DE": Decimal("4620")}
    sales_orders: list[dict] = []
    sales_production_relations: list[dict] = []
    analysis_rows: list[dict] = []

    for sales_index, group in enumerate(groups, start=1):
        order_rows: list[dict] = []
        for relation_index, production_order_id in enumerate(group["productionOrders"], start=1):
            production_order = production_index[production_order_id]
            quantity = d(production_order["completedQty"])
            production_cost = d(production_order["productionCost"])
            delivery_cost = quantity * group["deliveryRate"]
            service_cost = production_cost * group["serviceRate"]
            full_cost = production_cost + delivery_cost + service_cost
            revenue = quantity * prices[production_order["sku"]]
            relation = {
                "id": f"SOM-{sales_index:02d}-{relation_index:02d}",
                "salesOrder": group["id"],
                "productionOrder": production_order_id,
                "sku": production_order["sku"],
                "productCategory": production_order["productCategory"],
                "customer": group["customer"],
                "supplier": production_order["supplier"],
                "channel": group["channel"],
                "region": group["region"],
                "date": group["date"],
                "quantity": production_order["completedQty"],
                "unit": production_order["unit"],
                "batchCount": production_order["batchCount"],
                "settlementBatch": production_order["settlementBatch"],
                "upstreamCost": production_order["upstreamCost"],
                "directCost": production_order["directCost"],
                "poolCost": production_order["poolCost"],
                "adjustment": production_order["adjustment"],
                "productionCost": production_order["productionCost"],
                "deliveryCost": money(delivery_cost),
                "serviceCost": money(service_cost),
                "fullCost": money(full_cost),
                "revenue": money(revenue),
                "profit": money(revenue - full_cost),
                "costCategories": {
                    **production_order["costCategories"],
                    "销售物流成本": money(delivery_cost),
                    "可归属服务成本": money(service_cost),
                },
                "costVersion": batch_data["meta"]["costVersion"],
            }
            sales_production_relations.append(relation)
            analysis_rows.append(dict(relation))
            order_rows.append(relation)
        sales_orders.append(
            {
                "id": group["id"],
                "customer": group["customer"],
                "region": group["region"],
                "channel": group["channel"],
                "date": group["date"],
                "productionOrderCount": len(order_rows),
                "skuCount": len({row["sku"] for row in order_rows}),
                "quantity": money(sum(d(row["quantity"]) for row in order_rows)),
                "productionCost": money(sum(d(row["productionCost"]) for row in order_rows)),
                "fullCost": money(sum(d(row["fullCost"]) for row in order_rows)),
                "revenue": money(sum(d(row["revenue"]) for row in order_rows)),
                "status": "已结算",
            }
        )

    source_cost = sum(d(row["totalCost"]) for row in finished)
    production_cost = sum(d(row["productionCost"]) for row in production_orders)
    sales_allocated_cost = sum(d(row["productionCost"]) for row in sales_production_relations)
    if source_cost != production_cost or production_cost != sales_allocated_cost:
        raise ValueError("订单成本与底层成品批次成本未对齐")
    if any(sum(1 for row in production_batch_relations if row["productionOrder"] == order["id"]) < 2 for order in production_orders):
        raise ValueError("存在未满足一对多批次关系的生产订单")
    if any(order["productionOrderCount"] < 2 for order in sales_orders):
        raise ValueError("存在未满足一对多生产订单关系的销售订单")

    output = {
        "meta": {
            "factory": batch_data["meta"]["factory"],
            "period": batch_data["meta"]["period"],
            "version": "MULTICOST-202608-V2",
            "snapshot": batch_data["meta"]["snapshot"],
            "costVersion": batch_data["meta"]["costVersion"],
            "lineageVersion": batch_data["meta"]["lineageVersion"],
            "sourceGrain": "销售订单×生产订单（成本追溯至QC批次与成品结算批次）",
        },
        "productionOrders": production_orders,
        "productionBatchRelations": production_batch_relations,
        "salesOrders": sales_orders,
        "salesProductionRelations": sales_production_relations,
        "analysisRows": analysis_rows,
        "reconciliation": {
            "settlementBatchCount": len(finished),
            "productionOrderCount": len(production_orders),
            "productionBatchRelationCount": len(production_batch_relations),
            "salesOrderCount": len(sales_orders),
            "salesProductionRelationCount": len(sales_production_relations),
            "bottomBatchProductionCost": money(source_cost),
            "productionOrderCost": money(production_cost),
            "salesAllocatedProductionCost": money(sales_allocated_cost),
            "productionOrderDifference": money(production_cost - source_cost),
            "salesOrderDifference": money(sales_allocated_cost - source_cost),
        },
    }
    JSON_OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    JS_OUT.write_text(
        "window.COSTING_MULTIDIM_DATA_V4=" + json.dumps(output, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(json.dumps(output["reconciliation"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
