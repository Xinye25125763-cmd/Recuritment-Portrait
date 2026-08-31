/**
 * 网申自动填充 — UI 组件库适配器（M2）
 * 处理 Ant Design、Element UI 等框架封装的选择器，
 * 它们不是原生 <select>，而是 div + input + dropdown 结构。
 */

(function() {
  'use strict';

  const Adapters = {
    registry: [],
    register(name, detectFn, fillFn) { this.registry.push({ name, detectFn, fillFn }); },
    detect(el) { for (const a of this.registry) if (a.detectFn(el)) return a; return null; },
    async fill(el, value) {
      const a = this.detect(el);
      if (!a) return false;
      return a.fillFn(el, value);
    }
  };

  // ── 工具函数 ────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function click(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  }
  function findOptionText(options, value) {
    const v = String(value).toLowerCase().trim();
    let opt = options.find(o => o.text.trim().toLowerCase() === v);
    if (!opt) opt = options.find(o => o.text.trim().toLowerCase().includes(v));
    if (!opt) opt = options.find(o => o.val && o.val.trim().toLowerCase() === v);
    return opt || null;
  }

  // ── Ant Design ──────────────────────────────────────────
  Adapters.register('antd',
    el => !!(el.closest('.ant-select') || el.closest('.ant-picker') || el.closest('.ant-cascader')),
    async (el, value) => {
      const wrap = el.closest('.ant-select') || el.closest('.ant-picker') || el.closest('.ant-cascader');
      if (!wrap) return false;

      // Ant Design Select
      if (wrap.classList.contains('ant-select')) {
        // 展开下拉
        click(wrap);
        await sleep(250);
        // 有时 dropdown 挂载在 body 上
        const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)') ||
                         wrap.querySelector('.ant-select-dropdown');
        if (!dropdown) return false;
        const items = Array.from(dropdown.querySelectorAll('.ant-select-item-option-content'));
        const options = items.map(it => ({ text: it.textContent.trim(), el: it.closest('.ant-select-item-option') || it }));
        const matched = findOptionText(options, value);
        if (matched && matched.el) {
          click(matched.el);
          await sleep(80);
          return true;
        }
        // 未匹配则关闭（按 Escape）
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }

      // Ant Design DatePicker / MonthPicker
      if (wrap.classList.contains('ant-picker')) {
        click(wrap);
        await sleep(250);
        const input = wrap.querySelector('input');
        if (input) {
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await sleep(80);
          return true;
        }
        return false;
      }

      return false;
    }
  );

  // ── Element UI ──────────────────────────────────────────
  Adapters.register('element-ui',
    el => !!(el.closest('.el-select') || el.closest('.el-date-editor') || el.closest('.el-cascader')),
    async (el, value) => {
      const wrap = el.closest('.el-select') || el.closest('.el-date-editor') || el.closest('.el-cascader');
      if (!wrap) return false;

      // Element Select
      if (wrap.classList.contains('el-select')) {
        const trigger = wrap.querySelector('.el-input__inner') || wrap.querySelector('.el-select__input') || wrap;
        click(trigger);
        await sleep(250);
        // dropdown 通常在 body
        const popper = document.querySelector('.el-select-dropdown.el-popper:not(.is-hidden)') ||
                       document.querySelector('.el-select-dropdown__wrap');
        const list = popper ? popper.querySelectorAll('.el-select-dropdown__item') : [];
        const options = Array.from(list).map(it => ({ text: it.textContent.trim(), el: it }));
        const matched = findOptionText(options, value);
        if (matched && matched.el) {
          click(matched.el);
          await sleep(80);
          return true;
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }

      // Element DatePicker
      if (wrap.classList.contains('el-date-editor')) {
        const input = wrap.querySelector('input');
        if (input) {
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await sleep(80);
          return true;
        }
        return false;
      }

      return false;
    }
  );

  // ── Layui（常见校招系统旧模板）───────────────────────────
  Adapters.register('layui',
    el => !!(el.closest('.layui-form-select') || el.closest('.layui-input')),
    async (el, value) => {
      const wrap = el.closest('.layui-form-select');
      if (wrap) {
        const title = wrap.querySelector('.layui-select-title') || wrap.querySelector('.layui-unselect');
        if (title) click(title);
        await sleep(180);
        const options = Array.from(wrap.querySelectorAll('dd')).map(it => ({ text: it.textContent.trim(), el: it }));
        const matched = findOptionText(options, value);
        if (matched && matched.el) { click(matched.el); await sleep(80); return true; }
        return false;
      }
      return false;
    }
  );

  window.__QZHA_ADAPTERS__ = Adapters;
})();
