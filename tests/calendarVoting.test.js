const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('components/PollVotingForm.js', 'utf8');
function form(eventType = 'general') {
  const state = { votes: {}, meals: {}, unavailable: {} };
  const ctx = vm.createContext({ eventType, isSubmitting: false, poll: {},
    isUnavailableEventDate: date => date === 'past',
    handleGenericVoteChange: (date, value) => { state.votes[date] = value; },
    enabledMealsForDate: () => ['lunch', 'dinner'],
    setUnavailableDates: fn => { state.unavailable = fn(state.unavailable); },
    setMealPreferences: fn => { state.meals = fn(state.meals); },
  });
  const start = source.indexOf('  const setCalendarDate =');
  const end = source.indexOf('\n  const calendar =', start);
  vm.runInContext(source.slice(start, end) + '\nglobalThis.change = setCalendarDate;', ctx);
  return { state, ctx };
}
test('calendar updates the same votes used by the existing form and rejects passed dates', () => {
  const { state, ctx } = form();
  ctx.change('future', 'yes'); assert.equal(state.votes.future, 'yes');
  ctx.change('future', 'maybe'); assert.equal(state.votes.future, 'maybe');
  ctx.change('future', 'no'); assert.equal(state.votes.future, 'no');
  ctx.change('past', 'yes'); assert.equal(state.votes.past, undefined);
  ctx.isSubmitting = true; ctx.change('future', 'yes'); assert.equal(state.votes.future, 'no');
});
test('meal calendar changes update individual meal answers and unavailable flag together', () => {
  const { state, ctx } = form('meal');
  for (const value of ['yes', 'maybe', 'no', 'yes']) {
    ctx.change('future', value);
    assert.equal(state.meals.future.lunch, value);
    assert.equal(state.meals.future.dinner, value);
    assert.equal(state.unavailable.future, value === 'no');
  }
});
