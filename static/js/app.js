    const gridDefs = [
      { id: 6, name: "熟练员工", perf: "高", potential: "低", band: "blue", ratio: 10, hint: "技术专家或“有资源”的人才，绩效优秀，但潜力已接近天花板" },
      { id: 8, name: "绩效之星", perf: "高", potential: "中", band: "orange", ratio: 10, hint: "业务支柱，绩效稳定突出但潜力中等，是岗位专家型人才" },
      { id: 9, name: "超级明星", perf: "高", potential: "高", band: "orange", ratio: 5, hint: "组织最核心的人才，绩效突出且具备快速成长与晋升到更高层级的潜力" },
      { id: 3, name: "基本胜任", perf: "中", potential: "低", band: "green", ratio: 10, hint: "混日子、安于现状的人，胜任现职级，但成长空间有限" },
      { id: 5, name: "中坚力量", perf: "中", potential: "中", band: "blue", ratio: 30, hint: "稳定贡献者，大部分骨干人群，胜任现有岗位" },
      { id: 7, name: "潜力之星", perf: "中", potential: "高", band: "orange", ratio: 10, hint: "高潜培养对象，绩效良好，潜力突出" },
      { id: 1, name: "问题员工", perf: "低", potential: "低", band: "green", ratio: 5, hint: "问题员工，绩效与潜力低，无法胜任当前工作" },
      { id: 2, name: "差距员工", perf: "低", potential: "中", band: "green", ratio: 10, hint: "新人/小聪明、执行力差的人，潜力一般，绩效低于预期" },
      { id: 4, name: "待发展者", perf: "低", potential: "高", band: "blue", ratio: 10, hint: "有个性的新人/不投入的老人，有高成长空间，但潜力还未转化为绩效" }
    ];

    const levelWeight = { M6: 12, M5: 11, P10: 10, M4: 9.5, P9: 9, M3: 8.5, P8: 8, M2: 7.5, P7: 7, P6: 6, P5: 5, P4: 4 };
    const aiAbilityOptions = ["AI KOL", "AI潜力股", "AI待提升者", "AI无成长者"];
    let people = [];
    let selectedId = null;
    let profileExpanded = false;
    const expandedDepartments = new Set();
    let dirty = false;
    let aiChatHistory = [];
    let aiProfileCards = [];
    let activeAiProfileId = "";
    let aiProfileExpanded = false;
    let querySelectedId = null;
    let talentPools = [];
    let profileNotes = {};
    let editingTalentPoolName = "";
    let generatedReports = [];
    let agentCenterProjects = [];
    let latestAppUpdatePayload = null;
    let currentReportId = "";
    let currentReportDetail = null;
    let currentReportView = "md";
    let reportSearchText = "";
    const selectedReportAssets = {
      skills: new Set(),
      materials: new Set()
    };
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
    const builtInAgentProjects = [
      {
        id: "builtin-talent-report-2026",
        name: "2026人才盘点汇报",
        description: "内置盘点汇报工具，集中查看总览、干部、关键岗位、校招生、汰换待提升与人才策略。",
        runtime: "builtin",
        builtIn: true,
        fileCount: 1,
        size: 0,
        analysis: {
          runtimeLabel: "内置工具",
          confidence: 1,
          source: "builtin"
        },
        environment: {
          canOpen: true,
          label: "本机可打开",
          message: "点击后在当前工作台打开。"
        }
      }
    ];

    const $ = id => document.getElementById(id);
    const HOME_AI_QUESTION_COUNT_KEY = "hrobot.aiQuestionCount";
    const HOME_MEMO_RECORDS_KEY = "hrobot.homeMemoRecords";
    const AI_CHAT_QUESTION_HISTORY_KEY = "hrobot.aiQuestionHistory";
    const AI_CHAT_QUESTION_HISTORY_LIMIT = 12;
    const droppedUploadFiles = new Map();
    let homeMemoRecords = [];
    const formatCount = value => new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
    const setHomeCount = (id, value) => {
      const target = $(id);
      if (target) target.textContent = formatCount(value);
    };
    const initHomeIdentityParticles = () => {
      const canvas = $("homeParticleCanvas");
      const card = canvas?.closest(".home-identity-card");
      if (!canvas || !card) return;

      const context = canvas.getContext("2d");
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const pointer = { x: 0, y: 0, active: false };
      const particles = [];
      let width = 0;
      let height = 0;
      let ratio = 1;
      let animationFrame = 0;

      const setPointerStyle = (x, y) => {
        const xPercent = width ? (x / width) * 100 : 78;
        const yPercent = height ? (y / height) * 100 : 18;
        card.style.setProperty("--home-particle-x", `${xPercent}%`);
        card.style.setProperty("--home-particle-y", `${yPercent}%`);
      };

      const makeParticle = index => {
        const band = index % 3;
        const baseX = width * (0.46 + Math.random() * 0.5);
        const baseY = height * (band === 0 ? 0.14 + Math.random() * 0.2 : 0.28 + Math.random() * 0.66);
        return {
          x: baseX,
          y: baseY,
          ox: baseX,
          oy: baseY,
          vx: -0.08 - Math.random() * 0.18,
          vy: -0.035 + Math.random() * 0.07,
          size: 0.72 + Math.random() * 1.55,
          alpha: 0.32 + Math.random() * 0.58,
          phase: Math.random() * Math.PI * 2
        };
      };

      const seedParticles = () => {
        particles.length = 0;
        const count = reduceMotion ? 72 : Math.min(220, Math.max(138, Math.round((width * height) / 2100)));
        for (let index = 0; index < count; index += 1) particles.push(makeParticle(index));
      };

      const resize = () => {
        const rect = card.getBoundingClientRect();
        width = Math.max(1, Math.round(rect.width));
        height = Math.max(1, Math.round(rect.height));
        ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        seedParticles();
        setPointerStyle(width * .78, height * .2);
      };

      const draw = time => {
        context.clearRect(0, 0, width, height);

        const gradient = context.createRadialGradient(width * .82, height * .16, 0, width * .82, height * .16, width * .52);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.14)");
        gradient.addColorStop(0.46, "rgba(224, 238, 255, 0.055)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);

        for (const particle of particles) {
          if (!reduceMotion) {
            particle.x += particle.vx;
            particle.y += particle.vy + Math.sin(time * 0.0012 + particle.phase) * 0.035;

            if (particle.x < width * .18 || particle.y < -12) {
              particle.x = width * (0.68 + Math.random() * 0.3);
              particle.y = height * (0.34 + Math.random() * 0.62);
            }

            if (pointer.active) {
              const dx = pointer.x - particle.x;
              const dy = pointer.y - particle.y;
              const distance = Math.hypot(dx, dy) || 1;
              const pull = Math.max(0, 1 - distance / 160) * 0.045;
              particle.x += dx * pull;
              particle.y += dy * pull;
            } else {
              particle.x += (particle.ox - particle.x) * 0.002;
              particle.y += (particle.oy - particle.y) * 0.002;
            }
          }

          const shimmer = 0.72 + Math.sin(time * 0.002 + particle.phase) * 0.28;
          const activeBoost = pointer.active ? 1.32 : 1;
          if (particle.size > 1.15) {
            context.beginPath();
            context.strokeStyle = `rgba(248, 252, 255, ${particle.alpha * .18 * activeBoost})`;
            context.lineWidth = .7;
            context.moveTo(particle.x, particle.y);
            context.lineTo(particle.x - particle.vx * 18, particle.y - particle.vy * 18);
            context.stroke();
          }

          context.beginPath();
          context.fillStyle = `rgba(248, 252, 255, ${Math.min(.9, particle.alpha * shimmer * activeBoost)})`;
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fill();

          if (particle.size > 1.28) {
            context.beginPath();
            context.fillStyle = `rgba(242, 248, 255, ${particle.alpha * .14})`;
            context.arc(particle.x, particle.y, particle.size * 3.4, 0, Math.PI * 2);
            context.fill();
          }
        }

        if (!reduceMotion) animationFrame = requestAnimationFrame(draw);
      };

      const handleMove = event => {
        const rect = card.getBoundingClientRect();
        pointer.x = event.clientX - rect.left;
        pointer.y = event.clientY - rect.top;
        pointer.active = true;
        card.classList.add("is-particle-active");
        setPointerStyle(pointer.x, pointer.y);
      };

      const handleLeave = () => {
        pointer.active = false;
        card.classList.remove("is-particle-active");
        setPointerStyle(width * .78, height * .2);
      };

      card.addEventListener("pointermove", handleMove);
      card.addEventListener("pointerleave", handleLeave);
      card.addEventListener("focusin", () => card.classList.add("is-particle-active"));
      card.addEventListener("focusout", () => card.classList.remove("is-particle-active"));

      const observer = new ResizeObserver(resize);
      observer.observe(card);
      resize();
      draw(0);
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
      return null;
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
        title.textContent = "今日暂无备忘！";
        body.textContent = "今日也要把待办通通拿下！";
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

    function selectSettingsPanel(target, options = {}) {
      const key = String(target || "data");
      const layout = document.querySelector("[data-settings-tabs]");
      if (!layout) return;
      const buttons = [...layout.querySelectorAll("[data-settings-target]")];
      const panels = [...layout.querySelectorAll("[data-settings-panel]")];
      const matchedPanel = panels.find(panel => panel.dataset.settingsPanel === key) || panels[0];
      const activeKey = matchedPanel?.dataset.settingsPanel || "data";
      buttons.forEach(button => {
        button.classList.toggle("active", button.dataset.settingsTarget === activeKey);
      });
      panels.forEach(panel => {
        const active = panel.dataset.settingsPanel === activeKey;
        panel.classList.toggle("active", active);
        if (panel.tagName === "DETAILS") panel.open = active;
      });
      if (options.scroll !== false) {
        const banner = layout.closest(".page-shell")?.querySelector(".page-banner");
        (banner || layout).scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }

    function renderAgentProjectCard(project) {
      const analysis = project.analysis || {};
      const isBuiltIn = Boolean(project.builtIn);
      const runtimeNames = {
        "python-server": "Python 服务",
        "node-vite": "Vite 服务",
        "node-next": "Next.js 服务",
        "node-server": "Node 服务",
        "static-web": "静态页面",
        "builtin": "内置工具",
        "unknown": "待确认结构"
      };
      const runtimeLabel = analysis.runtimeLabel || runtimeNames[project.runtime] || "待确认结构";
      const description = project.description
        || (project.runtime && project.runtime !== "static-web" ? "带独立后端的数据型 Web 功能，点击后启动自己的本地服务。" : "独立打包的前端页面，点击后直接打开正式功能。");
      const iconText = isBuiltIn ? "盘" : (project.runtime === "static-web" ? "页" : (String(runtimeLabel).includes("Python") ? "Py" : (String(runtimeLabel).includes("Node") || String(runtimeLabel).includes("Vite") || String(runtimeLabel).includes("Next") ? "JS" : "AI")));
      return `
        <article class="agent-project-card" data-agent-project-open="${escapeHtml(project.id || "")}" data-agent-project-id="${escapeHtml(project.id || "")}" title="打开正式页面">
          <div class="agent-project-card-head">
            <span class="agent-project-icon" aria-hidden="true">${escapeHtml(iconText)}</span>
            <button class="agent-project-open-button" type="button" data-agent-project-open="${escapeHtml(project.id || "")}">Open</button>
          </div>
          <div class="agent-project-text">
            <h3>${escapeHtml(project.name || "未命名 Web 项目")}</h3>
            <p class="agent-project-desc">${escapeHtml(description)}</p>
          </div>
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
      const visibleProjects = [...builtInAgentProjects, ...agentCenterProjects];
      if ($("agentProjectGrid")) {
        $("agentProjectGrid").innerHTML = `${visibleProjects.map(renderAgentProjectCard).join("")}${renderAgentProjectAddCard()}`;
      }
    }

    async function loadAgentProjects() {
      const response = await fetch("/api/agent-projects");
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Agent 中心加载失败");
      renderAgentProjects(payload);
      if ($("agentProjectStatus")) $("agentProjectStatus").textContent = payload.updatedAt ? `Agent 项目已更新：${formatFileTime(payload.updatedAt)}` : "等待上传或投放 zip。";
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
      status.textContent = "正在导入 zip、扫描结构并生成卡片...";
      const form = new FormData();
      form.append("file", file);
      try {
        const response = await fetch("/api/agent-projects/upload", { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "项目导入失败");
        if ($("agentProjectZipInput")) $("agentProjectZipInput").value = "";
        renderAgentProjects(payload);
        const project = payload.project || {};
        const source = project.analysis?.source === "rules+ai" ? "，已用 AI 辅助判断结构" : "";
        status.textContent = `项目已导入${source}。`;
      } catch (error) {
        status.textContent = `项目导入失败：${error.message}`;
      }
    }

    async function analyzeAgentProject(projectId) {
      const status = $("agentProjectStatus");
      if (status) status.textContent = "正在重新扫描结构，必要时调用后台大模型...";
      try {
        const response = await fetch("/api/agent-projects/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: projectId, forceAi: true })
        });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "项目分析失败");
        renderAgentProjects(payload);
        const project = payload.project || {};
        const aiStatus = project.analysis?.aiStatus ? ` ${project.analysis.aiStatus}` : "";
        if (status) status.textContent = `结构分析已更新。${aiStatus}`;
      } catch (error) {
        if (status) status.textContent = `结构分析失败：${error.message}`;
      }
    }

    async function openAgentProject(projectId) {
      const status = $("agentProjectStatus");
      if (builtInAgentProjects.some(project => project.id === projectId)) {
        if (status) status.textContent = "已打开 2026人才盘点汇报。";
        switchPage(11);
        document.querySelector('[data-page="10"]')?.classList.add("active");
        return;
      }
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
      if (String(page) === "9") loadDataSourceConfig().catch(error => $("dataSourceConfigStatus").textContent = `数据源配置加载失败：${error.message}`);
      if (String(page) === "9") loadIntelligenceConfig().catch(error => $("intelligenceConfigStatus").textContent = `情报配置加载失败：${error.message}`);
      if (String(page) === "9") loadServerStatus().catch(() => {});
      if (String(page) === "9") loadAiConfig().catch(error => {
        $("multimodalConfigStatus").textContent = `配置加载失败：${error.message}`;
      });
      if (String(page) === "11" && typeof window.renderReportTool === "function") window.renderReportTool();
      if (String(page) !== "11" && typeof window.closeReportCalibrationDrawer === "function") window.closeReportCalibrationDrawer();
      if (String(page) === "3" && typeof window.restoreTalentReviewPage === "function") window.restoreTalentReviewPage();
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

    function appendAiMessage(role, content, extraHtml = "") {
      const log = $("aiChatLog");
      if (!log) return;
      const label = role === "user" ? "你" : "HRobot";
      log.insertAdjacentHTML("beforeend", `
        <article class="chat-message ${role}">
          <div class="chat-role">${label}</div>
          <div class="chat-bubble">${escapeHtml(content)}</div>
          ${extraHtml}
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

    function renderLocalDataSourceScan(payload = {}) {
      const list = $("localDataSourceScanList");
      if (!list) return;
      if (payload.error) {
        list.innerHTML = `<div class="memo-record-item"><span class="memo-record-date">扫描失败</span><span class="memo-record-text">${escapeHtml(payload.error)}</span></div>`;
        return;
      }
      const summary = payload.summary || {};
      if (!payload.fileCount) {
        list.innerHTML = `<div class="memo-record-item"><span class="memo-record-date">扫描结果</span><span class="memo-record-text">暂未发现可识别的数据文件。</span></div>`;
        return;
      }
      const clipText = (value, limit = 64) => {
        const text = String(value || "").replace(/\s+/g, " ").trim();
        return text.length > limit ? `${text.slice(0, limit)}...` : text;
      };
      const topItems = (items = [], limit = 3, textLimit = 44) => items
        .filter(Boolean)
        .slice(0, limit)
        .map(item => clipText(item, textLimit));
      const typeBreakdown = (summary.typeBreakdown || []).filter(item => item.count);
      const typeText = typeBreakdown
        .filter(item => item.count)
        .map(item => `${item.label} ${item.count} 个`)
        .join("；");
      const typeChips = typeBreakdown.slice(0, 5).map(item => `<span>${escapeHtml(item.label)} ${item.count}</span>`).join("");
      const knownCount = Object.entries(summary.typeCounts || {})
        .filter(([type]) => type !== "unknown")
        .reduce((sum, [, count]) => sum + Number(count || 0), 0);
      const unknownCount = Number(summary.typeCounts?.unknown || 0);
      const overview = `发现 ${payload.fileCount || 0} 个可用数据文件，${knownCount || 0} 个已初步归类${unknownCount ? `，${unknownCount} 个待确认` : ""}。`;
      const contentLine = topItems(typeBreakdown.map(item => `${item.label} ${item.count} 个`), 4, 24).join("、") || "暂未形成稳定分类";
      const analysisLine = topItems(summary.analysisOpportunities || [], 2).join("；") || "可先确认文件类型和字段映射。";
      const issueLine = topItems(summary.structureIssues || [], 1).join("") || "未发现明显结构问题。";
      const detailRows = [
        ["内容概况", typeText],
        ["可做分析", (summary.analysisOpportunities || []).join("；")],
        ["结构问题", (summary.structureIssues || []).join("；")],
        ["建议项", (summary.recommendations || []).join("；")],
        ["目录分布", (summary.topFolders || []).join("；")]
      ].filter(([, text]) => text);
      list.innerHTML = `
        <section class="scan-summary-card" aria-label="本地数据扫描概况">
          <div class="scan-summary-main">
            <span>扫描概况</span>
            <strong>${escapeHtml(overview)}</strong>
          </div>
          <div class="scan-summary-grid">
            <div>
              <span>主要内容</span>
              <strong>${escapeHtml(contentLine)}</strong>
              <div class="scan-summary-chips">${typeChips}</div>
            </div>
            <div>
              <span>可用于</span>
              <strong>${escapeHtml(analysisLine)}</strong>
            </div>
            <div>
              <span>需关注</span>
              <strong>${escapeHtml(issueLine)}</strong>
            </div>
          </div>
          ${detailRows.length ? `
            <details class="scan-summary-detail">
              <summary>查看扫描细节</summary>
              <div>
                ${detailRows.map(([label, text]) => `
                  <p><b>${escapeHtml(label)}</b><span>${escapeHtml(text)}</span></p>
                `).join("")}
              </div>
            </details>
          ` : ""}
        </section>
      `;
    }

    async function loadDataSourceConfig() {
      const response = await fetch("/api/data-sources/config");
      const payload = await response.json();
      const mcp = payload.mcp || {};
      if ($("settingsMcpUrl")) $("settingsMcpUrl").value = mcp.url || "";
      if ($("settingsMcpAuthHeader")) $("settingsMcpAuthHeader").value = mcp.authHeaderName || "x-api-key";
      if ($("settingsMcpApiKey")) $("settingsMcpApiKey").placeholder = mcp.authConfigured ? "已保存，留空不覆盖" : "可留空";
      if ($("settingsLocalDataFolder")) $("settingsLocalDataFolder").value = payload.localFolder || "";
      if ($("dataSourceConfigStatus")) $("dataSourceConfigStatus").textContent = payload.updatedAt ? `已保存：${formatFileTime(payload.updatedAt)}` : "";
      if ($("localDataSourceStatus")) {
        $("localDataSourceStatus").textContent = payload.localFolder
          ? (payload.localFolderExists ? "本地目录可访问。" : "目录暂不可访问，请检查路径。")
          : "尚未配置本地目录。";
      }
      return payload;
    }

    async function scanLocalDataSources(localFolder) {
      const status = $("localDataSourceStatus");
      if (status) status.textContent = "正在扫描本地数据目录...";
      const response = await fetch("/api/data-sources/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localFolder: localFolder || $("settingsLocalDataFolder")?.value.trim() || "" })
      });
      const payload = await response.json();
      renderLocalDataSourceScan(payload);
      if (status) {
        status.textContent = payload.error
          ? payload.error
          : `扫描完成：识别到 ${payload.fileCount || 0} 个数据文件。`;
      }
      return payload;
    }

    async function saveDataSourceConfig(event) {
      event.preventDefault();
      const payload = {
        localFolder: $("settingsLocalDataFolder")?.value.trim() || "",
        mcp: {
          url: $("settingsMcpUrl")?.value.trim() || "",
          authHeaderName: $("settingsMcpAuthHeader")?.value.trim() || "x-api-key"
        }
      };
      const apiKey = $("settingsMcpApiKey")?.value.trim();
      if (apiKey) payload.mcp.apiKey = apiKey;
      const response = await fetch("/api/data-sources/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const saved = await response.json();
      if (!response.ok || saved.error) throw new Error(saved.error || "数据源保存失败");
      if ($("settingsMcpApiKey")) $("settingsMcpApiKey").value = "";
      await loadDataSourceConfig();
      if ($("dataSourceConfigStatus")) $("dataSourceConfigStatus").textContent = "数据源配置已保存。";
    }

    async function saveAndScanLocalDataSources(event) {
      event.preventDefault();
      await saveDataSourceConfig(event);
      await scanLocalDataSources();
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

    async function waitForServerReconnect(deadlineMs = 30000) {
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
        let payload = {};
        let requestReached = false;
        try {
          const response = await fetch("/api/server/restart", { method: "POST" });
          payload = await response.json();
          requestReached = true;
          if (!response.ok || payload.error) throw new Error(payload.error || "重启命令失败");
        } catch (requestError) {
          if (requestReached) throw requestError;
          payload = {};
        }
        setServerStatusDisplay(payload, "checking", payload.message || "服务器正在重启，请稍候...");
        await waitForServerReconnect();
      } catch (error) {
        setServerStatusDisplay({}, "offline", `重启失败：${error.message}`);
      } finally {
        if (button) button.disabled = false;
      }
    }

    function setAppUpdateDisplay(payload = {}) {
      latestAppUpdatePayload = payload;
      const app = payload.app || {};
      const latest = payload.latest || {};
      const config = payload.config || {};
      if ($("currentAppVersion")) $("currentAppVersion").textContent = app.version || "-";
      if ($("latestAppVersion")) $("latestAppVersion").textContent = latest.version || "-";
      if ($("latestInstallerName")) $("latestInstallerName").textContent = latest.installer || "-";
      if ($("updateCheckedAt")) $("updateCheckedAt").textContent = formatFileTime(payload.checkedAt || "");
      const releasePage = latest.releasePage || payload.sourcePath || payload.releasePage || "https://github.com/lllzccc/HRobot/releases/latest";
      if ($("updateReleaseLink")) $("updateReleaseLink").href = releasePage;
      if ($("updateSourceLabel")) $("updateSourceLabel").textContent = payload.sourceType === "github" ? "GitHub Release" : (payload.sourcePath || "GitHub Release");
      if ($("showUpdateNotesBtn")) $("showUpdateNotesBtn").disabled = false;
      if ($("installAppUpdateBtn")) $("installAppUpdateBtn").disabled = !(payload.updateAvailable && latest.canAutoInstall);
      if ($("appUpdateStatus")) {
        $("appUpdateStatus").textContent = payload.error
          ? `检查失败：${payload.error}`
          : payload.noRelease
            ? "GitHub 还没有创建正式 Release。"
          : payload.updateAvailable
            ? `发现新版本 ${latest.version}。`
            : payload.configured
              ? "当前已是最新版本。"
              : "正在等待 GitHub Release 信息。";
      }
    }

    async function loadAppUpdateStatus(options = {}) {
      const status = $("appUpdateStatus");
      if (status) status.textContent = options.message || "正在读取更新配置。";
      const response = await fetch(`/api/app/update?t=${Date.now()}`, { cache: "no-store" });
      const payload = await response.json();
      setAppUpdateDisplay(payload);
      return payload;
    }

    async function checkAppUpdate() {
      const button = $("checkAppUpdateBtn");
      const status = $("appUpdateStatus");
      if (button) button.disabled = true;
      if (status) status.textContent = "正在检查 GitHub Release。";
      try {
        const response = await fetch("/api/app/update/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const payload = await response.json();
        setAppUpdateDisplay(payload);
        if (!response.ok || payload.error) throw new Error(payload.error || "检查更新失败");
      } catch (error) {
        if (status) status.textContent = `检查失败：${error.message}`;
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function installAppUpdate() {
      if (!confirm("确认下载并启动更新安装包吗？Windows 安装器会覆盖程序文件、保留本机数据，并在安装后重新启动 HRobot。")) return;
      const button = $("installAppUpdateBtn");
      const status = $("appUpdateStatus");
      if (button) button.disabled = true;
      if (status) status.textContent = "正在下载安装包并启动自动更新。";
      try {
        const response = await fetch("/api/app/update/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || "启动更新失败");
        setAppUpdateDisplay(payload);
        if (status) status.textContent = payload.message || "更新安装包已启动。";
      } catch (error) {
        if (status) status.textContent = `启动更新失败：${error.message}`;
        if (button) button.disabled = false;
      }
    }

    function showUpdateNotes() {
      const dialog = $("updateNotesDialog");
      const latest = latestAppUpdatePayload?.latest || {};
      if (!dialog) return;
      if ($("updateNotesDialogTitle")) $("updateNotesDialogTitle").textContent = latest.version ? `版本说明 v${latest.version}` : "版本说明";
      if ($("updateNotesDialogMeta")) {
        $("updateNotesDialogMeta").textContent = [latest.installer, latest.publishedAt ? formatFileTime(latest.publishedAt) : ""].filter(Boolean).join(" · ") || "GitHub Release";
      }
      if ($("updateNotesDialogBody")) {
        $("updateNotesDialogBody").textContent = latestAppUpdatePayload?.noRelease
          ? "GitHub 还没有创建正式 Release。发布第一个 Release 后，这里会显示该版本的更新说明。"
          : latest.notes || "这个 Release 暂无版本说明。";
      }
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
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
    let keyIntelligenceRequestId = 0;

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

    function renderKeyIntelligenceSummary(text) {
      const lines = String(text || "").split(/\n+/).map(line => line.trim().replace(/\*\*/g, "")).filter(Boolean);
      $("keyIntelligenceList").innerHTML = lines.length
        ? `<div class="key-intelligence-summary">${lines.map(line => `<p>${escapeHtml(line)}</p>`).join("")}</div>`
        : `<div class="empty-report">暂无关键情报分析。</div>`;
    }

    async function loadKeyIntelligenceSummary() {
      const requestId = ++keyIntelligenceRequestId;
      const status = $("keyIntelligenceStatus");
      const list = $("keyIntelligenceList");
      if (status) status.textContent = "正在分析上周新闻";
      if (list) list.innerHTML = `<div class="empty-report">正在生成关键情报分析...</div>`;
      const params = new URLSearchParams();
      if (activeIntelligenceChannel) params.set("channel", activeIntelligenceChannel);
      const response = await fetch(params.toString() ? `/api/intelligence/key-summary?${params.toString()}` : "/api/intelligence/key-summary");
      const payload = await response.json();
      if (requestId !== keyIntelligenceRequestId) return;
      if (!payload.configured) {
        if (status) status.textContent = "模型未配置";
        if (list) list.innerHTML = `<div class="empty-report">${escapeHtml(payload.message || "请先在设置中配置模型后生成关键情报。")}</div>`;
        return;
      }
      if (!response.ok || payload.error) {
        if (status) status.textContent = "分析失败";
        if (list) list.innerHTML = `<div class="empty-report">${escapeHtml(payload.error || payload.message || "关键情报分析失败。")}</div>`;
        return;
      }
      if (status) {
        const countText = payload.item_count ? `${payload.item_count} 条新闻` : "暂无新闻";
        status.textContent = payload.date_range ? `${payload.date_range} · ${countText}` : countText;
      }
      renderKeyIntelligenceSummary(payload.message);
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
      loadKeyIntelligenceSummary().catch(error => {
        $("keyIntelligenceStatus").textContent = "分析失败";
        $("keyIntelligenceList").innerHTML = `<div class="empty-report">关键情报分析失败：${escapeHtml(error.message)}</div>`;
      });
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
        if (!Array.isArray(items)) return [];
        return items.map(item => {
          if (typeof item === "string") return { question: item, updatedAt: "" };
          if (!item || typeof item !== "object") return null;
          const question = String(item.question || item.message || item.content || item.text || "").trim();
          if (!question) return null;
          return { ...item, question };
        }).filter(Boolean).slice(0, AI_CHAT_QUESTION_HISTORY_LIMIT);
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
        <button class="chat-history-item" type="button" title="${escapeHtml(item.question)}" data-ai-history-question="${escapeHtml(item.question)}">
          <span class="chat-history-question">${escapeHtml(item.question)}</span>
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

    function selectAiSideTab(tab) {
      const panel = $("aiChatSidePanel");
      if (!panel) return;
      panel.dataset.tab = tab;
      document.querySelectorAll("[data-ai-side-tab]").forEach(button => {
        button.classList.toggle("active", button.dataset.aiSideTab === tab);
      });
    }

    function openAiProfileFloating(profileId = "") {
      if (profileId) activeAiProfileId = profileId;
      renderAiProfilePanel(activeAiProfile());
      const floating = $("aiProfileFloating");
      if (!floating) return;
      floating.classList.add("active");
      floating.setAttribute("aria-hidden", "false");
      document.body.classList.add("ai-profile-floating-open");
    }

    function closeAiProfileFloating() {
      const floating = $("aiProfileFloating");
      if (!floating) return;
      floating.classList.remove("active");
      floating.setAttribute("aria-hidden", "true");
      document.body.classList.remove("ai-profile-floating-open");
    }

    function setAiProfileExpanded(expanded) {
      aiProfileExpanded = Boolean(expanded);
      const page = $("page-4")?.querySelector(".workbench-page");
      if (page) page.classList.toggle("ai-profile-expanded", aiProfileExpanded);
      const button = document.querySelector("[data-ai-profile-expand]");
      if (button) button.textContent = aiProfileExpanded ? "收起阅读" : "展开阅读";
    }

    function aiProfileValue(value, fallback = "-") {
      const text = String(value ?? "").trim();
      return text && !["n/a", "none", "null", "-"].includes(text.toLowerCase()) ? text : fallback;
    }

    function aiProfileSummaryLine(profile) {
      const info = profile?.basicInfo || {};
      return [
        aiProfileValue(info.status, ""),
        [aiProfileValue(info.gender, ""), aiProfileValue(info.age, "")].filter(Boolean).join(" / "),
        aiProfileValue(info.level, ""),
        aiProfileValue(info.title, "")
      ].filter(Boolean).join(" · ") || "人员档案";
    }

    function aiProfileCompleteness(profile) {
      const validation = profile?.validation || {};
      const percent = Math.round(Number(validation.completeness || 0) * 100);
      return Number.isFinite(percent) && percent > 0 ? `${percent}%` : "-";
    }

    function renderProfileRows(rows, columns, emptyText) {
      if (!Array.isArray(rows) || !rows.length) {
        return `<div class="ai-profile-empty"><span>${escapeHtml(emptyText || "暂无数据")}</span></div>`;
      }
      return `
        <table class="ai-profile-table">
          <thead><tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map(row => `
              <tr>${columns.map(column => `<td>${escapeHtml(aiProfileValue(row[column.key]))}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }

    function renderAiProfileTimeline(rows, options = {}) {
      const items = Array.isArray(rows) ? rows : [];
      const emptyText = options.emptyText || "暂无记录";
      if (!items.length) {
        return `<div class="ai-profile-empty compact"><span>${escapeHtml(emptyText)}</span></div>`;
      }
      const className = [
        "ai-profile-timeline",
        options.compact ? "compact" : "",
        options.variant ? `is-${options.variant}` : ""
      ].filter(Boolean).join(" ");
      return `
        <div class="ai-profile-timeline-scroll" data-ai-profile-drag-scroll>
          <div class="${className}">
            ${items.map(item => {
              const date = aiProfileValue(item[options.dateKey || "date"], "");
              const title = aiProfileValue(item[options.titleKey || "value"]);
              const detail = options.detailKey ? aiProfileValue(item[options.detailKey], "") : "";
              const meta = options.metaKey ? aiProfileValue(item[options.metaKey], "") : "";
              return `
                <article class="ai-profile-timeline-item">
                  <span class="ai-profile-timeline-dot" aria-hidden="true"></span>
                  ${date ? `<span class="ai-profile-timeline-date">${escapeHtml(date)}</span>` : ""}
                  <strong>${escapeHtml(title)}</strong>
                  ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
                  ${meta ? `<em>${escapeHtml(meta)}</em>` : ""}
                </article>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    function renderAiProfileCycleTimeline(label, rows, emptyText) {
      return `
        <div class="ai-profile-cycle-block">
          <span class="ai-profile-cycle-label">${escapeHtml(label)}</span>
          ${renderAiProfileTimeline(rows, {
            dateKey: "period",
            titleKey: "value",
            emptyText,
            compact: true,
            variant: "cycle"
          })}
        </div>
      `;
    }

    function renderAiProfilePromotionTimeline(rows) {
      return renderAiProfileTimeline(rows, {
        dateKey: "date",
        titleKey: "level",
        detailKey: "reason",
        emptyText: "暂无晋升记录",
        variant: "promotion"
      });
    }

    function renderAiProfileWorkTimeline(rows) {
      return renderAiProfileTimeline(rows, {
        dateKey: "date",
        titleKey: "project",
        emptyText: "暂无项目履历",
        variant: "work"
      });
    }

    function renderAiProfilePanel(profile) {
      const target = $("aiProfilePanel");
      if (!target) return;
      if (!profile) {
        target.innerHTML = `
          <div class="ai-profile-empty">
            <strong>尚未生成人员档案</strong>
            <span>在输入框写姓名或工号后，点击“人才档案”。</span>
          </div>
        `;
        return;
      }
      const info = profile.basicInfo || {};
      const validation = profile.validation || {};
      const mcpStatus = profile.source?.mcpStatus || {};
      const tags = Array.isArray(profile.profileTags) ? profile.profileTags : [];
      const recent = aiProfileCards.slice(0, 6);
      const basicPairs = [
        ["姓名", info.name],
        ["工号", info.employeeId],
        ["性别/年龄", [info.gender, info.age].filter(Boolean).join(" / ")],
        ["状态", info.status],
        ["所在部门", info.departmentPath],
        ["职位", info.title],
        ["职级", info.level],
        ["序列", info.sequence],
        ["司龄", info.tenure],
        ["入职时间", info.hireDate],
        ["学历", info.highestEducation],
        ["毕业院校", info.graduationSchool]
      ];
      target.innerHTML = `
        <div class="ai-profile-toolbar">
          <div class="ai-profile-head">
            <div>
              <h2>${escapeHtml(aiProfileValue(info.name, "未命名人员"))}</h2>
              <p>${escapeHtml(aiProfileSummaryLine(profile))}</p>
            </div>
            <span class="ai-profile-status ${mcpStatus.ok ? "" : "warn"}">${escapeHtml(mcpStatus.ok ? "MCP已校验" : "本地快照")}</span>
          </div>
          <div class="ai-profile-recent">
            <div class="ai-profile-recent-title">最近查看人员</div>
            <div class="ai-profile-chip-row">
              ${recent.map(item => `
                <button class="ai-profile-chip ${item.id === activeAiProfileId ? "active" : ""}" type="button" data-ai-profile-switch="${escapeHtml(item.id)}">${escapeHtml(item.basicInfo?.name || item.id)}</button>
              `).join("") || `<span class="ai-profile-mini-chip">暂无</span>`}
            </div>
          </div>
          <div class="ai-profile-actions">
            <button class="primary" type="button" data-ai-profile-refresh>刷新档案</button>
            <button type="button" data-ai-profile-copy>复制摘要</button>
            <button type="button" data-ai-profile-expand>${aiProfileExpanded ? "收起阅读" : "展开阅读"}</button>
          </div>
        </div>
        <div class="ai-profile-body">
          <section class="ai-profile-section wide">
            <div class="ai-profile-section-head">
              <h3>基本资料</h3>
              <span class="ai-profile-mini-chip">完整度 ${escapeHtml(aiProfileCompleteness(profile))}</span>
            </div>
            <div class="ai-profile-grid">
              ${basicPairs.map(([key, value]) => `<span class="k">${escapeHtml(key)}</span><span>${escapeHtml(aiProfileValue(value))}</span>`).join("")}
            </div>
          </section>
          <section class="ai-profile-section">
            <div class="ai-profile-section-head">
              <h3>人才标签</h3>
              <span class="ai-profile-mini-chip">${tags.length || 0} 条</span>
            </div>
            <div class="ai-profile-tags">
              ${tags.length ? tags.map(tag => `<span class="ai-profile-tag">${escapeHtml(tag)}</span>`).join("") : `<span class="ai-profile-mini-chip">暂无标签信息</span>`}
            </div>
          </section>
          <section class="ai-profile-section wide">
            <div class="ai-profile-section-head">
              <h3>绩效与盘点</h3>
              <span class="ai-profile-mini-chip">固定字段</span>
            </div>
            <div class="ai-profile-cycle-grid">
              ${renderAiProfileCycleTimeline("绩效周期", profile.performance || [], "暂无绩效记录")}
              ${renderAiProfileCycleTimeline("盘点周期", profile.talentReviews || [], "暂无人才盘点记录")}
            </div>
          </section>
          <section class="ai-profile-section wide">
            <div class="ai-profile-section-head">
              <h3>晋升路径</h3>
              <span class="ai-profile-mini-chip">${(profile.promotionHistory || []).length} 个节点</span>
            </div>
            ${renderAiProfilePromotionTimeline(profile.promotionHistory || [])}
          </section>
          <section class="ai-profile-section wide">
            <div class="ai-profile-section-head">
              <h3>项目履历</h3>
              <span class="ai-profile-mini-chip">${(profile.workHistory || []).length} 条</span>
            </div>
            ${renderAiProfileWorkTimeline(profile.workHistory || [])}
          </section>
          <section class="ai-profile-section reading">
            <div class="ai-profile-section-head">
              <h3>员工评价</h3>
              <span class="ai-profile-mini-chip">${(profile.comments || []).length} 条</span>
            </div>
            <div class="ai-profile-comments">
              ${(profile.comments || []).length ? profile.comments.map(item => `
                <div class="ai-profile-comment-item">
                  <b>${escapeHtml([item.period, item.rating].filter(Boolean).join(" · ") || "评价记录")}</b>
                  <p>${escapeHtml(item.managerComment || item.employeeSummary || "暂无评价正文")}</p>
                </div>
              `).join("") : `<span class="ai-profile-mini-chip">暂无员工评价</span>`}
            </div>
          </section>
          <section class="ai-profile-section reading">
            <div class="ai-profile-section-head">
              <h3>AI评价与建议</h3>
              <span class="ai-profile-mini-chip">固定模板</span>
            </div>
            <div class="ai-profile-summary">
              ${(profile.aiSummary || []).map(item => `
                <div class="ai-profile-summary-item">
                  <b>${escapeHtml(item.title || "摘要")}</b>
                  <p>${escapeHtml(item.content || "")}</p>
                </div>
              `).join("")}
            </div>
          </section>
          <section class="ai-profile-section reading">
            <div class="ai-profile-section-head">
              <h3>数据校验</h3>
              <span class="ai-profile-mini-chip">${escapeHtml((validation.missingFields || []).length ? "有缺失" : "已匹配")}</span>
            </div>
            <div class="ai-profile-validation">
              <p>已匹配字段：${escapeHtml((validation.matchedFields || []).join("、") || "-")}</p>
              <p>缺失字段：${escapeHtml((validation.missingFields || []).join("、") || "无")}</p>
              <p>MCP状态：${escapeHtml(mcpStatus.message || "-")}</p>
              <p>数据来源：${escapeHtml(profile.source?.profileSource || "-")}</p>
            </div>
          </section>
        </div>
      `;
    }

    function storeAiProfile(profile) {
      if (!profile?.id) return;
      aiProfileCards = [profile, ...aiProfileCards.filter(item => item.id !== profile.id)].slice(0, 12);
      activeAiProfileId = profile.id;
      renderAiProfilePanel(profile);
    }

    function activeAiProfile() {
      return aiProfileCards.find(item => item.id === activeAiProfileId) || aiProfileCards[0] || null;
    }

    function renderAiProfileArtifact(profile) {
      const info = profile?.basicInfo || {};
      return `
        <div class="ai-artifact-card">
          <div class="ai-artifact-main">
            <div>
              <h3 class="ai-artifact-title">${escapeHtml(aiProfileValue(info.name, "人员档案"))}的人员档案已生成</h3>
              <p class="ai-artifact-meta">来自 HRobot MCP 人才档案，点击查看完整简历卡片。</p>
            </div>
            <div class="ai-artifact-actions">
              <button class="primary" type="button" data-ai-profile-open="${escapeHtml(profile.id)}">查看档案</button>
            </div>
          </div>
          <div class="ai-artifact-followups">
            <button type="button" data-ai-followup="解释${escapeHtml(info.name || "该员工")}的绩效波动">解释绩效波动</button>
            <button type="button" data-ai-followup="分析${escapeHtml(info.name || "该员工")}的晋升节奏">分析晋升节奏</button>
            <button type="button" data-ai-followup="生成${escapeHtml(info.name || "该员工")}的发展建议">生成发展建议</button>
          </div>
        </div>
      `;
    }

    async function generatePersonProfileCard(messageOverride = "") {
      const input = $("aiChatInput");
      const button = $("aiPersonProfileBtn");
      if (!input) return;
      const explicitMessage = typeof messageOverride === "string" ? messageOverride : "";
      const message = String(explicitMessage || input.value || "").trim();
      if (!message) {
        input.focus();
        appendAiMessage("assistant", "请先输入姓名或工号，例如：梁显耀的人员信息，或 工号 2219。");
        return;
      }
      if (button) button.disabled = true;
      saveAiQuestionHistory(message);
      appendAiMessage("user", `【人才档案】${message}`);
      aiChatHistory.push({ role: "user", content: message });
      appendAiMessage("assistant", "正在调用固定人员档案流程，并校验 MCP 人才档案字段...");
      try {
        const response = await fetch("/api/mcp/person-profile-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history: aiChatHistory })
        });
        const payload = await response.json();
        const waiting = $("aiChatLog").lastElementChild;
        if (waiting) waiting.remove();
        if (!response.ok || payload.error) {
          appendAiMessage("assistant", payload.error || "人员档案生成失败。");
          return;
        }
        storeAiProfile(payload.profile);
        const doneMessage = `${aiProfileValue(payload.profile?.basicInfo?.name || payload.profile?.name, "该人员")}的人员档案已生成，点击下方卡片可查看完整简历。`;
        appendAiMessage("assistant", doneMessage, renderAiProfileArtifact(payload.profile));
        aiChatHistory.push({ role: "assistant", content: doneMessage });
        setHomeCount("homeAiQuestionCount", incrementLocalCount(HOME_AI_QUESTION_COUNT_KEY));
      } catch (error) {
        const waiting = $("aiChatLog").lastElementChild;
        if (waiting) waiting.remove();
        appendAiMessage("assistant", `人员档案生成失败：${error.message}`);
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function sendAiMessage(event) {
      event.preventDefault();
      const activeMode = document.querySelector(".chat-mode-tabs button.active");
      if (activeMode?.id === "aiPersonProfileBtn") {
        await generatePersonProfileCard();
        return;
      }
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

    function activeHomeAiMode() {
      return document.querySelector("[data-home-ai-mode].active")?.dataset.homeAiMode || "人才档案";
    }

    function syncHomeAiMode(button) {
      if (!button) return;
      document.querySelectorAll("[data-home-ai-mode]").forEach(item => item.classList.toggle("active", item === button));
      if ($("homeAiModeLabel")) $("homeAiModeLabel").textContent = button.dataset.homeAiMode || "人才档案";
    }

    function submitHomeAi(event) {
      event.preventDefault();
      const input = $("homeAiInput");
      const message = String(input?.value || "").trim();
      if (!message) {
        input?.focus();
        return;
      }
      const mode = activeHomeAiMode();
      switchPage(4);
      if ($("aiChatInput")) $("aiChatInput").value = message;
      window.setTimeout(() => {
        if (mode === "人才档案") {
          generatePersonProfileCard(message);
        } else {
          $("aiChatForm")?.requestSubmit();
        }
      }, 0);
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

    async function fetchTextAsset(url) {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`资源读取失败：${url}`);
      return response.text();
    }

    async function imageToDataUrl(src) {
      const response = await fetch(src, { cache: "no-store" });
      if (!response.ok) return src;
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }

    async function inlineCloneImages(root) {
      const images = Array.from(root.querySelectorAll("img[src]"));
      await Promise.all(images.map(async image => {
        const src = image.getAttribute("src");
        if (!src || src.startsWith("data:")) return;
        try {
          image.setAttribute("src", await imageToDataUrl(src));
        } catch {
          image.setAttribute("src", src);
        }
      }));
    }

    const staticCalibratorAnchorConfig = {
      cadre: { group: "干部", title: "干部校准器" },
      campus: { pools: ["校招生", "校招生人才池"], title: "校招生校准器" },
      "mini-game": { pools: ["小游戏关键岗位", "关键岗位小游戏"], title: "小游戏关键岗位校准器" },
      slg: { pools: ["SLG关键岗位", "关键岗位SLG"], title: "SLG关键岗位校准器" },
      mmo: { pools: ["MMO关键岗位", "关键岗位MMO"], title: "MMO关键岗位校准器" },
      "replace-12": { pools: ["优先处理池"], title: "1/2宫格优先处理池校准器" },
      "replace-senior-risk": { pools: ["组织风险池"], title: "高职级待提升校准器" },
      "replace-long-tenure": { pools: ["长期平台期人群", "长期平台期"], title: "长司龄低职级校准器" }
    };
    const staticReplacePoolModes = [
      { pool: "优先处理池", label: "1/2宫格" },
      { pool: "组织风险池", label: "高职级待提升" },
      { pool: "长期平台期人群", label: "长司龄低职级" }
    ];
    const staticSequenceRoleKeywords = {
      "制作人": ["制作人", "producer"],
      "策划": ["策划"],
      "客户端": ["客户端"],
      "服务端": ["服务端"],
      "美术": ["美术", "主美", "gui", "原画", "模型", "动作", "特效", "修图", "美宣", "技术美术", "设计师", "美术经理", "美术总监", "场景", "角色"],
      "测试": ["测试"]
    };

    function staticProfileValue(person, key, fallback = "") {
      return person?.profile?.[key] || person?.[key] || fallback;
    }

    function staticPersonTalentPools(person) {
      const name = staticProfileValue(person, "name", person?.name || "");
      return talentPools.filter(pool => (pool.members || []).includes(name)).map(pool => pool.name);
    }

    function staticResolvePoolName(candidates = []) {
      const available = new Set(talentPools.map(pool => pool.name));
      return candidates.find(name => available.has(name)) || candidates[0] || "";
    }

    function staticGridLabel(gridId) {
      const grid = gridDefs.find(item => Number(item.id) === Number(gridId));
      return grid ? `${grid.id} ${grid.name}` : "-";
    }

    function staticPersonRoleText(person) {
      return [
        staticProfileValue(person, "sequence", ""),
        staticProfileValue(person, "title", ""),
        staticProfileValue(person, "position", ""),
        staticProfileValue(person, "jobTitle", ""),
        staticProfileValue(person, "职位", ""),
        staticProfileValue(person, "职务", "")
      ].join(" ").toLowerCase();
    }

    function staticMatchesSequence(person, sequenceName = "") {
      const names = String(sequenceName || "")
        .split(/[\/,，、；;\n\r]+/)
        .map(name => name.trim())
        .filter(Boolean);
      if (!names.length) return true;
      const sequence = String(staticProfileValue(person, "sequence", "")).trim();
      const roleText = staticPersonRoleText(person);
      return names.some(name => {
        if (sequence === name) return true;
        const keywords = staticSequenceRoleKeywords[name] || [];
        if (keywords.length) return keywords.some(keyword => roleText.includes(String(keyword).toLowerCase()));
        return roleText.includes(name.toLowerCase());
      });
    }

    function staticCalibratorItems(anchor, mode = {}) {
      const config = staticCalibratorAnchorConfig[anchor] || {};
      const poolName = Object.prototype.hasOwnProperty.call(mode, "pool")
        ? String(mode.pool || "")
        : staticResolvePoolName(config.pools || []);
      return people.filter(person => {
        if (config.group && staticProfileValue(person, "group") !== config.group) return false;
        if (poolName && !staticPersonTalentPools(person).includes(poolName)) return false;
        if (mode.sequence && !staticMatchesSequence(person, mode.sequence)) return false;
        return true;
      });
    }

    function staticCalibratorModeKey(mode = {}) {
      if (Object.prototype.hasOwnProperty.call(mode, "pool")) return `pool:${mode.pool || ""}`;
      if (mode.sequence) return `sequence:${mode.sequence}`;
      return "default";
    }

    function staticCalibratorModeLabel(config, mode = {}) {
      if (Object.prototype.hasOwnProperty.call(mode, "pool")) return mode.label || mode.pool || "干部池";
      if (mode.sequence) return mode.label || mode.sequence;
      return config.title || "校准器";
    }

    function staticDefaultButtonLabel(anchor) {
      if (anchor === "campus") return "校招生池";
      if (["mini-game", "slg", "mmo"].includes(anchor)) return "全部";
      return "";
    }

    function staticGeneratedModeButtons(anchor, hasDefaultButton) {
      if (["replace-12", "replace-senior-risk", "replace-long-tenure"].includes(anchor)) {
        const ownPool = staticResolvePoolName((staticCalibratorAnchorConfig[anchor] || {}).pools || []);
        return staticReplacePoolModes
          .slice()
          .sort((a, b) => Number(b.pool === ownPool) - Number(a.pool === ownPool))
          .map(mode => ({ ...mode, type: "pool" }));
      }
      const label = staticDefaultButtonLabel(anchor);
      return label && !hasDefaultButton ? [{ label, type: "default" }] : [];
    }

    function buildStaticCalibratorHtml(anchor, mode = {}) {
      const config = staticCalibratorAnchorConfig[anchor] || {};
      const items = staticCalibratorItems(anchor, mode);
      const total = items.length || 0;
      const countsByGrid = items.reduce((counts, person) => {
        const gridId = Number(person.gridCurrent);
        counts.set(gridId, (counts.get(gridId) || 0) + 1);
        return counts;
      }, new Map());
      const cellHtml = gridDefs.map(grid => {
        const inGrid = items
          .filter(person => Number(person.gridCurrent) === grid.id)
          .sort((a, b) => String(staticProfileValue(a, "name", a.name || "")).localeCompare(String(staticProfileValue(b, "name", b.name || "")), "zh-Hans-CN"));
        const actual = total ? Math.round((countsByGrid.get(grid.id) || 0) / total * 100) : 0;
        return `
          <section class="cell" data-grid="${grid.id}" data-band="${grid.band}">
            <div class="cell-head">
              <div class="cell-title">
                <span class="num">${grid.id}</span>
                <h2>${escapeHtml(grid.name)}</h2>
              </div>
              <span class="ratio"><span>建议 ${grid.ratio}%</span><span>实际 ${actual}%</span></span>
            </div>
            <p class="cell-note">${escapeHtml(grid.hint)}</p>
            <div class="people">${inGrid.length ? inGrid.map(person => `
              <article class="person" title="${escapeHtml(staticProfileValue(person, "name", person.name || ""))} ${escapeHtml(staticProfileValue(person, "level", ""))}">
                <span class="person-name">${escapeHtml(staticProfileValue(person, "name", person.name || ""))}</span>
                <span class="person-level">${escapeHtml(staticProfileValue(person, "level", "-"))}</span>
              </article>
            `).join("") : `<div class="empty">暂无人员</div>`}</div>
          </section>
        `;
      }).join("");

      return `
        <div class="static-calibrator-title">
          <span>${escapeHtml(staticCalibratorModeLabel(config, mode))}</span>
          <b>${total}人</b>
        </div>
        <div class="workspace profile-collapsed report-inline-workspace static-report-calibrator">
          <main class="main">
            <section class="matrix-area">
              <div class="axis-title-y">绩效</div>
              <div class="axis-y"><div>高</div><div>中</div><div>低</div></div>
              <div class="matrix">${cellHtml}</div>
              <div></div>
              <div class="axis-x"><div>低</div><div>中</div><div>高</div></div>
              <div class="axis-title-x">潜能</div>
            </section>
          </main>
        </div>
      `;
    }

    function fillStaticCalibrators(root) {
      root.querySelectorAll(".talent-calibrator-card").forEach(card => {
        const anchor = card.getAttribute("data-calibrator-anchor") || "";
        const mount = card.querySelector(".talent-calibrator-inline-mount");
        if (!mount) return;
        const actions = card.querySelector(".talent-calibrator-actions") || card.querySelector(".talent-calibrator-copy");
        const hasDefaultButton = Array.from(card.querySelectorAll("[data-calibrator-pool]"))
          .some(button => (button.getAttribute("data-calibrator-pool") || "") === "");
        staticGeneratedModeButtons(anchor, hasDefaultButton).forEach(mode => {
          if (!actions) return;
          const button = document.createElement("button");
          button.className = "quick";
          button.type = "button";
          button.textContent = mode.label;
          if (mode.type === "pool") {
            button.setAttribute("data-calibrator-pool", mode.pool || "");
          } else {
            button.setAttribute("data-static-calibrator-default", "1");
          }
          if (mode.type === "default") {
            actions.insertBefore(button, actions.querySelector(".quick"));
          } else {
            actions.appendChild(button);
          }
        });
        const modes = [];
        const seen = new Set();
        const pushMode = mode => {
          const key = staticCalibratorModeKey(mode);
          if (seen.has(key)) return;
          seen.add(key);
          modes.push({ ...mode, key });
        };
        card.querySelectorAll("[data-static-calibrator-default]").forEach(button => {
          pushMode({ label: button.textContent.trim() });
        });
        card.querySelectorAll("[data-calibrator-pool]").forEach(button => {
          pushMode({
            pool: button.getAttribute("data-calibrator-pool") || "",
            label: button.textContent.trim()
          });
        });
        card.querySelectorAll("[data-calibrator-sequence]").forEach(button => {
          pushMode({
            sequence: button.getAttribute("data-calibrator-sequence") || "",
            label: button.textContent.trim()
          });
        });
        pushMode({});
        const activeKey = modes[0]?.key || "default";
        card.querySelectorAll(".quick").forEach(button => {
          const mode = button.hasAttribute("data-static-calibrator-default")
            ? {}
            : button.hasAttribute("data-calibrator-pool")
            ? { pool: button.getAttribute("data-calibrator-pool") || "" }
            : { sequence: button.getAttribute("data-calibrator-sequence") || "" };
          const key = staticCalibratorModeKey(mode);
          button.setAttribute("data-static-calibrator-key", key);
          button.classList.toggle("active", key === activeKey);
        });
        mount.innerHTML = modes.map(mode => `
          <div class="static-calibrator-view${mode.key === activeKey ? " active" : ""}" data-static-calibrator-view="${escapeHtml(mode.key)}">
            ${buildStaticCalibratorHtml(anchor, mode)}
          </div>
        `).join("");
        card.classList.add("open", "static-calibrator-card");
      });
    }

    function buildTalentReportStaticStyle(cssText) {
      return `${cssText}

body.static-talent-report {
  margin: 0;
  min-width: 0;
  background: #f4efe7;
}

.static-talent-report .app-shell,
.static-talent-report .talent-deck {
  min-height: 100vh;
}

.static-talent-report .talent-deck-nav {
  position: static;
}

.static-talent-report .talent-deck-stage {
  overflow: visible;
  padding: 24px;
}

.static-talent-report .talent-slide {
  display: none;
  overflow: visible;
}

.static-talent-report .talent-slide.active {
  display: grid;
}

.static-talent-report .talent-collapse-card {
  overflow: visible;
}

.static-talent-report .talent-collapse-card summary {
  cursor: default;
}

.static-talent-report .talent-calibrator-actions button:not(.quick),
.static-talent-report .talent-calibrator-copy > button:not(.quick) {
  display: none;
}

.static-talent-report .talent-calibrator-inline-mount:empty {
  display: none;
}

.static-talent-report .static-calibrator-view {
  display: none;
}

.static-talent-report .static-calibrator-view.active {
  display: block;
}

.static-talent-report .static-calibrator-card {
  align-items: start;
}

.static-talent-report .static-calibrator-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  color: #2457d6;
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
  line-height: var(--type-label-line);
}

.static-talent-report .static-calibrator-title b {
  color: var(--deck-ink);
  font-weight: var(--type-card-title-weight);
}

.static-talent-report .static-report-calibrator .person {
  cursor: default;
}

@media print {
  .static-talent-report .talent-deck-stage {
    display: grid;
    gap: 24px;
    padding: 0;
  }

  .static-talent-report .talent-slide {
    display: grid;
    border: 0;
    box-shadow: none;
    page-break-after: always;
    break-after: page;
  }

  .static-talent-report .talent-slide:last-child {
    page-break-after: auto;
    break-after: auto;
  }
}
`;
    }

    function buildTalentReportStaticScript() {
      return `<script>
(function () {
  function setReportSlide(slideId) {
    var id = slideId || "overall";
    document.querySelectorAll("[data-report-slide]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-report-slide") === id);
    });
    document.querySelectorAll("[data-report-slide-panel]").forEach(function (panel) {
      panel.classList.toggle("active", panel.getAttribute("data-report-slide-panel") === id);
    });
  }

  document.querySelectorAll("[data-report-slide]").forEach(function (button) {
    button.addEventListener("click", function () {
      setReportSlide(button.getAttribute("data-report-slide"));
    });
  });

  document.querySelectorAll(".static-calibrator-card").forEach(function (card) {
    card.querySelectorAll("[data-static-calibrator-key]").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.getAttribute("data-static-calibrator-key") || "default";
        card.querySelectorAll("[data-static-calibrator-key]").forEach(function (item) {
          item.classList.toggle("active", item === button);
        });
        card.querySelectorAll("[data-static-calibrator-view]").forEach(function (view) {
          view.classList.toggle("active", view.getAttribute("data-static-calibrator-view") === key);
        });
      });
    });
  });
}());
</script>`;
    }

    async function exportTalentReportStaticHtml() {
      const button = $("exportTalentReportHtmlBtn");
      const deck = document.querySelector("#page-11 .talent-deck");
      if (!deck) return;
      const originalText = button?.textContent || "";
      if (button) {
        button.disabled = true;
        button.textContent = "正在导出...";
      }
      try {
        if (typeof window.renderReportTool === "function") window.renderReportTool();
        const clone = deck.cloneNode(true);
        const activeSlide = clone.querySelector("[data-report-slide-panel].active")?.getAttribute("data-report-slide-panel") || "overall";
        clone.querySelector(".talent-deck-export")?.remove();
        clone.querySelectorAll("[data-report-slide-panel]").forEach(panel => {
          panel.classList.toggle("active", panel.getAttribute("data-report-slide-panel") === activeSlide);
        });
        clone.querySelectorAll("[data-report-slide]").forEach(button => {
          button.classList.toggle("active", button.getAttribute("data-report-slide") === activeSlide);
        });
        clone.querySelectorAll("details").forEach(detail => detail.setAttribute("open", ""));
        clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
        clone.querySelectorAll("[onclick]").forEach(node => node.removeAttribute("onclick"));
        fillStaticCalibrators(clone);
        await inlineCloneImages(clone);
        const cssLinks = Array.from(document.querySelectorAll("link[rel='stylesheet'][href]"));
        const cssText = (await Promise.all(cssLinks.map(link => fetchTextAsset(link.href)))).join("\n\n");
        const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>2026人才盘点汇报</title>
  <style>${buildTalentReportStaticStyle(cssText)}</style>
</head>
<body class="static-talent-report">
  ${clone.outerHTML}
  ${buildTalentReportStaticScript()}
</body>
</html>`;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const link = document.createElement("a");
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        link.href = URL.createObjectURL(blob);
        link.download = `2026人才盘点汇报-静态版-${date}.html`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      } catch (error) {
        alert(`导出失败：${error.message}`);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalText || "导出静态HTML";
        }
      }
    }

    function closeGeneratedReport() {
      currentReportId = "";
      currentReportDetail = null;
      currentReportView = "md";
      renderReportLibrary("reportLibrary");
      switchPage(5);
    }

    function uploadFilesForInput(fileInputId) {
      const input = $(fileInputId);
      return droppedUploadFiles.get(fileInputId) || [...(input?.files || [])];
    }

    function resetUploadInput(fileInputId) {
      const input = $(fileInputId);
      if (input) input.value = "";
      droppedUploadFiles.delete(fileInputId);
      syncFileDropzone(input, []);
    }

    function fileDropzoneText(files) {
      if (!files.length) return "";
      if (files.length === 1) return files[0].name;
      return `${files.length} 个文件：${files.slice(0, 2).map(file => file.name).join("、")}${files.length > 2 ? "..." : ""}`;
    }

    function syncFileDropzone(inputOrId, files = null) {
      const input = typeof inputOrId === "string" ? $(inputOrId) : inputOrId;
      if (!input) return;
      const zone = document.querySelector(`[data-file-dropzone="${input.id}"]`);
      if (!zone) return;
      const title = zone.querySelector("[data-file-dropzone-title]");
      const selected = files || uploadFilesForInput(input.id);
      zone.classList.toggle("has-file", selected.length > 0);
      if (title) {
        title.textContent = selected.length ? fileDropzoneText(selected) : (zone.dataset.defaultTitle || title.dataset.defaultTitle || title.textContent);
      }
    }

    function submitFileDropzone(input) {
      const form = input?.form;
      if (!form) return;
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    }

    function initFileDropzones() {
      document.querySelectorAll("[data-file-dropzone]").forEach(zone => {
        const input = $(zone.dataset.fileDropzone);
        if (!input) return;
        const title = zone.querySelector("[data-file-dropzone-title]");
        if (title && !zone.dataset.defaultTitle) zone.dataset.defaultTitle = title.textContent;
        input.addEventListener("change", () => {
          droppedUploadFiles.delete(input.id);
          syncFileDropzone(input);
        });
        zone.addEventListener("keydown", event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          input.click();
        });
        zone.addEventListener("click", event => {
          if (event.target === input) return;
          input.click();
        });
        zone.addEventListener("dragover", event => {
          event.preventDefault();
          zone.classList.add("drag-over");
        });
        zone.addEventListener("dragleave", event => {
          if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
        });
        zone.addEventListener("drop", event => {
          event.preventDefault();
          zone.classList.remove("drag-over");
          const files = [...event.dataTransfer.files];
          if (!files.length) return;
          const selected = input.multiple ? files : files.slice(0, 1);
          droppedUploadFiles.set(input.id, selected);
          syncFileDropzone(input, selected);
          submitFileDropzone(input);
        });
      });
    }

    async function uploadFile(endpoint, fileInputId, statusId) {
      const input = $(fileInputId);
      const status = $(statusId);
      const file = uploadFilesForInput(fileInputId)[0];
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
      resetUploadInput(fileInputId);
      return payload;
    }

    async function uploadFiles(endpoint, fileInputId, statusId) {
      const status = $(statusId);
      const files = uploadFilesForInput(fileInputId);
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
      resetUploadInput(fileInputId);
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
      const reportAssetKind = deleteType === "report-skill"
        ? "skills"
        : deleteType === "report-material"
          ? "materials"
          : "";
      return (items || []).map(item => `
        <div class="asset-item${reportAssetKind && selectedReportAssets[reportAssetKind].has(item.filename) ? " selected" : ""}"
          ${reportAssetKind ? `role="checkbox" tabindex="0" aria-checked="${selectedReportAssets[reportAssetKind].has(item.filename)}" data-report-asset-kind="${reportAssetKind}" data-report-asset-filename="${escapeHtml(item.filename)}"` : ""}>
          <strong>${escapeHtml(item.filename)}</strong>
          <span class="asset-meta">
            <span>${escapeHtml(formatFileSize(item.size))} · ${escapeHtml(formatFileTime(item.updatedAt))}</span>
            ${deleteType ? `<button class="asset-delete" type="button" title="删除文件" data-file-delete="${escapeHtml(deleteType)}" data-filename="${escapeHtml(item.filename)}">删除</button>` : ""}
          </span>
        </div>
      `).join("") || `<div class="asset-item"><strong>暂无文件</strong><span>-</span></div>`;
    }

    function selectedReportAssetBlock() {
      const skillNames = [...selectedReportAssets.skills];
      const materialNames = [...selectedReportAssets.materials];
      if (!skillNames.length && !materialNames.length) return "";
      const lines = ["【已选报告资料】"];
      if (skillNames.length) lines.push(`- Skill：${skillNames.join("、")}`);
      if (materialNames.length) lines.push(`- 分析材料：${materialNames.join("、")}`);
      return lines.join("\n");
    }

    function syncSelectedReportAssetsToInstruction() {
      const input = $("reportInstructionInput");
      if (!input) return;
      const selectionPattern = /\n{0,2}【已选报告资料】(?:\r?\n-(?: Skill| 分析材料)：[^\r\n]*)*/g;
      const manualInstruction = input.value.replace(selectionPattern, "").trimEnd();
      const selectionBlock = selectedReportAssetBlock();
      input.value = [manualInstruction, selectionBlock].filter(Boolean).join("\n\n");
      const skillCount = selectedReportAssets.skills.size;
      const materialCount = selectedReportAssets.materials.size;
      const status = $("reportAssetSelectionStatus");
      if (status) {
        status.textContent = skillCount || materialCount
          ? `已选 ${skillCount} 个 Skill、${materialCount} 份材料；再次点击可取消。生成时只读取这些资料。`
          : "可点击下方已导入的 Skill 或材料，自动回填到报告要求。";
      }
    }

    function toggleReportAsset(item) {
      const kind = item?.dataset.reportAssetKind;
      const filename = item?.dataset.reportAssetFilename;
      const selected = selectedReportAssets[kind];
      if (!selected || !filename) return;
      if (selected.has(filename)) {
        selected.delete(filename);
      } else {
        selected.add(filename);
      }
      item.classList.toggle("selected", selected.has(filename));
      item.setAttribute("aria-checked", String(selected.has(filename)));
      syncSelectedReportAssetsToInstruction();
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
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        deleteImportedFile(button.dataset.fileDelete, button.dataset.filename).catch(error => {
          const status = button.dataset.fileDelete.startsWith("report-") ? $("reportGenerateStatus") : $("importSourceStatus");
          if (status) status.textContent = `删除失败：${error.message}`;
        });
        return;
      }
      const reportAsset = event.target.closest("[data-report-asset-kind]");
      if (reportAsset) toggleReportAsset(reportAsset);
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("[data-file-delete]")) return;
      const reportAsset = event.target.closest("[data-report-asset-kind]");
      if (!reportAsset) return;
      event.preventDefault();
      toggleReportAsset(reportAsset);
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
      const availableSkills = new Set((payload.skills || []).map(item => item.filename));
      const availableMaterials = new Set((payload.materials || []).map(item => item.filename));
      selectedReportAssets.skills.forEach(filename => {
        if (!availableSkills.has(filename)) selectedReportAssets.skills.delete(filename);
      });
      selectedReportAssets.materials.forEach(filename => {
        if (!availableMaterials.has(filename)) selectedReportAssets.materials.delete(filename);
      });
      if ($("reportSkillAssetList")) $("reportSkillAssetList").innerHTML = renderFileItems(payload.skills || [], "report-skill");
      if ($("reportMaterialAssetList")) $("reportMaterialAssetList").innerHTML = renderFileItems(payload.materials || [], "report-material");
      syncSelectedReportAssetsToInstruction();
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
      const selectedAssets = {
        skills: [...selectedReportAssets.skills],
        materials: [...selectedReportAssets.materials]
      };
      status.textContent = "正在读取人才盘点、档案、skill 和分析材料，并调用模型生成 MD 报告...";
      const response = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: $("reportTypeInput").value,
          instruction: $("reportInstructionInput").value.trim(),
          ...(selectedAssets.skills.length || selectedAssets.materials.length ? { selectedAssets } : {})
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

    initFileDropzones();

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
    $("dataSourceConfigForm")?.addEventListener("submit", event => {
      saveDataSourceConfig(event).catch(error => {
        if ($("dataSourceConfigStatus")) $("dataSourceConfigStatus").textContent = `保存失败：${error.message}`;
      });
    });
    $("localDataSourceScanForm")?.addEventListener("submit", event => {
      saveAndScanLocalDataSources(event).catch(error => {
        if ($("localDataSourceStatus")) $("localDataSourceStatus").textContent = `扫描失败：${error.message}`;
      });
    });
    $("scanLocalDataSourceBtn")?.addEventListener("click", () => {
      scanLocalDataSources().catch(error => {
        if ($("localDataSourceStatus")) $("localDataSourceStatus").textContent = `扫描失败：${error.message}`;
      });
    });
    $("refreshServerStatusBtn").addEventListener("click", () => loadServerStatus().catch(() => {}));
    $("restartServerBtn")?.addEventListener("click", restartServer);
    $("checkAppUpdateBtn")?.addEventListener("click", checkAppUpdate);
    $("showUpdateNotesBtn")?.addEventListener("click", showUpdateNotes);
    $("closeUpdateNotesBtn")?.addEventListener("click", () => $("updateNotesDialog")?.close());
    $("updateNotesDialog")?.addEventListener("click", event => {
      if (event.target === $("updateNotesDialog")) $("updateNotesDialog")?.close();
    });
    $("installAppUpdateBtn")?.addEventListener("click", installAppUpdate);
    document.querySelectorAll("[data-settings-target]").forEach(button => {
      button.addEventListener("click", () => selectSettingsPanel(button.dataset.settingsTarget || "data"));
    });
    document.querySelectorAll(".settings-tabbed .settings-section summary").forEach(summary => {
      summary.addEventListener("click", event => event.preventDefault());
    });
    selectSettingsPanel(document.querySelector("[data-settings-target].active")?.dataset.settingsTarget || "data", { scroll: false });
    $("designPromptConfigForm").addEventListener("submit", saveDesignPromptConfig);
    $("refreshDesignPromptConfigBtn").addEventListener("click", refreshDesignPromptConfig);
    $("agentProjectGrid").addEventListener("click", event => {
      const deleteButton = event.target.closest("[data-agent-project-delete]");
      const analyzeButton = event.target.closest("[data-agent-project-analyze]");
      const addButton = event.target.closest("[data-agent-project-add]");
      const projectCard = event.target.closest("[data-agent-project-open]");
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        deleteAgentProject(deleteButton.dataset.agentProjectDelete);
        return;
      }
      if (analyzeButton) {
        event.preventDefault();
        event.stopPropagation();
        analyzeAgentProject(analyzeButton.dataset.agentProjectAnalyze);
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
        loadKeyIntelligenceSummary().catch(error => {
          $("keyIntelligenceStatus").textContent = "分析失败";
          $("keyIntelligenceList").innerHTML = `<div class="empty-report">关键情报分析失败：${escapeHtml(error.message)}</div>`;
        });
      });
    });
    $("designPosterForm").addEventListener("submit", generateDesignPoster);
    $("refreshPosterHistoryBtn").addEventListener("click", () => loadPosterHistory().catch(error => $("designGenerateStatus").textContent = `历史加载失败：${error.message}`));
    $("posterPreviewCloseBtn").addEventListener("click", () => $("posterPreviewDialog").close());
    $("goSettingsFromDesign").addEventListener("click", () => switchPage(9));
    $("aiChatForm").addEventListener("submit", sendAiMessage);
    $("aiPersonProfileBtn").addEventListener("click", () => generatePersonProfileCard());
    $("homeAiForm")?.addEventListener("submit", submitHomeAi);
    document.querySelectorAll("[data-home-ai-mode]").forEach(button => {
      button.addEventListener("click", () => syncHomeAiMode(button));
    });
    document.querySelectorAll("[data-ai-side-tab]").forEach(button => {
      button.addEventListener("click", () => selectAiSideTab(button.dataset.aiSideTab || "history"));
    });
    document.querySelectorAll("[data-ai-profile-close]").forEach(button => {
      button.addEventListener("click", closeAiProfileFloating);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeAiProfileFloating();
    });
    $("aiChatLog").addEventListener("click", event => {
      const openProfile = event.target.closest("[data-ai-profile-open]");
      if (openProfile) {
        openAiProfileFloating(openProfile.dataset.aiProfileOpen || activeAiProfileId);
        return;
      }
      const followup = event.target.closest("[data-ai-followup]");
      if (followup) {
        const input = $("aiChatInput");
        input.value = followup.dataset.aiFollowup || "";
        input.focus();
      }
    });
    $("aiProfilePanel").addEventListener("click", event => {
      const switchButton = event.target.closest("[data-ai-profile-switch]");
      if (switchButton) {
        activeAiProfileId = switchButton.dataset.aiProfileSwitch || "";
        renderAiProfilePanel(activeAiProfile());
        return;
      }
      if (event.target.closest("[data-ai-profile-expand]")) {
        setAiProfileExpanded(!aiProfileExpanded);
        return;
      }
      if (event.target.closest("[data-ai-profile-copy]")) {
        const profile = activeAiProfile();
        const info = profile?.basicInfo || {};
        const text = `${info.name || ""} ${info.level || ""} ${info.title || ""}\n${aiProfileSummaryLine(profile)}\n完整度：${aiProfileCompleteness(profile)}`;
        navigator.clipboard?.writeText(text).catch(() => {});
        return;
      }
      if (event.target.closest("[data-ai-profile-refresh]")) {
        const profile = activeAiProfile();
        const info = profile?.basicInfo || {};
        const input = $("aiChatInput");
        input.value = `${info.employeeId || info.name || ""}的人员信息`;
        generatePersonProfileCard();
      }
    });
    $("aiProfilePanel").addEventListener("pointerdown", event => {
      const scroller = event.target.closest("[data-ai-profile-drag-scroll]");
      if (!scroller || event.button !== 0 || scroller.scrollWidth <= scroller.clientWidth) return;
      const startX = event.clientX;
      const startScrollLeft = scroller.scrollLeft;
      let hasDragged = false;
      const handleMove = moveEvent => {
        const delta = moveEvent.clientX - startX;
        if (Math.abs(delta) > 2) {
          hasDragged = true;
          scroller.classList.add("is-dragging");
        }
        scroller.scrollLeft = startScrollLeft - delta;
        if (hasDragged) moveEvent.preventDefault();
      };
      const stopDrag = () => {
        scroller.classList.remove("is-dragging");
        scroller.removeEventListener("pointermove", handleMove);
        scroller.removeEventListener("pointerup", stopDrag);
        scroller.removeEventListener("pointercancel", stopDrag);
      };
      scroller.setPointerCapture?.(event.pointerId);
      scroller.addEventListener("pointermove", handleMove);
      scroller.addEventListener("pointerup", stopDrag, { once: true });
      scroller.addEventListener("pointercancel", stopDrag, { once: true });
    });
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
    document.querySelectorAll("[data-report-slide]").forEach(button => {
      button.addEventListener("click", () => window.setReportPptSlide?.(button.dataset.reportSlide));
    });
    $("exportTalentReportHtmlBtn")?.addEventListener("click", () => {
      exportTalentReportStaticHtml();
    });
    $("reportCalibrationDrawerToggle")?.addEventListener("click", () => window.toggleReportCalibrationDrawer?.());
    $("reportDrawerCloseBtn")?.addEventListener("click", () => window.closeReportCalibrationDrawer?.());
    $("reportDrawerTalentPoolSelect")?.addEventListener("change", event => {
      window.setReportDrawerTalentPoolFilter?.(event.target.value);
    });
    $("reportDrawerSaveBtn")?.addEventListener("click", () => {
      window.saveReportDrawerCalibration?.().catch(error => {
        const status = $("statusLine");
        if (status) status.textContent = `保存失败：${error.message}`;
      });
    });
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
    loadDataSourceConfig().catch(error => {
      if ($("dataSourceConfigStatus")) $("dataSourceConfigStatus").textContent = `数据源配置加载失败：${error.message}`;
    });
    loadAgentProjects().catch(error => {
      $("agentProjectStatus").textContent = `Agent 中心加载失败：${error.message}`;
    });
    loadAppUpdateStatus().catch(error => {
      if ($("appUpdateStatus")) $("appUpdateStatus").textContent = `更新配置加载失败：${error.message}`;
    });
    refreshHomeUsageStats();
    initHomeIdentityParticles();
    renderAiQuestionHistory();
    loadAiConfig().catch(error => appendAiMessage("assistant", `AI 配置加载失败：${error.message}`));
    loadGeneratedReport().catch(() => {});
    loadReportAssets().catch(() => {});
    loadImportSources().catch(() => {});

    let talentReviewPeopleLoadStarted = false;
    const reportTalentReviewPeopleLoadError = error => {
      $("profile").innerHTML = `<div class="reason-note">加载失败：${error.message}</div>`;
      if (typeof window.renderReportTool === "function") window.renderReportTool();
    };
    const requestTalentReviewPeopleLoad = loadPeopleFn => {
      const loader = loadPeopleFn || window.loadPeople;
      if (typeof loader !== "function" || talentReviewPeopleLoadStarted) return;
      talentReviewPeopleLoadStarted = true;
      loader().catch(reportTalentReviewPeopleLoadError);
    };
    document.addEventListener("hrobot:talent-review-ready", event => {
      requestTalentReviewPeopleLoad(event.detail?.loadPeople);
    }, { once: true });
    requestTalentReviewPeopleLoad();
