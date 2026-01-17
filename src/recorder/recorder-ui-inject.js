// 这个文件包含要在浏览器中注入的 JavaScript 代码
// 注意：这必须是纯 JavaScript，不能使用 TypeScript 语法

(function() {
  'use strict';
  
  // 如果已经存在，先移除
  const existing = document.getElementById('playwright-recorder-panel');
  if (existing) {
    existing.remove();
  }

  // 确保 body 存在
  if (!document.body) {
    console.warn('Body not ready, waiting...');
    return;
  }

  // 创建样式
  const style = document.createElement('style');
  style.textContent = `
    #playwright-recorder-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 400px;
      max-height: 80vh;
      background: white;
      border: 2px solid #4CAF50;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #playwright-recorder-panel.hidden {
      display: none;
    }
    .recorder-header {
      background: #4CAF50;
      color: white;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      user-select: none;
    }
    .recorder-header:active {
      cursor: grabbing;
    }
    .recorder-title {
      font-weight: bold;
      font-size: 16px;
    }
    .recorder-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ff4444;
      animation: pulse 2s infinite;
    }
    .status-indicator.recording {
      background: #ff4444;
    }
    .status-indicator.paused {
      background: #ffaa00;
      animation: none;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .recorder-controls {
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      gap: 8px;
    }
    .recorder-btn {
      padding: 6px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    .recorder-btn:hover {
      background: #f0f0f0;
    }
    .recorder-btn.active {
      background: #2196F3;
      color: white;
      border-color: #2196F3;
    }
    .recorder-btn.primary {
      background: #4CAF50;
      color: white;
      border-color: #4CAF50;
    }
    .recorder-btn.primary:hover {
      background: #45a049;
    }
    .recorder-btn.danger {
      background: #f44336;
      color: white;
      border-color: #f44336;
    }
    .recorder-btn.danger:hover {
      background: #da190b;
    }
    .recorder-actions {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      max-height: 400px;
    }
    .action-item {
      padding: 10px;
      margin-bottom: 8px;
      background: #f9f9f9;
      border-left: 3px solid #4CAF50;
      border-radius: 4px;
      position: relative;
    }
    .action-item:hover {
      background: #f0f0f0;
    }
    .action-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .action-type {
      font-weight: bold;
      color: #4CAF50;
      font-size: 14px;
    }
    .action-time {
      font-size: 11px;
      color: #666;
    }
    .action-details {
      font-size: 12px;
      color: #333;
      margin-top: 4px;
      word-break: break-word;
    }
    .action-delete {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 20px;
      height: 20px;
      border: none;
      background: #f44336;
      color: white;
      border-radius: 50%;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .action-item:hover .action-delete {
      opacity: 1;
    }
    .recorder-footer {
      padding: 12px 16px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f9f9f9;
    }
    .action-count {
      font-size: 12px;
      color: #666;
    }
    .recorder-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: white;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .recorder-close:hover {
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);

  // 创建面板
  const panel = document.createElement('div');
  panel.id = 'playwright-recorder-panel';
  panel.innerHTML = '<div class="recorder-header">' +
    '<div>' +
    '<div class="recorder-title">🎬 Playwright 录制器</div>' +
    '<div class="recorder-status">' +
    '<span class="status-indicator recording" id="status-indicator"></span>' +
    '<span id="status-text">录制中...</span>' +
    '</div>' +
    '</div>' +
    '<button class="recorder-close" id="recorder-close">×</button>' +
    '</div>' +
    '<div class="recorder-controls">' +
    '<button class="recorder-btn primary" id="btn-pause">暂停</button>' +
    '<button class="recorder-btn" id="btn-hover">添加悬停</button>' +
    '<button class="recorder-btn" id="btn-clear">清空</button>' +
    '<button class="recorder-btn" id="btn-save">保存</button>' +
    '</div>' +
    '<div class="recorder-actions" id="actions-list"></div>' +
    '<div class="recorder-footer">' +
    '<span class="action-count">操作数: <span id="action-count">0</span></span>' +
    '</div>';

  // 确保添加到 body
  if (document.body) {
    document.body.appendChild(panel);
  } else {
    setTimeout(function() {
      if (document.body) {
        document.body.appendChild(panel);
      }
    }, 100);
  }

  // 存储操作列表
  if (!window.__recorderActions) {
    window.__recorderActions = [];
  }
  if (window.__recorderPaused === undefined) {
    window.__recorderPaused = false;
  }

  // 更新操作列表显示
  function updateActionsList() {
    const actions = window.__recorderActions || [];
    const listEl = document.getElementById('actions-list');
    const countEl = document.getElementById('action-count');
    
    if (countEl) {
      countEl.textContent = String(actions.length);
    }

    if (listEl) {
      listEl.innerHTML = actions.map(function(action, index) {
        const time = new Date(action.timestamp).toLocaleTimeString();
        const details = action.details || '';
        return '<div class="action-item" data-index="' + index + '">' +
          '<button class="action-delete" onclick="window.__deleteAction(' + index + ')">×</button>' +
          '<div class="action-header">' +
          '<span class="action-type">' + action.type + '</span>' +
          '<span class="action-time">' + time + '</span>' +
          '</div>' +
          '<div class="action-details">' + details + '</div>' +
          '</div>';
      }).join('');
      
      // 自动滚动到底部，显示最新添加的操作
      // 使用 setTimeout 确保 DOM 更新完成后再滚动
      setTimeout(function() {
        if (listEl) {
          listEl.scrollTop = listEl.scrollHeight;
        }
      }, 0);
    }
  }

  // 添加操作
  window.__addRecorderAction = function(action) {
    if (!window.__recorderPaused) {
      window.__recorderActions.push(action);
      updateActionsList();
    }
  };

  // 删除操作
  window.__deleteAction = function(index) {
    window.__recorderActions.splice(index, 1);
    updateActionsList();
  };

  // 清空操作
  window.__clearRecorderActions = function() {
    window.__recorderActions = [];
    updateActionsList();
  };

  // 暂停/继续
  window.__togglePause = function() {
    window.__recorderPaused = !window.__recorderPaused;
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const pauseBtn = document.getElementById('btn-pause');
    
    if (indicator) {
      indicator.className = window.__recorderPaused 
        ? 'status-indicator paused' 
        : 'status-indicator recording';
    }
    if (statusText) {
      statusText.textContent = window.__recorderPaused ? '已暂停' : '录制中...';
    }
    if (pauseBtn) {
      pauseBtn.textContent = window.__recorderPaused ? '继续' : '暂停';
    }
  };

  // 添加悬停模式
  let hoverMode = false;
  let hoverModeOverlay = null;

  window.__startHoverMode = function() {
    if (hoverMode) {
      window.__stopHoverMode();
      return;
    }

    hoverMode = true;
    const hoverBtn = document.getElementById('btn-hover');
    if (hoverBtn) {
      hoverBtn.textContent = '取消悬停';
      hoverBtn.classList.add('active');
    }

    // 创建覆盖层，用于高亮元素
    hoverModeOverlay = document.createElement('div');
    hoverModeOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483646; cursor: crosshair; background: rgba(0,0,0,0.1); pointer-events: auto;';
    document.body.appendChild(hoverModeOverlay);

    // 添加鼠标移动事件，高亮元素
    function highlightElement(e) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && !target.closest('#playwright-recorder-panel')) {
        // 移除之前的高亮
        document.querySelectorAll('.hover-highlight').forEach(function(el) {
          el.classList.remove('hover-highlight');
        });
        // 添加高亮
        target.classList.add('hover-highlight');
      }
    }

    // 添加点击事件，选择元素
    function selectElement(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && !target.closest('#playwright-recorder-panel')) {
        // 触发自定义事件，通知 Node.js 端
        const rect = target.getBoundingClientRect();
        const event = new CustomEvent('__playwright_hover_manual', {
          detail: {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            target: target
          }
        });
        window.dispatchEvent(event);
        
        // 退出悬停模式
        window.__stopHoverMode();
      }
    }

    hoverModeOverlay.addEventListener('mousemove', highlightElement);
    hoverModeOverlay.addEventListener('click', selectElement);

    // 添加高亮样式
    if (!document.getElementById('hover-highlight-style')) {
      const highlightStyle = document.createElement('style');
      highlightStyle.id = 'hover-highlight-style';
      highlightStyle.textContent = '.hover-highlight { outline: 2px solid #4CAF50 !important; outline-offset: 2px !important; background: rgba(76, 175, 80, 0.1) !important; }';
      document.head.appendChild(highlightStyle);
    }
  };

  window.__stopHoverMode = function() {
    hoverMode = false;
    const hoverBtn = document.getElementById('btn-hover');
    if (hoverBtn) {
      hoverBtn.textContent = '添加悬停';
      hoverBtn.classList.remove('active');
    }

    if (hoverModeOverlay) {
      hoverModeOverlay.remove();
      hoverModeOverlay = null;
    }

    // 移除所有高亮
    document.querySelectorAll('.hover-highlight').forEach(function(el) {
      el.classList.remove('hover-highlight');
    });
  };

  // 绑定事件
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) {
    btnPause.addEventListener('click', function() {
      window.__togglePause();
    });
  }

  const btnHover = document.getElementById('btn-hover');
  if (btnHover) {
    btnHover.addEventListener('click', function() {
      window.__startHoverMode();
    });
  }

  const btnClear = document.getElementById('btn-clear');
  if (btnClear) {
    btnClear.addEventListener('click', function() {
      if (confirm('确定要清空所有操作吗？')) {
        window.__clearRecorderActions();
      }
    });
  }

  const btnSave = document.getElementById('btn-save');
  if (btnSave) {
    btnSave.addEventListener('click', function() {
      window.__shouldSaveConfig = true;
      alert('配置将在后台保存，请查看控制台输出');
    });
  }

  const btnClose = document.getElementById('recorder-close');
  if (btnClose) {
    btnClose.addEventListener('click', function() {
      panel.classList.add('hidden');
    });
  }

  // 初始更新
  updateActionsList();

  // 添加拖拽功能
  (function() {
    const header = document.querySelector('.recorder-header');
    if (!header) return;
    
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    // 从localStorage恢复位置
    try {
      const savedPosition = localStorage.getItem('playwright-recorder-panel-position');
      if (savedPosition) {
        const pos = JSON.parse(savedPosition);
        xOffset = pos.x || 0;
        yOffset = pos.y || 0;
        panel.style.left = xOffset + 'px';
        panel.style.top = yOffset + 'px';
        panel.style.right = 'auto';
      }
    } catch (e) {
      // 忽略错误
    }
    
    function dragStart(e) {
      // 如果点击的是关闭按钮，不启动拖拽
      if (e.target && (e.target.id === 'recorder-close' || e.target.closest('#recorder-close'))) {
        return;
      }
      
      if (e.type === 'touchstart') {
        initialX = e.touches[0].clientX - xOffset;
        initialY = e.touches[0].clientY - yOffset;
      } else {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
      }
      
      if (e.target === header || header.contains(e.target)) {
        isDragging = true;
        header.style.cursor = 'grabbing';
      }
    }
    
    function drag(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      
      if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;
      } else {
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
      }
      
      xOffset = currentX;
      yOffset = currentY;
      
      // 限制在视窗内
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      
      xOffset = Math.max(0, Math.min(xOffset, maxX));
      yOffset = Math.max(0, Math.min(yOffset, maxY));
      
      setTranslate(xOffset, yOffset);
    }
    
    function dragEnd(e) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      header.style.cursor = 'move';
      
      // 保存位置到localStorage
      try {
        localStorage.setItem('playwright-recorder-panel-position', JSON.stringify({
          x: xOffset,
          y: yOffset
        }));
      } catch (e) {
        // 忽略错误
      }
    }
    
    function setTranslate(xPos, yPos) {
      panel.style.left = xPos + 'px';
      panel.style.top = yPos + 'px';
      panel.style.right = 'auto';
    }
    
    // 鼠标事件
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    // 触摸事件（移动设备）
    header.addEventListener('touchstart', dragStart);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', dragEnd);
  })();
})();
