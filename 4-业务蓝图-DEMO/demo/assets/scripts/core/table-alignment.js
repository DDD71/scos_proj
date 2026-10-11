/* Keep numeric column headings and values aligned in dynamically rendered tables. */
(function () {
  'use strict';
  var selector = 'table.data-table,table.proc2-table,table.req-table,table.cost-table,table.lv3-table';
  var numeric = /^[+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:%|％|吨|天|元|万元|亿元|小时|次|个|条|笔|家|元\/吨)?$/;

  function isNumberCell(cell) {
    if (cell.classList.contains('num')) return true;
    // Do not interpret identifiers, dates, status badges or action buttons as quantities.
    if (cell.querySelector('button,a,select,textarea,[class*="status"],.tag')) return false;
    var inputs = cell.querySelectorAll('input');
    if (inputs.length) return inputs.length === 1 && inputs[0].type === 'number';
    return numeric.test(cell.textContent.trim());
  }

  function alignTable(table) {
    if (!table.tHead || !table.tBodies.length) return;
    // Rowspans require a full two-dimensional header model; leave these tables unchanged.
    if (Array.from(table.querySelectorAll('[rowspan]')).some(function (cell) { return cell.rowSpan > 1; })) return;
    var columns = [];
    Array.from(table.tBodies).forEach(function (body) {
      Array.from(body.rows).forEach(function (row) {
        var column = 0;
        Array.from(row.cells).forEach(function (cell) {
          if (cell.colSpan === 1) (columns[column] || (columns[column] = [])).push(cell);
          column += cell.colSpan;
        });
      });
    });
    var alignments = columns.map(function (cells) {
      var values = cells.filter(function (cell) { return !/^(?:|—|–|-)$/u.test(cell.textContent.trim()) || cell.querySelector('input'); });
      return values.length > 0 && values.every(isNumberCell);
    });
    columns.forEach(function (cells, index) {
      cells.forEach(function (cell) { cell.classList.toggle('scos-numeric-column', alignments[index]); });
    });
    Array.from(table.tHead.rows).forEach(function (row) {
      var column = 0;
      Array.from(row.cells).forEach(function (cell) {
        cell.classList.toggle('scos-numeric-column', cell.colSpan === 1 && Boolean(alignments[column]));
        column += cell.colSpan;
      });
    });
  }

  var pending = new Set();
  var scheduled = false;
  function collect(node) {
    if (node.nodeType !== 1) return;
    var table = node.closest(selector);
    if (table) pending.add(table);
    node.querySelectorAll(selector).forEach(function (item) { pending.add(item); });
  }
  function flush() {
    scheduled = false;
    pending.forEach(function (table) { if (table.isConnected) alignTable(table); });
    pending.clear();
  }
  collect(document.body);
  flush();
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      collect(record.target.nodeType === 1 ? record.target : record.target.parentElement);
      record.addedNodes.forEach(collect);
    });
    if (pending.size && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
