const menu = document.querySelector('.main-nav');
const menuToggle = document.querySelector('.menu-toggle');
const lessonLinks = [...document.querySelectorAll('.doc-link')];
const lessons = [...document.querySelectorAll('.lesson')];
const trackedLessons = lessons.filter(lesson => lesson.dataset.lesson);
const cppPage = document.getElementById('cpp-page');
const algorithmsPage = document.getElementById('algorithms-page');
const toast = document.querySelector('.toast');
const storageKey = 'algospark-cpp-progress-v2';
const algorithmStorageKey = 'algospark-algorithm-progress-v1';
const activityStorageKey = 'algospark-learning-days-v1';
const pages = [...document.querySelectorAll('[data-page]')];
const routeLinks = [...document.querySelectorAll('[data-route]')];
const navLinks = [...document.querySelectorAll('.nav-link')];
let currentUser = null;
let leaderboardScope = 'all';
let serverLearningDays = null;
let serverLastContent = null;
let currentCppLesson = lessons.find(lesson => lesson.classList.contains('active'))?.id || lessons[0]?.id;
let algorithmLearningReady = false;
const avatarThemes = new Set(['aurora', 'ocean', 'forest', 'sunset', 'berry', 'midnight', 'fox', 'nailong', 'weekflare', 'crownlight', 'royal']);
const avatarArt = {
  aurora: 'cloud', ocean: 'sea', forest: 'bamboo',
  sunset: 'sunset', berry: 'plum', midnight: 'stars',
  fox: 'sun-fox', nailong: 'nailong',
  weekflare: 'week-owl', crownlight: 'star-swordsman', royal: 'royal-dragon'
};
const avatarFrames = new Set(['none', 'frost', 'gold', 'nebula', 'laurel', 'solar', 'sovereign']);
const profileDecors = new Set(['none', 'bamboo', 'starlight', 'champion', 'podium', 'weekorbit', 'throne']);

function normalizeAvatarTheme(theme) {
  return avatarThemes.has(theme) ? theme : 'aurora';
}

function avatarInitial(nickname) {
  return [...String(nickname || '')][0]?.toUpperCase() || 'A';
}

function applyAvatarTheme(element, theme) {
  if (!element) return;
  const letter = document.createElement('span');
  letter.className = 'avatar-letter';
  letter.textContent = element.textContent || 'A';
  element.replaceChildren(letter);
  element.classList.add('avatar-surface');
  element.dataset.avatarTheme = normalizeAvatarTheme(theme);
  const artwork = avatarArt[element.dataset.avatarTheme];
  element.classList.toggle('has-avatar-art', Boolean(artwork));
  if (artwork) {
    const img = document.createElement('img');
    img.className = 'avatar-art';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = `/avatar-${artwork}-v1.webp`;
    img.addEventListener('error', () => { img.remove(); element.classList.remove('has-avatar-art'); }, { once: true });
    element.prepend(img);
  }
}

function normalizeAvatarFrame(frame) {
  return avatarFrames.has(frame) ? frame : 'none';
}

function normalizeProfileDecor(decor) {
  return profileDecors.has(decor) ? decor : 'none';
}

function applyAvatarFrame(element, frame) {
  if (element) element.dataset.avatarFrame = normalizeAvatarFrame(frame);
}

function getRoute() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('cpp-')) return 'cpp';
  if (hash.startsWith('algo-')) return 'algorithms';
  if (hash === 'vp-history') return 'vp';
  return ['home', 'contests', 'cpp', 'practice', 'vp', 'algorithms', 'profile', 'leaderboard', 'resources', 'admin'].includes(hash) ? hash : 'home';
}

function renderRoute(scroll = true) {
  const route = getRoute();
  pages.forEach(page => page.classList.toggle('active', page.dataset.page === route));
  navLinks.forEach(link => link.classList.toggle('active', link.dataset.route === route));
  menu.classList.remove('open');
  document.body.classList.remove('menu-open', 'sidebar-open');
  menuToggle.setAttribute('aria-expanded', 'false');

  const target = location.hash.slice(1);
  const cppReading = route === 'cpp';
  const algorithmReading = route === 'algorithms';
  cppPage?.classList.toggle('reading-mode', cppReading);
  algorithmsPage?.classList.toggle('reading-mode', algorithmReading);
  document.body.classList.toggle('cpp-reading-active', cppReading);
  document.body.classList.toggle('algorithm-reading-active', algorithmReading);
  if (route === 'cpp') {
    currentCppLesson = lessons.some(lesson => lesson.id === target) ? target : lessons[0]?.id;
    if (target !== currentCppLesson) history.replaceState(null, '', `#${currentCppLesson}`);
    lessons.forEach(lesson => lesson.classList.toggle('active', lesson.id === currentCppLesson));
    let activeCppLink;
    lessonLinks.forEach(link => {
      const active = link.getAttribute('href') === `#${currentCppLesson}`;
      link.classList.toggle('active', active);
      if (active) activeCppLink = link;
    });
    requestAnimationFrame(() => {
      alignCppReadingLayout();
      resetCppContentScroll();
      scrollCppSidebarLinkIntoView(activeCppLink);
    });
  } else if (route === 'algorithms') {
    const algorithmTarget = document.getElementById(target)?.classList.contains('algorithm-lesson') ? target : 'algo-overview';
    if (target !== algorithmTarget) history.replaceState(null, '', `#${algorithmTarget}`);
    if (algorithmLearningReady) {
      showAlgorithmLesson(algorithmTarget, { updateHash: false });
    } else {
      document.querySelectorAll('.algorithm-lesson').forEach(lesson => lesson.classList.toggle('active', lesson.id === algorithmTarget));
      requestAnimationFrame(() => {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    }
  } else if (route === 'vp' && target === 'vp-history') {
    requestAnimationFrame(() => document.getElementById('vp-history').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } else if (scroll) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo(0, 0);
  }
  if (route === 'leaderboard') loadLeaderboard();
  if (route === 'resources') loadResources();
  if (route === 'admin') {
    renderAdminAccessState();
    if (currentUser?.isAdmin) loadAdminDashboard();
  }
}

function renderAdminAccessState() {
  const accessState = document.getElementById('admin-access-state');
  const adminContent = document.getElementById('admin-content');
  if (!accessState || !adminContent) return;

  const allowed = Boolean(currentUser?.isAdmin);
  accessState.hidden = allowed;
  adminContent.hidden = !allowed;
  if (allowed) return;

  document.getElementById('admin-access-kicker').textContent = currentUser ? 'ACCESS DENIED' : 'ADMIN SIGN IN';
  document.getElementById('admin-access-title').textContent = currentUser ? '你没有管理后台权限' : '请先登录管理员账号';
  document.getElementById('admin-access-message').textContent = currentUser
    ? '当前账号是普通用户，无法查看题目配置、评测记录和其他管理内容。'
    : '管理后台仅对管理员开放，登录普通账号后仍无法访问。';
}

window.addEventListener('hashchange', () => renderRoute(true));
routeLinks.forEach(link => link.addEventListener('click', event => {
  if (getRoute() === link.dataset.route && location.hash === `#${link.dataset.route}`) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}));

menuToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  document.body.classList.toggle('menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.main-nav a').forEach(link => link.addEventListener('click', () => {
  menu.classList.remove('open');
  document.body.classList.remove('menu-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
}

function scrollCppSidebarLinkIntoView(link) {
  const sidebar = document.querySelector('.cpp-page .docs-sidebar');
  if (!sidebar || !link) return;
  const sidebarRect = sidebar.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const linkTop = linkRect.top - sidebarRect.top + sidebar.scrollTop;
  const linkBottom = linkTop + linkRect.height;
  const padding = 18;

  if (linkTop < sidebar.scrollTop + padding) {
    sidebar.scrollTo({ top: Math.max(0, linkTop - padding), behavior: 'auto' });
  } else if (linkBottom > sidebar.scrollTop + sidebar.clientHeight - padding) {
    sidebar.scrollTo({ top: linkBottom - sidebar.clientHeight + padding, behavior: 'auto' });
  }
}

function alignCppReadingLayout() {
  const layout = document.querySelector('.cpp-page .docs-layout');
  if (!layout) return;
  if (window.matchMedia('(max-width: 760px)').matches) {
    layout.scrollIntoView({ behavior: 'auto', block: 'start' });
    return;
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function resetCppContentScroll() {
  const content = document.querySelector('.cpp-page .docs-content');
  if (content) content.scrollTop = 0;
}

document.querySelector('.catalog-trigger').addEventListener('click', () => {
  document.querySelector('.docs-sidebar').scrollTo({ top: 0, behavior: 'auto' });
  document.body.classList.add('sidebar-open');
});
document.querySelector('.sidebar-close').addEventListener('click', closeSidebar);
document.querySelector('.cpp-page .docs-sidebar').addEventListener('wheel', event => {
  if (!cppPage?.classList.contains('reading-mode') || window.matchMedia('(max-width: 760px)').matches) return;
  event.preventDefault();
  const sidebar = event.currentTarget;
  let delta = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= sidebar.clientHeight;
  sidebar.scrollTop += delta;
}, { passive: false });
document.addEventListener('click', event => {
  if (document.body.classList.contains('sidebar-open') &&
      !event.target.closest('.docs-sidebar') &&
      !event.target.closest('.catalog-trigger')) closeSidebar();
});

function showCppLesson(id, { updateHash = true, moveToTop = true } = {}) {
  const lesson = lessons.find(item => item.id === id) || lessons[0];
  if (!lesson) return;
  cppPage?.classList.add('reading-mode');
  document.body.classList.add('cpp-reading-active');
  currentCppLesson = lesson.id;
  lessons.forEach(item => item.classList.toggle('active', item === lesson));
  let activeLink;
  lessonLinks.forEach(link => {
    const active = link.getAttribute('href') === `#${lesson.id}`;
    link.classList.toggle('active', active);
    if (active) activeLink = link;
  });
  if (updateHash) history.replaceState(null, '', `#${lesson.id}`);
  if (moveToTop) requestAnimationFrame(() => {
    alignCppReadingLayout();
    resetCppContentScroll();
    scrollCppSidebarLinkIntoView(activeLink);
  });
  closeSidebar();
  if (currentUser && lesson.dataset.lesson) syncLearningVisit('cpp', lesson.dataset.lesson);
}

function createCppPagerButton(direction, targetLesson) {
  const button = document.createElement('button');
  button.type = 'button';
  if (!targetLesson) {
    button.disabled = true;
    button.innerHTML = direction === 'previous'
      ? '<span>←</span><div><small>上一篇</small><b>已经是第一章</b></div>'
      : '<div><small>下一篇</small><b>C++ 语法学习完成</b></div><span>→</span>';
    return button;
  }
  const title = targetLesson.querySelector('h2')?.textContent || '下一章';
  button.innerHTML = direction === 'previous'
    ? `<span>←</span><div><small>上一篇</small><b>${title}</b></div>`
    : `<div><small>下一篇</small><b>${title}</b></div><span>→</span>`;
  button.addEventListener('click', () => showCppLesson(targetLesson.id));
  return button;
}

lessons.forEach((lesson, index) => {
  const pager = document.createElement('nav');
  pager.className = 'algorithm-lesson-pager cpp-lesson-pager';
  pager.setAttribute('aria-label', 'C++ 语法章节翻页');
  pager.append(
    createCppPagerButton('previous', lessons[index - 1]),
    createCppPagerButton('next', lessons[index + 1])
  );
  lesson.appendChild(pager);
});

lessonLinks.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  showCppLesson(link.getAttribute('href').slice(1));
}));

if (location.hash.startsWith('#cpp-')) showCppLesson(location.hash.slice(1), { updateHash: false, moveToTop: false });

function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function updateHomeLearning() {
  const link = document.getElementById('home-continue-link');
  const label = document.getElementById('home-continue-label');
  const note = document.getElementById('home-learning-note');
  if (!link || !label || !note) return;
  const completed = new Set(readProgress().filter(id => trackedLessons.some(lesson => lesson.dataset.lesson === id)));
  let target = completed.size ? trackedLessons.find(lesson => !completed.has(lesson.dataset.lesson)) : null;
  if (serverLastContent?.type === 'cpp') {
    target = trackedLessons.find(lesson => lesson.dataset.lesson === serverLastContent.id) || target;
  } else if (serverLastContent?.type === 'algorithm') {
    const last = document.getElementById(serverLastContent.id);
    if (last?.classList.contains('algorithm-lesson')) target = last;
  }
  const allCppDone = completed.size === trackedLessons.length && trackedLessons.length > 0;
  link.setAttribute('href', target ? `#${target.id}` : allCppDone ? '#algo-foundation-overview' : '#cpp-environment');
  label.textContent = target ? '继续学习' : allCppDone ? '开始学习基础算法' : '从零开始学习';
  note.textContent = target
    ? `接着学：${target.querySelector('h2')?.textContent || '你的学习章节'}`
    : allCppDone ? 'C++ 基础已完成，向下一站出发。' : '不用急，今天比昨天多懂一点就很好。';
}

function updateProgress() {
  const completed = readProgress().filter(id => trackedLessons.some(lesson => lesson.dataset.lesson === id));
  const percent = `${trackedLessons.length ? (completed.length / trackedLessons.length) * 100 : 0}%`;
  document.getElementById('progress-text').textContent = `${completed.length} / ${trackedLessons.length}`;
  document.getElementById('progress-bar').style.width = percent;
  document.querySelectorAll('[data-complete]').forEach(button => {
    const done = completed.includes(button.dataset.complete);
    button.classList.toggle('completed', done);
    button.innerHTML = done ? '<span>✓</span> 本章已完成，点击可取消' : '<span>✓</span> 标记本章为已完成';
  });
  updateHomeLearning();
}

document.querySelectorAll('[data-complete]').forEach(button => button.addEventListener('click', async () => {
  const completed = readProgress();
  const lesson = button.dataset.complete;
  const next = completed.includes(lesson)
    ? completed.filter(item => item !== lesson)
    : [...completed, lesson];
  if (!currentUser) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    return updateProgress();
  }
  button.disabled = true;
  try {
    const result = await authRequest('/api/learning/progress', {
      method: 'POST',
      body: JSON.stringify({ type: 'cpp', contentId: lesson, completed: !completed.includes(lesson) })
    });
    applyLearningProgress(result);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}));

const cppKeywords = new Set([
  'alignas', 'alignof', 'asm', 'break', 'case', 'catch', 'class', 'const', 'constexpr',
  'continue', 'default', 'delete', 'do', 'else', 'enum', 'explicit', 'export', 'extern',
  'for', 'friend', 'goto', 'if', 'inline', 'namespace', 'new', 'noexcept', 'operator',
  'private', 'protected', 'public', 'return', 'sizeof', 'static', 'struct', 'switch',
  'template', 'this', 'throw', 'try', 'typedef', 'typename', 'union', 'using', 'virtual',
  'volatile', 'while'
]);
const cppTypes = new Set([
  'auto', 'bool', 'char', 'double', 'float', 'int', 'long', 'short', 'signed', 'unsigned',
  'void', 'wchar_t', 'size_t', 'string', 'vector', 'array', 'deque', 'list', 'map',
  'set', 'unordered_map', 'unordered_set', 'pair', 'queue', 'stack', 'priority_queue'
]);
const cppLiterals = new Set(['true', 'false', 'nullptr']);
const cppTokenPattern = /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[A-Za-z_]\w*|<[A-Za-z0-9_./+\-]+>|\b(?:0[xX][\dA-Fa-f']+|\d[\d']*(?:\.\d+)?(?:[uUlLfF]+)?)\b|\b[A-Za-z_]\w*\b/g;

function cppTokenClass(token, followingText) {
  if (token.startsWith('//')) return 'c-comment';
  if (token.startsWith('#')) return 'c-pink';
  if (token.startsWith('<') || token.startsWith('"') || token.startsWith("'")) return 'c-green';
  if (/^(?:0[xX]|\d)/.test(token) || cppLiterals.has(token)) return 'c-purple';
  if (cppKeywords.has(token)) return 'c-pink';
  if (cppTypes.has(token)) return 'c-blue';
  if (/^\s*\(/.test(followingText)) return 'c-function';
  return '';
}

function highlightCppCode() {
  document.querySelectorAll('.lesson-code code').forEach(code => {
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(textNode => {
      if (textNode.parentElement.closest('[class^="c-"], [class*=" c-"], .code-line > b')) return;
      const source = textNode.nodeValue;
      const fragment = document.createDocumentFragment();
      let cursor = 0;

      for (const match of source.matchAll(cppTokenPattern)) {
        const tokenClass = cppTokenClass(match[0], source.slice(match.index + match[0].length));
        if (!tokenClass) continue;
        fragment.append(document.createTextNode(source.slice(cursor, match.index)));
        const token = document.createElement('span');
        token.className = tokenClass;
        token.textContent = match[0];
        fragment.append(token);
        cursor = match.index + match[0].length;
      }

      if (cursor > 0) {
        fragment.append(document.createTextNode(source.slice(cursor)));
        textNode.replaceWith(fragment);
      }
    });
  });
}

highlightCppCode();

document.querySelectorAll('.copy-button').forEach(button => button.addEventListener('click', async () => {
  const code = button.closest('.lesson-code').querySelector('code').innerText;
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = '已复制';
    toast.classList.add('show');
    setTimeout(() => {
      button.textContent = '复制代码';
      toast.classList.remove('show');
    }, 1600);
  } catch {
    button.textContent = '请手动选择代码';
  }
}));

updateProgress();
renderRoute(false);

const quotes = [
  { text: '掬水月在手，弄花香满衣。', author: '于良史《春山夜月》' },
  { text: '醉后不知天在水，满船清梦压星河。', author: '唐珙《题龙阳县青草湖》' },
  { text: '疏影横斜水清浅，暗香浮动月黄昏。', author: '林逋《山园小梅·其一》' },
  { text: '树深时见鹿，溪午不闻钟。', author: '李白《访戴天山道士不遇》' },
  { text: '雨中山果落，灯下草虫鸣。', author: '王维《秋夜独坐》' },
  { text: '落木千山天远大，澄江一道月分明。', author: '黄庭坚《登快阁》' },
  { text: '山中何事？松花酿酒，春水煎茶。', author: '张可久《人月圆·山中书事》' },
  { text: '春水碧于天，画船听雨眠。', author: '韦庄《菩萨蛮·人人尽说江南好》' },
  { text: '渡头馀落日，墟里上孤烟。', author: '王维《辋川闲居赠裴秀才迪》' },
  { text: '空山松子落，幽人应未眠。', author: '韦应物《秋夜寄邱员外》' },
  { text: '浮云一别后，流水十年间。', author: '韦应物《淮上喜会梁川故人》' },
  { text: '微微风簇浪，散作满河星。', author: '查慎行《舟夜书所见》' }
];
const quoteText = document.getElementById('quote-text');
const quoteAuthor = document.getElementById('quote-author');
const quoteCurrent = document.getElementById('quote-current');
const quoteTotal = document.getElementById('quote-total');
const quoteDots = document.querySelector('.quote-dots');
const quoteSection = document.querySelector('.quote-carousel');
let quoteIndex = 0;
let quoteTimer;

quotes.forEach((_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `查看第 ${index + 1} 句诗`);
  button.addEventListener('click', () => showQuote(index));
  quoteDots.appendChild(button);
});

function showQuote(index) {
  quoteIndex = index;
  quoteText.classList.add('changing');
  quoteAuthor.classList.add('changing');
  setTimeout(() => {
    quoteText.textContent = quotes[index].text;
    quoteAuthor.textContent = quotes[index].author;
    quoteCurrent.textContent = String(index + 1).padStart(2, '0');
    [...quoteDots.children].forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
    quoteText.classList.remove('changing');
    quoteAuthor.classList.remove('changing');
  }, 220);
}

function startQuotes() {
  clearInterval(quoteTimer);
  quoteTimer = setInterval(() => showQuote((quoteIndex + 1) % quotes.length), 4500);
}

quoteSection?.addEventListener('mouseenter', () => clearInterval(quoteTimer));
quoteSection?.addEventListener('mouseleave', startQuotes);
quoteSection?.addEventListener('focusin', () => clearInterval(quoteTimer));
quoteSection?.addEventListener('focusout', startQuotes);
if (quoteTotal) quoteTotal.textContent = String(quotes.length).padStart(2, '0');
showQuote(0);
startQuotes();

// The ranking follows the home carousel: 4.5-second cross-fades and direct dot selection.
const rankingPoems = [
  { text: '今日长缨在手，何时缚住苍龙？', author: '毛泽东《清平乐·六盘山》' },
  { text: '尽挹西江，细斟北斗，万象为宾客。', author: '张孝祥《念奴娇·过洞庭》' },
  { text: '兴酣落笔摇五岳，诗成笑傲凌沧洲。', author: '李白《江上吟》' },
  { text: '我见青山多妩媚，料青山见我应如是。', author: '辛弃疾《贺新郎·甚矣吾衰矣》' },
  { text: '一点浩然气，千里快哉风。', author: '苏轼《水调歌头·黄州快哉亭赠张偓佺》' },
  { text: '素月分辉，明河共影，表里俱澄澈。', author: '张孝祥《念奴娇·过洞庭》' },
  { text: '天清一雁远，海阔孤帆迟。', author: '李白《送张舍人之江东》' },
  { text: '树色随山迥，河声入海遥。', author: '许浑《秋日赴阙题潼关驿楼》' },
  { text: '江流天地外，山色有无中。', author: '王维《汉江临泛》' },
  { text: '楼船夜雪瓜洲渡，铁马秋风大散关。', author: '陆游《书愤·其一》' },
  { text: '俱怀逸兴壮思飞，欲上青天揽明月。', author: '李白《宣州谢朓楼饯别校书叔云》' },
  { text: '白云回望合，青霭入看无。', author: '王维《终南山》' }
];
const rankingPoetry = document.querySelector('.ranking-poetry');
if (rankingPoetry) {
  const verse = document.getElementById('ranking-poetry-verse');
  const text = document.getElementById('ranking-poetry-text');
  const author = document.getElementById('ranking-poetry-author');
  const current = document.getElementById('ranking-poetry-current');
  const total = document.getElementById('ranking-poetry-total');
  const dots = document.getElementById('ranking-poetry-dots');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer;
  let transition;

  function startRankingPoems() {
    clearInterval(timer);
    timer = setInterval(() => showRankingPoem(index + 1), 4500);
  }
  function showRankingPoem(nextIndex) {
    clearTimeout(transition);
    index = (nextIndex + rankingPoems.length) % rankingPoems.length;
    verse.classList.add('changing');
    transition = setTimeout(() => {
      text.textContent = rankingPoems[index].text;
      author.textContent = rankingPoems[index].author;
      current.textContent = String(index + 1).padStart(2, '0');
      [...dots.children].forEach((dot, dotIndex) => {
        const selected = dotIndex === index;
        dot.classList.toggle('active', selected);
        dot.setAttribute('aria-pressed', String(selected));
      });
      verse.classList.remove('changing');
    }, reduced.matches ? 0 : 220);
  }
  rankingPoems.forEach((poem, poemIndex) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `查看第 ${poemIndex + 1} 句诗：${poem.text}`);
    dot.setAttribute('aria-pressed', String(poemIndex === 0));
    dot.classList.toggle('active', poemIndex === 0);
    dot.addEventListener('click', () => showRankingPoem(poemIndex));
    dots.append(dot);
  });
  total.textContent = String(rankingPoems.length).padStart(2, '0');
  rankingPoetry.addEventListener('mouseenter', () => clearInterval(timer));
  rankingPoetry.addEventListener('mouseleave', startRankingPoems);
  rankingPoetry.addEventListener('focusin', () => clearInterval(timer));
  rankingPoetry.addEventListener('focusout', startRankingPoems);
  showRankingPoem(0);
  startRankingPoems();
}

const practiceTabs = [...document.querySelectorAll('[data-practice-tab]')];
const practicePanels = [...document.querySelectorAll('[data-practice-panel]')];
const practiceFilters = [...document.querySelectorAll('[data-practice-filter]')];
const practiceGroups = [...document.querySelectorAll('[data-practice-group]')];
const problemCards = [...document.querySelectorAll('[data-problem]')];
const practiceStorageKey = 'algospark-practice-progress-v1';
let currentPracticeScore = 0;
let currentPracticeCompletedCount = 0;
let currentPracticeTotalCount = 0;
let currentOjHeatmap = { days: [], totalAccepted: 0, activeDays: 0, longestStreak: 0, weekAccepted: 0 };
let currentProfileCollection = { achievements: [], avatarThemes: [], frames: [], decors: [] };

function readPracticeProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(practiceStorageKey));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function updatePracticeProgress() {
  const scoreText = document.getElementById('practice-score-text');
  const completed = new Set(readPracticeProgress());
  updateHydroPracticeProgress();
  updateLuoguPracticeProgress(completed);
  if (scoreText) scoreText.textContent = currentPracticeScore;
  problemCards.forEach(card => {
    const done = completed.has(card.dataset.problem);
    const button = card.querySelector('[data-problem-complete]');
    const points = card.closest('[data-practice-points]')?.dataset.practicePoints || '';
    card.classList.toggle('completed', done);
    if (button) {
      button.classList.toggle('completed', done);
      button.textContent = done ? '✓ 已完成' : `标记完成${points ? ` · +${points} 分` : ''}`;
      button.setAttribute('aria-pressed', String(done));
    }
  });
}

