(function () {
  const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const cleanFieldValue = (value) => cleanText(value)
    .replace(/^[：:；;\s]+/, "")
    .replace(/[；;\s]+$/, "");

  const getArticleFields = (article) => {
    const fields = {};
    article.querySelectorAll("p").forEach((paragraph) => {
      let label = "";
      paragraph.childNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "B") {
          label = cleanText(node.textContent).replace(/[：:]$/, "");
          if (label && !fields[label]) fields[label] = "";
          return;
        }
        if (!label) return;
        fields[label] = `${fields[label] || ""}${node.textContent || ""}`;
      });
    });

    Object.keys(fields).forEach((key) => {
      fields[key] = cleanFieldValue(fields[key]);
    });
    return fields;
  };

  const splitGridValue = (fields) => {
    if (!fields["25/26落格"]) return;
    const parts = fields["25/26落格"].split("/").map((part) => cleanFieldValue(part));
    fields["25落格"] = fields["25落格"] || parts[0] || "";
    fields["26落格"] = fields["26落格"] || parts[1] || "";
  };

  const buildRows = (list) => Array.from(list.querySelectorAll(":scope > article")).map((article) => {
    const titleParts = cleanText(article.querySelector("h5")?.textContent)
      .split("｜")
      .map((part) => cleanText(part));
    const fields = getArticleFields(article);
    splitGridValue(fields);
    return { titleParts, fields };
  });

  const isCampusList = (list) => list.classList.contains("campus-detail-list");
  const isPlanningCampusList = (list) => list.classList.contains("planning-campus-list");
  const isReplaceList = (list) => list.classList.contains("replace-list");
  const isCadreTailList = (list) => list.classList.contains("cadre-tail-list");

  const isPlanningRow = (row) => {
    const position = row.titleParts[1] || "";
    const organization = row.fields["组织"] || "";
    return position.includes("策划") || organization.includes("策划组");
  };

  const getCampusYear = (row) => {
    const match = String(row.fields["届别"] || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  };

  const sortRows = (rows, list) => {
    if (isCadreTailList(list)) {
      const levelOrder = new Map(["M4", "M3", "P8", "M2", "P7"].map((level, index) => [level, index]));
      return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
          const aRank = levelOrder.has(a.row.fields["职级"]) ? levelOrder.get(a.row.fields["职级"]) : 99;
          const bRank = levelOrder.has(b.row.fields["职级"]) ? levelOrder.get(b.row.fields["职级"]) : 99;
          return aRank - bRank || a.index - b.index;
        })
        .map((item) => item.row);
    }

    if (isPlanningCampusList(list)) {
      return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => getCampusYear(b.row) - getCampusYear(a.row) || a.index - b.index)
        .map((item) => item.row);
    }

    if (!isCampusList(list)) return rows;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const planningDiff = Number(isPlanningRow(b.row)) - Number(isPlanningRow(a.row));
        return planningDiff || a.index - b.index;
      })
      .map((item) => item.row);
  };

  const concisePlan = (value) => {
    const normalized = cleanText(value)
      .replace(/后续重点/g, "重点")
      .replace(/后续/g, "")
      .replace(/持续负责/g, "负责")
      .replace(/持续承担/g, "承担")
      .replace(/继续担任/g, "担任")
      .replace(/持续保障/g, "保障")
      .replace(/定位为/g, "")
      .replace(/定位/g, "")
      .replace(/同时/g, "")
      .replace(/尽快/g, "")
      .replace(/，+/g, "，")
      .replace(/^，|，$/g, "");
    const sentence = normalized.split(/[；;。]/).map((part) => part.trim()).filter(Boolean)[0] || normalized;
    const clauses = sentence.split(/[，,]/).map((part) => part.trim()).filter(Boolean);
    let summary = clauses.slice(0, 2).join("，") || sentence;
    if (summary.length > 26 && clauses[0]) summary = clauses[0];
    return summary.length > 26 ? `${summary.slice(0, 25)}…` : summary;
  };

  const gridPairValue = (fields) => {
    const grid25 = fields["25落格"] || "-";
    const grid26 = fields["26落格"] || "-";
    return `${grid25} / ${grid26}`;
  };

  const getConfig = (list) => {
    if (list.classList.contains("planning-campus-list")) {
      return [
        { title: "人名", value: ({ titleParts }) => titleParts[0] },
        { title: "计划", className: "plan-cell", value: ({ fields }) => fields["后续计划"] },
        { title: "届别", value: ({ fields }) => fields["届别"] },
        { title: "职级", value: ({ fields }) => fields["职级"] },
        { title: "2026盘点", value: ({ fields }) => fields["2026盘点"] },
        { title: "学历/学校", value: ({ fields }) => fields["学历/学校"] },
        { title: "赛道", value: ({ fields }) => fields["赛道"] },
        { title: "组织", value: ({ fields }) => fields["组织"] },
        { title: "上级评价", value: ({ fields }) => fields["上级评价"] },
      ];
    }

    if (list.classList.contains("campus-detail-list")) {
      return [
        { title: "人名", value: ({ titleParts }) => titleParts[0] },
        { title: "计划", value: ({ fields }) => fields["后续关注"] },
        { title: "岗位", value: ({ titleParts }) => titleParts[1] },
        { title: "职级", value: ({ fields }) => fields["职级"] },
        { title: "2026盘点", value: ({ fields }) => fields["2026盘点"] },
        { title: "2025结果", value: ({ fields }) => fields["2025结果"] },
        { title: "组织", value: ({ fields }) => fields["组织"] },
      ];
    }

    if (list.classList.contains("replace-list")) {
      return [
        { title: "人名", value: ({ titleParts }) => titleParts[0] },
        { title: "计划", className: "plan-cell", value: ({ fields }) => fields["后续计划"] },
        { title: "组织", value: ({ titleParts }) => titleParts[1] },
        { title: "项目", value: ({ titleParts }) => titleParts[2] },
        { title: "职务/职级", value: ({ fields }) => fields["职务/职级"] },
        { title: "司龄", value: ({ fields }) => fields["司龄"] },
        { title: "25/26落格", value: ({ fields }) => gridPairValue(fields) },
      ];
    }

    if (list.classList.contains("cadre-tail-list")) {
      return [
        { title: "人名", value: ({ titleParts }) => titleParts[0] },
        { title: "部门/项目", value: ({ fields }) => fields["部门/项目"] },
        { title: "职级", value: ({ fields }) => fields["职级"] },
        { title: "岗位", value: ({ titleParts }) => titleParts[1] },
        { title: "2026盘点", value: ({ fields }) => fields["2026盘点"] },
        { title: "历年盘点", value: ({ fields }) => fields["25/24/23"] },
        { title: "后续计划", className: "plan-cell", value: ({ fields }) => fields["后续计划"] },
        { title: "上级评价", value: ({ fields }) => fields["上级评价"] },
        { title: "360评价", value: ({ fields }) => fields["360评价"] },
      ];
    }

    return [
      { title: "人名", value: ({ titleParts }) => titleParts[0] },
      { title: "绩效", value: ({ fields }) => fields["绩效"] },
      { title: "计划", value: ({ fields }) => fields["后续关注"] },
      { title: "岗位", value: ({ titleParts }) => titleParts[1] },
      { title: "2026盘点", value: ({ fields }) => fields["2026盘点"] },
      { title: "历年盘点", value: ({ fields }) => fields["25/24/23"] },
      { title: "上级评价", value: ({ fields }) => fields["上级评价"] },
      { title: "360评价", value: ({ fields }) => fields["360评价"] },
    ];
  };

  const makeCell = (tagName, text, className = "") => {
    const cell = document.createElement(tagName);
    cell.textContent = cleanText(text) || "-";
    if (className) cell.className = className;
    return cell;
  };

  const convertList = (list) => {
    const rows = sortRows(buildRows(list), list);
    if (!rows.length) return;

    const columns = getConfig(list);
    const planningCount = isCampusList(list) ? rows.filter(isPlanningRow).length : 0;
    const wrap = document.createElement("div");
    wrap.className = "talent-person-table-wrap";
    if (isCampusList(list)) {
      wrap.classList.add("campus-table-wrap");
      if (isPlanningCampusList(list)) wrap.classList.add("planning-campus-table-wrap");
    }
    if (isReplaceList(list)) wrap.classList.add("replace-table-wrap");
    if (isCadreTailList(list)) wrap.classList.add("cadre-tail-table-wrap");

    const table = document.createElement("table");
    table.className = "talent-person-table";
    if (isCampusList(list)) table.classList.add("campus-table");
    if (isPlanningCampusList(list)) table.classList.add("planning-campus-table");
    if (isReplaceList(list)) table.classList.add("replace-table");
    if (isCadreTailList(list)) table.classList.add("cadre-tail-table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => headRow.appendChild(makeCell("th", column.title, column.className)));
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");
    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      if (isCampusList(list) && isPlanningRow(row)) tr.classList.add("is-planning");
      if (isCampusList(list) && planningCount && index === planningCount) tr.classList.add("starts-other-sequence");
      columns.forEach((column) => tr.appendChild(makeCell("td", column.value(row), column.className)));
      tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    wrap.appendChild(table);
    list.replaceChildren(wrap);
    list.classList.add("is-table");
  };

  const convertAll = () => {
    document.querySelectorAll(".talent-detail-list").forEach(convertList);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", convertAll, { once: true });
  } else {
    convertAll();
  }
}());
