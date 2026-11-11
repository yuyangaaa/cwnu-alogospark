/* VP uses the site's existing account session; personal records never live in localStorage. */
(() => {
  const byId = id => document.getElementById(id);
  const state = { contests: [], completions: new Map(), tag: '', loaded: false, loading: false, generation: 0, pending: new Set(), progressReady: false };
  const list = byId('vp-contest-list');
  const feedback = message => { byId('vp-feedback').textContent = message; };
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function link(text, url, className = '') {
    const el = node('a', className, text);
    el.href = url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    return el;
  }
  function toggle(contest, compact = false) {
    const label = node('label', `vp-check${compact ? ' vp-check-compact' : ''}`);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.vpId = contest.id;
    input.checked = state.completions.has(contest.id);
    input.disabled = state.pending.size > 0 || Boolean(currentUser && !state.progressReady);
    input.setAttribute('aria-label', `${contest.title}：我已 VP`);
    label.append(input, node('span', '', '我已 VP'));
    return label;
  }
  function card(contest) {
    const article = node('article', 'vp-card');
    article.classList.toggle('is-completed', state.completions.has(contest.id));
    const top = node('div', 'vp-card-top');
    const badges = node('div', 'vp-badges');
    [String(contest.year), contest.series, ...contest.tags].forEach(text => badges.append(node('span', '', text)));
    top.append(badges, toggle(contest));
    const h = node('h3', '', contest.title);
    const duration = `${Math.floor(contest.durationMinutes / 60)} 小时${contest.durationMinutes % 60 ? ` ${contest.durationMinutes % 60} 分钟` : ''}`;
    const meta = node('p', 'vp-card-meta', `${contest.date || `${contest.year} 年`} · ${duration}${contest.problemCount ? ` · ${contest.problemCount} 题` : ''}`);
    const languages = contest.statements.map(statement => statement.language);
    const statementPages = contest.statementPages || [];
    const info = node('div', 'vp-card-info');
    const available = [];
    if (languages.length) available.push(`${[...new Set(languages)].join(' / ')} PDF`);
    if (statementPages.length) available.push(`${[...new Set(statementPages.map(page => page.language))].join(' / ')} 网页`);
    info.append(node('p', 'vp-download-languages', `已核实公开题面：${available.length ? available.join('；') : '待补充'}`));
    if (contest.statementNote) info.append(node('small', 'vp-statement-note', contest.statementNote));
    const onsite = contest.onsiteStatements;
    const paper = node('div', 'vp-onsite');
    const booklet = onsite?.sourceKind === 'contest-booklet';
    const online = onsite?.sourceKind === 'online-contest';
    const manual = onsite?.sourceKind === 'official-manual';
    paper.append(node('b', '', online ? '线上正式赛题面' : booklet ? '公开题册存档' : manual ? '官方参赛手册规定 / 每队' : '正式赛现场题面 / 每队'));
    if (onsite) {
      const copies = [['英文', onsite.englishCopies], ['中文', onsite.chineseCopies]].map(([language,count]) => {
        if (count === 0) return `${language}：未提供`;
        if (Number.isInteger(count)) return `${language} ${count} 份`;
        return onsite.confirmedLanguages?.includes(language) ? `${language}已提供，份数待核实` : `${language}是否发放及份数待核实`;
      }).join('；');
      paper.append(node('p', '', booklet || online ? onsite.confirmedLanguages.join(' / ') : copies));
      paper.append(link(`${onsite.sourceLabel} ↗`, onsite.sourceUrl));
      if (onsite.relatedSourceUrl) paper.append(' · ', link(`${onsite.relatedSourceLabel} ↗`, onsite.relatedSourceUrl));
      paper.append(node('small', '', onsite.note));
    } else {
      paper.append(node('p', 'vp-unavailable', '现场发放语言与份数待核实'));
      paper.append(node('small', '', '本轮公开检索暂未找到可核对的现场发放记录；可下载 PDF 语言见下方。'));
    }
    info.append(paper);
    const medals = node('div', 'vp-medals');
    const medalNames = { gold: '金', silver: '银', bronze: '铜' };
    for (const [key, name] of Object.entries(medalNames)) {
      const cutoff = contest.medals?.[key];
      const medal = node('span', `vp-medal vp-medal-${key}`);
      medal.append(node('b', '', `${name} ${cutoff ? `${cutoff.solved} 题` : '待核实'}`));
      if (cutoff?.penaltySeconds != null) {
        const seconds = cutoff.penaltySeconds % 60;
        medal.append(node('small', '', `罚时 ${Math.floor(cutoff.penaltySeconds / 60)} 分${seconds ? ` ${seconds} 秒` : ''}`));
        medal.title = `评奖组第 ${cutoff.rank} 名 · 最后一题通过于第 ${cutoff.lastAcceptedMinute} 分钟。同题数、同罚时时以原赛排名为准。`;
      }
      medals.append(medal);
    }
    info.append(medals);
    const medalSource = contest.medalSource;
    if (contest.medals) {
      const group = medalSource?.group === '全国邀请赛' ? '全国邀请赛组' : '正式组';
      const label = medalSource?.method === 'archived-quota-provisional-cutoff' ? '终榜存档牌线' : `${group}末位获奖成绩`;
      info.append(node('small', 'vp-medal-note', `${label} · 罚时为总计分时间`));
    }
    if (contest.medalNote) info.append(node('small', 'vp-medal-note', contest.medalNote));
    if (contest.vpNote) info.append(node('small', 'vp-medal-note', contest.vpNote));
    const actions = node('div', 'vp-card-actions');
    const entryUrl = contest.cfUrl || contest.vpUrl || contest.qojUrl;
    const platform = contest.cfUrl ? 'CF' : contest.vpPlatform || 'QOJ';
    if (entryUrl) actions.append(link(`前往 ${platform} · VP ↗`, entryUrl, 'vp-primary-link'));
    else actions.append(node('span', 'vp-unavailable', '练习入口待补充'));
    contest.statements.forEach(statement => {
      const pdf = link(`${statement.language} PDF${statement.sourceLabel ? `（${statement.sourceLabel}）` : ''} ↗`, statement.url, 'vp-pdf-link');
      if (statement.sourceLabel) pdf.title = statement.sourceLabel;
      actions.append(pdf);
    });
    statementPages.forEach(page => {
      actions.append(link(`${page.language}网页题面${page.sourceLabel ? `（${page.sourceLabel}）` : ''} ↗`, page.url, 'vp-pdf-link'));
    });
    if (!contest.statements.length) actions.append(node('span', 'vp-unavailable', '题面 PDF 待补充'));
    const sources = node('div', 'vp-card-sources');
    if (contest.boardUrl) sources.append(link('原赛榜单 ↗', contest.boardUrl));
    if (medalSource?.boardUrl && medalSource.boardUrl !== contest.boardUrl) sources.append(link('牌线所用终榜 ↗', medalSource.boardUrl));
    if (medalSource?.awardUrl) sources.append(link('获奖资料 ↗', medalSource.awardUrl));
    if (medalSource?.verificationUrl) sources.append(link('交叉核对 ↗', medalSource.verificationUrl));
    if (contest.qojUrl && contest.qojUrl !== entryUrl) sources.append(link('QOJ 备用 ↗', contest.qojUrl));
    sources.append(link('资料来源 ↗', contest.sourceUrl));
    article.append(top, h, meta, info, actions, sources);
    return article;
  }
  function matches(contest) {
    const terms = byId('vp-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [contest.title, contest.englishTitle, contest.series, ...contest.tags, contest.year].join(' ').toLowerCase();
    const status = byId('vp-status').value;
    if (status && !currentUser) return false;
    return (!byId('vp-year').value || String(contest.year) === byId('vp-year').value)
      && (!byId('vp-series').value || contest.series === byId('vp-series').value)
      && (!state.tag || contest.tags.includes(state.tag))
      && (!status || (status === 'done') === state.completions.has(contest.id))
      && terms.every(term => haystack.includes(term));
  }
  function render() {
    const contests = state.contests.filter(matches).sort((a, b) => {
      const date = (b.date || String(b.year)).localeCompare(a.date || String(a.year)) || a.title.localeCompare(b.title, 'zh-CN');
      return byId('vp-sort').value === 'oldest' ? -date : date;
    });
    list.replaceChildren(...contests.map(card));
    if (state.loaded && !contests.length) {
      list.append(node('p', 'vp-empty', byId('vp-status').value && !currentUser ? '登录后即可按个人 VP 状态筛选比赛。' : '没有符合条件的比赛，试试其他年份或标签。'));
    }
    byId('vp-result-count').textContent = `${contests.length} 场`;
    const completed = [...state.completions].map(([id, date]) => ({ contest: state.contests.find(contest => contest.id === id), date })).filter(item => item.contest).sort((a, b) => b.date.localeCompare(a.date) || a.contest.title.localeCompare(b.contest.title, 'zh-CN'));
    byId('vp-total-completed').textContent = String(completed.length);
    byId('vp-history-count').textContent = `${completed.length} 场`;
    byId('vp-history-note').textContent = !currentUser ? '登录后，勾选「我已 VP」即可保存到账号。' : !state.progressReady ? '正在同步账号 VP 记录…' : completed.length ? '按标记时间排列，取消勾选即可移出。记录由你手动确认。' : '还没有 VP 记录。选一场比赛，完成后勾选「我已 VP」。';
    byId('vp-history-list').replaceChildren(...completed.map(({ contest, date }) => {
      const row = node('article', 'vp-history-row');
      const copy = node('div');
      const markedDate = new Date(`${date.replace(' ', 'T')}Z`).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
      copy.append(node('h3', '', contest.title), node('p', '', `${contest.year} · ${contest.series} · ${contest.tags.join(' / ')} · 标记于 ${markedDate}`));
      row.append(copy);
      if (contest.cfUrl) row.append(link('再次打开 CF ↗', contest.cfUrl));
      row.append(toggle(contest, true));
      return row;
    }));
  }
  async function loadCatalog() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    list.setAttribute('aria-busy', 'true');
    feedback('正在读取比赛资料…');
    try {
      const result = await authRequest('/api/vp/contests');
      state.contests = result.contests;
      state.loaded = true;
      byId('vp-data-note').textContent = `首批收录 ${result.contests.length} 场 · 资料核对于 ${result.verifiedAt}。原赛纸质份数单独核对，PDF 下载语言另列。金银铜线显示正式队末位获奖队的解题数与罚时；成绩完全相同时仍按原榜单规则判定。`;
      feedback('');
      render();
    } catch (error) {
      feedback(`比赛资料加载失败：${error.message}`);
      const retry = node('button', 'vp-reset', '重新加载');
      retry.type = 'button';
      retry.addEventListener('click', loadCatalog);
      list.replaceChildren(retry);
    } finally {
      state.loading = false;
      list.setAttribute('aria-busy', 'false');
    }
  }
  async function loadProgress() {
    const generation = ++state.generation;
    const userId = currentUser?.id;
    state.completions.clear();
    state.pending.clear();
    state.progressReady = false;
    render();
    if (!userId) return;
    try {
      const result = await authRequest('/api/vp/progress');
      if (generation !== state.generation || currentUser?.id !== userId) return;
      state.completions = new Map(result.completions.map(item => [item.contestId, item.completedAt]));
      state.progressReady = true;
      render();
    } catch (error) {
      if (generation !== state.generation || currentUser?.id !== userId) return;
      feedback(`VP 记录同步失败：${error.message}。重新进入 VP 页面可重试。`);
      byId('vp-history-note').textContent = 'VP 记录同步失败，请重新进入页面重试。';
    }
  }
  async function complete(event) {
    const input = event.target.closest('input[data-vp-id]');
    if (!input) return;
    const id = input.dataset.vpId;
    const completed = input.checked;
    input.checked = state.completions.has(id);
    if (!currentUser) { openAuth('login'); return; }
    if (state.pending.size || !state.progressReady) return;
    const userId = currentUser.id;
    const generation = state.generation;
    state.pending.add(id);
    feedback('正在保存 VP 记录…');
    render();
    try {
      const result = await authRequest('/api/vp/completion', { method: 'POST', body: JSON.stringify({ contestId: id, completed }) });
      if (generation !== state.generation || currentUser?.id !== userId) return;
      state.completions = new Map(result.completions.map(item => [item.contestId, item.completedAt]));
      feedback(completed ? '已保存到「我已 VP 的场次」。' : '已取消这场比赛的 VP 标记。');
    } catch (error) {
      if (generation === state.generation && currentUser?.id === userId) feedback(`保存失败：${error.message}，请重试。`);
    } finally {
      if (generation === state.generation && currentUser?.id === userId) { state.pending.delete(id); render(); }
    }
  }
  byId('vp-page').addEventListener('change', complete);
  ['vp-search', 'vp-year', 'vp-series', 'vp-status', 'vp-sort'].forEach(id => byId(id).addEventListener(id === 'vp-search' ? 'input' : 'change', render));
  byId('vp-tags').addEventListener('click', event => {
    const button = event.target.closest('[data-vp-tag]');
    if (!button) return;
    state.tag = button.dataset.vpTag;
    byId('vp-tags').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  });
  byId('vp-reset').addEventListener('click', () => {
    ['vp-search', 'vp-year', 'vp-series', 'vp-status'].forEach(id => { byId(id).value = ''; });
    byId('vp-sort').value = 'newest';
    byId('vp-tags').querySelector('button').click();
  });
  window.addEventListener('algospark:account-change', () => { feedback(''); loadProgress(); });
  window.addEventListener('hashchange', () => { if (getRoute() === 'vp') { loadCatalog(); if (currentUser && !state.pending.size) loadProgress(); } });
  if (getRoute() === 'vp') loadCatalog();
  loadProgress();
})();
