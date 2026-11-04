// Step manifests: one plain-data description per node type (docs/step-manifests.md). The portal's
// step panel, the step library, the AI builder's notes, graph-schema and the kit all read these.
import input from './input.js';
import output from './output.js';
import ask from './ask.js';
import llm from './llm.js';
import agent from './agent.js';
import router from './router.js';
import image from './image.js';
import speech from './speech.js';
import transcribe from './transcribe.js';
import knowledge from './knowledge.js';
import memory from './memory.js';
import state from './state.js';
import condition from './condition.js';
import loop from './loop.js';
import each from './each.js';
import parallel from './parallel.js';
import http from './http.js';
import component from './component.js';
import transform from './transform.js';
import vetting from './vetting.js';
import guardrail from './guardrail.js';
import subagent from './subagent.js';
import note from './note.js';

export const STEP_MANIFESTS = Object.freeze([
  input, output, ask, llm, agent, router, image, speech, transcribe, knowledge, memory, state,
  condition, loop, each, parallel, http, component, transform, vetting, guardrail, subagent, note
]);

const BY_TYPE = new Map(STEP_MANIFESTS.map((manifest) => [manifest.type, manifest]));

export function stepManifest(type) {
  return BY_TYPE.get(type) || null;
}

export const STEP_CATEGORIES = Object.freeze(['start', 'ai', 'safety', 'logic', 'knowledge', 'tools', 'annotate']);
export const SETTING_LEVELS = Object.freeze(['setup', 'option', 'recovery', 'advanced']);
export const SETTING_WIDGETS = Object.freeze(['text', 'textarea', 'prompt', 'json', 'expr', 'number', 'boolean', 'select', 'model', 'knowledge_bases', 'agents', 'list', 'routes', 'assignments', 'checks', 'fields', 'voice']);
export const STEP_PARTS = Object.freeze(['@pictures', '@outputs', '@cases', '@loop', '@outcomes', '@routes', '@paths']);
export const SENTENCE_PHRASES = Object.freeze(['@outputs', '@routes', '@paths', '@cases', '@tools', '@checks', '@assignments', '@values', '@exits', '@agent', '@component', '@sends']);
export const CONDITION_FORMS = Object.freeze(['set', 'unset', 'present', 'absent', 'is', 'has', 'not', 'all', 'any']);

// A config value by dot path ("params.temperature").
export function configValue(config, key) {
  let value = config;
  for (const part of String(key).split('.')) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

const isBlank = (value) => value == null || value === '' || (Array.isArray(value) && value.length === 0);

// Whether a manifest condition holds for a step's config. See the table in docs/step-manifests.md.
export function matchesWhen(when, config = {}) {
  if (when == null) return true;
  if (when.all) return when.all.every((part) => matchesWhen(part, config));
  if (when.any) return when.any.some((part) => matchesWhen(part, config));
  if (when.not) return !matchesWhen(when.not, config);
  if (when.set) return !isBlank(configValue(config, when.set));
  if (when.unset) return isBlank(configValue(config, when.unset));
  if (when.present) return configValue(config, when.present) != null;
  if (when.absent) return configValue(config, when.absent) == null;
  if (when.is) {
    return Object.entries(when.is).every(([key, expected]) => {
      const value = configValue(config, key);
      return (Array.isArray(expected) ? expected : [expected]).some((option) => (option === null ? isBlank(value) : value === option));
    });
  }
  if (when.has) {
    return Object.entries(when.has).every(([key, expected]) => {
      const value = configValue(config, key);
      return Array.isArray(value) && (Array.isArray(expected) ? expected : [expected]).some((option) => value.includes(option));
    });
  }
  return false;
}

// What an unset setting means for this config: its first matching conditional default, else its default.
export function settingDefault(setting, config = {}) {
  for (const option of setting.defaults || []) if (matchesWhen(option.when, config)) return option.value;
  return setting.default;
}

// The step types for graph-schema: the manifests as JSON.
export function describeSteps() {
  return STEP_MANIFESTS.map((manifest) => JSON.parse(JSON.stringify(manifest)));
}