async function loadServerPracticeProgress() {
  if (!currentUser) return;
  const userId = currentUser.id;
  try {
    const result = await authRequest('/api/practice/progress');
    if (currentUser?.id !== userId) return;
    localStorage.setItem(practiceStorageKey, JSON.stringify(result.completed));
    currentPracticeScore = result.score;
    currentPracticeCompletedCount = result.completedCount;
    currentPracticeTotalCount = result.totalCount;
    currentOjHeatmap = result.ojHeatmap || currentOjHeatmap;
    currentProfileCollection = result.collection || currentProfileCollection;
    updatePracticeProgress();
    renderProfile();
    loadNotifications();
  } catch (error) {
    console.error(error);
  }
}

document.querySelectorAll('[data-problem-complete]').forEach(button => button.addEventListener('click', async () => {
  if (!currentUser) {
    openAuth('login');
    return setAuthStatus('登录后即可标记洛谷题目并获得积分。');
  }
  const problemId = button.dataset.problemComplete;
  const userId = currentUser.id;
  const completed = readPracticeProgress();
  const shouldComplete = !completed.includes(problemId);
  button.disabled = true;
  try {
    const result = await authRequest('/api/practice/completion', {
      method: 'POST',
      body: JSON.stringify({ problemId, completed: shouldComplete })
    });
    if (currentUser?.id !== userId) return;
    localStorage.setItem(practiceStorageKey, JSON.stringify(result.completed));
    currentPracticeScore = result.score;
    currentPracticeCompletedCount = result.completedCount;
    currentPracticeTotalCount = result.totalCount;
    currentOjHeatmap = result.ojHeatmap || currentOjHeatmap;
    currentProfileCollection = result.collection || currentProfileCollection;
    updatePracticeProgress();
    renderProfile();
    loadNotifications();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}));

practiceTabs.forEach(tab => tab.addEventListener('click', () => {
  const selected = tab.dataset.practiceTab;
  practiceTabs.forEach(item => {
    const active = item === tab;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });
  practicePanels.forEach(panel => {
    const active = panel.dataset.practicePanel === selected;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}));

const hydroTrackSections = [...document.querySelectorAll('[data-hydro-track]')];
const algorithmTrackTabs = [...document.querySelectorAll('[data-algorithm-track-tab]')];
const algorithmSubtopicFilters = [...document.querySelectorAll('[data-algorithm-subtopic-filter]')];
const algorithmSubtopicGroups = [...document.querySelectorAll('[data-algorithm-subtopic-group]')];
const hydroConnection = document.getElementById('hydro-connection');
const hydroAccountForm = document.getElementById('hydro-account-form');
const hydroUsernameInput = document.getElementById('hydro-username');
const hydroAccountStatus = document.getElementById('hydro-account-status');
const hydroAutoBindButton = document.getElementById('hydro-auto-bind');
const hydroSubmitDialog = document.getElementById('hydro-submit-dialog');
const hydroSubmitForm = document.getElementById('hydro-submit-form');
const hydroSubmitTitle = document.getElementById('hydro-submit-title');
const hydroSubmitProblemId = document.getElementById('hydro-submit-problem-id');
const hydroSubmitLanguage = document.getElementById('hydro-submit-language');
const hydroSubmitCode = document.getElementById('hydro-submit-code');
const hydroSubmitResult = document.getElementById('hydro-submit-result');
const hydroSubmitButton = document.getElementById('hydro-submit-button');
const hydroSubmitOjLink = document.getElementById('hydro-submit-oj-link');
const hydroStatementContent = document.getElementById('hydro-statement-content');
const hydroStatementTags = document.getElementById('hydro-statement-tags');
let hydroState = { account: null, problems: [] };
let hydroPollToken = 0;
let hydroStatementToken = 0;
let hydroAccountRefreshPromise = null;
let hydroBindingTimer = 0;
let hydroBindingExpiresAt = 0;
let currentAlgorithmTrack = 'foundation';
const hydroCodeDrafts = new Map();
const HYDRO_GRAMMAR_STAGE = {
  AS1001: 'start', AS1002: 'start',
  AS1003: 'basic', AS1004: 'basic', AS1005: 'array-string', AS1006: 'basic', AS1007: 'basic', AS1008: 'basic', AS1009: 'basic',
  AS1010: 'condition', AS1011: 'condition', AS1012: 'condition', AS1013: 'condition',
  AS1014: 'function-struct', AS1015: 'loop', AS1016: 'loop',
  AS1017: 'array-string', AS1018: 'array-string', AS1019: 'array-string', AS1020: 'array-string',
  AS1021: 'function-struct', AS1022: 'function-struct', AS1023: 'function-struct', AS1024: 'basic'
};
const HYDRO_STAGE_LABELS = {
  start: '输入输出配套题', basic: '变量与运算配套题', condition: '条件判断配套题',
  loop: '循环结构配套题', 'array-string': '数组与字符串配套题', 'function-struct': '函数与结构体配套题'
};

function renderPracticeProgressMeter(prefix, completed, total) {
  const text = document.getElementById(`${prefix}-text`);
  const bar = document.getElementById(`${prefix}-bar`);
  const meter = document.getElementById(`${prefix}-meter`);
  if (text) text.textContent = `${completed} / ${total}`;
  if (bar) bar.style.width = `${total ? completed / total * 100 : 0}%`;
  if (meter) {
    meter.setAttribute('aria-valuemax', String(total));
    meter.setAttribute('aria-valuenow', String(completed));
    meter.setAttribute('aria-valuetext', `已完成 ${completed} 题，共 ${total} 题`);
  }
}

function updateHydroPracticeProgress() {
  const problems = hydroState.problems.filter(problem => !problem.demo);
  for (const track of ['all', 'grammar', 'algorithm']) {
    const items = track === 'all' ? problems : problems.filter(problem => problem.track === track);
    const completed = currentUser ? items.filter(problem => problem.accepted).length : 0;
    const prefix = track === 'all' ? 'practice-progress' : `practice-${track}-progress`;
    renderPracticeProgressMeter(prefix, completed, items.length);
  }
}

function updateLuoguPracticeProgress(completed) {
  for (const track of ['all', 'grammar', 'algorithm']) {
    const ids = new Set(problemCards.filter(card => track === 'all'
      || card.closest('[data-practice-panel]')?.dataset.practicePanel === track).map(card => card.dataset.problem));
    const count = currentUser ? [...ids].filter(id => completed.has(id)).length : 0;
    const prefix = track === 'all' ? 'practice-luogu-progress' : `practice-luogu-${track}-progress`;
    renderPracticeProgressMeter(prefix, count, ids.size);
  }
}

function createHydroProblemCard(problem, result) {
  const card = document.createElement('article');
  card.className = `hydro-problem-card${problem.accepted ? ' accepted' : ''}`;
  const id = document.createElement('span');
  id.className = 'hydro-problem-id';
  id.textContent = problem.problemId;
  const copy = document.createElement('div');
  copy.className = 'hydro-problem-copy';
  const source = document.createElement('small');
  source.textContent = problem.demo ? '接入演示题' : '协会 OJ · 自动判题';
  const title = document.createElement('h3');
  title.textContent = problem.title;
  copy.append(source, title);
  const points = document.createElement('span');
  points.className = 'hydro-problem-points';
  points.textContent = problem.accepted ? `✓ +${problem.points} 分` : `${problem.points} 分`;
  const actions = document.createElement('div');
  actions.className = 'hydro-problem-actions';
  if (problem.accepted) {
    const accepted = document.createElement('span');
    accepted.className = 'hydro-accepted-badge';
    accepted.textContent = '✓ 已通过';
    actions.append(accepted);
  }
  if (!problem.demo) {
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'hydro-problem-action';
    submit.textContent = problem.accepted ? '再次作答' : '站内做题';
    submit.addEventListener('click', () => openHydroSubmit(problem));
    actions.append(submit);
  } else if (!problem.accepted && result.demoMode) {
    const demo = document.createElement('button');
    demo.type = 'button';
    demo.className = 'hydro-problem-action demo-action';
    demo.textContent = '模拟 AC';
    demo.addEventListener('click', () => simulateHydroAccepted(problem.problemId, demo));
    actions.append(demo);
  }
  if (problem.url) {
    const link = document.createElement('a');
    link.textContent = 'OJ 原页 ↗';
    link.href = problem.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    actions.append(link);
  }
  card.append(id, copy, points, actions);
  return card;
}

function renderHydroStageProblems(problems, result) {
  document.querySelectorAll('.hydro-stage-section').forEach(section => section.remove());
  const unmatched = [];
  const grouped = new Map();
  problems.forEach(problem => {
    const stage = problem.topic || HYDRO_GRAMMAR_STAGE[problem.problemId];
    if (!stage) return unmatched.push(problem);
    if (!grouped.has(stage)) grouped.set(stage, []);
    grouped.get(stage).push(problem);
  });
  grouped.forEach((items, stage) => {
    const group = document.querySelector(`.problem-group[data-practice-group="${stage}"]`);
    if (!group) return unmatched.push(...items);
    const section = document.createElement('section');
    section.className = 'hydro-stage-section';
    const heading = document.createElement('div');
    heading.className = 'hydro-stage-heading';
    heading.innerHTML = `<div><small>ASSOCIATION OJ · ${stage.toUpperCase()}</small><h3>${HYDRO_STAGE_LABELS[stage]}</h3><p>直接在本站阅读题面、编写代码并提交给协会 Hydro 判题。</p></div><b>${items.length} 题</b>`;
    const list = document.createElement('div');
    list.className = 'hydro-problem-list';
    items.forEach(problem => list.append(createHydroProblemCard(problem, result)));
    section.append(heading, list);
    group.append(section);
  });
  let grammarTotal = 0;
  practiceGroups.forEach(group => {
    const stage = group.dataset.practiceGroup;
    const luoguCount = group.querySelectorAll(':scope > .problem-list > .problem-card').length;
    const hydroCount = grouped.get(stage)?.length || 0;
    const total = luoguCount + hydroCount;
    grammarTotal += total;
    const sidebarCount = document.querySelector(`[data-practice-filter="${stage}"] i`);
    const headingCount = group.querySelector(':scope > .problem-group-heading > b');
    if (sidebarCount) sidebarCount.textContent = String(total);
    if (headingCount) headingCount.textContent = `${total} 题`;
  });
  const allCount = document.querySelector('[data-practice-filter="all"] i');
  if (allCount) allCount.textContent = String(grammarTotal);
  return unmatched;
}

function renderAlgorithmPracticeProblems(problems, result) {
  const keys = [...document.querySelectorAll('[data-algorithm-problem-list]')].map(list => list.dataset.algorithmProblemList);
  keys.forEach(key => {
    const [topic, subtopic] = key.split(':');
    const items = problems.filter(problem => problem.topic === topic && problem.subtopic === subtopic);
    const list = document.querySelector(`[data-algorithm-problem-list="${key}"]`);
    const group = list?.closest('[data-algorithm-subtopic-group]');
    const luoguCount = group?.querySelectorAll(':scope > .problem-list > .problem-card').length || 0;
    const total = luoguCount + items.length;
    const sidebarCount = document.querySelector(`[data-algorithm-subtopic-count="${key}"]`);
    const headingCount = document.querySelector(`[data-algorithm-heading-count="${key}"]`);
    if (sidebarCount) sidebarCount.textContent = String(total);
    if (headingCount) headingCount.textContent = `${total} 题`;
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'hydro-loading algorithm-topic-empty';
      empty.textContent = luoguCount ? '协会 OJ 题正在同步，先完成上方洛谷题。' : '这一组正在挑选合适的学校 OJ 题目。';
      list.append(empty);
      return;
    }
    items.forEach(problem => list.append(createHydroProblemCard(problem, result)));
  });
  ['foundation', 'data-structure', 'dp', 'graph'].forEach(topic => {
    const count = [...document.querySelectorAll(`[data-algorithm-parent="${topic}"][data-algorithm-subtopic-group]`)]
      .reduce((total, group) => total + group.querySelectorAll(':scope > .problem-list > .problem-card').length, 0)
      + problems.filter(problem => problem.topic === topic).length;
    const allCount = document.querySelector(`[data-algorithm-subtopic-count="${topic}:all"]`);
    if (allCount) allCount.textContent = String(count);
  });
}

function renderHydroProblems(result) {
  syncHydroAccount(result.account);
  hydroState = result;
  if (!currentUser) {
    currentPracticeTotalCount = problemCards.length + result.problems.length;
  }
  updatePracticeProgress();
  if (result.connected) {
    hydroConnection.textContent = '已连接 Hydro';
    hydroConnection.className = 'hydro-connection connected';
  } else if (result.demoMode) {
    hydroConnection.textContent = '本地演示模式';
    hydroConnection.className = 'hydro-connection demo';
  } else {
    hydroConnection.textContent = '等待管理员配置';
    hydroConnection.className = 'hydro-connection';
  }
  hydroUsernameInput.value = result.account?.username || '';
  if (!currentUser) hydroAccountStatus.textContent = '登录后会按邮箱自动匹配协会 OJ 账号，邮箱不区分大小写。';
  else if (result.account?.verified) hydroAccountStatus.textContent = `已验证绑定：${result.account.username}，可以直接提交代码。`;
  else if (result.autoBinding?.message) hydroAccountStatus.textContent = result.autoBinding.message;
  else if (result.account) hydroAccountStatus.textContent = `已保存 ${result.account.username}，可重新按邮箱匹配，或手动确认绑定。`;
  else hydroAccountStatus.textContent = '未自动匹配到协会 OJ 账号，可重新按邮箱匹配，或填写 OJ 用户名手动绑定。';

  const grammarProblems = result.problems.filter(problem => problem.track === 'grammar');
  const algorithmProblems = result.problems.filter(problem => problem.track === 'algorithm');
  const unmatchedGrammar = renderHydroStageProblems(grammarProblems, result);
  renderAlgorithmPracticeProblems(algorithmProblems, result);
  hydroTrackSections.forEach(section => {
    const track = section.dataset.hydroTrack;
    const list = section.querySelector('.hydro-problem-list');
    const problems = track === 'grammar' ? unmatchedGrammar : result.problems.filter(problem => problem.track === track);
    list.replaceChildren();
    section.hidden = track === 'grammar' && problems.length === 0;
    if (!problems.length) {
      if (track === 'grammar') return;
      const empty = document.createElement('div');
      empty.className = 'hydro-loading';
      empty.textContent = '协会算法题同步后会按专题显示在这里。';
      list.append(empty);
      return;
    }
    problems.forEach(problem => list.append(createHydroProblemCard(problem, result)));
  });
}

function updateHydroSubmitAvailability() {
  if (!hydroSubmitDialog.open) return;
  hydroSubmitButton.textContent = !currentUser ? '登录后提交' : hydroState.account?.verified ? '提交评测' : '绑定后提交';
  if (hydroSubmitResult.className !== 'hydro-submit-result') return;
  hydroSubmitResult.textContent = !currentUser
    ? '可以先阅读题目并编写代码；提交前需要登录网站账号。'
    : hydroState.account?.verified
      ? '代码会发送到协会 Hydro 判题，结果完成后自动回传。'
      : '可以先完成代码；提交前需要绑定协会 Hydro 账号。';
}

function scheduleHydroBindingRefresh() {
  clearTimeout(hydroBindingTimer);
  if (!currentUser || !hydroState.account || hydroState.account.verified || Date.now() >= hydroBindingExpiresAt
    || document.visibilityState === 'hidden' || (getRoute() !== 'practice' && !hydroSubmitDialog.open)) return;
  hydroBindingTimer = setTimeout(async () => {
    await refreshHydroAccount().catch(() => {});
    scheduleHydroBindingRefresh();
  }, 2000);
}

function syncHydroAccount(account) {
  if (account && !account.verified && (!hydroBindingExpiresAt || hydroState.account?.username !== account.username)) {
    hydroBindingExpiresAt = Date.now() + 10 * 60 * 1000;
  }
  hydroState.account = account;
  hydroAccountForm.hidden = Boolean(currentUser && account?.verified);
  hydroAutoBindButton.hidden = !currentUser || Boolean(account?.verified);
  if (!account || account.verified) hydroBindingExpiresAt = 0;
  if (currentUser && account?.verified) hydroAccountStatus.textContent = `已验证绑定：${account.username}，可以直接提交代码。`;
  updateHydroSubmitAvailability();
  scheduleHydroBindingRefresh();
}

async function refreshHydroAccount() {
  if (!currentUser) return;
  if (hydroAccountRefreshPromise) return hydroAccountRefreshPromise;
  const userId = currentUser.id;
  const request = authRequest('/api/hydro/problems', { cache: 'no-store' }).then(result => {
    if (currentUser?.id === userId) syncHydroAccount(result.account);
  });
  hydroAccountRefreshPromise = request;
  try {
    await request;
  } finally {
    if (hydroAccountRefreshPromise === request) hydroAccountRefreshPromise = null;
  }
}

function resumeHydroBindingRefresh() {
  if (document.visibilityState === 'hidden') return scheduleHydroBindingRefresh();
  if (currentUser && !hydroState.account?.verified && (getRoute() === 'practice' || hydroSubmitDialog.open)) {
    refreshHydroAccount().catch(() => {});
  }
  scheduleHydroBindingRefresh();
}

window.addEventListener('focus', resumeHydroBindingRefresh);
window.addEventListener('pageshow', resumeHydroBindingRefresh);
window.addEventListener('hashchange', resumeHydroBindingRefresh);
document.addEventListener('visibilitychange', resumeHydroBindingRefresh);

function appendStatementMath(parent, source, displayMode = false) {
  const math = document.createElement(displayMode ? 'div' : 'span');
  math.className = displayMode ? 'statement-math-block' : 'statement-math';
  try {
    window.katex.render(source, math, {
      displayMode, throwOnError: true, trust: false, strict: 'ignore',
      maxExpand: 1000, maxSize: 20
    });
  } catch {
    // Keep unsupported or malformed formulas readable without losing commands.
    math.replaceChildren(document.createTextNode(source));
    math.classList.add('statement-math-fallback');
  }
  parent.append(math);
}

function appendStatementInline(parent, text) {
  String(text).split(/(`[^`\n]+`|(?<!\\)\$\$[^\n]+?\$\$|(?<!\\)\$[^$\n]+?(?<!\\)\$|\\\([^\n]+?\\\)|\\\[[^\n]+?\\\]|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter(Boolean).forEach(part => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      parent.append(code);
    } else if (part.startsWith('$$') && part.endsWith('$$')) {
      appendStatementMath(parent, part.slice(2, -2));
    } else if (part.startsWith('$') && part.endsWith('$')) {
      appendStatementMath(parent, part.slice(1, -1));
    } else if ((part.startsWith('\\(') && part.endsWith('\\)')) || (part.startsWith('\\[') && part.endsWith('\\]'))) {
      appendStatementMath(parent, part.slice(2, -2));
    } else if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parent.append(strong);
    } else if (part.startsWith('*') && part.endsWith('*')) {
      const emphasis = document.createElement('em');
      emphasis.textContent = part.slice(1, -1);
      parent.append(emphasis);
    } else parent.append(document.createTextNode(part));
  });
}

function renderStatementMarkdown(markdown) {
  hydroStatementContent.replaceChildren();
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const isBlockStart = line => /^\s*$|^#{1,4}\s+|^```|^\s*(?:\$\$|\\\[)|^>\s?|^\s*[-*]\s+|^\s*\d+[.)]\s+/.test(line);
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const values = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) values.push(lines[index++]);
      if (index < lines.length) index += 1;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (language) code.dataset.language = language;
      code.textContent = values.join('\n');
      pre.append(code);
      hydroStatementContent.append(pre);
      continue;
    }
    const trimmedLine = line.trim();
    if (/^(?:\$\$|\\\[)/.test(trimmedLine)) {
      const closing = trimmedLine.startsWith('$$') ? '$$' : '\\]';
      const values = [trimmedLine.slice(2)];
      let end = index;
      while (!values.at(-1).trimEnd().endsWith(closing) && end + 1 < lines.length) values.push(lines[++end]);
      if (values.at(-1).trimEnd().endsWith(closing)) {
        values[values.length - 1] = values.at(-1).trimEnd().slice(0, -2);
        appendStatementMath(hydroStatementContent, values.join('\n'), true);
        index = end + 1;
        continue;
      }
    }
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const heading = document.createElement(`h${Math.min(4, headingMatch[1].length + 1)}`);
      appendStatementInline(heading, headingMatch[2]);
      hydroStatementContent.append(heading);
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const list = document.createElement(ordered ? 'ol' : 'ul');
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      while (index < lines.length && pattern.test(lines[index])) {
        const item = document.createElement('li');
        appendStatementInline(item, lines[index].replace(pattern, ''));
        list.append(item);
        index += 1;
      }
      hydroStatementContent.append(list);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = document.createElement('blockquote');
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        appendStatementInline(quote, lines[index].replace(/^>\s?/, ''));
        quote.append(document.createElement('br'));
        index += 1;
      }
      hydroStatementContent.append(quote);
      continue;
    }
    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) paragraphLines.push(lines[index++].trim());
    const paragraph = document.createElement('p');
    appendStatementInline(paragraph, paragraphLines.join(' '));
    hydroStatementContent.append(paragraph);
  }
}

