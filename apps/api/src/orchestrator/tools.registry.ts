import { ToolDef } from './orchestrator.types';

/**
 * Declarative Tools Registry. The read tools are implemented today; the rest
 * are declared for the roadmap (Action/Automation/Research modes) and reported
 * as disabled. Nothing here executes writes yet.
 */
export const TOOLS: ToolDef[] = [
  { name: 'memory.search', description: 'Busca en la memoria semántica del usuario.', requiredPlan: 'free', requiresConfirmation: false, costLevel: 'low', riskLevel: 'read', enabled: true },
  { name: 'documents.search', description: 'Busca en documentos importados.', requiredPlan: 'pro', requiresConfirmation: false, costLevel: 'low', riskLevel: 'read', enabled: true },
  { name: 'obsidian.search', description: 'Busca en el vault de Obsidian.', requiredPlan: 'pro', requiresConfirmation: false, costLevel: 'low', riskLevel: 'read', enabled: true },
  { name: 'web.search', description: 'Búsqueda web.', requiredPlan: 'pro', requiresConfirmation: false, costLevel: 'medium', riskLevel: 'external', enabled: false },
  { name: 'gmail.read', description: 'Lee correos.', requiredPlan: 'pro', requiresConfirmation: true, costLevel: 'low', riskLevel: 'read', enabled: false },
  { name: 'calendar.read', description: 'Lee el calendario.', requiredPlan: 'pro', requiresConfirmation: true, costLevel: 'low', riskLevel: 'read', enabled: false },
  { name: 'drive.search', description: 'Busca en Google Drive.', requiredPlan: 'pro', requiresConfirmation: true, costLevel: 'low', riskLevel: 'read', enabled: false },
  { name: 'github.search', description: 'Busca en repositorios.', requiredPlan: 'pro', requiresConfirmation: false, costLevel: 'low', riskLevel: 'read', enabled: false },
  { name: 'n8n.trigger', description: 'Dispara un workflow de n8n.', requiredPlan: 'pro', requiresConfirmation: true, costLevel: 'low', riskLevel: 'write', enabled: false },
  { name: 'browser.open', description: 'Abre/controla un navegador.', requiredPlan: 'pro', requiresConfirmation: true, costLevel: 'medium', riskLevel: 'external', enabled: false },
];

export function toolsForPlan(plan: 'free' | 'pro'): ToolDef[] {
  return TOOLS.filter((t) => plan === 'pro' || t.requiredPlan === 'free');
}
