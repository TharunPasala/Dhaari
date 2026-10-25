'use strict';
// Skill extraction and career recommendation over a small skill-occupation graph.
// Deterministic keyword matching: transparent and testable. An LLM can replace extractSkills later
// without changing the graph or the recommendation logic.

function loadGraph(graph) {
  const skillById = new Map(graph.skills.map(s => [s.id, s]));
  const patterns = graph.skills.map(s => ({
    id: s.id,
    re: new RegExp('\\b(' + s.keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i')
  }));
  return { graph, skillById, patterns };
}

// Free text (a voice transcript, or a list of skills/interests) -> skill ids.
function extractSkills(g, text) {
  const t = String(text || '');
  const found = [];
  for (const p of g.patterns) if (p.re.test(t)) found.push(p.id);
  // Also accept exact labels, e.g. a skill already saved as "Bookkeeping".
  for (const s of g.graph.skills) if (t.toLowerCase().includes(s.label.toLowerCase()) && !found.includes(s.id)) found.push(s.id);
  return found;
}

function recommend(g, profile, limit = 5) {
  const text = [...(profile.skills || []), ...(profile.interests || [])].join(', ');
  const have = new Set(extractSkills(g, text));
  return g.graph.occupations
    .map(o => {
      const matched = o.skills.filter(id => have.has(id));
      return { o, matched, score: matched.length / o.skills.length + matched.length * 0.1 };
    })
    .filter(x => x.matched.length > 0)
    .sort((a, b) => b.score - a.score || a.o.code.localeCompare(b.o.code))
    .slice(0, limit)
    .map(({ o, matched }) => ({
      code: o.code,
      title: o.title,
      matchedSkills: matched.map(id => g.skillById.get(id).label),
      missingSkills: o.skills.filter(id => !have.has(id)).map(id => g.skillById.get(id).label),
      nextSteps: o.nextSteps,
      reason: `Uses your ${matched.map(id => g.skillById.get(id).label.toLowerCase()).join(' and ')}`
    }));
}

module.exports = { loadGraph, extractSkills, recommend };