function hydroLanguageTemplate(language) {
  if (language === 'py' || language.startsWith('py.')) return 'import sys\n\n\ndef solve():\n    pass\n\n\nif __name__ == "__main__":\n    solve()\n';
  if (language === 'c') return '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n';
  if (language === 'java') return 'import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        Scanner in = new Scanner(System.in);\n    }\n}\n';
  return '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n';
}

function hydroDraftKey(problemId = hydroSubmitForm.dataset.problemId, language = hydroSubmitLanguage.value) {
  return `${problemId || ''}:${language}`;
}

function renderHydroLanguages(languages) {
  const available = Array.isArray(languages)
    ? [...new Set(languages.filter(language => typeof language === 'string' && /^[\w.+#-]{1,40}$/.test(language)))]
    : [];
  const previousLanguage = hydroSubmitLanguage.value;
  const draft = hydroSubmitCode.value;
  if (previousLanguage) hydroCodeDrafts.set(hydroDraftKey(undefined, previousLanguage), draft);
  const labels = {
    c: 'C', cc: 'C++', 'cc.cc17': 'C++17', 'cc.cc17o2': 'C++17 (O2)',
    'cc.cc20': 'C++20', 'cc.cc20o2': 'C++20 (O2)',
    py: 'Python', 'py.py3': 'Python 3', 'py.pypy3': 'PyPy3', java: 'Java'
  };
  hydroSubmitLanguage.replaceChildren();
  for (const language of available) {
    const option = document.createElement('option');
    option.value = language;
    option.textContent = labels[language] || language;
    hydroSubmitLanguage.append(option);
  }
  const selected = available.includes(previousLanguage) ? previousLanguage
    : ['cc.cc17', 'cc', 'cc.cc20o2', 'cc.cc20', 'c'].find(language => available.includes(language)) || available[0] || '';
  hydroSubmitLanguage.value = selected;
  hydroSubmitLanguage.dataset.previousValue = selected;
  hydroSubmitLanguage.disabled = !available.length;
  hydroSubmitButton.disabled = !available.length;
  if (available.length) {
    const key = hydroDraftKey();
    hydroSubmitCode.value = hydroCodeDrafts.has(key) ? hydroCodeDrafts.get(key)
      : !draft || draft === hydroLanguageTemplate(previousLanguage) ? hydroLanguageTemplate(selected) : draft;
    updateHydroSubmitAvailability();
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无可用语言';
    hydroSubmitLanguage.append(option);
    hydroSubmitResult.className = 'hydro-submit-result failed';
    hydroSubmitResult.textContent = '该题暂无可用提交语言，请联系管理员检查题目与 OJ 的语言配置。';
  }
}

async function loadHydroStatement(problem, token) {
  hydroStatementContent.innerHTML = '<div class="hydro-statement-loading">正在读取协会 OJ 题面…</div>';
  hydroStatementTags.replaceChildren();
  try {
    const statement = await authRequest(`/api/hydro/problems/${encodeURIComponent(problem.problemId)}/statement`);
    if (token !== hydroStatementToken) return;
    renderHydroLanguages(statement.languages);
    renderStatementMarkdown(statement.content);
    (statement.tags || []).forEach(value => {
      const tag = document.createElement('span');
      tag.textContent = value;
      hydroStatementTags.append(tag);
    });
  } catch (error) {
    if (token !== hydroStatementToken) return;
    hydroSubmitLanguage.disabled = true;
    hydroSubmitButton.disabled = true;
    hydroSubmitLanguage.options[0].textContent = '语言读取失败，请重新打开题目';
    const failure = document.createElement('div');
    failure.className = 'hydro-statement-error';
    const title = document.createElement('b');
    title.textContent = '站内题面暂时读取失败';
    const message = document.createElement('p');
    message.textContent = error.message;
    failure.append(title, message);
    hydroStatementContent.replaceChildren(failure);
  }
}

function openHydroSubmit(problem) {
  const previousProblemId = hydroSubmitForm.dataset.problemId;
  if (previousProblemId) hydroCodeDrafts.set(hydroDraftKey(previousProblemId), hydroSubmitCode.value);
  hydroPollToken += 1;
  hydroSubmitForm.dataset.problemId = problem.problemId;
  hydroSubmitTitle.textContent = problem.title;
  hydroSubmitProblemId.textContent = `协会 OJ · ${problem.problemId}`;
  hydroSubmitOjLink.href = problem.url || '#';
  hydroSubmitOjLink.hidden = !problem.url;
  hydroSubmitResult.className = 'hydro-submit-result';
  hydroSubmitCode.value = hydroCodeDrafts.get(hydroDraftKey(problem.problemId)) || hydroLanguageTemplate(hydroSubmitLanguage.value);
  hydroSubmitLanguage.dataset.previousValue = hydroSubmitLanguage.value;
  hydroSubmitLanguage.disabled = true;
  hydroSubmitButton.disabled = true;
  const statementToken = ++hydroStatementToken;
  hydroSubmitDialog.showModal();
  updateHydroSubmitAvailability();
  if (currentUser) refreshHydroAccount().catch(() => {});
  loadHydroStatement(problem, statementToken);
}

function hydroVerdictKey(verdict) {
  return String(verdict || '').toUpperCase().replace(/[ _-]/g, '');
}

function isHydroPending(verdict) {
  return ['WAITING', 'FETCHED', 'COMPILING', 'JUDGING'].includes(hydroVerdictKey(verdict));
}

function renderHydroJudgeResult(result) {
  const accepted = hydroVerdictKey(result.verdict) === 'AC' || hydroVerdictKey(result.verdict) === 'ACCEPTED';
  hydroSubmitResult.className = `hydro-submit-result ${accepted ? 'accepted' : isHydroPending(result.verdict) ? 'judging' : 'failed'}`;
  const details = [result.score !== null && result.score !== undefined ? `得分 ${result.score}` : '', result.timeMs !== null && result.timeMs !== undefined ? `${result.timeMs} ms` : '', result.memoryKb !== null && result.memoryKb !== undefined ? `${result.memoryKb} KB` : ''].filter(Boolean);
  hydroSubmitResult.textContent = `${accepted ? '✓' : isHydroPending(result.verdict) ? '…' : '×'} ${result.verdict || 'WAITING'}${details.length ? ` · ${details.join(' · ')}` : ''}`;
}

async function pollHydroSubmission(submissionId, token) {
  for (let attempt = 0; attempt < 120 && token === hydroPollToken; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (token !== hydroPollToken) return;
    const result = await authRequest(`/api/hydro/submissions/${encodeURIComponent(submissionId)}`);
    renderHydroJudgeResult(result);
    if (!isHydroPending(result.verdict)) {
      await loadHydroProblems();
      await loadServerPracticeProgress();
      renderProfile();
      return;
    }
  }
  if (token === hydroPollToken) hydroSubmitResult.textContent = '评测仍在进行，可以稍后刷新题单查看结果。';
}

hydroSubmitForm.addEventListener('submit', async event => {
  event.preventDefault();
  const problemId = hydroSubmitForm.dataset.problemId;
  if (!problemId || hydroSubmitButton.disabled) return;
  hydroCodeDrafts.set(hydroDraftKey(problemId), hydroSubmitCode.value);
  if (!currentUser) {
    hydroSubmitDialog.close();
    openAuth('login');
    setAuthStatus('请先登录，刚才编写的代码草稿已经为你保留。');
    return;
  }
  hydroSubmitButton.disabled = true;
  const token = ++hydroPollToken;
  try {
    if (!hydroState.account?.verified) {
      await refreshHydroAccount();
      if (token !== hydroPollToken || !hydroSubmitDialog.open) return;
      if (!hydroState.account?.verified) {
        hydroSubmitDialog.close();
        hydroAccountStatus.textContent = '代码草稿已保留。请先填写协会 OJ 用户名并完成验证绑定。';
        hydroAccountForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    hydroSubmitResult.className = 'hydro-submit-result judging';
    hydroSubmitResult.textContent = '正在发送代码到协会 OJ…';
    const result = await authRequest('/api/hydro/submit', {
      method: 'POST',
      body: JSON.stringify({ problemId, language: hydroSubmitLanguage.value, code: hydroSubmitCode.value })
    });
    renderHydroJudgeResult(result);
    await pollHydroSubmission(result.submissionId, token);
  } catch (error) {
    hydroSubmitResult.className = 'hydro-submit-result failed';
    hydroSubmitResult.textContent = error.message;
  } finally {
    hydroSubmitButton.disabled = false;
    updateHydroSubmitAvailability();
  }
});

hydroSubmitCode.addEventListener('input', () => {
  const problemId = hydroSubmitForm.dataset.problemId;
  if (problemId) hydroCodeDrafts.set(hydroDraftKey(problemId), hydroSubmitCode.value);
});

hydroSubmitCode.addEventListener('keydown', event => {
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    const indent = '    ';
    const value = hydroSubmitCode.value;
    const start = hydroSubmitCode.selectionStart;
    const end = hydroSubmitCode.selectionEnd;

    if (start === end) {
      if (event.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const leading = value.slice(lineStart).match(/^(?:\t| {1,4})/)?.[0] || '';
        if (leading) {
          hydroSubmitCode.setRangeText('', lineStart, lineStart + leading.length, 'preserve');
          const cursor = Math.max(lineStart, start - leading.length);
          hydroSubmitCode.setSelectionRange(cursor, cursor);
        }
      } else {
        hydroSubmitCode.setRangeText(indent, start, end, 'end');
      }
    } else {
      const blockStart = value.lastIndexOf('\n', start - 1) + 1;
      const blockEnd = value[end - 1] === '\n' ? end - 1 : end;
      const block = value.slice(blockStart, blockEnd);
      const lines = block.split('\n');

      if (event.shiftKey) {
        const removals = lines.map(line => line.match(/^(?:\t| {1,4})/)?.[0].length || 0);
        const replacement = lines.map((line, index) => line.slice(removals[index])).join('\n');
        hydroSubmitCode.setRangeText(replacement, blockStart, blockEnd, 'preserve');
        hydroSubmitCode.setSelectionRange(
          Math.max(blockStart, start - removals[0]),
          Math.max(blockStart, end - removals.reduce((sum, count) => sum + count, 0))
        );
      } else {
        const replacement = lines.map(line => indent + line).join('\n');
        hydroSubmitCode.setRangeText(replacement, blockStart, blockEnd, 'preserve');
        hydroSubmitCode.setSelectionRange(start + indent.length, end + indent.length * lines.length);
      }
    }

    hydroSubmitCode.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    hydroSubmitForm.requestSubmit();
  }
});

hydroSubmitLanguage.addEventListener('change', () => {
  const problemId = hydroSubmitForm.dataset.problemId;
  if (!problemId) return;
  const previousLanguage = hydroSubmitLanguage.dataset.previousValue || hydroSubmitLanguage.value;
  hydroCodeDrafts.set(hydroDraftKey(problemId, previousLanguage), hydroSubmitCode.value);
  hydroSubmitCode.value = hydroCodeDrafts.get(hydroDraftKey(problemId, hydroSubmitLanguage.value)) || hydroLanguageTemplate(hydroSubmitLanguage.value);
  hydroSubmitLanguage.dataset.previousValue = hydroSubmitLanguage.value;
});

document.querySelector('.hydro-submit-close').addEventListener('click', () => hydroSubmitDialog.close());
hydroSubmitDialog.addEventListener('close', () => {
  hydroPollToken += 1;
  hydroStatementToken += 1;
  const problemId = hydroSubmitForm.dataset.problemId;
  if (problemId) hydroCodeDrafts.set(hydroDraftKey(problemId), hydroSubmitCode.value);
});

async function loadHydroProblems() {
  const userId = currentUser?.id;
  try {
    const result = await authRequest('/api/hydro/problems', { cache: 'no-store' });
    if (currentUser?.id === userId) renderHydroProblems(result);
  } catch (error) {
    hydroTrackSections.forEach(section => {
      const failure = document.createElement('div');
      failure.className = 'hydro-loading';
      failure.textContent = error.message;
      section.querySelector('.hydro-problem-list').replaceChildren(failure);
    });
    document.querySelectorAll('[data-algorithm-problem-list]').forEach(list => {
      const failure = document.createElement('div');
      failure.className = 'hydro-loading';
      failure.textContent = error.message;
      list.replaceChildren(failure);
    });
  }
}

async function simulateHydroAccepted(problemId, button) {
  if (!currentUser) {
    openAuth('login');
    return setAuthStatus('登录后才能测试判题同步。');
  }
  button.disabled = true;
  try {
    const result = await authRequest('/api/hydro/demo-submission', { method: 'POST', body: JSON.stringify({ problemId, verdict: 'AC' }) });
    localStorage.setItem(practiceStorageKey, JSON.stringify(result.completed));
    currentPracticeScore = result.score;
    currentPracticeCompletedCount = result.completedCount;
    currentPracticeTotalCount = result.totalCount;
    currentOjHeatmap = result.ojHeatmap || currentOjHeatmap;
    currentProfileCollection = result.collection || currentProfileCollection;
    updatePracticeProgress();
    renderProfile();
    loadNotifications();
    await loadHydroProblems();
    alert(result.message);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

hydroAutoBindButton.addEventListener('click', async () => {
  if (!currentUser) return openAuth('login');
  const userId = currentUser.id;
  hydroAutoBindButton.disabled = true;
  hydroAccountStatus.textContent = '正在按登录邮箱匹配协会 OJ 账号…';
  try {
    const result = await authRequest('/api/hydro/account/auto', { method: 'POST', body: '{}' });
    if (currentUser?.id !== userId) return;
    syncHydroAccount(result.account);
    hydroAccountStatus.textContent = result.message || (result.account?.verified ? `已绑定：${result.account.username}，可以直接提交代码。` : '未找到匹配账号，请核对协会 OJ 邮箱。');
    if (result.account?.verified) await loadHydroProblems();
  } catch (error) {
    if (currentUser?.id === userId) hydroAccountStatus.textContent = error.message;
  } finally {
    hydroAutoBindButton.disabled = false;
  }
});

hydroAccountForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) {
    openAuth('login');
    return setAuthStatus('登录后才能绑定 Hydro 账号。');
  }
  const button = hydroAccountForm.querySelector('button');
  button.disabled = true;
  try {
    const result = await authRequest('/api/hydro/account', { method: 'POST', body: JSON.stringify({ username: hydroUsernameInput.value }) });
    hydroBindingExpiresAt = Date.now() + result.expiresIn * 1000;
    syncHydroAccount(result.account);
    await loadHydroProblems();
    if (hydroState.account?.verified) return;
    hydroAccountStatus.replaceChildren(document.createTextNode(`${result.message} `));
    if (result.linkUrl) {
      const link = document.createElement('a');
      link.href = result.linkUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = `打开协会 OJ 确认绑定（绑定码 ${result.linkCode}）↗`;
      hydroAccountStatus.append(link);
    }
  } catch (error) {
    hydroAccountStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

practiceFilters.forEach(button => button.addEventListener('click', () => {
  const filter = button.dataset.practiceFilter;
  practiceFilters.forEach(item => item.classList.toggle('active', item === button));
  practiceGroups.forEach(group => group.classList.toggle('filtered-out', filter !== 'all' && group.dataset.practiceGroup !== filter));
  document.querySelector('.practice-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

const ALGORITHM_TRACK_META = {
  foundation: { kicker: 'FOUNDATION TRACK', title: '基础算法', description: '从模拟、贪心和二分出发，再用前缀和与差分处理区间问题。', guide: '基础算法 · 洛谷与协会 OJ 配套题单' },
  'data-structure': { kicker: 'DATA STRUCTURE', title: '数据结构', description: '这部分将在算法学习加入对应内容后开放题目。', guide: '数据结构 · 暂未开放题目' },
  dp: { kicker: 'DYNAMIC PROGRAMMING', title: '动态规划', description: '先掌握线性递推，再逐步进入背包与区间 DP。', guide: '动态规划 · 首批学校 OJ 题单' },
  graph: { kicker: 'GRAPH THEORY', title: '图论', description: '从图的存储和遍历开始，继续学习最短路与生成树。', guide: '图论 · 首批学校 OJ 题单' }
};

function showAlgorithmPracticeTrack(track, { scroll = true } = {}) {
  if (!ALGORITHM_TRACK_META[track]) return;
  currentAlgorithmTrack = track;
  algorithmTrackTabs.forEach(tab => {
    const active = tab.dataset.algorithmTrackTab === track;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  algorithmSubtopicFilters.forEach(button => {
    const sameTrack = button.dataset.algorithmParent === track;
    button.hidden = !sameTrack;
    button.classList.toggle('active', sameTrack && button.dataset.algorithmSubtopicFilter === 'all');
  });
  algorithmSubtopicGroups.forEach(group => {
    group.hidden = group.dataset.algorithmParent !== track;
    group.classList.remove('filtered-out');
  });
  document.querySelectorAll('.algorithm-source-note').forEach(note => {
    note.hidden = note.dataset.algorithmParent !== track;
  });
  const meta = ALGORITHM_TRACK_META[track];
  document.getElementById('algorithm-sidebar-kicker').textContent = meta.kicker;
  document.getElementById('algorithm-sidebar-title').textContent = meta.title;
  document.getElementById('algorithm-sidebar-description').textContent = meta.description;
  document.getElementById('algorithm-guide-label').textContent = meta.guide;
  if (scroll) document.querySelector('.algorithm-practice-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

algorithmTrackTabs.forEach(tab => tab.addEventListener('click', () => showAlgorithmPracticeTrack(tab.dataset.algorithmTrackTab)));

algorithmSubtopicFilters.forEach(button => button.addEventListener('click', () => {
  const track = button.dataset.algorithmParent;
  const filter = button.dataset.algorithmSubtopicFilter;
  algorithmSubtopicFilters.forEach(item => item.classList.toggle('active', item === button));
  algorithmSubtopicGroups.forEach(group => {
    if (group.dataset.algorithmParent !== track) return;
    group.classList.toggle('filtered-out', filter !== 'all' && group.dataset.algorithmSubtopicGroup !== filter);
  });
  document.querySelector('.algorithm-practice-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

showAlgorithmPracticeTrack(currentAlgorithmTrack, { scroll: false });

updatePracticeProgress();

const foundationLessonOrder = [
  'algo-format',
  'algo-time',
  'algo-space',
  'algo-simulation',
  'algo-greedy',
  'algo-binary',
  'algo-prefix',
  'algo-difference',
  'algo-probability'
];
const trackedAlgorithmLessonIds = [...foundationLessonOrder, 'algo-linear-dp', 'algo-knapsack', 'algo-tree-dp', 'algo-reroot-dp', 'algo-interval-dp'];
const foundationLessonContainer = document.querySelector('[data-algorithm-panel="foundation"] .algorithm-content');
const firstAlgorithmRoadmap = document.getElementById('algo-data-structure-overview');
foundationLessonOrder.forEach(id => {
  const lesson = document.getElementById(id);
  if (lesson && foundationLessonContainer) foundationLessonContainer.insertBefore(lesson, firstAlgorithmRoadmap);
});

const algorithmTabs = [...document.querySelectorAll('[data-algorithm-tab]')];
const algorithmNavs = [...document.querySelectorAll('[data-algorithm-nav]')];
const algorithmLinks = [...document.querySelectorAll('.algorithm-doc-link, .algorithm-overview-link')];
const algorithmLessons = [...document.querySelectorAll('.algorithm-lesson')];
const trackedAlgorithmLessons = trackedAlgorithmLessonIds.map(id => document.getElementById(id)).filter(Boolean);
let currentAlgorithmLesson = algorithmLessons.find(lesson => lesson.classList.contains('active'))?.id || algorithmLessons[0]?.id;
const algorithmCategoryOverview = {
  foundation: 'algo-foundation-overview',
  'data-structure': 'algo-data-structure-overview',
  dp: 'algo-dp-overview',
  graph: 'algo-graph-overview',
  'number-theory': 'algo-number-theory-overview'
};

function getAlgorithmCategory(lesson) {
  if (!lesson || lesson.id === 'algo-overview') return 'overview';
  return lesson.dataset.algorithmCategory || 'foundation';
}

function updateAlgorithmCategoryUI(category) {
  algorithmTabs.forEach(tab => {
    const active = tab.dataset.algorithmTab === category;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  algorithmNavs.forEach(nav => { nav.hidden = nav.dataset.algorithmNav !== category; });
}

function resetAlgorithmContentScroll() {
  const content = document.querySelector('.algorithms-page .algorithm-content');
  if (content) content.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function showAlgorithmLesson(id, { updateHash = true, moveToTop = true } = {}) {
  const lesson = algorithmLessons.find(item => item.id === id) || algorithmLessons[0];
  if (!lesson) return;
  algorithmsPage?.classList.add('reading-mode');
  document.body.classList.add('algorithm-reading-active');
  currentAlgorithmLesson = lesson.id;
  algorithmLessons.forEach(item => item.classList.toggle('active', item === lesson));
  algorithmLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${lesson.id}`));
  updateAlgorithmCategoryUI(getAlgorithmCategory(lesson));
  if (updateHash) history.replaceState(null, '', `#${lesson.id}`);
  if (moveToTop) requestAnimationFrame(resetAlgorithmContentScroll);
  if (currentUser && trackedAlgorithmLessons.includes(lesson)) syncLearningVisit('algorithm', lesson.id);
}

function readAlgorithmProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(algorithmStorageKey));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function updateAlgorithmProgress() {
  const completed = readAlgorithmProgress().filter(id => trackedAlgorithmLessons.some(lesson => lesson.id === id));
  const percent = trackedAlgorithmLessons.length ? completed.length / trackedAlgorithmLessons.length * 100 : 0;
  const progressText = document.getElementById('algorithm-progress-text');
  const progressBar = document.getElementById('algorithm-progress-bar');
  if (progressText) progressText.textContent = `${completed.length} / ${trackedAlgorithmLessons.length}`;
  if (progressBar) progressBar.style.width = `${percent}%`;
  document.querySelectorAll('[data-algorithm-complete]').forEach(button => {
    const done = completed.includes(button.dataset.algorithmComplete);
    button.classList.toggle('completed', done);
    button.innerHTML = done ? '<span>✓</span> 本节已完成，点击可取消' : '<span>✓</span> 标记本节为已完成';
  });
}

function createAlgorithmPagerButton(direction, targetLesson, label) {
  const button = document.createElement('button');
  button.type = 'button';
  if (!targetLesson) {
    button.disabled = true;
    button.innerHTML = direction === 'previous'
      ? '<span>←</span><div><small>上一篇</small><b>已经是第一章</b></div>'
      : '<div><small>下一篇</small><b>当前开放章节已完成</b></div><span>→</span>';
    return button;
  }
  const title = targetLesson.querySelector('h2')?.textContent || label;
  button.innerHTML = direction === 'previous'
    ? `<span>←</span><div><small>上一篇</small><b>${title}</b></div>`
    : `<div><small>下一篇</small><b>${title}</b></div><span>→</span>`;
  button.addEventListener('click', () => showAlgorithmLesson(targetLesson.id));
  return button;
}

trackedAlgorithmLessons.forEach((lesson, index) => {
  const completeButton = document.createElement('button');
  completeButton.type = 'button';
  completeButton.className = 'complete-button algorithm-complete-button';
  completeButton.dataset.algorithmComplete = lesson.id;
  completeButton.addEventListener('click', async () => {
    const completed = readAlgorithmProgress();
    const shouldComplete = !completed.includes(lesson.id);
    if (!currentUser) {
      const next = shouldComplete ? [...completed, lesson.id] : completed.filter(id => id !== lesson.id);
      localStorage.setItem(algorithmStorageKey, JSON.stringify(next));
      return updateAlgorithmProgress();
    }
    completeButton.disabled = true;
    try {
      const result = await authRequest('/api/learning/progress', {
        method: 'POST',
        body: JSON.stringify({ type: 'algorithm', contentId: lesson.id, completed: shouldComplete })
      });
      applyLearningProgress(result);
    } catch (error) {
      alert(error.message);
    } finally {
      completeButton.disabled = false;
    }
  });
  const pager = document.createElement('nav');
  pager.className = 'algorithm-lesson-pager';
  pager.setAttribute('aria-label', '算法章节翻页');
  pager.append(
    createAlgorithmPagerButton('previous', trackedAlgorithmLessons[index - 1], '上一篇'),
    createAlgorithmPagerButton('next', trackedAlgorithmLessons[index + 1], '下一篇')
  );
  lesson.append(completeButton, pager);
});

updateAlgorithmProgress();

algorithmTabs.forEach(tab => tab.addEventListener('click', () => {
  const selected = tab.dataset.algorithmTab;
  showAlgorithmLesson(algorithmCategoryOverview[selected]);
}));

document.querySelector('[data-algorithm-start="foundation"]')?.addEventListener('click', () => showAlgorithmLesson('algo-foundation-overview'));

algorithmLinks.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const id = link.getAttribute('href').slice(1);
  showAlgorithmLesson(id);
}));

algorithmLearningReady = true;
if (getRoute() === 'algorithms') {
  const initialAlgorithmLesson = algorithmLessons.some(lesson => `#${lesson.id}` === location.hash) ? location.hash.slice(1) : 'algo-overview';
  showAlgorithmLesson(initialAlgorithmLesson, { updateHash: location.hash !== `#${initialAlgorithmLesson}`, moveToTop: false });
}

function createLeaderboardIdentity(entry) {
  const identity = document.createElement('button');
  identity.type = 'button';
  identity.className = 'leaderboard-identity';
  identity.dataset.publicProfile = String(entry.id);
  identity.setAttribute('aria-label', `查看 ${entry.nickname} 的个人主页`);
  const avatarWrap = document.createElement('span');
  avatarWrap.className = 'leaderboard-avatar-wrap';
  const avatar = document.createElement('span');
  avatar.textContent = avatarInitial(entry.nickname);
  applyAvatarTheme(avatar, entry.avatarTheme);
  avatarWrap.append(avatar);
  const copy = document.createElement('div');
  const nameLine = document.createElement('div');
  nameLine.className = 'leaderboard-name-line';
  const nickname = document.createElement('b');
  nickname.textContent = entry.nickname;
  nameLine.append(nickname);
  const school = document.createElement('small');
  school.textContent = entry.school;
  copy.append(nameLine, school);
  identity.append(avatarWrap, copy);
  return identity;
}

function renderLeaderboard(entries, scope = leaderboardScope) {
  const podium = document.getElementById('leaderboard-podium');
  const list = document.getElementById('leaderboard-list');
  const podiumEntries = entries.filter(entry => entry.rank && Number(entry.score) > 0).slice(0, 3);
  const highestScore = Math.max(...entries.map(entry => Number(entry.score) || 0), 1);
  podium.replaceChildren();
  podium.dataset.count = String(podiumEntries.length);
  document.getElementById('ranking-reader-count').textContent = `${entries.length} 位学习者 · ${entries.filter(entry => entry.rank && Number(entry.score) > 0).length} 位上榜`;
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'leaderboard-loading';
    empty.textContent = scope === 'weekly' ? '本周还没有新的做题积分，完成第一道题抢占周榜吧。' : '还没有成绩记录，完成第一道题成为榜首吧。';
    list.append(empty);
    return;
  }
  [podiumEntries[1], podiumEntries[0], podiumEntries[2]].filter(Boolean).forEach(entry => {
    const card = document.createElement('article');
    card.className = `leaderboard-podium-card rank-${entry.rank}`;
    card.dataset.rankLabel = String(entry.rank).padStart(2, '0');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-podium-rank';
    rank.textContent = entry.rank === 1 ? '冠军' : `第 ${entry.rank} 名`;
    const avatarLink = document.createElement('button');
    avatarLink.type = 'button';
    avatarLink.className = 'leaderboard-podium-profile';
    avatarLink.dataset.publicProfile = String(entry.id);
    avatarLink.setAttribute('aria-label', `查看 ${entry.nickname} 的个人主页`);
    const avatarWrap = document.createElement('span');
    avatarWrap.className = 'leaderboard-avatar-wrap';
    const avatar = document.createElement('div');
    avatar.className = 'leaderboard-podium-avatar';
    avatar.textContent = avatarInitial(entry.nickname);
    applyAvatarTheme(avatar, entry.avatarTheme);
    avatarWrap.append(avatar);
    avatarLink.append(avatarWrap);
    const name = document.createElement('h3');
    name.textContent = entry.nickname;
    const realName = document.createElement('p');
    realName.textContent = entry.realName;
    const score = document.createElement('strong');
    score.textContent = `${entry.score} 分`;
    const completed = document.createElement('small');
    completed.textContent = `${scope === 'weekly' ? '本周' : '完成'} ${entry.completedCount} 题`;
    card.append(rank, avatarLink, name, realName, score, completed);
    podium.append(card);
  });
  entries.forEach(entry => {
    const row = document.createElement('article');
    row.className = 'leaderboard-row';
    if (entry.rank) row.dataset.rank = String(entry.rank);
    else row.classList.add('is-waiting');
    if (entry.id === currentUser?.id) row.classList.add('is-current-user');
    const rank = document.createElement('b');
    rank.className = 'leaderboard-row-rank';
    rank.textContent = entry.rank ? String(entry.rank).padStart(2, '0') : '—';
    const identity = createLeaderboardIdentity(entry);
    const badgeDescription = document.createElement('span');
    badgeDescription.className = 'ranking-badge-description';
    if (entry.achievementBadge?.description) {
      badgeDescription.textContent = entry.achievementBadge.description;
      badgeDescription.title = entry.achievementBadge.description;
    } else {
      badgeDescription.hidden = true;
    }
    const realName = document.createElement('span');
    realName.className = 'ranking-real-name';
    realName.textContent = entry.realName;
    const completed = document.createElement('span');
    completed.className = 'ranking-completed';
    completed.textContent = `${entry.completedCount} 题`;
    const score = document.createElement('strong');
    score.textContent = entry.score;
    const scoreTrack = document.createElement('i');
    scoreTrack.className = 'leaderboard-score-track';
    scoreTrack.style.setProperty('--score-ratio', `${Math.max(0, Math.min(100, (Number(entry.score) || 0) / highestScore * 100))}%`);
    scoreTrack.setAttribute('aria-hidden', 'true');
    score.append(scoreTrack);
    score.setAttribute('aria-label', `${entry.score} 积分`);
    row.append(rank, identity, badgeDescription, realName, completed, score);
    list.append(row);
  });
}

async function loadLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  try {
    const result = await authRequest(`/api/leaderboard${leaderboardScope === 'weekly' ? '?scope=weekly' : ''}`);
    renderLeaderboard(result.entries, result.scope);
    document.getElementById('leaderboard-page').dataset.leaderboardScope = result.scope;
    document.querySelectorAll('[data-leaderboard-scope]').forEach(button => {
      const selected = button.dataset.leaderboardScope === result.scope;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('leaderboard-table-title').textContent = result.scope === 'weekly' ? '本周积分榜' : '历史总榜';
    document.getElementById('leaderboard-scope-emblem').textContent = result.scope === 'weekly' ? 'WEEKLY SPRINT' : 'ALL-TIME HONOR';
    document.getElementById('leaderboard-period-chip').textContent = result.scope === 'weekly' && result.period
      ? `${result.period.start.slice(5)} — ${result.period.end.slice(5)}`
      : '全站成长记录';
    document.getElementById('leaderboard-notice').textContent = result.scope === 'weekly'
      ? `周榜统计本周一至周日新增积分，周日结束后按最终名次发放周榜徽章。${result.period ? ` 本期：${result.period.start} — ${result.period.end}` : ''}`
      : '历史总榜累计全部刷题积分，并每日记录前三名与连续占榜荣誉。';
  } catch (error) {
    if (list) list.textContent = error.message;
  }
}

document.getElementById('leaderboard-refresh').addEventListener('click', loadLeaderboard);
document.querySelectorAll('[data-leaderboard-scope]').forEach(button => button.addEventListener('click', () => {
  leaderboardScope = button.dataset.leaderboardScope === 'weekly' ? 'weekly' : 'all';
  loadLeaderboard();
}));

function resourceDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '外部资源';
  }
}

function formatResourceFileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatResourceDate(value) {
  const source = String(value || '');
  const date = new Date(source.replace(' ', 'T') + (source.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return '刚刚发布';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date)
    .replaceAll('/', '.');
}

let currentResources = [];
let managedResourceId = 0;

function renderResources(resources) {
  const list = document.getElementById('resources-list');
  const total = document.getElementById('resources-total');
  if (!list || !total) return;
  currentResources = resources;
  total.textContent = String(resources.length);
  list.replaceChildren();
  if (!resources.length) {
    const empty = document.createElement('div');
    empty.className = 'resources-loading';
    empty.textContent = '资源库还在等待第一份分享。';
    list.append(empty);
    return;
  }

  resources.forEach((resource, index) => {
    const card = document.createElement('article');
    card.className = 'resource-list-card';
    const link = document.createElement('a');
    link.className = 'resource-list-link';
    link.href = resource.url;
    link.target = '_blank';
    link.rel = 'noreferrer';

    const number = document.createElement('span');
    number.className = 'resource-list-index';
    number.textContent = String(index + 1).padStart(2, '0');

    const copy = document.createElement('div');
    copy.className = 'resource-list-copy';
    const title = document.createElement('h3');
    title.textContent = resource.title;
    const publisher = document.createElement('p');
    publisher.className = 'resource-list-publisher';
    publisher.textContent = resource.publisher
      ? `发布者：${resource.publisher.nickname} · ${resource.publisher.realName}`
      : '发布者：协会成员';
    const meta = document.createElement('div');
    const domain = document.createElement('small');
    domain.textContent = resource.type === 'pdf'
      ? `PDF${resource.fileSize ? ` · ${formatResourceFileSize(resource.fileSize)}` : ''}`
      : resourceDomain(resource.url);
    const dot = document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    const time = document.createElement('time');
    time.dateTime = resource.createdAt || '';
    time.textContent = formatResourceDate(resource.createdAt);
    meta.append(domain, dot, time);
    copy.append(title, publisher, meta);

    const arrow = document.createElement('span');
    arrow.className = 'resource-list-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = resource.type === 'pdf' ? 'PDF' : '↗';
    if (resource.type === 'pdf') card.classList.add('is-pdf');
    link.append(number, copy, arrow);
    card.append(link);
    if (currentUser?.isAdmin) {
      card.classList.add('has-admin-actions');
      const actions = document.createElement('div');
      actions.className = 'resource-admin-actions';
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'resource-manage-button';
      manage.dataset.resourceManage = String(resource.id);
      manage.textContent = '管理';
      manage.setAttribute('aria-label', `管理资源：${resource.title}`);
      actions.append(manage);
      card.append(actions);
    }
    list.append(card);
  });
}

async function loadResources() {
  const list = document.getElementById('resources-list');
  try {
    const result = await authRequest('/api/resources');
    renderResources(Array.isArray(result.resources) ? result.resources : []);
  } catch (error) {
    if (list) list.textContent = error.message;
  }
}

const resourcePublishModal = document.getElementById('resource-publish-modal');
const resourcePublishForm = document.getElementById('resource-publish-form');
const resourcePublishStatus = document.getElementById('resource-publish-status');
const resourceManageModal = document.getElementById('resource-manage-modal');
const resourceManageForm = document.getElementById('resource-manage-form');
const resourceManageStatus = document.getElementById('resource-manage-status');
const resourceWithdrawButton = document.getElementById('resource-withdraw-button');
const resourceSourceInputs = [...resourcePublishForm.elements.sourceType];

function syncResourcePublishSource() {
  const sourceType = resourcePublishForm.elements.sourceType.value === 'pdf' ? 'pdf' : 'link';
  resourcePublishForm.querySelectorAll('[data-resource-source]').forEach(label => {
    const active = label.dataset.resourceSource === sourceType;
    label.hidden = !active;
    const input = label.querySelector('input');
    if (input) input.required = active;
  });
}

resourceSourceInputs.forEach(input => input.addEventListener('change', syncResourcePublishSource));
syncResourcePublishSource();

document.getElementById('resource-publish-button').addEventListener('click', () => {
  if (!currentUser?.isAdmin) return;
  setFormStatus(resourcePublishStatus);
  openFeatureModal(resourcePublishModal);
  resourcePublishForm.elements.title.focus();
});

document.querySelectorAll('[data-resource-publish-close]').forEach(element => {
  element.addEventListener('click', () => closeFeatureModal(resourcePublishModal));
});

resourcePublishForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser?.isAdmin) {
    setFormStatus(resourcePublishStatus, '只有管理员可以发布学习资源。', 'error');
    return;
  }
  const submit = resourcePublishForm.querySelector('button[type="submit"]');
  const formData = new FormData(resourcePublishForm);
  submit.disabled = true;
  setFormStatus(resourcePublishStatus, '正在发布…');
  try {
    if (formData.get('sourceType') === 'pdf') {
      const pdf = formData.get('pdf');
      if (!(pdf instanceof File) || !pdf.size) throw new Error('请选择要上传的 PDF 文件。');
      if (!/\.pdf$/i.test(pdf.name) || (pdf.type && pdf.type !== 'application/pdf')) throw new Error('请选择 PDF 格式的文件。');
      if (pdf.size > 20 * 1024 * 1024) throw new Error('PDF 文件不能超过 20 MB。');
      const query = new URLSearchParams({ title: String(formData.get('title') || ''), filename: pdf.name });
      await authRequest(`/api/admin/resources/pdf?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdf
      });
    } else {
      await authRequest('/api/admin/resources', {
        method: 'POST',
        body: JSON.stringify({
          title: formData.get('title'),
          url: formData.get('url')
        })
      });
    }
    resourcePublishForm.reset();
    syncResourcePublishSource();
    setFormStatus(resourcePublishStatus, '发布成功。');
    await loadResources();
    closeFeatureModal(resourcePublishModal);
  } catch (error) {
    setFormStatus(resourcePublishStatus, error.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('resources-list').addEventListener('click', event => {
  const button = event.target.closest('[data-resource-manage]');
  if (!button || !currentUser?.isAdmin) return;
  const resource = currentResources.find(item => Number(item.id) === Number(button.dataset.resourceManage));
  if (!resource) return;
  managedResourceId = Number(resource.id);
  resourceManageForm.elements.title.value = resource.title;
  document.getElementById('resource-manage-url').textContent = resource.type === 'pdf'
    ? `PDF 文件 · ${resource.fileName || '学习资料.pdf'}${resource.fileSize ? ` · ${formatResourceFileSize(resource.fileSize)}` : ''}`
    : resource.url;
  setFormStatus(resourceManageStatus);
  openFeatureModal(resourceManageModal);
  resourceManageForm.elements.title.focus();
});

document.querySelectorAll('[data-resource-manage-close]').forEach(element => {
  element.addEventListener('click', () => closeFeatureModal(resourceManageModal));
});

resourceManageForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser?.isAdmin || !managedResourceId) return;
  const submit = resourceManageForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setFormStatus(resourceManageStatus, '正在保存…');
  try {
    await authRequest(`/api/admin/resources/${managedResourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: resourceManageForm.elements.title.value })
    });
    await loadResources();
    closeFeatureModal(resourceManageModal);
  } catch (error) {
    setFormStatus(resourceManageStatus, error.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

resourceWithdrawButton.addEventListener('click', async () => {
  if (!currentUser?.isAdmin || !managedResourceId) return;
  const resource = currentResources.find(item => Number(item.id) === managedResourceId);
  if (!confirm(`确定撤回“${resource?.title || '这条资源'}”吗？撤回后将不再对外展示。`)) return;
  resourceWithdrawButton.disabled = true;
  setFormStatus(resourceManageStatus, '正在撤回…');
  try {
    await authRequest(`/api/admin/resources/${managedResourceId}`, { method: 'DELETE' });
    await loadResources();
    closeFeatureModal(resourceManageModal);
  } catch (error) {
    setFormStatus(resourceManageStatus, error.message, 'error');
  } finally {
    resourceWithdrawButton.disabled = false;
  }
});

function openFeatureModal(modal) {
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('feature-modal-open');
}

function closeFeatureModal(modal) {
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.feature-modal.open')) document.body.classList.remove('feature-modal-open');
}

function formatProfileDate(value) {
  const date = new Date(String(value || '').replace(' ', 'T') + (String(value || '').includes('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

async function openPublicProfile(userId) {
  const modal = document.getElementById('public-profile-modal');
  const loading = document.getElementById('public-profile-loading');
  const content = document.getElementById('public-profile-content');
  loading.hidden = false;
  loading.textContent = '正在读取学习者主页…';
  content.hidden = true;
  openFeatureModal(modal);
  try {
    const result = await authRequest(`/api/users/${encodeURIComponent(userId)}/profile`);
    const user = result.user;
    document.querySelector('.public-profile-hero').dataset.profileDecor = normalizeProfileDecor(user.profileDecor);
    const avatar = document.getElementById('public-profile-avatar');
    avatar.textContent = avatarInitial(user.nickname);
    applyAvatarTheme(avatar, user.avatarTheme);
    applyAvatarFrame(avatar, user.avatarFrame);
    const equipped = document.getElementById('public-profile-equipped-badge');
    equipped.hidden = !user.achievementBadge;
    equipped.textContent = user.achievementBadge?.icon || '';
    equipped.dataset.tone = user.achievementBadge?.tone || 'violet';
    equipped.dataset.tier = user.achievementBadge?.tier || 'rare';
    equipped.title = user.achievementBadge ? `展示徽章：${user.achievementBadge.name}` : '';
    document.getElementById('public-profile-name').textContent = user.nickname;
    document.getElementById('public-profile-meta').textContent = `${user.realName} · ${user.school}`;
    document.getElementById('public-profile-joined').textContent = `${formatProfileDate(user.createdAt)} 加入`;
    const statItems = [
      ['当前排名', result.stats.rank ? `#${result.stats.rank}` : '—'],
      ['刷题积分', result.stats.score],
      ['协会 OJ', `${result.stats.ojAccepted} AC`],
      ['活跃天数', result.stats.activeDays],
      ['最长连续', `${result.stats.longestStreak} 天`]
    ];
    const stats = document.getElementById('public-profile-stats');
    stats.replaceChildren(...statItems.map(([label, value]) => {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = value;
      const small = document.createElement('small');
      small.textContent = label;
      item.append(strong, small);
      return item;
    }));
    const achievementGrid = document.getElementById('public-achievement-grid');
    achievementGrid.replaceChildren();
    result.achievements.forEach(achievement => {
      const item = document.createElement('article');
      item.className = 'public-achievement-item';
      item.dataset.tone = achievement.tone || 'violet';
      item.dataset.tier = achievement.tier || 'rare';
      const icon = document.createElement('span');
      icon.textContent = achievement.icon;
      const copy = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = achievement.name;
      const description = document.createElement('small');
      description.textContent = achievement.description;
      copy.append(name, description);
      item.append(icon, copy);
      achievementGrid.append(item);
    });
    if (!result.achievements.length) {
      const empty = document.createElement('p');
      empty.className = 'public-profile-empty';
      empty.textContent = '这位学习者还在积累第一枚成就。';
      achievementGrid.append(empty);
    }
    document.getElementById('public-profile-achievement-count').textContent = `${result.achievements.length} 枚`;
    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    loading.textContent = error.message;
  }
}

document.getElementById('leaderboard-page').addEventListener('click', event => {
  const target = event.target.closest('[data-public-profile]');
  if (target) openPublicProfile(target.dataset.publicProfile);
});
document.querySelectorAll('[data-public-profile-close]').forEach(element => element.addEventListener('click', () => closeFeatureModal(document.getElementById('public-profile-modal'))));

function renderNotifications(result) {
  const button = document.getElementById('achievement-inbox-button');
  const count = document.getElementById('achievement-inbox-count');
  const list = document.getElementById('achievement-notification-list');
  const unreadCount = Number(result.unreadCount || 0);
  button.hidden = !currentUser;
  count.hidden = unreadCount === 0;
  count.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  list.replaceChildren();
  if (!result.notifications.length) {
    const empty = document.createElement('div');
    empty.className = 'achievement-inbox-empty';
    empty.innerHTML = '<b>暂时没有新消息</b><span>完成协会 OJ 目标后，新徽章会出现在这里。</span>';
    list.append(empty);
    return;
  }
  result.notifications.forEach(notification => {
    const article = document.createElement('article');
    article.className = 'achievement-notification';
    article.classList.toggle('unread', !notification.read);
    const icon = document.createElement('span');
    icon.className = 'achievement-notification-icon';
    icon.dataset.tone = notification.achievement?.tone || 'violet';
    icon.dataset.tier = notification.achievement?.tier || 'rare';
    icon.textContent = notification.achievement?.icon || '✦';
    const copy = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = notification.title;
    const message = document.createElement('p');
    message.textContent = notification.message;
    const time = document.createElement('small');
    time.textContent = formatProfileDate(notification.createdAt);
    copy.append(title, message, time);
    article.append(icon, copy);
    list.append(article);
  });
}

async function loadNotifications() {
  if (!currentUser) return;
  try {
    renderNotifications(await authRequest('/api/notifications'));
  } catch (error) {
    console.error(error);
  }
}

async function markNotificationsRead() {
  if (!currentUser) return;
  try {
    await authRequest('/api/notifications/read', { method: 'POST', body: '{}' });
    await loadNotifications();
  } catch (error) {
    console.error(error);
  }
}

document.getElementById('achievement-inbox-button').addEventListener('click', async () => {
  openFeatureModal(document.getElementById('achievement-inbox-modal'));
  await loadNotifications();
  await markNotificationsRead();
});
document.getElementById('achievement-mark-read').addEventListener('click', markNotificationsRead);
document.querySelectorAll('[data-inbox-close]').forEach(element => element.addEventListener('click', () => closeFeatureModal(document.getElementById('achievement-inbox-modal'))));

const adminProblemForm = document.getElementById('admin-problem-form');
const adminProblemList = document.getElementById('admin-problem-list');
const adminSubmissionList = document.getElementById('admin-submission-list');
const adminFormStatus = document.getElementById('admin-form-status');
let adminData = null;
let adminProgressRequest = 0;
let adminProgressSearchTimer = null;
let adminProgressExporting = false;
let adminProgressReady = false;
const adminProgressRows = document.getElementById('admin-progress-rows');
const adminProgressStatus = document.getElementById('admin-progress-status');
const adminProgressExport = document.getElementById('admin-progress-export');

function adminProgressQuery() {
  return new URLSearchParams({
    track: document.getElementById('admin-progress-track').value,
    binding: document.getElementById('admin-progress-binding').value,
    search: document.getElementById('admin-progress-search').value.trim()
  }).toString();
}

function renderAdminProgress(report) {
  adminProgressRows.replaceChildren();
  for (const user of report.rows) {
    const row = document.createElement('tr');
    const student = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = user.realName || user.nickname;
    const school = document.createElement('small');
    school.textContent = `${user.nickname} · ${user.school}`;
    student.append(name, school);
    row.append(student);
    const values = [user.hydroUsername || '—', user.bindingStatus, `${user.completedCount} / ${report.stats.problems}`,
      user.submittedCount, `${(user.completionRate * 100).toFixed(1)}%`,
      user.lastSubmissionAt ? new Date(user.lastSubmissionAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'];
    values.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (index === 1) cell.className = user.verified ? 'admin-progress-bound' : 'admin-progress-unbound';
      row.append(cell);
    });
    adminProgressRows.append(row);
  }
  if (!report.rows.length) {
    const row = document.createElement('tr');
    const empty = document.createElement('td');
    empty.colSpan = 7;
    empty.className = 'admin-empty';
    empty.textContent = '没有符合筛选条件的学员。';
    row.append(empty);
    adminProgressRows.append(row);
  }
  const updated = new Date(report.generatedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  adminProgressStatus.textContent = `${report.stats.users} 位学员 · ${report.stats.verifiedUsers} 位已绑定 · ${report.stats.participants} 位已提交 · ${report.stats.problems} 道题 · ${updated} 更新`;
  adminProgressStatus.classList.remove('error');
}

async function loadAdminProgress() {
  if (!currentUser?.isAdmin) return;
  clearTimeout(adminProgressSearchTimer);
  const request = ++adminProgressRequest;
  const userId = currentUser.id;
  adminProgressReady = false;
  adminProgressExport.disabled = true;
  adminProgressStatus.textContent = '正在加载统计…';
  adminProgressStatus.classList.remove('error');
  adminProgressRows.replaceChildren();
  try {
    const report = await authRequest(`/api/admin/hydro/progress?${adminProgressQuery()}`, { cache: 'no-store' });
    if (request !== adminProgressRequest || currentUser?.id !== userId || !currentUser?.isAdmin) return;
    renderAdminProgress(report);
    adminProgressReady = true;
    adminProgressExport.disabled = adminProgressExporting;
  } catch (error) {
    if (request !== adminProgressRequest || currentUser?.id !== userId) return;
    adminProgressStatus.textContent = error.message;
    adminProgressStatus.classList.add('error');
  }
}

document.getElementById('admin-progress-refresh').addEventListener('click', loadAdminProgress);
['admin-progress-track', 'admin-progress-binding'].forEach(id => document.getElementById(id).addEventListener('change', loadAdminProgress));
document.getElementById('admin-progress-search').addEventListener('input', () => {
  clearTimeout(adminProgressSearchTimer);
  // Invalidate an in-flight response as soon as the search changes.
  adminProgressRequest++;
  adminProgressReady = false;
  adminProgressExport.disabled = true;
  adminProgressSearchTimer = setTimeout(loadAdminProgress, 250);
});
adminProgressExport.addEventListener('click', async () => {
  if (!currentUser?.isAdmin || adminProgressExporting) return;
  const userId = currentUser.id;
  const query = adminProgressQuery();
  adminProgressExporting = true;
  adminProgressExport.disabled = true;
  adminProgressExport.textContent = '正在生成 Excel…';
  try {
    const response = await fetch(`/api/admin/hydro/progress/export?${query}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || '导出失败，请稍后重试。');
    }
    const blob = await response.blob();
    if (currentUser?.id !== userId || !currentUser?.isAdmin) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `协会OJ完成情况-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    if (currentUser?.id !== userId) return;
    adminProgressStatus.textContent = error.message;
    adminProgressStatus.classList.add('error');
  } finally {
    adminProgressExporting = false;
    adminProgressExport.textContent = '一键导出 Excel';
    adminProgressExport.disabled = !adminProgressReady || !currentUser?.isAdmin;
  }
});

function syncAdminSubtopicField({ resetValue = false } = {}) {
  const fields = adminProblemForm.elements;
  const algorithmTrack = fields.track.value === 'algorithm';
  fields.subtopic.disabled = !algorithmTrack;
  if (!algorithmTrack) return;
  const defaults = { foundation: 'simulation', 'data-structure': 'linear-structure', dp: 'linear-dp', graph: 'graph-storage' };
  if (resetValue) fields.subtopic.value = defaults[fields.topic.value] || 'simulation';
}

adminProblemForm.elements.track.addEventListener('change', () => {
  adminProblemForm.elements.topic.value = adminProblemForm.elements.track.value === 'algorithm' ? 'foundation' : 'start';
  syncAdminSubtopicField({ resetValue: true });
});
adminProblemForm.elements.topic.addEventListener('change', () => syncAdminSubtopicField({ resetValue: true }));
syncAdminSubtopicField();

function adminVerdictKey(value) {
  return String(value || '').toUpperCase().replace(/[ _-]/g, '');
}

function setAdminFormStatus(message, type = '') {
  adminFormStatus.textContent = message;
  adminFormStatus.className = `admin-form-status${type ? ` ${type}` : ''}`;
}

function resetAdminProblemForm() {
  adminProblemForm.reset();
  adminProblemForm.elements.points.value = '10';
  adminProblemForm.elements.topic.value = 'start';
  adminProblemForm.elements.subtopic.value = 'simulation';
  syncAdminSubtopicField();
  adminProblemForm.elements.verifyHydro.checked = true;
  adminProblemForm.elements.active.checked = true;
  adminProblemForm.querySelector('.admin-primary-button').textContent = '校验并发布';
  setAdminFormStatus('插件安装前可以取消“校验题号”，先保存本地配置。');
}

function editAdminProblem(problem) {
  adminProblemForm.elements.problemId.value = problem.problemId;
  adminProblemForm.elements.title.value = problem.title;
  adminProblemForm.elements.points.value = problem.points;
  adminProblemForm.elements.track.value = problem.track;
  adminProblemForm.elements.topic.value = problem.topic || (problem.track === 'algorithm' ? 'foundation' : 'start');
  adminProblemForm.elements.subtopic.value = problem.subtopic || 'simulation';
  syncAdminSubtopicField();
  adminProblemForm.elements.url.value = problem.url || '';
  adminProblemForm.elements.active.checked = problem.active;
  adminProblemForm.elements.verifyHydro.checked = false;
  adminProblemForm.querySelector('.admin-primary-button').textContent = '保存修改';
  setAdminFormStatus(`正在编辑 ${problem.problemId}；如需重新读取 Hydro 名称，可勾选校验。`);
  adminProblemForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function toggleAdminProblem(problem, button) {
  button.disabled = true;
  try {
    const result = await authRequest(`/api/admin/hydro/problems/${encodeURIComponent(problem.problemId)}/status`, {
      method: 'POST', body: JSON.stringify({ active: !problem.active })
    });
    setAdminFormStatus(result.message, 'success');
    await loadAdminDashboard();
    await loadHydroProblems();
  } catch (error) {
    setAdminFormStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function renderAdminProblems(problems) {
  adminProblemList.replaceChildren();
  const visibleProblems = problems.filter(problem => !problem.demo);
  if (!visibleProblems.length) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = '还没有协会 OJ 题目，请在左侧发布第一道题。';
    return adminProblemList.append(empty);
  }
  visibleProblems.forEach(problem => {
    const row = document.createElement('article');
    row.className = `admin-problem-row${problem.active ? '' : ' inactive'}`;
    const id = document.createElement('code');
    id.textContent = problem.problemId;
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = problem.title;
    const meta = document.createElement('p');
    const topicLabels = { start: '输入与输出', basic: '变量与运算', condition: '条件判断', loop: '循环结构', 'array-string': '数组与字符串', 'function-struct': '函数与结构体', foundation: '基础算法', 'data-structure': '数据结构', dp: '动态规划', graph: '图论' };
    const subtopicLabels = { simulation: '模拟', greedy: '贪心', binary: '二分', 'prefix-sum': '前缀和与差分', 'linear-structure': '线性结构', 'stack-queue': '栈与队列', tree: '树结构', bfs: 'BFS', 'linear-dp': '线性 DP', knapsack: '背包 DP', 'interval-dp': '区间 DP', 'graph-storage': '图的存储', 'shortest-path': '最短路', mst: '最小生成树' };
    const group = problem.track === 'algorithm' ? `${topicLabels[problem.topic] || '未分组'} / ${subtopicLabels[problem.subtopic] || '未分组'}` : topicLabels[problem.topic] || '未分组';
    meta.textContent = `${problem.track === 'algorithm' ? '算法题单' : '语法题单'} / ${group} · ${problem.points} 分 · ${problem.active ? '已上架' : '已下架'}`;
    copy.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'admin-problem-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = '编辑';
    edit.addEventListener('click', () => editAdminProblem(problem));
    const status = document.createElement('button');
    status.type = 'button';
    status.className = problem.active ? 'status-active' : 'status-inactive';
    status.textContent = problem.active ? '下架' : '上架';
    status.addEventListener('click', () => toggleAdminProblem(problem, status));
    actions.append(edit, status);
    row.append(id, copy, actions);
    adminProblemList.append(row);
  });
}

function renderAdminSubmissions(submissions) {
  adminSubmissionList.replaceChildren();
  if (!submissions.length) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = '暂无评测记录。';
    return adminSubmissionList.append(empty);
  }
  submissions.forEach(submission => {
    const row = document.createElement('article');
    row.className = 'admin-submission-row';
    const student = document.createElement('span');
    const studentName = document.createElement('b');
    studentName.textContent = submission.realName;
    const hydroName = document.createElement('small');
    hydroName.textContent = submission.hydroUsername ? `Hydro: ${submission.hydroUsername}` : submission.nickname;
    student.append(studentName, hydroName);
    const problem = document.createElement('span');
    const problemTitle = document.createElement('b');
    problemTitle.textContent = submission.title;
    const problemId = document.createElement('small');
    problemId.textContent = submission.problemId;
    problem.append(problemTitle, problemId);
    const language = document.createElement('span');
    language.textContent = submission.language || '—';
    const verdict = document.createElement('strong');
    const key = adminVerdictKey(submission.verdict);
    verdict.className = `admin-verdict${['AC', 'ACCEPTED'].includes(key) ? ' ac' : ['WAITING', 'FETCHED', 'COMPILING', 'JUDGING'].includes(key) ? '' : ' fail'}`;
    verdict.textContent = submission.verdict;
    const resources = document.createElement('span');
    resources.textContent = [submission.score !== null ? `${submission.score} 分` : '', submission.timeMs !== null ? `${submission.timeMs} ms` : '', submission.memoryKb !== null ? `${submission.memoryKb} KB` : ''].filter(Boolean).join(' · ') || '—';
    const time = document.createElement('span');
    const parsedTime = new Date(submission.receivedAt || submission.submittedAt);
    time.textContent = Number.isNaN(parsedTime.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(parsedTime);
    row.append(student, problem, language, verdict, resources, time);
    adminSubmissionList.append(row);
  });
}

function renderAdminDashboard(result) {
  adminData = result;
  const connection = document.getElementById('admin-connection');
  connection.textContent = result.configured ? 'Hydro 判题桥已配置' : '等待配置 Hydro 判题桥';
  connection.className = `admin-connection${result.configured ? ' connected' : ''}`;
  document.getElementById('admin-stat-users').textContent = result.stats.users;
  document.getElementById('admin-stat-accounts').textContent = result.stats.verifiedAccounts;
  document.getElementById('admin-stat-problems').textContent = result.stats.problems;
  document.getElementById('admin-stat-submissions').textContent = `${result.stats.submissions} / ${result.stats.accepted}`;
  renderAdminProblems(result.problems);
  renderAdminSubmissions(result.submissions);
}

async function loadAdminDashboard() {
  if (!currentUser?.isAdmin) return;
  loadAdminProgress();
  try {
    renderAdminDashboard(await authRequest('/api/admin/hydro'));
  } catch (error) {
    adminProblemList.innerHTML = '';
    const failure = document.createElement('div');
    failure.className = 'admin-empty';
    failure.textContent = error.message;
    adminProblemList.append(failure);
  }
}

adminProblemForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = adminProblemForm.querySelector('.admin-primary-button');
  const fields = adminProblemForm.elements;
  button.disabled = true;
  button.textContent = fields.verifyHydro.checked ? '正在连接 Hydro…' : '正在保存…';
  try {
    const result = await authRequest('/api/admin/hydro/problems', {
      method: 'POST',
      body: JSON.stringify({
        problemId: fields.problemId.value,
        title: fields.title.value,
        points: Number(fields.points.value),
        track: fields.track.value,
        topic: fields.topic.value,
        subtopic: fields.subtopic.value,
        url: fields.url.value,
        verifyHydro: fields.verifyHydro.checked,
        active: fields.active.checked
      })
    });
    resetAdminProblemForm();
    setAdminFormStatus(result.message, 'success');
    await loadAdminDashboard();
    await loadHydroProblems();
  } catch (error) {
    setAdminFormStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    if (button.textContent.includes('正在')) button.textContent = '校验并发布';
  }
});

document.getElementById('admin-form-reset').addEventListener('click', resetAdminProblemForm);
document.getElementById('admin-refresh').addEventListener('click', loadAdminDashboard);
document.getElementById('admin-publish-starter').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = '正在校验 14 道题…';
  setAdminFormStatus('正在连接协会 Hydro 并逐题校验，请不要关闭页面。');
  try {
    const result = await authRequest('/api/admin/hydro/starter-pack', { method: 'POST', body: JSON.stringify({}) });
    if (result.failed.length) {
      const failedIds = result.failed.map(item => item.problemId).join('、');
      setAdminFormStatus(`${result.message} 未发布：${failedIds}。请确认这些题已经导入协会 Hydro。`, 'error');
    } else {
      setAdminFormStatus(`${result.message} 现在可以到“刷题训练”查看。`, 'success');
    }
    await loadAdminDashboard();
    await loadHydroProblems();
  } catch (error) {
    setAdminFormStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '一键发布入门题包';
  }
});

document.getElementById('admin-sync-starter-statements').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = '正在同步 14 道题…';
  setAdminFormStatus('正在把带样例的题面安全同步到协会 Hydro，请不要关闭页面。');
  try {
    const result = await authRequest('/api/admin/hydro/starter-pack/update-statements', { method: 'POST', body: JSON.stringify({}) });
    if (result.failed.length) {
      const pluginMissing = result.failed.some(item => /HTTP 404|not found/i.test(item.error));
      const failedIds = result.failed.map(item => item.problemId).join('、');
      setAdminFormStatus(pluginMissing
        ? '协会 Hydro 桥接插件版本过旧，请先升级到 0.3.0，再点击同步。'
        : `${result.message} 失败题目：${failedIds}。`, 'error');
    } else {
      setAdminFormStatus(`${result.message} 协会 OJ 原题面现在也包含样例。`, 'success');
    }
  } catch (error) {
    setAdminFormStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '同步样例到协会 OJ';
  }
});

const authModal = document.getElementById('auth-modal');
const authAudienceTabs = [...document.querySelectorAll('[data-auth-audience]')];
const authPanels = [...document.querySelectorAll('[data-auth-panel]')];
const associationForm = document.querySelector('.association-auth-form');
const associationMethodTabs = [...document.querySelectorAll('[data-association-method]')];
const associationAccountInput = associationForm.elements.account;
const associationCredentialInput = associationForm.elements.credential;
const associationSendCodeButton = document.querySelector('.association-send-code');
const associationSubmit = document.querySelector('.association-auth-submit');
const associationStatus = document.querySelector('.association-auth-status');
const localForm = document.querySelector('.local-auth-form');
const localModeTabs = [...document.querySelectorAll('[data-local-mode]')];
const localEmailInput = localForm.elements.email;
const localVerificationInput = localForm.elements.verificationCode;
const localSendCodeButton = document.querySelector('.local-send-code');
const localSubmit = document.querySelector('.local-auth-submit');
const localStatus = document.querySelector('.local-auth-status');
const localTurnstileContainer = document.querySelector('.local-turnstile');
let authAudience = 'association';
let associationMethod = 'password';
let localMode = 'login';
let localTurnstileSiteKey = '';
let localTurnstileWidgetId = null;
let turnstileScriptPromise = null;
const verificationCountdowns = new WeakMap();
let lastSyncedVisit = '';

async function authRequest(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '请求失败，请稍后重试。');
  return result;
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('人机验证组件加载失败，请刷新页面后重试。')), { once: true });
    document.head.append(script);
  });
  return turnstileScriptPromise;
}

async function renderLocalTurnstile() {
  if (!localTurnstileSiteKey || localTurnstileWidgetId !== null || localMode !== 'register') return;
  try {
    await loadTurnstileScript();
    localTurnstileWidgetId = window.turnstile.render(localTurnstileContainer, {
      sitekey: localTurnstileSiteKey,
      action: 'external-code',
      theme: 'light'
    });
  } catch (error) {
    setFormStatus(localStatus, error.message, 'error');
  }
}

function resetLocalTurnstile() {
  if (localTurnstileWidgetId !== null && window.turnstile) window.turnstile.reset(localTurnstileWidgetId);
}

async function initializeLocalTurnstile() {
  try {
    const config = await authRequest('/api/auth/code-security-config');
    localTurnstileSiteKey = config.turnstileSiteKey || '';
    localTurnstileContainer.hidden = !localTurnstileSiteKey;
    await renderLocalTurnstile();
  } catch (error) {
    console.error('验证码安全配置读取失败：', error);
  }
}

function applyLearningProgress(result) {
  localStorage.setItem(storageKey, JSON.stringify(result.cppCompleted || []));
  localStorage.setItem(algorithmStorageKey, JSON.stringify(result.algorithmCompleted || []));
  serverLearningDays = result.activityDays || [];
  serverLastContent = result.lastContent || null;
  updateProgress();
  updateAlgorithmProgress();
  renderProfile();
}

async function loadAccountLearningProgress() {
  if (!currentUser) return;
  const localSnapshot = {
    cppCompleted: readProgress(),
    algorithmCompleted: readAlgorithmProgress(),
    activityDays: readLearningDays()
  };
  try {
    let result = await authRequest('/api/learning/progress');
    if (!result.imported) {
      result = await authRequest('/api/learning/import', {
        method: 'POST',
        body: JSON.stringify(localSnapshot)
      });
    }
    applyLearningProgress(result);
    if (getRoute() === 'cpp') {
      const lesson = lessons.find(item => item.id === currentCppLesson);
      if (lesson?.dataset.lesson) syncLearningVisit('cpp', lesson.dataset.lesson);
    } else if (getRoute() === 'algorithms' && currentAlgorithmLesson) {
      syncLearningVisit('algorithm', currentAlgorithmLesson);
    }
  } catch (error) {
    console.error(error);
  }
}

async function syncLearningVisit(type, contentId) {
  if (!currentUser) return;
  const visitKey = `${type}:${contentId}`;
  if (lastSyncedVisit === visitKey) return;
  lastSyncedVisit = visitKey;
  try {
    await authRequest('/api/learning/visit', {
      method: 'POST',
      body: JSON.stringify({ type, contentId })
    });
    serverLastContent = { type, id: contentId, at: new Date().toISOString() };
    updateHomeLearning();
  } catch (error) {
    lastSyncedVisit = '';
    console.error(error);
  }
}

function renderAuthState(user, hydroBinding = null) {
  const accountChanged = currentUser?.id !== user?.id;
  currentUser = user;
  if (accountChanged) window.dispatchEvent(new Event('algospark:account-change'));
  if (accountChanged) {
    localStorage.removeItem(practiceStorageKey);
    currentPracticeScore = 0;
    currentPracticeCompletedCount = 0;
    hydroState.problems = hydroState.problems.map(problem => ({ ...problem, accepted: false }));
    updatePracticeProgress();
    hydroAccountRefreshPromise = null;
    hydroBindingExpiresAt = 0;
    syncHydroAccount(null);
    adminProgressRequest++;
    adminProgressReady = false;
    clearTimeout(adminProgressSearchTimer);
    adminProgressRows.replaceChildren();
    adminProgressExport.disabled = true;
    adminProgressStatus.textContent = '正在加载统计…';
  }
  if (user && hydroBinding) syncHydroAccount(hydroBinding.account);
  const trigger = document.querySelector('.auth-trigger');
  const adminLink = document.getElementById('admin-nav-link');
  const resourcePublishButton = document.getElementById('resource-publish-button');
  adminLink.hidden = !user?.isAdmin;
  resourcePublishButton.hidden = !user?.isAdmin;
  if (getRoute() === 'resources') loadResources();
  if (user) {
    trigger.classList.add('logged-in');
    trigger.replaceChildren();
    const avatar = document.createElement('span');
    avatar.className = 'header-avatar-mini';
    avatar.textContent = avatarInitial(user.nickname);
    applyAvatarTheme(avatar, user.avatarTheme);
    applyAvatarFrame(avatar, user.avatarFrame);
    const copy = document.createElement('span');
    copy.className = 'header-user-copy';
    const name = document.createElement('b');
    name.textContent = user.nickname;
    const arrow = document.createElement('span');
    arrow.className = 'header-profile-arrow';
    arrow.textContent = '›';
    copy.append(name, arrow);
    trigger.append(avatar, copy);
    trigger.setAttribute('aria-label', `当前用户 ${user.nickname}，点击进入个人主页`);
    renderProfile();
    loadServerPracticeProgress();
    loadAccountLearningProgress();
    loadHydroProblems();
    loadNotifications();
    if (location.hash === '#admin') renderRoute(false);
  } else {
    trigger.classList.remove('logged-in');
    trigger.innerHTML = '登录 / 注册 <svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>';
    trigger.setAttribute('aria-label', '登录或注册');
    currentPracticeScore = 0;
    currentPracticeCompletedCount = 0;
    currentPracticeTotalCount = 0;
    currentOjHeatmap = { days: [], totalAccepted: 0, activeDays: 0, longestStreak: 0, weekAccepted: 0 };
    currentProfileCollection = { achievements: [], avatarThemes: [], frames: [], decors: [] };
    document.getElementById('profile-page').dataset.profileDecor = 'none';
    document.getElementById('achievement-inbox-button').hidden = true;
    closeFeatureModal(document.getElementById('achievement-inbox-modal'));
    closeFeatureModal(document.getElementById('public-profile-modal'));
    closeFeatureModal(resourcePublishModal);
    closeFeatureModal(resourceManageModal);
    serverLearningDays = null;
    serverLastContent = null;
    lastSyncedVisit = '';
    localStorage.removeItem(storageKey);
    localStorage.removeItem(algorithmStorageKey);
    localStorage.removeItem(practiceStorageKey);
    updateProgress();
    updateAlgorithmProgress();
    updatePracticeProgress();
    loadHydroProblems();
    if (location.hash === '#admin') renderRoute(false);
  }
}

function readLearningDays() {
  if (currentUser && Array.isArray(serverLearningDays)) return serverLearningDays;
  try {
    const value = JSON.parse(localStorage.getItem(activityStorageKey));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function recordLearningDay() {
  if (currentUser && Array.isArray(serverLearningDays)) return serverLearningDays;
  const today = localDateKey();
  const days = [...new Set([...readLearningDays(), today])].sort();
  localStorage.setItem(activityStorageKey, JSON.stringify(days.slice(-365)));
  return days;
}

function calculateLearningStreak(days) {
  const daySet = new Set(days);
  const cursor = new Date();
  let streak = 0;
  while (daySet.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderOjHeatmap() {
  const grid = document.getElementById('profile-heatmap-grid');
  const scroll = document.getElementById('profile-heatmap-scroll');
  if (!grid || !scroll) return;
  const heatmap = currentOjHeatmap || {};
  const activeDays = Array.isArray(heatmap.days) ? heatmap.days : [];
  const dayMap = new Map(activeDays.map(day => [day.date, day]));
  const todayKey = /^\d{4}-\d{2}-\d{2}$/.test(heatmap.today || '') ? heatmap.today : localDateKey();
  const today = new Date(`${todayKey}T00:00:00Z`);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + (6 - ((today.getUTCDay() + 6) % 7)));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 370);
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Shanghai' });
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 371; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const future = dateKey > todayKey;
    const activity = dayMap.get(dateKey);
    const count = Number(activity?.count || 0);
    const points = Number(activity?.points || 0);
    const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
    const cell = document.createElement('span');
    cell.className = `profile-heatmap-cell${future ? ' future' : ''}`;
    cell.dataset.level = String(level);
    cell.setAttribute('role', 'gridcell');
    if (!future) {
      const label = count
        ? `${dateFormatter.format(date)}，首次 AC ${count} 题，获得 ${points} 积分`
        : `${dateFormatter.format(date)}，没有首次 AC`;
      cell.title = label;
      cell.setAttribute('aria-label', label);
    }
    fragment.append(cell);
  }

  const firstRender = scroll.dataset.rendered !== 'true';
  const previousScroll = scroll.scrollLeft;
  grid.replaceChildren(fragment);
  scroll.dataset.rendered = 'true';
  requestAnimationFrame(() => {
    scroll.scrollLeft = firstRender ? scroll.scrollWidth : Math.min(previousScroll, scroll.scrollWidth - scroll.clientWidth);
  });
  document.getElementById('profile-oj-ac-count').textContent = heatmap.totalAccepted || 0;
  document.getElementById('profile-oj-active-days').textContent = heatmap.activeDays || 0;
  document.getElementById('profile-oj-longest-streak').textContent = heatmap.longestStreak || 0;
  document.getElementById('profile-oj-week-count').textContent = heatmap.weekAccepted || 0;
  document.getElementById('profile-heatmap-caption').textContent = heatmap.totalAccepted
    ? `近一年共有 ${heatmap.activeDays || 0} 个 AC 日，继续保持。`
    : '在协会 OJ 首次 AC 后，这里会点亮你的刷题记录。';
}

function renderProfileCollection() {
  const grid = document.getElementById('profile-achievement-grid');
  if (!grid || !currentUser) return;
  const achievements = Array.isArray(currentProfileCollection.achievements) ? currentProfileCollection.achievements : [];
  grid.replaceChildren();
  if (!achievements.length) {
    const loading = document.createElement('p');
    loading.className = 'profile-collection-loading';
    loading.textContent = '正在读取协会 OJ 成就…';
    grid.append(loading);
  } else {
    achievements.forEach(achievement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.collectionChoice = 'achievement';
      button.dataset.collectionValue = achievement.id;
      button.dataset.achievementTone = achievement.tone || 'violet';
      button.dataset.tier = achievement.tier || 'rare';
      button.className = 'achievement-item';
      button.classList.toggle('locked', !achievement.unlocked);
      button.classList.toggle('selected', currentUser.achievementBadgeId === achievement.id);
      button.setAttribute('aria-pressed', String(currentUser.achievementBadgeId === achievement.id));
      button.setAttribute('aria-disabled', String(!achievement.unlocked));
      const icon = document.createElement('span');
      icon.className = 'achievement-icon';
      icon.dataset.tone = achievement.tone || 'violet';
      icon.textContent = achievement.icon;
      const copy = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = achievement.name;
      const description = document.createElement('small');
      description.textContent = achievement.description;
      copy.append(name, description);
      const progress = document.createElement('em');
      progress.textContent = achievement.unlocked ? (currentUser.achievementBadgeId === achievement.id ? '展示中' : '已获得') : `${achievement.progress}/${achievement.target}`;
      button.append(icon, copy, progress);
      grid.append(button);
    });
  }

  const equipped = achievements.find(item => item.id === currentUser.achievementBadgeId && item.unlocked);
  const equippedBadge = document.getElementById('profile-equipped-badge');
  equippedBadge.textContent = equipped ? `${equipped.icon} ${equipped.name}` : 'AlgoSpark 学习者';
  equippedBadge.classList.toggle('has-achievement', Boolean(equipped));
  const avatarAchievement = document.getElementById('profile-avatar-achievement');
  avatarAchievement.hidden = !equipped;
  avatarAchievement.textContent = equipped?.icon || '';
  avatarAchievement.dataset.tone = equipped?.tone || 'violet';
  avatarAchievement.dataset.tier = equipped?.tier || 'rare';
  avatarAchievement.title = equipped ? `展示徽章：${equipped.name}` : '';
  const clearBadgeButton = document.querySelector('[data-collection-choice="achievement"][data-collection-value=""]');
  clearBadgeButton?.classList.toggle('selected', !equipped);

  const frameCollection = new Map((currentProfileCollection.frames || []).map(item => [item.id, item]));
  document.querySelectorAll('[data-collection-choice="frame"]').forEach(button => {
    const id = button.dataset.collectionValue;
    const item = frameCollection.get(id);
    const requiredScore = Number(item?.requiredScore ?? button.dataset.requiredScore ?? 0);
    const unlocked = item?.unlocked ?? currentPracticeScore >= requiredScore;
    const selected = normalizeAvatarFrame(currentUser.avatarFrame) === id;
    button.classList.toggle('locked', !unlocked);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-disabled', String(!unlocked));
    const preview = button.querySelector('.collection-avatar-preview');
    if (preview) {
      preview.textContent = avatarInitial(currentUser.nickname);
      applyAvatarTheme(preview, currentUser.avatarTheme);
      applyAvatarFrame(preview, id);
    }
    const label = button.querySelector('small');
    if (label) label.textContent = unlocked
      ? (selected ? '使用中' : '已解锁')
      : item?.requiredBadges ? `🔒 ${item.currentBadges}/${item.requiredBadges} 枚徽章` : `🔒 ${requiredScore} 分`;
  });

  const decorCollection = new Map((currentProfileCollection.decors || []).map(item => [item.id, item]));
  document.querySelectorAll('[data-collection-choice="decor"]').forEach(button => {
    const id = button.dataset.collectionValue;
    const item = decorCollection.get(id);
    const requiredScore = Number(item?.requiredScore ?? button.dataset.requiredScore ?? 0);
    const unlocked = item?.unlocked ?? currentPracticeScore >= requiredScore;
    const selected = normalizeProfileDecor(currentUser.profileDecor) === id;
    button.classList.toggle('locked', !unlocked);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-disabled', String(!unlocked));
    const label = button.querySelector('small');
    if (label) label.textContent = unlocked
      ? (selected ? '使用中' : '已解锁')
      : item?.requiredBadges ? `🔒 ${item.currentBadges}/${item.requiredBadges} 枚徽章` : `🔒 ${requiredScore} 分`;
  });
}

function renderProfile() {
  if (!currentUser) return;
  const cppCompleted = readProgress().filter(id => trackedLessons.some(lesson => lesson.dataset.lesson === id));
  const algorithmCompleted = readAlgorithmProgress().filter(id => trackedAlgorithmLessons.some(lesson => lesson.id === id));
  const totalItems = trackedLessons.length + trackedAlgorithmLessons.length + currentPracticeTotalCount;
  const totalCompleted = cppCompleted.length + algorithmCompleted.length + currentPracticeCompletedCount;
  const overallPercent = totalItems ? Math.round(totalCompleted / totalItems * 100) : 0;
  const learningDays = recordLearningDay();
  const streak = calculateLearningStreak(learningDays);
  const nextLesson = trackedLessons.find(lesson => !cppCompleted.includes(lesson.dataset.lesson));
  const nextLessonIndex = nextLesson ? trackedLessons.indexOf(nextLesson) : -1;
  const nextTitle = nextLesson?.querySelector('h2')?.textContent?.trim();
  const nextTarget = nextLesson ? `#${nextLesson.id}` : '#algorithms';
  let continueTarget = nextTarget;
  if (serverLastContent?.type === 'cpp') {
    const lastLesson = lessons.find(lesson => lesson.dataset.lesson === serverLastContent.id);
    if (lastLesson) continueTarget = `#${lastLesson.id}`;
  } else if (serverLastContent?.type === 'algorithm' && trackedAlgorithmLessons.some(lesson => lesson.id === serverLastContent.id)) {
    continueTarget = `#${serverLastContent.id}`;
  }

  document.getElementById('profile-greeting-name').textContent = currentUser.nickname;
  document.getElementById('profile-card-nickname').textContent = currentUser.nickname;
  document.getElementById('profile-card-email').textContent = currentUser.email;
  const profileAvatar = document.getElementById('profile-avatar');
  profileAvatar.textContent = avatarInitial(currentUser.nickname);
  applyAvatarTheme(profileAvatar, currentUser.avatarTheme);
  applyAvatarFrame(profileAvatar, currentUser.avatarFrame);
  document.getElementById('profile-page').dataset.profileDecor = normalizeProfileDecor(currentUser.profileDecor);
  const avatarThemeCollection = new Map((currentProfileCollection.avatarThemes || []).map(item => [item.id, item]));
  document.querySelectorAll('[data-avatar-choice]').forEach(button => {
    const item = avatarThemeCollection.get(button.dataset.avatarChoice);
    const requiredScore = Number(item?.requiredScore ?? button.dataset.requiredScore ?? 0);
    const unlocked = item?.unlocked ?? currentPracticeScore >= requiredScore;
    const selected = button.dataset.avatarChoice === normalizeAvatarTheme(currentUser.avatarTheme);
    button.classList.toggle('locked', !unlocked);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-disabled', String(!unlocked));
    const preview = button.querySelector('.avatar-choice-preview');
    if (preview) {
      preview.textContent = avatarInitial(currentUser.nickname);
      applyAvatarTheme(preview, button.dataset.avatarChoice);
    }
    const unlockLabel = button.querySelector('small');
    if (unlockLabel) unlockLabel.textContent = unlocked
      ? (selected ? '使用中' : '已解锁')
      : item?.requiredBadges ? `🔒 ${item.currentBadges}/${item.requiredBadges} 枚徽章` : `🔒 ${requiredScore} 分`;
  });
  document.getElementById('profile-real-name').textContent = currentUser.realName;
  document.getElementById('profile-school').textContent = currentUser.school;
  document.getElementById('profile-created-at').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(currentUser.createdAt));
  document.getElementById('profile-overall-percent').textContent = `${overallPercent}%`;
  document.getElementById('profile-progress-ring').style.setProperty('--profile-progress', `${overallPercent * 3.6}deg`);
  document.getElementById('profile-cpp-count').textContent = cppCompleted.length;
  document.getElementById('profile-cpp-total').textContent = `/ ${trackedLessons.length} 章`;
  document.getElementById('profile-cpp-bar').style.width = `${trackedLessons.length ? cppCompleted.length / trackedLessons.length * 100 : 0}%`;
  document.getElementById('profile-problem-count').textContent = currentPracticeCompletedCount;
  document.getElementById('profile-problem-total').textContent = `/ ${currentPracticeTotalCount} 题`;
  document.getElementById('profile-problem-bar').style.width = `${currentPracticeTotalCount ? currentPracticeCompletedCount / currentPracticeTotalCount * 100 : 0}%`;
  document.getElementById('profile-streak-count').textContent = streak;
  document.getElementById('profile-score-count').textContent = currentPracticeScore;
  renderOjHeatmap();
  renderProfileCollection();
  document.getElementById('profile-today').textContent = `${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())} · 连续学习 ${streak} 天`;
  document.getElementById('profile-progress-summary').textContent = `C++ ${cppCompleted.length} 章 · 算法 ${algorithmCompleted.length} 节 · 练习 ${currentPracticeCompletedCount} 题`;
  document.getElementById('profile-current-stage').textContent = cppCompleted.length >= trackedLessons.length ? '基础算法学习' : 'C++ 基础入门';
  document.getElementById('profile-next-number').textContent = nextLesson ? String(nextLessonIndex + 1).padStart(2, '0') : '✓';
  document.getElementById('profile-next-title').textContent = nextTitle || '进入基础算法阶段';
  document.getElementById('profile-next-description').textContent = nextLesson ? '继续完成 C++ 语法章节，为后续算法学习打牢基础。' : 'C++ 基础已经完成，下一步开始建立算法知识体系。';
  document.getElementById('profile-next-link').href = nextTarget;
  document.getElementById('profile-continue-link').href = continueTarget;
}

function setFormStatus(element, message = '', type = 'success') {
  element.textContent = message;
  element.classList.toggle('show', Boolean(message));
  element.classList.toggle('error', type === 'error');
}

function setAuthStatus(message = '', type = 'success') {
  setFormStatus(authAudience === 'association' ? associationStatus : localStatus, message, type);
}

function setAuthAudience(audience) {
  authAudience = audience === 'external' ? 'external' : 'association';
  authAudienceTabs.forEach(tab => {
    const active = tab.dataset.authAudience === authAudience;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  authPanels.forEach(panel => {
    const active = panel.dataset.authPanel === authAudience;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  setTimeout(() => (authAudience === 'association' ? associationAccountInput : localEmailInput).focus(), 50);
}

function setAssociationMethod(method) {
  associationMethod = method === 'code' ? 'code' : 'password';
  const usingCode = associationMethod === 'code';
  associationMethodTabs.forEach(tab => {
    const active = tab.dataset.associationMethod === associationMethod;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  associationForm.classList.toggle('code-mode', usingCode);
  document.getElementById('association-account-label').textContent = usingCode ? '协会官网绑定邮箱' : '协会账号 / 邮箱 / 学号';
  document.getElementById('association-credential-label').textContent = usingCode ? '邮箱验证码' : '协会官网密码';
  associationAccountInput.type = usingCode ? 'email' : 'text';
  associationAccountInput.placeholder = usingCode ? '输入协会官网绑定邮箱' : '输入协会官网账号、邮箱或学号';
  associationAccountInput.autocomplete = usingCode ? 'email' : 'username';
  associationCredentialInput.type = usingCode ? 'text' : 'password';
  associationCredentialInput.placeholder = usingCode ? '输入 6 位验证码' : '输入协会官网密码';
  associationCredentialInput.autocomplete = usingCode ? 'one-time-code' : 'current-password';
  associationCredentialInput.inputMode = usingCode ? 'numeric' : '';
  if (usingCode) {
    associationCredentialInput.maxLength = 6;
    associationCredentialInput.pattern = '[0-9]{6}';
  } else {
    associationCredentialInput.removeAttribute('maxlength');
    associationCredentialInput.removeAttribute('pattern');
  }
  associationCredentialInput.value = '';
  setFormStatus(associationStatus);
}

function setLocalMode(mode) {
  localMode = mode === 'register' ? 'register' : 'login';
  const registering = localMode === 'register';
  localModeTabs.forEach(tab => {
    const active = tab.dataset.localMode === localMode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  localForm.classList.toggle('register-mode', registering);
  ['nickname', 'realName', 'school', 'verificationCode', 'confirmPassword'].forEach(name => {
    localForm.elements[name].required = registering;
  });
  localForm.elements.password.required = true;
  localForm.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  localForm.elements.password.placeholder = registering ? '至少 8 个字符' : '输入密码';
  document.querySelector('.local-password-label').textContent = registering ? '设置密码' : '密码';
  document.querySelector('.local-auth-hint').textContent = registering ? '注册验证码 10 分钟内有效' : '首次使用请先注册';
  localForm.elements.confirmPassword.setCustomValidity('');
  localSubmit.textContent = registering ? '注册 AlgoSpark 账号' : '邮箱密码登录';
  setFormStatus(localStatus);
  if (registering) renderLocalTurnstile();
}

function openAuth(mode = 'login') {
  if (mode === 'register') {
    setAuthAudience('external');
    setLocalMode('register');
  }
  authModal.classList.add('open');
  authModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('auth-open');
  setTimeout(() => (authAudience === 'association' ? associationAccountInput : localEmailInput).focus(), 100);
}

function closeAuth() {
  authModal.classList.remove('open');
  authModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-open');
  setFormStatus(associationStatus);
  setFormStatus(localStatus);
}

document.querySelector('.auth-trigger').addEventListener('click', async () => {
  if (!currentUser) return openAuth('login');
  location.hash = 'profile';
});

async function logoutCurrentUser() {
  try {
    await authRequest('/api/auth/logout', { method: 'POST', body: '{}' });
    renderAuthState(null);
    location.hash = 'home';
  } catch (error) {
    alert(error.message);
  }
}

document.querySelector('.profile-logout-button').addEventListener('click', logoutCurrentUser);
document.querySelector('.avatar-picker-options').addEventListener('click', async event => {
  const button = event.target.closest('[data-avatar-choice]');
  if (!button || !currentUser) return;
  const status = document.getElementById('avatar-picker-status');
  const option = (currentProfileCollection.avatarThemes || []).find(item => item.id === button.dataset.avatarChoice);
  if (option && !option.unlocked) {
    status.classList.remove('success');
    status.classList.add('error');
    status.textContent = option.requiredBadges
      ? `再获得 ${Math.max(option.requiredBadges - option.currentBadges, 0)} 枚徽章即可解锁这个背景。`
      : `还差 ${Math.max(option.requiredScore - currentPracticeScore, 0)} 分解锁「${button.querySelector('b')?.textContent || '该背景'}」。`;
    return;
  }
  const avatarTheme = normalizeAvatarTheme(button.dataset.avatarChoice);
  if (avatarTheme === normalizeAvatarTheme(currentUser.avatarTheme)) {
    status.classList.remove('error');
    status.classList.add('success');
    status.textContent = '当前正在使用这个背景。';
    return;
  }
  const buttons = [...document.querySelectorAll('[data-avatar-choice]')];
  buttons.forEach(item => { item.disabled = true; });
  status.classList.remove('error', 'success');
  status.textContent = '正在保存…';
  try {
    const result = await authRequest('/api/profile/avatar', {
      method: 'POST', body: JSON.stringify({ avatarTheme })
    });
    currentUser = result.user;
    renderProfile();
    const headerAvatar = document.querySelector('.header-avatar-mini');
    applyAvatarTheme(headerAvatar, currentUser.avatarTheme);
    applyAvatarFrame(headerAvatar, currentUser.avatarFrame);
    status.classList.add('success');
    status.textContent = result.message;
  } catch (error) {
    status.classList.add('error');
    status.textContent = error.message;
  } finally {
    buttons.forEach(item => { item.disabled = false; });
  }
});
document.querySelector('.profile-collection-card').addEventListener('click', async event => {
  const button = event.target.closest('[data-collection-choice]');
  if (!button || !currentUser) return;
  const type = button.dataset.collectionChoice;
  const value = button.dataset.collectionValue || '';
  const status = document.getElementById('profile-collection-status');
  const selectedValues = {
    achievement: currentUser.achievementBadgeId || '',
    frame: normalizeAvatarFrame(currentUser.avatarFrame),
    decor: normalizeProfileDecor(currentUser.profileDecor)
  };
  if (selectedValues[type] === value) {
    status.className = 'profile-collection-status success';
    status.textContent = '当前正在使用这项装扮。';
    return;
  }

  if (type === 'achievement' && value) {
    const achievement = (currentProfileCollection.achievements || []).find(item => item.id === value);
    if (!achievement?.unlocked) {
      status.className = 'profile-collection-status error';
      status.textContent = achievement ? `还差 ${Math.max(achievement.target - achievement.progress, 0)} 个进度达成「${achievement.name}」。` : '这个成就尚未达成。';
      return;
    }
  } else if (type === 'frame' || type === 'decor') {
    const collection = type === 'frame' ? currentProfileCollection.frames : currentProfileCollection.decors;
    const option = (collection || []).find(item => item.id === value);
    if (option && !option.unlocked) {
      status.className = 'profile-collection-status error';
      status.textContent = option.requiredBadges
        ? `再获得 ${Math.max(option.requiredBadges - option.currentBadges, 0)} 枚徽章即可解锁这项装扮。`
        : `还差 ${Math.max(option.requiredScore - currentPracticeScore, 0)} 分解锁这项装扮。`;
      return;
    }
  }

  const buttons = [...document.querySelectorAll('.profile-collection-card [data-collection-choice]')];
  buttons.forEach(item => { item.disabled = true; });
  status.className = 'profile-collection-status';
  status.textContent = '正在保存…';
  try {
    const result = await authRequest('/api/profile/collection', {
      method: 'POST', body: JSON.stringify({ type, value })
    });
    currentUser = result.user;
    currentProfileCollection = result.collection || currentProfileCollection;
    renderProfile();
    const headerAvatar = document.querySelector('.header-avatar-mini');
    applyAvatarTheme(headerAvatar, currentUser.avatarTheme);
    applyAvatarFrame(headerAvatar, currentUser.avatarFrame);
    status.className = 'profile-collection-status success';
    status.textContent = result.message;
  } catch (error) {
    status.className = 'profile-collection-status error';
    status.textContent = error.message;
  } finally {
    buttons.forEach(item => { item.disabled = false; });
  }
});
document.querySelectorAll('[data-auth-close]').forEach(element => element.addEventListener('click', closeAuth));
authAudienceTabs.forEach(tab => tab.addEventListener('click', () => setAuthAudience(tab.dataset.authAudience)));
associationMethodTabs.forEach(tab => tab.addEventListener('click', () => setAssociationMethod(tab.dataset.associationMethod)));
localModeTabs.forEach(tab => tab.addEventListener('click', () => setLocalMode(tab.dataset.localMode)));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && authModal.classList.contains('open')) closeAuth();
  if (event.key === 'Escape') document.querySelectorAll('.feature-modal.open').forEach(closeFeatureModal);
});

[associationForm, localForm].forEach(form => form.addEventListener('input', event => {
  event.target.classList.remove('invalid');
  if (event.target === localForm.elements.confirmPassword || event.target === localForm.elements.password) {
    localForm.elements.confirmPassword.setCustomValidity('');
  }
  setFormStatus(form === associationForm ? associationStatus : localStatus);
}));

function startVerificationCountdown(button, seconds) {
  const previous = verificationCountdowns.get(button);
  if (previous) clearInterval(previous);
  let remaining = seconds;
  button.disabled = true;
  button.textContent = `${remaining} 秒后重发`;
  const interval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(interval);
      verificationCountdowns.delete(button);
      button.disabled = false;
      button.textContent = '重新获取';
      return;
    }
    button.textContent = `${remaining} 秒后重发`;
  }, 1000);
  verificationCountdowns.set(button, interval);
}

associationSendCodeButton.addEventListener('click', async () => {
  if (!associationAccountInput.checkValidity()) {
    associationAccountInput.classList.add('invalid');
    associationAccountInput.reportValidity();
    return setFormStatus(associationStatus, '请先输入协会官网绑定的有效邮箱。', 'error');
  }
  associationSendCodeButton.disabled = true;
  associationSendCodeButton.textContent = '发送中…';
  try {
    const result = await authRequest('/api/auth/association/send-code', {
      method: 'POST', body: JSON.stringify({ email: associationAccountInput.value })
    });
    setFormStatus(associationStatus, result.message);
    startVerificationCountdown(associationSendCodeButton, result.retryAfter || 60);
    associationCredentialInput.focus();
  } catch (error) {
    associationSendCodeButton.disabled = false;
    associationSendCodeButton.textContent = '重新获取';
    setFormStatus(associationStatus, error.message, 'error');
  }
});

associationForm.addEventListener('submit', async event => {
  event.preventDefault();
  [...associationForm.elements].forEach(element => element.classList?.remove('invalid'));
  if (!associationForm.checkValidity()) {
    [...associationForm.elements].filter(element => !element.checkValidity?.()).forEach(element => element.classList.add('invalid'));
    associationForm.reportValidity();
    return setFormStatus(associationStatus, associationMethod === 'code' ? '请输入绑定邮箱和 6 位验证码。' : '请输入协会官网账号和密码。', 'error');
  }
  associationSubmit.disabled = true;
  associationSubmit.textContent = '正在验证协会账号…';
  try {
    const result = await authRequest('/api/auth/association/login', {
      method: 'POST',
      body: JSON.stringify({
        loginType: associationMethod,
        account: associationAccountInput.value,
        credential: associationCredentialInput.value,
        remember: associationForm.elements.remember.checked
      })
    });
    renderAuthState(result.user, result.hydroBinding);
    setFormStatus(associationStatus, result.message);
    associationForm.reset();
    location.hash = 'profile';
    setTimeout(closeAuth, 700);
  } catch (error) {
    setFormStatus(associationStatus, error.message, 'error');
  } finally {
    associationSubmit.disabled = false;
    associationSubmit.textContent = '登录 AlgoSpark';
  }
});

localSendCodeButton.addEventListener('click', async () => {
  if (!localEmailInput.checkValidity()) {
    localEmailInput.classList.add('invalid');
    localEmailInput.reportValidity();
    return setFormStatus(localStatus, '请先输入有效的邮箱地址。', 'error');
  }
  localSendCodeButton.disabled = true;
  localSendCodeButton.textContent = '发送中…';
  const turnstileToken = localTurnstileWidgetId !== null && window.turnstile
    ? window.turnstile.getResponse(localTurnstileWidgetId)
    : '';
  if (localTurnstileSiteKey && !turnstileToken) {
    localSendCodeButton.disabled = false;
    localSendCodeButton.textContent = '获取验证码';
    return setFormStatus(localStatus, '请先完成人机验证。', 'error');
  }
  try {
    const result = await authRequest('/api/auth/send-verification-code', {
      method: 'POST', body: JSON.stringify({ email: localEmailInput.value, turnstileToken })
    });
    setFormStatus(localStatus, result.message);
    startVerificationCountdown(localSendCodeButton, result.retryAfter || 60);
    localVerificationInput.focus();
  } catch (error) {
    localSendCodeButton.disabled = false;
    localSendCodeButton.textContent = '重新获取';
    setFormStatus(localStatus, error.message, 'error');
  } finally {
    resetLocalTurnstile();
  }
});

localForm.addEventListener('submit', async event => {
  event.preventDefault();
  [...localForm.elements].forEach(element => element.classList?.remove('invalid'));
  if (!localForm.checkValidity()) {
    [...localForm.elements].filter(element => !element.checkValidity?.()).forEach(element => element.classList.add('invalid'));
    localForm.reportValidity();
    return setFormStatus(localStatus, localMode === 'register' ? '请完整填写注册资料，密码至少 8 个字符。' : '请输入邮箱和密码。', 'error');
  }
  const password = localForm.elements.password;
  const confirmPassword = localForm.elements.confirmPassword;
  if (localMode === 'register' && password.value !== confirmPassword.value) {
    confirmPassword.setCustomValidity('两次输入的密码不一致');
    confirmPassword.classList.add('invalid');
    confirmPassword.reportValidity();
    return setFormStatus(localStatus, '两次输入的密码不一致，请重新确认。', 'error');
  }
  const registering = localMode === 'register';
  localSubmit.disabled = true;
  localSubmit.textContent = registering ? '注册中…' : '登录中…';
  const payload = {
    email: localEmailInput.value,
    password: password.value,
    remember: localForm.elements.remember.checked
  };
  if (registering) Object.assign(payload, {
    verificationCode: localVerificationInput.value,
    nickname: localForm.elements.nickname.value,
    realName: localForm.elements.realName.value,
    school: localForm.elements.school.value
  });
  try {
    const result = await authRequest(registering ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST', body: JSON.stringify(payload)
    });
    renderAuthState(result.user, result.hydroBinding);
    setFormStatus(localStatus, result.message);
    localForm.reset();
    location.hash = 'profile';
    setTimeout(closeAuth, 700);
  } catch (error) {
    setFormStatus(localStatus, error.message, 'error');
  } finally {
    localSubmit.disabled = false;
    localSubmit.textContent = registering ? '注册 AlgoSpark 账号' : '邮箱密码登录';
  }
});

setAssociationMethod('password');
setLocalMode('login');
setAuthAudience('association');
initializeLocalTurnstile();

authRequest('/api/auth/me')
  .then(result => renderAuthState(result.user, result.hydroBinding))
  .catch(() => {
    renderAuthState(null);
    if (getRoute() === 'profile') {
      location.hash = 'home';
      openAuth('login');
      setAuthStatus('登录后即可查看个人主页。');
    }
  });

window.addEventListener('hashchange', () => {
  const route = getRoute();
  if (route === 'admin') {
    renderAdminAccessState();
    if (currentUser?.isAdmin) loadAdminDashboard();
    return;
  }
  if (route !== 'profile') return;
  if (currentUser) renderProfile(); else {
    location.hash = 'home';
    openAuth('login');
    setAuthStatus('登录后即可查看个人主页。');
  }
});
