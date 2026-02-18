#!/usr/bin/env node

/**
 * Analyze event response performance from a JSON export.
 *
 * Input JSON format:
 * [
 *   {
 *     "id": "pollId",
 *     "eventType": "meal|general|holiday|...",
 *     "eventTitle": "...",
 *     "dates": ["2026-01-01T12:00:00.000Z"],
 *     "votes": [
 *       {
 *         "name": "Alex",
 *         "votes": { "2026-01-01T12:00:00.000Z": "yes|maybe|no" }
 *       }
 *     ]
 *   }
 * ]
 *
 * Usage:
 *   node scripts/analyze-event-responses.js --input tmp/polls-with-votes.json
 */

const fs = require('fs');

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
};

const inputPath = getArg('--input');
if (!inputPath) {
  console.error('Missing --input path to JSON export.');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const polls = JSON.parse(raw);

const toEventType = (p) => (p.eventType || 'general').toLowerCase();

const dedupeVotes = (votes = []) => {
  const map = new Map();

  for (const vote of votes) {
    const key = (vote.email || vote.name || vote.displayName || vote.id || '').toString().trim().toLowerCase();
    const ts = new Date(vote.updatedAt || vote.createdAt || 0).getTime() || 0;
    if (!key) {
      map.set(`anon-${Math.random().toString(36).slice(2)}`, vote);
      continue;
    }
    const prev = map.get(key);
    const prevTs = prev ? new Date(prev.updatedAt || prev.createdAt || 0).getTime() || 0 : -1;
    if (!prev || ts >= prevTs) map.set(key, vote);
  }

  return Array.from(map.values());
};

const getVoteBreakdown = (votes, dates = []) => {
  let yes = 0;
  let maybe = 0;
  let no = 0;
  let answeredSlots = 0;

  for (const vote of votes) {
    const ballot = vote.votes || {};
    const keys = dates.length ? dates : Object.keys(ballot);
    for (const key of keys) {
      const value = ballot[key];
      if (!value) continue;
      answeredSlots += 1;
      if (value === 'yes') yes += 1;
      else if (value === 'maybe') maybe += 1;
      else if (value === 'no') no += 1;
    }
  }

  const weightedScore = yes * 2 + maybe;
  const weightedAvg = answeredSlots ? weightedScore / answeredSlots : 0;
  return { yes, maybe, no, answeredSlots, weightedAvg };
};

const byType = new Map();
let totalVotesCast = 0;
let totalPolls = 0;

for (const poll of polls) {
  totalPolls += 1;
  const type = toEventType(poll);
  const uniqueVotes = dedupeVotes(Array.isArray(poll.votes) ? poll.votes : []);
  const breakdown = getVoteBreakdown(uniqueVotes, Array.isArray(poll.dates) ? poll.dates : []);

  totalVotesCast += uniqueVotes.length;

  if (!byType.has(type)) {
    byType.set(type, {
      eventType: type,
      polls: 0,
      respondents: 0,
      yes: 0,
      maybe: 0,
      no: 0,
      answeredSlots: 0,
      weightedAvgSum: 0,
      maxRespondents: 0,
      pollIds: [],
    });
  }

  const agg = byType.get(type);
  agg.polls += 1;
  agg.respondents += uniqueVotes.length;
  agg.yes += breakdown.yes;
  agg.maybe += breakdown.maybe;
  agg.no += breakdown.no;
  agg.answeredSlots += breakdown.answeredSlots;
  agg.weightedAvgSum += breakdown.weightedAvg;
  agg.maxRespondents = Math.max(agg.maxRespondents, uniqueVotes.length);
  agg.pollIds.push({ id: poll.id, title: poll.eventTitle || '', respondents: uniqueVotes.length });
}

const rows = Array.from(byType.values())
  .map((row) => {
    const avgRespondents = row.polls ? row.respondents / row.polls : 0;
    const yesRate = row.answeredSlots ? row.yes / row.answeredSlots : 0;
    const maybeRate = row.answeredSlots ? row.maybe / row.answeredSlots : 0;
    const noRate = row.answeredSlots ? row.no / row.answeredSlots : 0;
    return {
      eventType: row.eventType,
      polls: row.polls,
      respondents: row.respondents,
      avgRespondents: Number(avgRespondents.toFixed(2)),
      yesRate: Number((yesRate * 100).toFixed(1)),
      maybeRate: Number((maybeRate * 100).toFixed(1)),
      noRate: Number((noRate * 100).toFixed(1)),
      avgWeightedSlotScore: Number((row.weightedAvgSum / row.polls).toFixed(3)),
      maxRespondents: row.maxRespondents,
      topPoll: row.pollIds.sort((a, b) => b.respondents - a.respondents)[0] || null,
    };
  })
  .sort((a, b) => b.avgRespondents - a.avgRespondents);

const output = {
  generatedAt: new Date().toISOString(),
  totalPolls,
  totalRespondents: totalVotesCast,
  avgRespondentsPerPoll: totalPolls ? Number((totalVotesCast / totalPolls).toFixed(2)) : 0,
  eventTypeStats: rows,
  highlights: {
    mostRespondedEventType: rows[0] || null,
    highestYesRateEventType: [...rows].sort((a, b) => b.yesRate - a.yesRate)[0] || null,
    highestMaybeRateEventType: [...rows].sort((a, b) => b.maybeRate - a.maybeRate)[0] || null,
  },
};

console.log(JSON.stringify(output, null, 2));
