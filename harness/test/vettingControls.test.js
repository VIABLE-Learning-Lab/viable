import test from 'node:test';
import assert from 'node:assert/strict';
import { agentVettingControls, vettingControlErrors, vettingModelOptions } from '../src/utils/vettingControls.js';

test('VETTING explicit completion budgets take precedence and legacy defaults stay unchanged', () => {
  const defaults = { maxTokens: 2048, reasoningEffort: 'low', temperature: 0.7 };
  assert.deepEqual(vettingModelOptions({}, defaults), { ...defaults, maxCompletionTokens: undefined, topP: undefined });
  const config = agentVettingControls({ model: 'gpt-oss-120b', max_tokens: 20, max_completion_tokens: 1536, reasoning_effort: 'high', verification_model: 'gpt-oss-120b', verification_max_tokens: 10, verification_max_completion_tokens: 4096, verification_reasoning_effort: 'medium', require_closing_question: false });
  assert.deepEqual(vettingControlErrors(config), []);
  assert.deepEqual(vettingModelOptions(config.chatModel, defaults), { maxTokens: undefined, maxCompletionTokens: 1536, reasoningEffort: 'high', temperature: 0.7, topP: undefined });
  assert.equal(vettingModelOptions(config.verificationModel).maxCompletionTokens, 4096);
  assert.equal(vettingModelOptions({ reasoning_effort: 'low' }).reasoningEffort, 'low');
  for (const value of [null, true, '2048', 0, -1, 1.2, Infinity]) assert.match(vettingControlErrors({ verificationModel: { maxCompletionTokens: value } }).join(' '), /positive integer/);
});
