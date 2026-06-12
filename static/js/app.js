    const gridDefs = [
      { id: 6, name: "熟练员工", perf: "高", potential: "低", band: "blue", ratio: 10, hint: "技术专家或有稳定资源的人才。给予认可，承担导师，可用轮岗保持积极性。" },
      { id: 8, name: "绩效之星", perf: "高", potential: "中", band: "orange", ratio: 10, hint: "有闪光点也有短板的人才。重点投入资源，给予历练机会。" },
      { id: 9, name: "超级明星", perf: "高", potential: "高", band: "orange", ratio: 5, hint: "能干大事的人。重点投入资源，给挑战性任务和机会，激发进一步成长。" },
      { id: 3, name: "基本胜任", perf: "中", potential: "低", band: "green", ratio: 10, hint: "稳定执行的人才。设置绩效挑战目标，培养提升。" },
      { id: 5, name: "中坚力量", perf: "中", potential: "中", band: "blue", ratio: 30, hint: "大部分骨干人群。设置绩效挑战目标，差异化投入资源，向 6/8/9 迈进。" },
      { id: 7, name: "潜力之星", perf: "中", potential: "高", band: "orange", ratio: 10, hint: "受保护的冲锋者。重点投入资源，设置业务挑战目标，给机会和时间产出绩效。" },
      { id: 1, name: "问题员工", perf: "低", potential: "低", band: "green", ratio: 5, hint: "需要尽快处理的人才。考虑降级、转岗或淘汰。" },
      { id: 2, name: "差距员工", perf: "低", potential: "中", band: "green", ratio: 10, hint: "新人或执行力存在差距的人才。需要辅导改进，也可考虑调岗。" },
      { id: 4, name: "待发展者", perf: "低", potential: "高", band: "blue", ratio: 10, hint: "有潜质但产出不足的人才。给时间和机会产出绩效，或放到合适岗位。" }
    ];

    const levelWeight = { M6: 12, M5: 11, P10: 10, M4: 9.5, P9: 9, M3: 8.5, P8: 8, M2: 7.5, P7: 7, P6: 6, P5: 5, P4: 4 };
    const aiAbilityOptions = ["AI KOL", "AI潜力股", "AI待提升者", "AI无成长者"];
    let people = [];
    let selectedId = null;
    let profileExpanded = false;
    const expandedDepartments = new Set();
    let dirty = false;
    let aiChatHistory = [];
    let querySelectedId = null;
    let talentPools = [];
    let editingTalentPoolName = "";
    let generatedReports = [];
    let agentCenterProjects = [];
    let currentReportId = "";
    let currentReportDetail = null;
    let currentReportView = "md";
    let reportSearchText = "";
    const calibrationHistory = [];
    const calibrationFuture = [];
    const calibrationHistoryLimit = 80;
    const expandedManagers = new Set();
    const filters = {
      group: new Set(),
      department: new Set(),
      level: new Set(),
      sequence: new Set(),
      managerTeam: new Set(),
      growthWarning: new Set(),
      aiAbility: new Set(),
      talentPool: new Set(),
      supervisorAdjusted: new Set(),
      calibrationDiff: new Set()
    };

    const $ = id => document.getElementById(id);
    const HOME_AI_QUESTION_COUNT_KEY = "hrobot.aiQuestionCount";
    const HOME_MEMO_RECORDS_KEY = "hrobot.homeMemoRecords";
    const AI_CHAT_QUESTION_HISTORY_KEY = "hrobot.aiQuestionHistory";
    const AI_CHAT_QUESTION_HISTORY_LIMIT = 12;
    let homeMemoRecords = [];
    const formatCount = value => new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
    const setHomeCount = (id, value) => {
      const target = $(id);
      if (target) target.textContent = formatCount(value);
    };
    const renderHomeLatestReport = reports => {
      const title = $("homeLatestReportTitle");
      const meta = $("homeLatestReportMeta");
      const latest = Array.isArray(reports) && reports.length ? reports[0] : null;
      if (!title || !meta) return;
      if (!latest) {
        title.textContent = "还没有生成报告";
        meta.textContent = "导入 skill 和分析材料后，可以在这里继续查看最近产出。";
        return;
      }
      title.textContent = latest.title || latest.reportTypeName || "已生成报告";
      meta.textContent = [latest.reportTypeName, formatFileTime(latest.updatedAt || "")].filter(Boolean).join(" · ") || "最近生成";
    };
    const readLocalCount = key => Number(localStorage.getItem(key) || "0") || 0;
    const incrementLocalCount = key => {
      const next = readLocalCount(key) + 1;
      localStorage.setItem(key, String(next));
      return next;
    };
    async function refreshHomeUsageStats() {
      renderHomeMemo();
      setHomeCount("homeAiQuestionCount", readLocalCount(HOME_AI_QUESTION_COUNT_KEY));
      try {
        const [reportsResponse, postersResponse] = await Promise.all([
          fetch("/api/report/latest?list=1"),
          fetch("/api/design/posters")
        ]);
        const reportsPayload = await reportsResponse.json();
        const postersPayload = await postersResponse.json();
        const reports = Array.isArray(reportsPayload.reports) ? reportsPayload.reports : [];
        setHomeCount("homeReportCount", reports.length);
        renderHomeLatestReport(reports);
        setHomeCount("homePosterCount", Array.isArray(postersPayload.items) ? postersPayload.items.length : 0);
      } catch (error) {
        // 首页指标不能阻断主工作流，失败时保留当前可用数字。
      }
    }
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

    const todayDateString = () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const formatMemoDate = value => {
      if (!value) return "今天";
      const [year, month, day] = String(value).split("-");
      return year && month && day ? `${year}/${month}/${day}` : value;
    };

    function readLegacyHomeMemoRecords() {
      try {
        const records = JSON.parse(localStorage.getItem(HOME_MEMO_RECORDS_KEY) || "[]");
        return Array.isArray(records)
          ? records
              .filter(item => item?.date && item?.text)
              .map(item => ({ date: String(item.date), text: String(item.text).trim() }))
          : [];
      } catch (error) {
        return [];
      }
    }

    function setHomeMemoRecords(records) {
      homeMemoRecords = Array.isArray(records)
        ? records
            .filter(item => item?.date && item?.text)
            .map(item => ({ date: String(item.date), text: String(item.text).trim() }))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        : [];
      return homeMemoRecords;
    }

    function selectHomeMemoRecord(records) {
      const today = todayDateString();
      const exact = records.find(item => item.date === today);
      if (exact) return { ...exact, source: "来自今日备忘" };
      const upcoming = records.filter(item => item.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (upcoming) return { ...upcoming, source: "来自最近待办" };
      const latest = records.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
      return latest ? { ...latest, source: "来自最近备忘" } : null;
    }

    function renderHomeMemo() {
      const record = selectHomeMemoRecord(homeMemoRecords);
      const date = $("homeMemoDate");
      const title = $("homeMemoTitle");
      const body = $("homeMemoBody");
      const source = $("homeMemoSource");
      if (!date || !title || !body || !source) return;
      if (!record) {
        date.textContent = formatMemoDate(todayDateString());
        title.textContent = "先确认校准差异人员，再用 AI 问答收敛报告主线。";
        body.textContent = "可以在 09 设置里维护备忘日期和记录；后续自动化方案也可以接入这里，作为首页提醒入口。";
        source.textContent = "来自首页默认提醒";
        return;
      }
      date.textContent = formatMemoDate(record.date);
      title.textContent = record.text;
      body.textContent = record.date === todayDateString()
        ? "今天也要加油干活，把这条备忘稳稳推进。"
        : "当前没有今日备忘，首页自动显示最近一条可用记录。";
      source.textContent = record.source;
    }

    function renderHomeMemoSettings() {
      const list = $("homeMemoRecordList");
      if ($("homeMemoDateInput") && !$("homeMemoDateInput").value) $("homeMemoDateInput").value = todayDateString();
      renderHomeMemo();
      if (!list) return;
      if (!homeMemoRecords.length) {
        list.innerHTML = `<div class="empty-report">暂无备忘记录。选择日期并保存一条备忘后，会显示在首页“今日备忘”。</div>`;
        return;
      }
      list.innerHTML = homeMemoRecords
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(item => `
          <div class="memo-record-item" data-memo-date="${escapeHtml(item.date)}">
            <span class="memo-record-date">${escapeHtml(formatMemoDate(item.date))}</span>
            <span class="memo-record-text">${escapeHtml(item.text)}</span>
            <button class="memo-record-delete" type="button" data-memo-delete="${escapeHtml(item.date)}">删除</button>
          </div>
        `).join("");
    }

    async function loadHomeMemos() {
      const response = await fetch("/api/home-memos");
      let payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "备忘加载失败");
      const remoteRecords = Array.isArray(payload.records) ? payload.records : [];
      const legacyRecords = readLegacyHomeMemoRecords();
      if (!remoteRecords.length && legacyRecords.length) {
        const migrateResponse = await fetch("/api/home-memos/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: legacyRecords })
        });
        payload = await migrateResponse.json();
        if (!migrateResponse.ok || payload.error) throw new Error(payload.error || "备忘迁移失败");
        localStorage.removeItem(HOME_MEMO_RECORDS_KEY);
      }
      setHomeMemoRecords(payload.records || []);
      renderHomeMemoSettings();
      return payload;
    }

    async function saveHomeMemo(event) {
      event.preventDefault();
      const date = $("homeMemoDateInput").value || todayDateString();
      const text = $("homeMemoTextInput").value.trim();
      const status = $("homeMemoStatus");
      if (!text) {
        if (status) status.textContent = "请先填写备忘记录。";
        return;
      }
      try {
        const response = await fetch("/api/home-memos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, text })
        });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "备忘保存失败");
        setHomeMemoRecords(payload.records || []);
        if (status) status.textContent = "备忘已保存，并同步到首页。";
        renderHomeMemoSettings();
      } catch (error) {
        if (status) status.textContent = `备忘保存失败：${error.message}`;
      }
    }

    async function deleteHomeMemo(date) {
      const response = await fetch("/api/home-memos/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "备忘删除失败");
      setHomeMemoRecords(payload.records || []);
      if ($("homeMemoStatus")) $("homeMemoStatus").textContent = "备忘已删除。";
      renderHomeMemoSettings();
    }

    function renderDesignReferenceFiles(config) {
      const list = $("designReferenceFileList");
      if (!list) return;
      const files = Array.isArray(config?.referenceFiles) ? config.referenceFiles : [];
      if (!files.length) {
        list.innerHTML = `<div class="empty-report">参考素材目录当前为空。把 logo、吉祥物或模板图放进目录后，这里会显示文件名。</div>`;
        return;
      }
      list.innerHTML = files.map(item => `
        <div class="memo-record-item">
          <span class="memo-record-date">${escapeHtml(item.name || "")}</span>
          <span class="memo-record-text">${escapeHtml(item.path || "")}</span>
        </div>
      `).join("");
    }

    async function loadDesignPromptConfig() {
      const response = await fetch("/api/design/prompt-config");
      const config = await response.json();
      if (!response.ok || config.error) throw new Error(config.error || "设计配置加载失败");
      $("designPromptBaseInput").value = config.basePrompt || "";
      $("designPromptBrandInput").value = config.brandRequirements || "";
      $("designPromptCustomInput").value = config.customRequirements || "";
      $("designPromptReferenceInput").value = config.referenceInstructions || "";
      $("designPromptTemplateInput").value = config.template || "";
      $("designPromptConfigPath").textContent = config.configPath || "data/design_center/poster_prompt_config.json";
      $("designReferenceFolder").textContent = config.referenceFolder || "data/design_center/references";
      renderDesignReferenceFiles(config);
      return config;
    }

    async function refreshDesignPromptConfig() {
      const status = $("designPromptConfigStatus");
      try {
        await loadDesignPromptConfig();
        if (status) status.textContent = "参考素材列表已刷新。";
      } catch (error) {
        if (status) status.textContent = `参考素材刷新失败：${error.message}`;
      }
    }

    async function saveDesignPromptConfig(event) {
      event.preventDefault();
      const status = $("designPromptConfigStatus");
      try {
        const response = await fetch("/api/design/prompt-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            basePrompt: $("designPromptBaseInput").value.trim(),
            brandRequirements: $("designPromptBrandInput").value.trim(),
            customRequirements: $("designPromptCustomInput").value.trim(),
            referenceInstructions: $("designPromptReferenceInput").value.trim(),
            template: $("designPromptTemplateInput").value.trim()
          })
        });
        const config = await response.json();
        if (!response.ok || config.error) throw new Error(config.error || "设计配置保存失败");
        if (status) status.textContent = "设计中心提示词配置已保存。";
        renderDesignReferenceFiles(config);
        $("designPromptConfigPath").textContent = config.configPath || $("designPromptConfigPath").textContent;
        $("designReferenceFolder").textContent = config.referenceFolder || $("designReferenceFolder").textContent;
      } catch (error) {
        if (status) status.textContent = `设计配置保存失败：${error.message}`;
      }
    }

    function renderAgentProjectCard(project) {
      const runtimeLabel = project.runtime === "python-server" ? "独立端口运行" : "静态页面";
      const description = project.description
        || (project.runtime === "python-server" ? "带独立后端的数据型 Web 功能，点击后启动自己的本地服务。" : "独立打包的前端页面，点击后直接打开正式功能。");
      const fileText = `${Number(project.fileCount) || 0} 个文件`;
      return `
        <article class="agent-project-card" data-agent-project-open="${escapeHtml(project.id || "")}" data-agent-project-id="${escapeHtml(project.id || "")}" title="打开正式页面">
          <button class="agent-project-delete" type="button" data-agent-project-delete="${escapeHtml(project.id || "")}" title="删除">×</button>
          <div class="agent-project-kicker">${escapeHtml(runtimeLabel)}</div>
          <h3>${escapeHtml(project.name || "未命名 Web 项目")}</h3>
          <p class="agent-project-desc">${escapeHtml(description)}</p>
          <div class="agent-project-meta">
            <span>${escapeHtml(fileText)}</span>
            <span>${escapeHtml(formatFileSize(project.size || 0))}</span>
          </div>
          <div class="agent-project-openline"><span>打开功能</span><span aria-hidden="true">→</span></div>
        </article>
      `;
    }

    function renderAgentProjectAddCard() {
      return `
        <button class="agent-project-card agent-project-add" type="button" id="agentProjectDropCard" data-agent-project-add>
          <span class="agent-project-plus">+</span>
          <span>拖入 zip 或点击上传</span>
        </button>
      `;
    }

    function renderAgentProjects(payload = {}) {
      agentCenterProjects = Array.isArray(payload.projects) ? payload.projects : agentCenterProjects;
      const totalFiles = agentCenterProjects.reduce((sum, item) => sum + (Number(item.fileCount) || 0), 0);
      const totalSize = agentCenterProjects.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
      if ($("agentProjectListCount")) $("agentProjectListCount").textContent = `${agentCenterProjects.length} 个`;
      if ($("agentProjectGrid")) {
        $("agentProjectGrid").innerHTML = `${agentCenterProjects.map(renderAgentProjectCard).join("")}${renderAgentProjectAddCard()}`;
      }
    }

    async function loadAgentProjects() {
      const response = await fetch("/api/agent-projects");
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Agent 中心加载失败");
      renderAgentProjects(payload);
      if ($("agentProjectStatus")) $("agentProjectStatus").textContent = payload.updatedAt ? `最后更新：${formatFileTime(payload.updatedAt)}` : "等待上传或投放 zip。";
      return payload;
    }

    async function uploadAgentProjectFile(file) {
      const status = $("agentProjectStatus");
      if (!file) {
        status.textContent = "请先选择项目 zip。";
        return;
      }
      if (!file.name.toLowerCase().endsWith(".zip")) {
        status.textContent = "只支持 zip 文件。";
        return;
      }
      status.textContent = "正在导入 zip 并生成卡片...";
      const form = new FormData();
      form.append("file", file);
      try {
        const response = await fetch("/api/agent-projects/upload", { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "项目导入失败");
        if ($("agentProjectZipInput")) $("agentProjectZipInput").value = "";
        renderAgentProjects(payload);
        status.textContent = "项目已导入。";
      } catch (error) {
        status.textContent = `项目导入失败：${error.message}`;
      }
    }

    async function openAgentProject(projectId) {
      const status = $("agentProjectStatus");
      if (status) status.textContent = "正在打开独立项目...";
      const blankWindow = window.open("about:blank", "_blank");
      if (blankWindow) {
        blankWindow.document.title = "正在打开项目";
        blankWindow.document.body.style.cssText = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Arial,sans-serif;margin:32px;color:#222;";
        blankWindow.document.body.textContent = "正在启动独立项目...";
      }
      try {
        const response = await fetch("/api/agent-projects/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: projectId })
        });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "项目打开失败");
        if (blankWindow) {
          blankWindow.opener = null;
          blankWindow.location.href = payload.url;
        } else {
          window.open(payload.url, "_blank", "noopener");
        }
        if (status) {
          status.textContent = payload.port ? `项目已在独立端口 ${payload.port} 打开。` : "项目已打开。";
        }
      } catch (error) {
        if (blankWindow) blankWindow.close();
        if (status) status.textContent = `项目打开失败：${error.message}`;
      }
    }

    async function deleteAgentProject(projectId) {
      const status = $("agentProjectStatus");
      status.textContent = "正在删除项目文件...";
      try {
        const response = await fetch("/api/agent-projects/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: projectId })
        });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "项目删除失败");
        renderAgentProjects(payload);
        status.textContent = "项目文件、文件夹和记录已删除。";
      } catch (error) {
        status.textContent = `项目删除失败：${error.message}`;
      }
    }

    function switchPage(page) {
      document.querySelectorAll(".report-page").forEach(panel => {
        panel.classList.toggle("active", panel.id === `page-${page}`);
      });
      document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.page === String(page));
      });
      const content = document.querySelector(".content");
      if (content) {
        content.scrollTop = 0;
        content.scrollLeft = 0;
      }
      window.scrollTo(0, 0);
      if (String(page) === "7") {
        loadIntelligence().catch(error => $("intelligenceStatus").textContent = `加载失败：${error.message}`);
      }
      if (String(page) === "8") loadPosterHistory().catch(error => $("designGenerateStatus").textContent = `历史加载失败：${error.message}`);
      if (String(page) === "10") loadAgentProjects().catch(error => $("agentProjectStatus").textContent = `Agent 中心加载失败：${error.message}`);
      if (String(page) === "9") loadHomeMemos().catch(error => $("homeMemoStatus").textContent = `备忘加载失败：${error.message}`);
      if (String(page) === "9") loadDesignPromptConfig().catch(error => $("designPromptConfigStatus").textContent = `设计配置加载失败：${error.message}`);
      if (String(page) === "9") loadIntelligenceConfig().catch(error => $("intelligenceConfigStatus").textContent = `情报配置加载失败：${error.message}`);
      if (String(page) === "9") loadServerStatus().catch(() => {});
      if (String(page) === "9") loadAiConfig().catch(error => {
        $("multimodalConfigStatus").textContent = `配置加载失败：${error.message}`;
      });
    }

    function toggleSidebar() {
      const collapsed = $("shell").classList.toggle("sidebar-collapsed");
      const label = collapsed ? "展开导航" : "收起";
      $("sidebarToggle").title = collapsed ? "显示导航栏" : "隐藏导航栏";
      $("sidebarToggle").setAttribute("aria-label", collapsed ? "显示导航栏" : "隐藏导航栏");
      $("sidebarToggle").querySelector(".sidebar-toggle-label").textContent = label;
    }

    function unique(values) {
      return [...new Set(values.filter(Boolean))];
    }

    function appendAiMessage(role, content) {
      const log = $("aiChatLog");
      if (!log) return;
      const label = role === "user" ? "你" : "AI 分析助手";
      log.insertAdjacentHTML("beforeend", `
        <article class="chat-message ${role}">
          <div class="chat-role">${label}</div>
          <div class="chat-bubble">${escapeHtml(content)}</div>
        </article>
      `);
      log.scrollTop = log.scrollHeight;
    }

    async function loadAiConfig() {
      const response = await fetch("/api/ai/config");
      const config = await response.json();
      const multimodal = config.multimodal || {};
      const image = config.image || {};
      if ($("aiBaseUrl")) $("aiBaseUrl").value = multimodal.baseUrl || "https://api.openai.com/v1";
      if ($("aiModel")) $("aiModel").value = multimodal.model || "";
      if ($("aiApiKey")) $("aiApiKey").placeholder = multimodal.configured ? "已保存，留空不覆盖" : "请输入 API Key";
      if ($("settingsMultimodalBaseUrl")) $("settingsMultimodalBaseUrl").value = multimodal.baseUrl || "https://api.openai.com/v1";
      if ($("settingsMultimodalModel")) $("settingsMultimodalModel").value = multimodal.model || "";
      if ($("settingsMultimodalApiKey")) $("settingsMultimodalApiKey").placeholder = multimodal.configured ? "已保存，留空不覆盖" : "请输入 API Key";
      if ($("settingsImageBaseUrl")) $("settingsImageBaseUrl").value = image.baseUrl || "https://api.openai.com/v1";
      if ($("settingsImageModel")) $("settingsImageModel").value = image.model || "";
      if ($("settingsImageApiKey")) $("settingsImageApiKey").placeholder = image.configured ? "已保存，留空不覆盖" : "请输入 Image API Key";
    }

    function setServerStatusDisplay(payload = {}, state = "checking", message = "") {
      const connected = state === "connected" || payload.connected;
      const offline = state === "offline";
      const pill = $("serverStatusPill");
      if (pill) {
        pill.classList.toggle("is-connected", connected && !offline);
        pill.classList.toggle("is-offline", offline);
        pill.classList.toggle("is-checking", !connected && !offline);
        pill.textContent = connected && !offline ? "已连接" : offline ? "断线" : "检测中";
      }
      if ($("serverStatusText")) $("serverStatusText").textContent = connected && !offline ? "已连接" : offline ? "断线" : "检测中";
      if ($("serverStatusPort")) $("serverStatusPort").textContent = payload.port ? `${payload.host || "127.0.0.1"}:${payload.port}` : "-";
      if ($("serverStatusPid")) $("serverStatusPid").textContent = payload.pid || "-";
      if ($("serverStatusStartedAt")) $("serverStatusStartedAt").textContent = formatFileTime(payload.startedAt || "");
      if ($("serverStatusMessage")) {
        $("serverStatusMessage").textContent = message || (connected && !offline
          ? `最后检查：${formatFileTime(payload.checkedAt || "")}`
          : offline
            ? "服务器当前不可达，请确认本地服务是否运行。"
            : "正在检查服务器连接。");
      }
    }

    async function loadServerStatus(options = {}) {
      setServerStatusDisplay({}, "checking", options.message || "正在检查服务器连接。");
      try {
        const response = await fetch(`/api/server/status?t=${Date.now()}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "状态检查失败");
        setServerStatusDisplay(payload, "connected");
        return payload;
      } catch (error) {
        setServerStatusDisplay({}, "offline", `断线：${error.message}`);
        throw error;
      }
    }

    async function waitForServerReconnect(deadlineMs = 15000) {
      const started = Date.now();
      while (Date.now() - started < deadlineMs) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return await loadServerStatus({ message: "正在等待服务器恢复连接..." });
        } catch (error) {
          // 继续等待服务重启完成。
        }
      }
      throw new Error("重启后仍未连接，请手动刷新页面或检查终端。");
    }

    async function restartServer() {
      const button = $("restartServerBtn");
      if (!confirm("确定重启本地服务器吗？页面会短暂断线，稍后自动恢复。")) return;
      if (button) button.disabled = true;
      setServerStatusDisplay({}, "checking", "正在发送重启命令...");
      try {
        const response = await fetch("/api/server/restart", { method: "POST" });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "重启命令失败");
        setServerStatusDisplay(payload, "checking", payload.message || "服务器正在重启，请稍候...");
        await waitForServerReconnect();
      } catch (error) {
        setServerStatusDisplay({}, "offline", `重启失败：${error.message}`);
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function saveAiConfig(event) {
      event.preventDefault();
      const payload = {
        multimodal: {
          baseUrl: $("aiBaseUrl").value.trim(),
          model: $("aiModel").value.trim()
        }
      };
      if ($("aiApiKey").value.trim()) payload.multimodal.apiKey = $("aiApiKey").value.trim();
      const response = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const config = await response.json();
      const multimodal = config.multimodal || {};
      $("aiApiKey").value = "";
      $("aiApiKey").placeholder = multimodal.configured ? "已保存，留空不覆盖" : "请输入 API Key";
      await loadAiConfig();
      appendAiMessage("assistant", multimodal.configured ? "模型配置已保存，可以开始分析。" : "配置未完整，请补充 API Key、Base URL 和模型名称。");
    }

    async function saveSettingsConfig(kind, event) {
      event.preventDefault();
      const isImage = kind === "image";
      const baseId = isImage ? "settingsImageBaseUrl" : "settingsMultimodalBaseUrl";
      const modelId = isImage ? "settingsImageModel" : "settingsMultimodalModel";
      const keyId = isImage ? "settingsImageApiKey" : "settingsMultimodalApiKey";
      const statusId = isImage ? "imageConfigStatus" : "multimodalConfigStatus";
      const group = {
        baseUrl: $(baseId).value.trim(),
        model: $(modelId).value.trim()
      };
      if ($(keyId).value.trim()) group.apiKey = $(keyId).value.trim();
      const response = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kind]: group })
      });
      const payload = await response.json();
      $(keyId).value = "";
      await loadAiConfig();
      const status = payload[kind] || {};
      $(statusId).textContent = status.configured ? "已保存，本组配置完整。" : "已保存，但配置未完整。";
    }

    async function testImageConfig() {
      const status = $("imageConfigStatus");
      status.textContent = "正在测试图像生成模型...";
      const response = await fetch("/api/ai/image/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "HRobot poster test", size: "1024x1024" })
      });
      const payload = await response.json();
      status.textContent = response.ok && payload.hasImage ? "测试成功，模型已返回图片。" : (payload.message || payload.error || "测试失败。");
    }

    let activeIntelligenceChannel = "";
    let intelligenceItems = [];

    function intelligenceCard(item) {
      const keywords = Array.isArray(item.keywords) ? item.keywords.slice(0, 3) : [];
      const sourceUrl = item.source_url || item.url || "";
      const link = sourceUrl ? `<a class="news-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">查看来源</a>` : "";
      return `
        <article class="news-card">
          <div class="news-card-topline">
            <span class="news-source">${escapeHtml(item.source || "未知来源")}</span>
            <span class="news-date">${escapeHtml(item.published_at || "")}</span>
          </div>
          <h3>${escapeHtml(item.title || "未命名情报")}</h3>
          <p class="news-summary">${escapeHtml(item.summary || item.hrbp_takeaway || "暂无摘要")}</p>
          ${item.hrbp_takeaway ? `<div class="hrbp-takeaway"><strong>HRBP 提醒</strong><span>${escapeHtml(item.hrbp_takeaway)}</span></div>` : ""}
          <div class="news-footer">
            <div class="news-keywords">
              ${keywords.map(keyword => `<span class="news-keyword">${escapeHtml(keyword)}</span>`).join("")}
            </div>
            ${link}
          </div>
        </article>
      `;
    }

    function renderIntelligence() {
      const search = ($("intelligenceSearch")?.value || "").trim().toLowerCase();
      const filtered = intelligenceItems.filter(item => {
        if (activeIntelligenceChannel && item.channel !== activeIntelligenceChannel) return false;
        if (!search) return true;
        return [item.title, item.summary, item.hrbp_takeaway, item.source, ...(item.keywords || [])]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });
      const aiHr = filtered.filter(item => item.channel === "ai_hr");
      const gameOrg = filtered.filter(item => item.channel === "game_org");
      $("aiHrIntelligenceCount").textContent = `${aiHr.length} 条`;
      $("gameOrgIntelligenceCount").textContent = `${gameOrg.length} 条`;
      $("aiHrIntelligenceList").innerHTML = aiHr.length ? aiHr.map(intelligenceCard).join("") : `<div class="empty-report">暂无 AI × HR 情报</div>`;
      $("gameOrgIntelligenceList").innerHTML = gameOrg.length ? gameOrg.map(intelligenceCard).join("") : `<div class="empty-report">暂无游戏组织情报</div>`;
    }

    async function loadIntelligence(options = {}) {
      const params = new URLSearchParams();
      if (options.date) params.set("date", options.date);
      if (options.history) params.set("history", "1");
      const response = await fetch(params.toString() ? `/api/intelligence?${params.toString()}` : "/api/intelligence");
      const payload = await response.json();
      intelligenceItems = Array.isArray(payload.items) ? payload.items : [];
      $("intelligenceStatus").textContent = payload.updated_at ? `最后更新：${formatFileTime(payload.updated_at)} · ${payload.count} 条` : `${payload.count || 0} 条`;
      renderIntelligence();
    }

    function renderIntelligenceConfig(payload) {
      const config = payload.config || {};
      const status = payload.status || {};
      if ($("intelligenceAutoEnabled")) $("intelligenceAutoEnabled").value = String(config.autoEnabled !== false);
      if ($("intelligenceRunAt")) $("intelligenceRunAt").value = config.runAt || "10:00";
      if ($("intelligenceChannelConfig")) $("intelligenceChannelConfig").value = config.channel || "all";
      if ($("intelligenceSourceConfig")) $("intelligenceSourceConfig").value = config.source || "all";
      if ($("intelligenceMaxPerQuery")) $("intelligenceMaxPerQuery").value = config.maxPerQuery || 3;
      if ($("intelligenceWechatLimit")) $("intelligenceWechatLimit").value = config.wechatFulltextLimit ?? 1;
      if ($("intelligenceAllowUnverifiedWechat")) $("intelligenceAllowUnverifiedWechat").checked = Boolean(config.allowUnverifiedWechat);
      const statusText = status.running
        ? "更新中..."
        : status.lastFinishedAt
          ? `上次${status.lastTrigger === "auto" ? "自动" : "手动"}更新：${status.lastFinishedAt} · ${status.ok ? "成功" : "失败"}`
          : "每天按配置时间自动更新，也可手动更新。";
      if ($("intelligenceConfigStatus")) $("intelligenceConfigStatus").textContent = statusText;
    }

    async function loadIntelligenceConfig() {
      const response = await fetch("/api/intelligence/config");
      const payload = await response.json();
      renderIntelligenceConfig(payload);
    }

    async function saveIntelligenceConfig(event) {
      event.preventDefault();
      const payload = {
        autoEnabled: $("intelligenceAutoEnabled").value === "true",
        runAt: $("intelligenceRunAt").value || "10:00",
        channel: $("intelligenceChannelConfig").value,
        source: $("intelligenceSourceConfig").value,
        maxPerQuery: Number($("intelligenceMaxPerQuery").value || 3),
        wechatFulltextLimit: Number($("intelligenceWechatLimit").value || 1),
        allowUnverifiedWechat: $("intelligenceAllowUnverifiedWechat").checked
      };
      const response = await fetch("/api/intelligence/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      renderIntelligenceConfig(result);
      $("intelligenceConfigStatus").textContent = "配置已保存。";
    }

    async function updateIntelligenceNow() {
      const status = $("intelligenceConfigStatus");
      status.textContent = "正在更新情报，可能需要几十秒到几分钟...";
      const response = await fetch("/api/intelligence/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = await response.json();
      const message = payload.message || (payload.ok ? "更新完成。" : "更新失败。");
      status.textContent = message;
      if ($("intelligenceConfigStatus")) $("intelligenceConfigStatus").textContent = message;
      await loadIntelligence();
    }

    async function loadPosterHistory() {
      const response = await fetch("/api/design/posters");
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      setHomeCount("homePosterCount", items.length);
      $("posterHistoryGrid").innerHTML = items.length ? items.map(item => `
        <article class="poster-card">
          <button class="poster-thumb-button" type="button" data-poster-preview="${escapeHtml(item.imagePath)}" data-poster-title="${escapeHtml(item.posterType || "海报")}">
            <img src="${escapeHtml(item.imagePath)}" alt="海报缩略图" loading="lazy" onerror="this.classList.add('image-error'); this.alt='图片加载失败';">
          </button>
          <div>
            <h3>${escapeHtml(item.posterType || "海报")}</h3>
            <div class="poster-meta">
              <span>${escapeHtml(item.style || "")}</span>
              <span>${escapeHtml(item.size || "")}</span>
              <span>${escapeHtml((item.createdAt || "").slice(0, 19))}</span>
            </div>
            <div class="poster-actions">
              <button type="button" data-poster-preview="${escapeHtml(item.imagePath)}" data-poster-title="${escapeHtml(item.posterType || "海报")}">预览</button>
              <a href="${escapeHtml(item.imagePath)}" target="_blank" rel="noopener">打开原图</a>
            </div>
          </div>
        </article>
      `).join("") : `<div class="empty-report">暂无本地海报记录</div>`;
      bindPosterPreviewButtons();
    }

    function openPosterPreview(imagePath, title) {
      const dialog = $("posterPreviewDialog");
      const image = $("posterPreviewImage");
      const link = $("posterPreviewOpenLink");
      if (!dialog || !image || !link) return;
      $("posterPreviewTitle").textContent = title || "海报预览";
      image.src = imagePath;
      link.href = imagePath;
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        window.open(imagePath, "_blank", "noopener");
      }
    }

    function bindPosterPreviewButtons() {
      document.querySelectorAll("[data-poster-preview]").forEach(button => {
        button.addEventListener("click", () => openPosterPreview(button.dataset.posterPreview, button.dataset.posterTitle));
      });
    }

    async function generateDesignPoster(event) {
      event.preventDefault();
      const status = $("designGenerateStatus");
      const requirement = $("posterRequirement").value.trim();
      if (!requirement) {
        status.textContent = "请先填写海报需求描述。";
        return;
      }
      status.textContent = "正在生成海报，完成后会保存到本地历史...";
      const response = await fetch("/api/design/posters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posterType: $("posterType").value,
          style: $("posterStyle").value,
          size: $("posterSize").value,
          requirement
        })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        status.textContent = payload.message || payload.error || "生成失败。";
        return;
      }
      status.textContent = "海报已生成并保存到本地。";
      $("posterRequirement").value = "";
      await loadPosterHistory();
    }

    function readAiQuestionHistory() {
      try {
        const items = JSON.parse(localStorage.getItem(AI_CHAT_QUESTION_HISTORY_KEY) || "[]");
        return Array.isArray(items) ? items.filter(item => item && item.question).slice(0, AI_CHAT_QUESTION_HISTORY_LIMIT) : [];
      } catch (error) {
        return [];
      }
    }

    function writeAiQuestionHistory(items) {
      localStorage.setItem(AI_CHAT_QUESTION_HISTORY_KEY, JSON.stringify(items.slice(0, AI_CHAT_QUESTION_HISTORY_LIMIT)));
    }

    function formatQuestionHistoryTime(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    }

    function renderAiQuestionHistory() {
      const list = $("aiChatHistoryList");
      if (!list) return;
      const items = readAiQuestionHistory();
      if (!items.length) {
        list.innerHTML = `<div class="chat-history-empty">暂无历史问题</div>`;
        return;
      }
      list.innerHTML = items.map(item => `
        <button class="chat-history-item" type="button" data-ai-history-question="${escapeHtml(item.question)}">
          <span class="chat-history-question">${escapeHtml(item.question)}</span>
          <span class="chat-history-meta">${escapeHtml(formatQuestionHistoryTime(item.updatedAt))}</span>
        </button>
      `).join("");
    }

    function saveAiQuestionHistory(question) {
      const text = String(question || "").trim();
      if (!text) return;
      const items = readAiQuestionHistory().filter(item => item.question !== text);
      items.unshift({ question: text, updatedAt: new Date().toISOString() });
      writeAiQuestionHistory(items);
      renderAiQuestionHistory();
    }

    async function sendAiMessage(event) {
      event.preventDefault();
      const input = $("aiChatInput");
      if (!input) return;
      const message = input.value.trim();
      if (!message) return;
      input.value = "";
      saveAiQuestionHistory(message);
      appendAiMessage("user", message);
      aiChatHistory.push({ role: "user", content: message });
      appendAiMessage("assistant", "正在读取盘点结果和人才档案，并调用模型分析...");
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: aiChatHistory.slice(0, -1) })
      });
      const payload = await response.json();
      const waiting = $("aiChatLog").lastElementChild;
      if (waiting) waiting.remove();
      const reply = payload.message || payload.error || "没有收到模型回复。";
      appendAiMessage("assistant", reply);
      aiChatHistory.push({ role: "assistant", content: reply });
      if (response.ok && !payload.error) {
        setHomeCount("homeAiQuestionCount", incrementLocalCount(HOME_AI_QUESTION_COUNT_KEY));
      }
    }

    function reportMarkdownToHtml(content) {
      const lines = String(content || "").split(/\r?\n/);
      const html = [];
      let paragraph = [];
      const flush = () => {
        if (paragraph.length) {
          html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
          paragraph = [];
        }
      };
      lines.forEach(line => {
        const text = line.trim();
        if (!text) {
          flush();
          return;
        }
        if (text.startsWith("### ")) {
          flush();
          html.push(`<h3>${escapeHtml(text.slice(4))}</h3>`);
        } else if (text.startsWith("## ")) {
          flush();
          html.push(`<h2>${escapeHtml(text.slice(3))}</h2>`);
        } else if (text.startsWith("# ")) {
          flush();
          html.push(`<h2>${escapeHtml(text.slice(2))}</h2>`);
        } else if (/^[-*]\s+/.test(text)) {
          flush();
          html.push(`<p>• ${escapeHtml(text.replace(/^[-*]\s+/, ""))}</p>`);
        } else {
          paragraph.push(text);
        }
      });
      flush();
      return html.join("");
    }

    function normalizeReportHtml(content) {
      let html = String(content || "").trim();
      const fence = html.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
      if (fence) html = fence[1].trim();
      if (!/<!doctype\s+html|<html[\s>]/i.test(html)) {
        html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;margin:0;padding:32px;line-height:1.7;color:#1f2937;background:#fff}h1,h2,h3{color:#111827}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left}</style></head><body>${html}</body></html>`;
      }
      return html;
    }

    function updateReportFormatControls(report) {
      const mdBtn = $("reportMdBtn");
      const htmlBtn = $("reportHtmlBtn");
      const status = $("reportFormatStatus");
      const hasHtml = Boolean(report?.htmlContent || report?.hasHtml || report?.htmlPath || report?.contentFormat === "html");
      if (mdBtn) mdBtn.classList.toggle("active", currentReportView === "md");
      if (htmlBtn) {
        htmlBtn.classList.toggle("active", currentReportView === "html");
        htmlBtn.textContent = hasHtml ? "查看 HTML" : "生成 HTML";
      }
      if (status) {
        status.textContent = currentReportView === "html"
          ? (hasHtml ? "当前为 HTML 版本" : "尚未生成 HTML")
          : "当前为 MD 版本";
      }
    }

    function renderGeneratedReportDetail(report) {
      const target = $("generatedReportContent");
      if (!target) return;
      if (!report?.content) {
        target.innerHTML = `<div class="empty-report">没有找到这篇报告。</div>`;
        updateReportFormatControls(report);
        return;
      }
      updateReportFormatControls(report);
      const metaItems = [
        report.reportTypeName || "报告",
        `生成时间：${formatFileTime(report.updatedAt || "")}`,
        currentReportView === "html" && report.htmlGeneratedAt ? `HTML生成：${formatFileTime(report.htmlGeneratedAt)}` : ""
      ].filter(Boolean);
      const meta = `<div class="report-meta">${escapeHtml(metaItems.join(" · "))}</div>`;
      if (currentReportView === "html") {
        const htmlContent = report.htmlContent || (report.contentFormat === "html" ? report.content : "");
        if (!htmlContent) {
          target.innerHTML = `${meta}<div class="empty-report">这份报告还没有 HTML 版本，请点击上方“生成 HTML”。</div>`;
          return;
        }
        target.innerHTML = `${meta}<iframe class="generated-report-frame" title="${escapeHtml(report.title || "生成报告")}" sandbox="allow-same-origin"></iframe>`;
        target.querySelector("iframe").srcdoc = normalizeReportHtml(htmlContent);
        return;
      }
      const mdContent = report.mdContent || report.content || "";
      target.innerHTML = `${meta}<pre class="generated-report-md">${escapeHtml(mdContent)}</pre>`;
    }

    function reportSearchHaystack(report) {
      return [
        report.title,
        report.intro,
        report.reportTypeName,
        report.reportType,
        report.updatedAt
      ].filter(Boolean).join(" ").toLowerCase();
    }

    function filteredReportCards(reports) {
      const keyword = reportSearchText.trim().toLowerCase();
      if (!keyword) return reports;
      return reports.filter(report => reportSearchHaystack(report).includes(keyword));
    }

    function syncReportSearchInputs() {
      ["reportSearchInput", "reportSearchInputGenerate"].forEach(id => {
        const input = $(id);
        if (input && input.value !== reportSearchText) input.value = reportSearchText;
      });
    }

    function handleReportSearch(event) {
      reportSearchText = event.target.value;
      syncReportSearchInputs();
      renderReportLibrary("reportLibrary");
      renderReportLibrary("reportLibraryGenerate");
    }

    function reportCardHtml(report) {
      return `
        <article class="report-card" tabindex="0" role="button" data-report-id="${escapeHtml(report.id)}">
          <div class="report-card-head">
            <span class="report-type-pill">${escapeHtml(report.reportTypeName || "报告")}</span>
            <span class="report-card-time">${escapeHtml(formatFileTime(report.updatedAt || ""))}</span>
          </div>
          <h2>${escapeHtml(report.title || report.reportTypeName || "未命名报告")}</h2>
          <p>${escapeHtml(report.intro || "点击查看完整报告。")}</p>
        </article>
      `;
    }

    function bindReportCards(library) {
      library.querySelectorAll("[data-report-id]").forEach(button => {
        button.addEventListener("click", () => {
          if (button.closest("#reportLibraryGenerate")) switchPage(2);
          openGeneratedReport(button.dataset.reportId);
        });
        button.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (button.closest("#reportLibraryGenerate")) switchPage(2);
            openGeneratedReport(button.dataset.reportId);
          }
        });
      });
    }

    async function deleteGeneratedReport(reportId) {
      reportId = reportId || currentReportId;
      if (!reportId) return;
      const report = generatedReports.find(item => item.id === reportId);
      const title = report?.title || "这份报告";
      if (!confirm(`确定删除「${title}」吗？`)) return;
      const response = await fetch("/api/report", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reportId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "删除失败");
      if (currentReportId === reportId) {
        currentReportId = "";
        currentReportDetail = null;
        currentReportView = "md";
      }
      await loadGeneratedReport();
      const detail = $("generatedReport");
      if (detail && !detail.hidden && !currentReportId) detail.hidden = true;
    }

    function renderReportLibrary(targetId = "reportLibrary", options = {}) {
      const library = $(targetId);
      const detail = $("generatedReport");
      if (!library) return;
      const reports = filteredReportCards(generatedReports);
      if (targetId === "reportLibrary" && detail) detail.hidden = true;
      library.hidden = false;
      if (!reports.length) {
        library.innerHTML = `<div class="empty-report">${reportSearchText.trim() ? "没有匹配的报告。" : "暂无生成报告。请先到 05 报告生成选择预设并生成报告。"}</div>`;
        return;
      }
      library.innerHTML = reports.map(reportCardHtml).join("");
      bindReportCards(library);
    }

    async function loadGeneratedReport() {
      const response = await fetch("/api/report/latest?list=1");
      const payload = await response.json();
      generatedReports = payload.reports || [];
      setHomeCount("homeReportCount", generatedReports.length);
      renderHomeLatestReport(generatedReports);
      syncReportSearchInputs();
      renderReportLibrary("reportLibrary");
      renderReportLibrary("reportLibraryGenerate");
    }

    async function openGeneratedReport(reportId) {
      currentReportId = reportId || "";
      currentReportDetail = null;
      currentReportView = "md";
      const library = $("reportLibrary");
      const detail = $("generatedReport");
      const target = $("generatedReportContent");
      if (!detail || !target) return;
      if (library) library.hidden = true;
      detail.hidden = false;
      target.innerHTML = `<div class="report-meta">正在加载报告...</div>`;
      const response = await fetch(`/api/report/latest?id=${encodeURIComponent(currentReportId)}`);
      const report = await response.json();
      currentReportDetail = report;
      renderGeneratedReportDetail(currentReportDetail);
    }

    async function generateReportHtmlVersion() {
      if (!currentReportId) return;
      const status = $("reportFormatStatus");
      if (status) status.textContent = "正在生成 HTML...";
      const response = await fetch("/api/report/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentReportId })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        if (status) status.textContent = `生成失败：${payload.error || "未知错误"}`;
        return;
      }
      currentReportDetail = payload.report;
      currentReportView = "html";
      const index = generatedReports.findIndex(item => item.id === currentReportId);
      if (index >= 0) {
        generatedReports[index] = {
          ...generatedReports[index],
          hasHtml: true,
          htmlPath: currentReportDetail.htmlPath || generatedReports[index].htmlPath,
          htmlGeneratedAt: currentReportDetail.htmlGeneratedAt || generatedReports[index].htmlGeneratedAt
        };
      }
      renderGeneratedReportDetail(currentReportDetail);
    }

    function closeGeneratedReport() {
      currentReportId = "";
      currentReportDetail = null;
      currentReportView = "md";
      renderReportLibrary("reportLibrary");
      switchPage(5);
    }

    async function uploadFile(endpoint, fileInputId, statusId) {
      const input = $(fileInputId);
      const status = $(statusId);
      const file = input.files[0];
      if (!file) {
        status.textContent = "请先选择文件。";
        return null;
      }
      status.textContent = "正在导入...";
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "导入失败");
      }
      status.textContent = `导入成功：${payload.rows} 条数据`;
      input.value = "";
      return payload;
    }

    async function uploadFiles(endpoint, fileInputId, statusId) {
      const input = $(fileInputId);
      const status = $(statusId);
      const files = [...input.files];
      if (!files.length) {
        status.textContent = "请先选择文件。";
        return null;
      }
      status.textContent = "正在导入...";
      const form = new FormData();
      files.forEach(file => form.append("file", file));
      const response = await fetch(endpoint, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "导入失败");
      }
      status.textContent = `导入成功：${payload.rows} 条数据`;
      input.value = "";
      return payload;
    }

    const formatFileSize = size => {
      const value = Number(size) || 0;
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
      if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${value} B`;
    };

    const formatFileTime = value => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";

    function renderFileGroup(title, items) {
      const rows = (items || []).map(item => `
        <div class="asset-item">
          <strong>${escapeHtml(item.filename)}</strong>
          <span>${escapeHtml(formatFileSize(item.size))} · ${escapeHtml(formatFileTime(item.updatedAt))}</span>
        </div>
      `).join("") || `<div class="asset-item"><strong>暂无文件</strong><span>当前目录未扫描到已导入文件</span></div>`;
      return `<div class="asset-group"><h3>${escapeHtml(title)}</h3>${rows}</div>`;
    }

    function renderFileItems(items, deleteType = "") {
      return (items || []).map(item => `
        <div class="asset-item">
          <strong>${escapeHtml(item.filename)}</strong>
          <span class="asset-meta">
            <span>${escapeHtml(formatFileSize(item.size))} · ${escapeHtml(formatFileTime(item.updatedAt))}</span>
            ${deleteType ? `<button class="asset-delete" type="button" title="删除文件" data-file-delete="${escapeHtml(deleteType)}" data-filename="${escapeHtml(item.filename)}">删除</button>` : ""}
          </span>
        </div>
      `).join("") || `<div class="asset-item"><strong>暂无文件</strong><span>-</span></div>`;
    }

    async function deleteImportedFile(type, filename) {
      if (!confirm(`确定删除 ${filename} 吗？`)) return;
      const response = await fetch("/api/import/file", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, filename })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "删除失败");
      if (type.startsWith("report-")) {
        await loadReportAssets();
      } else {
        await loadImportSources();
      }
    }

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-file-delete]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      deleteImportedFile(button.dataset.fileDelete, button.dataset.filename).catch(error => {
        const status = button.dataset.fileDelete.startsWith("report-") ? $("reportGenerateStatus") : $("importSourceStatus");
        if (status) status.textContent = `删除失败：${error.message}`;
      });
    });

    async function loadImportSources() {
      const status = $("importSourceStatus");
      if (status) status.textContent = "正在扫描导入目录...";
      const response = await fetch("/api/import/sources");
      const payload = await response.json();
      if ($("reviewSourceList")) $("reviewSourceList").innerHTML = renderFileItems(payload.reviewResults || [], "review-result");
      if ($("profileSourceList")) $("profileSourceList").innerHTML = renderFileItems(payload.profiles || [], "profile");
      if ($("employeeRosterSourceList")) $("employeeRosterSourceList").innerHTML = renderFileItems(payload.employeeRoster || [], "employee-roster");
      const count = (payload.reviewResults || []).length + (payload.profiles || []).length + (payload.employeeRoster || []).length;
      if (status) status.textContent = `扫描完成：共 ${count} 个文件。`;
    }

    async function loadReportAssets() {
      const response = await fetch("/api/report/assets");
      const payload = await response.json();
      if ($("reportSkillAssetList")) $("reportSkillAssetList").innerHTML = renderFileItems(payload.skills || [], "report-skill");
      if ($("reportMaterialAssetList")) $("reportMaterialAssetList").innerHTML = renderFileItems(payload.materials || [], "report-material");
    }

    async function importReportSkill(event) {
      event.preventDefault();
      try {
        await uploadFile("/api/report/upload-skill", "skillFileInput", "skillImportStatus");
        await loadReportAssets();
      } catch (error) {
        $("skillImportStatus").textContent = `导入失败：${error.message}`;
      }
    }

    async function importReportMaterial(event) {
      event.preventDefault();
      try {
        await uploadFile("/api/report/upload-material", "materialFileInput", "materialImportStatus");
        await loadReportAssets();
      } catch (error) {
        $("materialImportStatus").textContent = `导入失败：${error.message}`;
      }
    }

    async function generateReport(event) {
      event.preventDefault();
      const status = $("reportGenerateStatus");
      status.textContent = "正在读取人才盘点、档案、skill 和分析材料，并调用模型生成 MD 报告...";
      const response = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: $("reportTypeInput").value,
          instruction: $("reportInstructionInput").value.trim()
        })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        status.textContent = `生成失败：${payload.error || "模型未返回内容"}`;
        return;
      }
      if (!payload.message) {
        status.textContent = payload.configured === false ? payload.message : "生成失败：模型未返回内容";
        return;
      }
      status.textContent = "MD 报告已生成，并已加入顶部报告卡片。";
      currentReportId = "";
      await loadGeneratedReport();
    }

    function selectReportType(type) {
      $("reportTypeInput").value = type;
      document.querySelectorAll("[data-report-type]").forEach(button => {
        button.classList.toggle("active", button.dataset.reportType === type);
      });
      const active = document.querySelector(`[data-report-type="${type}"]`);
      const settingFile = active?.dataset.settingFile || "";
      if ($("reportPresetStatus")) {
        $("reportPresetStatus").textContent = settingFile
          ? `当前优先读取：${settingFile}`
          : "当前优先读取：报告预设";
      }
    }

    document.querySelectorAll("[data-home-page]").forEach(item => {
      item.addEventListener("click", () => switchPage(item.dataset.homePage));
    });
    $("openTalentDataConfigBtn")?.addEventListener("click", () => switchPage(6));
    $("backToTalentReviewBtn")?.addEventListener("click", () => switchPage(3));
    document.addEventListener("click", event => {
      const pageButton = event.target.closest("[data-home-page]");
      if (!pageButton) return;
      event.preventDefault();
      switchPage(pageButton.dataset.homePage);
    });
    $("sidebarToggle").addEventListener("click", toggleSidebar);
    document.addEventListener("click", () => {
      document.querySelectorAll(".filter-field.open").forEach(field => field.classList.remove("open"));
    });
    $("workspace").addEventListener("click", event => {
      if (event.target.closest(".person, .side, .filters, .toolbar, button, select, textarea, input, label")) return;
      if (!profileExpanded) return;
      profileExpanded = false;
      render();
    });
    $("clearFilterBtn").addEventListener("click", () => {
      Object.values(filters).forEach(set => set.clear());
      bindFilterPanels();
      document.querySelectorAll(".filter-panel input[type='checkbox']").forEach(input => input.checked = false);
      updateFilterLabels();
      render();
    });
    $("reloadBtn").addEventListener("click", redoCalibrationStep);
    $("saveBtn").addEventListener("click", saveOverrides);
    $("exportBtn").addEventListener("click", exportChanges);
    $("resetSelectedBtn").addEventListener("click", undoCalibrationStep);
    $("resetAllBtn").addEventListener("click", resetAll);
    $("saveTalentPoolBtn").addEventListener("click", () => {
      upsertTalentPool().catch(error => {
        $("talentPoolStatus").textContent = `保存失败：${error.message}`;
      });
    });
    $("cancelTalentPoolEditBtn").addEventListener("click", () => {
      resetTalentPoolForm();
      $("talentPoolStatus").textContent = "已取消编辑。";
    });
    $("multimodalConfigForm").addEventListener("submit", event => saveSettingsConfig("multimodal", event));
    $("imageConfigForm").addEventListener("submit", event => saveSettingsConfig("image", event));
    $("testImageConfigBtn").addEventListener("click", testImageConfig);
    $("refreshServerStatusBtn").addEventListener("click", () => loadServerStatus().catch(() => {}));
    $("restartServerBtn").addEventListener("click", restartServer);
    $("designPromptConfigForm").addEventListener("submit", saveDesignPromptConfig);
    $("refreshDesignPromptConfigBtn").addEventListener("click", refreshDesignPromptConfig);
    $("agentProjectGrid").addEventListener("click", event => {
      const deleteButton = event.target.closest("[data-agent-project-delete]");
      const addButton = event.target.closest("[data-agent-project-add]");
      const projectCard = event.target.closest("[data-agent-project-open]");
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        deleteAgentProject(deleteButton.dataset.agentProjectDelete);
        return;
      }
      if (addButton) {
        $("agentProjectZipInput").click();
        return;
      }
      if (projectCard) {
        openAgentProject(projectCard.dataset.agentProjectOpen);
      }
    });
    $("agentProjectGrid").addEventListener("dragover", event => {
      const addButton = event.target.closest("[data-agent-project-add]");
      if (!addButton) return;
      event.preventDefault();
      addButton.classList.add("drag-over");
    });
    $("agentProjectGrid").addEventListener("dragleave", event => {
      const addButton = event.target.closest("[data-agent-project-add]");
      if (addButton) addButton.classList.remove("drag-over");
    });
    $("agentProjectGrid").addEventListener("drop", event => {
      const addButton = event.target.closest("[data-agent-project-add]");
      if (!addButton) return;
      event.preventDefault();
      addButton.classList.remove("drag-over");
      uploadAgentProjectFile(event.dataTransfer.files[0]);
    });
    $("agentProjectZipInput").addEventListener("change", () => {
      if ($("agentProjectZipInput").files[0]) uploadAgentProjectFile($("agentProjectZipInput").files[0]);
    });
    $("homeMemoForm").addEventListener("submit", saveHomeMemo);
    $("homeMemoRecordList").addEventListener("click", event => {
      const deleteButton = event.target.closest("[data-memo-delete]");
      if (deleteButton) {
        deleteHomeMemo(deleteButton.dataset.memoDelete).catch(error => {
          $("homeMemoStatus").textContent = `备忘删除失败：${error.message}`;
        });
        return;
      }
      const item = event.target.closest("[data-memo-date]");
      if (!item) return;
      const record = homeMemoRecords.find(entry => entry.date === item.dataset.memoDate);
      if (!record) return;
      $("homeMemoDateInput").value = record.date;
      $("homeMemoTextInput").value = record.text;
      $("homeMemoStatus").textContent = "已载入这条备忘，可编辑后保存。";
    });
    $("intelligenceSearch").addEventListener("input", renderIntelligence);
    $("intelligenceConfigForm").addEventListener("submit", saveIntelligenceConfig);
    $("intelligenceUpdateBtn").addEventListener("click", updateIntelligenceNow);
    $("intelligenceHistoryBtn").addEventListener("click", () => {
      const date = $("intelligenceDate").value;
      loadIntelligence(date ? { date, history: true } : { history: true }).catch(error => $("intelligenceStatus").textContent = `加载失败：${error.message}`);
    });
    $("intelligenceLatestBtn").addEventListener("click", () => loadIntelligence().catch(error => $("intelligenceStatus").textContent = `加载失败：${error.message}`));
    document.querySelectorAll("#intelligenceTabs button").forEach(button => {
      button.addEventListener("click", () => {
        activeIntelligenceChannel = button.dataset.channel || "";
        document.querySelectorAll("#intelligenceTabs button").forEach(item => item.classList.toggle("active", item === button));
        renderIntelligence();
      });
    });
    $("designPosterForm").addEventListener("submit", generateDesignPoster);
    $("refreshPosterHistoryBtn").addEventListener("click", () => loadPosterHistory().catch(error => $("designGenerateStatus").textContent = `历史加载失败：${error.message}`));
    $("posterPreviewCloseBtn").addEventListener("click", () => $("posterPreviewDialog").close());
    $("goSettingsFromDesign").addEventListener("click", () => switchPage(9));
    $("aiChatForm").addEventListener("submit", sendAiMessage);
    $("aiChatHistoryList").addEventListener("click", event => {
      const item = event.target.closest("[data-ai-history-question]");
      if (!item) return;
      const input = $("aiChatInput");
      input.value = item.dataset.aiHistoryQuestion || "";
      input.focus();
    });
    $("aiChatHistoryClear").addEventListener("click", () => {
      writeAiQuestionHistory([]);
      renderAiQuestionHistory();
      $("aiChatInput").focus();
    });
    $("skillImportForm").addEventListener("submit", importReportSkill);
    $("materialImportForm").addEventListener("submit", importReportMaterial);
    $("reportGenerateForm").addEventListener("submit", generateReport);
    document.querySelectorAll("[data-report-type]").forEach(button => {
      button.addEventListener("click", () => selectReportType(button.dataset.reportType));
    });
    $("reportBackBtn").addEventListener("click", closeGeneratedReport);
    $("reportMdBtn").addEventListener("click", () => {
      currentReportView = "md";
      renderGeneratedReportDetail(currentReportDetail);
    });
    $("reportHtmlBtn").addEventListener("click", () => {
      if (currentReportDetail?.htmlContent || currentReportDetail?.contentFormat === "html") {
        currentReportView = "html";
        renderGeneratedReportDetail(currentReportDetail);
      } else {
        generateReportHtmlVersion().catch(error => {
          const status = $("reportFormatStatus");
          if (status) status.textContent = `生成失败：${error.message}`;
        });
      }
    });
    $("reportDeleteBtn").addEventListener("click", () => {
      deleteGeneratedReport(currentReportId).catch(error => {
        const target = $("generatedReportContent");
        if (target) target.insertAdjacentHTML("afterbegin", `<div class="empty-report">删除失败：${escapeHtml(error.message)}</div>`);
      });
    });
    $("reportSearchInput").addEventListener("input", handleReportSearch);
    $("reportSearchInputGenerate").addEventListener("input", handleReportSearch);
    $("refreshReportAssetsBtn").addEventListener("click", () => loadReportAssets().catch(error => $("reportGenerateStatus").textContent = `刷新失败：${error.message}`));
    $("refreshReportAssetsInlineBtn").addEventListener("click", () => loadReportAssets().catch(error => $("reportGenerateStatus").textContent = `刷新失败：${error.message}`));
    $("reviewImportForm").addEventListener("submit", importReviewExcel);
    $("profileImportForm").addEventListener("submit", importProfilesJson);
    $("employeeRosterImportForm").addEventListener("submit", importEmployeeRosterExcel);
    $("refreshImportSourcesBtn").addEventListener("click", () => loadImportSources().catch(error => $("importSourceStatus").textContent = `扫描失败：${error.message}`));
    $("refreshImportSourcesInlineBtn").addEventListener("click", () => loadImportSources().catch(error => $("importSourceStatus").textContent = `扫描失败：${error.message}`));
    $("refreshImportSourcesProfilesBtn").addEventListener("click", () => loadImportSources().catch(error => $("importSourceStatus").textContent = `扫描失败：${error.message}`));
    $("refreshImportSourcesRosterBtn").addEventListener("click", () => loadImportSources().catch(error => $("employeeRosterImportStatus").textContent = `扫描失败：${error.message}`));
    loadHomeMemos().catch(error => {
      $("homeMemoStatus").textContent = `备忘加载失败：${error.message}`;
    });
    loadDesignPromptConfig().catch(error => {
      $("designPromptConfigStatus").textContent = `设计配置加载失败：${error.message}`;
    });
    loadAgentProjects().catch(error => {
      $("agentProjectStatus").textContent = `Agent 中心加载失败：${error.message}`;
    });
    refreshHomeUsageStats();
    renderAiQuestionHistory();
    loadAiConfig().catch(error => appendAiMessage("assistant", `AI 配置加载失败：${error.message}`));
    loadGeneratedReport().catch(() => {});
    loadReportAssets().catch(() => {});
    loadImportSources().catch(() => {});
    loadPeople().catch(error => {
      $("profile").innerHTML = `<div class="reason-note">加载失败：${error.message}</div>`;
    });
