export function newsCurationReasons({ title, summary = '', category = '', source = '' }) {
  const text = `${title} ${summary} ${category} ${source}`;
  const reasons = [];
  let score = 0;

  if (/コラム|囲碁ライター|칼럼|column/i.test(text)) {
    score += 55;
    reasons.push('column_source');
  }
  if (/媒体报道|メディア|media/i.test(text)) {
    score += 30;
    reasons.push('media_report');
  }
  if (/专访|專訪|访谈|訪談|対談|인터뷰|interview|评论|評論|評|観る碁|探訪|观察|觀察|分析|해설|review|analysis/i.test(text)) {
    score += 24;
    reasons.push('analysis_or_interview');
  }
  if (/柯洁|丁浩|辜梓豪|申真谞|一力遼|一力辽|井山|芝野|藤沢|藤泽|上野|国家队|世界戦|世界赛|女流|女子/i.test(text)) {
    score += 12;
    reasons.push('notable_players_or_events');
  }
  if (/文化|歴史|史|棋士|프로기사|棋手|物語|故事|人物|未来|미래|普及/i.test(text)) {
    score += 8;
    reasons.push('feature_context');
  }
  if (/竞赛规程|競賽規程|规程|規程|报名|報名|通知|公示|名单|名單|赛果|賽果|成绩|成績|日程|補足|补充/i.test(text)) {
    score -= 28;
    reasons.push('routine_notice_penalty');
  }

  return { score, reasons };
}

export function applyNewsCuration(item, baseScore = 0) {
  const result = newsCurationReasons({
    title: item.title,
    summary: item.summary,
    category: item.category,
    source: item.source,
  });

  return {
    ...item,
    curation_score: baseScore + result.score,
    curation_reason: [...new Set([...(item.curation_reason ?? []), ...result.reasons])],
  };
}

export function sortNewsItems(items) {
  return [...items].sort((left, right) => {
    const leftScore = left.curation_score ?? 0;
    const rightScore = right.curation_score ?? 0;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return String(right.date).localeCompare(String(left.date));
  });
}

export function fallbackNewsItems(previousSnapshot, { region, contentTypes = [], limit = 5, reason }) {
  const previousNews = Array.isArray(previousSnapshot?.news) ? previousSnapshot.news : [];
  return previousNews
    .filter((item) => item.region === region)
    .filter((item) => !contentTypes.length || contentTypes.includes(item.content_type))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      curation_score: (item.curation_score ?? 0) - 4,
      curation_reason: [...new Set([...(item.curation_reason ?? []), reason])],
    }));
}
