/**
 * What a package's server gets from Node that a Worker gets from its platform: fetches that refuse
 * private addresses (publicFetch.js), and component steps that may start a program only when
 * VIABLE_ENGINE_ALLOW_COMPONENTS names it. A scaffold on Node passes these to createApp.
 */
import { documentComponents } from '../components/call.js';
import { publicFetch } from './publicFetch.js';

/** { outward, services }: outward for learnerRoutes' fetch, services for createApp's. */
export function nodeServices(vars = {}) {
  const outward = publicFetch();
  const allowComponents = String(vars.VIABLE_ENGINE_ALLOW_COMPONENTS || '').split(/[\s,]+/).filter(Boolean);
  return { outward, services: { httpFetch: outward, callComponent: documentComponents({ allowComponents }) } };
}
