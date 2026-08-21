import type { AgentContext, AgentName } from './contracts';
import { buildSelectiveRoutePlan } from './selective-routing';

export function routeAgents(context: AgentContext): AgentName[] {
  return buildSelectiveRoutePlan(context).agents;
}
