(function () {
  var reportInlineAnchor = null;
  var reportInlineHost = null;
  var reportInlineExpandedCard = null;
  var groupByAnchor = {
    cadre: "干部"
  };
  var talentPoolByAnchor = {
    campus: ["校招生", "校招生人才池"],
    "mini-game": ["小游戏关键岗位", "关键岗位小游戏"],
    slg: ["SLG关键岗位", "关键岗位SLG"],
    mmo: ["MMO关键岗位", "关键岗位MMO"],
    "replace-12": ["优先处理池"],
    "replace-long-tenure": ["长期平台期人群", "长期平台期"],
    "replace-senior-risk": ["组织风险池"]
  };

  function ensureReportInlineAnchor() {
    var workspace = document.getElementById("workspace");
    if (!workspace || reportInlineAnchor) return;
    reportInlineAnchor = document.createComment("report-inline-workspace-anchor");
    workspace.parentNode.insertBefore(reportInlineAnchor, workspace);
  }

  function restoreReportInlineWorkspace() {
    var workspace = document.getElementById("workspace");
    if (workspace && reportInlineAnchor && reportInlineAnchor.parentNode) {
      workspace.classList.remove("report-inline-workspace", "report-drawer-workspace");
      reportInlineAnchor.parentNode.insertBefore(workspace, reportInlineAnchor.nextSibling);
    }
    if (reportInlineHost) reportInlineHost.classList.remove("open");
    if (reportInlineExpandedCard) reportInlineExpandedCard.classList.remove("calibrator-expanded");
    reportInlineHost = null;
    reportInlineExpandedCard = null;
  }

  function resolveTalentPoolName(host) {
    var anchor = host ? host.getAttribute("data-calibrator-anchor") : "";
    var candidates = talentPoolByAnchor[anchor] || [];
    var select = document.getElementById("reportDrawerTalentPoolSelect");
    if (select && select.options && select.options.length) {
      for (var i = 0; i < candidates.length; i += 1) {
        for (var j = 0; j < select.options.length; j += 1) {
          if (select.options[j].value === candidates[i] || select.options[j].textContent === candidates[i]) {
            return select.options[j].value || candidates[i];
          }
        }
      }
    }
    return candidates[0] || "";
  }

  function syncTalentPoolFilter(host) {
    var anchor = host ? host.getAttribute("data-calibrator-anchor") : "";
    var groupName = groupByAnchor[anchor] || "";
    if (typeof window.setReportDrawerGroupFilter === "function") {
      window.setReportDrawerGroupFilter(groupName);
    }
    var poolName = resolveTalentPoolName(host);
    if (typeof window.renderReportDrawerTalentPoolFilter === "function") {
      window.renderReportDrawerTalentPoolFilter();
    }
    if (typeof window.setReportDrawerTalentPoolFilter === "function") {
      window.setReportDrawerTalentPoolFilter(poolName);
    }
    setSequenceFilter("");
    var select = document.getElementById("reportDrawerTalentPoolSelect");
    if (select) select.value = poolName;
    markQuickSequence(host, "");
  }

  function markQuickPool(host, poolName) {
    if (!host || !host.querySelectorAll) return;
    var buttons = host.querySelectorAll("[data-calibrator-pool]");
    buttons.forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-calibrator-pool") === poolName);
    });
  }

  function markQuickSequence(host, sequenceName) {
    if (!host || !host.querySelectorAll) return;
    var buttons = host.querySelectorAll("[data-calibrator-sequence]");
    buttons.forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-calibrator-sequence") === sequenceName);
    });
  }

  function setSequenceFilter(sequenceName) {
    if (typeof window.setReportDrawerSequenceFilter === "function") {
      window.setReportDrawerSequenceFilter(sequenceName || "");
    }
  }

  function mountInlineWorkspace(host) {
    ensureReportInlineAnchor();
    var mount = host && host.querySelector ? host.querySelector("[data-calibrator-inline-mount]") : null;
    var workspace = document.getElementById("workspace");
    if (!host || !mount || !workspace) return false;
    if (reportInlineHost === host && mount.contains(workspace)) return true;
    if (reportInlineHost) reportInlineHost.classList.remove("open");
    if (reportInlineExpandedCard) reportInlineExpandedCard.classList.remove("calibrator-expanded");
    var drawer = document.getElementById("reportCalibrationDrawer");
    if (drawer) {
      drawer.classList.remove("open");
      drawer.hidden = true;
      drawer.setAttribute("aria-hidden", "true");
    }
    mount.appendChild(workspace);
    workspace.classList.remove("report-drawer-workspace");
    workspace.classList.add("report-inline-workspace");
    host.classList.add("open");
    reportInlineExpandedCard = host.closest ? host.closest(".talent-road-card") : null;
    if (reportInlineExpandedCard) reportInlineExpandedCard.classList.add("calibrator-expanded");
    reportInlineHost = host;
    return true;
  }

  window.mountReportCalibrationInline = function mountReportCalibrationInline(trigger) {
    var host = trigger && trigger.closest ? trigger.closest(".talent-calibrator-card") : null;
    var mount = host && host.querySelector ? host.querySelector("[data-calibrator-inline-mount]") : null;
    var workspace = document.getElementById("workspace");
    if (!host || !mount || !workspace) return;
    if (reportInlineHost === host && mount.contains(workspace)) {
      restoreReportInlineWorkspace();
      return;
    }
    if (!mountInlineWorkspace(host)) return;
    markQuickPool(host, "");
    markQuickSequence(host, "");
    syncTalentPoolFilter(host);
  };

  window.switchReportCalibrationPool = function switchReportCalibrationPool(trigger, poolName) {
    var host = trigger && trigger.closest ? trigger.closest(".talent-calibrator-card") : null;
    poolName = poolName || "";
    if (!host || !mountInlineWorkspace(host)) return;
    var anchor = host.getAttribute("data-calibrator-anchor") || "";
    var groupName = groupByAnchor[anchor] || "";
    if (typeof window.setReportDrawerGroupFilter === "function") {
      window.setReportDrawerGroupFilter(groupName);
    }
    if (typeof window.renderReportDrawerTalentPoolFilter === "function") {
      window.renderReportDrawerTalentPoolFilter();
    }
    if (typeof window.setReportDrawerTalentPoolFilter === "function") {
      window.setReportDrawerTalentPoolFilter(poolName);
    }
    setSequenceFilter("");
    var select = document.getElementById("reportDrawerTalentPoolSelect");
    if (select) select.value = poolName;
    markQuickPool(host, poolName);
    markQuickSequence(host, "");
  };

  window.switchReportCalibrationSequence = function switchReportCalibrationSequence(trigger, sequenceName) {
    var host = trigger && trigger.closest ? trigger.closest(".talent-calibrator-card") : null;
    sequenceName = sequenceName || "";
    if (!host || !mountInlineWorkspace(host)) return;
    var anchor = host.getAttribute("data-calibrator-anchor") || "";
    var groupName = groupByAnchor[anchor] || "";
    if (typeof window.setReportDrawerGroupFilter === "function") {
      window.setReportDrawerGroupFilter(groupName);
    }
    var poolName = resolveTalentPoolName(host);
    if (typeof window.renderReportDrawerTalentPoolFilter === "function") {
      window.renderReportDrawerTalentPoolFilter();
    }
    if (typeof window.setReportDrawerTalentPoolFilter === "function") {
      window.setReportDrawerTalentPoolFilter(poolName);
    }
    setSequenceFilter(sequenceName);
    var select = document.getElementById("reportDrawerTalentPoolSelect");
    if (select) select.value = poolName;
    markQuickPool(host, "");
    markQuickSequence(host, sequenceName);
  };

  window.restoreReportCalibrationInline = restoreReportInlineWorkspace;
}());
