    const gridById = id => gridDefs.find(grid => grid.id === Number(id)) || gridDefs[4];
    const selectedPerson = () => people.find(person => person.employeeId === selectedId);
    const validGridId = id => Number.isInteger(Number(id)) && Number(id) >= 1 && Number(id) <= 9;
    const gridLabel = id => validGridId(id) ? `${id} ${gridById(id).name}` : "-";
    const movement = person => Number(person.gridCurrent) - Number(person.gridOriginal);
    const movementLabel = person => movement(person) > 0 ? "上调" : movement(person) < 0 ? "下调" : "不变";
    const managerName = person => profileRawValue(person, "manager") || profileRawValue(person, "directManager") || profileRawValue(person, "直接上级") || "-";
    const profileRawValue = (person, key) => person.profile?.[key] || person[key] || "";
    const profileValue = (person, key, fallback = "-") => profileRawValue(person, key) || fallback;
    const profilePerformanceHistory = person => {
      const history = person.profile?.performanceHistory || person.performanceHistory || [];
      return Array.isArray(history) ? history : [];
    };
    const profileTalentReviewHistory = person => {
      const history = person.profile?.talentReviewHistory || person.talentReviewHistory || [];
      return Array.isArray(history) ? history : [];
    };
    const parseGridFromValue = value => {
      const match = String(value || "").match(/[1-9]/);
      return match ? Number(match[0]) : null;
    };
    const historicalGridValue = (person, year, fallback = null) => {
      const explicit = person[`grid${year}`];
      if (explicit) return explicit;
      const review = profileTalentReviewHistory(person).find(item => String(item?.year || "").includes(String(year)));
      return parseGridFromValue(review?.value) || fallback;
    };
    const recentYearPerformanceValue = person => {
      if (person.performanceLatest) return person.performanceLatest;
      if (person.performanceOriginal) return person.performanceOriginal;
      const explicit = profileRawValue(person, "recentYearPerformance");
      if (explicit) return explicit;
      const recent = person.profile?.recentPerformance || person.recentPerformance || [];
      if (Array.isArray(recent) && recent.length) return recent.slice(0, 6).join("；");
      const history = profilePerformanceHistory(person)
        .filter(item => item?.period && item?.managerRating)
        .slice(0, 6)
        .map(item => `${item.period}:${item.managerRating}`);
      return history.length ? history.join("；") : person.performanceLatest || "-";
    };
    const annualPerformanceReviewValue = person => {
      const explicit = profileRawValue(person, "annualPerformanceReview");
      if (explicit) return explicit;
      const annual = profilePerformanceHistory(person).find(item => {
        const period = String(item?.period || "");
        return period.includes("2025") && period.includes("年度");
      });
      return annual?.managerComment || person.reviewNote || profileRawValue(person, "profileSummary") || "-";
    };

    function reviewValue(person, key, fallback = "-") {
      return person[key] || person.profile?.[key] || fallback;
    }

    function currentAiAbility(person) {
      return person.aiAbilityCalibrated || person.aiAbilityOriginal || "";
    }

    function currentGrowthWarning(person) {
      return person.noGrowthWarningCalibrated || person.noGrowthWarningOriginal || person.noGrowthWarning || "";
    }

    function parseTalentPoolMembers(value) {
      return [...new Set(String(value || "").split(/[;；,\n\r\t]+/).map(name => name.trim()).filter(Boolean))];
    }

    let reportCalibrationAnchor = null;

    function reportToolDistribution(items = people) {
      const total = items.length || 0;
      const byGrid = new Map(gridDefs.map(grid => [grid.id, {
        grid,
        count: items.filter(person => Number(person.gridCurrent) === grid.id).length
      }]));
      return { total, byGrid };
    }

    function reportToolRatio(count, total) {
      return total ? Math.round(count / total * 100) : 0;
    }

    function reportToolCountOf(ids) {
      const { byGrid } = reportToolDistribution();
      return ids.reduce((sum, id) => sum + (byGrid.get(id)?.count || 0), 0);
    }

    function renderReportTool() {
      if (!$("page-11")) return;
      const { total, byGrid } = reportToolDistribution();
      const high = reportToolCountOf([7, 8, 9]);
      const core = reportToolCountOf([4, 5, 6]);
      const risk = reportToolCountOf([1, 2, 3]);
      document.querySelectorAll("[data-ppt-metric='total']").forEach(item => item.textContent = total);
      document.querySelectorAll("[data-ppt-metric='high']").forEach(item => item.textContent = `${high}人 / ${reportToolRatio(high, total)}%`);
      document.querySelectorAll("[data-ppt-metric='core']").forEach(item => item.textContent = `${core}人 / ${reportToolRatio(core, total)}%`);
      document.querySelectorAll("[data-ppt-metric='risk']").forEach(item => item.textContent = `${risk}人 / ${reportToolRatio(risk, total)}%`);
      document.querySelectorAll("[data-ppt-metric='changes']").forEach(item => item.textContent = currentChanges().length);
      const leader = [...byGrid.values()].sort((a, b) => b.count - a.count)[0];
      document.querySelectorAll("[data-ppt-metric='leader']").forEach(item => item.textContent = leader ? `${leader.grid.id} ${leader.grid.name}` : "-");
    }

    function setReportPptSlide(slideId) {
      const id = slideId || "overview";
      document.querySelectorAll("[data-report-slide]").forEach(button => {
        button.classList.toggle("active", button.dataset.reportSlide === id);
      });
      document.querySelectorAll("[data-report-slide-panel]").forEach(panel => {
        panel.classList.toggle("active", panel.dataset.reportSlidePanel === id);
      });
    }

    function renderReportDrawerTalentPoolFilter() {
      const select = $("reportDrawerTalentPoolSelect");
      if (!select) return;
      const current = filters.talentPool.size === 1 ? [...filters.talentPool][0] : "";
      const options = unique(talentPools.map(pool => pool.name)).sort();
      select.innerHTML = [
        `<option value="">全部人才池</option>`,
        ...options.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      ].join("");
      select.value = options.includes(current) ? current : "";
    }

    function setReportDrawerTalentPoolFilter(poolName = "") {
      filters.talentPool.clear();
      if (poolName) filters.talentPool.add(poolName);
      updateFilterLabels();
      render();
      renderReportTool();
    }

    function ensureReportCalibrationAnchor() {
      const workspace = $("workspace");
      if (!workspace || reportCalibrationAnchor) return;
      reportCalibrationAnchor = document.createComment("talent-review-workspace-anchor");
      workspace.parentNode.insertBefore(reportCalibrationAnchor, workspace);
    }

    function openReportCalibrationDrawer() {
      ensureReportCalibrationAnchor();
      const drawer = $("reportCalibrationDrawer");
      const mount = $("reportCalibrationMount");
      const backdrop = $("reportCalibrationBackdrop");
      const workspace = $("workspace");
      if (!drawer || !mount || !workspace) return;
      mount.appendChild(workspace);
      workspace.classList.add("report-drawer-workspace");
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      if (backdrop) {
        backdrop.hidden = false;
        backdrop.classList.add("open");
      }
      renderReportDrawerTalentPoolFilter();
      render();
    }

    function closeReportCalibrationDrawer() {
      const drawer = $("reportCalibrationDrawer");
      const backdrop = $("reportCalibrationBackdrop");
      const workspace = $("workspace");
      if (workspace && reportCalibrationAnchor?.parentNode) {
        workspace.classList.remove("report-drawer-workspace");
        reportCalibrationAnchor.parentNode.insertBefore(workspace, reportCalibrationAnchor.nextSibling);
      }
      if (drawer) {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
      }
      if (backdrop) {
        backdrop.classList.remove("open");
        backdrop.hidden = true;
      }
      render();
    }

    async function saveReportDrawerCalibration() {
      await saveOverrides();
      renderReportTool();
    }

    window.renderReportTool = renderReportTool;
    window.setReportPptSlide = setReportPptSlide;
    window.setReportDrawerTalentPoolFilter = setReportDrawerTalentPoolFilter;
    window.renderReportDrawerTalentPoolFilter = renderReportDrawerTalentPoolFilter;
    window.openReportCalibrationDrawer = openReportCalibrationDrawer;
    window.closeReportCalibrationDrawer = closeReportCalibrationDrawer;
    window.saveReportDrawerCalibration = saveReportDrawerCalibration;

    function personTalentPools(person) {
      const name = reviewValue(person, "name", "");
      return talentPools.filter(pool => (pool.members || []).includes(name)).map(pool => pool.name);
    }

    function personOrgLevels(person) {
      return ["一级组织", "二级组织", "三级组织", "四级组织", "五级组织"]
        .map(key => person[key])
        .filter(Boolean);
    }

    function personOrgPath(person) {
      return personOrgLevels(person).join("/");
    }

    function personDepartmentPaths(person) {
      const levels = personOrgLevels(person);
      return levels.map((_, index) => levels.slice(0, index + 1).join("/"));
    }

    function supervisorAdjustmentItems(person) {
      return Array.isArray(person.supervisorAdjustments) ? person.supervisorAdjustments : [];
    }

    function supervisorAdjustedLabel(person) {
      return supervisorAdjustmentItems(person).length ? "有上级调整" : "无上级调整";
    }

    function hasCalibrationDifference(person) {
      const originalGrid = Number(person.gridOriginal || person.meetingBaselineGrid || 0);
      const currentGrid = Number(person.gridCurrent || originalGrid || 0);
      const originalAi = person.aiAbilityOriginal || "";
      const currentAi = person.aiAbilityCalibrated || originalAi;
      const originalGrowth = person.noGrowthWarningOriginal || "";
      const currentGrowth = person.noGrowthWarningCalibrated || originalGrowth;
      const normalizeMulti = value => String(value || "").split(/[;；,，、\n\r]+/).map(item => item.trim()).filter(Boolean).join(",");
      const originalIncentives = normalizeMulti(person.incentivesOriginal || "");
      const currentIncentives = normalizeMulti(person.incentives || originalIncentives);
      const originalDevelopment = normalizeMulti(person.developmentAdviceOriginal || "");
      const currentDevelopment = normalizeMulti(person.developmentAdvice || originalDevelopment);
      return currentGrid !== originalGrid
        || currentAi !== originalAi
        || currentGrowth !== originalGrowth
        || currentIncentives !== originalIncentives
        || currentDevelopment !== originalDevelopment
        || Boolean(person.adjustment?.reason);
    }

    function calibrationDiffLabel(person) {
      return hasCalibrationDifference(person) ? "有差异" : "无差异";
    }

    function managerChain(person) {
      const managers = [];
      const first = managerName(person);
      if (first && first !== "-") managers.push(first);
      let current = first;
      const seen = new Set([person.name, current].filter(Boolean));
      for (let index = 0; index < 10; index++) {
        const managerPerson = people.find(item => item.name === current);
        if (!managerPerson) break;
        const next = managerName(managerPerson);
        if (!next || next === "-" || seen.has(next)) break;
        managers.push(next);
        seen.add(next);
        current = next;
      }
      return managers;
    }

    function filterLabel(key, allLabel = "全部") {
      const selected = [...filters[key]];
      if (!selected.length) return allLabel;
      if (selected.length === 1) return selected[0];
      return `已选 ${selected.length} 项`;
    }

    function updateFilterLabels() {
      Object.keys(filters).forEach(key => {
        const label = $(`${key}FilterLabel`);
        if (label) label.textContent = filterLabel(key);
      });
    }

    function fillMultiFilter(key, values) {
      const panel = $(`${key}FilterPanel`);
      panel.innerHTML = `
        <input class="filter-search" data-filter-search="${key}" placeholder="搜索">
        <div class="filter-options">
          ${values.map(value => `
            <label class="filter-option" data-option-text="${escapeHtml(value)}">
              <input type="checkbox" value="${escapeHtml(value)}" ${filters[key].has(value) ? "checked" : ""}>
              <span>${escapeHtml(value)}</span>
            </label>
          `).join("")}
        </div>
        <div class="filter-actions">
          <button type="button" data-filter-clear="${key}">清空</button>
          <button class="primary" type="button" data-filter-apply="${key}">确定</button>
        </div>
      `;
    }

    function buildDepartmentTree(items) {
      const root = new Map();
      items.forEach(person => {
        let branch = root;
        personOrgLevels(person).forEach((name, index, levels) => {
          const path = levels.slice(0, index + 1).join("/");
          if (!branch.has(name)) branch.set(name, { name, path, children: new Map() });
          branch = branch.get(name).children;
        });
      });
      return root;
    }

    function renderDepartmentNodes(nodes, depth = 0) {
      return [...nodes.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
        .map(node => {
          const hasChildren = node.children.size > 0;
          const expanded = expandedDepartments.has(node.path);
          return `
          <div class="department-node" style="--depth: ${depth}" data-option-text="${escapeHtml(node.path)}" data-department-node="${escapeHtml(node.path)}">
            <label class="filter-option">
              <button class="department-toggle ${hasChildren ? "" : "placeholder"}" type="button" data-department-toggle="${escapeHtml(node.path)}" aria-label="${expanded ? "收起" : "展开"}${escapeHtml(node.name)}">${expanded ? "▼" : "▶"}</button>
              <input type="checkbox" value="${escapeHtml(node.path)}" ${filters.department.has(node.path) ? "checked" : ""}>
              <span>${escapeHtml(node.name)}</span>
              <small class="department-level">${depth + 1}级</small>
            </label>
            ${hasChildren && expanded ? `<div class="department-children">${renderDepartmentNodes(node.children, depth + 1)}</div>` : ""}
          </div>
        `;
        }).join("");
    }

    function fillDepartmentFilter() {
      const panel = $("departmentFilterPanel");
      panel.innerHTML = `
        <input class="filter-search" data-filter-search="department" placeholder="搜索部门">
        <div class="filter-options">
          ${renderDepartmentNodes(buildDepartmentTree(people))}
        </div>
        <div class="filter-actions">
          <button type="button" data-filter-clear="department">清空</button>
          <button class="primary" type="button" data-filter-apply="department">确定</button>
        </div>
      `;
    }

    function buildManagerTree() {
      const root = new Map();
      const directReports = new Map();
      people.forEach(person => {
        const manager = managerName(person);
        if (manager && manager !== "-") {
          if (!directReports.has(manager)) directReports.set(manager, []);
          directReports.get(manager).push(person.name);
        }
      });
      [...directReports.keys()].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")).forEach(name => {
        root.set(name, { name, path: name, children: new Map() });
      });
      root.forEach(node => {
        (directReports.get(node.name) || []).forEach(reportName => {
          if (directReports.has(reportName) && !node.children.has(reportName)) {
            node.children.set(reportName, { name: reportName, path: `${node.path}/${reportName}`, children: new Map() });
          }
        });
      });
      return root;
    }

    function renderManagerNodes(nodes, depth = 0) {
      return [...nodes.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
        .map(node => {
          const hasChildren = node.children.size > 0;
          const expanded = expandedManagers.has(node.path);
          return `
            <div class="department-node" style="--depth: ${depth}" data-option-text="${escapeHtml(node.name)}">
              <label class="filter-option">
                <button class="department-toggle ${hasChildren ? "" : "placeholder"}" type="button" data-manager-toggle="${escapeHtml(node.path)}">${expanded ? "▼" : "▶"}</button>
                <input type="checkbox" value="${escapeHtml(node.name)}" ${filters.managerTeam.has(node.name) ? "checked" : ""}>
                <span>${escapeHtml(node.name)}</span>
              </label>
              ${hasChildren && expanded ? `<div class="department-children">${renderManagerNodes(node.children, depth + 1)}</div>` : ""}
            </div>
          `;
        }).join("");
    }

    function fillManagerFilter() {
      const panel = $("managerTeamFilterPanel");
      panel.innerHTML = `
        <input class="filter-search" data-filter-search="managerTeam" placeholder="搜索直线经理">
        <div class="filter-options">
          ${renderManagerNodes(buildManagerTree()) || `<div class="empty-cell">暂无直线经理数据，请先导入全部人员 Excel。</div>`}
        </div>
        <div class="filter-actions">
          <button type="button" data-filter-clear="managerTeam">清空</button>
          <button class="primary" type="button" data-filter-apply="managerTeam">确定</button>
        </div>
      `;
    }

    function personSearchText(person) {
      return [
        person.employeeId,
        person.name,
        person.departmentPath,
        personOrgPath(person),
        profileValue(person, "level", ""),
        profileValue(person, "sequence", ""),
        profileValue(person, "manager", ""),
        currentAiAbility(person),
        currentGrowthWarning(person)
      ].join(" ").toLowerCase();
    }

    function renderTalentSearch() {
      const input = $("talentSearchInput");
      const results = $("talentSearchResults");
      const profile = $("talentSearchProfile");
      if (!input || !results || !profile) return;
      const keyword = input.value.trim().toLowerCase();
      const matched = (keyword ? people.filter(person => personSearchText(person).includes(keyword)) : people).slice(0, 80);
      if (!querySelectedId && matched[0]) querySelectedId = matched[0].employeeId;
      results.innerHTML = matched.map(person => `
        <button class="query-person ${person.employeeId === querySelectedId ? "active" : ""}" type="button" data-query-id="${person.employeeId}">
          <strong>${escapeHtml(person.name)} ${escapeHtml(profileValue(person, "level", ""))}</strong>
          <span>${escapeHtml(personOrgPath(person) || person.departmentPath || "-")}</span>
        </button>
      `).join("") || `<div class="empty-report">没有匹配人员</div>`;
      const person = people.find(item => item.employeeId === querySelectedId) || matched[0];
      profile.innerHTML = person ? `
        <div class="profile-name"><h3>${escapeHtml(person.name)}</h3><span class="pill">${escapeHtml(profileValue(person, "level"))}</span><span class="pill ok">${escapeHtml(profileValue(person, "group"))}</span></div>
        <div class="profile-sub">${escapeHtml(personOrgPath(person) || person.departmentPath || "-")}</div>
        <section class="section"><h4>基本信息</h4><div class="kv">
          <span class="k">工号</span><span class="v">${escapeHtml(person.employeeId || "-")}</span>
          <span class="k">序列</span><span class="v">${escapeHtml(profileValue(person, "sequence"))}</span>
          <span class="k">直接上级</span><span class="v">${escapeHtml(profileValue(person, "manager"))}</span>
          <span class="k">九宫格</span><span class="v">${escapeHtml(gridLabel(person.gridCurrent))}</span>
          <span class="k">AI能力</span><span class="v">${escapeHtml(currentAiAbility(person) || "-")}</span>
          <span class="k">无成长预警</span><span class="v">${escapeHtml(currentGrowthWarning(person) || "-")}</span>
        </div></section>
      ` : `<div class="empty-report">请选择人员</div>`;
      document.querySelectorAll("[data-query-id]").forEach(button => {
        button.onclick = () => {
          querySelectedId = button.dataset.queryId;
          renderTalentSearch();
        };
      });
    }

    async function loadTalentPools() {
      const response = await fetch("/api/talent-pools");
      const payload = await response.json();
      talentPools = payload.pools || [];
      renderTalentPoolList();
      renderReportDrawerTalentPoolFilter();
    }

    function renderTalentPoolList() {
      const list = $("talentPoolList");
      if (!list) return;
      if (!talentPools.length) {
        list.innerHTML = `<div class="empty-report">暂无人才池。输入名称和人员名单后保存。</div>`;
        return;
      }
      list.innerHTML = talentPools.map(pool => {
        const members = pool.members || [];
        return `
        <article class="pool-item">
          <div>
            <strong class="pool-name" title="${escapeHtml(pool.name)}">${escapeHtml(pool.name)}</strong>
            <span class="pool-count">${members.length}人</span>
            <div class="pool-members" title="${escapeHtml(members.join(";"))}">
              ${members.length ? members.map(member => `
                <span class="pool-member-chip">
                  ${escapeHtml(member)}
                  <button type="button" data-pool-member-delete="${escapeHtml(pool.name)}" data-member="${escapeHtml(member)}">×</button>
                </span>
              `).join("") : "暂无人员"}
            </div>
          </div>
          <button type="button" data-pool-edit="${escapeHtml(pool.name)}">编辑</button>
          <button class="pool-delete" type="button" data-pool-delete="${escapeHtml(pool.name)}">删除</button>
        </article>
      `;
      }).join("");
      list.querySelectorAll("[data-pool-edit]").forEach(button => {
        button.addEventListener("click", () => {
          const pool = talentPools.find(item => item.name === button.dataset.poolEdit);
          if (!pool) return;
          editingTalentPoolName = pool.name;
          $("talentPoolNameInput").value = pool.name;
          $("talentPoolMembersInput").value = (pool.members || []).join(";");
          $("saveTalentPoolBtn").textContent = "保存修改";
          $("talentPoolStatus").textContent = `正在编辑：${pool.name}`;
        });
      });
      list.querySelectorAll("[data-pool-member-delete]").forEach(button => {
        button.addEventListener("click", async () => {
          const pool = talentPools.find(item => item.name === button.dataset.poolMemberDelete);
          if (!pool) return;
          pool.members = (pool.members || []).filter(member => member !== button.dataset.member);
          await saveTalentPools();
        });
      });
      list.querySelectorAll("[data-pool-delete]").forEach(button => {
        button.addEventListener("click", async () => {
          talentPools = talentPools.filter(pool => pool.name !== button.dataset.poolDelete);
          if (editingTalentPoolName === button.dataset.poolDelete) resetTalentPoolForm();
          await saveTalentPools();
        });
      });
    }

    function resetTalentPoolForm() {
      editingTalentPoolName = "";
      $("talentPoolNameInput").value = "";
      $("talentPoolMembersInput").value = "";
      $("saveTalentPoolBtn").textContent = "保存人才池";
    }

    async function saveTalentPools() {
      const response = await fetch("/api/talent-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pools: talentPools })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "保存失败");
      talentPools = payload.pools || [];
      renderTalentPoolList();
      fillMultiFilter("talentPool", unique(talentPools.map(pool => pool.name)).sort());
      renderReportDrawerTalentPoolFilter();
      bindFilterPanels();
      updateFilterLabels();
      render();
      $("talentPoolStatus").textContent = "人才池已保存。";
    }

    async function upsertTalentPool() {
      const name = $("talentPoolNameInput").value.trim();
      const members = parseTalentPoolMembers($("talentPoolMembersInput").value);
      if (!name) {
        $("talentPoolStatus").textContent = "请填写人才池名称。";
        return;
      }
      if (!members.length) {
        $("talentPoolStatus").textContent = "请填写至少一个人名。";
        return;
      }
      if (editingTalentPoolName && editingTalentPoolName !== name && talentPools.some(pool => pool.name === name)) {
        $("talentPoolStatus").textContent = "人才池名称已存在，请换一个名称。";
        return;
      }
      const existing = talentPools.find(pool => pool.name === (editingTalentPoolName || name));
      if (existing) {
        existing.name = name;
        existing.members = members;
      } else {
        talentPools.push({ name, members });
      }
      await saveTalentPools();
      resetTalentPoolForm();
    }

    async function loadPeople() {
      const response = await fetch("/api/people");
      const payload = await response.json();
      people = payload.people;
      await loadTalentPools();
      if (!selectedId || !people.some(person => person.employeeId === selectedId)) {
        selectedId = null;
        profileExpanded = false;
      }
      dirty = false;
      calibrationHistory.length = 0;
      calibrationFuture.length = 0;
      initFilters();
      render();
      updateCalibrationStepButtons();
      renderTalentSearch();
    }

    function initFilters() {
      fillMultiFilter("group", unique(people.map(person => reviewValue(person, "group"))).sort());
      fillDepartmentFilter();
      fillMultiFilter("level", unique(people.map(person => reviewValue(person, "level"))).sort((a, b) => (levelWeight[b] || 0) - (levelWeight[a] || 0)));
      fillMultiFilter("sequence", unique(people.map(person => profileValue(person, "sequence"))));
      fillManagerFilter();
      fillMultiFilter("growthWarning", unique(people.map(currentGrowthWarning)).sort());
      fillMultiFilter("aiAbility", unique(people.map(currentAiAbility)).sort());
      fillMultiFilter("talentPool", unique(talentPools.map(pool => pool.name)).sort());
      fillMultiFilter("supervisorAdjusted", ["有上级调整", "无上级调整"]);
      fillMultiFilter("calibrationDiff", ["有差异", "无差异"]);
      bindFilterPanels();
      updateFilterLabels();
    }

    function matchesDepartment(person) {
      if (!filters.department.size) return true;
      const paths = personDepartmentPaths(person);
      return [...filters.department].some(selectedPath => paths.includes(selectedPath));
    }

    function filteredPeople() {
      const matches = (key, value) => !filters[key].size || filters[key].has(value);
      return people.filter(person =>
        matches("group", reviewValue(person, "group")) &&
        matchesDepartment(person) &&
        matches("level", reviewValue(person, "level")) &&
        matches("sequence", profileValue(person, "sequence")) &&
        (!filters.managerTeam.size || (managerChain(person).some(manager => filters.managerTeam.has(manager)) && !filters.managerTeam.has(person.name))) &&
        matches("growthWarning", currentGrowthWarning(person)) &&
        matches("aiAbility", currentAiAbility(person)) &&
        (!filters.talentPool.size || personTalentPools(person).some(pool => filters.talentPool.has(pool))) &&
        matches("supervisorAdjusted", supervisorAdjustedLabel(person)) &&
        matches("calibrationDiff", calibrationDiffLabel(person))
      );
    }

    function bindFilterPanels() {
      document.querySelectorAll("[data-filter-trigger]").forEach(button => {
        button.onclick = event => {
          event.stopPropagation();
          const field = button.closest(".filter-field");
          const isOpen = field.classList.contains("open");
          document.querySelectorAll(".filter-field.open").forEach(item => item.classList.remove("open"));
          if (!isOpen) field.classList.add("open");
        };
      });

      document.querySelectorAll(".filter-panel").forEach(panel => {
        panel.onclick = event => event.stopPropagation();
      });

      document.querySelectorAll("[data-department-toggle]").forEach(button => {
        button.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          filters.department = new Set([...$("departmentFilterPanel").querySelectorAll("input[type='checkbox']:checked")].map(input => input.value));
          const path = button.dataset.departmentToggle;
          if (expandedDepartments.has(path)) {
            expandedDepartments.delete(path);
          } else {
            expandedDepartments.add(path);
          }
          fillDepartmentFilter();
          bindFilterPanels();
        };
      });

      document.querySelectorAll("[data-manager-toggle]").forEach(button => {
        button.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          filters.managerTeam = new Set([...$("managerTeamFilterPanel").querySelectorAll("input[type='checkbox']:checked")].map(input => input.value));
          const path = button.dataset.managerToggle;
          if (expandedManagers.has(path)) {
            expandedManagers.delete(path);
          } else {
            expandedManagers.add(path);
          }
          fillManagerFilter();
          bindFilterPanels();
        };
      });


      document.querySelectorAll("[data-filter-search]").forEach(input => {
        input.oninput = () => {
          const keyword = input.value.trim().toLowerCase();
          input.closest(".filter-panel").querySelectorAll("[data-option-text]").forEach(option => {
            option.style.display = !keyword || option.dataset.optionText.toLowerCase().includes(keyword) ? "" : "none";
          });
        };
      });

      document.querySelectorAll("[data-filter-clear]").forEach(button => {
        button.onclick = () => {
          const key = button.dataset.filterClear;
          filters[key].clear();
          button.closest(".filter-panel").querySelectorAll("input[type='checkbox']").forEach(input => input.checked = false);
          updateFilterLabels();
          render();
        };
      });

      document.querySelectorAll("[data-filter-apply]").forEach(button => {
        button.onclick = () => {
          const key = button.dataset.filterApply;
          filters[key] = new Set([...button.closest(".filter-panel").querySelectorAll("input[type='checkbox']:checked")].map(input => input.value));
          updateFilterLabels();
          button.closest(".filter-field").classList.remove("open");
          render();
        };
      });
    }

    function currentChanges() {
      return people
        .filter(person =>
          Number(person.gridCurrent) !== Number(person.gridOriginal)
          || person.aiAbilityCalibrated !== person.aiAbilityOriginal
          || (person.noGrowthWarningCalibrated || person.noGrowthWarning) !== person.noGrowthWarningOriginal
          || String(person.incentives || "") !== String(person.incentivesOriginal || "")
          || String(person.developmentAdvice || "") !== String(person.developmentAdviceOriginal || "")
          || person.adjustment?.reason
        )
        .map(person => ({
          employeeId: person.employeeId,
          name: person.name,
          originalGrid: Number(person.gridOriginal),
          calibratedGrid: Number(person.gridCurrent),
          aiAbilityOriginal: person.aiAbilityOriginal,
          aiAbilityCalibrated: person.aiAbilityCalibrated,
          noGrowthWarningOriginal: person.noGrowthWarningOriginal,
          noGrowthWarningCalibrated: person.noGrowthWarningCalibrated || person.noGrowthWarning,
          incentives: person.incentives || "",
          developmentAdvice: person.developmentAdvice || "",
          reason: person.adjustment?.reason || "",
          updatedBy: "local-user"
        }));
    }

    function renderStats(items) {
      const total = items.length || 1;
      const recommendOf = ids => ids.reduce((sum, id) => sum + (gridById(id).ratio || 0), 0);
      const band = (label, ids) => {
        const count = items.filter(person => ids.includes(Number(person.gridCurrent))).length;
        const actual = Math.round(count / total * 100);
        const recommend = recommendOf(ids);
        return `<div class="stat band"><strong>${label}：${count}人（${actual}%）</strong><div class="line"><span>建议</span><b>${recommend}%</b></div><div class="line"><span>实际</span><b>${actual}%</b></div></div>`;
      };
      $("stats").innerHTML = [
        `<div class="stat"><strong>${items.length}</strong><span>当前筛选人数</span></div>`,
        band("123宫格", [1, 2, 3]),
        band("456宫格", [4, 5, 6]),
        band("789宫格", [7, 8, 9])
      ].join("");
    }

    function personCard(person) {
      const diff = movement(person);
      const mark = diff === 0 ? "" : `<span class="move-mark ${diff > 0 ? "up" : "down"}">${diff > 0 ? "↑" : "↓"}</span>`;
      return `
        <article class="person ${person.employeeId === selectedId ? "selected" : ""}" draggable="true" data-id="${person.employeeId}" title="${person.name} ${profileValue(person, "level")}">
          <span class="person-name">${person.name}</span>
          <span class="person-level">${profileValue(person, "level")}</span>
          ${mark}
        </article>
      `;
    }

    function calibrationState(person) {
      return {
        gridCurrent: Number(person.gridCurrent),
        aiAbilityCalibrated: person.aiAbilityCalibrated,
        noGrowthWarningCalibrated: person.noGrowthWarningCalibrated,
        noGrowthWarning: person.noGrowthWarning,
        incentives: person.incentives,
        developmentAdvice: person.developmentAdvice,
        adjustment: { ...(person.adjustment || {}) }
      };
    }

    function captureCalibrationSnapshot(employeeIds) {
      const ids = Array.isArray(employeeIds) ? employeeIds : [employeeIds];
      return {
        selectedId,
        profileExpanded,
        items: ids
          .map(employeeId => people.find(person => person.employeeId === employeeId))
          .filter(Boolean)
          .map(person => ({ employeeId: person.employeeId, state: calibrationState(person) }))
      };
    }

    function applyCalibrationState(employeeId, state) {
      const person = people.find(item => item.employeeId === employeeId);
      if (!person || !state) return;
      person.gridCurrent = Number(state.gridCurrent);
      person.aiAbilityCalibrated = state.aiAbilityCalibrated;
      person.noGrowthWarningCalibrated = state.noGrowthWarningCalibrated;
      person.noGrowthWarning = state.noGrowthWarning;
      person.incentives = state.incentives;
      person.developmentAdvice = state.developmentAdvice;
      person.adjustment = { ...(state.adjustment || {}) };
    }

    function updateCalibrationStepButtons() {
      const forward = $("reloadBtn");
      const back = $("resetSelectedBtn");
      if (forward) forward.disabled = !calibrationFuture.length;
      if (back) back.disabled = !calibrationHistory.length;
    }

    function pushCalibrationHistory(employeeIds) {
      const snapshot = captureCalibrationSnapshot(employeeIds);
      if (!snapshot.items.length) return;
      calibrationHistory.push(snapshot);
      if (calibrationHistory.length > calibrationHistoryLimit) calibrationHistory.shift();
      calibrationFuture.length = 0;
      updateCalibrationStepButtons();
    }

    function applyCalibrationSnapshot(snapshot) {
      snapshot.items.forEach(item => applyCalibrationState(item.employeeId, item.state));
      selectedId = snapshot.selectedId;
      profileExpanded = snapshot.profileExpanded;
      dirty = currentChanges().length > 0;
      render();
      updateCalibrationStepButtons();
    }

    function undoCalibrationStep() {
      const snapshot = calibrationHistory.pop();
      if (!snapshot) return;
      calibrationFuture.push(captureCalibrationSnapshot(snapshot.items.map(item => item.employeeId)));
      applyCalibrationSnapshot(snapshot);
      updateStatus("已后退一步");
    }

    function redoCalibrationStep() {
      const snapshot = calibrationFuture.pop();
      if (!snapshot) return;
      calibrationHistory.push(captureCalibrationSnapshot(snapshot.items.map(item => item.employeeId)));
      applyCalibrationSnapshot(snapshot);
      updateStatus("已前进一步");
    }

    function movePerson(employeeId, gridId) {
      const person = people.find(item => item.employeeId === employeeId);
      if (!person) return;
      if (Number(person.gridCurrent) === Number(gridId)) return;
      pushCalibrationHistory(employeeId);
      person.gridCurrent = Number(gridId);
      person.adjustment = person.adjustment || {};
      selectedId = employeeId;
      profileExpanded = true;
      dirty = true;
      render();
    }

    function renderMatrix(items) {
      $("matrix").innerHTML = gridDefs.map(grid => {
        const inGrid = items
          .filter(person => Number(person.gridCurrent) === grid.id)
          .sort((a, b) => (levelWeight[profileValue(b, "level")] || 0) - (levelWeight[profileValue(a, "level")] || 0));
        const selected = selectedPerson() && Number(selectedPerson().gridCurrent) === grid.id ? "selected-cell" : "";
        return `
          <section class="cell ${selected}" data-grid="${grid.id}" data-band="${grid.band}">
            <div class="cell-head">
              <div class="cell-title">
                <span class="num">${grid.id}</span>
                <h2>${grid.name}</h2>
              </div>
              <span class="ratio">建议 ${grid.ratio}%</span>
            </div>
            <p class="cell-note">${grid.hint}</p>
            <div class="people">${inGrid.length ? inGrid.map(personCard).join("") : `<div class="empty">暂无人员</div>`}</div>
          </section>
        `;
      }).join("");

      document.querySelectorAll(".person").forEach(card => {
        card.addEventListener("click", () => {
          selectedId = card.dataset.id;
          profileExpanded = true;
          render();
        });
        card.addEventListener("dragstart", event => {
          event.dataTransfer.setData("text/plain", card.dataset.id);
        });
      });

      document.querySelectorAll(".cell").forEach(cell => {
        cell.addEventListener("dragover", event => {
          event.preventDefault();
          cell.classList.add("over");
        });
        cell.addEventListener("dragleave", () => cell.classList.remove("over"));
        cell.addEventListener("drop", event => {
          event.preventDefault();
          cell.classList.remove("over");
          movePerson(event.dataTransfer.getData("text/plain"), cell.dataset.grid);
        });
      });
    }

    function renderDistribution(items) {
      const count = id => items.filter(person => Number(person.gridCurrent) === id).length;
      const total = items.length || 1;
      const grids = gridDefs.slice().sort((a, b) => a.id - b.id);
      $("distributionTable").innerHTML = `
        <thead><tr><th>项目</th>${grids.map(grid => `<th>${grid.id} ${grid.name}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><td>建议比例</td>${grids.map(grid => `<td>${grid.ratio}%</td>`).join("")}</tr>
          <tr><td>实际比例</td>${grids.map(grid => `<td>${Math.round(count(grid.id) / total * 100)}%</td>`).join("")}</tr>
          <tr><td>人数</td>${grids.map(grid => `<td>${count(grid.id)}</td>`).join("")}</tr>
        </tbody>
      `;
    }

    function scoreModule(title, score, details, open = false) {
      if (!score || score === "-") return "";
      return `
        <div class="score-module ${open ? "open" : ""}">
          <button class="score-toggle" type="button">
            <span>${title}</span>
            <span>总分 ${score}</span>
            <span>⌄</span>
          </button>
          <div class="score-details">
            ${(details || []).map(([name, value]) => `<div class="score-row"><span>${name}</span><strong>${value}</strong></div>`).join("")}
          </div>
        </div>
      `;
    }

    function detailValue(details, name) {
      const item = (details || []).find(([label]) => label === name);
      return item ? item[1] : "-";
    }

    function scoreNumber(value) {
      const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : 0;
    }

    function scoreText(value, denominator = 5) {
      if (!value || value === "-") return "-";
      const score = scoreNumber(value);
      return `${score.toFixed(score % 1 ? 1 : 0)} / ${denominator}`;
    }

    function renderPotentialScores(person) {
      const professional = person.professionalAbility?.detail || [];
      const leadership = person.leadership?.detail || [];
      const growth = person.growthMindset?.detail || [];
      const knowledge = detailValue(professional, "知识及技能");
      const cadreQuality = detailValue(professional, "干部品质");
      const leadershipItems = [
        ["干部品质", cadreQuality],
        ...leadership
      ];
      const growthItems = ["成就欲", "韧性", "谦逊好学"].map(name => [name, detailValue(growth, name)]);
      const growthTotal = growthItems.reduce((sum, [, value]) => sum + scoreNumber(value), 0);
      const potentialTotal = person.potentialScore ? `${person.potentialScore} / 5` : "-";
      return `
        <div class="potential-card">
          <div class="potential-total">
            <span>潜能总分</span>
            <strong>${potentialTotal}</strong>
          </div>
          <div class="potential-row">
            <span class="label">知识及技能</span>
            <span class="value">${scoreText(knowledge, 5)}</span>
          </div>
          <div class="potential-row">
            <span class="label">领导力</span>
            <span class="value">
              ${leadershipItems.map(([name, value]) => `${name} ${scoreText(value, 5)}`).join("；")}
              <div class="sub">干部品质 + 领导力4项评分</div>
            </span>
          </div>
          <div class="potential-row">
            <span class="label">成长型思维</span>
            <span class="value">
              ${growthTotal ? `${growthTotal.toFixed(1)} / 9` : "-"}
              <div class="sub">${growthItems.map(([name, value]) => `${name} ${scoreText(value, 3)}`).join("；")}</div>
            </span>
          </div>
        </div>
      `;
    }

    function renderProfile() {
      const person = selectedPerson();
      $("workspace").classList.toggle("profile-collapsed", !profileExpanded || !person);
      if (!profileExpanded) {
        $("profile").innerHTML = "";
        return;
      }
      if (!person) {
        $("profile").innerHTML = `<div class="reason-note">暂无人员数据</div>`;
        return;
      }
      const reason = person.adjustment?.reason || "";
      const history = [
        ["25年", historicalGridValue(person, 2025, person.gridOriginal)],
        ["24年", historicalGridValue(person, 2024, person.grid2024)],
        ["23年", historicalGridValue(person, 2023, person.grid2023)]
      ].filter(([, grid]) => grid);
      const diff = movement(person);
      const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
      const arrowClass = diff > 0 ? "up" : diff < 0 ? "down" : "";
      const recentYearPerformance = recentYearPerformanceValue(person);
      const annualPerformanceReview = annualPerformanceReviewValue(person);
      const supervisorAdjustments = supervisorAdjustmentItems(person);
      const supervisorAdjustmentHtml = supervisorAdjustments.length ? `
        <section class="section">
          <h4>上级调整</h4>
          <div class="history">
            ${supervisorAdjustments.map(item => `<span class="pill">上级有调整：【${escapeHtml(item.label)}】${escapeHtml(item.from)}-${escapeHtml(item.to)}</span>`).join("")}
          </div>
        </section>
      ` : "";
      $("profile").innerHTML = `
        <div>
          <div class="profile-name">
            <h3>${person.name}</h3>
            <span class="pill">${profileValue(person, "level")}</span>
            <span class="pill ok">${profileValue(person, "group")}</span>
          </div>
          <div class="profile-sub">${profileValue(person, "departmentPath")} / ${profileValue(person, "title")}</div>
        </div>

        <section class="section">
          <h4>基本信息</h4>
          <div class="kv">
            <span class="k">群体</span><span class="v">${profileValue(person, "group")}</span>
            <span class="k">职级</span><span class="v">${profileValue(person, "level")}</span>
            <span class="k">职位</span><span class="v">${profileValue(person, "title")}</span>
            <span class="k">序列</span><span class="v">${profileValue(person, "sequence")}</span>
            <span class="k">直接上级</span><span class="v">${profileValue(person, "manager")}</span>
            <span class="k">年龄/司龄</span><span class="v">${person.age || "-"} / ${person.tenure || "-"}</span>
          </div>
        </section>

        <section class="section">
          <h4>近一年绩效</h4>
          <div class="kv">
            <span class="k">近一年绩效</span><span class="v">${recentYearPerformance}</span>
            <span class="k">年度绩效</span><span class="v">${person.performanceOriginal || "-"}</span>
            <span class="k">年度绩效评价</span><span class="v">${annualPerformanceReview}</span>
            <span class="k">绩效等级</span><span class="v">${person.performanceBand || "-"}</span>
          </div>
        </section>

        <section class="section">
          <h4>近三年落格</h4>
          <div class="history">${history.map(([year, grid]) => `<span class="pill">${year}: ${gridLabel(grid)}</span>`).join("") || `<span class="reason-note">无记录</span>`}</div>
        </section>

        ${supervisorAdjustmentHtml}

        <section class="section">
          <h4>26年校准</h4>
          <div class="flow">
            <div class="change-line">
              <span class="from"><span class="grid-chip grid-${person.gridOriginal}">${person.gridOriginal}</span> ${gridLabel(person.gridOriginal)}</span>
              <span class="arrow ${arrowClass}">${arrow}</span>
              <span class="to"><span class="grid-chip grid-${person.gridCurrent}">${person.gridCurrent}</span> ${gridLabel(person.gridCurrent)}</span>
            </div>
            <div class="flow-row"><span>校准后</span><select id="gridSelect">${gridDefs.slice().sort((a, b) => a.id - b.id).map(grid => `<option value="${grid.id}" ${Number(person.gridCurrent) === grid.id ? "selected" : ""}>${grid.id} ${grid.name}</option>`).join("")}</select></div>
            <div class="flow-row"><span>变化</span><span>${movementLabel(person)}</span></div>
            <div class="flow-row"><span>现场差异</span><span>${calibrationDiffLabel(person)}</span></div>
            <div class="flow-row"><span>激励</span><span>${person.incentives || "-"}</span></div>
            <div class="flow-row"><span>发展建议</span><span>${person.developmentAdvice || "-"}</span></div>
          </div>
        </section>

        <section class="section">
          <h4>AI能力</h4>
          <div class="flow">
            <div class="flow-row"><span>原结果</span><span>${person.aiAbilityOriginal || "-"}</span></div>
            <div class="flow-row"><span>校准后</span><select id="aiSelect">${[...aiAbilityOptions, "-"].map(value => `<option value="${value}" ${person.aiAbilityCalibrated === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
            <div class="flow-row"><span>AI思维</span><span>${person.aiThinking || "-"}</span></div>
            <div class="flow-row"><span>AI应用</span><span>${person.aiApplication || "-"}</span></div>
          </div>
        </section>

        <section class="section">
          <h4>无成长预警</h4>
          <div class="flow">
            <div class="flow-row"><span>原结果</span><span>${person.noGrowthWarningOriginal || "-"}</span></div>
            <div class="flow-row"><span>校准后</span><select id="growthSelect">${["否", "是", "-"].map(value => `<option value="${value}" ${(person.noGrowthWarningCalibrated || person.noGrowthWarning) === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
          </div>
        </section>

        <section class="section">
          <h4>潜能评分</h4>
          ${renderPotentialScores(person)}
        </section>

        <section class="section">
          <h4>调整原因</h4>
          <textarea id="reasonInput" placeholder="记录校准会调整依据，保存后写入独立 overrides 数据源">${reason}</textarea>
          <p class="reason-note">${person.reviewNote || profileValue(person, "profileSummary", "")}</p>
        </section>
      `;

      $("gridSelect").addEventListener("change", event => movePerson(person.employeeId, event.target.value));
      $("aiSelect").addEventListener("change", event => {
        if (person.aiAbilityCalibrated === event.target.value) return;
        pushCalibrationHistory(person.employeeId);
        person.aiAbilityCalibrated = event.target.value;
        person.adjustment = person.adjustment || {};
        person.adjustment.aiAbilityCalibrated = event.target.value;
        dirty = true;
        render();
      });
      $("growthSelect").addEventListener("change", event => {
        if ((person.noGrowthWarningCalibrated || person.noGrowthWarning) === event.target.value) return;
        pushCalibrationHistory(person.employeeId);
        person.noGrowthWarningCalibrated = event.target.value;
        person.noGrowthWarning = event.target.value;
        person.adjustment = person.adjustment || {};
        person.adjustment.noGrowthWarningCalibrated = event.target.value;
        dirty = true;
        render();
      });
      $("reasonInput").addEventListener("input", event => {
        if (event.target.dataset.historyCaptured !== "1") {
          pushCalibrationHistory(person.employeeId);
          event.target.dataset.historyCaptured = "1";
        }
        person.adjustment = person.adjustment || {};
        person.adjustment.reason = event.target.value;
        dirty = true;
        updateStatus();
      });
    }

    function updateStatus(message) {
      $("statusLine").textContent = message || (dirty ? "有未保存调整" : "已加载独立校准数据");
    }

    function render() {
      const items = filteredPeople();
      if (selectedId && !items.some(person => person.employeeId === selectedId)) {
        selectedId = null;
        profileExpanded = false;
      }
      renderStats(items);
      renderMatrix(items);
      renderDistribution(items);
      renderProfile();
      updateStatus();
      updateCalibrationStepButtons();
      renderReportTool();
    }

    async function saveOverrides() {
      const changes = currentChanges();
      const response = await fetch("/api/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes })
      });
      const payload = await response.json();
      people.forEach(person => {
        person.adjustment = payload.changes.find(change => change.employeeId === person.employeeId) || {};
      });
      dirty = false;
      calibrationHistory.length = 0;
      calibrationFuture.length = 0;
      render();
      updateStatus(`已保存 ${payload.changes.length} 条调整`);
    }

    async function exportChanges() {
      if (dirty) await saveOverrides();
      const endpoint = $("exportMode")?.value === "diff" ? "/api/export/calibration-differences" : "/api/export/calibrated-excel";
      window.location.href = endpoint;
    }

    async function importReviewExcel(event) {
      event.preventDefault();
      try {
        await uploadFile("/api/import/review-excel", "reviewExcelInput", "reviewImportStatus");
        await loadPeople();
        await loadImportSources();
      } catch (error) {
        $("reviewImportStatus").textContent = `导入失败：${error.message}`;
      }
    }

    async function importProfilesJson(event) {
      event.preventDefault();
      try {
        await uploadFile("/api/import/profiles-json", "profileJsonInput", "profileImportStatus");
        await loadPeople();
        await loadImportSources();
      } catch (error) {
        $("profileImportStatus").textContent = `导入失败：${error.message}`;
      }
    }

    async function importEmployeeRosterExcel(event) {
      event.preventDefault();
      try {
        await uploadFiles("/api/import/employee-roster-excel", "employeeRosterExcelInput", "employeeRosterImportStatus");
        await loadPeople();
        await loadImportSources();
      } catch (error) {
        $("employeeRosterImportStatus").textContent = `导入失败：${error.message}`;
      }
    }

    function resetSelected() {
      const person = selectedPerson();
      if (!person) return;
      pushCalibrationHistory(person.employeeId);
      person.gridCurrent = Number(person.gridOriginal);
      person.aiAbilityCalibrated = person.aiAbilityOriginal;
      person.noGrowthWarningCalibrated = person.noGrowthWarningOriginal;
      person.noGrowthWarning = person.noGrowthWarningOriginal;
      person.adjustment = {};
      dirty = true;
      render();
    }

    function resetAll() {
      pushCalibrationHistory(people.map(person => person.employeeId));
      people.forEach(person => {
        person.gridCurrent = Number(person.gridOriginal);
        person.aiAbilityCalibrated = person.aiAbilityOriginal;
        person.noGrowthWarningCalibrated = person.noGrowthWarningOriginal;
        person.noGrowthWarning = person.noGrowthWarningOriginal;
        person.adjustment = {};
      });
      dirty = true;
      render();
    }

    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", () => switchPage(item.dataset.page));
    });
